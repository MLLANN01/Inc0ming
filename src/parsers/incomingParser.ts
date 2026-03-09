import {
    RadarData, RadarSwimlane, RadarSubGroup, RadarItem,
    TodoData, TodoItem, TodoSection,
    QuoteData, QuoteItem,
    ReminderData, ReminderMeeting, ReminderPoint, DayOfWeek,
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
        else if (trimmed === '# Reminders') { sectionStarts.push({ name: 'reminders', start: i }); }
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
    const remindersSection = getSectionLines('reminders');

    const radar = parseRadarSection(radarSection.lines, radarSection.offset, errors, unparsedLines);
    const todo = parseTodoSection(todoSection.lines, todoSection.offset, errors);
    const quotes = parseQuotesSection(quotesSection.lines);
    const reminders = parseRemindersSection(remindersSection.lines);

    return { radar, todo, quotes, reminders, errors, unparsedLines };
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
    let pendingColor: string | undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = lineOffset + i + 1;
        const trimmed = line.trim();

        // Skip blank lines and the # Radar heading
        if (trimmed === '' || trimmed === '# Radar') { continue; }

        // HTML comment metadata: <!-- key: value -->
        const metaMatch = trimmed.match(/^<!--\s*(\w+)\s*:\s*(.+?)\s*-->$/);
        if (metaMatch) {
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

        // - M/D/YY - Label (radar item)
        if (trimmed.startsWith('- ') && currentSwimlane) {
            const itemMatch = trimmed.match(/^- (\S+) - (.+)$/);
            if (itemMatch) {
                const date = parseDateMDYY(itemMatch[1]);
                if (date) {
                    const item: RadarItem = {
                        kind: 'radarItem',
                        id: generateId('ri'),
                        date,
                        label: itemMatch[2].trim(),
                    };
                    if (currentSubGroup) {
                        currentSubGroup.items.push(item);
                    } else {
                        currentSwimlane.items.push(item);
                    }
                    continue;
                } else {
                    errors.push({
                        line: lineNumber,
                        content: line,
                        message: `Could not parse date "${itemMatch[1]}" — expected M/D/YY format`,
                    });
                    // Preserve the line
                    unparsedLines.push({
                        content: line,
                        afterSection: currentSwimlane.name + (currentSubGroup ? '/' + currentSubGroup.name : ''),
                    });
                    continue;
                }
            }

            // Starts with "- " but doesn't match pattern
            errors.push({
                line: lineNumber,
                content: line,
                message: `Expected format "- M/D/YY - Label"`,
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

    // Default section for items before any ## heading
    let currentSection: TodoSection = {
        kind: 'todoSection',
        id: generateId('ts'),
        name: '',
        items: [],
    };
    sections.push(currentSection);

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

        // * [ ] or * [x] todo item
        const todoMatch = trimmed.match(/^\* \[([ x])\] (.+)$/);
        if (todoMatch) {
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
                radarLink,
            };
            currentSection.items.push(currentItem);
            continue;
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

function parseRemindersSection(lines: string[]): ReminderData {
    const meetings: ReminderMeeting[] = [];
    let currentMeeting: ReminderMeeting | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '# Reminders') { continue; }

        // ## Meeting Name (Day, Day)
        if (line.startsWith('## ')) {
            const heading = line.slice(3).trim();
            const dayMatch = heading.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
            let name: string;
            let days: DayOfWeek[] = [];

            if (dayMatch) {
                name = dayMatch[1].trim();
                days = parseDayTags(dayMatch[2]);
            } else {
                name = heading;
            }

            currentMeeting = {
                kind: 'reminderMeeting',
                id: generateId('rm'),
                name,
                days,
                points: [],
            };
            meetings.push(currentMeeting);
            continue;
        }

        // - text (talking point)
        if (trimmed.startsWith('- ') && currentMeeting) {
            const text = trimmed.slice(2).trim();
            if (text) {
                currentMeeting.points.push({
                    kind: 'reminderPoint',
                    id: generateId('rp'),
                    text,
                });
            }
            continue;
        }
    }

    return { meetings };
}

function parseQuotesSection(lines: string[]): QuoteData {
    const items: QuoteItem[] = [];

    for (const line of lines) {
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
