import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    RadarData, RadarSwimlane, RadarSubGroup, RadarItem,
    TodoData, TodoItem, TodoSection,
    QuoteData, QuoteItem,
    ReminderData, ReminderMeeting, ReminderPoint, DayOfWeek,
    GoalData, GoalSection, GoalItem, GoalMilestone,
    ParseResult, ParseError, UnparsedLine,
    generateId,
} from '../models/types';
import { parseIncoming } from '../parsers/incomingParser';
import { serializeIncoming } from '../serializers/incomingSerializer';
import { parseDateMDYY, daysUntil, formatDateMDYY } from '../utils/dateUtils';
import { VIRT_GOAL_PREFIX, VIRT_MILESTONE_PREFIX, VIRT_TODO_PREFIX } from '../utils/virtualItems';

export class DataStore implements vscode.Disposable {
    private _radar: RadarData = { swimlanes: [] };
    private _todo: TodoData = { sections: [] };
    private _quotes: QuoteData = { items: [] };
    private _reminders: ReminderData = { meetings: [] };
    private _goals: GoalData = { sections: [] };
    private _errors: ParseError[] = [];
    private _unparsedLines: UnparsedLine[] = [];
    private _filePath: string;
    private _selfWriting = false;
    private _lastWriteTime = 0;
    private _watcher: vscode.FileSystemWatcher;
    private _diagnostics: vscode.DiagnosticCollection;
    private _cachedAugmentedRadar: RadarData | null = null;
    private _cachedPastDue: any[] | null = null;
    private _cachedArchive: any[] | null = null;

    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor(workspaceRoot: string) {
        this._filePath = path.join(workspaceRoot, 'inc0ming.md');
        this._diagnostics = vscode.languages.createDiagnosticCollection('inc0ming');

        const pattern = new vscode.RelativePattern(workspaceRoot, 'inc0ming.md');
        this._watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this._watcher.onDidChange(() => this._onFileChange());
        this._watcher.onDidCreate(() => this._onFileChange());
        this._watcher.onDidDelete(() => this._onFileChange());
    }

    // --- Data access ---
    get radar(): RadarData { return this._radar; }
    get todo(): TodoData { return this._todo; }
    get quotes(): QuoteData { return this._quotes; }
    get reminders(): ReminderData { return this._reminders; }
    get goals(): GoalData { return this._goals; }
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

    /** Returns radar data augmented with virtual blips for goals/TODOs that have due dates. */
    computeAugmentedRadar(): RadarData {
        if (this._cachedAugmentedRadar) { return this._cachedAugmentedRadar; }

        const swimlanes: RadarSwimlane[] = this._radar.swimlanes.map(s => ({
            ...s,
            items: [...s.items],
            subGroups: s.subGroups.map(sg => ({ ...sg, items: [...sg.items] })),
        }));

        const laneMap = new Map<string, RadarSwimlane>();
        for (const sw of swimlanes) {
            laneMap.set(sw.name, sw);
        }

        function findOrCreateLane(name: string): RadarSwimlane {
            let lane = laneMap.get(name);
            if (!lane) {
                lane = {
                    kind: 'swimlane',
                    id: 'virt_sw_' + name,
                    name,
                    items: [],
                    subGroups: [],
                };
                laneMap.set(name, lane);
                swimlanes.push(lane);
            }
            return lane;
        }

        for (const section of this._goals.sections) {
            for (const goal of section.items) {
                if (!goal.completed && goal.dueDate) {
                    const date = parseDateMDYY(goal.dueDate);
                    if (date) {
                        const lane = findOrCreateLane(goal.radarLink || 'Goals');
                        lane.items.push({ kind: 'radarItem', id: VIRT_GOAL_PREFIX + goal.id, date, label: goal.text });
                    }
                }
                // Milestones with due dates
                for (const ms of goal.milestones) {
                    if (ms.completed || !ms.dueDate) { continue; }
                    const msDate = parseDateMDYY(ms.dueDate);
                    if (!msDate) { continue; }
                    const msLane = findOrCreateLane(goal.radarLink || 'Goals');
                    msLane.items.push({ kind: 'radarItem', id: VIRT_MILESTONE_PREFIX + ms.id, date: msDate, label: ms.text });
                }
            }
        }

        for (const section of this._todo.sections) {
            for (const todo of section.items) {
                if (todo.completed || !todo.dueDate) { continue; }
                const date = parseDateMDYY(todo.dueDate);
                if (!date) { continue; }
                const lane = findOrCreateLane(todo.radarLink || 'TODOs');
                lane.items.push({ kind: 'radarItem', id: VIRT_TODO_PREFIX + todo.id, date, label: todo.text });
            }
        }

        this._cachedAugmentedRadar = { swimlanes };
        return this._cachedAugmentedRadar;
    }

