import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import {
    RadarData, TodoData,
    SerializedRadarData, WebviewMessage,
} from '../models/types';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _store: DataStore;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, store: DataStore, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return DashboardPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'inc0mingDashboard',
            'Inc0ming',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, store, context);
        return DashboardPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, store: DataStore, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._store = store;
        this._context = context;

        this._panel.webview.html = this._getHtml();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            (msg: WebviewMessage) => this._handleMessage(msg),
            null,
            this._disposables
        );

        // Subscribe to data changes — push updates to webview
        store.onDidChange(() => this._sendAllData(), null, this._disposables);

        // Send initial data
        this._sendAllData();
    }

    private _sendAllData(): void {
        const radarData = this._serializeRadar(this._store.radar);
        this._panel.webview.postMessage({ type: 'radarUpdate', data: radarData });
        this._panel.webview.postMessage({ type: 'quotesUpdate', data: this._store.quotes });

        // Send layout BEFORE todo data so GridManager has correct state when render() calls applyLayout()
        const layout = this._context.workspaceState.get('inc0ming.gridLayout');
        this._panel.webview.postMessage({ type: 'layoutUpdate', layout: layout || {} });
        this._panel.webview.postMessage({ type: 'todoUpdate', data: this._store.todo });

        const radarVisible = this._context.workspaceState.get('inc0ming.radarVisible', true);
        this._panel.webview.postMessage({ type: 'radarVisibleUpdate', visible: radarVisible });

        if (this._store.errors.length > 0) {
            this._panel.webview.postMessage({ type: 'parseErrors', errors: this._store.errors });
        }
    }

    private _serializeRadar(data: RadarData): SerializedRadarData {
        return {
            swimlanes: data.swimlanes.map(s => ({
                ...s,
                items: s.items.map(i => ({ ...i, date: i.date.toISOString() })),
                subGroups: s.subGroups.map(sg => ({
                    ...sg,
                    items: sg.items.map(i => ({ ...i, date: i.date.toISOString() })),
                })),
            })),
        };
    }

    private async _handleMessage(msg: WebviewMessage): Promise<void> {
        let success = true;

        switch (msg.type) {
            case 'saveLayout':
                await this._context.workspaceState.update('inc0ming.gridLayout', msg.layout);
                return; // Don't save store data for layout changes
            case 'saveRadarVisible':
                await this._context.workspaceState.update('inc0ming.radarVisible', msg.visible);
                return;
            case 'toggleTodo':
                success = this._store.toggleTodo(msg.id);
                break;
            case 'editRadarItem':
                success = this._store.editRadarItem(msg.id, msg.label, msg.dateStr);
                if (!success) { vscode.window.showErrorMessage('Invalid date format. Use M/D/YY.'); }
                break;
            case 'editTodoItem':
                success = this._store.editTodo(msg.id, msg.text);
                break;
            case 'addTodo':
                this._store.addTodo(msg.sectionId, msg.text);
                break;
            case 'addRadarItem':
                success = this._store.addRadarItem(msg.parentId, msg.label, msg.dateStr);
                if (!success) { vscode.window.showErrorMessage('Invalid date format or unknown swimlane.'); }
                break;
            case 'addSwimlane':
                this._store.addSwimlane(msg.name);
                break;
            case 'addSubGroup':
                this._store.addSubGroup(msg.swimlaneId, msg.name);
                break;
            case 'deleteRadarItem':
                this._store.deleteRadarItem(msg.id);
                break;
            case 'deleteTodoItem':
                this._store.deleteTodo(msg.id);
                break;
            case 'deleteSwimlane':
                this._store.deleteSwimlane(msg.id);
                break;
            case 'deleteSubGroup':
                this._store.deleteSubGroup(msg.id);
                break;
            case 'renameSwimlane':
                this._store.renameSwimlane(msg.id, msg.name);
                break;
            case 'renameSubGroup':
                this._store.renameSubGroup(msg.id, msg.name);
                break;
            case 'addTodoSection':
                this._store.addTodoSection(msg.name);
                break;
            case 'renameTodoSection':
                this._store.renameTodoSection(msg.id, msg.name);
                break;
            case 'deleteTodoSection':
                this._store.deleteTodoSection(msg.id);
                break;
            case 'moveTodo':
                success = this._store.moveTodo(msg.id, msg.targetSectionId, msg.newIndex);
                break;
            case 'reorderSwimlanes':
                success = this._store.reorderSwimlanes(msg.orderedIds);
                break;
            case 'addQuote':
                this._store.addQuote(msg.text, msg.attribution);
                break;
            case 'editQuote':
                this._store.editQuote(msg.id, msg.text, msg.attribution);
                break;
            case 'deleteQuote':
                this._store.deleteQuote(msg.id);
                break;
            default:
                return; // Unknown message, don't save
        }

        await this._store.save();
    }

    private _getHtml(): string {
        const webview = this._panel.webview;
        const mediaUri = vscode.Uri.joinPath(this._extensionUri, 'media');

        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'dashboard.css'));
        const dashboardJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'dashboard.js'));
        const radarJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'radarRenderer.js'));
        const todoJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'todoRenderer.js'));
        const quoteJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'quoteRenderer.js'));
        const gridJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'gridManager.js'));

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${cssUri}" rel="stylesheet">
    <title>Radar Dashboard</title>
