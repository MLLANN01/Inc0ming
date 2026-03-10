import * as vscode from 'vscode';
import { DataStore } from './services/dataStore';
import { DashboardPanel } from './panels/dashboardPanel';
import { SidebarViewProvider } from './panels/sidebarViewProvider';
import { RadarTreeProvider } from './panels/radarTreeProvider';
import { NotificationManager } from './utils/notifications';
import { RadarSwimlane, RadarSubGroup, RadarItem, TodoItem, TodoSection, QuoteItem, ReminderMeeting } from './models/types';
import { parseDayTags } from './parsers/incomingParser';
import { formatDateMDYY } from './utils/dateUtils';

export function activate(context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { return; }

    const store = new DataStore(workspaceRoot);
    const notifications = new NotificationManager();

    // Sidebar webview — status + agenda
    const sidebarProvider = new SidebarViewProvider(context.extensionUri, store);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider),
    );

    // Swim lane tree view in explorer (with collapse all button)
    const radarTreeProvider = new RadarTreeProvider(store);
    const radarTreeView = vscode.window.createTreeView('inc0ming.radarTree', {
        treeDataProvider: radarTreeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(radarTreeView);

    store.onDidChange(() => {
        notifications.checkItems(store);
    });

    // --- Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('inc0ming.refresh', () => {
            store.load();
        }),

        vscode.commands.registerCommand('inc0ming.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, store, context);
        }),

        vscode.commands.registerCommand('inc0ming.addSwimlane', async () => {
            const name = await vscode.window.showInputBox({ prompt: 'Swim lane name' });
            if (!name) { return; }
            store.addSwimlane(name);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.addSubGroup', async (element?: any) => {
            let swimlaneId: string | undefined;

            if (element) {
                const resolved = resolveTreeElement(store, element);
                if (resolved && resolved.kind === 'swimlane') {
                    swimlaneId = resolved.id;
                }
            }

            if (!swimlaneId) {
                const swimlanes = store.radar.swimlanes;
                if (swimlanes.length === 0) {
                    vscode.window.showWarningMessage('Add a swim lane first.');
                    return;
                }
                const pick = await vscode.window.showQuickPick(
                    swimlanes.map(s => ({ label: s.name, id: s.id })),
                    { placeHolder: 'Select swimlane' }
                );
                if (!pick) { return; }
                swimlaneId = pick.id;
            }

            const name = await vscode.window.showInputBox({ prompt: 'Sub-group name' });
            if (!name) { return; }
            store.addSubGroup(swimlaneId, name);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.addRadarItem', async (element?: any) => {
            let parentId: string | undefined;

            if (element) {
                // Resolve the actual data model element from the tree item
                const resolved = resolveTreeElement(store, element);
                if (resolved && (resolved.kind === 'swimlane' || resolved.kind === 'subgroup')) {
                    parentId = resolved.id;
                }
            }

            if (!parentId) {
                const swimlanes = store.radar.swimlanes;
                if (swimlanes.length === 0) {
                    vscode.window.showWarningMessage('Add a swim lane first.');
                    return;
                }
                const pick = await vscode.window.showQuickPick(
                    swimlanes.map(s => ({ label: s.name, id: s.id })),
                    { placeHolder: 'Select swimlane' }
                );
                if (!pick) { return; }
                parentId = pick.id;
            }

            const label = await vscode.window.showInputBox({ prompt: 'Item label' });
            if (!label) { return; }

            const dateStr = await vscode.window.showInputBox({ prompt: 'Date (M/D/YY)', placeHolder: '3/15/26' });
            if (!dateStr) { return; }

            if (!store.addRadarItem(parentId, label, dateStr)) {
                vscode.window.showErrorMessage('Invalid date format. Use M/D/YY.');
                return;
            }
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.addTodoSection', async () => {
            const name = await vscode.window.showInputBox({ prompt: 'Section name' });
            if (!name) { return; }
            store.addTodoSection(name);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.addTodo', async (element?: any) => {
            let sectionId: string | undefined;

            if (element) {
                const resolved = resolveTreeElement(store, element);
                if (resolved && resolved.kind === 'todoSection') {
                    sectionId = resolved.id;
                }
            }

            if (!sectionId) {
                const sections = store.todo.sections;
                if (sections.length === 0) {
                    vscode.window.showWarningMessage('Add a section first.');
                    return;
                }
                if (sections.length === 1) {
                    sectionId = sections[0].id;
                } else {
                    const pick = await vscode.window.showQuickPick(
                        sections.map(s => ({ label: s.name || '(Default)', id: s.id })),
                        { placeHolder: 'Select section' }
                    );
                    if (!pick) { return; }
                    sectionId = pick.id;
                }
            }

            const text = await vscode.window.showInputBox({ prompt: 'Todo text' });
            if (!text) { return; }
            store.addTodo(sectionId, text);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.editItem', async (treeItem?: any) => {
            if (!treeItem) { return; }
            const element = resolveTreeElement(store, treeItem);
            if (!element) { return; }

            switch (element.kind) {
                case 'radarItem': {
                    const label = await vscode.window.showInputBox({
                        prompt: 'Edit label',
                        value: element.label,
                    });
                    if (label === undefined) { return; }
                    const dateStr = await vscode.window.showInputBox({
                        prompt: 'Edit date (M/D/YY)',
                        value: formatDateMDYY(element.date),
                    });
                    if (dateStr === undefined) { return; }
                    if (!store.editRadarItem(element.id, label, dateStr)) {
                        vscode.window.showErrorMessage('Invalid date format. Use M/D/YY.');
                        return;
                    }
                    await store.save();
                    break;
                }
                case 'swimlane': {
                    const name = await vscode.window.showInputBox({
                        prompt: 'Rename swim lane',
                        value: element.name,
                    });
                    if (name === undefined || name === element.name) { return; }
                    store.renameSwimlane(element.id, name);
                    await store.save();
                    break;
                }
                case 'subgroup': {
                    const name = await vscode.window.showInputBox({
                        prompt: 'Rename sub-group',
                        value: element.name,
                    });
                    if (name === undefined || name === element.name) { return; }
                    store.renameSubGroup(element.id, name);
                    await store.save();
                    break;
                }
                case 'todo': {
                    const text = await vscode.window.showInputBox({
                        prompt: 'Edit todo',
                        value: element.text,
                    });
                    if (text === undefined) { return; }
                    store.editTodo(element.id, text);
                    await store.save();
                    break;
                }
                case 'todoSection': {
                    const name = await vscode.window.showInputBox({
                        prompt: 'Rename section',
                        value: element.name,
                    });
                    if (name === undefined || name === element.name) { return; }
                    store.renameTodoSection(element.id, name);
                    await store.save();
                    break;
                }
            }
        }),

        vscode.commands.registerCommand('inc0ming.deleteItem', async (treeItem?: any) => {
            if (!treeItem) { return; }
            const element = resolveTreeElement(store, treeItem);
            if (!element) { return; }

            const displayName = element.kind === 'radarItem' ? element.label
                : element.kind === 'todo' ? element.text
                : element.kind === 'todoSection' ? (element.name || '(Default)')
                : element.name;

            const confirm = await vscode.window.showWarningMessage(
                `Delete "${displayName}"?`, { modal: true }, 'Delete'
            );
            if (confirm !== 'Delete') { return; }

            switch (element.kind) {
                case 'radarItem': store.deleteRadarItem(element.id); break;
                case 'swimlane': store.deleteSwimlane(element.id); break;
                case 'subgroup': store.deleteSubGroup(element.id); break;
                case 'todo': store.deleteTodo(element.id); break;
                case 'todoSection': store.deleteTodoSection(element.id); break;
            }
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.toggleTodo', async (treeItem?: any) => {
            if (!treeItem) { return; }
            const id = treeItem.id;
            if (id && store.toggleTodo(id)) {
                await store.save();
            }
        }),

        vscode.commands.registerCommand('inc0ming.expandRadarTree', async () => {
            const roots = radarTreeProvider.getRootElements();
            for (const root of roots) {
                await radarTreeView.reveal(root, { expand: 2, select: false, focus: false });
            }
        }),

        vscode.commands.registerCommand('inc0ming.addQuote', async () => {
            const text = await vscode.window.showInputBox({ prompt: 'Quote text' });
            if (!text) { return; }
            const attribution = await vscode.window.showInputBox({ prompt: 'Attribution (optional — leave blank for none)' });
            store.addQuote(text, attribution || undefined);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.editQuote', async (treeItem?: any) => {
            if (!treeItem) { return; }
            const quote = store.findQuote(treeItem.id);
            if (!quote) { return; }

            const text = await vscode.window.showInputBox({
                prompt: 'Edit quote text',
                value: quote.text,
            });
            if (text === undefined) { return; }

            const attribution = await vscode.window.showInputBox({
                prompt: 'Edit attribution (leave blank for none)',
                value: quote.attribution || '',
            });
            if (attribution === undefined) { return; }

            store.editQuote(quote.id, text, attribution || undefined);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.addMeeting', async () => {
            const name = await vscode.window.showInputBox({ prompt: 'Meeting name' });
            if (!name) { return; }
            const daysStr = await vscode.window.showInputBox({
                prompt: 'Days (e.g. Mon, Wed, Fri)',
                placeHolder: 'Mon, Wed, Fri',
            });
            const days = parseDayTags(daysStr || '');
            store.addMeeting(name, days);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.addPoint', async () => {
            const meetings = store.reminders.meetings;
            if (meetings.length === 0) {
                vscode.window.showWarningMessage('Add a meeting first.');
                return;
            }
            let meetingId: string;
            if (meetings.length === 1) {
                meetingId = meetings[0].id;
            } else {
                const pick = await vscode.window.showQuickPick(
                    meetings.map(m => ({
                        label: m.name + (m.days.length ? ' (' + m.days.join(', ') + ')' : ''),
                        id: m.id,
                    })),
                    { placeHolder: 'Select meeting' }
                );
                if (!pick) { return; }
                meetingId = pick.id;
            }

            const text = await vscode.window.showInputBox({ prompt: 'Talking point' });
            if (!text) { return; }
            store.addPoint(meetingId, text);
            await store.save();
        }),

        vscode.commands.registerCommand('inc0ming.deleteQuote', async (treeItem?: any) => {
            if (!treeItem) { return; }
            const quote = store.findQuote(treeItem.id);
            if (!quote) { return; }

            const displayText = quote.text.length > 40
                ? quote.text.slice(0, 40) + '...'
                : quote.text;
            const confirm = await vscode.window.showWarningMessage(
                `Delete quote "${displayText}"?`, { modal: true }, 'Delete'
            );
            if (confirm !== 'Delete') { return; }

            store.deleteQuote(quote.id);
            await store.save();
        }),

        store,
    );

    // Initial load
    store.load();
}

