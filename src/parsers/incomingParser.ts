import {
    RadarData, RadarSwimlane, RadarSubGroup, RadarItem, RadarSubItem, RadarRecurrence, DayOfWeek,
    TodoData, TodoItem, TodoSection,
    QuoteData, QuoteItem,
    GoalData, GoalSection, GoalItem, GoalMilestone,
    BookmarkData, BookmarkSection,
    ContactData, ContactGroup, ContactItem,
    NoteData, NoteNotebook, NotePage, NoteTag,
    ParseResult, ParseError, UnparsedLine,
    generateId, resetIdCounter,
} from '../models/types';
import { parseDateMDYY } from '../utils/dateUtils';

export function parseIncoming(content: string): ParseResult {
    resetIdCounter();

    const lines = content.split('\n');
    const errors: ParseError[] = [];
    const unparsedLines: UnparsedLine[] = [];

    // Find top-level sections (order-independent)
    const sectionStarts: { name: string; start: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '# Radar') { sectionStarts.push({ name: 'radar', start: i }); }
        else if (trimmed === '# TODO') { sectionStarts.push({ name: 'todo', start: i }); }
        else if (trimmed === '# Quotes') { sectionStarts.push({ name: 'quotes', start: i }); }
        else if (trimmed === '# Goals') { sectionStarts.push({ name: 'goals', start: i }); }
        else if (trimmed === '# Bookmarks') { sectionStarts.push({ name: 'bookmarks', start: i }); }
        else if (trimmed === '# Contacts') { sectionStarts.push({ name: 'contacts', start: i }); }
        else if (trimmed === '# Notes') { sectionStarts.push({ name: 'notes', start: i }); }
    }

    // Determine section ranges: each section runs from heading+1 to next heading (or EOF)
    function getSectionLines(name: string): { lines: string[]; offset: number } {
        const idx = sectionStarts.findIndex(s => s.name === name);
        if (idx < 0) { return { lines: [], offset: 0 }; }
        const start = sectionStarts[idx].start + 1;
        const nextSection = sectionStarts.filter(s => s.start > sectionStarts[idx].start).sort((a, b) => a.start - b.start)[0];
        const end = nextSection ? nextSection.start : lines.length;
        return { lines: lines.slice(start, end), offset: start };
    }

    const radarSection = getSectionLines('radar');
    const todoSection = getSectionLines('todo');
    const quotesSection = getSectionLines('quotes');
    const goalsSection = getSectionLines('goals');
    const bookmarksSection = getSectionLines('bookmarks');
    const contactsSection = getSectionLines('contacts');
    const notesSection = getSectionLines('notes');

    const radar = parseRadarSection(radarSection.lines, radarSection.offset, errors, unparsedLines);
    const todo = parseTodoSection(todoSection.lines, todoSection.offset, errors);
    const quotes = parseQuotesSection(quotesSection.lines, quotesSection.offset, errors);
    const goals = parseGoalsSection(goalsSection.lines, goalsSection.offset, errors);
    const bookmarks = parseBookmarksSection(bookmarksSection.lines);
    const contacts = parseContactsSection(contactsSection.lines);
    const notes = parseNotesSection(notesSection.lines);

    return { radar, todo, quotes, goals, bookmarks, contacts, notes, errors, unparsedLines };
}

const VALID_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function parseDayTags(str: string): DayOfWeek[] {
    const days: DayOfWeek[] = [];
    const parts = str.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        const match = VALID_DAYS.find(d => d.toLowerCase() === part.toLowerCase());
        if (match) { days.push(match); }
    }
    return days;
}

