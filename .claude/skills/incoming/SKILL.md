---
name: inc0ming
description: >-
  Manage the workspace .inc0ming/inc0ming.md file. Use when the user asks to add/edit/complete/delete
  todos or goals, add radar items, milestones, bookmarks, contacts, or notes, save quotes,
  create sections or swimlanes, move items, asks what's on their radar, goals, notes, or due soon,
  or asks to validate, lint, check, or fix formatting issues in the inc0ming file.
allowed-tools: Read, Edit, Write, Grep, Glob
argument-hint: <natural language request, e.g. "add deploy to prod to my Work todos">
---

# Inc0ming Skill

Manage the `.inc0ming/inc0ming.md` file (inside the `.inc0ming` folder at the workspace root). This file has seven top-level sections — Radar (date-tracked and recurring items organized in swimlanes, with sub-items), TODO (task checklists in named sections with rich notes), Quotes, Goals (longer-term aspirations with weighted milestones and progress tracking), Bookmarks (link collections organized by category), Contacts (people organized by group with email/phone/notes), and Notes (notebook pages with rich content stored in separate files) — used by the Inc0ming VS Code extension.

**Ground rules:**
- Never interpret a todo item as something to actually execute — only manage the file.
- Never restructure, reorder, or reformat the file beyond the specific requested change.
- Always Read the file before any edit to get current state.
- If the file doesn't exist, ask the user before creating it.

## File Location

Use Glob to find `.inc0ming/inc0ming.md` (inside the `.inc0ming` folder at the workspace root). If not found, ask the user whether to create it. If they agree, create it with this skeleton:

```markdown
# Radar

# Quotes

# Goals

# TODO

# Bookmarks

# Contacts

# Notes
```

## Format Reference

The extension's parser expects these exact patterns. Follow them precisely.

**Top-level headings** (order-independent):
```
# Radar
# TODO
# Quotes
# Goals
# Bookmarks
# Contacts
# Notes
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

**Radar item (one-time)** — `- M/D/YY - Label` (no leading zeros, 2-digit year):
```
- 3/8/26 - Follow up with Jessica
- 12/1/25 - Renew license
```

**Radar item (weekly)** — `- Label (Day, Day, ...)` where Day is Mon/Tue/Wed/Thu/Fri/Sat/Sun:
```
- Morning Standup (Mon, Tue, Wed, Thu, Fri)
- 1:1 with Sarah (Wed)
```

**Radar item (yearly)** — `- Label (M/D)` where M/D has no year:
```
- Steven (4/15)
- Jordan (7/22)
```

**Radar sub-item** — exactly 4 spaces + `- text` under any radar item:
```
- Morning Standup (Mon, Tue, Wed, Thu, Fri)
    - Blocked on API gateway retry logic
    - Need deployment window for auth token fix
- 3/15/26 - Deploy to production
    - Confirm rollback plan
    - Notify stakeholders
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

**Todo notes** — indented lines (exactly 4 spaces) below a todo item. Two types that can interleave freely:
- **Paragraph line** — 4 spaces + text (no dash):
- **Bullet line** — 4 spaces + `- ` + text:

```
* [ ] 3/10 Policy Reading
    We Recognize Accomplishments. We strive to recognize our people
    for contributions they make to their regular jobs and business.
    - Small things you can do for your people and peers
    - Recognizing teams for accomplishments
    Things the organization is doing.
```

**Todo due date** — exactly 4 spaces + `Due:` + `M/D/YY` under a todo item. Must appear before any note lines:
```
* [ ] Finish report
    Due: 4/1/26
    - Some note after the due date
```

**Radar cross-reference** on a todo — `{radar:SwimlaneName}` at end:
```
* [ ] Prepare presentation {radar:Work}
```

**Quote** — `>` with em dash (`—`) or double dash (`--`) before attribution:
```
> The best way to predict the future is to create it — Peter Drucker
```

**Goal section** — `## Name` under `# Goals`:
```
## Q2 2026
## Personal
```