/**
 * Resolve a tree view argument to the actual data model element.
 * VS Code passes the TreeDataProvider element (RadarTreeItem) for context menu commands,
 * so we check for the element's `kind` property first, then fall back to ID-based lookup.
 */
function resolveTreeElement(store: DataStore, treeItem: any): RadarSwimlane | RadarSubGroup | RadarItem | TodoItem | TodoSection | undefined {
    // Handle RadarTreeItem elements (passed by tree view context menus)
    if (treeItem.kind === 'swimlane' && treeItem.swimlane) { return treeItem.swimlane; }
    if (treeItem.kind === 'subgroup' && treeItem.subGroup) { return treeItem.subGroup; }
    if (treeItem.kind === 'radarItem' && treeItem.item) { return treeItem.item; }

    // Fall back to ID-based lookup (for vscode.TreeItem objects)
    const id: string | undefined = treeItem.id;
    if (!id) { return undefined; }

    const sw = store.findSwimlane(id);
    if (sw) { return sw; }

    const sgResult = store.findSubGroup(id);
    if (sgResult) { return sgResult.subGroup; }

    const riResult = store.findRadarItem(id);
    if (riResult) { return riResult.item; }

    const ts = store.findTodoSection(id);
    if (ts) { return ts; }

    const todo = store.findTodo(id);
    if (todo) { return todo; }

    return undefined;
}

export function deactivate() {}