</head>
<body>
    <div class="dashboard-title-row">
        <div class="dashboard-title">( Inc0ming )</div>
        <button id="toggle-radar-btn" class="radar-toggle-btn" title="Toggle scanner">Scanner</button>
    </div>

    <div id="quote-display"></div>

    <div id="radar-container">
        <canvas id="radar-canvas"></canvas>
        <div class="radar-legend">
            <div class="legend-item"><span class="legend-dot urgent"></span> 0\u201330 days</div>
            <div class="legend-item"><span class="legend-dot warning"></span> ~90 days</div>
            <div class="legend-item"><span class="legend-dot normal"></span> ~180 days</div>
            <button id="toggle-past-btn" class="legend-toggle" title="Toggle past items">Show Past</button>
        </div>
        <div id="radar-tooltip" class="tooltip hidden"></div>
        <div id="radar-edit-popover" class="popover hidden">
            <input type="text" id="edit-label" placeholder="Label">
            <input type="date" id="edit-date">
            <div class="popover-buttons">
                <button id="edit-save">Save</button>
                <button id="edit-cancel">Cancel</button>
            </div>
        </div>
    </div>

    <div id="swimlane-details-container">
        <div class="section-header collapsible" id="swimlane-details-header">
            <span class="collapse-chevron open">\u25bc</span> Swim Lane Details
        </div>
        <div id="swimlane-details-body">
            <div id="new-swimlane-row">
                <input type="text" id="new-swimlane-input" placeholder="New swim lane name..">
                <button id="add-swimlane-btn">+ Add Lane</button>
            </div>
            <div id="swimlane-cards" class="swimlane-cards"></div>
        </div>
    </div>

    <div id="todo-grid-header">
        <div class="section-header">TODO</div>
    </div>
    <div id="new-section-row">
        <input type="text" id="new-section-input" placeholder="New section name...">
        <button id="add-section-btn">+ Add Section</button>
    </div>
    <div id="todo-grid"></div>

    <div id="quotes-manage-container">
        <div class="section-header collapsible" id="quotes-header">
            <span class="collapse-chevron closed">\u25bc</span> Inspiration
        </div>
        <div id="quotes-body" class="collapsed">
            <div id="quotes-list"></div>
            <div id="new-quote-row">
                <input type="text" id="new-quote-text" placeholder="Quote text...">
                <input type="text" id="new-quote-attr" placeholder="Attribution (optional)">
                <button id="add-quote-btn">+ Add</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${radarJsUri}"></script>
    <script nonce="${nonce}" src="${todoJsUri}"></script>
    <script nonce="${nonce}" src="${quoteJsUri}"></script>
    <script nonce="${nonce}" src="${gridJsUri}"></script>
    <script nonce="${nonce}" src="${dashboardJsUri}"></script>
</body>
</html>`;
    }

    dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }
}

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
