import {
    RadarData, RadarSwimlane, RadarSubGroup, RadarItem,
    TodoData, TodoItem, TodoSection,
    QuoteData, QuoteItem,
    ReminderData, ReminderMeeting, ReminderPoint, DayOfWeek,
    GoalData, GoalSection, GoalItem, GoalMilestone,
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
        else if (trimmed === '# Goals') { sectionStarts.push({ name: 'goals', start: i }); }
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
    const goalsSection = getSectionLines('goals');

    const radar = parseRadarSection(radarSection.lines, radarSection.offset, errors, unparsedLines);
    const todo = parseTodoSection(todoSection.lines, todoSection.offset, errors);
    const quotes = parseQuotesSection(quotesSection.lines);
    const reminders = parseRemindersSection(remindersSection.lines);
    const goals = parseGoalsSection(goalsSection.lines);

    return { radar, todo, quotes, reminders, goals, errors, unparsedLines };
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

function parseGoalsSection(lines: string[]): GoalData {
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

    for (const line of lines) {
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
