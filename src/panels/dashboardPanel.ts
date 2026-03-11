import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import {
    RadarData, RadarItem, SerializedRadarData, WebviewMessage,
} from '../models/types';
import { parseDayTags } from '../parsers/incomingParser';
import { getNonce } from '../utils/nonce';
import { isVirtual, isVirtualGoal, isVirtualMilestone, isVirtualTodo } from '../utils/virtualItems';

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
        const augmented = this._store.computeAugmentedRadar();
        const radar = this._serializeRadar(augmented);
        const swimlaneNames = augmented.swimlanes.map(s => s.name);
        const layout = this._context.workspaceState.get('inc0ming.gridLayout') || {};
        const radarVisible = this._context.workspaceState.get('inc0ming.radarVisible', true);
        const sectionOrder = this._context.workspaceState.get('inc0ming.sectionOrder');
        const parseErrors = this._store.errors.length > 0 ? this._store.errors : undefined;

        this._panel.webview.postMessage({
            type: 'allData',
            payload: {
                radar,
                swimlaneNames,
                quotes: this._store.quotes,
                reminders: this._store.reminders,
                goals: this._store.goals,
                layout,
                todo: this._store.todo,
                radarVisible,
                sectionOrder,
                parseErrors,
                archive: this._store.computeArchive(),
            },
        });
    }

    private static _itemShape(id: string): 'circle' | 'diamond' | 'flag' | 'star' | undefined {
        if (isVirtualGoal(id)) { return 'diamond'; }
        if (isVirtualMilestone(id)) { return 'flag'; }
        if (isVirtualTodo(id)) { return 'star'; }
        return undefined;
    }

    private _serializeRadar(data: RadarData): SerializedRadarData {
        const serializeItem = (i: RadarItem) => ({
            ...i,
            date: i.date.toISOString(),
            virtual: isVirtual(i.id) ? true : undefined,
            shape: DashboardPanel._itemShape(i.id),
        });
        return {
            swimlanes: data.swimlanes.map(s => ({
                ...s,
                items: s.items.map(serializeItem),
                subGroups: s.subGroups.map(sg => ({
                    ...sg,
                    items: sg.items.map(serializeItem),
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
            case 'saveSectionOrder':
                await this._context.workspaceState.update('inc0ming.sectionOrder', msg.order);
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
            case 'addMeeting':
                this._store.addMeeting(msg.name, parseDayTags(msg.days));
                break;
            case 'renameMeeting': {
                const days = parseDayTags(msg.days);
                this._store.renameMeeting(msg.id, msg.name, days);
                break;
            }
            case 'deleteMeeting':
                this._store.deleteMeeting(msg.id);
                break;
            case 'addPoint':
                this._store.addPoint(msg.meetingId, msg.text);
                break;
            case 'editPoint':
                this._store.editPoint(msg.id, msg.text);
                break;
            case 'deletePoint':
                this._store.deletePoint(msg.id);
                break;
            case 'clearMeeting':
                this._store.clearMeeting(msg.id);
                break;
            case 'editTodoNotes':
                this._store.editTodoNotes(msg.id, msg.notes);
                break;
            case 'addGoalSection':
                this._store.addGoalSection(msg.name);
                break;
            case 'renameGoalSection':
                this._store.renameGoalSection(msg.id, msg.name);
                break;
            case 'deleteGoalSection':
                this._store.deleteGoalSection(msg.id);
                break;
            case 'addGoal':
                this._store.addGoal(msg.sectionId, msg.text);
                break;
            case 'editGoal':
                this._store.editGoal(msg.id, msg.text);
                break;
            case 'deleteGoal':
                this._store.deleteGoal(msg.id);
                break;
            case 'toggleGoal':
                this._store.toggleGoal(msg.id, msg.completionNote);
                break;
            case 'editGoalCompletionNote':
                this._store.editGoalCompletionNote(msg.id, msg.completionNote);
                break;
            case 'addMilestone':
                this._store.addMilestone(msg.goalId, msg.text, msg.weight, msg.dueDate);
                break;
            case 'editMilestone':
                this._store.editMilestone(msg.id, msg.text, msg.weight);
                break;
            case 'deleteMilestone':
                this._store.deleteMilestone(msg.id);
                break;
            case 'toggleMilestone':
                this._store.toggleMilestone(msg.id, msg.completionNote);
                break;
            case 'editGoalDueDate':
                this._store.editGoalDueDate(msg.id, msg.dueDate);
                break;
            case 'editMilestoneDueDate':
                this._store.editMilestoneDueDate(msg.id, msg.dueDate);
                break;
            case 'editTodoDueDate':
                this._store.editTodoDueDate(msg.id, msg.dueDate);
                break;
            case 'editTodoRadarLink':
                this._store.editTodoRadarLink(msg.id, msg.radarLink);
                break;
            case 'editGoalRadarLink':
                this._store.editGoalRadarLink(msg.id, msg.radarLink);
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
        const reminderJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'reminderRenderer.js'));
        const goalsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'goalsRenderer.js'));
        const archiveJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'archiveRenderer.js'));
        const dateUtilsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'dateUtils.js'));
        const editUtilsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'editUtils.js'));

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
        </div>
        <div class="radar-filters">
            <button class="radar-filter active" data-shape="circle" title="Toggle radar items">
                <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="currentColor"/></svg>
                Radar
            </button>
            <button class="radar-filter active" data-shape="diamond" title="Toggle goals">
                <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 11,6 6,11 1,6" fill="currentColor"/></svg>
                Goals
            </button>
            <button class="radar-filter active" data-shape="flag" title="Toggle milestones">
                <svg width="12" height="12" viewBox="0 0 12 12"><line x1="3" y1="2" x2="3" y2="11" stroke="currentColor" stroke-width="1.5"/><polygon points="3,2 10,4.5 3,7" fill="currentColor"/></svg>
                Milestones
            </button>
            <button class="radar-filter active" data-shape="star" title="Toggle TODOs">
                <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 7.5,4.5 11,4.8 8.3,7.2 9.1,11 6,9 2.9,11 3.7,7.2 1,4.8 4.5,4.5" fill="currentColor"/></svg>
                TODOs
            </button>
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

    <div id="new-swimlane-row">
        <input type="text" id="new-swimlane-input" placeholder="New swim lane name..">
        <button id="add-swimlane-btn">+ Add Lane</button>
    </div>

    <div id="sections-container">
        <div id="todo-container" data-section-key="todo">
            <div class="section-header collapsible" id="todo-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron open">\u25bc</span> TODO
            </div>
            <div id="todo-body">
                <div id="new-section-row">
                    <input type="text" id="new-section-input" placeholder="New section name...">
                    <button id="add-section-btn">+ Add Section</button>
                </div>
                <div id="todo-grid"></div>
            </div>
        </div>

        <div id="reminders-container" data-section-key="reminders">
            <div class="section-header collapsible" id="reminders-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron open">\u25bc</span> Reminders
            </div>
            <div id="reminders-body">
                <div id="new-meeting-row">
                    <input type="text" id="new-meeting-name" placeholder="Meeting name...">
                    <input type="text" id="new-meeting-days" placeholder="Days (e.g. Mon, Wed, Fri)">
                    <button id="add-meeting-btn">+ Add Meeting</button>
                </div>
                <div id="reminders-grid"></div>
            </div>
        </div>

        <div id="goals-container" data-section-key="goals">
            <div class="section-header collapsible" id="goals-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron open">\u25bc</span> Goals
            </div>
            <div id="goals-body">
                <div id="new-goal-section-row">
                    <input type="text" id="new-goal-section-input" placeholder="New goal category...">
                    <button id="add-goal-section-btn">+ Add Category</button>
                </div>
                <div id="goals-grid"></div>
            </div>
        </div>

        <div id="quotes-manage-container" data-section-key="quotes">
            <div class="section-header collapsible" id="quotes-header">
                <span class="drag-grip">\u2847</span>
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

        <div id="archive-container" data-section-key="archive">
            <div class="section-header collapsible" id="archive-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Archive <span id="archive-count" class="section-count-badge" style="display:none">0</span>
            </div>
            <div id="archive-body" class="collapsed">
                <div id="archive-list"></div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${dateUtilsJsUri}"></script>
    <script nonce="${nonce}" src="${editUtilsJsUri}"></script>
    <script nonce="${nonce}" src="${radarJsUri}"></script>
    <script nonce="${nonce}" src="${todoJsUri}"></script>
    <script nonce="${nonce}" src="${quoteJsUri}"></script>
    <script nonce="${nonce}" src="${reminderJsUri}"></script>
    <script nonce="${nonce}" src="${goalsJsUri}"></script>
    <script nonce="${nonce}" src="${archiveJsUri}"></script>
    <script nonce="${nonce}" src="${gridJsUri}"></script>
    <script nonce="${nonce}" src="${dashboardJsUri}"></script>
</body>
</html>`;
    }

    public navigateTo(sectionKey: string, itemId?: string, sourceType?: string): void {
        this._panel.reveal();
        this._panel.webview.postMessage({
            type: 'navigateTo',
            sectionKey,
            itemId,
            sourceType,
        });
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