    /** Returns overdue items sorted by most overdue first. */
    computePastDue(): any[] {
        if (this._cachedPastDue) { return this._cachedPastDue; }

        const items: any[] = [];

        // Overdue todos
        for (const section of this._todo.sections) {
            for (const todo of section.items) {
                if (todo.completed || !todo.dueDate) { continue; }
                const date = parseDateMDYY(todo.dueDate);
                if (!date) { continue; }
                const days = daysUntil(date);
                if (days < 0) {
                    items.push({
                        id: todo.id,
                        sourceType: 'todo',
                        text: todo.text,
                        dueDate: todo.dueDate,
                        daysOverdue: Math.abs(days),
                        sectionName: section.name,
                        sourceId: section.id,
                    });
                }
            }
        }

        // Overdue goals and milestones
        for (const section of this._goals.sections) {
            for (const goal of section.items) {
                if (!goal.completed && goal.dueDate) {
                    const date = parseDateMDYY(goal.dueDate);
                    if (date) {
                        const days = daysUntil(date);
                        if (days < 0) {
                            items.push({
                                id: goal.id,
                                sourceType: 'goal',
                                text: goal.text,
                                dueDate: goal.dueDate,
                                daysOverdue: Math.abs(days),
                                sectionName: section.name,
                                sourceId: section.id,
                            });
                        }
                    }
                }
                for (const ms of goal.milestones) {
                    if (ms.completed || !ms.dueDate) { continue; }
                    const msDate = parseDateMDYY(ms.dueDate);
                    if (!msDate) { continue; }
                    const days = daysUntil(msDate);
                    if (days < 0) {
                        items.push({
                            id: ms.id,
                            sourceType: 'milestone',
                            text: ms.text,
                            dueDate: ms.dueDate,
                            daysOverdue: Math.abs(days),
                            sectionName: section.name,
                            sourceId: section.id,
                            parentGoalId: goal.id,
                            parentGoalText: goal.text,
                        });
                    }
                }
            }
        }

        // Overdue radar items
        for (const sw of this._radar.swimlanes) {
            const addRadarItems = (radarItems: RadarItem[], laneName: string) => {
                for (const ri of radarItems) {
                    const days = daysUntil(ri.date);
                    if (days < 0) {
                        items.push({
                            id: ri.id,
                            sourceType: 'radar',
                            text: ri.label,
                            dueDate: formatDateMDYY(ri.date),
                            daysOverdue: Math.abs(days),
                            sectionName: laneName,
                            sourceId: sw.id,
                        });
                    }
                }
            };
            addRadarItems(sw.items, sw.name);
            for (const sg of sw.subGroups) {
                addRadarItems(sg.items, sw.name + ' / ' + sg.name);
            }
        }

        // Sort by most overdue first
        items.sort((a, b) => b.daysOverdue - a.daysOverdue);

        this._cachedPastDue = items;
        return items;
    }

