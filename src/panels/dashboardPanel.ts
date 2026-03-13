import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import {
    RadarData, RadarItem, RadarRecurrence, SerializedRadarData, WebviewMessage, DayOfWeek,
} from '../models/types';
import { getNonce } from '../utils/nonce';
import * as path from 'path';
import { isVirtual, isVirtualGoal, isVirtualMilestone, isVirtualTodo } from '../utils/virtualItems';
import { effectiveDate, isToday } from '../utils/dateUtils';

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
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.file(path.join(path.dirname(store.filePath), 'media')),
                ],
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

        // Redraw radar when panel becomes visible (canvas bitmap may be lost while hidden)
        this._panel.onDidChangeViewState(
            (e) => { if (e.webviewPanel.visible) { this._panel.webview.postMessage({ type: 'panelVisible' }); } },
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
                goals: this._store.goals,
                layout,
                todo: this._store.todo,
                radarVisible,
                sectionOrder,
                parseErrors,
                archive: this._store.computeArchive(),
                bookmarks: this._store.bookmarks,
                contacts: this._store.contacts,
                notes: this._store.notes,
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
        const serializeItem = (i: RadarItem) => {
            const eff = effectiveDate(i);
            return {
                id: i.id,
                date: eff ? eff.toISOString() : undefined,
                label: i.label,
                virtual: isVirtual(i.id) ? true : undefined,
                shape: DashboardPanel._itemShape(i.id),
                recurrence: i.recurrence,
                subItems: i.subItems.length > 0 ? i.subItems.map(s => ({ id: s.id, text: s.text })) : undefined,
                isToday: eff ? isToday(eff) : undefined,
            };
        };
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
            case 'addRadarItem': {
                if (msg.days || msg.monthDay) {
                    let recurrence: RadarRecurrence | undefined;
                    if (msg.days) {
                        const validDays: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                        const parts = msg.days.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean);
                        const days: DayOfWeek[] = [];
                        for (const part of parts) {
                            const match = validDays.find(d => d.toLowerCase() === part.toLowerCase());
                            if (match) { days.push(match); }
                        }
                        if (days.length > 0) { recurrence = { type: 'weekly', days }; }
                    } else if (msg.monthDay) {
                        const m = msg.monthDay.match(/^(\d{1,2})\/(\d{1,2})$/);
                        if (m) { recurrence = { type: 'yearly', month: parseInt(m[1], 10), day: parseInt(m[2], 10) }; }
                    }
                    if (recurrence) {
                        success = this._store.addRadarItem(msg.parentId, msg.label, undefined, recurrence);
                    } else {
                        success = false;
                    }
                } else {
                    success = this._store.addRadarItem(msg.parentId, msg.label, msg.dateStr);
                }
                if (!success) { vscode.window.showErrorMessage('Invalid date format or unknown swimlane.'); }
                break;
            }
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
            case 'addSubItem':
                this._store.addSubItem(msg.radarItemId, msg.text);
                break;
            case 'editSubItem':
                this._store.editSubItem(msg.id, msg.text);
                break;
            case 'deleteSubItem':
                this._store.deleteSubItem(msg.id);
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
            case 'addBookmarkSection':
                this._store.addBookmarkSection(msg.name);
                break;
            case 'renameBookmarkSection':
                this._store.renameBookmarkSection(msg.id, msg.name);
                break;
            case 'deleteBookmarkSection':
                this._store.deleteBookmarkSection(msg.id);
                break;
            case 'addBookmark':
                this._store.addBookmark(msg.sectionId, msg.title, msg.url);
                break;
            case 'editBookmark':
                this._store.editBookmark(msg.id, msg.title, msg.url);
                break;
            case 'deleteBookmark':
                this._store.deleteBookmark(msg.id);
                break;
            case 'moveBookmark':
                success = this._store.moveBookmark(msg.id, msg.targetSectionId, msg.newIndex);
                break;

            // --- Contacts ---
            case 'addContactGroup':
                this._store.addContactGroup(msg.name);
                break;
            case 'renameContactGroup':
                this._store.renameContactGroup(msg.id, msg.name);
                break;
            case 'deleteContactGroup':
                this._store.deleteContactGroup(msg.id);
                break;
            case 'addContact':
                this._store.addContact(msg.groupId, msg.name, msg.contactType);
                break;
            case 'editContact':
                this._store.editContact(msg.id, msg.name, msg.contactType, msg.email, msg.phone, msg.notes);
                break;
            case 'deleteContact':
                this._store.deleteContact(msg.id);
                break;

            case 'openBookmark':
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
                return; // Read-only action, don't save
            case 'copyBookmarkUrl':
                vscode.env.clipboard.writeText(msg.url);
                return; // Read-only action, don't save

            // --- Notes ---
            case 'addNotebook':
                this._store.addNotebook(msg.name);
                break;
            case 'renameNotebook':
                this._store.renameNotebook(msg.id, msg.name);
                break;
            case 'deleteNotebook': {
                // Delete all page files and their images before removing the notebook
                const notebook = this._store.findNotebook(msg.id);
                if (notebook) {
                    const fs = require('fs');
                    for (const pg of notebook.pages) {
                        this._deleteNoteImages(pg.slug);
                        try { fs.unlinkSync(this._store.noteFilePath(pg.slug)); } catch { /* ok if missing */ }
                    }
                }
                this._store.deleteNotebook(msg.id);
                break;
            }
            case 'addNotePage': {
                const page = this._store.addNotePage(msg.notebookId, msg.title);
                if (page) {
                    // Create the empty note file
                    this._store.saveNoteContent(page.slug, `# ${page.title}\n`);
                }
                break;
            }
            case 'editNotePageTitle':
                this._store.editNotePageTitle(msg.id, msg.title);
                break;
            case 'deleteNotePage': {
                const result = this._store.findNotePage(msg.id);
                if (result) {
                    this._deleteNoteImages(result.page.slug);
                    const filePath = this._store.noteFilePath(result.page.slug);
                    try { require('fs').unlinkSync(filePath); } catch { /* ok if missing */ }
                }
                this._store.deleteNotePage(msg.id);
                break;
            }
            case 'updateNoteTags':
                this._store.updateNoteTags(msg.id, msg.tags);
                break;
            case 'requestNoteContent': {
                const content = this._store.loadNoteContent(msg.slug);
                // Rewrite relative image paths to webview URIs
                const mediaDir = vscode.Uri.file(
                    require('path').join(require('path').dirname(this._store.filePath), 'media')
                );
                const rewritten = content.replace(
                    /!\[([^\]]*)\]\(\.\.\/media\/([^)]+)\)/g,
                    (_match: string, alt: string, filename: string) => {
                        const uri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, filename));
                        return `![${alt}](${uri})`;
                    }
                );
                this._panel.webview.postMessage({ type: 'noteContent', slug: msg.slug, content: rewritten });
                return; // Read-only, don't save
            }
            case 'saveNoteContent': {
                // Rewrite webview URIs back to relative paths
                const saved = msg.content.replace(
                    /!\[([^\]]*)\]\(vscode-webview:\/\/[^)]*\/([^/)]+)\)/g,
                    (_match: string, alt: string, filename: string) => `![${alt}](../media/${filename})`
                );
                // Delete images that were removed from the content
                const oldContent = this._store.loadNoteContent(msg.slug);
                const imgPattern = /!\[[^\]]*\]\(\.\.\/media\/([^)]+)\)/g;
                const oldImages = new Set<string>();
                let m;
                while ((m = imgPattern.exec(oldContent)) !== null) { oldImages.add(m[1]); }
                const newImages = new Set<string>();
                const imgPattern2 = /!\[[^\]]*\]\(\.\.\/media\/([^)]+)\)/g;
                while ((m = imgPattern2.exec(saved)) !== null) { newImages.add(m[1]); }
                for (const filename of oldImages) {
                    if (!newImages.has(filename)) {
                        this._store.deleteNoteImage(filename);
                    }
                }
                this._store.saveNoteContent(msg.slug, saved);
                // Update the page's updatedAt timestamp
                const pageResult = this._store.findNotePageBySlug(msg.slug);
                if (pageResult) { this._store.touchNotePage(pageResult.page.id); }
                return; // Don't save index — note content lives in separate file.
                        // Timestamp will persist on the next index-level save.
            }
            case 'uploadNoteImage': {
                const imagePath = this._store.saveNoteImage(msg.data, msg.mimeType);
                const imageUri = this._panel.webview.asWebviewUri(vscode.Uri.file(imagePath));
                this._panel.webview.postMessage({
                    type: 'noteImageUploaded',
                    src: imageUri.toString(),
                    noteSlug: msg.noteSlug,
                });
                return; // Don't save index for image uploads
            }

            case 'editRecurringSchedule': {
                let recurrence: RadarRecurrence | undefined;
                if (msg.days) {
                    const validDays: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    const parts = msg.days.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean);
                    const days: DayOfWeek[] = [];
                    for (const part of parts) {
                        const match = validDays.find(d => d.toLowerCase() === part.toLowerCase());
                        if (match) { days.push(match); }
                    }
                    if (days.length > 0) { recurrence = { type: 'weekly', days }; }
                } else if (msg.monthDay) {
                    const m = msg.monthDay.match(/^(\d{1,2})\/(\d{1,2})$/);
                    if (m) { recurrence = { type: 'yearly', month: parseInt(m[1], 10), day: parseInt(m[2], 10) }; }
                }
                if (recurrence) {
                    this._store.editRadarItemRecurrence(msg.id, recurrence);
                }
                break;
            }

            case 'addRecurringItem': {
                // Find or create a "Meetings" swimlane
                let meetingsLane = this._store.radar.swimlanes.find(s => s.name.toLowerCase() === 'meetings');
                if (!meetingsLane) {
                    this._store.addSwimlane('Meetings');
                    meetingsLane = this._store.radar.swimlanes.find(s => s.name.toLowerCase() === 'meetings');
                }
                if (!meetingsLane) { break; }

                let recurrence: RadarRecurrence | undefined;
                if (msg.days) {
                    const validDays: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    const parts = msg.days.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean);
                    const days: DayOfWeek[] = [];
                    for (const part of parts) {
                        const match = validDays.find(d => d.toLowerCase() === part.toLowerCase());
                        if (match) { days.push(match); }
                    }
                    if (days.length > 0) {
                        recurrence = { type: 'weekly', days };
                    }
                } else if (msg.monthDay) {
                    const m = msg.monthDay.match(/^(\d{1,2})\/(\d{1,2})$/);
                    if (m) {
                        recurrence = { type: 'yearly', month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
                    }
                }

                if (recurrence) {
                    this._store.addRadarItem(meetingsLane.id, msg.label, undefined, recurrence);
                }
                break;
            }

            default:
                return; // Unknown message, don't save
        }

        await this._store.save();
    }

    /** Delete all images referenced in a note's content file. */
    private _deleteNoteImages(slug: string): void {
        const content = this._store.loadNoteContent(slug);
        const imgPattern = /!\[[^\]]*\]\(\.\.\/media\/([^)]+)\)/g;
        let m;
        while ((m = imgPattern.exec(content)) !== null) {
            this._store.deleteNoteImage(m[1]);
        }
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
        const goalsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'goalsRenderer.js'));
        const archiveJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'archiveRenderer.js'));
        const bookmarkJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'bookmarkRenderer.js'));
        const contactJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'contactRenderer.js'));
        const noteEditorJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'noteEditor.js'));
        const notesJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'notesRenderer.js'));
        const reminderJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'reminderRenderer.js'));
        const dateUtilsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'dateUtils.js'));
        const editUtilsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'editUtils.js'));

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
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

    <div id="sections-container">
        <div id="radar-manage-container" data-section-key="radar-manage">
            <div class="section-header collapsible" id="radar-manage-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Radar
            </div>
            <div id="radar-manage-body" class="collapsed">
                <div id="radar-manage-swimlane-row">
                    <input type="text" id="new-swimlane-input" placeholder="New swim lane name...">
                    <button id="add-swimlane-btn">+ Add Lane</button>
                </div>
                <div id="radar-manage-add-row">
                    <select id="radar-add-swimlane"></select>
                    <input type="text" id="radar-add-label" placeholder="Item label...">
                    <select id="radar-add-type">
                        <option value="onetime">Date</option>
                        <option value="weekly">Weekly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                    <input type="text" id="radar-add-value" placeholder="M/D/YY">
                    <button id="radar-add-btn">+ Add Item</button>
                </div>
            </div>
        </div>

        <div id="meeting-notes-container" data-section-key="meeting-notes">
            <div class="section-header collapsible" id="meeting-notes-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Meeting Notes
            </div>
            <div id="meeting-notes-body" class="collapsed">
                <div id="new-meeting-row">
                    <input type="text" id="new-meeting-label" placeholder="Meeting name...">
                    <input type="text" id="new-meeting-days" placeholder="Days (Mon, Wed, Fri)">
                    <button id="add-meeting-btn">+ Add</button>
                </div>
                <div id="meeting-notes-grid"></div>
            </div>
        </div>

        <div id="todo-container" data-section-key="todo">
            <div class="section-header collapsible" id="todo-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> TODO
            </div>
            <div id="todo-body" class="collapsed">
                <div id="new-section-row">
                    <input type="text" id="new-section-input" placeholder="New section name...">
                    <button id="add-section-btn">+ Add Section</button>
                </div>
                <div id="todo-grid"></div>
            </div>
        </div>

        <div id="goals-container" data-section-key="goals">
            <div class="section-header collapsible" id="goals-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Goals
            </div>
            <div id="goals-body" class="collapsed">
                <div id="new-goal-section-row">
                    <input type="text" id="new-goal-section-input" placeholder="New goal category...">
                    <button id="add-goal-section-btn">+ Add Category</button>
                </div>
                <div id="goals-grid"></div>
            </div>
        </div>

        <div id="bookmarks-container" data-section-key="bookmarks">
            <div class="section-header collapsible" id="bookmarks-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Bookmarks
            </div>
            <div id="bookmarks-body" class="collapsed">
                <div id="bookmarks-search-row">
                    <input type="text" id="bookmarks-search" placeholder="Search bookmarks...">
                </div>
                <div id="new-bookmark-section-row">
                    <input type="text" id="new-bookmark-section-input" placeholder="New category name...">
                    <button id="add-bookmark-section-btn">+ Add Category</button>
                </div>
                <div id="bookmarks-grid"></div>
            </div>
        </div>

        <div id="notes-container" data-section-key="notes">
            <div class="section-header collapsible" id="notes-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Notes
                <span id="notes-count" class="section-count-badge" style="display:none">0</span>
            </div>
            <div id="notes-body" class="collapsed">
                <div id="new-notebook-row">
                    <input type="text" id="new-notebook-input" placeholder="New notebook name...">
                    <button id="add-notebook-btn">+ Add Notebook</button>
                </div>
                <div id="notes-notebook-tabs"></div>
                <div id="notes-page-list"></div>
                <div id="notes-editor-area" class="hidden">
                    <div id="notes-editor-toolbar">
                        <button data-cmd="back" title="Back to list">\u2190 Back</button>
                        <span class="toolbar-sep"></span>
                        <button data-cmd="bold" title="Bold"><b>B</b></button>
                        <button data-cmd="italic" title="Italic"><i>I</i></button>
                        <button data-cmd="strike" title="Strikethrough"><s>S</s></button>
                        <span class="toolbar-sep"></span>
                        <button data-cmd="h1" title="Heading 1">H1</button>
                        <button data-cmd="h2" title="Heading 2">H2</button>
                        <button data-cmd="h3" title="Heading 3">H3</button>
                        <span class="toolbar-sep"></span>
                        <button data-cmd="bulletList" title="Bullet list">\u2022</button>
                        <button data-cmd="orderedList" title="Ordered list">1.</button>
                        <button data-cmd="taskList" title="Task list">\u2611</button>
                        <span class="toolbar-sep"></span>
                        <button data-cmd="codeBlock" title="Code block">&lt;/&gt;</button>
                        <button data-cmd="blockquote" title="Blockquote">\u201c</button>
                        <button data-cmd="hr" title="Horizontal rule">\u2015</button>
                        <button data-cmd="link" title="Insert link">\u{1F517}</button>
                        <span class="toolbar-sep"></span>
                        <button data-cmd="save" title="Save (Ctrl+S)" class="toolbar-save-btn">\u{1F4BE} Save</button>
                        <button data-cmd="fullscreen" title="Toggle fullscreen (Escape to exit)" class="toolbar-fullscreen-btn">\u26F6</button>
                    </div>
                    <div id="notes-editor-mount"></div>
                    <div id="notes-editor-status"><span id="notes-save-indicator"></span></div>
                </div>
            </div>
        </div>

        <div id="contacts-container" data-section-key="contacts">
            <div class="section-header collapsible" id="contacts-header">
                <span class="drag-grip">\u2847</span>
                <span class="collapse-chevron closed">\u25bc</span> Contacts
            </div>
            <div id="contacts-body" class="collapsed">
                <div id="contacts-search-row">
                    <input type="text" id="contacts-search" placeholder="Search contacts...">
                </div>
                <div id="new-contact-group-row">
                    <input type="text" id="new-contact-group-input" placeholder="New group name...">
                    <button id="add-contact-group-btn">+ Add Group</button>
                </div>
                <div id="contacts-grid"></div>
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
    <script nonce="${nonce}" src="${goalsJsUri}"></script>
    <script nonce="${nonce}" src="${archiveJsUri}"></script>
    <script nonce="${nonce}" src="${bookmarkJsUri}"></script>
    <script nonce="${nonce}" src="${contactJsUri}"></script>
    <script nonce="${nonce}" src="${noteEditorJsUri}"></script>
    <script nonce="${nonce}" src="${notesJsUri}"></script>
    <script nonce="${nonce}" src="${reminderJsUri}"></script>
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