function parseRadarSection(
    lines: string[],
    lineOffset: number,
    errors: ParseError[],
    unparsedLines: UnparsedLine[],
): RadarData {
    const swimlanes: RadarSwimlane[] = [];
    let currentSwimlane: RadarSwimlane | null = null;
    let currentSubGroup: RadarSubGroup | null = null;
    let currentItem: RadarItem | null = null;
    let pendingColor: string | undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = lineOffset + i + 1;
        const trimmed = line.trim();

        // Skip blank lines and the # Radar heading
        if (trimmed === '' || trimmed === '# Radar') { currentItem = null; continue; }

        // 4-space indented sub-item: "    - text"
        if (line.startsWith('    - ') && currentItem) {
            const subText = line.slice(6).trim();
            if (subText) {
                currentItem.subItems.push({
                    kind: 'radarSubItem',
                    id: generateId('rs'),
                    text: subText,
                });
            }
            continue;
        }

        // HTML comment metadata: <!-- key: value -->
        const metaMatch = trimmed.match(/^<!--\s*(\w+)\s*:\s*(.+?)\s*-->$/);
        if (metaMatch) {
            currentItem = null;
            const key = metaMatch[1].toLowerCase();
            const value = metaMatch[2];
            if (key === 'color') {
                if (currentSwimlane) {
                    currentSwimlane.color = value;
                } else {
                    pendingColor = value;
                }
            }
            continue;
        }

        // ## Swimlane heading
        if (line.startsWith('## ')) {
            currentSubGroup = null;
            currentItem = null;
            const id = generateId('sw');
            currentSwimlane = {
                kind: 'swimlane',
                id,
                name: line.slice(3).trim(),
                color: pendingColor,
                items: [],
                subGroups: [],
            };
            pendingColor = undefined;
            swimlanes.push(currentSwimlane);
            continue;
        }

        // ### Sub-group heading
        if (line.startsWith('### ') && currentSwimlane) {
            currentItem = null;
            const id = generateId('sg');
            currentSubGroup = {
                kind: 'subgroup',
                id,
                name: line.slice(4).trim(),
                swimlaneId: currentSwimlane.id,
                items: [],
            };
            currentSwimlane.subGroups.push(currentSubGroup);
            continue;
        }

        // - items (radar item line — three formats)
        if (trimmed.startsWith('- ') && currentSwimlane) {
            currentItem = null;
            const content = trimmed.slice(2).trim();

            // Format 1: One-time — M/D/YY - Label
            const oneTimeMatch = content.match(/^(\S+) - (.+)$/);
            if (oneTimeMatch) {
                const date = parseDateMDYY(oneTimeMatch[1]);
                if (date) {
                    const item: RadarItem = {
                        kind: 'radarItem',
                        id: generateId('ri'),
                        date,
                        label: oneTimeMatch[2].trim(),
                        subItems: [],
                    };
                    if (currentSubGroup) { currentSubGroup.items.push(item); }
                    else { currentSwimlane.items.push(item); }
                    currentItem = item;
                    continue;
                }
                // Date didn't parse — could be a different format, fall through
            }

            // Format 2 & 3: Check for parenthetical at end — Label (...)
            const parenMatch = content.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
            if (parenMatch) {
                const label = parenMatch[1].trim();
                const inside = parenMatch[2].trim();

                // Try weekly: all tokens are valid day names
                const dayTokens = parseDayTags(inside);
                const allTokens = inside.split(/[,\s]+/).filter(Boolean);
                if (dayTokens.length > 0 && dayTokens.length === allTokens.length) {
                    const item: RadarItem = {
                        kind: 'radarItem',
                        id: generateId('ri'),
                        recurrence: { type: 'weekly', days: dayTokens },
                        label,
                        subItems: [],
                    };
                    if (currentSubGroup) { currentSubGroup.items.push(item); }
                    else { currentSwimlane.items.push(item); }
                    currentItem = item;
                    continue;
                }

                // Try yearly: M/D (no year)
                const yearlyMatch = inside.match(/^(\d{1,2})\/(\d{1,2})$/);
                if (yearlyMatch) {
                    const month = parseInt(yearlyMatch[1], 10);
                    const day = parseInt(yearlyMatch[2], 10);
                    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                        const item: RadarItem = {
                            kind: 'radarItem',
                            id: generateId('ri'),
                            recurrence: { type: 'yearly', month, day },
                            label,
                            subItems: [],
                        };
                        if (currentSubGroup) { currentSubGroup.items.push(item); }
                        else { currentSwimlane.items.push(item); }
                        currentItem = item;
                        continue;
                    }
                }
            }

            // If one-time match existed but date was bad, report error
            if (oneTimeMatch) {
                errors.push({
                    line: lineNumber,
                    content: line,
                    message: `Could not parse date "${oneTimeMatch[1]}" — expected M/D/YY format`,
                });
                unparsedLines.push({
                    content: line,
                    afterSection: currentSwimlane.name + (currentSubGroup ? '/' + currentSubGroup.name : ''),
                });
                continue;
            }

            // Starts with "- " but doesn't match any pattern
            errors.push({
                line: lineNumber,
                content: line,
                message: `Expected format "- M/D/YY - Label", "- Label (Day, Day)", or "- Label (M/D)"`,
            });
            unparsedLines.push({
                content: line,
                afterSection: currentSwimlane.name + (currentSubGroup ? '/' + currentSubGroup.name : ''),
            });
            continue;
        }

        // Lines before any swimlane that aren't comments or blank
        if (!currentSwimlane && trimmed.startsWith('- ')) {
            errors.push({
                line: lineNumber,
                content: line,
                message: 'Item found before any ## swimlane heading',
            });
            unparsedLines.push({ content: line, afterSection: '_top' });
        }
    }

    return { swimlanes };
}

