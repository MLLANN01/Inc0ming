# Changelog

## [0.8.2] - 2026-03-25

### Added
- **Meeting notes modal** — click any meeting row to open a centered modal for viewing and editing agenda items. Supports add, inline edit, and delete of sub-items, plus double-click to rename the meeting title. Close with ×, backdrop click, or Escape.
- **Meeting row drag-to-reorder** — drag the grip handle on meeting rows to reorder them vertically. Order persists across sessions.

### Changed
- **Meeting Notes redesigned** — replaced horizontal scrolling cards with a compact vertical list. Each row shows the meeting name, day badges, and an agenda item count. All editing is done through the modal, removing redundant inline controls from the list view.
- New swimlanes and radar items now correctly appear on the scanner canvas and sidebar — fixed a bug where `filterNonRecurring` was applied to all radar data instead of only canvas blips, which hid empty swimlanes and broke new item visibility.
- All dashboard sections now start collapsed by default.

## [0.8.1] - 2026-03-18

### Changed
- Recurring radar items (weekly meetings, yearly events) no longer appear in the sidebar Upcoming list — only one-time dated items and virtual blips (goals, milestones, todos) are shown

## [0.8.0] - 2026-03-12

### Added
- **Recurring radar items** — weekly (`- Label (Mon, Wed, Fri)`) and yearly (`- Label (4/15)`) recurrence patterns on radar items. Weekly items show day badges and today-highlighting; yearly items auto-advance to the next occurrence on the scanner.
- **Radar sub-items** — any radar item (one-time, weekly, or yearly) can have indented sub-items (`    - text`) for talking points, notes, or checklists. Add, edit, and delete inline from the dashboard.
- **Contacts dashboard section** — contacts moved from the sidebar tree view into the dashboard as grid widgets (matching the Bookmarks pattern). Groups render as cards with inline add/edit/delete for contacts, double-click to rename groups, and a search bar that filters across all groups.
- **Add Radar Item command** — now prompts for recurrence type (one-time date, weekly days, or yearly month/day) via QuickPick

### Changed
- **Reminders consolidated into Radar** — the separate `# Reminders` section is removed. Meeting reminders are now weekly radar items with sub-items under a swimlane (e.g., `- Standup (Mon, Wed)` with `    - talking point` sub-items). Existing reminder data should be migrated to radar items.
- Recurring radar items are filtered from the scanner canvas — only one-time dated items appear as blips
- Recurring items are never shown as "past due" or archived — they auto-advance to the next occurrence
- All dashboard sections start collapsed by default

### Fixed
- **Notes editor rendering** — bullet lists, ordered lists, code blocks, and horizontal rules now render correctly in the TipTap editor. Root cause was a ProseMirror-to-TipTap node type name mismatch (`bullet_list` vs `bulletList`, etc.) that silently dropped content. The markdown serializer also handles both naming conventions for round-trip fidelity.
- Consistent drag grip character (`\u2847`) and chevron encoding across all dashboard section headers (Radar, Meeting Notes, Contacts)

### Removed
- `# Reminders` section and all reminder types (`ReminderMeeting`, `ReminderPoint`, `ReminderData`)
- Radar tree view from sidebar explorer (`radarTreeProvider.ts`) — radar items are managed via the dashboard
- Contacts tree view from sidebar explorer (`contactsTreeProvider.ts`) — replaced by dashboard section
- 4 contact command palette commands (`addContactGroup`, `addContact`, `editContact`, `deleteContactItem`)
- All reminder-specific message handlers and CRUD operations

## [0.7.0] - 2026-03-11

### Added
- **Notes section** — TipTap WYSIWYG editor with notebooks, pages, and rich content (headings, lists, task lists, code blocks, blockquotes, images, links). Auto-save with 2-second debounce and manual save via Ctrl+S/Cmd+S button.
- **Fullscreen note editor** — expand button in the toolbar fills the entire dashboard viewport; Escape or click to exit
- **Image support in notes** — paste or drag-and-drop images into the editor; stored in `.inc0ming/media/`
- **Image cleanup** — removing an image from a note, deleting a note page, or deleting a notebook automatically deletes orphaned image files from `.inc0ming/media/`
- **Note search & retrieval** — SKILL.md operations for Read Note Content, Edit Note Content, Search Notes (grep across all note files), and Find Notes by Tag
- **Contacts tree view** — native VS Code TreeView in the explorer panel for managing contact groups, contacts, and details (email, phone, notes) with full CRUD via context menus

### Changed
- **Data file relocated** — `inc0ming.md` moved from workspace root to `.inc0ming/inc0ming.md`, keeping all extension data contained in one folder
- Activation event updated to `workspaceContains:.inc0ming/inc0ming.md`
- Reminders section renamed to "Meeting Reminders"
- Removed 10 redundant command palette commands (addTodo, addTodoSection, toggleTodo, addQuote, editQuote, deleteQuote, addMeeting, addPoint, addNotebook, addNotePage) — all handled by the dashboard UI
- Bookmark cards no longer show non-functional resize handles

### Fixed
- Notes editor no longer closes unexpectedly during auto-save (save handler no longer triggers full re-render cycle)
- Notebook/page delete properly cleans up `.md` content files and orphaned images
- Editor closes correctly when its parent notebook or page is deleted
- Note page delete button now visible on hover (was using wrong CSS class)
- Notes section header alignment consistent with other dashboard sections

## [0.6.2] - 2026-03-11