**Goal item** — dash, space, checkbox, space, text. Uses `- [ ]` / `- [x]` (not asterisk). At column 0 (no indent):
```
- [ ] Complete AWS SA Certification
- [x] Ship cloud migration Phase 1
```

**Radar cross-reference** on a goal — `{radar:SwimlaneName}` at end:
```
- [ ] Complete AWS SA Certification {radar:Certifications}
```

**Goal target note** — exactly 4 spaces + `Target:` + text:
```
    Target: Pass exam by 5/15/26
```

**Goal due date** — exactly 4 spaces + `Due:` + `M/D/YY`:
```
    Due: 5/15/26
```
If no `Due:` line is present, the parser will attempt to extract a `M/D/YY` date from the `Target:` text as a fallback.

**Goal completion note** — exactly 4 spaces + `Completed` + text (on the goal level, not under a milestone):
```
    Completed 4/8/26 — two days ahead, zero downtime
```

**Milestone** — exactly 4 spaces + `- [ ]` or `- [x]` + text + optional `(N%)` weight:
```
    - [x] Module 5: Networking (15%)
    - [ ] Module 7: Architecture patterns (70%)
    - [ ] Step without explicit weight
```

**Milestone due date** — exactly 8 spaces + `Due:` + `M/D/YY`:
```
        Due: 5/1/26
```

**Milestone completion note** — exactly 8 spaces + `Completed` + text:
```
        Completed 3/1 — passed practice exam
```

**Weight rules:**
- Milestones with `(N%)` use that weight directly.
- If all milestones omit weights, they get equal distribution: `floor(100 / count)` with remainder distributed to first milestones.
- Weights that don't sum to 100% are used as-is (no normalization).

**Progress calculation:**
- Sum of completed milestones' weights.
- No milestones: 0% if unchecked, 100% if checked.

**Bookmark section** — `## Name` under `# Bookmarks`:
```
## Dev Tools
## Reference
```

**Bookmark item** — `- [Title](URL)` (markdown link) under a bookmark section. Bare URLs (`- https://...`) are also accepted (URL used as title):
```
- [GitHub](https://github.com)
- [VS Code Docs](https://code.visualstudio.com/docs)
- https://example.com
```

**Contact group** — `## Name` under `# Contacts`:
```
## Team
## Personal
```

**Contact item** — `- Name (type)` under a contact group. The `(type)` is optional free-text (e.g. colleague, mentor, contractor):
```
- Alice Chen (colleague)
- Bob Smith
```

**Contact detail fields** — exactly 4 spaces + `Email:`, `Phone:`, or `Notes:` under a contact item:
```
- Alice Chen (colleague)
    Email: alice@example.com
    Phone: 555-0101
    Notes: Frontend lead
```

**Note notebook** — `## Name` under `# Notes`:
```
## General
## Project Alpha
```

**Note page** — `- Title` under a notebook heading, followed by indented metadata:
```
- Meeting Prep
    Created: 3/11/26
    Updated: 3/11/26
    Tags: {radar:Infrastructure} {goal:Ship cloud migration Phase 1}
```

**Note page metadata** — exactly 4 spaces + field. All metadata lines are optional:
- `Created: M/D/YY` — creation date
- `Updated: M/D/YY` — last modified date
- `Tags: {type:target} ...` — cross-references. Types: `radar`, `goal`, `todo`, `note`

**Note content files** — each page's content is stored separately in `.inc0ming/notes/<slug>.md` where slug is derived from the title (lowercase, spaces to hyphens, strip non-alphanumeric). The `.inc0ming/inc0ming.md` file only contains the index (notebook/page structure and metadata). Note content files are standard GitHub Flavored Markdown.

**Slug generation:**
- "Meeting Prep" → `meeting-prep`
- "Architecture Decisions" → `architecture-decisions`
- If collision, append numeric suffix: `meeting-prep-2`

## Supported Operations

### Add Todo
**Triggers:** "add X to my todo list", "add X to section Y"
1. Read `.inc0ming/inc0ming.md`.
2. Identify the target `## Section` under `# TODO`. If no section is specified and multiple sections exist, ask which one.
3. Insert `* [ ] X` at the end of that section (before the next `##` heading or end of TODO block).
4. Confirm what was added and where.

