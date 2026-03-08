import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    RadarData, RadarSwimlane, RadarSubGroup, RadarItem,
    TodoData, TodoItem, TodoSection,
    QuoteData, QuoteItem,
    ParseResult, ParseError, UnparsedLine,
    generateId,
} from '../models/types';
import { parseIncoming } from '../parsers/incomingParser';
import { serializeIncoming } from '../serializers/incomingSerializer';
import { parseDateMDYY } from '../utils/dateUtils';

export class DataStore implements vscode.Disposable {
    private _radar: RadarData = { swimlanes: [] };
    private _todo: TodoData = { sections: [] };
    private _quotes: QuoteData = { items: [] };
    private _errors: ParseError[] = [];
    private _unparsedLines: UnparsedLine[] = [];
    private _filePath: string;
    private _selfWriting = false;
    private _lastWriteTime = 0;
    private _watcher: vscode.FileSystemWatcher;
    private _diagnostics: vscode.DiagnosticCollection;

    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor(workspaceRoot: string) {
        this._filePath = path.join(workspaceRoot, 'incoming.md');
        this._diagnostics = vscode.languages.createDiagnosticCollection('incoming');

        const pattern = new vscode.RelativePattern(workspaceRoot, 'incoming.md');
        this._watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this._watcher.onDidChange(() => this._onFileChange());
        this._watcher.onDidCreate(() => this._onFileChange());
        this._watcher.onDidDelete(() => this._onFileChange());
    }

    // --- Data access ---
    get radar(): RadarData { return this._radar; }
    get todo(): TodoData { return this._todo; }
    get quotes(): QuoteData { return this._quotes; }
    get errors(): ParseError[] { return this._errors; }
    get filePath(): string { return this._filePath; }

    // --- Queries ---
    allRadarItems(): RadarItem[] {
        const items: RadarItem[] = [];
        for (const sw of this._radar.swimlanes) {
            items.push(...sw.items);
            for (const sg of sw.subGroups) {
                items.push(...sg.items);
            }
        }
        return items;
    }

    findSwimlane(id: string): RadarSwimlane | undefined {
        return this._radar.swimlanes.find(s => s.id === id);
    }

    findSubGroup(id: string): { subGroup: RadarSubGroup; swimlane: RadarSwimlane } | undefined {
        for (const sw of this._radar.swimlanes) {
            const sg = sw.subGroups.find(s => s.id === id);
            if (sg) { return { subGroup: sg, swimlane: sw }; }
        }
        return undefined;
    }

    findRadarItem(id: string): { item: RadarItem; parent: RadarSwimlane | RadarSubGroup } | undefined {
        for (const sw of this._radar.swimlanes) {
            const item = sw.items.find(i => i.id === id);
            if (item) { return { item, parent: sw }; }
            for (const sg of sw.subGroups) {
                const sgItem = sg.items.find(i => i.id === id);
                if (sgItem) { return { item: sgItem, parent: sg }; }
            }
        }
        return undefined;
    }

    findTodo(id: string): TodoItem | undefined {
        for (const section of this._todo.sections) {
            const item = section.items.find(i => i.id === id);
            if (item) { return item; }
        }
        return undefined;
    }

    findTodoSection(id: string): TodoSection | undefined {
        return this._todo.sections.find(s => s.id === id);
    }

    // --- Radar mutations ---
    addSwimlane(name: string): RadarSwimlane {
        const sw: RadarSwimlane = {
            kind: 'swimlane',
            id: generateId('sw'),
            name,
            items: [],
            subGroups: [],
        };
        this._radar.swimlanes.push(sw);
        return sw;
    }

    renameSwimlane(id: string, name: string): boolean {
        const sw = this.findSwimlane(id);
        if (!sw) { return false; }
        sw.name = name;
        return true;
    }

    deleteSwimlane(id: string): boolean {
        const idx = this._radar.swimlanes.findIndex(s => s.id === id);
        if (idx < 0) { return false; }
        this._radar.swimlanes.splice(idx, 1);
        return true;
    }

