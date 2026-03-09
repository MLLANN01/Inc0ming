# Changelog

## [0.2.0] - 2026-03-08

### Added
- **Rich todo notes** — todo items now support free-form paragraph text and bullet lists (was bullet-only `details`)
- Notes are viewable, editable, and addable from the dashboard via double-click on the expanded notes area
- Notes indicator icon on todo items that have notes
- Empty-state "Click to add notes..." prompt when expanding a todo with no notes
- Click any todo text to expand/collapse (no longer requires existing notes)
- **Reminders section** — meeting talking points with day-of-week tags (`# Reminders`)
- Add/edit/delete meetings with day badges (Mon, Tue, etc.)
- Add/edit/delete talking points per meeting
- Clear all points from a meeting
- Today-highlight on meetings scheduled for the current day
- Reminder card UI with inline editing and day badges
- Claude Code `/inc0ming` skill updated with reminders and notes operations

### Changed
- `TodoItem.details: string[]` replaced with `TodoItem.notes: string` (breaking data model change)
- Parser now captures both `    text` (paragraph) and `    - text` (bullet) indented lines under todos
- Serializer outputs notes lines with 4-space indent, preserving paragraph vs bullet distinction
- SKILL.md updated for both `.claude/skills/` and `skills/` locations

## [0.1.0] - 2026-03-08

### Added
- Radar scanner with animated sweep line and swimlane rows
- Swimlane detail cards with drag-to-reorder
- Sub-group (swimlane section) CRUD
- TODO grid with resizable, draggable widget cards
- TODO sections with drag-and-drop items between sections
- Quote/inspiration management with random display
- Calendar date picker for radar items
- Collapsible swimlane details and inspiration sections
- Scanner sweep toggle
- Layout persistence across sessions
- File watcher for external `inc0ming.md` edits
- Parse error diagnostics with line numbers
- Sidebar webview with status and agenda
- Date-based notification settings
- Claude Code `/inc0ming` skill for natural language management
