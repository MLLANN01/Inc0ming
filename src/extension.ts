import * as vscode from 'vscode';
import { DataStore } from './services/dataStore';
import { DashboardPanel } from './panels/dashboardPanel';
import { SidebarViewProvider } from './panels/sidebarViewProvider';
import { NotificationManager } from './utils/notifications';
import { RadarSwimlane, RadarSubGroup, RadarItem, TodoItem, TodoSection, DayOfWeek, RadarRecurrence } from './models/types';
import { formatDateMDYY } from './utils/dateUtils';
import { parseDayTags } from './parsers/incomingParser';

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

            const typePick = await vscode.window.showQuickPick(
                [
                    { label: 'One-time date', value: 'onetime' },
                    { label: 'Weekly (days)', value: 'weekly' },
                    { label: 'Yearly (month/day)', value: 'yearly' },
                ],
                { placeHolder: 'Recurrence type' }
            );
            if (!typePick) { return; }

            let recurrence: RadarRecurrence | undefined;
            let dateStr: string | undefined;

            if (typePick.value === 'onetime') {
                dateStr = await vscode.window.showInputBox({ prompt: 'Date (M/D/YY)', placeHolder: '3/15/26' });
                if (!dateStr) { return; }
            } else if (typePick.value === 'weekly') {
                const daysStr = await vscode.window.showInputBox({
                    prompt: 'Days (e.g. Mon, Wed, Fri)',
                    placeHolder: 'Mon, Wed, Fri',
                });
                if (!daysStr) { return; }
                const days = parseDayTags(daysStr);
                if (days.length === 0) {
                    vscode.window.showErrorMessage('Invalid days. Use Mon, Tue, Wed, Thu, Fri, Sat, Sun.');
                    return;
                }
                recurrence = { type: 'weekly', days };
            } else {
                const mdStr = await vscode.window.showInputBox({
                    prompt: 'Month/Day (e.g. 4/15)',
                    placeHolder: '4/15',
                });
                if (!mdStr) { return; }
                const match = mdStr.match(/^(\d{1,2})\/(\d{1,2})$/);
                if (!match) {
                    vscode.window.showErrorMessage('Invalid format. Use M/D (e.g. 4/15).');
                    return;
                }
                const month = parseInt(match[1], 10);
                const day = parseInt(match[2], 10);
                if (month < 1 || month > 12 || day < 1 || day > 31) {
                    vscode.window.showErrorMessage('Invalid month/day.');
                    return;
                }
                recurrence = { type: 'yearly', month, day };
            }

            if (!store.addRadarItem(parentId, label, dateStr, recurrence)) {
                vscode.window.showErrorMessage('Invalid date format. Use M/D/YY.');
                return;
            }
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

                    if (element.recurrence) {
                        // Recurring items — edit label only (recurrence type stays)
                        if (!store.editRadarItem(element.id, label)) {
                            vscode.window.showErrorMessage('Could not update item.');
                            return;
                        }
                    } else {
                        const dateStr = await vscode.window.showInputBox({
                            prompt: 'Edit date (M/D/YY)',
                            value: element.date ? formatDateMDYY(element.date) : '',
                        });
                        if (dateStr === undefined) { return; }
                        if (!store.editRadarItem(element.id, label, dateStr)) {
                            vscode.window.showErrorMessage('Invalid date format. Use M/D/YY.');
                            return;
                        }
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
