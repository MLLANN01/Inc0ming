import { ParseResult, ValidationIssue, ValidationResult } from '../models/types';
import { parseDateMDYY } from '../utils/dateUtils';

const KNOWN_SECTIONS = ['Radar', 'TODO', 'Quotes', 'Reminders', 'Goals', 'Bookmarks', 'Contacts', 'Notes'];

type CurrentTopSection = 'radar' | 'todo' | 'quotes' | 'reminders' | 'goals' | 'bookmarks' | 'contacts' | 'notes' | null;

/**
 * Validates an inc0ming.md file for structural and semantic correctness.
 * Operates on the raw file content (line-by-line scan) plus the parsed result
 * (for cross-reference checks that need the data model).
 */
export function validateFile(content: string, parseResult: ParseResult): ValidationResult {
    const issues: ValidationIssue[] = [];
    const lines = content.split('\n');

    // ---------- Pass 1: Line-by-line structural scan ----------
    const seenTopSections = new Map<string, number>(); // name -> first line number
    let currentTopSection: CurrentTopSection = null;

    // Sub-section tracking
    let subSectionHasItems = false;

    // Radar-specific
    let currentSwimlane: string | null = null;

    // TODO-specific
    let todoCurrentSection: string | null = null;
    let todoCurrentItem = false;

    // Goals-specific
    let goalsCurrentSection: string | null = null;
    let goalsCurrentGoal = false;
    let goalsCurrentMilestone = false;

    // Reminders-specific
    let remindersCurrentMeeting: string | null = null;

    // Track ## headings per top-level section for W011 (empty section)
    let lastSubHeadingLine = -1;
    let lastSubHeadingName = '';
    let lastSubHeadingHadItems = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1; // 1-based
        const trimmed = line.trim();

        // Skip blank lines
        if (trimmed === '') { continue; }

        // ---------- Top-level section headings ----------
        const topMatch = trimmed.match(/^# (.+)$/);
        if (topMatch && !trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
            const sectionName = topMatch[1];

            // Check for empty previous sub-section
            checkEmptySubSection(issues, lastSubHeadingLine, lastSubHeadingName, lastSubHeadingHadItems, currentTopSection);
            lastSubHeadingLine = -1;
            lastSubHeadingName = '';
            lastSubHeadingHadItems = false;

            // E009: Duplicate top-level heading
            if (seenTopSections.has(sectionName)) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E009',
                    message: `Duplicate top-level heading "# ${sectionName}" (first seen on line ${seenTopSections.get(sectionName)})`,
                    section: 'structure',
                });
            } else {
                seenTopSections.set(sectionName, lineNumber);
            }

            // E010: Unknown top-level heading
            if (!KNOWN_SECTIONS.includes(sectionName)) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E010',
                    message: `Unknown top-level heading "# ${sectionName}". Expected: ${KNOWN_SECTIONS.join(', ')}`,
                    section: 'structure',
                });
            }

            // Update current section
            currentTopSection = sectionName.toLowerCase() as CurrentTopSection;
            if (!['radar', 'todo', 'quotes', 'reminders', 'goals', 'bookmarks', 'contacts'].includes(currentTopSection as string)) {
                currentTopSection = null;
            }
            subSectionHasItems = false;
            currentSwimlane = null;
            todoCurrentSection = null;
            todoCurrentItem = false;
            goalsCurrentSection = null;
            goalsCurrentGoal = false;
            goalsCurrentMilestone = false;
            remindersCurrentMeeting = null;
            continue;
        }

        // ---------- ## Sub-section headings ----------
        if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
            // Check for empty previous sub-section
            checkEmptySubSection(issues, lastSubHeadingLine, lastSubHeadingName, lastSubHeadingHadItems, currentTopSection);

            const subName = trimmed.slice(3).trim();
            lastSubHeadingLine = lineNumber;
            lastSubHeadingName = subName;
            lastSubHeadingHadItems = false;

            subSectionHasItems = false;

            if (currentTopSection === 'radar') {
                currentSwimlane = subName;
            } else if (currentTopSection === 'todo') {
                todoCurrentSection = subName;
                todoCurrentItem = false;
            } else if (currentTopSection === 'goals') {
                goalsCurrentSection = subName;
                goalsCurrentGoal = false;
                goalsCurrentMilestone = false;
            } else if (currentTopSection === 'reminders') {
                remindersCurrentMeeting = subName;
            }
            continue;
        }

        // ---------- ### Sub-sub-section headings ----------
        if (trimmed.startsWith('### ')) {
            if (currentTopSection === 'radar') {
                // W001: Sub-group without parent swimlane
                if (!currentSwimlane) {
                    issues.push({
                        line: lineNumber,
                        column: 0,
                        endColumn: line.length,
                        severity: 'warning',
                        code: 'W001',
                        message: 'Sub-group heading before any ## swimlane heading',
                        section: 'radar',
                    });
                }
                lastSubHeadingHadItems = true; // ### counts as content for the ## section
            }
            continue;
        }

        // ---------- HTML comment (<!-- color: ... -->) ----------
        const metaMatch = trimmed.match(/^<!--\s*(\w+)\s*:\s*(.+?)\s*-->$/);
        if (metaMatch) {
            if (currentTopSection === 'radar') {
                const key = metaMatch[1].toLowerCase();
                if (key === 'color') {
                    // W012: Color metadata in wrong position
                    // It should appear immediately after a ## heading or before the first ## heading
                    // If there's a swimlane but items have already appeared, that's wrong
                    // We'll track this via subSectionHasItems
                    if (currentSwimlane && subSectionHasItems) {
                        issues.push({
                            line: lineNumber,
                            column: 0,
                            endColumn: line.length,
                            severity: 'warning',
                            code: 'W012',
                            message: 'Color metadata appears after items — should be immediately after ## heading',
                            section: 'radar',
                        });
                    }
                }
            }
            continue;
        }

        // ---------- Section-specific line validation ----------
        switch (currentTopSection) {
            case 'radar':
                validateRadarLine(line, trimmed, lineNumber, currentSwimlane, issues);
                if (trimmed.startsWith('- ')) {
                    subSectionHasItems = true;
                    lastSubHeadingHadItems = true;
                }
                break;

            case 'todo':
                validateTodoLine(line, trimmed, lineNumber, todoCurrentSection, todoCurrentItem, issues);
                if (trimmed.match(/^\* \[([ x])\]/)) {
                    todoCurrentItem = true;
                    subSectionHasItems = true;
                    lastSubHeadingHadItems = true;
                } else if (line.startsWith('    ')) {
                    // Indented content
                    lastSubHeadingHadItems = true;
                    validateTodoDueDate(line, lineNumber, issues);
                }
                break;

            case 'goals':
                validateGoalsLine(line, trimmed, lineNumber, goalsCurrentSection, goalsCurrentGoal, goalsCurrentMilestone, issues);
                if (trimmed.match(/^- \[([ x])\]/) && !line.startsWith('    ')) {
                    goalsCurrentGoal = true;
                    goalsCurrentMilestone = false;
                    subSectionHasItems = true;
                    lastSubHeadingHadItems = true;
                } else if (line.startsWith('    ') && !line.startsWith('        ')) {
                    const inner4 = line.slice(4);
                    if (inner4.match(/^- \[([ x])\]/)) {
                        goalsCurrentMilestone = true;
                    }
                    lastSubHeadingHadItems = true;
                    validateGoalsDueDate(line, lineNumber, issues);
                } else if (line.startsWith('        ')) {
                    lastSubHeadingHadItems = true;
                    validateMilestoneDueDate(line, lineNumber, issues);
                }
                break;

            case 'reminders':
                validateRemindersLine(line, trimmed, lineNumber, remindersCurrentMeeting, issues);
                if (trimmed.startsWith('- ')) {
                    lastSubHeadingHadItems = true;
                }
                break;

            case 'quotes':
                // Quotes don't have sub-sections, so any non-blank content counts
                lastSubHeadingHadItems = true;
                break;
        }
    }

    // Check final sub-section for emptiness
    checkEmptySubSection(issues, lastSubHeadingLine, lastSubHeadingName, lastSubHeadingHadItems, currentTopSection);

    // ---------- Pass 2: Cross-reference and aggregate checks ----------
    validateCrossReferences(parseResult, content, issues);
    validateMilestoneWeights(parseResult, content, issues);

    // ---------- Build summary ----------
    const summary = { errors: 0, warnings: 0, info: 0 };
    for (const issue of issues) {
        if (issue.severity === 'error') { summary.errors++; }
        else if (issue.severity === 'warning') { summary.warnings++; }
        else { summary.info++; }
    }

    return { issues, summary };
}