function parseTodoSection(
    lines: string[],
    lineOffset: number,
    errors: ParseError[],
): TodoData {
    if (lines.length === 0) {
        return { sections: [] };
    }

    const sections: TodoSection[] = [];

    let currentSection: TodoSection | null = null;
    let currentItem: TodoItem | null = null;
    let notesLines: string[] = [];

    function flushNotes() {
        if (currentItem) {
            currentItem.notes = notesLines.join('\n');
        }
        notesLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '' || trimmed === '# TODO') { continue; }

        // ## Section heading
        if (line.startsWith('## ')) {
            flushNotes();
            currentItem = null;
            currentSection = {
                kind: 'todoSection',
                id: generateId('ts'),
                name: line.slice(3).trim(),
                items: [],
            };
            sections.push(currentSection);
            continue;
        }

        // * [ ] or * [x] todo item — only if inside a ## section
        const todoMatch = trimmed.match(/^\* \[([ x])\] (.+)$/);
        if (todoMatch && currentSection) {
            flushNotes();
            let text = todoMatch[2].trim();
            let radarLink: string | undefined;

            // Extract {radar:name} cross-reference
            const linkMatch = text.match(/\s*\{radar:([^}]+)\}\s*$/);
            if (linkMatch) {
                radarLink = linkMatch[1].trim();
                text = text.slice(0, linkMatch.index).trim();
            }

            currentItem = {
                kind: 'todo',
                id: generateId('td'),
                text,
                completed: todoMatch[1] === 'x',
                notes: '',
                dueDate: '',
                radarLink,
            };
            currentSection.items.push(currentItem);
            continue;
        }

        // Due: line (4-space indent)
        if (line.startsWith('    ') && currentItem) {
            const trimmed4 = line.slice(4).trim();
            if (trimmed4.startsWith('Due:')) {
                currentItem.dueDate = trimmed4.slice('Due:'.length).trim();
                continue;
            }
        }

        // Indented note line: bullet (    - text) or paragraph (    text)
        const bulletMatch = line.match(/^    - (.+)$/);
        if (bulletMatch && currentItem) {
            notesLines.push('- ' + bulletMatch[1].trim());
            continue;
        }

        const paragraphMatch = line.match(/^    (.+)$/);
        if (paragraphMatch && currentItem) {
            notesLines.push(paragraphMatch[1].trimEnd());
            continue;
        }
    }

    flushNotes();

    return { sections };
}