### Complete Todo
**Triggers:** "mark X as done", "check off X", "complete X"
1. Read `.inc0ming/inc0ming.md`.
2. Find `* [ ] ` lines and fuzzy-match against X. If multiple matches, present options.
3. Replace `[ ]` with `[x]` on the matched line.
4. Confirm which item was completed.

### Delete Todo
**Triggers:** "remove todo about X", "delete X from my list"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `* [ ] ` or `* [x] ` line.
3. **Confirm with the user before deleting.**
4. Remove the item line and any immediately following indented note lines (4-space-indented lines).
5. Confirm deletion.

### Add/Edit Notes on Todo
**Triggers:** "add notes to X", "add details to X: a, b, c", "add sub-items to X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching todo item.
3. Insert note lines (4 spaces + text) after the item line and any existing note lines. For bullet-style notes, use `    - text`. For paragraph-style notes, use `    text` (no dash).
4. If editing existing notes, replace the indented block below the item.
5. Confirm what was added/changed.

### Move Todo
**Triggers:** "move X to section Y"
1. Read `.inc0ming/inc0ming.md`.
2. Find the item (and its indented note lines) in the source section.
3. Remove from source, insert at end of target section.
4. Confirm the move.

### Set Todo Due Date
**Triggers:** "set due date for todo X to M/D/YY", "todo X is due on date"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching todo item.
3. If a `    Due:` line already exists below the item (before any note lines), replace it. Otherwise insert `    Due: M/D/YY` immediately after the item line.
4. Confirm the change.

### Set/Edit Todo Radar Link
**Triggers:** "link todo X to swimlane Y", "set radar link for todo X to Y", "remove radar link from todo X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching todo item.
3. If `{radar:OldName}` exists at the end of the item line, replace it with `{radar:NewName}`. To remove, delete the `{radar:...}` suffix.
4. If no radar link exists, append ` {radar:Name}` to the item line.
5. Confirm the change.

### Create TODO Section
**Triggers:** "create section called X", "add a section for X"
1. Read `.inc0ming/inc0ming.md`.
2. Check that no section with that name already exists (case-insensitive).
3. Insert `## X` at the end of the `# TODO` block (before the next `#` heading or EOF), preceded by a blank line.
4. Confirm creation.

### Add Radar Item
**Triggers:** "remind me in N days about X", "add X to radar for date", "add weekly X on Mon/Wed", "add yearly birthday for X on M/D"
1. Determine the item type:
   - **One-time:** Calculate the target date (see Date Handling below) and format as `M/D/YY`.
   - **Weekly:** Identify the day names (Mon, Tue, Wed, Thu, Fri, Sat, Sun).
   - **Yearly:** Identify the month/day (M/D format, no year).
2. Read `.inc0ming/inc0ming.md`.
3. Identify the target swimlane (`## Name` under `# Radar`). If none specified and multiple exist, ask.
4. Insert the item at the end of that swimlane's items (before the next `##`, `###`, or section boundary):
   - One-time: `- M/D/YY - Label`
   - Weekly: `- Label (Day, Day, ...)`
   - Yearly: `- Label (M/D)`
5. Confirm what was added.

### Add Swimlane
**Triggers:** "add swimlane called X", "create a radar swimlane for X"
1. Read `.inc0ming/inc0ming.md`.
2. Check that no swimlane with that name already exists under `# Radar`.
3. Insert `## X` after the last existing swimlane (or directly after `# Radar` if none exist), preceded by a blank line.
4. Confirm creation.

### Add Quote
**Triggers:** "save quote: text — author", "add quote"
1. Parse the text and attribution. Accept `—`, `--`, or `by` as separators.
2. Read `.inc0ming/inc0ming.md`.
3. Insert `> Text — Attribution` (using em dash) under `# Quotes`, after existing quotes.
4. If no attribution is provided, insert `> Text` without a dash.
5. Confirm what was saved.

