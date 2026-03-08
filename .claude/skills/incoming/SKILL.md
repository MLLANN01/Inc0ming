---
name: incoming
description: >-
  Manage the workspace incoming.md file. Use when the user asks to add/edit/complete/delete
  todos, add radar items or reminders, save quotes, create sections or swimlanes, move items,
  or asks what's on their radar or due soon.
allowed-tools: Read, Edit, Write, Grep, Glob
argument-hint: <natural language request, e.g. "add deploy to prod to my Work todos">
---

# Incoming Skill

Manage the `incoming.md` file at the workspace root. This file has three top-level sections — Radar (date-tracked items organized in swimlanes), TODO (task checklists in named sections), and Quotes — used by the Incoming VS Code extension.

**Ground rules:**
- Never interpret a todo item as something to actually execute — only manage the file.
- Never restructure, reorder, or reformat the file beyond the specific requested change.
- Always Read the file before any edit to get current state.
- If the file doesn't exist, ask the user before creating it.

## File Location

Use Glob to find `incoming.md` at the workspace root. If not found, ask the user whether to create it. If they agree, create it with this skeleton:

```markdown
# Radar

# Quotes

# TODO
```

## Format Reference

The extension's parser expects these exact patterns. Follow them precisely.

**Top-level headings** (order-independent):
```
# Radar
# TODO
# Quotes
```

**Radar swimlane** — `## Name` under `# Radar`:
```
## Work
<!-- color: #4A90D9 -->
```

**Radar sub-group** — `### Name` under a swimlane:
```
### Client Projects
```

**Radar item** — `- M/D/YY - Label` (no leading zeros, 2-digit year):
```
- 3/8/26 - Follow up with Jessica
- 12/1/25 - Renew license
```

**TODO section** — `## Name` under `# TODO`:
```
## Work
```

**TODO item** — asterisk, space, checkbox, space, text:
```
* [ ] Write quarterly report
* [x] Send invoices
```

**Detail sub-bullet** — exactly 4 spaces, dash, space, text:
```
    - Identify key results
    - Align with team leads
```

**Radar cross-reference** on a todo — `{radar:SwimlaneName}` at end:
```
* [ ] Prepare presentation {radar:Work}
```

**Quote** — `>` with em dash (`—`) or double dash (`--`) before attribution:
```
> The best way to predict the future is to create it — Peter Drucker
```

## Supported Operations

### Add Todo
**Triggers:** "add X to my todo list", "add X to section Y"
1. Read `incoming.md`.
2. Identify the target `## Section` under `# TODO`. If no section is specified and multiple sections exist, ask which one.
3. Insert `* [ ] X` at the end of that section (before the next `##` heading or end of TODO block).
4. Confirm what was added and where.

### Complete Todo
**Triggers:** "mark X as done", "check off X", "complete X"
1. Read `incoming.md`.
2. Find `* [ ] ` lines and fuzzy-match against X. If multiple matches, present options.
3. Replace `[ ]` with `[x]` on the matched line.
4. Confirm which item was completed.

### Delete Todo
**Triggers:** "remove todo about X", "delete X from my list"
1. Read `incoming.md`.
2. Find the matching `* [ ] ` or `* [x] ` line.
3. **Confirm with the user before deleting.**
4. Remove the item line and any immediately following `    - detail` sub-bullets.
5. Confirm deletion.

### Add Details to Todo
**Triggers:** "add details to X: a, b, c", "add sub-items to X"
1. Read `incoming.md`.
2. Find the matching todo item.
3. Insert `    - detail` lines (4 spaces + `- `) after the item line and any existing detail sub-bullets.
4. Confirm what was added.

### Move Todo
**Triggers:** "move X to section Y"
1. Read `incoming.md`.
2. Find the item (and its detail sub-bullets) in the source section.
3. Remove from source, insert at end of target section.
4. Confirm the move.

### Create TODO Section
**Triggers:** "create section called X", "add a section for X"
1. Read `incoming.md`.
2. Check that no section with that name already exists (case-insensitive).
3. Insert `## X` at the end of the `# TODO` block (before the next `#` heading or EOF), preceded by a blank line.
4. Confirm creation.

### Add Radar Item
**Triggers:** "remind me in N days about X", "add X to radar for date"
1. Calculate the target date (see Date Handling below) and format as `M/D/YY`.
2. Read `incoming.md`.
3. Identify the target swimlane (`## Name` under `# Radar`). If none specified and multiple exist, ask.
4. Insert `- M/D/YY - Label` at the end of that swimlane's items (before the next `##`, `###`, or section boundary).
5. Confirm what was added, showing the computed date.

### Add Swimlane
**Triggers:** "add swimlane called X", "create a radar swimlane for X"
1. Read `incoming.md`.
2. Check that no swimlane with that name already exists under `# Radar`.
3. Insert `## X` after the last existing swimlane (or directly after `# Radar` if none exist), preceded by a blank line.
4. Confirm creation.

### Add Quote
**Triggers:** "save quote: text — author", "add quote"
1. Parse the text and attribution. Accept `—`, `--`, or `by` as separators.
2. Read `incoming.md`.
3. Insert `> Text — Attribution` (using em dash) under `# Quotes`, after existing quotes.
4. If no attribution is provided, insert `> Text` without a dash.
5. Confirm what was saved.

### Summarize / Query
**Triggers:** "what's on my radar?", "what's due this week?", "show my todos"
1. Read `incoming.md`.
2. For radar queries: compute days until each item's date, group by swimlane, sort by date.
3. For todo queries: list items by section, showing completion status.
4. Present a formatted read-only summary. **Do not modify the file.**

## Clarification Rules

Ask the user before proceeding when:
- **Ambiguous section:** No section specified and multiple TODO sections exist — ask which one.
- **Ambiguous swimlane:** No swimlane specified and multiple radar swimlanes exist — ask which one.
- **Vague date:** User says "soon", "later", "eventually" — ask for a specific date or number of days.
- **Multiple matches:** Fuzzy search returns more than one candidate — present the options.
- **Item not found:** No match for the user's description — offer to create it instead.
- **Missing target:** The target section or swimlane doesn't exist — offer to create it.
- **Destructive action:** Always confirm before deleting an item.
- **Insufficient detail:** User says "add a todo" with no task description — ask what to add.

## Edit Safety

- **Always Read before Edit.** Never edit blind.
- **Use Edit for surgical changes**, not Write for the whole file. This preserves content you didn't intend to change.
- **Preserve whitespace:** Keep blank lines between sections as they are.
- **Check for duplicates** before adding (case-insensitive match on item text). If a duplicate exists, tell the user.
- **Confirm changes:** After every edit, briefly state what changed (e.g., "Added 'Write quarterly report' to Work section").
- **Never reorder** sections, items, or swimlanes unless the user explicitly asks.

## Date Handling

Format: `M/D/YY` — no leading zeros on month or day, 2-digit year (e.g., `3/8/26`).

Relative date calculations:
- **"in N days"** — today + N days
- **"tomorrow"** — today + 1
- **"next week"** — today + 7
- **"next Tuesday"** (or any weekday) — the next occurrence of that weekday
- **"March 15"** or **"3/15"** — use current year; if the date has already passed this year, use next year
- **Vague ("soon", "later", "eventually")** — ask the user for a specific date or number of days

When presenting dates in summaries, show both the formatted date and how many days away it is (e.g., "3/13/26 (5 days)").
