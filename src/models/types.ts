// ===== ID Generation =====
let _nextId = 0;

export function generateId(prefix: string): string {
    return `${prefix}_${_nextId++}`;
}

export function resetIdCounter(): void {
    _nextId = 0;
}

// ===== Radar Models =====
export interface RadarItem {
    kind: 'radarItem';
    id: string;
    date: Date;
    label: string;
}

export interface RadarSubGroup {
    kind: 'subgroup';
    id: string;
    name: string;
    swimlaneId: string;
    items: RadarItem[];
}

export interface RadarSwimlane {
    kind: 'swimlane';
    id: string;
    name: string;
    color?: string;
    items: RadarItem[];
    subGroups: RadarSubGroup[];
}

export interface RadarData {
    swimlanes: RadarSwimlane[];
}

// ===== Quote Models =====
export interface QuoteItem {
    kind: 'quote';
    id: string;
    text: string;
    attribution?: string;
}

export interface QuoteData {
    items: QuoteItem[];
}

// ===== Reminder Models =====
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface ReminderPoint {
    kind: 'reminderPoint';
    id: string;
    text: string;
}

export interface ReminderMeeting {
    kind: 'reminderMeeting';
    id: string;
    name: string;
    days: DayOfWeek[];
    points: ReminderPoint[];
}

export interface ReminderData {
    meetings: ReminderMeeting[];
}

// ===== Goal Models =====
export interface GoalMilestone {
    kind: 'milestone';
    id: string;
    text: string;
    completed: boolean;
    weight: number;             // percentage, e.g. 15 for 15%
    completionNote: string;     // "Completed 3/25 — scored 92%"
    dueDate: string;            // M/D/YY or empty string
}

export interface GoalItem {
    kind: 'goal';
    id: string;
    text: string;
    completed: boolean;
    milestones: GoalMilestone[];
    completionNote: string;     // "Completed 4/8 — ahead of schedule"
    dueDate: string;            // M/D/YY or empty string
    radarLink?: string;
}

export interface GoalSection {
    kind: 'goalSection';
    id: string;
    name: string;
    items: GoalItem[];
}

export interface GoalData {
    sections: GoalSection[];
}

// ===== Bookmark Models =====
export interface BookmarkItem {
    kind: 'bookmark';
    id: string;
    title: string;
    url: string;
}

export interface BookmarkSection {
    kind: 'bookmarkSection';
    id: string;
    name: string;
    items: BookmarkItem[];
}

export interface BookmarkData {
    sections: BookmarkSection[];
}

// ===== Contact Models =====
export interface ContactItem {
    kind: 'contact';
    id: string;
    name: string;
    contactType: string;    // free-text, e.g. "colleague", "mentor", "contractor"
    email: string;
    phone: string;
    notes: string;
}

export interface ContactGroup {
    kind: 'contactGroup';
    id: string;
    name: string;
    items: ContactItem[];
}

export interface ContactData {
    groups: ContactGroup[];
}

// ===== Note Models =====
export interface NoteTag {
    type: 'radar' | 'goal' | 'todo' | 'note';
    target: string;
}

export interface NotePage {
    kind: 'notePage';
    id: string;
    title: string;
    slug: string;
    createdAt: string;      // M/D/YY
    updatedAt: string;      // M/D/YY
    tags: NoteTag[];
    notebookId: string;
}

export interface NoteNotebook {
    kind: 'noteNotebook';
    id: string;
    name: string;
    pages: NotePage[];
}

export interface NoteData {
    notebooks: NoteNotebook[];
}

// ===== Todo Models =====
export interface TodoItem {
    kind: 'todo';
    id: string;
    text: string;
    completed: boolean;
    notes: string;
    dueDate: string;            // M/D/YY or empty string
    radarLink?: string;
}

export interface TodoSection {
    kind: 'todoSection';
    id: string;
    name: string;
    items: TodoItem[];
}

export interface TodoData {
    sections: TodoSection[];
}

// ===== Parse Errors & Unparsed Lines =====
export interface ParseError {
    line: number;
    content: string;
    message: string;
}

export interface UnparsedLine {
    content: string;
    afterSection: string;
    line?: number;
}

export interface ParseResult {
    radar: RadarData;
    todo: TodoData;
    quotes: QuoteData;
    reminders: ReminderData;
    goals: GoalData;
    bookmarks: BookmarkData;
    contacts: ContactData;
    notes: NoteData;
    errors: ParseError[];
    unparsedLines: UnparsedLine[];
}

// ===== Validation =====
export interface ValidationIssue {
    line: number;       // 1-based
    column: number;     // 0-based
    endColumn: number;  // 0-based
    severity: 'error' | 'warning' | 'info';
    code: string;       // e.g. 'E001', 'W004'
    message: string;
    section?: string;   // 'radar' | 'todo' | 'goals' | 'reminders' | 'quotes' | 'structure'
}

export interface ValidationResult {
    issues: ValidationIssue[];
    summary: { errors: number; warnings: number; info: number };
}

// ===== Serialized types (for webview, dates as ISO strings) =====
export interface SerializedRadarItem {
    id: string;
    date: string;
    label: string;
    virtual?: boolean;
    shape?: 'circle' | 'diamond' | 'flag' | 'star';
}

export interface SerializedRadarSubGroup {
    id: string;
    name: string;
    swimlaneId: string;
    items: SerializedRadarItem[];
}

