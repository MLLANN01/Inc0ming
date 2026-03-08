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

// ===== Todo Models =====
export interface TodoItem {
    kind: 'todo';
    id: string;
    text: string;
    completed: boolean;
    details: string[];
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
}

export interface ParseResult {
    radar: RadarData;
    todo: TodoData;
    quotes: QuoteData;
    errors: ParseError[];
    unparsedLines: UnparsedLine[];
}

// ===== Serialized types (for webview, dates as ISO strings) =====
export interface SerializedRadarItem {
    id: string;
    date: string;
    label: string;
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
    | { type: 'deleteQuote'; id: string };