### Add Radar Sub-Item
**Triggers:** "add talking point to X: text", "add sub-item to X", "add note to radar item X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching radar item (one-time, weekly, or yearly) under `# Radar`. If ambiguous, ask which item.
3. Insert `    - text` (4-space indent) after the item's existing sub-items (before the next unindented line).
4. Confirm what was added.

### Edit Radar Sub-Item
**Triggers:** "edit sub-item X on radar item Y", "change talking point X to Y"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `    - text` sub-item line under the target radar item.
3. Replace the sub-item text.
4. Confirm the change.

### Delete Radar Sub-Item
**Triggers:** "remove sub-item about X from radar item Y", "delete talking point X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `    - text` sub-item line.
3. **Confirm with the user before deleting.**
4. Remove the line.
5. Confirm deletion.

### Add Goal Section
**Triggers:** "create a goal category for X", "add a goals section called X"
1. Read `.inc0ming/inc0ming.md`.
2. Check that no section with that name already exists under `# Goals` (case-insensitive).
3. Insert `## X` at the end of the `# Goals` block (before the next `#` heading or EOF), preceded by a blank line.
4. Confirm creation.

### Add Goal
**Triggers:** "add goal: X", "add a goal to section Y: X"
1. Read `.inc0ming/inc0ming.md`.
2. Identify the target `## Section` under `# Goals`. If no section is specified and multiple sections exist, ask which one.
3. Insert `- [ ] X` at the end of that section (before the next `##` heading or section boundary).
4. If a radar cross-reference is specified, append ` {radar:Name}`.
5. If a target note is specified, add `    Target: text` on the next line.
6. Confirm what was added and where.

### Complete Goal
**Triggers:** "mark goal X as done", "complete goal X"
1. Read `.inc0ming/inc0ming.md`.
2. Find `- [ ] ` lines under `# Goals` and fuzzy-match against X. If multiple matches, present options.
3. Replace `[ ]` with `[x]` on the matched line.
4. If a completion note is provided, insert `    Completed text` after the goal line (and after any existing Target line).
5. Confirm which goal was completed.

### Delete Goal
**Triggers:** "remove goal about X", "delete goal X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `- [ ] ` or `- [x] ` line under `# Goals`.
3. **Confirm with the user before deleting.**
4. Remove the goal line, any Target/Completed lines, and all milestone lines (4-space and 8-space indented) belonging to it.
5. Confirm deletion.

### Add Milestone
**Triggers:** "add milestone to goal X: text (N%)", "add step to goal X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching goal under `# Goals`.
3. Insert `    - [ ] text (N%)` after the goal's existing milestones. If no weight is specified, use `    - [ ] text` (no weight suffix).
4. Confirm what was added.

### Complete Milestone
**Triggers:** "complete milestone X on goal Y", "mark milestone X as done"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `    - [ ] ` milestone line under the target goal.
3. Replace `[ ]` with `[x]`.
4. If a completion note is provided, insert `        Completed text` on the next line (8-space indent).
5. Confirm which milestone was completed.

### Delete Milestone
**Triggers:** "remove milestone X from goal Y"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `    - [ ] ` or `    - [x] ` milestone line.
3. **Confirm with the user before deleting.**
4. Remove the milestone line and any 8-space-indented completion note below it.
5. Confirm deletion.

### Set Goal Due Date
**Triggers:** "set due date for goal X to M/D/YY", "goal X is due on date"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching goal.
3. If a `    Due:` line already exists below the goal, replace it. Otherwise insert `    Due: M/D/YY` after the Target line (or after the goal line if no Target).
4. Confirm the change.

### Set Milestone Due Date
**Triggers:** "set due date for milestone X to M/D/YY", "milestone X due on date"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching milestone under the target goal.
3. If a `        Due:` line already exists below the milestone, replace it. Otherwise insert `        Due: M/D/YY` after the milestone line (or after its Completed line if present).
4. Confirm the change.

