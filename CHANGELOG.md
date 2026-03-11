# Changelog

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
