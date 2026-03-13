import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import { DashboardPanel } from './dashboardPanel';
import { daysUntil, formatDateMDYY, getUrgencyLevel, effectiveDate } from '../utils/dateUtils';
import { getNonce } from '../utils/nonce';
import { getVirtualItemKind, stripVirtualPrefix, VirtualItemKind } from '../utils/virtualItems';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'inc0ming.statusView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private readonly _store: DataStore;
    private _disposables: vscode.Disposable[] = [];

    constructor(extensionUri: vscode.Uri, store: DataStore) {
        this._extensionUri = extensionUri;
        this._store = store;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Handle messages from sidebar webview
        webviewView.webview.onDidReceiveMessage(
            (msg) => this._handleMessage(msg),
            null,
            this._disposables,
        );

        // Push data on changes
        const changeListener = this._store.onDidChange(() => this._sendData());
        this._disposables.push(changeListener);

        // Re-send data and auto-open dashboard when sidebar becomes visible;
        // close dashboard when navigating away from Inc0ming
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._sendData();
                vscode.commands.executeCommand('inc0ming.openDashboard');
            } else {
                DashboardPanel.currentPanel?.dispose();
            }
        }, null, this._disposables);

        webviewView.onDidDispose(() => {
            this._view = undefined;
            while (this._disposables.length) {
                const d = this._disposables.pop();
                if (d) { d.dispose(); }
            }
        });

        // Initial data push + auto-open dashboard
        this._sendData();
        vscode.commands.executeCommand('inc0ming.openDashboard');
    }

    public refresh(): void {
        this._sendData();
    }

    private _sendData(): void {
        if (!this._view) { return; }

        const config = vscode.workspace.getConfiguration('inc0ming.notifications');
        const warningDays = config.get<number>('warningDays', 7);
        const urgentDays = config.get<number>('urgentDays', 1);

        // Build todo status
        const sections = this._store.todo.sections.map(s => {
            const total = s.items.length;
            const completed = s.items.filter(i => i.completed).length;
            return {
                name: s.name || '(Default)',
                total,
                completed,
                percent: total > 0 ? Math.round((completed / total) * 100) : 0,
            };
        });

        // Build agenda — radar items (including virtual goal/todo/milestone blips) within warning window
        const augmented = this._store.computeAugmentedRadar();
        const allItems: { effDate: Date; label: string; id: string }[] = [];
        for (const sw of augmented.swimlanes) {
            for (const item of sw.items) {
                const eff = effectiveDate(item);
                if (eff) { allItems.push({ effDate: eff, label: item.label, id: item.id }); }
            }
            for (const sg of sw.subGroups) {
                for (const item of sg.items) {
                    const eff = effectiveDate(item);
                    if (eff) { allItems.push({ effDate: eff, label: item.label, id: item.id }); }
                }
            }
        }
        const agenda = allItems
            .map(item => {
                const days = daysUntil(item.effDate);
                const itemKind: VirtualItemKind = getVirtualItemKind(item.id);
                return {
                    label: item.label,
                    date: formatDateMDYY(item.effDate),
                    days,
                    urgency: getUrgencyLevel(days, warningDays, urgentDays),
                    itemKind,
                    sourceId: stripVirtualPrefix(item.id),
                };
            })
            .filter(item => item.days >= 0 && item.days <= warningDays)
            .sort((a, b) => a.days - b.days);

        // Overall todo stats
        const totalTodos = sections.reduce((sum, s) => sum + s.total, 0);
        const completedTodos = sections.reduce((sum, s) => sum + s.completed, 0);

        // Build goal progress
        const goalSections = this._store.goals.sections.map(s => {
            const items = s.items;
            const total = items.length;
            const completed = items.filter(g => g.completed).length;
            const progressSum = items.reduce((sum, g) => {
                if (g.milestones.length === 0) { return sum + (g.completed ? 100 : 0); }
                return sum + g.milestones.reduce((ms, m) => ms + (m.completed ? m.weight : 0), 0);
            }, 0);
            const avgProgress = total > 0 ? Math.round(progressSum / total) : 0;
            return { name: s.name, total, completed, avgProgress };
        });

        this._view.webview.postMessage({
            type: 'statusUpdate',
            data: {
                sections,
                agenda,
                totalTodos,
                completedTodos,
                totalRadar: allItems.length,
                upcomingCount: agenda.length,
                goalSections,
                pastDue: this._store.computePastDue(),
            },
        });
    }

    private _handleMessage(msg: any): void {
        if (msg.type === 'navigateTo') {
            // Ensure dashboard is open, then forward navigation
            vscode.commands.executeCommand('inc0ming.openDashboard').then(() => {
                setTimeout(() => {
                    DashboardPanel.currentPanel?.navigateTo(msg.sectionKey, msg.itemId, msg.sourceType);
                }, 200);
            });
        }
    }

    private _getHtml(webview: vscode.Webview): string {
        const mediaUri = vscode.Uri.joinPath(this._extensionUri, 'media');
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'sidebar.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'sidebar.js'));
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${cssUri}" rel="stylesheet">
</head>
<body>
    <div id="sidebar-root">
        <div id="status-section">
            <div class="sidebar-section-title">Todo Progress</div>
            <div id="todo-status"></div>
        </div>
        <div id="pastdue-section">
            <div class="sidebar-section-title">Past Due</div>
            <div id="pastdue-status"></div>
        </div>
        <div id="agenda-section">
            <div class="sidebar-section-title">Upcoming</div>
            <div id="agenda-list"></div>
        </div>
        <div id="goals-section">
            <div class="sidebar-section-title">Goal Progress</div>
            <div id="goals-status"></div>
        </div>
    </div>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
}