### Edit Goal Target
**Triggers:** "set target for goal X to: text", "update goal X target"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching goal.
3. If a `    Target:` line already exists below the goal, replace it. Otherwise insert `    Target: text` after the goal line.
4. Confirm the change.

### Add Bookmark Section
**Triggers:** "create a bookmark category for X", "add a bookmarks section called X"
1. Read `.inc0ming/inc0ming.md`.
2. Check that no section with that name already exists under `# Bookmarks` (case-insensitive).
3. Insert `## X` at the end of the `# Bookmarks` block (before the next `#` heading or EOF), preceded by a blank line.
4. Confirm creation.

### Add Bookmark
**Triggers:** "add bookmark: title — url", "bookmark this: url", "save link to X section"
1. Read `.inc0ming/inc0ming.md`.
2. Identify the target `## Section` under `# Bookmarks`. If no section is specified and multiple exist, ask which one.
3. Insert `- [Title](URL)` at the end of that section (before the next `##` heading or section boundary).
4. Confirm what was added and where.

### Edit Bookmark
**Triggers:** "edit bookmark X", "change bookmark title/url"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `- [Title](URL)` line under `# Bookmarks`. If ambiguous, present options.
3. Replace with the updated `- [NewTitle](NewURL)`.
4. Confirm the change.

### Delete Bookmark
**Triggers:** "remove bookmark about X", "delete bookmark X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching bookmark line.
3. **Confirm with the user before deleting.**
4. Remove the line.
5. Confirm deletion.

### Delete Bookmark Section
**Triggers:** "delete bookmark section X", "remove bookmark category X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `## Section` heading under `# Bookmarks`.
3. **Confirm with the user before deleting.**
4. Remove the heading and all its `- [Title](URL)` lines.
5. Confirm deletion.

### Add Contact Group
**Triggers:** "create a contact group for X", "add a contacts group called X"
1. Read `.inc0ming/inc0ming.md`.
2. Check that no group with that name already exists under `# Contacts` (case-insensitive).
3. Insert `## X` at the end of the `# Contacts` block (before the next `#` heading or EOF), preceded by a blank line.
4. Confirm creation.

### Add Contact
**Triggers:** "add contact: Name to group X", "add Name (type) to contacts"
1. Read `.inc0ming/inc0ming.md`.
2. Identify the target `## Group` under `# Contacts`. If no group is specified and multiple exist, ask which one.
3. Insert `- Name (type)` at the end of that group (before the next `##` heading or section boundary). If no type is specified, use `- Name`.
4. If email, phone, or notes are provided, add detail lines immediately below with 4-space indent.
5. Confirm what was added and where.

### Edit Contact
**Triggers:** "edit contact X", "update contact X's email/phone/notes"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching contact line and its detail fields under `# Contacts`. If ambiguous, present options.
3. Update the contact name/type line and/or the indented detail fields. Add missing fields, update existing ones.
4. Confirm the changes.

### Delete Contact
**Triggers:** "remove contact X", "delete contact X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching contact line.
3. **Confirm with the user before deleting.**
4. Remove the contact line and all its 4-space-indented detail lines below it.
5. Confirm deletion.

### Delete Contact Group
**Triggers:** "delete contact group X", "remove contacts group X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `## Group` heading under `# Contacts`.
3. **Confirm with the user before deleting (this deletes all contacts in the group).**
4. Remove the heading and all contact lines with their detail fields.
5. Confirm deletion.

### Add Note Notebook
**Triggers:** "create a notebook for X", "add a notes notebook called X"
1. Read `.inc0ming/inc0ming.md`.
2. Check that no notebook with that name already exists under `# Notes` (case-insensitive).
3. Insert `## X` at the end of the `# Notes` block (before the next `#` heading or EOF), preceded by a blank line.
4. Confirm creation.

### Add Note Page
**Triggers:** "add a note page called X", "create note X in notebook Y"
1. Read `.inc0ming/inc0ming.md`.
2. Identify the target `## Notebook` under `# Notes`. If no notebook is specified and multiple exist, ask which one.
3. Generate the slug from the title (lowercase, spaces to hyphens, strip non-alphanumeric). Check for slug collisions.
4. Insert the page entry at the end of that notebook (before the next `##` heading or section boundary):
   ```
   - Title
       Created: M/D/YY
       Updated: M/D/YY
   ```