function parseGoalsSection(
    lines: string[],
    lineOffset: number,
    errors: ParseError[],
): GoalData {
    const sections: GoalSection[] = [];
    let currentSection: GoalSection | null = null;
    let currentGoal: GoalItem | null = null;
    let currentMilestone: GoalMilestone | null = null;

    function finalizeGoal() {
        if (currentGoal) {
            // Apply equal distribution for milestones with weight === 0
            const unweighted = currentGoal.milestones.filter(m => m.weight === 0);
            if (unweighted.length > 0 && currentGoal.milestones.every(m => m.weight === 0)) {
                const each = Math.floor(100 / currentGoal.milestones.length);
                const remainder = 100 - each * currentGoal.milestones.length;
                currentGoal.milestones.forEach((m, i) => { m.weight = each + (i < remainder ? 1 : 0); });
            }
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = lineOffset + i + 1;
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '# Goals') { continue; }

        // ## Section heading
        if (line.startsWith('## ')) {
            finalizeGoal();
            currentGoal = null;
            currentMilestone = null;
            currentSection = {
                kind: 'goalSection',
                id: generateId('gs'),
                name: line.slice(3).trim(),
                items: [],
            };
            sections.push(currentSection);
            continue;
        }

        // Goal item: - [ ] or - [x] at start of line (no indent)
        const goalMatch = trimmed.match(/^- \[([ x])\] (.+)$/);
        if (goalMatch && !line.startsWith('    ') && currentSection) {
            finalizeGoal();
            currentMilestone = null;
            let text = goalMatch[2].trim();
            let radarLink: string | undefined;

            // Extract {radar:name} cross-reference
            const linkMatch = text.match(/\s*\{radar:([^}]+)\}\s*$/);
            if (linkMatch) {
                radarLink = linkMatch[1].trim();
                text = text.slice(0, linkMatch.index).trim();
            }

            currentGoal = {
                kind: 'goal',
                id: generateId('gl'),
                text,
                completed: goalMatch[1] === 'x',
                milestones: [],
                completionNote: '',
                dueDate: '',
                radarLink,
            };
            currentSection.items.push(currentGoal);
            continue;
        }

        // 8-space indent: milestone completion note or due date
        if (line.startsWith('        ') && currentMilestone) {
            const inner = line.slice(8).trim();
            if (inner.startsWith('Completed')) {
                currentMilestone.completionNote = inner.slice('Completed'.length).trimStart();
                continue;
            }
            if (inner.startsWith('Due:')) {
                currentMilestone.dueDate = inner.slice('Due:'.length).trim();
                continue;
            }
        }

        // 4-space indent lines (must check after 8-space)
        if (line.startsWith('    ') && !line.startsWith('        ') && currentGoal) {
            const inner4 = line.slice(4);

            // Milestone: - [ ] text (N%) or - [x] text (N%)
            const msMatch = inner4.match(/^- \[([ x])\] (.+)$/);
            if (msMatch) {
                currentMilestone = null;
                let msText = msMatch[2].trim();
                let weight = 0;

                // Parse weight from (N%) at end
                const weightMatch = msText.match(/\s*\((\d+)%\)\s*$/);
                if (weightMatch) {
                    weight = parseInt(weightMatch[1], 10);
                    msText = msText.slice(0, weightMatch.index).trim();
                }

                const milestone: GoalMilestone = {
                    kind: 'milestone',
                    id: generateId('ms'),
                    text: msText,
                    completed: msMatch[1] === 'x',
                    weight,
                    completionNote: '',
                    dueDate: '',
                };
                currentGoal.milestones.push(milestone);
                currentMilestone = milestone;
                continue;
            }

            const trimmed4 = inner4.trim();

            // Goal completion note (4-space indent, starts with "Completed")
            if (trimmed4.startsWith('Completed')) {
                currentGoal.completionNote = trimmed4.slice('Completed'.length).trimStart();
                currentMilestone = null;
                continue;
            }

            // Goal due date (4-space indent, starts with "Due:")
            if (trimmed4.startsWith('Due:')) {
                currentGoal.dueDate = trimmed4.slice('Due:'.length).trim();
                currentMilestone = null;
                continue;
            }
        }
    }

    finalizeGoal();

    return { sections };
}

function parseContactsSection(lines: string[]): ContactData {
    const groups: ContactGroup[] = [];
    let currentGroup: ContactGroup | null = null;
    let currentContact: ContactItem | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '# Contacts') { continue; }

        // ## Group heading
        if (line.startsWith('## ')) {
            currentContact = null;
            currentGroup = {
                kind: 'contactGroup',
                id: generateId('cg'),
                name: line.slice(3).trim(),
                items: [],
            };
            groups.push(currentGroup);
            continue;
        }

        // - Name (type) — contact entry
        if (trimmed.startsWith('- ') && currentGroup) {
            const contactMatch = trimmed.match(/^- (.+?) \(([^)]+)\)\s*$/);
            if (contactMatch) {
                currentContact = {
                    kind: 'contact',
                    id: generateId('ct'),
                    name: contactMatch[1].trim(),
                    contactType: contactMatch[2].trim(),
                    email: '',
                    phone: '',
                    notes: '',
                };
                currentGroup.items.push(currentContact);
                continue;
            }
            // - Name without type
            const nameOnly = trimmed.slice(2).trim();
            if (nameOnly) {
                currentContact = {
                    kind: 'contact',
                    id: generateId('ct'),
                    name: nameOnly,
                    contactType: '',
                    email: '',
                    phone: '',
                    notes: '',
                };
                currentGroup.items.push(currentContact);
                continue;
            }
        }

        // 4-space indented fields: Email:, Phone:, Notes:
        if (line.startsWith('    ') && currentContact) {
            const fieldLine = line.slice(4).trim();
            if (fieldLine.startsWith('Email:')) {
                currentContact.email = fieldLine.slice('Email:'.length).trim();
                continue;
            }
            if (fieldLine.startsWith('Phone:')) {
                currentContact.phone = fieldLine.slice('Phone:'.length).trim();
                continue;
            }
            if (fieldLine.startsWith('Notes:')) {
                currentContact.notes = fieldLine.slice('Notes:'.length).trim();
                continue;
            }
            // Continuation of notes (indented line without a Key: prefix)
            if (currentContact.notes) {
                currentContact.notes += '\n' + fieldLine;
            }
        }
    }

    return { groups };
}

