import * as assert from 'assert';
import { parseIncoming } from '../src/parsers/incomingParser';

suite('Inc0ming Parser', () => {
    const sampleIncoming = `# Radar

## Birthdays
<!-- color: #ff6699 -->
- 3/31/26 - Alex
- 4/15/26 - Steven

## Windows 10 LTSC
- 6/1/26 - EOSL

## jFrog Blocking
### Critical Vulnerabilities
- 4/1/26 - DEV
- 4/20/26 - PROD
### High Vulnerabilities
- 5/1/26 - DEV
- 5/20/25 - PROD

# TODO
## Work
* [ ] 3/10 Presentation {radar:jFrog Blocking}
    - Title
    - Body
    - Closing
* [ ] Execuitive Status Skill

## Personal
* [ ] 2026 Vacation
* [x] Reviews

## Follow up
* [ ] POC for new app`;

    // ---- Radar Section ----

    test('parses swimlanes', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.radar.swimlanes.length, 3);
        assert.strictEqual(result.radar.swimlanes[0].name, 'Birthdays');
        assert.strictEqual(result.radar.swimlanes[1].name, 'Windows 10 LTSC');
        assert.strictEqual(result.radar.swimlanes[2].name, 'jFrog Blocking');
    });

    test('swimlanes have kind and id', () => {
        const result = parseIncoming(sampleIncoming);
        const sw = result.radar.swimlanes[0];
        assert.strictEqual(sw.kind, 'swimlane');
        assert.ok(sw.id.startsWith('sw_'));
    });

    test('parses swimlane color metadata', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.radar.swimlanes[0].color, '#ff6699');
        assert.strictEqual(result.radar.swimlanes[1].color, undefined);
    });

    test('parses direct items', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.radar.swimlanes[0].items.length, 2);
        assert.strictEqual(result.radar.swimlanes[0].items[0].label, 'Alex');
        assert.strictEqual(result.radar.swimlanes[0].items[0].date.getMonth(), 2); // March
        assert.strictEqual(result.radar.swimlanes[0].items[0].date.getDate(), 31);
    });

    test('radar items have kind and id', () => {
        const result = parseIncoming(sampleIncoming);
        const item = result.radar.swimlanes[0].items[0];
        assert.strictEqual(item.kind, 'radarItem');
        assert.ok(item.id.startsWith('ri_'));
    });

    test('parses sub-groups', () => {
        const result = parseIncoming(sampleIncoming);
        const jfrog = result.radar.swimlanes[2];
        assert.strictEqual(jfrog.subGroups.length, 2);
        assert.strictEqual(jfrog.subGroups[0].name, 'Critical Vulnerabilities');
        assert.strictEqual(jfrog.subGroups[0].items.length, 2);
        assert.strictEqual(jfrog.subGroups[1].name, 'High Vulnerabilities');
    });

    test('sub-groups have kind, id, and swimlaneId', () => {
        const result = parseIncoming(sampleIncoming);
        const sg = result.radar.swimlanes[2].subGroups[0];
        assert.strictEqual(sg.kind, 'subgroup');
        assert.ok(sg.id.startsWith('sg_'));
        assert.strictEqual(sg.swimlaneId, result.radar.swimlanes[2].id);
    });

    test('sub-group items have correct data', () => {
        const result = parseIncoming(sampleIncoming);
        const critical = result.radar.swimlanes[2].subGroups[0];
        assert.strictEqual(critical.items[0].label, 'DEV');
        assert.strictEqual(critical.items[0].date.getMonth(), 3); // April
        assert.strictEqual(critical.items[0].date.getDate(), 1);
    });

    test('swimlane direct items count is correct', () => {
        const result = parseIncoming(sampleIncoming);
        // jFrog has no direct items, only sub-group items
        assert.strictEqual(result.radar.swimlanes[2].items.length, 0);
        // Windows 10 LTSC has 1 direct item
        assert.strictEqual(result.radar.swimlanes[1].items.length, 1);
    });

    // ---- Todo Section ----

    test('parses todo sections', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.todo.sections.length, 3);
        assert.strictEqual(result.todo.sections[0].name, 'Work');
        assert.strictEqual(result.todo.sections[1].name, 'Personal');
        assert.strictEqual(result.todo.sections[2].name, 'Follow up');
    });

    test('todo sections have kind and id', () => {
        const result = parseIncoming(sampleIncoming);
        const section = result.todo.sections[0];
        assert.strictEqual(section.kind, 'todoSection');
        assert.ok(section.id.startsWith('ts_'));
    });

    test('parses todo items within sections', () => {
        const result = parseIncoming(sampleIncoming);
        // Work section has 2 items
        assert.strictEqual(result.todo.sections[0].items.length, 2);
        // Personal section has 2 items
        assert.strictEqual(result.todo.sections[1].items.length, 2);
        // Follow up section has 1 item
        assert.strictEqual(result.todo.sections[2].items.length, 1);
    });

    test('todo items have kind and id', () => {
        const result = parseIncoming(sampleIncoming);
        const item = result.todo.sections[0].items[0];
        assert.strictEqual(item.kind, 'todo');
        assert.ok(item.id.startsWith('td_'));
    });

    test('parses unchecked items', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.todo.sections[0].items[0].text, '3/10 Presentation');
        assert.strictEqual(result.todo.sections[0].items[0].completed, false);
    });

    test('parses checked items', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.todo.sections[1].items[1].text, 'Reviews');
        assert.strictEqual(result.todo.sections[1].items[1].completed, true);
    });

    test('parses detail sub-bullets as notes', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.todo.sections[0].items[0].notes, '- Title\n- Body\n- Closing');
    });

    test('items without notes have empty string', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.todo.sections[1].items[0].notes, '');
    });

    test('parses paragraph notes (indented without dash)', () => {
        const input = `# TODO\n## Notes\n* [ ] Policy Reading\n    We recognize accomplishments.\n    Things the org is doing.`;
        const result = parseIncoming(input);
        assert.strictEqual(result.todo.sections[0].items[0].notes, 'We recognize accomplishments.\nThings the org is doing.');
    });

    test('parses mixed paragraph and bullet notes', () => {
        const input = `# TODO\n## Notes\n* [ ] Policy Reading\n    Paragraph text here.\n    - Bullet one\n    - Bullet two\n    More paragraph text.`;
        const result = parseIncoming(input);
        assert.strictEqual(result.todo.sections[0].items[0].notes, 'Paragraph text here.\n- Bullet one\n- Bullet two\nMore paragraph text.');
    });

    test('parses radar cross-reference', () => {
        const result = parseIncoming(sampleIncoming);
        assert.strictEqual(result.todo.sections[0].items[0].radarLink, 'jFrog Blocking');
        assert.strictEqual(result.todo.sections[1].items[0].radarLink, undefined);
    });

    // ---- Items before any section heading ----

    test('items before any section heading are ignored', () => {
        const input = `# TODO\n* [ ] Unsectioned task\n## Later\n* [ ] Sectioned task`;
        const result = parseIncoming(input);
        assert.strictEqual(result.todo.sections.length, 1);
        assert.strictEqual(result.todo.sections[0].name, 'Later');
        assert.strictEqual(result.todo.sections[0].items.length, 1);
        assert.strictEqual(result.todo.sections[0].items[0].text, 'Sectioned task');
    });

    // ---- Error handling ----

    test('handles empty content', () => {
        const result = parseIncoming('');
        assert.strictEqual(result.radar.swimlanes.length, 0);
        assert.strictEqual(result.todo.sections.length, 0);
        assert.strictEqual(result.errors.length, 0);
    });

    test('handles radar-only content', () => {
        const result = parseIncoming('# Radar\n\n## Test\n- 1/1/26 - Item');
        assert.strictEqual(result.radar.swimlanes.length, 1);
        assert.strictEqual(result.todo.sections.length, 0);
    });

    test('handles todo-only content', () => {
        const result = parseIncoming('# TODO\n## Tasks\n* [ ] Test item');
        assert.strictEqual(result.radar.swimlanes.length, 0);
        assert.strictEqual(result.todo.sections.length, 1);
        assert.strictEqual(result.todo.sections[0].items.length, 1);
    });

    test('ignores todo items before any section heading', () => {
        const result = parseIncoming('# TODO\n* [ ] Orphan item');
        assert.strictEqual(result.todo.sections.length, 0);
    });

    test('reports error for invalid date format', () => {
        const result = parseIncoming('# Radar\n\n## Test\n- bad-date - Item');
        assert.strictEqual(result.errors.length, 1);
        assert.ok(result.errors[0].message.includes('M/D/YY'));
    });

    test('reports error for items before swimlane', () => {
        const result = parseIncoming('# Radar\n- 1/1/26 - orphan\n## Test\n- 2/1/26 - Valid');
        assert.ok(result.errors.length > 0);
        assert.strictEqual(result.radar.swimlanes.length, 1);
        assert.strictEqual(result.radar.swimlanes[0].items.length, 1);
    });

    test('preserves unparsed lines', () => {
        const result = parseIncoming('# Radar\n\n## Test\n- bad-date - Item');
        assert.strictEqual(result.unparsedLines.length, 1);
        assert.strictEqual(result.unparsedLines[0].content, '- bad-date - Item');
    });

    // ---- Quotes Section ----

    test('parses quotes with attribution (em dash)', () => {
        const input = `# Quotes\n> Stay hungry, stay foolish. — Steve Jobs\n> Be the change. — Gandhi`;
        const result = parseIncoming(input);
        assert.strictEqual(result.quotes.items.length, 2);
        assert.strictEqual(result.quotes.items[0].text, 'Stay hungry, stay foolish.');
        assert.strictEqual(result.quotes.items[0].attribution, 'Steve Jobs');
        assert.strictEqual(result.quotes.items[1].text, 'Be the change.');
        assert.strictEqual(result.quotes.items[1].attribution, 'Gandhi');
    });

    test('parses quotes without attribution', () => {
        const input = `# Quotes\n> A ship in harbor is safe, but that is not what ships are built for.`;
        const result = parseIncoming(input);
        assert.strictEqual(result.quotes.items.length, 1);
        assert.strictEqual(result.quotes.items[0].text, 'A ship in harbor is safe, but that is not what ships are built for.');
        assert.strictEqual(result.quotes.items[0].attribution, undefined);
    });

    test('handles double dash as alternative to em dash', () => {
        const input = `# Quotes\n> Compound interest is powerful. -- Atomic Habits, Ch. 1`;
        const result = parseIncoming(input);
        assert.strictEqual(result.quotes.items.length, 1);
        assert.strictEqual(result.quotes.items[0].text, 'Compound interest is powerful.');
        assert.strictEqual(result.quotes.items[0].attribution, 'Atomic Habits, Ch. 1');
    });

    test('empty quotes section returns empty array', () => {
        const input = `# Quotes\n\n# Radar\n\n# TODO`;
        const result = parseIncoming(input);
        assert.strictEqual(result.quotes.items.length, 0);
    });

    test('quotes section is independent of section ordering', () => {
        const input = `# TODO\n## Tasks\n* [ ] Task\n\n# Quotes\n> Test quote. — Author\n\n# Radar\n\n## Lane\n- 1/1/26 - Item`;
        const result = parseIncoming(input);
        assert.strictEqual(result.quotes.items.length, 1);
        assert.strictEqual(result.quotes.items[0].text, 'Test quote.');
        assert.strictEqual(result.radar.swimlanes.length, 1);
        assert.strictEqual(result.todo.sections[0].items.length, 1);
    });

    test('quotes have kind and id', () => {
        const input = `# Quotes\n> Hello world.`;
        const result = parseIncoming(input);
        assert.strictEqual(result.quotes.items[0].kind, 'quote');
        assert.ok(result.quotes.items[0].id.startsWith('qt_'));
    });

    // ---- Reminders Section ----

    test('parses reminders with day tags', () => {
        const input = `# Reminders\n\n## Monday Standup (Mon)\n- Blocked on API migration\n- Need to discuss deploy timeline`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings.length, 1);
        assert.strictEqual(result.reminders.meetings[0].name, 'Monday Standup');
        assert.deepStrictEqual(result.reminders.meetings[0].days, ['Mon']);
        assert.strictEqual(result.reminders.meetings[0].points.length, 2);
        assert.strictEqual(result.reminders.meetings[0].points[0].text, 'Blocked on API migration');
    });

    test('parses reminders with multiple days', () => {
        const input = `# Reminders\n\n## 1:1 with Sarah (Wed, Fri)\n- Ask about promotion timeline`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings[0].name, '1:1 with Sarah');
        assert.deepStrictEqual(result.reminders.meetings[0].days, ['Wed', 'Fri']);
        assert.strictEqual(result.reminders.meetings[0].points.length, 1);
    });

    test('parses reminders with no day tags', () => {
        const input = `# Reminders\n\n## Ad Hoc Sync\n- Topic one`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings[0].name, 'Ad Hoc Sync');
        assert.deepStrictEqual(result.reminders.meetings[0].days, []);
        assert.strictEqual(result.reminders.meetings[0].points.length, 1);
    });

    test('parses empty meetings (no points)', () => {
        const input = `# Reminders\n\n## Empty Meeting (Tue)`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings.length, 1);
        assert.strictEqual(result.reminders.meetings[0].points.length, 0);
    });

    test('reminder meetings have kind and id', () => {
        const input = `# Reminders\n\n## Standup (Mon)\n- Item`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings[0].kind, 'reminderMeeting');
        assert.ok(result.reminders.meetings[0].id.startsWith('rm_'));
    });

    test('reminder points have kind and id', () => {
        const input = `# Reminders\n\n## Standup (Mon)\n- Item`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings[0].points[0].kind, 'reminderPoint');
        assert.ok(result.reminders.meetings[0].points[0].id.startsWith('rp_'));
    });

    test('reminders section is independent of section ordering', () => {
        const input = `# TODO\n## Tasks\n* [ ] Task\n\n# Reminders\n\n## Standup (Mon)\n- Item\n\n# Radar\n\n## Lane\n- 1/1/26 - Item`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings.length, 1);
        assert.strictEqual(result.radar.swimlanes.length, 1);
        assert.strictEqual(result.todo.sections[0].items.length, 1);
    });

    test('empty reminders section returns empty meetings array', () => {
        const input = `# Reminders\n\n# Radar\n\n# TODO`;
        const result = parseIncoming(input);
        assert.strictEqual(result.reminders.meetings.length, 0);
    });

    // ---- Goals Section ----

    test('parses goal sections with ## heading', () => {
        const input = `# Goals\n\n## Q2 2026\n- [ ] Complete AWS Certification\n    - [ ] Module 5 (50%)\n    - [ ] Module 6 (50%)\n\n## Personal\n- [ ] Read 6 books`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections.length, 2);
        assert.strictEqual(result.goals.sections[0].name, 'Q2 2026');
        assert.strictEqual(result.goals.sections[1].name, 'Personal');
    });

    test('parses goal items (checked/unchecked)', () => {
        const input = `# Goals\n\n## Work\n- [ ] Goal one\n- [x] Goal two`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items.length, 2);
        assert.strictEqual(result.goals.sections[0].items[0].completed, false);
        assert.strictEqual(result.goals.sections[0].items[0].text, 'Goal one');
        assert.strictEqual(result.goals.sections[0].items[1].completed, true);
        assert.strictEqual(result.goals.sections[0].items[1].text, 'Goal two');
    });

    test('parses milestones with weights (N%)', () => {
        const input = `# Goals\n\n## Work\n- [ ] Big goal\n    - [x] Step A (30%)\n    - [ ] Step B (70%)`;
        const result = parseIncoming(input);
        const goal = result.goals.sections[0].items[0];
        assert.strictEqual(goal.milestones.length, 2);
        assert.strictEqual(goal.milestones[0].text, 'Step A');
        assert.strictEqual(goal.milestones[0].weight, 30);
        assert.strictEqual(goal.milestones[0].completed, true);
        assert.strictEqual(goal.milestones[1].text, 'Step B');
        assert.strictEqual(goal.milestones[1].weight, 70);
        assert.strictEqual(goal.milestones[1].completed, false);
    });

    test('parses milestones without weights (equal distribution)', () => {
        const input = `# Goals\n\n## Work\n- [ ] Goal\n    - [ ] A\n    - [ ] B\n    - [ ] C`;
        const result = parseIncoming(input);
        const milestones = result.goals.sections[0].items[0].milestones;
        assert.strictEqual(milestones.length, 3);
        assert.strictEqual(milestones[0].weight, 34);
        assert.strictEqual(milestones[1].weight, 33);
        assert.strictEqual(milestones[2].weight, 33);
    });

    test('parses goal completion notes', () => {
        const input = `# Goals\n\n## Work\n- [x] Ship phase 1\n    Completed 4/8/26 — two days ahead`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items[0].completionNote, '4/8/26 — two days ahead');
    });

    test('parses milestone completion notes', () => {
        const input = `# Goals\n\n## Work\n- [ ] Goal\n    - [x] Step A (50%)\n        Completed 3/1 — passed practice exam\n    - [ ] Step B (50%)`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items[0].milestones[0].completionNote, '3/1 — passed practice exam');
        assert.strictEqual(result.goals.sections[0].items[0].milestones[1].completionNote, '');
    });

    test('parses {radar:Name} cross-references on goals', () => {
        const input = `# Goals\n\n## Work\n- [ ] Complete cert {radar:Certifications}\n- [ ] Other goal`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items[0].radarLink, 'Certifications');
        assert.strictEqual(result.goals.sections[0].items[0].text, 'Complete cert');
        assert.strictEqual(result.goals.sections[0].items[1].radarLink, undefined);
    });

    test('goal sections have kind and id (gs_, gl_, ms_)', () => {
        const input = `# Goals\n\n## Work\n- [ ] Goal\n    - [ ] Milestone (100%)`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].kind, 'goalSection');
        assert.ok(result.goals.sections[0].id.startsWith('gs_'));
        assert.strictEqual(result.goals.sections[0].items[0].kind, 'goal');
        assert.ok(result.goals.sections[0].items[0].id.startsWith('gl_'));
        assert.strictEqual(result.goals.sections[0].items[0].milestones[0].kind, 'milestone');
        assert.ok(result.goals.sections[0].items[0].milestones[0].id.startsWith('ms_'));
    });

    test('empty goals section returns empty', () => {
        const input = `# Goals\n\n# Radar\n\n# TODO`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections.length, 0);
    });

    test('goals section is independent of section ordering', () => {
        const input = `# TODO\n## Tasks\n* [ ] Task\n\n# Goals\n\n## Work\n- [ ] Goal\n\n# Radar\n\n## Lane\n- 1/1/26 - Item`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections.length, 1);
        assert.strictEqual(result.goals.sections[0].items.length, 1);
        assert.strictEqual(result.radar.swimlanes.length, 1);
        assert.strictEqual(result.todo.sections[0].items.length, 1);
    });

    test('handles goals with no milestones', () => {
        const input = `# Goals\n\n## Work\n- [ ] Simple goal\n- [x] Done goal`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items[0].milestones.length, 0);
        assert.strictEqual(result.goals.sections[0].items[1].milestones.length, 0);
    });

    // ---- Due Date Section ----

    test('parses Due: on goals (4-space indent)', () => {
        const input = `# Goals\n\n## Work\n- [ ] Complete cert\n    Due: 5/15/26`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items[0].dueDate, '5/15/26');
    });

    test('parses Due: on milestones (8-space indent)', () => {
        const input = `# Goals\n\n## Work\n- [ ] Goal\n    - [ ] Step A (50%)\n        Due: 5/1/26\n    - [ ] Step B (50%)`;
        const result = parseIncoming(input);
        assert.strictEqual(result.goals.sections[0].items[0].milestones[0].dueDate, '5/1/26');
        assert.strictEqual(result.goals.sections[0].items[0].milestones[1].dueDate, '');
    });

    // ---- Todo Due Date ----

    test('parses todo Due: line', () => {
        const input = `# TODO\n## Tasks\n* [ ] Finish report\n    Due: 4/1/26`;
        const result = parseIncoming(input);
        assert.strictEqual(result.todo.sections[0].items[0].dueDate, '4/1/26');
    });

    test('todo dueDate defaults to empty string', () => {
        const input = `# TODO\n## Tasks\n* [ ] Simple task`;
        const result = parseIncoming(input);
        assert.strictEqual(result.todo.sections[0].items[0].dueDate, '');
    });

    test('todo Due: line does not end up in notes', () => {
        const input = `# TODO\n## Tasks\n* [ ] Task\n    Due: 4/1/26\n    - Note one`;
        const result = parseIncoming(input);
        assert.strictEqual(result.todo.sections[0].items[0].dueDate, '4/1/26');
        assert.strictEqual(result.todo.sections[0].items[0].notes, '- Note one');
    });

    // ---- ID reset ----

    test('IDs are unique and reset between parses', () => {
        const result1 = parseIncoming(sampleIncoming);
        const result2 = parseIncoming(sampleIncoming);
        // After reset, IDs should be the same between parses
        assert.strictEqual(result1.radar.swimlanes[0].id, result2.radar.swimlanes[0].id);
    });
});