    reorderSwimlanes(orderedIds: string[]): boolean {
        if (orderedIds.length !== this._radar.swimlanes.length) { return false; }
        const reordered: RadarSwimlane[] = [];
        for (const id of orderedIds) {
            const sw = this.findSwimlane(id);
            if (!sw) { return false; }
            reordered.push(sw);
        }
        this._radar.swimlanes = reordered;
        return true;
    }

    setSwimlaneColor(id: string, color: string | undefined): boolean {
        const sw = this.findSwimlane(id);
        if (!sw) { return false; }
        sw.color = color;
        return true;
    }

    addRadarItem(parentId: string, label: string, dateStr: string): boolean {
        const date = parseDateMDYY(dateStr);
        if (!date) { return false; }

        const item: RadarItem = {
            kind: 'radarItem',
            id: generateId('ri'),
            date,
            label,
        };

        // Try swimlane first
        const sw = this.findSwimlane(parentId);
        if (sw) { sw.items.push(item); return true; }

        // Try sub-group
        const sgResult = this.findSubGroup(parentId);
        if (sgResult) { sgResult.subGroup.items.push(item); return true; }

        return false;
    }

    editRadarItem(id: string, label: string, dateStr: string): boolean {
        const date = parseDateMDYY(dateStr);
        if (!date) { return false; }
        const result = this.findRadarItem(id);
        if (!result) { return false; }
        result.item.label = label;
        result.item.date = date;
        return true;
    }

    deleteRadarItem(id: string): boolean {
        for (const sw of this._radar.swimlanes) {
            const idx = sw.items.findIndex(i => i.id === id);
            if (idx >= 0) { sw.items.splice(idx, 1); return true; }
            for (const sg of sw.subGroups) {
                const sIdx = sg.items.findIndex(i => i.id === id);
                if (sIdx >= 0) { sg.items.splice(sIdx, 1); return true; }
            }
        }
        return false;
    }

    addSubGroup(swimlaneId: string, name: string): RadarSubGroup | undefined {
        const sw = this.findSwimlane(swimlaneId);
        if (!sw) { return undefined; }
        const sg: RadarSubGroup = {
            kind: 'subgroup',
            id: generateId('sg'),
            name,
            swimlaneId,
            items: [],
        };
        sw.subGroups.push(sg);
        return sg;
    }

    renameSubGroup(id: string, name: string): boolean {
        const result = this.findSubGroup(id);
        if (!result) { return false; }
        result.subGroup.name = name;
        return true;
    }

    deleteSubGroup(id: string): boolean {
        for (const sw of this._radar.swimlanes) {
            const idx = sw.subGroups.findIndex(s => s.id === id);
            if (idx >= 0) { sw.subGroups.splice(idx, 1); return true; }
        }
        return false;
    }

    // --- Todo section mutations ---
    addTodoSection(name: string): TodoSection {
        const section: TodoSection = {
            kind: 'todoSection',
            id: generateId('ts'),
            name,
            items: [],
        };
        this._todo.sections.push(section);
        return section;
    }

    renameTodoSection(id: string, name: string): boolean {
        const section = this.findTodoSection(id);
        if (!section) { return false; }
        section.name = name;
        return true;
    }

    deleteTodoSection(id: string): boolean {
        const idx = this._todo.sections.findIndex(s => s.id === id);
        if (idx < 0) { return false; }
        this._todo.sections.splice(idx, 1);
        return true;
    }

    // --- Todo item mutations ---
    addTodo(sectionId: string, text: string, radarLink?: string): TodoItem | undefined {
        const section = this.findTodoSection(sectionId);
        if (!section) { return undefined; }
        const item: TodoItem = {
            kind: 'todo',
            id: generateId('td'),
            text,
            completed: false,
            details: [],
            radarLink,
        };
        section.items.push(item);
        return item;
    }

    editTodo(id: string, text: string): boolean {
        const item = this.findTodo(id);
        if (!item) { return false; }
        item.text = text;
        return true;
    }

    deleteTodo(id: string): boolean {
        for (const section of this._todo.sections) {
            const idx = section.items.findIndex(i => i.id === id);
            if (idx >= 0) { section.items.splice(idx, 1); return true; }
        }
        return false;
    }