function parseBookmarksSection(lines: string[]): BookmarkData {
    const sections: BookmarkSection[] = [];
    let currentSection: BookmarkSection | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '# Bookmarks') { continue; }

        // ## Section heading
        if (line.startsWith('## ')) {
            currentSection = {
                kind: 'bookmarkSection',
                id: generateId('bks'),
                name: line.slice(3).trim(),
                items: [],
            };
            sections.push(currentSection);
            continue;
        }

        // - [Title](URL) bookmark item
        if (trimmed.startsWith('- ') && currentSection) {
            const content = trimmed.slice(2).trim();

            // Try markdown link format: [Title](URL)
            const linkMatch = content.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (linkMatch) {
                currentSection.items.push({
                    kind: 'bookmark',
                    id: generateId('bk'),
                    title: linkMatch[1].trim(),
                    url: linkMatch[2].trim(),
                });
                continue;
            }

            // Fallback: bare URL — use URL as title
            if (content.match(/^https?:\/\//)) {
                currentSection.items.push({
                    kind: 'bookmark',
                    id: generateId('bk'),
                    title: content,
                    url: content,
                });
                continue;
            }
        }
    }

    return { sections };
}

function parseQuotesSection(
    lines: string[],
    lineOffset: number,
    errors: ParseError[],
): QuoteData {
    const items: QuoteItem[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = lineOffset + i + 1;
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '# Quotes') { continue; }

        const quoteMatch = trimmed.match(/^> (.+)$/);
        if (quoteMatch) {
            const raw = quoteMatch[1];
            // Split on " — " (em dash) or " -- " (double dash)
            const sepMatch = raw.match(/^(.+?) (?:—|--) (.+)$/);
            if (sepMatch) {
                items.push({
                    kind: 'quote',
                    id: generateId('qt'),
                    text: sepMatch[1].trim(),
                    attribution: sepMatch[2].trim(),
                });
            } else {
                items.push({
                    kind: 'quote',
                    id: generateId('qt'),
                    text: raw.trim(),
                });
            }
        }
    }

    return { items };
}

export function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function parseNoteTags(str: string): NoteTag[] {
    const tags: NoteTag[] = [];
    const regex = /\{(radar|goal|todo|note):([^}]+)\}/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
        tags.push({ type: match[1] as NoteTag['type'], target: match[2].trim() });
    }
    return tags;
}

function parseNotesSection(lines: string[]): NoteData {
    const notebooks: NoteNotebook[] = [];
    let currentNotebook: NoteNotebook | null = null;
    let currentPage: NotePage | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '# Notes') { continue; }

        // ## Notebook heading
        if (line.startsWith('## ')) {
            currentPage = null;
            const nbId = generateId('nb');
            currentNotebook = {
                kind: 'noteNotebook',
                id: nbId,
                name: line.slice(3).trim(),
                pages: [],
            };
            notebooks.push(currentNotebook);
            continue;
        }

        // - PageTitle (note page entry, unindented list item)
        if (trimmed.startsWith('- ') && !line.startsWith('    ') && currentNotebook) {
            const title = trimmed.slice(2).trim();
            if (title) {
                const pageId = generateId('np');
                currentPage = {
                    kind: 'notePage',
                    id: pageId,
                    title,
                    slug: slugify(title),
                    createdAt: '',
                    updatedAt: '',
                    tags: [],
                    notebookId: currentNotebook.id,
                };
                currentNotebook.pages.push(currentPage);
            }
            continue;
        }

        // 4-space indented metadata lines
        if (line.startsWith('    ') && currentPage) {
            const fieldLine = line.slice(4).trim();
            if (fieldLine.startsWith('Created:')) {
                currentPage.createdAt = fieldLine.slice('Created:'.length).trim();
                continue;
            }
            if (fieldLine.startsWith('Updated:')) {
                currentPage.updatedAt = fieldLine.slice('Updated:'.length).trim();
                continue;
            }
            if (fieldLine.startsWith('Tags:')) {
                currentPage.tags = parseNoteTags(fieldLine.slice('Tags:'.length).trim());
                continue;
            }
        }
    }

    return { notebooks };
}
