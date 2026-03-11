import * as assert from 'assert';
import { parseIncoming } from '../src/parsers/incomingParser';
import { validateFile } from '../src/services/fileValidator';
import { ValidationResult } from '../src/models/types';

function validate(content: string): ValidationResult {
    const parseResult = parseIncoming(content);
    return validateFile(content, parseResult);
}

function findIssue(result: ValidationResult, code: string) {
    return result.issues.find(i => i.code === code);
}

function findAllIssues(result: ValidationResult, code: string) {
    return result.issues.filter(i => i.code === code);
}

suite('FileValidator', () => {

    // ---- Clean file produces no issues ----

    test('clean file with all sections produces no issues', () => {
        const content = `# Radar

## Birthdays
<!-- color: #ff6699 -->
- 3/31/26 - Alex
- 4/15/26 - Steven

## Work
- 6/1/26 - Deadline

# TODO
## Work
* [ ] Task one
* [x] Task two

# Quotes
> Stay hungry, stay foolish. — Steve Jobs

# Reminders
## Standup (Mon, Wed, Fri)
- Item one
- Item two

# Goals
## Q2 2026
- [ ] Complete cert
    - [ ] Step A (50%)
    - [ ] Step B (50%)`;

        const result = validate(content);
        assert.strictEqual(result.summary.errors, 0);
        assert.strictEqual(result.summary.warnings, 0);
    });

    test('empty file produces no issues', () => {
        const result = validate('');
        assert.strictEqual(result.issues.length, 0);
    });

    // ---- E001: Invalid radar date format ----

    test('E001 - invalid date format on radar item', () => {
        const content = `# Radar\n\n## Test\n- bad-date - Item`;
        const result = validate(content);
        const issue = findIssue(result, 'E001');
        assert.ok(issue, 'Expected E001 issue');
        assert.strictEqual(issue!.severity, 'error');
        assert.ok(issue!.message.includes('bad-date'));
    });

    // ---- E002: Malformed radar item syntax ----

    test('E002 - malformed radar item syntax', () => {
        const content = `# Radar\n\n## Test\n- just some text`;
        const result = validate(content);
        const issue = findIssue(result, 'E002');
        assert.ok(issue, 'Expected E002 issue');
        assert.strictEqual(issue!.severity, 'error');
    });

    // ---- E003: Orphaned radar item ----

    test('E003 - radar item before any swimlane', () => {
        const content = `# Radar\n- 1/1/26 - orphan\n## Test\n- 2/1/26 - Valid`;
        const result = validate(content);
        const issue = findIssue(result, 'E003');
        assert.ok(issue, 'Expected E003 issue');
        assert.strictEqual(issue!.severity, 'error');
    });

    // ---- E004: Malformed TODO checkbox ----

    test('E004 - missing space in TODO checkbox', () => {
        const content = `# TODO\n## Work\n* [] Task`;
        const result = validate(content);
        const issue = findIssue(result, 'E004');
        assert.ok(issue, 'Expected E004 issue');
        assert.strictEqual(issue!.severity, 'error');
        assert.ok(issue!.message.includes('missing space'));
    });

    test('E004 - capital X in TODO checkbox', () => {
        const content = `# TODO\n## Work\n* [X] Task`;
        const result = validate(content);
        const issue = findIssue(result, 'E004');
        assert.ok(issue, 'Expected E004 issue');
        assert.strictEqual(issue!.severity, 'error');
        assert.ok(issue!.message.includes('lowercase'));
    });

    test('E004 - dash checkbox in TODO section', () => {
        const content = `# TODO\n## Work\n- [ ] Task`;
        const result = validate(content);
        const issue = findIssue(result, 'E004');
        assert.ok(issue, 'Expected E004 issue');
        assert.strictEqual(issue!.severity, 'error');
        assert.ok(issue!.message.includes('Wrong checkbox prefix'));
    });

    // ---- E005: TODO item before section heading ----

    test('E005 - todo item before any section heading', () => {
        const content = `# TODO\n* [ ] Orphan task\n## Later\n* [ ] Real task`;
        const result = validate(content);
        const issue = findIssue(result, 'E005');
        assert.ok(issue, 'Expected E005 issue');
        assert.strictEqual(issue!.severity, 'error');
    });

    // ---- E006: Malformed goal checkbox ----

    test('E006 - malformed goal checkbox (missing space)', () => {
        const content = `# Goals\n## Work\n- [] Goal text`;
        const result = validate(content);
        const issue = findIssue(result, 'E006');
        assert.ok(issue, 'Expected E006 issue');
        assert.strictEqual(issue!.severity, 'error');
    });

    // ---- E007: Malformed milestone checkbox ----

    test('E007 - malformed milestone checkbox (capital X)', () => {
        const content = `# Goals\n## Work\n- [ ] Goal\n    - [X] Milestone`;
        const result = validate(content);
        const issue = findIssue(result, 'E007');
        assert.ok(issue, 'Expected E007 issue');
        assert.strictEqual(issue!.severity, 'error');
    });

    // ---- E008: Goal item before section heading ----

    test('E008 - goal item before any section heading', () => {
        const content = `# Goals\n- [ ] Orphan goal\n## Work\n- [ ] Real goal`;
        const result = validate(content);
        const issue = findIssue(result, 'E008');
        assert.ok(issue, 'Expected E008 issue');
        assert.strictEqual(issue!.severity, 'error');
    });

    // ---- E009: Duplicate top-level section heading ----

    test('E009 - duplicate top-level heading', () => {
        const content = `# Radar\n\n## Test\n- 1/1/26 - Item\n\n# Radar\n\n## Other\n- 2/1/26 - Item2`;
        const result = validate(content);
        const issue = findIssue(result, 'E009');
        assert.ok(issue, 'Expected E009 issue');
        assert.strictEqual(issue!.severity, 'error');
        assert.ok(issue!.message.includes('Duplicate'));
    });

    // ---- E010: Unknown top-level heading ----

    test('E010 - unknown top-level heading', () => {
        const content = `# Radar\n\n## Test\n- 1/1/26 - Item\n\n# CustomSection\nSome content`;
        const result = validate(content);
        const issue = findIssue(result, 'E010');
        assert.ok(issue, 'Expected E010 issue');
        assert.strictEqual(issue!.severity, 'error');
        assert.ok(issue!.message.includes('Unknown'));
    });

    // ---- W001: Sub-group without parent swimlane ----

    test('W001 - sub-group without parent swimlane', () => {
        const content = `# Radar\n### Orphan Sub\n- 1/1/26 - Item\n## Lane\n- 2/1/26 - Item2`;
        const result = validate(content);
        const issue = findIssue(result, 'W001');
        assert.ok(issue, 'Expected W001 issue');
        assert.strictEqual(issue!.severity, 'warning');
    });

    // ---- W002: Invalid TODO due date ----

    test('W002 - invalid todo due date', () => {
        const content = `# TODO\n## Work\n* [ ] Task\n    Due: 2026-03-15`;
        const result = validate(content);
        const issue = findIssue(result, 'W002');
        assert.ok(issue, 'Expected W002 issue');
        assert.strictEqual(issue!.severity, 'warning');
        assert.ok(issue!.message.includes('2026-03-15'));
    });

    test('W002 - valid todo due date produces no W002', () => {
        const content = `# TODO\n## Work\n* [ ] Task\n    Due: 3/15/26`;
        const result = validate(content);
        const issue = findIssue(result, 'W002');
        assert.strictEqual(issue, undefined);
    });

    // ---- W003: Invalid goal due date ----

    test('W003 - invalid goal due date', () => {
        const content = `# Goals\n## Work\n- [ ] Goal\n    Due: 03-15-2026`;
        const result = validate(content);
        const issue = findIssue(result, 'W003');
        assert.ok(issue, 'Expected W003 issue');
        assert.strictEqual(issue!.severity, 'warning');
    });

    test('W003 - invalid milestone due date', () => {
        const content = `# Goals\n## Work\n- [ ] Goal\n    - [ ] Milestone (100%)\n        Due: bad-date`;
        const result = validate(content);
        const issue = findIssue(result, 'W003');
        assert.ok(issue, 'Expected W003 issue');
        assert.strictEqual(issue!.severity, 'warning');
    });

    // ---- W004: Milestone weights not summing to 100% ----

    test('W004 - milestone weights do not sum to 100%', () => {
        const content = `# Goals\n## Work\n- [ ] Goal\n    - [ ] Step A (30%)\n    - [ ] Step B (40%)`;
        const result = validate(content);
        const issue = findIssue(result, 'W004');
        assert.ok(issue, 'Expected W004 issue');
        assert.strictEqual(issue!.severity, 'warning');
        assert.ok(issue!.message.includes('70%'));
    });

    test('W004 - weights summing to 100% produce no W004', () => {
        const content = `# Goals\n## Work\n- [ ] Goal\n    - [ ] Step A (60%)\n    - [ ] Step B (40%)`;
        const result = validate(content);
        const issue = findIssue(result, 'W004');
        assert.strictEqual(issue, undefined);
    });

    // ---- W005: Mixed weighted and unweighted milestones ----

    test('W005 - mixed weighted and unweighted milestones', () => {
        const content = `# Goals\n## Work\n- [ ] Goal\n    - [ ] Step A (50%)\n    - [ ] Step B`;
        const result = validate(content);
        const issue = findIssue(result, 'W005');
        assert.ok(issue, 'Expected W005 issue');
        assert.strictEqual(issue!.severity, 'warning');
    });

    // ---- W006: Broken radar link ----

    test('W006 - broken radar link in TODO', () => {
        const content = `# Radar\n\n## Birthdays\n- 3/31/26 - Alex\n\n# TODO\n## Work\n* [ ] Task {radar:NonExistent}`;
        const result = validate(content);
        const issue = findIssue(result, 'W006');
        assert.ok(issue, 'Expected W006 issue');
        assert.strictEqual(issue!.severity, 'warning');
        assert.ok(issue!.message.includes('NonExistent'));
    });

    test('W006 - broken radar link in Goals', () => {
        const content = `# Radar\n\n## Birthdays\n- 3/31/26 - Alex\n\n# Goals\n## Work\n- [ ] Goal {radar:FakeLane}`;
        const result = validate(content);
        const issue = findIssue(result, 'W006');
        assert.ok(issue, 'Expected W006 issue');
        assert.ok(issue!.message.includes('FakeLane'));
    });

    test('W006 - valid radar link produces no W006', () => {
        const content = `# Radar\n\n## Work\n- 3/31/26 - Deadline\n\n# TODO\n## Tasks\n* [ ] Task {radar:Work}`;
        const result = validate(content);
        const issue = findIssue(result, 'W006');
        assert.strictEqual(issue, undefined);
    });

    // ---- W009: Talking point without parent meeting ----

    test('W009 - talking point before any meeting heading', () => {
        const content = `# Reminders\n- Orphan point\n## Standup (Mon)\n- Real point`;
        const result = validate(content);
        const issue = findIssue(result, 'W009');
        assert.ok(issue, 'Expected W009 issue');
        assert.strictEqual(issue!.severity, 'warning');
    });

    // ---- W011: Empty section ----

    test('W011 - empty section with no items', () => {
        const content = `# Reminders\n## Empty Meeting (Tue)\n## Full Meeting (Wed)\n- Point one`;
        const result = validate(content);
        const issue = findIssue(result, 'W011');
        assert.ok(issue, 'Expected W011 issue');
        assert.strictEqual(issue!.severity, 'warning');
        assert.ok(issue!.message.includes('Empty Meeting'));
    });

    // ---- W012: Color metadata in wrong position ----

    test('W012 - color metadata after items', () => {
        const content = `# Radar\n\n## Test\n- 1/1/26 - Item\n<!-- color: #ff0000 -->`;
        const result = validate(content);
        const issue = findIssue(result, 'W012');
        assert.ok(issue, 'Expected W012 issue');
        assert.strictEqual(issue!.severity, 'warning');
    });

    // ---- Summary counts ----

    test('summary counts errors, warnings, and info correctly', () => {
        const content = `# Radar\n- 1/1/26 - orphan\n## Test\n- bad-date - Item`;
        const result = validate(content);
        // E003 for orphan, E001 for bad-date
        assert.ok(result.summary.errors >= 2);
        assert.strictEqual(result.summary.errors + result.summary.warnings + result.summary.info, result.issues.length);
    });

    // ---- Line number accuracy ----

    test('issues report correct 1-based line numbers', () => {
        const content = `# Radar\n\n## Test\n- bad-date - Item`;
        // Line 4 has the bad date
        const result = validate(content);
        const issue = findIssue(result, 'E001');
        assert.ok(issue, 'Expected E001');
        assert.strictEqual(issue!.line, 4);
    });

    test('E009 reports correct line for duplicate heading', () => {
        const content = `# TODO\n## Work\n* [ ] Task\n\n# TODO\n## Other\n* [ ] Task2`;
        const result = validate(content);
        const issue = findIssue(result, 'E009');
        assert.ok(issue, 'Expected E009');
        assert.strictEqual(issue!.line, 5); // Second # TODO is on line 5
    });

    // ---- Multiple issues can coexist ----

    test('multiple different issues are all reported', () => {
        const content = `# Radar\n- 1/1/26 - orphan\n## Test\n- bad-date - Item\n\n# TODO\n* [ ] Orphan\n## Work\n* [] Bad checkbox`;
        const result = validate(content);
        assert.ok(findIssue(result, 'E003'), 'Expected E003');
        assert.ok(findIssue(result, 'E001'), 'Expected E001');
        assert.ok(findIssue(result, 'E005'), 'Expected E005');
        assert.ok(findIssue(result, 'E004'), 'Expected E004');
    });

    // ---- Bookmarks section is recognized ----

    test('Bookmarks is a recognized top-level heading', () => {
        const content = `# Bookmarks\n## Dev Tools\n- [GitHub](https://github.com)`;
        const result = validate(content);
        const issue = findIssue(result, 'E010');
        assert.strictEqual(issue, undefined, 'Bookmarks should be recognized');
    });
});
