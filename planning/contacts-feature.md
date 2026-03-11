# Contacts Feature — Planning Document for Inc0ming

## 1. Recommended Storage Approach

**Recommendation: Store contacts in the same `inc0ming.md` file as a new `# Contacts` top-level section.**

### Reasoning

**Same-file advantages (recommended):**
- The parser already discovers sections order-independently by scanning for `# Heading` lines at the top level. Adding `# Contacts` is a natural extension of this pattern.
- The serializer follows the same pattern — it assembles sections in order using `parts.push()`. Adding a contacts block is straightforward.
- The DataStore manages a single file with a single file watcher and single `save()` path. Keeping one file avoids having to coordinate two file watchers, two parse cycles, and two save operations.
- Cross-referencing between contacts and other items (todos, goals, radar) is simpler when they are all parsed in one pass and live in one `ParseResult`.
- The user edits one file when they want to hand-edit in markdown.

**Separate-file disadvantages:**
- The extension's activation event is `workspaceContains:inc0ming.md`. A second file would require adding a second activation event or a secondary file watcher.
- The DataStore constructor hard-codes a single `this._filePath`. Supporting two files would require either a second DataStore or significant refactoring.
- The `serializeIncoming()` function outputs a single string representing the entire file. Splitting serialization across two files adds complexity with no proportional benefit.

**Scale concern addressed:** A contact list of several hundred entries adds perhaps 2000-5000 lines to the markdown file. Since the parser is a single-pass line scanner (not building an AST), this is negligible for performance. If the contact list ever grows to thousands of entries, a separate file could be introduced later as an optimization without changing the data model.

---

## 2. Proposed Markdown Format for Contacts

The format follows existing conventions:
- `# Contacts` as the top-level section heading
- `## Group Name` as a category/group heading
- Structured fields use indented lines under each contact entry

```markdown
# Contacts

## Colleagues
- John Smith (colleague)
    Email: john.smith@company.com
    Phone: 555-123-4567
    Notes: Engineering team lead, reports to VP of Product

- Sarah Chen (colleague)
    Email: sarah.chen@company.com
    Phone: 555-234-5678
    Notes: 1:1 every Wednesday

## Clients
- Acme Corp - Maria Rodriguez (client)
    Email: maria@acmecorp.com
    Phone: 555-345-6789
    Notes: Primary contact for Project Atlas

## Vendors
- DataDog Sales - James Wilson (vendor)
    Email: jwilson@datadog.com
    Notes: Account rep, contract renewal in Q3
```

### Format Rules

1. **Contact entry**: `- Name (type)` — the `- ` prefix matches the Radar and Goals item prefix. The type in parentheses is free-text (not a fixed enum). Users can write any type string they want (e.g., "colleague", "mentor", "recruiter", "contractor"). The UI offers autocomplete suggestions based on types already used in the file.
2. **Email**: `    Email: value` — 4-space indent, matching the existing todo notes/due-date pattern.
3. **Phone**: `    Phone: value` — same indent pattern.
4. **Notes**: `    Notes: value` — single-line notes. For multi-line notes, subsequent indented lines (without a `Key:` prefix) continue the notes, matching how todo notes work.
5. **Group headings**: `## Group Name` — maps naturally to the existing pattern used by todo sections, goal sections, and reminder meetings.

### Why This Format

- It mirrors the `## Section` / `- item` / `    field: value` hierarchy already used throughout the file.
- Contact type in parentheses after the name keeps the primary item line scannable and is easy to regex parse: `/^- (.+?) \((\w+)\)\s*$/`.
- Each field has a distinct `Key:` prefix, making the parser unambiguous and easy to extend later.

---

## 3. Data Model Design (TypeScript Interfaces)

Add to `src/models/types.ts`:

```typescript
// ===== Contact Models =====
export interface ContactItem {
    kind: 'contact';
    id: string;
    name: string;
    contactType: string;    // free-text, e.g. "colleague", "mentor", "contractor"
    email: string;
    phone: string;
    notes: string;
}

export interface ContactGroup {
    kind: 'contactGroup';
    id: string;
    name: string;
    items: ContactItem[];
}

export interface ContactData {
    groups: ContactGroup[];
}
```

### Integration Points in Existing Types

The `ParseResult` interface gains a `contacts` field:

```typescript
export interface ParseResult {
    radar: RadarData;
    todo: TodoData;
    quotes: QuoteData;
    reminders: ReminderData;
    goals: GoalData;
    contacts: ContactData;        // NEW
    errors: ParseError[];
    unparsedLines: UnparsedLine[];
}
```

The `WebviewMessage` union gains contact CRUD messages:

```typescript
// Contact messages
| { type: 'addContactGroup'; name: string }
| { type: 'renameContactGroup'; id: string; name: string }
| { type: 'deleteContactGroup'; id: string }
| { type: 'addContact'; groupId: string; name: string; contactType: string }
| { type: 'editContact'; id: string; name: string; contactType: string; email: string; phone: string; notes: string }
| { type: 'deleteContact'; id: string }
```

### Cross-Referencing Model Extension

To link contacts to todos, goals, or radar items, extend the existing `{radar:Name}` pattern with a `{contact:Name}` tag:

```typescript
// TodoItem and GoalItem gain:
contactLink?: string;     // name of linked contact
```

**Note:** `contactType` is a free-text string, not an enum. The DataStore should expose an `allContactTypes(): string[]` method that returns the unique set of types currently in use, for autocomplete suggestions in the UI. The type badge color in the renderer can be derived by hashing the type string to a hue value, ensuring consistent colors without a hardcoded mapping.

In the markdown: `* [ ] Schedule quarterly review {contact:Sarah Chen}` or `- [ ] Ship Phase 1 {radar:Infrastructure} {contact:Maria Rodriguez}`.

---

## 4. UI/UX Design

### Dashboard Section Layout

The contacts section follows the established card-based pattern used by Goals and Reminders. It appears as a new reorderable section in `#sections-container`.

**HTML Structure:**

```html
<div id="contacts-container" data-section-key="contacts">
    <div class="section-header collapsible" id="contacts-header">
        <span class="drag-grip">&#x2847;</span>
        <span class="collapse-chevron open">&#x25bc;</span>
        Contacts
        <span id="contacts-count" class="section-count-badge">0</span>
    </div>
    <div id="contacts-body">
        <div id="contacts-search-row">
            <input type="text" id="contacts-search-input" placeholder="Search contacts...">
        </div>
        <div id="new-contact-group-row">
            <input type="text" id="new-contact-group-input" placeholder="New group name...">
            <button id="add-contact-group-btn">+ Add Group</button>
        </div>
        <div id="contacts-grid"></div>
    </div>
</div>
```

**Card Layout:**
- Each `ContactGroup` renders as a card (`.contact-card`, 300px wide, matching `.goal-card`).
- Cards appear in a horizontal scroll row (`#contacts-grid` with `display: flex; gap: 12px; overflow-x: auto;`).
- Each card has: header with group name (double-click to rename), delete button on hover, list of contact entries, and "Add contact..." input at the bottom.

**Contact Entry Layout:**
- Each contact displays as a compact row within the card.
- Shows: name (bold), type badge (colored pill), and a hover-reveal delete button.
- Click to expand/collapse details (email, phone, notes) — same pattern as goals.
- Double-click on any field to inline edit (using `EditUtils.createInlineEdit()`).

**Contact Type Badge:**
- Small colored pill next to the name. Color is derived by hashing the type string to a consistent hue, so any user-defined type gets a unique color automatically (e.g., "colleague" always gets the same shade).

### Search UX

The search bar sits at the top of the contacts section. Client-side filtering:

- As the user types, non-matching contacts are hidden.
- Search matches against: name, contact type, email, phone, and notes content.
- Case-insensitive substring matching.
- Groups with zero visible contacts after filtering are also hidden.
- Clear button (x) appears when text is present.

---

## 5. Cross-Referencing Design

### Linking Contacts to Other Items

Follow the established `{radar:Name}` cross-reference pattern:

**Markdown syntax:**
```markdown
* [ ] Schedule quarterly review {contact:Sarah Chen}
* [ ] Vendor evaluation {radar:Infrastructure} {contact:James Wilson}
```

**Parser change:** In `parseTodoSection()` and `parseGoalsSection()`, after extracting `{radar:name}`, also extract `{contact:name}`.

**Visual rendering:** In the todo and goal renderers, if a `contactLink` is present, display a small contact badge (similar to the existing radar badge in goals). Double-click to edit with autocomplete against known contact names.

### Reverse Lookup

In the contacts renderer, when a contact card is expanded, show a "Referenced by" section listing all todos, goals, and radar items that mention this contact. Computed client-side by scanning the data already available in the webview.

---

## 6. Sidebar Integration

Add a lightweight "Contacts" summary section to the sidebar.

**What it shows:**
- Total contact count across all groups.
- Group counts (e.g., "Colleagues: 5, Clients: 3, Vendors: 2").
- No full contact details in the sidebar — it is a summary view.

**Implementation:**
- In `_sendData()` of `SidebarViewProvider`, compute contact summary statistics.
- In `sidebar.js`, add a `renderContacts(data)` function.
- Clicking the contacts summary navigates to the contacts section in the dashboard.