5. Create the note content file at `.inc0ming/notes/<slug>.md` with `# Title` as initial content.
6. Confirm what was added and where.

### Edit Note Page Title
**Triggers:** "rename note X to Y", "change note title X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `- Title` line under `# Notes`. If ambiguous, present options.
3. Update the title. Note: the slug and filename do NOT change on rename (to preserve links).
4. Confirm the change.

### Delete Note Page
**Triggers:** "delete note X", "remove note page X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `- Title` line under `# Notes`.
3. **Confirm with the user before deleting.**
4. Remove the page entry line and all its 4-space-indented metadata lines.
5. Delete the corresponding `.inc0ming/notes/<slug>.md` file if it exists.
6. Confirm deletion.

### Delete Note Notebook
**Triggers:** "delete notebook X", "remove notes notebook X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `## Notebook` heading under `# Notes`.
3. **Confirm with the user before deleting (this deletes all pages in the notebook).**
4. Remove the heading and all page entries with their metadata.
5. Delete the corresponding `.inc0ming/notes/<slug>.md` files for each page.
6. Confirm deletion.

### Add/Edit Note Tags
**Triggers:** "tag note X with radar:Y", "add tag to note X", "remove tags from note X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching note page entry.
3. If a `    Tags:` line exists, update it. Otherwise insert `    Tags: {type:target}` after the other metadata lines.
4. Confirm the change.

### Read Note Content
**Triggers:** "show me note X", "what does note X say?", "open note X", "read my note about X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching `- Title` line under `# Notes`. If ambiguous, present options.
3. Derive the slug from the page entry (lowercase, spaces to hyphens, strip non-alphanumeric).
4. Read the content file at `.inc0ming/notes/<slug>.md`.
5. Present the note content. **Do not modify any files.**

### Edit Note Content
**Triggers:** "update note X with...", "add to note X: ...", "edit the content of note X", "append to note X"
1. Read `.inc0ming/inc0ming.md`.
2. Find the matching note page entry. If ambiguous, present options.
3. Derive the slug and read `.inc0ming/notes/<slug>.md`.
4. Apply the requested changes to the content file using Edit (append, replace text, add sections, etc.).
5. Update the `Updated: M/D/YY` metadata line in `.inc0ming/inc0ming.md` to today's date.
6. Confirm what was changed.

### Search Notes
**Triggers:** "find notes about X", "search my notes for X", "which notes mention X?", "do I have any notes on X?"
1. Read `.inc0ming/inc0ming.md` to get the full list of notebooks and pages.
2. Collect all note slugs from the page entries.
3. Use Grep to search `.inc0ming/notes/` for the keyword or phrase across all note content files.
4. For each match, map the filename back to the notebook and page title using the index in `.inc0ming/inc0ming.md`.
5. Present results grouped by notebook, showing the page title, matching lines with context, and the file path. **Do not modify any files.**

### Find Notes by Tag
**Triggers:** "find notes tagged with X", "which notes are linked to radar Y?", "notes related to goal X", "show notes for todo X"
1. Read `.inc0ming/inc0ming.md`.
2. Search the `Tags:` metadata lines under `# Notes` for matching `{type:target}` patterns. Match loosely — if the user says "find notes about Project Alpha", match against both page titles and tag targets.
3. For each matching page, optionally read its content file at `.inc0ming/notes/<slug>.md` if the user wants to see content.
4. Present matching pages grouped by notebook, showing title, tags, and dates. **Do not modify any files.**

