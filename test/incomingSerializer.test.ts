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
* [ ] Task one
* [x] Done task
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.radar.swimlanes.length, 2);
        assert.strictEqual(reparsed.radar.swimlanes[0].name, 'Birthdays');
        assert.strictEqual(reparsed.radar.swimlanes[0].items.length, 2);
        // Default section with 2 items
        assert.strictEqual(reparsed.todo.sections.length, 1);
        assert.strictEqual(reparsed.todo.sections[0].items.length, 2);
        assert.strictEqual(reparsed.todo.sections[0].items[1].completed, true);
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

        // Default (empty) + 3 named sections
        assert.strictEqual(reparsed.todo.sections.length, 4);
        assert.strictEqual(reparsed.todo.sections[0].name, '');
        assert.strictEqual(reparsed.todo.sections[0].items.length, 0);
        assert.strictEqual(reparsed.todo.sections[1].name, 'Work');
        assert.strictEqual(reparsed.todo.sections[1].items.length, 2);
        assert.strictEqual(reparsed.todo.sections[1].items[0].notes, '- Title\n- Body');
        assert.strictEqual(reparsed.todo.sections[2].name, 'Personal');
        assert.strictEqual(reparsed.todo.sections[2].items.length, 2);
        assert.strictEqual(reparsed.todo.sections[2].items[1].completed, true);
        assert.strictEqual(reparsed.todo.sections[3].name, 'Follow up');
        assert.strictEqual(reparsed.todo.sections[3].items.length, 1);
    });

    test('round-trips quotes section', () => {
        const input = `# Radar

## Lane
- 1/1/26 - Item

# Quotes
> Stay hungry, stay foolish. — Steve Jobs
> A ship in harbor is safe, but that is not what ships are built for.

# TODO
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

    test('round-trips reminders section', () => {
        const input = `# Radar

## Lane
- 1/1/26 - Item

# Quotes
> Stay hungry. — Jobs

# Reminders

## Monday Standup (Mon)
- Blocked on API migration
- Need to discuss deploy timeline

## 1:1 with Sarah (Wed, Fri)
- Ask about promotion timeline

# TODO
* [ ] Task
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.reminders);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.reminders.meetings.length, 2);
        assert.strictEqual(reparsed.reminders.meetings[0].name, 'Monday Standup');
        assert.deepStrictEqual(reparsed.reminders.meetings[0].days, ['Mon']);
        assert.strictEqual(reparsed.reminders.meetings[0].points.length, 2);
        assert.strictEqual(reparsed.reminders.meetings[0].points[0].text, 'Blocked on API migration');
        assert.strictEqual(reparsed.reminders.meetings[1].name, '1:1 with Sarah');
        assert.deepStrictEqual(reparsed.reminders.meetings[1].days, ['Wed', 'Fri']);
        // Radar and todo still intact
        assert.strictEqual(reparsed.radar.swimlanes.length, 1);
        assert.strictEqual(reparsed.todo.sections[0].items.length, 1);
        assert.strictEqual(reparsed.quotes.items.length, 1);
    });

    test('round-trips reminders with multiple days', () => {
        const input = `# Radar

# Reminders

## Daily Sync (Mon, Tue, Wed, Thu, Fri)
- Check blockers

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.reminders);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.reminders.meetings.length, 1);
        assert.deepStrictEqual(reparsed.reminders.meetings[0].days, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    });

    test('round-trips empty meetings (no points)', () => {
        const input = `# Radar

# Reminders

## Empty Meeting (Tue)

# TODO
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines, result.quotes, result.reminders);
        const reparsed = parseIncoming(output);

        assert.strictEqual(reparsed.reminders.meetings.length, 1);
        assert.strictEqual(reparsed.reminders.meetings[0].name, 'Empty Meeting');
        assert.strictEqual(reparsed.reminders.meetings[0].points.length, 0);
    });

    test('omits reminders section when no meetings', () => {
        const output = serializeIncoming(
            { swimlanes: [] },
            { sections: [] },
            [],
            { items: [] },
            { meetings: [] }
        );
        assert.ok(!output.includes('# Reminders'));
    });

    test('default section omits ## heading', () => {
        const input = `# Radar

# TODO
* [ ] Unsectioned
## Later
* [ ] Sectioned
`;

        const result = parseIncoming(input);
        const output = serializeIncoming(result.radar, result.todo, result.unparsedLines);

        // Should not have "## " before "Unsectioned", but should have "## Later"
        const todoIdx = output.indexOf('# TODO');
        const todoContent = output.slice(todoIdx);
        const lines = todoContent.split('\n');

        // First non-empty line after "# TODO" should be the item, not a "## " heading
        const contentLines = lines.slice(1).filter(l => l.trim() !== '');
        assert.ok(contentLines[0].startsWith('* [ ] Unsectioned'));
        assert.ok(todoContent.includes('## Later'));
    });
});