### Fixed
- Radar grid now appears when reopening the dashboard with the scanner sweep toggled off — `resizeCanvas()` calls `draw()` after computing blips so the canvas is repainted when the `ResizeObserver` fires, and `onDidChangeViewState` sends a redraw message when the panel regains visibility

## [0.6.1] - 2026-03-11

### Added
- **Bookmark drag-and-drop** — drag bookmark items between sections to reorganize, with drop indicator and visual feedback matching the TODO drag-and-drop pattern

## [0.6.0] - 2026-03-11

### Added
- **Contacts tree view** — native VS Code TreeView in the explorer panel replacing the dashboard webview section. Contact groups, contacts, and details (email, phone, notes) displayed hierarchically with group/person/detail icons. Full CRUD via context menus and title bar buttons (Add Contact Group, Add Contact, Edit Contact, Delete).
- **Bookmark resizing** — bookmark grid cards are now resizable and draggable like TODO widgets, using the same 12-column grid layout and GridManager

### Fixed
- Bookmark resize handles now work — switched from `auto-fill` CSS grid to 12-column layout compatible with GridManager's `span N` resize logic
- GridManager now supports multiple grids (TODO and Bookmarks) instead of being hardcoded to `#todo-grid`

### Removed
- Contacts section from dashboard webview (replaced by tree view)
- Contacts section from sidebar status view (managed via tree view)
- `contactsRenderer.js` dashboard renderer
- `contactsUpdate` and 6 contact webview message types (CRUD now handled via VS Code commands)

## [0.5.0] - 2026-03-10

### Added
- **Past Due section in sidebar** — overdue todos, goals, milestones, and radar items listed with type badges, urgency dots, and days-overdue counts; clickable to navigate to the item in the dashboard
- **Archive section in dashboard** — completed todos, completed goals (with completion notes and milestone summaries), and past radar events grouped by type; collapsible, drag-to-reorder with other sections; items can be deleted inline
- **Cross-view navigation** — clicking sidebar items (past due and upcoming) opens the dashboard and scrolls to the relevant item with a highlight pulse animation
- **Radar blip click-to-navigate** — clicking virtual blips (goals, milestones, todos) on the scanner canvas navigates to and highlights the source item in its section
- `computePastDue()` and `computeArchive()` cached computed views on DataStore
- `highlightItem()` on GoalsRenderer (supports both goals and milestones, auto-expands collapsed goal details) and TodoRenderer (auto-expands notes)
- `expandSection()` helper on DashboardBridge for programmatic section uncollapse
- `navigateTo()` public method on DashboardPanel for cross-webview navigation
- `data-goal-id` / `data-milestone-id` data attributes on goal and milestone DOM elements for targeted navigation

### Improved
- Sidebar agenda items are now clickable (navigate to dashboard) with pointer cursor
- Sidebar past-due and agenda items pass `sourceType` through the navigation chain for accurate goal vs milestone handling

## [0.4.0] - 2026-03-10

### Added
- **Todo edit button** — pencil icon on hover for inline text editing (replaces double-click)
- **Radar right-click context menu** — right-click any blip on the scanner canvas to edit or delete it, including virtual blips from goals/milestones/todos
- **Stacked radar tooltip** — hovering over overlapping blips now shows all items at that position, not just one
- Milestone due date input when adding milestones from the dashboard

### Fixed
- Radar tree view edit/delete commands now work — VS Code passes the tree element, not the TreeItem, to context menu commands
- Virtual radar items no longer show edit/delete buttons in the tree view (they are managed via Goals/TODOs)
- Radar canvas no longer disappears when resizing the editor pane — uses `ResizeObserver` instead of `window.resize`, with zero-width guard
- Goals and reminders horizontal scroll position preserved across edits
- Todo expand/collapse no longer conflicts with editing

### Improved
- `computeAugmentedRadar()` result is now cached and invalidated on data changes, reducing redundant computation
- Radar animation loop pauses when the tab is hidden or sweep is disabled, reducing CPU usage
- Dashboard initialization batched into a single `allData` message instead of 8+ separate `postMessage` calls
- Unified `.due-badge` CSS class replaces three separate badge rule sets
- Extracted reusable `setupCollapsible()` and `setupSubmitInput()` helpers in dashboard.js
- ~300 lines of duplicated date/edit JS removed from renderers

### Removed
- Dead CSS selectors (`#ai-assist-container`, `.ai-idea-item`, `#add-todo-top-btn`)
- Unused `setSwimlaneColor()` method from DataStore
- Unused `getUpcomingCount()` method from notifications

## [0.3.0] - 2026-03-09

### Added
- **Goals section** — longer-term aspirations with weighted milestones, progress tracking, due dates, completion notes, and radar cross-references (`# Goals`)
- Goal sections, goal items (`- [ ]`/`- [x]`), milestones with optional `(N%)` weights, target notes, due dates, and completion notes
- Goals progress bar calculated from completed milestone weights
- **Todo due dates** — `Due: M/D/YY` line under todo items, with color-coded urgency badges on the dashboard
- **Radar tree view** — hierarchical sidebar view of all radar items organized by swimlane and sub-group, with urgency-colored icons
- Virtual radar blips for goals, milestones, and todos that have due dates or radar links — appear on the radar canvas as diamonds (goals), flags (milestones), and stars (todos)
- Shared date and inline-edit utilities for webview renderers (`dateUtils.js`, `editUtils.js`)
- Shared `getNonce()` utility (`src/utils/nonce.ts`)
- Centralized virtual item type detection (`src/utils/virtualItems.ts`)

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