### Summarize / Query
**Triggers:** "what's on my radar?", "what's due this week?", "show my todos", "what are my goals?", "show goal progress", "show my bookmarks", "show my contacts", "show my notes"
1. Read `.inc0ming/inc0ming.md`.
2. For radar queries: compute days until each item's effective date (one-time items use their date; weekly items use the next occurrence of their scheduled days; yearly items use the next occurrence of their month/day). Group by swimlane, sort by date. Show sub-items under each item. Highlight weekly items scheduled for today.
3. For todo queries: list items by section, showing completion status.
4. For goal queries: list goals by section, showing progress percentage (sum of completed milestone weights), target notes, and completion status.
5. For bookmark queries: list bookmarks by section with titles and URLs.
6. For contact queries: list contacts by group with their type and detail fields.
7. For note queries: list notebooks and their pages with dates and tags. To show note content, read the corresponding `.inc0ming/notes/<slug>.md` file.
8. Present a formatted read-only summary. **Do not modify the file.**

### Validate / Fix Formatting
**Triggers:** "validate my inc0ming file", "check for formatting issues", "lint the dashboard file", "fix my inc0ming file", "are there any issues with my inc0ming?", "fix formatting problems"
1. Read `.inc0ming/inc0ming.md`.
2. Evaluate the entire file against the structural rules below. Walk through every line and check for violations.
3. Report all issues found, grouped by severity (errors first, then warnings), with the line number and a description of the problem.
4. If the user asks to **fix** the issues (not just report them), apply corrections using Edit. Fix each issue individually with targeted edits — never rewrite the whole file.
5. After fixes, re-read the file and confirm all issues are resolved.

**Validation Rules Reference:**

The extension's built-in validator checks these rules. When validating, check for all of them:

**Errors (must fix — these break parsing):**

| Code | Section | Rule |
|------|---------|------|
| E001 | Radar | Invalid date format — must be `M/D/YY` (no leading zeros, 2-digit year). Check that month is 1-12 and day is 1-31. |
| E002 | Radar | Malformed radar item — expected `- M/D/YY - Label` for one-time items. The line starts with `- ` under a swimlane but doesn't match any valid radar format (one-time, weekly, or yearly). |
| E003 | Radar | Radar item appears before any `## swimlane` heading. Every `- ` item under `# Radar` must be inside a `## Swimlane`. |
| E004 | TODO | Malformed checkbox — expected `* [ ] text` or `* [x] text`. Common mistakes: missing space inside brackets (`*[]`), uppercase X (`* [X] `), using dash instead of asterisk (`- [ ]` under TODO). |
| E005 | TODO | TODO item before any `## section` heading. Every `* [ ]` item under `# TODO` must be inside a `## Section`. |
| E006 | Goals | Malformed goal checkbox — must be `- [ ] text` or `- [x] text` at column 0. Check for missing space, uppercase X, or wrong bracket format. |
| E007 | Goals | Malformed milestone checkbox — must be `    - [ ] text` or `    - [x] text` (4-space indent). Same checkbox rules as E006. |
| E008 | Goals | Goal item before any `## section` heading. Every `- [ ]` item under `# Goals` must be inside a `## Section`. |
| E009 | Structure | Duplicate top-level heading — each `# Section` name may only appear once. |
| E010 | Structure | Unknown top-level heading — only these are valid: `Radar`, `TODO`, `Quotes`, `Goals`, `Bookmarks`, `Contacts`, `Notes`. |

**Warnings (should fix — these cause data loss or unexpected behavior):**

| Code | Section | Rule |
|------|---------|------|
| W001 | Radar | `### sub-group` appears before any `## swimlane` heading — sub-groups are orphaned. |
| W002 | TODO | Invalid due date format in `    Due: ...` line — must be `M/D/YY`. |
| W003 | Goals | Invalid due date format in goal or milestone `Due: ...` line — must be `M/D/YY`. |
| W004 | Goals | Milestone weights don't sum to 100% — when all milestones have explicit `(N%)` weights, they should total 100. |
| W005 | Goals | Mixed weighted and unweighted milestones — either all milestones should have `(N%)` weights or none should. |
| W006 | TODO/Goals | Broken radar link — `{radar:Name}` references a swimlane that doesn't exist under `# Radar`. |
| W007 | TODO | Indented content (4 spaces) with no parent TODO item above it. |
| W008 | Goals | Indented content (4 spaces) with no parent goal item above it. |
| W009 | Radar | Sub-item bullet found before any `## meeting` heading in recurring-items context. |
| W011 | Structure | Empty section — a `## heading` has no items or content following it before the next heading. |
| W012 | Radar | Color metadata `<!-- color: ... -->` appears after items in a swimlane — should be immediately after the `## heading`. |