// ---------- Radar Line Validation ----------

function validateRadarLine(
    line: string,
    trimmed: string,
    lineNumber: number,
    currentSwimlane: string | null,
    issues: ValidationIssue[],
): void {
    if (!trimmed.startsWith('- ')) { return; }

    // E003: Item before any swimlane
    if (!currentSwimlane) {
        issues.push({
            line: lineNumber,
            column: 0,
            endColumn: line.length,
            severity: 'error',
            code: 'E003',
            message: 'Radar item found before any ## swimlane heading',
            section: 'radar',
        });
        return;
    }

    const itemMatch = trimmed.match(/^- (\S+) - (.+)$/);
    if (itemMatch) {
        const dateStr = itemMatch[1];
        const date = parseDateMDYY(dateStr);
        if (!date) {
            // E001: Invalid date format
            issues.push({
                line: lineNumber,
                column: line.indexOf(dateStr),
                endColumn: line.indexOf(dateStr) + dateStr.length,
                severity: 'error',
                code: 'E001',
                message: `Invalid date format "${dateStr}" — expected M/D/YY`,
                section: 'radar',
            });
        }
    } else {
        // E002: Malformed radar item syntax
        issues.push({
            line: lineNumber,
            column: 0,
            endColumn: line.length,
            severity: 'error',
            code: 'E002',
            message: 'Malformed radar item — expected format "- M/D/YY - Label"',
            section: 'radar',
        });
    }
}

