import * as assert from 'assert';
import { parseIncoming } from '../src/parsers/incomingParser';
import { serializeIncoming } from '../src/serializers/incomingSerializer';

suite('Inc0ming Serializer', () => {
    test('round-trips basic radar + todo', () => {
        const input = `# Radar

## Birthdays
- 3/31/26 - Alex
- 4/15/26 - Steven

## Windows 10 LTSC
- 6/1/26 - EOSL

# TODO
## Tasks
* [ ] Task one
* [x] Done task
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.radar.swimlanes.length, 2);
        assert.strictEqual(reparsed.radar.swimlanes[0].name, 'Birthdays');
        assert.strictEqual(reparsed.radar.swimlanes[0].items.length, 2);
        assert.strictEqual(reparsed.todo.sections.length, 1);
        assert.strictEqual(reparsed.todo.sections[0].items.length, 2);
        assert.strictEqual(reparsed.todo.sections[0].items[1].completed, true);
    });

    test('round-trips weekly radar items', () => {
        const input = `# Radar

## Meetings
- Standup (Mon, Wed, Fri)
    - Blocked on API
    - Need deploy window

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.radar.swimlanes[0].items.length, 1);
        const item = reparsed.radar.swimlanes[0].items[0];
        assert.strictEqual(item.label, 'Standup');
        assert.ok(item.recurrence);
        assert.strictEqual(item.recurrence!.type, 'weekly');
        if (item.recurrence!.type === 'weekly') {
            assert.deepStrictEqual(item.recurrence!.days, ['Mon', 'Wed', 'Fri']);
        }
        assert.strictEqual(item.subItems.length, 2);
        assert.strictEqual(item.subItems[0].text, 'Blocked on API');
    });

    test('round-trips yearly radar items', () => {
        const input = `# Radar

## Birthdays
- Steven (4/15)
- Jordan (7/22)

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.radar.swimlanes[0].items.length, 2);
        const item = reparsed.radar.swimlanes[0].items[0];
        assert.strictEqual(item.label, 'Steven');
        assert.ok(item.recurrence);
        assert.strictEqual(item.recurrence!.type, 'yearly');
        if (item.recurrence!.type === 'yearly') {
            assert.strictEqual(item.recurrence!.month, 4);
            assert.strictEqual(item.recurrence!.day, 15);
        }
    });

    test('round-trips mixed item types with sub-items', () => {
        const input = `# Radar

## Work
- 3/15/26 - Deploy
    - Confirm rollback plan
- Standup (Mon, Wed)
    - Blocked on API
- Birthday (4/15)

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.radar.swimlanes[0].items.length, 3);
        assert.ok(reparsed.radar.swimlanes[0].items[0].date);
        assert.strictEqual(reparsed.radar.swimlanes[0].items[0].subItems.length, 1);
        assert.ok(reparsed.radar.swimlanes[0].items[1].recurrence);
        assert.strictEqual(reparsed.radar.swimlanes[0].items[1].recurrence!.type, 'weekly');
        assert.strictEqual(reparsed.radar.swimlanes[0].items[1].subItems.length, 1);
        assert.ok(reparsed.radar.swimlanes[0].items[2].recurrence);
        assert.strictEqual(reparsed.radar.swimlanes[0].items[2].recurrence!.type, 'yearly');
    });

    test('preserves color metadata', () => {
        const input = `# Radar

## Team
<!-- color: #ff6699 -->
- 1/1/26 - Item

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);

        assert.ok(output.includes('<!-- color: #ff6699 -->'));
    });

    test('preserves sub-groups', () => {
        const input = `# Radar

## Project
### Phase 1
- 1/1/26 - Start
### Phase 2
- 6/1/26 - End

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.radar.swimlanes[0].subGroups.length, 2);
        assert.strictEqual(reparsed.radar.swimlanes[0].subGroups[0].name, 'Phase 1');
        assert.strictEqual(reparsed.radar.swimlanes[0].subGroups[1].name, 'Phase 2');
    });

    test('preserves todo notes (bullets)', () => {
        const input = `# Radar

# TODO
## Tasks
* [ ] Big task
    - Step 1
    - Step 2
    - Step 3
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.todo.sections[0].items[0].notes, '- Step 1\n- Step 2\n- Step 3');
    });

    test('round-trips mixed notes (paragraphs and bullets)', () => {
        const input = `# Radar

# TODO
## Tasks
* [ ] Policy Reading
    We recognize accomplishments.
    - Small things for your people
    - Recognizing teams
    Things the org is doing.
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.todo.sections[0].items[0].notes,
            'We recognize accomplishments.\n- Small things for your people\n- Recognizing teams\nThings the org is doing.');
    });

    test('preserves radar link cross-references', () => {
        const input = `# Radar

## Project
- 1/1/26 - Deadline

# TODO
## Tasks
* [ ] Prepare {radar:Project}
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);

        assert.ok(output.includes('{radar:Project}'));

        const reparsed = parseIncoming(output);
        assert.strictEqual(reparsed.todo.sections[0].items[0].radarLink, 'Project');
    });

    test('handles empty data', () => {
        const output = serializeIncoming(
            { swimlanes: [] },
            { sections: [] },
            []
        );
        assert.ok(output.includes('# Radar'));
        assert.ok(output.includes('# TODO'));
    });

    test('round-trips todo sections', () => {
        const input = `# Radar

# TODO
## Work
* [ ] Presentation
    - Title
    - Body
* [ ] Status Update

## Personal
* [ ] Vacation
* [x] Reviews

## Follow up
* [ ] POC
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.todo.sections.length, 3);
        assert.strictEqual(reparsed.todo.sections[0].name, 'Work');
        assert.strictEqual(reparsed.todo.sections[0].items.length, 2);
        assert.strictEqual(reparsed.todo.sections[0].items[0].notes, '- Title\n- Body');
        assert.strictEqual(reparsed.todo.sections[1].name, 'Personal');
        assert.strictEqual(reparsed.todo.sections[1].items.length, 2);
        assert.strictEqual(reparsed.todo.sections[1].items[1].completed, true);
        assert.strictEqual(reparsed.todo.sections[2].name, 'Follow up');
        assert.strictEqual(reparsed.todo.sections[2].items.length, 1);
    });

    test('round-trips quotes section', () => {
        const input = `# Radar

## Lane
- 1/1/26 - Item

# Quotes
> Stay hungry, stay foolish. — Steve Jobs
> A ship in harbor is safe, but that is not what ships are built for.

# TODO
## Tasks
* [ ] Task
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.quotes.items.length, 2);
        assert.strictEqual(reparsed.quotes.items[0].text, 'Stay hungry, stay foolish.');
        assert.strictEqual(reparsed.quotes.items[0].attribution, 'Steve Jobs');
        assert.strictEqual(reparsed.quotes.items[1].text, 'A ship in harbor is safe, but that is not what ships are built for.');
        assert.strictEqual(reparsed.quotes.items[1].attribution, undefined);
        // Radar and todo still intact
        assert.strictEqual(reparsed.radar.swimlanes.length, 1);
        assert.strictEqual(reparsed.todo.sections[0].items.length, 1);
    });


    // ---- Goals Section ----

    test('round-trips goal sections', () => {
        const input = `# Radar

## Lane
- 1/1/26 - Item

# Goals

## Q2 2026
- [ ] Complete AWS Certification
    Due: 5/15/26
    - [x] Module 5 (30%)
        Completed 3/1 — passed practice exam
    - [ ] Module 6 (70%)

## Personal
- [x] Ship phase 1
    Completed 4/8/26 — two days ahead

# TODO
## Tasks
* [ ] Task
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.goals.sections.length, 2);
        assert.strictEqual(reparsed.goals.sections[0].name, 'Q2 2026');
        assert.strictEqual(reparsed.goals.sections[0].items.length, 1);
        assert.strictEqual(reparsed.goals.sections[0].items[0].text, 'Complete AWS Certification');
        assert.strictEqual(reparsed.goals.sections[0].items[0].completed, false);
        assert.strictEqual(reparsed.goals.sections[1].name, 'Personal');
        assert.strictEqual(reparsed.goals.sections[1].items[0].completed, true);
        // Radar and todo still intact
        assert.strictEqual(reparsed.radar.swimlanes.length, 1);
        assert.strictEqual(reparsed.todo.sections[0].items.length, 1);
    });

    test('preserves milestone weights', () => {
        const input = `# Radar

# Goals

## Work
- [ ] Goal
    - [x] Step A (30%)
    - [ ] Step B (70%)

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.goals.sections[0].items[0].milestones[0].weight, 30);
        assert.strictEqual(reparsed.goals.sections[0].items[0].milestones[1].weight, 70);
    });

    test('preserves goal completion notes', () => {
        const input = `# Radar

# Goals

## Work
- [x] Ship phase 1
    Completed 4/8/26 — two days ahead

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.goals.sections[0].items[0].completionNote, '4/8/26 — two days ahead');
    });

    test('preserves goal radar links', () => {
        const input = `# Radar

# Goals

## Work
- [ ] Complete cert {radar:Certifications}

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);

        assert.ok(output.includes('{radar:Certifications}'));

        const reparsed = parseIncoming(output);
        assert.strictEqual(reparsed.goals.sections[0].items[0].radarLink, 'Certifications');
    });

    test('handles empty goals data', () => {
        const output = serializeIncoming(
            { swimlanes: [] },
            { sections: [] },
            [],
            { items: [] },
            { sections: [] }
        );
        assert.ok(!output.includes('# Goals'));
    });

    test('omits goals section when no sections exist', () => {
        const output = serializeIncoming(
            { swimlanes: [] },
            { sections: [] },
            [],
            { items: [] },
            { sections: [] }
        );
        assert.ok(!output.includes('# Goals'));
        assert.ok(output.includes('# Radar'));
        assert.ok(output.includes('# TODO'));
    });

    test('preserves milestone completion notes', () => {
        const input = `# Radar

# Goals

## Work
- [ ] Goal
    - [x] Step A (50%)
        Completed 3/1 — passed
    - [ ] Step B (50%)

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.goals.sections[0].items[0].milestones[0].completionNote, '3/1 — passed');
    });

    // ---- Due Date Section ----

    test('round-trips goal due dates', () => {
        const input = `# Radar

# Goals

## Work
- [ ] Get cert
    Due: 5/15/26

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.goals.sections[0].items[0].dueDate, '5/15/26');
    });

    test('round-trips milestone due dates', () => {
        const input = `# Radar

# Goals

## Work
- [ ] Goal
    - [ ] Step A (50%)
        Due: 5/1/26
    - [ ] Step B (50%)

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.goals.sections[0].items[0].milestones[0].dueDate, '5/1/26');
        assert.strictEqual(reparsed.goals.sections[0].items[0].milestones[1].dueDate, '');
    });

    test('omits Due line when dueDate is empty', () => {
        const input = `# Radar

# Goals

## Work
- [ ] Simple goal

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);

        assert.ok(!output.includes('Due:'));
    });

    test('round-trips todo due dates', () => {
        const input = `# Radar

# TODO
## Tasks
* [ ] Finish report
    Due: 4/1/26
* [ ] Simple task
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.todo.sections[0].items[0].dueDate, '4/1/26');
        assert.strictEqual(reparsed.todo.sections[0].items[1].dueDate, '');
    });

    test('todo due date appears before notes in output', () => {
        const input = `# Radar

# TODO
## Tasks
* [ ] Task with both
    Due: 4/1/26
    - Note one
    - Note two
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.goals);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.todo.sections[0].items[0].dueDate, '4/1/26');
        assert.strictEqual(reparsed.todo.sections[0].items[0].notes, '- Note one\n- Note two');
    });

    test('all sections get ## headings', () => {
        const input = `# Radar

# TODO
## Later
* [ ] Sectioned
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);

        const todoIdx = output.indexOf('# TODO');
        const todoContent = output.slice(todoIdx);
        assert.ok(todoContent.includes('## Later'));
        assert.ok(todoContent.includes('* [ ] Sectioned'));
    });
});
