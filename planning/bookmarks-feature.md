# Bookmarks / Important Links Feature — Planning Document

## 1. Proposed Markdown Format

The bookmarks section lives in `inc0ming.md` under a `# Bookmarks` heading, following the same `## Section` / list-item pattern used by TODOs and Goals.

```markdown
# Bookmarks

## Dev Tools
- [GitHub](https://github.com)
- [VS Code Marketplace](https://marketplace.visualstudio.com)

## Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)

## Internal Links
- [Jira Board](https://jira.company.com/board/123)
- [Wiki Home](https://wiki.company.com)
```

**Design rationale:**
- Uses standard Markdown link syntax `[title](url)` — human-readable when editing the raw file and unambiguous for the parser.
- Sections are `## Heading` (matching TODO, Goals, and Reminders patterns).
- Items are unordered list items (`- `) containing a single Markdown link.
- No extra fields (no dates, no checkboxes, no notes). Keeps it lean per requirements.
- Parser should be lenient: a bare URL `- https://example.com` could be accepted as a bookmark with the URL as the title, but canonical format is `[title](url)`.

---

## 2. Data Model Design (TypeScript Interfaces)

Add to `src/models/types.ts`:

```typescript
interface BookmarkItem {
    kind: 'bookmark';
    id: string;
    title: string;
    url: string;
}

interface BookmarkSection {
    kind: 'bookmarkSection';
    id: string;
    name: string;
    items: BookmarkItem[];
}

interface BookmarkData {
    sections: BookmarkSection[];
}
```

This mirrors the existing pattern exactly (`TodoItem` / `TodoSection` / `TodoData`, `GoalItem` / `GoalSection` / `GoalData`).

**ID prefixes:** `bks` for BookmarkSection, `bk` for BookmarkItem (following `ts`/`td`, `gs`/`gl` patterns).

**Updates to `ParseResult`:**
```typescript
bookmarks: BookmarkData;  // NEW
```

**Updates to `WebviewMessage`:**
```typescript
| { type: 'addBookmarkSection'; name: string }
| { type: 'renameBookmarkSection'; id: string; name: string }
| { type: 'deleteBookmarkSection'; id: string }
| { type: 'addBookmark'; sectionId: string; title: string; url: string }
| { type: 'editBookmark'; id: string; title: string; url: string }
| { type: 'deleteBookmark'; id: string }
| { type: 'openBookmark'; url: string }
| { type: 'copyBookmarkUrl'; url: string }
```

---

## 3. UI/UX Design

### Dashboard Section Layout

Bookmarks follow the same pattern as TODO: a collapsible section containing a grid of section-card widgets.

```html
<div id="bookmarks-container" data-section-key="bookmarks">
    <div class="section-header collapsible" id="bookmarks-header">
        <span class="drag-grip">&#10055;</span>
        <span class="collapse-chevron open">&#9660;</span> Bookmarks
    </div>
    <div id="bookmarks-body">
        <div id="bookmarks-search-row">
            <input type="text" id="bookmarks-search" placeholder="Search bookmarks...">
        </div>
        <div id="new-bookmark-section-row">
            <input type="text" id="new-bookmark-section-input" placeholder="New category name...">
            <button id="add-bookmark-section-btn">+ Add Category</button>
        </div>
        <div id="bookmarks-grid"></div>
    </div>
</div>
```

**Key differences from TODO:**
1. No checkboxes (bookmarks are not completable).
2. No drag-and-drop reordering of items (unnecessary for links).
3. A search/filter bar at the top of the section.
4. Click on title = open URL externally. A separate copy button copies the URL.

### Search Behavior

- Text input at the top of the bookmarks section.
- Filters items across ALL sections in real-time (client-side, no messages to extension).
- Matches against both `title` and `url` (case-insensitive substring).
- Sections with no matching bookmarks are hidden during search.
- Clearing the input restores all sections/items.

### Bookmark Item Layout

```
[link-icon] Title Text          [copy-btn] [edit-btn] [delete-btn]
```

- **Click on title:** Sends `openBookmark` message → extension calls `vscode.env.openExternal(vscode.Uri.parse(url))`.
- **Copy button:** Sends `copyBookmarkUrl` message → extension calls `vscode.env.clipboard.writeText(url)`.
- **Edit button:** Inline edit for both title and URL (two-field inline edit).
- **Delete button:** Sends `deleteBookmark` message.
- **Hover:** Full URL shown in tooltip. Edit/delete/copy buttons appear on hover.

### Section Card Layout

Each section card mirrors `.grid-widget`:
- Widget header with section name (double-click to rename), add button (+), delete button (x).
- Widget body with scrollable list of bookmark items.
- Resize handle at bottom-right.

### Add Bookmark Form

Two-field form triggered by the `+` button:

```
[Title input] [URL input] [Add btn] [Cancel btn]
```

Both inputs submit on Enter. Minimal URL validation (starts with `http://` or `https://`).

---

## 4. Parser Changes

**File:** `src/parsers/incomingParser.ts`

### Section Detection

Add to the section detection loop:
```typescript
else if (trimmed === '# Bookmarks') { sectionStarts.push({ name: 'bookmarks', start: i }); }
```

### New Parser Function: `parseBookmarksSection`

- Detect `## Section` headings → create `BookmarkSection` objects.
- Match `- [Title](URL)` lines → create `BookmarkItem` objects.
- Fallback: bare URL lines `- https://...` → create item with URL as title.
- Return `BookmarkData`.

---

## 5. Serializer Changes

**File:** `src/serializers/incomingSerializer.ts`

- Add `bookmarks: BookmarkData` parameter to `serializeIncoming()`.
- Add serialization block:
  ```
  # Bookmarks

  ## SectionName
  - [Title](URL)
  ```