// ---------- TODO Line Validation ----------

function validateTodoLine(
    line: string,
    trimmed: string,
    lineNumber: number,
    todoCurrentSection: string | null,
    todoCurrentItem: boolean,
    issues: ValidationIssue[],
): void {
    // E004: Malformed checkbox syntax
    // Check for lines that look like they meant to be todos but have bad syntax
    if (trimmed.startsWith('* ')) {
        // Valid: * [ ] text or * [x] text
        const validMatch = trimmed.match(/^\* \[([ x])\] .+$/);
        if (!validMatch) {
            // Check for common typos
            if (trimmed.match(/^\* \[\] /)) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E004',
                    message: 'Malformed TODO checkbox — missing space inside brackets. Use "* [ ] text"',
                    section: 'todo',
                });
            } else if (trimmed.match(/^\* \[X\] /)) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E004',
                    message: 'Malformed TODO checkbox — use lowercase "x". Use "* [x] text"',
                    section: 'todo',
                });
            }
        } else {
            // E005: Todo item before any section heading
            if (!todoCurrentSection) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E005',
                    message: 'TODO item found before any ## section heading',
                    section: 'todo',
                });
            }
        }
    }

    // Check for dash-style checkboxes in TODO section (common mistake)
    if (trimmed.match(/^- \[([ x])\] /) && !line.startsWith('    ')) {
        issues.push({
            line: lineNumber,
            column: 0,
            endColumn: line.length,
            severity: 'error',
            code: 'E004',
            message: 'Wrong checkbox prefix in TODO section — use "* [ ]" not "- [ ]"',
            section: 'todo',
        });
    }

    // W007: Indented content with no parent todo
    if (line.startsWith('    ') && !line.startsWith('## ')) {
        if (!todoCurrentItem && trimmed !== '') {
            issues.push({
                line: lineNumber,
                column: 0,
                endColumn: line.length,
                severity: 'warning',
                code: 'W007',
                message: 'Indented content with no parent TODO item',
                section: 'todo',
            });
        }
    }
}

function validateTodoDueDate(line: string, lineNumber: number, issues: ValidationIssue[]): void {
    if (!line.startsWith('    ')) { return; }
    const trimmed4 = line.slice(4).trim();
    if (!trimmed4.startsWith('Due:')) { return; }

    const dateStr = trimmed4.slice('Due:'.length).trim();
    if (dateStr && !parseDateMDYY(dateStr)) {
        issues.push({
            line: lineNumber,
            column: line.indexOf(dateStr),
            endColumn: line.indexOf(dateStr) + dateStr.length,
            severity: 'warning',
            code: 'W002',
            message: `Invalid TODO due date "${dateStr}" — expected M/D/YY format`,
            section: 'todo',
        });
    }
}

// ---------- Goals Line Validation ----------