    /** Returns accomplished items (completed todos, completed goals, past radar events). */
    computeArchive(): any[] {
        if (this._cachedArchive) { return this._cachedArchive; }

        const items: any[] = [];

        // Completed todos
        for (const section of this._todo.sections) {
            for (const todo of section.items) {
                if (!todo.completed) { continue; }
                items.push({
                    id: todo.id,
                    sourceType: 'todo',
                    text: todo.text,
                    dueDate: todo.dueDate || undefined,
                    sectionName: section.name,
                });
            }
        }

        // Completed goals
        for (const section of this._goals.sections) {
            for (const goal of section.items) {
                if (!goal.completed) { continue; }
                const milestoneCount = goal.milestones.length;
                const milestonesCompleted = goal.milestones.filter(m => m.completed).length;
                items.push({
                    id: goal.id,
                    sourceType: 'goal',
                    text: goal.text,
                    completionNote: goal.completionNote || undefined,
                    dueDate: goal.dueDate || undefined,
                    sectionName: section.name,
                    milestoneCount,
                    milestonesCompleted,
                });
            }
        }

        // Past radar events
        for (const sw of this._radar.swimlanes) {
            const addPastRadar = (radarItems: RadarItem[], laneName: string) => {
                for (const ri of radarItems) {
                    const days = daysUntil(ri.date);
                    if (days < 0) {
                        items.push({
                            id: ri.id,
                            sourceType: 'radar',
                            text: ri.label,
                            dueDate: formatDateMDYY(ri.date),
                            sectionName: laneName,
                        });
                    }
                }
            };
            addPastRadar(sw.items, sw.name);
            for (const sg of sw.subGroups) {
                addPastRadar(sg.items, sw.name + ' / ' + sg.name);
            }
        }

        this._cachedArchive = items;
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
            notes: '',
            dueDate: '',
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

    editTodoNotes(id: string, notes: string): boolean {
        const item = this.findTodo(id);
        if (!item) { return false; }
        item.notes = notes;
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

    // --- Reminder queries ---
    findMeeting(id: string): ReminderMeeting | undefined {
        return this._reminders.meetings.find(m => m.id === id);
    }

    findPoint(id: string): { point: ReminderPoint; meeting: ReminderMeeting } | undefined {
        for (const meeting of this._reminders.meetings) {
            const point = meeting.points.find(p => p.id === id);
            if (point) { return { point, meeting }; }
        }
        return undefined;
    }

    // --- Reminder mutations ---
    addMeeting(name: string, days: DayOfWeek[]): ReminderMeeting {
        const meeting: ReminderMeeting = {
            kind: 'reminderMeeting',
            id: generateId('rm'),
            name,
            days,
            points: [],
        };
        this._reminders.meetings.push(meeting);
        return meeting;
    }

    renameMeeting(id: string, name: string, days: DayOfWeek[]): boolean {
        const meeting = this.findMeeting(id);
        if (!meeting) { return false; }
        meeting.name = name;
        meeting.days = days;
        return true;
    }

    deleteMeeting(id: string): boolean {
        const idx = this._reminders.meetings.findIndex(m => m.id === id);
        if (idx < 0) { return false; }
        this._reminders.meetings.splice(idx, 1);
        return true;
    }

    addPoint(meetingId: string, text: string): ReminderPoint | undefined {
        const meeting = this.findMeeting(meetingId);
        if (!meeting) { return undefined; }
        const point: ReminderPoint = {
            kind: 'reminderPoint',
            id: generateId('rp'),
            text,
        };
        meeting.points.push(point);
        return point;
    }

    editPoint(id: string, text: string): boolean {
        const result = this.findPoint(id);
        if (!result) { return false; }
        result.point.text = text;
        return true;
    }

    deletePoint(id: string): boolean {
        for (const meeting of this._reminders.meetings) {
            const idx = meeting.points.findIndex(p => p.id === id);
            if (idx >= 0) { meeting.points.splice(idx, 1); return true; }
        }
        return false;
    }

    clearMeeting(id: string): boolean {
        const meeting = this.findMeeting(id);
        if (!meeting) { return false; }
        meeting.points = [];
        return true;
    }

    // --- Goal queries ---
    findGoalSection(id: string): GoalSection | undefined {
        return this._goals.sections.find(s => s.id === id);
    }

    findGoal(id: string): { goal: GoalItem; section: GoalSection } | undefined {
        for (const section of this._goals.sections) {
            const goal = section.items.find(g => g.id === id);
            if (goal) { return { goal, section }; }
        }
        return undefined;
    }

    findMilestone(id: string): { milestone: GoalMilestone; goal: GoalItem } | undefined {
        for (const section of this._goals.sections) {
            for (const goal of section.items) {
                const ms = goal.milestones.find(m => m.id === id);
                if (ms) { return { milestone: ms, goal }; }
            }
        }
        return undefined;
    }

    // --- Goal section mutations ---
    addGoalSection(name: string): GoalSection {
        const section: GoalSection = {
            kind: 'goalSection',
            id: generateId('gs'),
            name,
            items: [],
        };
        this._goals.sections.push(section);
        return section;
    }

    renameGoalSection(id: string, name: string): boolean {
        const section = this.findGoalSection(id);
        if (!section) { return false; }
        section.name = name;
        return true;
    }

    deleteGoalSection(id: string): boolean {
        const idx = this._goals.sections.findIndex(s => s.id === id);
        if (idx < 0) { return false; }
        this._goals.sections.splice(idx, 1);
        return true;
    }

    // --- Goal item mutations ---
    addGoal(sectionId: string, text: string): GoalItem | undefined {
        const section = this.findGoalSection(sectionId);
        if (!section) { return undefined; }
        const goal: GoalItem = {
            kind: 'goal',
            id: generateId('gl'),
            text,
            completed: false,
            milestones: [],
            completionNote: '',
            dueDate: '',
        };
        section.items.push(goal);
        return goal;
    }

    editGoal(id: string, text: string): boolean {
        const result = this.findGoal(id);
        if (!result) { return false; }
        result.goal.text = text;
        return true;
    }

    deleteGoal(id: string): boolean {
        for (const section of this._goals.sections) {
            const idx = section.items.findIndex(g => g.id === id);
            if (idx >= 0) { section.items.splice(idx, 1); return true; }
        }
        return false;
    }

    toggleGoal(id: string, completionNote: string): boolean {
        const result = this.findGoal(id);
        if (!result) { return false; }
        result.goal.completed = !result.goal.completed;
        if (result.goal.completed) {
            result.goal.completionNote = completionNote;
        } else {
            result.goal.completionNote = '';
        }
        return true;
    }

    editGoalCompletionNote(id: string, completionNote: string): boolean {
        const result = this.findGoal(id);
        if (!result) { return false; }
        result.goal.completionNote = completionNote;
        return true;
    }

    editGoalDueDate(id: string, dueDate: string): boolean {
        const result = this.findGoal(id);
        if (!result) { return false; }
        result.goal.dueDate = dueDate;
        return true;
    }

    editMilestoneDueDate(id: string, dueDate: string): boolean {
        const result = this.findMilestone(id);
        if (!result) { return false; }
        result.milestone.dueDate = dueDate;
        return true;
    }

    editTodoDueDate(id: string, dueDate: string): boolean {
        const item = this.findTodo(id);
        if (!item) { return false; }
        item.dueDate = dueDate;
        return true;
    }

    editTodoRadarLink(id: string, radarLink: string): boolean {
        const item = this.findTodo(id);
        if (!item) { return false; }
        item.radarLink = radarLink || undefined;
        return true;
    }

    editGoalRadarLink(id: string, radarLink: string): boolean {
        const result = this.findGoal(id);
        if (!result) { return false; }
        result.goal.radarLink = radarLink || undefined;
        return true;
    }

    // --- Milestone mutations ---
    private _rebalanceMilestones(goal: GoalItem): void {
        const count = goal.milestones.length;
        if (count === 0) { return; }
        const base = Math.floor(100 / count);
        const remainder = 100 - base * count;
        for (let i = 0; i < count; i++) {
            goal.milestones[i].weight = base + (i < remainder ? 1 : 0);
        }
    }

    addMilestone(goalId: string, text: string, weight: number, dueDate?: string): GoalMilestone | undefined {
        const result = this.findGoal(goalId);
        if (!result) { return undefined; }
        const ms: GoalMilestone = {
            kind: 'milestone',
            id: generateId('ms'),
            text,
            completed: false,
            weight,
            completionNote: '',
            dueDate: dueDate || '',
        };
        result.goal.milestones.push(ms);
        this._rebalanceMilestones(result.goal);
        return ms;
    }

    editMilestone(id: string, text: string, weight: number): boolean {
        const result = this.findMilestone(id);
        if (!result) { return false; }
        result.milestone.text = text;
        result.milestone.weight = weight;
        return true;
    }

    deleteMilestone(id: string): boolean {
        for (const section of this._goals.sections) {
            for (const goal of section.items) {
                const idx = goal.milestones.findIndex(m => m.id === id);
                if (idx >= 0) {
                    goal.milestones.splice(idx, 1);
                    this._rebalanceMilestones(goal);
                    return true;
                }
            }
        }
        return false;
    }

    toggleMilestone(id: string, completionNote: string): boolean {
        const result = this.findMilestone(id);
        if (!result) { return false; }
        result.milestone.completed = !result.milestone.completed;
        if (result.milestone.completed) {
            result.milestone.completionNote = completionNote;
        } else {
            result.milestone.completionNote = '';
        }
        return true;
    }

    // --- File I/O ---
    load(): void {
        this._cachedAugmentedRadar = null;
        this._cachedPastDue = null;
        this._cachedArchive = null;
        try {
            const content = fs.readFileSync(this._filePath, 'utf-8');
            const result = this._applyParse(content);

            if (result.errors.length > 0) {
                const count = result.errors.length;
                vscode.window.showWarningMessage(
                    `Inc0ming: ${count} parse issue${count > 1 ? 's' : ''} in inc0ming.md`,
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
            this._reminders = { meetings: [] };
            this._goals = { sections: [] };
            this._errors = [];
            this._unparsedLines = [];
        }
        this._onDidChange.fire();
    }

    async save(): Promise<void> {
        this._cachedAugmentedRadar = null;
        this._cachedPastDue = null;
        this._cachedArchive = null;
        const content = serializeIncoming(this._radar, this._todo, this._unparsedLines, this._quotes, this._reminders, this._goals);
        this._selfWriting = true;
        this._lastWriteTime = Date.now();
        try {
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(this._filePath),
                Buffer.from(content, 'utf-8')
            );
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            vscode.window.showErrorMessage(`Inc0ming: Failed to save inc0ming.md`);
        } finally {
            this._selfWriting = false;
        }
        this._onDidChange.fire();
    }

    private _applyParse(content: string): ParseResult {
        this._cachedAugmentedRadar = null;
        this._cachedPastDue = null;
        this._cachedArchive = null;
        const result = parseIncoming(content);
        this._radar = result.radar;
        this._todo = result.todo;
        this._quotes = result.quotes;
        this._reminders = result.reminders;
        this._goals = result.goals;
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