**Common fixes by code:**

| Code | Fix |
|------|-----|
| E001 | Reformat the date to `M/D/YY` — strip leading zeros, ensure 2-digit year. `03/08/2026` becomes `3/8/26`. |
| E002 | Restructure the line to match `- M/D/YY - Label`, `- Label (Day, Day)`, or `- Label (M/D)`. |
| E003 | Move the item under an existing `## swimlane`, or create a new swimlane above it. |
| E004 | Replace with `* [ ] text` or `* [x] text` — fix bracket spacing, lowercase the x, change dash to asterisk. |
| E005 | Move the item under an existing `## section`, or create a new section above it. |
| E006/E007 | Fix bracket spacing and use lowercase x: `- [ ] text` or `- [x] text`. |
| E008 | Move the goal under an existing `## section`, or create a new section above it. |
| E009 | Remove the duplicate heading or merge content under the first occurrence. |
| E010 | Remove or rename the heading to one of the 7 valid names. |
| W001 | Move the `###` sub-group under a `## swimlane`, or create a swimlane above it. |
| W002/W003 | Reformat the date to `M/D/YY`. |
| W004 | Adjust milestone weights so they sum to 100%. |
| W005 | Either add `(N%)` weights to all milestones or remove them from all. |
| W006 | Fix the swimlane name in `{radar:Name}` to match an existing `## swimlane`, or remove the cross-reference. |
| W011 | Add content to the section or remove the empty heading. Ask the user which they prefer. |
| W012 | Move the `<!-- color: ... -->` comment to immediately after the `## heading`, before any items. |

**Structural checks (not covered by error codes but still important):**
- Every top-level section (`# Radar`, `# TODO`, etc.) should exist. If missing, note it but don't add it without asking.
- Indentation must use spaces, not tabs. TODO notes and contact details use exactly 4 spaces. Milestone metadata uses exactly 8 spaces.
- Blank lines between sections are fine and should be preserved — don't remove or add them.
- TODO items use `*` (asterisk). Goal items use `-` (dash). Don't mix them up.
- Radar items under `# Radar` use `-` (dash). Contact items under `# Contacts` use `-` (dash). Bookmark items under `# Bookmarks` use `-` (dash).

## Clarification Rules

Ask the user before proceeding when:
- **Ambiguous section:** No section specified and multiple TODO sections exist — ask which one.
- **Ambiguous swimlane:** No swimlane specified and multiple radar swimlanes exist — ask which one.
- **Vague date:** User says "soon", "later", "eventually" — ask for a specific date or number of days.
- **Multiple matches:** Fuzzy search returns more than one candidate — present the options.
- **Item not found:** No match for the user's description — offer to create it instead.
- **Missing target:** The target section or swimlane doesn't exist — offer to create it.
- **Ambiguous radar item:** Multiple radar items match a fuzzy search — present the options.
- **Ambiguous goal section:** No goal section specified and multiple exist — ask which one.
- **Ambiguous goal:** Multiple goals match a fuzzy search — present the options.
- **Ambiguous bookmark section:** No bookmark section specified and multiple exist — ask which one.
- **Ambiguous contact group:** No contact group specified and multiple exist — ask which one.
- **Ambiguous contact:** Multiple contacts match a fuzzy search — present the options.
- **Ambiguous notebook:** No notebook specified and multiple exist — ask which one.
- **Ambiguous note page:** Multiple note pages match a fuzzy search — present the options.
- **Destructive action:** Always confirm before deleting an item, goal, milestone, sub-item, bookmark, contact, notebook, or note page.
- **Insufficient detail:** User says "add a todo" or "add a goal" with no description — ask what to add.

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