function validateGoalsLine(
    line: string,
    trimmed: string,
    lineNumber: number,
    goalsCurrentSection: string | null,
    goalsCurrentGoal: boolean,
    goalsCurrentMilestone: boolean,
    issues: ValidationIssue[],
): void {
    // Root-level goal item (not indented)
    if (trimmed.startsWith('- ') && !line.startsWith('    ')) {
        const validGoal = trimmed.match(/^- \[([ x])\] .+$/);
        if (!validGoal) {
            // E006: Malformed goal checkbox
            if (trimmed.match(/^- \[\] /) || trimmed.match(/^- \[X\] /)) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E006',
                    message: 'Malformed goal checkbox — use "- [ ] text" or "- [x] text"',
                    section: 'goals',
                });
            }
        } else {
            // E008: Goal item before any section heading
            if (!goalsCurrentSection) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'error',
                    code: 'E008',
                    message: 'Goal item found before any ## section heading',
                    section: 'goals',
                });
            }
        }
    }

    // 4-space indented milestone
    if (line.startsWith('    ') && !line.startsWith('        ')) {
        const inner4 = line.slice(4);
        if (inner4.startsWith('- ')) {
            const validMs = inner4.match(/^- \[([ x])\] .+$/);
            if (!validMs) {
                // E007: Malformed milestone checkbox
                if (inner4.match(/^- \[\] /) || inner4.match(/^- \[X\] /)) {
                    issues.push({
                        line: lineNumber,
                        column: 4,
                        endColumn: line.length,
                        severity: 'error',
                        code: 'E007',
                        message: 'Malformed milestone checkbox — use "- [ ] text" or "- [x] text"',
                        section: 'goals',
                    });
                }
            }
        }

        // W008: Indented content with no parent goal
        if (!goalsCurrentGoal && !inner4.trim().startsWith('Due:') && !inner4.trim().startsWith('Completed')) {
            if (inner4.startsWith('- ')) {
                issues.push({
                    line: lineNumber,
                    column: 0,
                    endColumn: line.length,
                    severity: 'warning',
                    code: 'W008',
                    message: 'Indented content with no parent goal',
                    section: 'goals',
                });
            }
        }
    }
}

function validateGoalsDueDate(line: string, lineNumber: number, issues: ValidationIssue[]): void {
    if (!line.startsWith('    ') || line.startsWith('        ')) { return; }
    const trimmed4 = line.slice(4).trim();
    if (!trimmed4.startsWith('Due:')) { return; }

    const dateStr = trimmed4.slice('Due:'.length).trim();
    if (dateStr && !parseDateMDYY(dateStr)) {
        issues.push({
            line: lineNumber,
            column: line.indexOf(dateStr),
            endColumn: line.indexOf(dateStr) + dateStr.length,
            severity: 'warning',
            code: 'W003',
            message: `Invalid goal due date "${dateStr}" — expected M/D/YY format`,
            section: 'goals',
        });
    }
}

function validateMilestoneDueDate(line: string, lineNumber: number, issues: ValidationIssue[]): void {
    if (!line.startsWith('        ')) { return; }
    const inner = line.slice(8).trim();
    if (!inner.startsWith('Due:')) { return; }

    const dateStr = inner.slice('Due:'.length).trim();
    if (dateStr && !parseDateMDYY(dateStr)) {
        issues.push({
            line: lineNumber,
            column: line.indexOf(dateStr),
            endColumn: line.indexOf(dateStr) + dateStr.length,
            severity: 'warning',
            code: 'W003',
            message: `Invalid milestone due date "${dateStr}" — expected M/D/YY format`,
            section: 'goals',
        });
    }
}

// ---------- Reminders Line Validation ----------

function validateRemindersLine(
    line: string,
    trimmed: string,
    lineNumber: number,
    remindersCurrentMeeting: string | null,
    issues: ValidationIssue[],
): void {
    // W009: Talking point without parent meeting
    if (trimmed.startsWith('- ') && !remindersCurrentMeeting) {
        issues.push({
            line: lineNumber,
            column: 0,
            endColumn: line.length,
            severity: 'warning',
            code: 'W009',
            message: 'Talking point found before any ## meeting heading',
            section: 'reminders',
        });
    }
}

// ---------- Empty Section Check (W011) ----------

function checkEmptySubSection(
    issues: ValidationIssue[],
    lastSubHeadingLine: number,
    lastSubHeadingName: string,
    lastSubHeadingHadItems: boolean,
    currentTopSection: CurrentTopSection,
): void {
    if (lastSubHeadingLine > 0 && !lastSubHeadingHadItems) {
        issues.push({
            line: lastSubHeadingLine,
            column: 0,
            endColumn: lastSubHeadingName.length + 3, // "## " + name
            severity: 'warning',
            code: 'W011',
            message: `Empty section "## ${lastSubHeadingName}" — no items found`,
            section: currentTopSection || 'structure',
        });
    }
}

