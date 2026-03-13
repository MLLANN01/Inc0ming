# Inc0ming

A VS Code extension that turns a simple markdown file into an interactive radar + todo dashboard.

![Radar Dashboard](./media/DemoImage1.png)

## Features

- **Radar Scanner** — Canvas-based radar grid with animated sweep line, swimlane rows, and color-coded blips by urgency (0-30 days, ~90 days, ~180 days). Right-click blips to edit or delete. Hover stacked blips to see all items.
- **Swimlane Details** — Expandable cards for each swimlane with sub-groups, drag-to-reorder, and inline add/edit/delete
- **TODO Grid** — Resizable, draggable widget cards per section with checkbox items, drag-and-drop between sections, and inline editing
- **Bookmarks** — Grid cards for bookmark link collections, organized by category with search, inline add/edit/delete, and click-to-open
- **Contacts** — Dashboard grid widgets for contact groups with inline add/edit/delete, type badges, detail lines (email, phone, notes), and search filtering across all groups
- **Notes** — Notebook-based note-taking with a TipTap WYSIWYG editor supporting headings, lists, task lists, code blocks, blockquotes, images (paste/drag-and-drop), and links. Fullscreen editing mode, auto-save, and Ctrl+S manual save.
- **Rich Todo Notes** — Todo items support free-form paragraph text and bullet lists. Click to expand, double-click to edit in a textarea. Notes indicator shows which items have content.
- **Goals & Milestones** — Track longer-term goals with weighted milestones, progress bars, due dates, target notes, and completion notes. Goals and milestones with due dates appear as virtual blips on the radar.
- **Recurring Radar Items** — Weekly (`- Label (Mon, Wed)`) and yearly (`- Label (4/15)`) recurrence on radar items, with sub-items for talking points. Weekly items highlight on scheduled days.
- **Inspiration** — Random quote display with a collapsible management section for adding, editing, and deleting quotes
- **Past Due (Sidebar)** — Overdue todos, goals, milestones, and radar items listed in the sidebar with type badges and days-overdue counts. Click any item to navigate to it in the dashboard.
- **Archive** — Collapsible dashboard section showing completed todos, completed goals (with completion notes and milestone summaries), and past radar events. Items can be deleted inline.
- **Cross-View Navigation** — Click sidebar items, past-due entries, or virtual radar blips to jump directly to the source item in the dashboard with a highlight animation
- **Markdown Powered** — All data lives in `.inc0ming/inc0ming.md`. Edit it by hand or through the dashboard — changes sync both ways. Note content, images, and media are stored alongside in the `.inc0ming/` folder.

## Getting Started

1. Install the extension
2. Create a `.inc0ming/inc0ming.md` file in your workspace (or let the extension create one)
3. Click the Inc0ming icon in the activity bar, or run **Inc0ming: Open Dashboard** from the command palette

## .inc0ming/inc0ming.md Format

```markdown
# Radar

## Work
- 3/15/26 - Deploy to production
    - Confirm rollback plan
    - Notify stakeholders
### Backend
- 4/1/26 - API migration

## Meetings
- Morning Standup (Mon, Tue, Wed, Thu, Fri)
    - Blocked on API migration
    - Need to discuss deploy timeline
- 1:1 with Sarah (Wed, Fri)
    - Ask about promotion timeline

## Birthdays
<!-- color: #ff6b6b -->
- Steven (4/15)
- Jordan (7/22)

## Personal
<!-- color: #ff6b6b -->
- 3/20/26 - Dentist appointment

# Quotes

> The best way to predict the future is to create it — Peter Drucker

# TODO

## This Week
* [ ] Review pull requests
    Check test coverage across all modules.
    - Verify API changes
    - Review error handling
    We need to finalize before the release.
* [x] Update dependencies

## Backlog
* [ ] Refactor auth module {radar:Work}

# Goals

## Q2 2026
- [ ] Complete AWS SA Certification {radar:Certifications}
    Target: Pass exam by 5/15/26
    Due: 5/15/26
    - [x] Module 5: Networking (15%)
        Completed 3/1 — passed practice exam
    - [ ] Module 7: Architecture patterns (70%)
        Due: 5/1/26
    - [ ] Take practice exams (15%)
- [x] Ship cloud migration Phase 1
    Completed 4/8/26 — two days ahead, zero downtime

# Bookmarks

## Dev Tools
- [GitHub](https://github.com)
- [VS Code Docs](https://code.visualstudio.com/docs)

# Contacts

## Team
- Alice Chen (colleague)
    Email: alice@example.com
    Phone: 555-0101
    Notes: Frontend lead
- Bob Smith (mentor)
    Email: bob@example.com

# Notes

## General
- Meeting Prep
    Created: 3/11/26
    Updated: 3/11/26
    Tags: {radar:Work}
```