---

## 7. Implementation Steps (Ordered)

### Phase 1: Data Model and Parsing (Foundation)

| Step | File | Changes |
|------|------|---------|
| 1.1 | `src/models/types.ts` | Add `ContactType`, `ContactItem`, `ContactGroup`, `ContactData` interfaces. Add `contacts` to `ParseResult`. Add contact CRUD messages to `WebviewMessage`. Add `contactLink?` to `TodoItem` and `GoalItem`. |
| 1.2 | `src/parsers/incomingParser.ts` | Add `'# Contacts'` detection. Implement `parseContactsSection()`. Add `{contact:Name}` extraction to todo and goal parsing. |
| 1.3 | `src/serializers/incomingSerializer.ts` | Add `# Contacts` serialization block. Add `{contact:Name}` serialization to todo and goal item output. |
| 1.4 | `test/` | Contact parsing tests, serialization tests, round-trip tests, cross-reference tests. |

### Phase 2: Data Store (CRUD Operations)

| Step | File | Changes |
|------|------|---------|
| 2.1 | `src/services/dataStore.ts` | Add `_contacts` field, accessor, finders, mutation methods. Update `load()`, `save()`, `_applyParse()`. Add `allContactNames()` query for autocomplete. |

### Phase 3: Dashboard UI (Webview)

| Step | File | Changes |
|------|------|---------|
| 3.1 | `src/panels/dashboardPanel.ts` | Add contacts HTML, script tag, payload data, message handling. |
| 3.2 | `media/contactsRenderer.js` | **New file.** IIFE renderer with group cards, search, inline editing, expand/collapse. |
| 3.3 | `media/dashboard.js` | Wire `ContactsRenderer.setData()`, add collapsible/submit/dragScroll setup. |
| 3.4 | `media/dashboard.css` | Contact card styles, row styles, search input styles, type badge color variants. |

### Phase 4: Cross-Referencing UI

| Step | File | Changes |
|------|------|---------|
| 4.1 | `media/todoRenderer.js` | Render contact badge, double-click to edit with autocomplete. |
| 4.2 | `media/goalsRenderer.js` | Same contact badge and autocomplete editing. |
| 4.3 | `media/contactsRenderer.js` | Reverse lookup — "Referenced by" list in expanded contact details. |

### Phase 5: Sidebar Integration

| Step | File | Changes |
|------|------|---------|
| 5.1 | `src/panels/sidebarViewProvider.ts` | Add contact summary data to payload. |
| 5.2 | `media/sidebar.js` | Add `renderContacts(data)` function. |
| 5.3 | `src/panels/sidebarViewProvider.ts` | Add contacts status HTML section. |

### Phase 6: Extension Commands

| Step | File | Changes |
|------|------|---------|
| 6.1 | `package.json` | Add commands: `inc0ming.addContact`, `inc0ming.addContactGroup`, etc. |
| 6.2 | `src/extension.ts` | Register command handlers for contact CRUD. |

---

## 8. Open Questions and Trade-Offs

### Open Questions

1. **Contact deduplication.** If the same person appears in multiple groups, should the system warn? Simplest approach: allow duplicates, leave it to the user. Cross-references use the name string, so duplicates could cause ambiguity.

3. **Contact group ordering.** Should groups be reorderable? Preserving markdown order (as with all other sections) seems sufficient initially.

4. **Multi-line notes.** For very long notes, the card UI might need a scroll area or a modal.

5. **Contact photos/avatars.** Not supported in the initial version. Could be considered later via a `Photo: path/to/image` field.

6. **Search performance.** Client-side search over all fields is O(n) per keystroke. For hundreds of contacts, this is negligible. For thousands, a debounce (150ms) on the search input should suffice.

### Trade-Offs

| Decision | Trade-off |
|---|---|
| Same file vs. separate file | Simplicity and cross-referencing ease vs. potential file size growth. Chose same file for consistency. |
| Contact type as inline `(type)` — free-text | Clean, scannable markdown. Any string is accepted; UI offers autocomplete from existing types. Color derived from string hash. |
| Client-side search only | No index needed, zero complexity vs. could be slow with 1000+ contacts. Acceptable for target use case. |
| Cross-reference by name string | Simple, human-readable in markdown vs. fragile if contact is renamed. Mitigation: when a contact is renamed, scan and update all `{contact:OldName}` references. |
| Expanding card pattern (not modal) | Consistent with goals UI vs. limited space for many fields. Acceptable for the defined field set. |
| No dedicated contact tree view | Reduces scope vs. less discoverability from sidebar. The sidebar summary section provides a lightweight alternative. |