// ---------- Cross-Reference Checks ----------

function validateCrossReferences(
    parseResult: ParseResult,
    content: string,
    issues: ValidationIssue[],
): void {
    const lines = content.split('\n');
    const swimlaneNames = new Set(parseResult.radar.swimlanes.map(s => s.name));

    // W006: Broken radar links in TODOs
    for (const section of parseResult.todo.sections) {
        for (const todo of section.items) {
            if (todo.radarLink && !swimlaneNames.has(todo.radarLink)) {
                // Find the line in the file
                const lineIndex = findLineWithText(lines, `{radar:${todo.radarLink}}`);
                if (lineIndex >= 0) {
                    const line = lines[lineIndex];
                    const col = line.indexOf(`{radar:${todo.radarLink}}`);
                    issues.push({
                        line: lineIndex + 1,
                        column: col >= 0 ? col : 0,
                        endColumn: col >= 0 ? col + `{radar:${todo.radarLink}}`.length : line.length,
                        severity: 'warning',
                        code: 'W006',
                        message: `Broken radar link "{radar:${todo.radarLink}}" — no swimlane with that name`,
                        section: 'todo',
                    });
                }
            }
        }
    }

    // W006: Broken radar links in Goals
    for (const section of parseResult.goals.sections) {
        for (const goal of section.items) {
            if (goal.radarLink && !swimlaneNames.has(goal.radarLink)) {
                const lineIndex = findLineWithText(lines, `{radar:${goal.radarLink}}`);
                if (lineIndex >= 0) {
                    const line = lines[lineIndex];
                    const col = line.indexOf(`{radar:${goal.radarLink}}`);
                    issues.push({
                        line: lineIndex + 1,
                        column: col >= 0 ? col : 0,
                        endColumn: col >= 0 ? col + `{radar:${goal.radarLink}}`.length : line.length,
                        severity: 'warning',
                        code: 'W006',
                        message: `Broken radar link "{radar:${goal.radarLink}}" — no swimlane with that name`,
                        section: 'goals',
                    });
                }
            }
        }
    }
}

function findLineWithText(lines: string[], text: string): number {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(text)) { return i; }
    }
    return -1;
}

// ---------- Milestone Weight Checks ----------

function validateMilestoneWeights(
    parseResult: ParseResult,
    content: string,
    issues: ValidationIssue[],
): void {
    const lines = content.split('\n');

    for (const section of parseResult.goals.sections) {
        for (const goal of section.items) {
            if (goal.milestones.length === 0) { continue; }

            // Find the goal line to use as the issue location
            const goalLineIndex = findLineWithText(lines, goal.text);
            const goalLine = goalLineIndex >= 0 ? goalLineIndex + 1 : 1;

            // Check if milestones have a mix of explicit and auto-distributed weights
            // We need to look at raw content for (N%) patterns
            const weightAnnotations: boolean[] = [];
            for (const ms of goal.milestones) {
                const msLineIndex = findLineWithText(lines, ms.text);
                if (msLineIndex >= 0) {
                    const msLine = lines[msLineIndex];
                    weightAnnotations.push(/\(\d+%\)/.test(msLine));
                } else {
                    weightAnnotations.push(false);
                }
            }

            const hasExplicit = weightAnnotations.some(w => w);
            const hasImplicit = weightAnnotations.some(w => !w);

            // W005: Mixed weighted and unweighted milestones
            if (hasExplicit && hasImplicit) {
                issues.push({
                    line: goalLine,
                    column: 0,
                    endColumn: goalLineIndex >= 0 ? lines[goalLineIndex].length : 0,
                    severity: 'warning',
                    code: 'W005',
                    message: `Goal "${goal.text}" has mixed weighted and unweighted milestones`,
                    section: 'goals',
                });
            }

            // W004: Milestone weights do not sum to 100%
            if (hasExplicit && !hasImplicit) {
                const totalWeight = goal.milestones.reduce((sum, m) => sum + m.weight, 0);
                if (totalWeight !== 100) {
                    issues.push({
                        line: goalLine,
                        column: 0,
                        endColumn: goalLineIndex >= 0 ? lines[goalLineIndex].length : 0,
                        severity: 'warning',
                        code: 'W004',
                        message: `Milestone weights sum to ${totalWeight}%, expected 100% for goal "${goal.text}"`,
                        section: 'goals',
                    });
                }
            }
        }
    }
}