    toggleTodo(id: string): boolean {
        const item = this.findTodo(id);
        if (!item) { return false; }
        item.completed = !item.completed;
        return true;
    }

    moveTodo(id: string, targetSectionId: string, newIndex: number): boolean {
        // Find and remove the item from its current section
        let removed: TodoItem | undefined;
        for (const section of this._todo.sections) {
            const idx = section.items.findIndex(i => i.id === id);
            if (idx >= 0) {
                removed = section.items.splice(idx, 1)[0];
                break;
            }
        }
        if (!removed) { return false; }

        // Find target section and insert at clamped index
        const target = this.findTodoSection(targetSectionId);
        if (!target) { return false; }
        const clampedIndex = Math.max(0, Math.min(newIndex, target.items.length));
        target.items.splice(clampedIndex, 0, removed);
        return true;
    }

    // --- Quote mutations ---
    findQuote(id: string): QuoteItem | undefined {
        return this._quotes.items.find(q => q.id === id);
    }

    addQuote(text: string, attribution?: string): QuoteItem {
        const item: QuoteItem = {
            kind: 'quote',
            id: generateId('qt'),
            text,
            attribution,
        };
        this._quotes.items.push(item);
        return item;
    }

    editQuote(id: string, text: string, attribution?: string): boolean {
        const item = this.findQuote(id);
        if (!item) { return false; }
        item.text = text;
        item.attribution = attribution;
        return true;
    }

    deleteQuote(id: string): boolean {
        const idx = this._quotes.items.findIndex(q => q.id === id);
        if (idx < 0) { return false; }
        this._quotes.items.splice(idx, 1);
        return true;
    }

    // --- File I/O ---
    load(): void {
        try {
            const content = fs.readFileSync(this._filePath, 'utf-8');
            const result = this._applyParse(content);

            if (result.errors.length > 0) {
                const count = result.errors.length;
                vscode.window.showWarningMessage(
                    `Incoming: ${count} parse issue${count > 1 ? 's' : ''} in incoming.md`,
                    'Show File'
                ).then(action => {
                    if (action === 'Show File') {
                        vscode.workspace.openTextDocument(this._filePath)
                            .then(doc => vscode.window.showTextDocument(doc));
                    }
                });
            }
        } catch {
            this._radar = { swimlanes: [] };
            this._todo = { sections: [] };
            this._quotes = { items: [] };
            this._errors = [];
            this._unparsedLines = [];
        }
        this._onDidChange.fire();
    }

    async save(): Promise<void> {
        const content = serializeIncoming(this._radar, this._todo, this._unparsedLines, this._quotes);
        this._selfWriting = true;
        this._lastWriteTime = Date.now();
        try {
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(this._filePath),
                Buffer.from(content, 'utf-8')
            );
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            vscode.window.showErrorMessage(`Incoming: Failed to save incoming.md`);
        } finally {
            this._selfWriting = false;
        }
        this._onDidChange.fire();
    }

    private _applyParse(content: string): ParseResult {
        const result = parseIncoming(content);
        this._radar = result.radar;
        this._todo = result.todo;
        this._quotes = result.quotes;
        this._errors = result.errors;
        this._unparsedLines = result.unparsedLines;
        this._updateDiagnostics();
        return result;
    }

    private _updateDiagnostics(): void {
        const uri = vscode.Uri.file(this._filePath);
        const diags = this._errors.map(e => {
            const range = new vscode.Range(e.line - 1, 0, e.line - 1, e.content.length);
            return new vscode.Diagnostic(range, e.message, vscode.DiagnosticSeverity.Warning);
        });
        this._diagnostics.set(uri, diags);
    }

    private _onFileChange(): void {
        if (this._selfWriting) { return; }
        // Ignore watcher events within 1s of our own write — the 100ms selfWriting
        // window can miss late-arriving watcher events, which would re-parse the file
        // and regenerate all IDs (breaking layout keys).
        if (Date.now() - this._lastWriteTime < 1000) { return; }
        this.load();
    }

    dispose(): void {
        this._watcher.dispose();
        this._onDidChange.dispose();
        this._diagnostics.dispose();
    }
}