---

## 6. DataStore CRUD Operations

**File:** `src/services/dataStore.ts`

### New Private Field
```typescript
private _bookmarks: BookmarkData = { sections: [] };
```

### Getter
```typescript
get bookmarks(): BookmarkData { return this._bookmarks; }
```

### Find Methods
- `findBookmarkSection(id)` — find section by ID.
- `findBookmark(id)` — find item across all sections, returns `{ bookmark, section }`.

### Section Mutations
- `addBookmarkSection(name)` — create new section.
- `renameBookmarkSection(id, name)` — rename existing section.
- `deleteBookmarkSection(id)` — remove section and all its items.

### Item Mutations
- `addBookmark(sectionId, title, url)` — add item to section.
- `editBookmark(id, title, url)` — update item fields.
- `deleteBookmark(id)` — remove item from its section.

### Integration Points
- `_applyParse()`: assign `this._bookmarks = result.bookmarks;`
- `load()` error path: reset to `{ sections: [] }`.
- `save()`: pass `this._bookmarks` to `serializeIncoming`.

---

## 7. Dashboard Integration

### dashboardPanel.ts
- Add bookmarks container HTML to `_getHtml()`.
- Add `bookmarkRenderer.js` script tag and URI.
- Add `bookmarks: this._store.bookmarks` to `allData` payload.
- Add message handlers for all bookmark CRUD plus `openBookmark` and `copyBookmarkUrl`.
- `openBookmark` calls `vscode.env.openExternal(vscode.Uri.parse(url))` — no save needed.
- `copyBookmarkUrl` calls `vscode.env.clipboard.writeText(url)` — no save needed.

### bookmarkRenderer.js (NEW FILE)
- IIFE exposing `window.BookmarkRenderer = { setData }`.
- Builds `.grid-widget` cards for each section with `.bookmark-item` rows.
- Search input filters items client-side on `input` event.
- Click handlers for open, copy, edit, delete.

### dashboard.js
- Wire `BookmarkRenderer.setData()` in `handleAllData()`.
- Add `bookmarksUpdate` case to message listener.
- Add `setupCollapsible('bookmarks-header', 'bookmarks-body')`.
- Add `setupSubmitInput('new-bookmark-section-input', 'add-bookmark-section-btn', 'addBookmarkSection', 'name')`.

### dashboard.css
- Bookmark-specific styles: container, grid, search row/input, item rows, title (cyan link color), hover-reveal action buttons, two-field add form.
- Reuse existing `.grid-widget`, `.widget-header`, `.widget-body` styles.

---

## 8. Sidebar Integration

**Recommendation: No sidebar integration for v1.**

Bookmarks are a static reference tool without dates or completion states — no natural fit for the status sidebar. If desired later, a "Pinned Bookmarks" section could be added with a `{pinned}` tag in the markdown format.

---

## 9. Implementation Steps (Ordered)

| Step | File(s) | Changes |
|------|---------|---------|
| 1 | `src/models/types.ts` | Add `BookmarkItem`, `BookmarkSection`, `BookmarkData` interfaces. Update `ParseResult`, `WebviewMessage`. |
| 2 | `src/parsers/incomingParser.ts` | Add `# Bookmarks` detection. Implement `parseBookmarksSection()`. |
| 3 | `src/serializers/incomingSerializer.ts` | Add `bookmarks` parameter. Add serialization block. |
| 4 | `src/services/dataStore.ts` | Add `_bookmarks` field, getter, find/CRUD methods. Update `_applyParse()`, `load()`, `save()`. |
| 5 | `media/bookmarkRenderer.js` | **New file.** IIFE renderer with grid widgets, search, click-to-open, copy, inline edit, delete. |
| 6 | `media/dashboard.css` | Add bookmarks styles (container, grid, search, items, buttons, add form). |
| 7 | `src/panels/dashboardPanel.ts` | Add HTML, script tag, payload data, message handlers for CRUD + open + copy. |
| 8 | `media/dashboard.js` | Wire renderer, add collapsible/submit/message handling. |
| 9 | `package.json`, `src/extension.ts` | (Optional) Add `inc0ming.addBookmarkSection` and `inc0ming.addBookmark` commands. |
| 10 | Testing | Add bookmarks to `testing/inc0ming.md`. Verify round-trip, search, open, clipboard copy. |

---

## 10. Open Questions and Trade-offs

### Q1: GridManager Integration
The current `GridManager` is hard-coded to `#todo-grid`. Bookmarks widgets need either a second GridManager instance for `#bookmarks-grid`, or GridManager should be generalized to accept a grid element ID. Layout save key: `inc0ming.bookmarkGridLayout`.

### Q2: Section Ordering
The `#sections-container` drag-to-reorder already handles arbitrary `data-section-key` elements. Adding `data-section-key="bookmarks"` automatically integrates with section reordering. No changes needed to `saveSectionOrder` or `applySectionOrder`.

### Q3: Markdown Link Edge Cases
If a bookmark title contains `]` or the URL contains `)`, standard Markdown escapes apply. The parser regex handles simple cases. A more robust parser could be added later.

### Q4: Favicon/Icon Display
Fetching favicons has CSP and performance implications in a webview. **Recommendation:** Skip favicons for v1. Use a generic link icon (Unicode or SVG) as a visual indicator.

### Q5: Bulk Import
No bulk-add for v1. Users can edit `inc0ming.md` directly for bulk operations.

### Q6: URL Validation
Minimal validation only — check that URL starts with `http://` or `https://`. Don't block saving; just warn visually. Allow internal URIs or custom protocol links.

### Q7: Duplicate Detection
Not for v1. Bookmarks are a lightweight reference tool; complexity should be minimal.