export interface SerializedRadarSwimlane {
    id: string;
    name: string;
    color?: string;
    items: SerializedRadarItem[];
    subGroups: SerializedRadarSubGroup[];
}

export interface SerializedRadarData {
    swimlanes: SerializedRadarSwimlane[];
}

// ===== Webview Messages =====
// Extension → Webview
export type ExtensionMessage =
    | { type: 'radarUpdate'; data: SerializedRadarData }
    | { type: 'todoUpdate'; data: TodoData }
    | { type: 'quotesUpdate'; data: QuoteData }
    | { type: 'remindersUpdate'; data: ReminderData }
    | { type: 'goalsUpdate'; data: GoalData }
    | { type: 'bookmarksUpdate'; data: BookmarkData }
    | { type: 'notesUpdate'; data: NoteData }
    | { type: 'noteContent'; slug: string; content: string }
    | { type: 'noteImageUploaded'; src: string }
    | { type: 'parseErrors'; errors: ParseError[] };

// Webview → Extension
export type WebviewMessage =
    | { type: 'toggleTodo'; id: string }
    | { type: 'editRadarItem'; id: string; label: string; dateStr: string }
    | { type: 'editTodoItem'; id: string; text: string }
    | { type: 'addTodo'; text: string; sectionId: string }
    | { type: 'addRadarItem'; parentId: string; label: string; dateStr: string }
    | { type: 'addSwimlane'; name: string }
    | { type: 'addSubGroup'; swimlaneId: string; name: string }
    | { type: 'deleteRadarItem'; id: string }
    | { type: 'deleteTodoItem'; id: string }
    | { type: 'deleteSwimlane'; id: string }
    | { type: 'deleteSubGroup'; id: string }
    | { type: 'renameSwimlane'; id: string; name: string }
    | { type: 'renameSubGroup'; id: string; name: string }
    | { type: 'addTodoSection'; name: string }
    | { type: 'renameTodoSection'; id: string; name: string }
    | { type: 'deleteTodoSection'; id: string }
    | { type: 'moveTodo'; id: string; targetSectionId: string; newIndex: number }
    | { type: 'saveLayout'; layout: Record<string, { w?: number; h?: number; order?: number }> }
    | { type: 'reorderSwimlanes'; orderedIds: string[] }
    | { type: 'saveRadarVisible'; visible: boolean }
    | { type: 'addQuote'; text: string; attribution?: string }
    | { type: 'editQuote'; id: string; text: string; attribution?: string }
    | { type: 'deleteQuote'; id: string }
    | { type: 'addMeeting'; name: string; days: string }
    | { type: 'renameMeeting'; id: string; name: string; days: string }
    | { type: 'deleteMeeting'; id: string }
    | { type: 'addPoint'; meetingId: string; text: string }
    | { type: 'editPoint'; id: string; text: string }
    | { type: 'deletePoint'; id: string }
    | { type: 'clearMeeting'; id: string }
    | { type: 'editTodoNotes'; id: string; notes: string }
    | { type: 'addGoalSection'; name: string }
    | { type: 'renameGoalSection'; id: string; name: string }
    | { type: 'deleteGoalSection'; id: string }
    | { type: 'addGoal'; sectionId: string; text: string }
    | { type: 'editGoal'; id: string; text: string }
    | { type: 'deleteGoal'; id: string }
    | { type: 'toggleGoal'; id: string; completionNote: string }
    | { type: 'editGoalCompletionNote'; id: string; completionNote: string }
    | { type: 'addMilestone'; goalId: string; text: string; weight: number; dueDate?: string }
    | { type: 'editMilestone'; id: string; text: string; weight: number }
    | { type: 'deleteMilestone'; id: string }
    | { type: 'toggleMilestone'; id: string; completionNote: string }
    | { type: 'editGoalDueDate'; id: string; dueDate: string }
    | { type: 'editMilestoneDueDate'; id: string; dueDate: string }
    | { type: 'editTodoDueDate'; id: string; dueDate: string }
    | { type: 'editTodoRadarLink'; id: string; radarLink: string }
    | { type: 'editGoalRadarLink'; id: string; radarLink: string }
    | { type: 'saveSectionOrder'; order: string[] }
    | { type: 'addBookmarkSection'; name: string }
    | { type: 'renameBookmarkSection'; id: string; name: string }
    | { type: 'deleteBookmarkSection'; id: string }
    | { type: 'addBookmark'; sectionId: string; title: string; url: string }
    | { type: 'editBookmark'; id: string; title: string; url: string }
    | { type: 'deleteBookmark'; id: string }
    | { type: 'openBookmark'; url: string }
    | { type: 'copyBookmarkUrl'; url: string }
    | { type: 'moveBookmark'; id: string; targetSectionId: string; newIndex: number }
    | { type: 'addNotebook'; name: string }
    | { type: 'renameNotebook'; id: string; name: string }
    | { type: 'deleteNotebook'; id: string }
    | { type: 'addNotePage'; notebookId: string; title: string }
    | { type: 'editNotePageTitle'; id: string; title: string }
    | { type: 'deleteNotePage'; id: string }
    | { type: 'updateNoteTags'; id: string; tags: NoteTag[] }
    | { type: 'requestNoteContent'; slug: string }
    | { type: 'saveNoteContent'; slug: string; content: string }
    | { type: 'uploadNoteImage'; data: string; mimeType: string; noteSlug: string };