### Format Reference

| Element | Syntax |
|---------|--------|
| Swimlane | `## Name` under `# Radar` |
| Swimlane color | `<!-- color: #hex -->` after swimlane heading |
| Sub-group | `### Name` under a swimlane |
| Radar item (one-time) | `- M/D/YY - Label` (no leading zeros, 2-digit year) |
| Radar item (weekly) | `- Label (Mon, Wed, Fri)` (day names from Mon-Sun) |
| Radar item (yearly) | `- Label (M/D)` (month/day, no year) |
| Radar sub-item | `    - Text` (4 spaces indent under any radar item) |
| Todo section | `## Name` under `# TODO` |
| Todo item | `* [ ] Text` or `* [x] Text` |
| Todo due date | `    Due: M/D/YY` (4 spaces indent, before notes) |
| Todo note (paragraph) | `    Text` (4 spaces indent, no dash) |
| Todo note (bullet) | `    - Text` (4 spaces indent + dash) |
| Radar link | `* [ ] Text {radar:Swimlane}` |
| Quote | `> Text — Attribution` (em dash or `--`) |
| Goal section | `## Name` under `# Goals` |
| Goal item | `- [ ] Text` or `- [x] Text` (dash, not asterisk) |
| Goal radar link | `- [ ] Text {radar:Swimlane}` |
| Goal target | `    Target: Text` (4 spaces indent) |
| Goal due date | `    Due: M/D/YY` (4 spaces indent) |
| Goal completion note | `    Completed Text` (4 spaces indent) |
| Milestone | `    - [ ] Text (N%)` (4 spaces + dash + optional weight) |
| Milestone due date | `        Due: M/D/YY` (8 spaces indent) |
| Milestone completion note | `        Completed Text` (8 spaces indent) |
| Bookmark section | `## Name` under `# Bookmarks` |
| Bookmark item | `- [Title](URL)` under a bookmark section |
| Contact group | `## Name` under `# Contacts` |
| Contact item | `- Name (type)` under a contact group |
| Contact detail | `    Email: / Phone: / Notes:` (4 spaces indent) |
| Notebook | `## Name` under `# Notes` |
| Note page | `- Title` under a notebook heading |
| Note metadata | `    Created: / Updated: M/D/YY` (4 spaces indent) |
| Note tags | `    Tags: {radar:X} {goal:Y}` (4 spaces indent) |
| Note content | Stored in `.inc0ming/notes/<slug>.md` (GFM) |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `inc0ming.notifications.enabled` | `true` | Enable date-based notifications for radar items |
| `inc0ming.notifications.warningDays` | `7` | Days before a radar date to show a warning |
| `inc0ming.notifications.urgentDays` | `1` | Days before a radar date to show an urgent notification |

## Commands

All commands are available via the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Inc0ming** category:

- **Open Dashboard** — Open the main radar + todo dashboard
- **Refresh** — Reload data from `.inc0ming/inc0ming.md`
- **Add Swim Lane** / **Add Sub-Group** / **Add Radar Item** — Radar management
- **Edit** / **Delete** — Context menus on radar items

## Building from Source

```bash
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
```

The resulting `.vsix` can be installed via **Extensions > ... > Install from VSIX**.

## Development

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. Run `npm run watch` for live TypeScript compilation

## License

ISC
