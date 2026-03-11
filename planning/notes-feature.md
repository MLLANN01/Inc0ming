# Notes Feature — Planning Document

**Date:** 2026-03-11
**Extension:** Inc0ming v0.5.0

---

## 1. Current Architecture Summary

### Data Flow

```
inc0ming.md --> incomingParser.ts --> DataStore (in-memory) --> dashboardPanel.ts (webview HTML)
                                          |                         |
                                          |                    postMessage()
                                          |                         |
                                     incomingSerializer.ts    media/*.js renderers (IIFE)
                                          |
                                     inc0ming.md (write)
```

### CSP Policy (from dashboardPanel.ts)

```
default-src 'none';
style-src ${webview.cspSource} 'nonce-${nonce}';
script-src 'nonce-${nonce}';
img-src ${webview.cspSource};
```

Key observations:
- `img-src` already allows `${webview.cspSource}` — images served via `webview.asWebviewUri()` will work.
- `img-src` does NOT allow `data:` URIs or `blob:` URIs. This will need to change for inline images.
- No `style-src 'unsafe-inline'` — any WYSIWYG editor that injects inline styles will need the nonce mechanism.

### Cross-Reference Pattern

Existing pattern uses `{radar:SwimlaneName}` tags appended to item text. Parsed by regex. Used by TodoItems and GoalItems.

---

## 2. Recommended Architecture

### Storage Strategy: Hybrid Approach

**Recommendation: Notes index in `inc0ming.md`, note content in separate files.**

Rationale:
- Note pages can contain substantial rich content (headings, lists, code blocks, images). Embedding all of this in `inc0ming.md` would bloat the file significantly.
- The existing parser is a line-by-line state machine for structured, concise formats. Freeform rich markdown inside notes would be difficult to delimit reliably.
- Separate files keep note content clean and portable (each note is a valid standalone markdown file).
- The index in `inc0ming.md` preserves the "single source of truth" principle for the notebook/page structure, tags, and metadata.

**File Layout:**

```
workspace-root/
  inc0ming.md                    # Main dashboard file (index of notes)
  .inc0ming/                     # Hidden folder for notes content
    notes/
      meeting-prep.md            # Individual note files (slug-based)
      architecture-decisions.md
      sprint-retrospective.md
    media/                       # Images referenced by notes
      img_a1b2c3d4.png
      img_e5f6g7h8.jpg
```

### Data Model

New types to add to `src/models/types.ts`:

```typescript
export interface NotePage {
    kind: 'notePage';
    id: string;
    title: string;
    slug: string;           // filename stem, e.g. "meeting-prep"
    createdAt: string;      // ISO date string
    updatedAt: string;      // ISO date string
    tags: NoteTag[];        // cross-references
    notebookId: string;     // parent notebook ID
}

export interface NoteTag {
    type: 'radar' | 'goal' | 'todo' | 'note';
    target: string;         // swimlane name, goal ID, todo ID, or note slug
}

export interface NoteNotebook {
    kind: 'noteNotebook';
    id: string;
    name: string;
    pages: NotePage[];
}

export interface NoteData {
    notebooks: NoteNotebook[];
}
```

---

## 3. WYSIWYG Editor Recommendation

### Options Evaluated

| Feature | TipTap | Milkdown | Quill | ProseMirror (raw) |
|---|---|---|---|---|
| Markdown-native | No (plugin) | Yes (core) | No | No |
| Vanilla JS support | Yes | Yes | Yes | Yes |
| CSP nonce support | Yes (`injectNonce`) | Unknown | Partial | Manual |
| Bundle size (gzip) | ~45kb core | ~40kb | ~43kb | ~32kb |
| Headless/unstyled | Yes | Yes | No (opinionated) | Yes |
| Markdown round-trip | Via extension | Native | Via plugin | Manual |
| Image extension | Built-in | Built-in | Built-in | Manual |

### Recommendation: TipTap

**Primary choice: TipTap (vanilla JS mode)**

Reasons:
1. **CSP nonce support is built in.** TipTap's Editor constructor accepts an `injectNonce` option that adds the nonce to all dynamically created style elements. Critical for VS Code webview CSP.
2. **Vanilla JavaScript support.** The codebase uses no framework. TipTap works with plain JS via `@tiptap/core`.
3. **Markdown via `@tiptap/pm/markdown`.** TipTap can serialize/deserialize markdown, giving us the "visual editor that stores markdown" behavior.
4. **Modular architecture.** Only include needed extensions: StarterKit, Image, Link, TaskList, Table. Tree-shakable for minimal bundle.
5. **Active maintenance.** Best documentation and ecosystem of the candidates.
6. **Headless/unstyled.** The dashboard uses VS Code theme variables; TipTap's headless approach lets us style the editor to match perfectly.

**Why not Milkdown?** Lacks documented CSP nonce support. The strict webview CSP would require investigation and potential patching.

**Why not Quill?** Opinionated styling, no clean CSP nonce support, less clean markdown round-trip.

### Build Strategy

Since the extension currently uses raw JS files (no bundler), adding TipTap requires a build step:

- **Recommended:** Use esbuild to bundle TipTap and its extensions into a single `noteEditor.js` file placed in `media/`. The rest of the codebase stays as-is. The `compile` script adds an esbuild step.

---

## 4. Image Handling Strategy

### Recommended Approach: Workspace Media Folder + webview.asWebviewUri()

**Storage:** Images saved to `.inc0ming/media/` with content-hashed filenames (e.g., `img_a1b2c3d4.png`).

**Workflow:**
1. User pastes or drops an image into the TipTap editor.
2. The webview sends a message to the extension: `{ type: 'uploadNoteImage', data: '<base64>', mimeType: 'image/png', noteSlug: 'meeting-prep' }`.
3. The extension host writes the file to `.inc0ming/media/img_<hash>.png`, then responds with the webview URI.
4. The TipTap editor inserts the image in the live DOM and stores `![](../.inc0ming/media/img_<hash>.png)` in the markdown source.
5. When rendering notes, the extension translates relative paths to webview URIs before sending to the webview.

**CSP Changes Required:**

```
img-src ${webview.cspSource} data:;
```

(`data:` is only used as a transient preview during upload. Final images use the webview URI scheme.)

**localResourceRoots Change:**

```typescript
localResourceRoots: [
    vscode.Uri.joinPath(extensionUri, 'media'),
    vscode.Uri.joinPath(workspaceUri, '.inc0ming', 'media'),
]
```

### Markdown Image References

In stored `.md` files, images use relative paths:

```markdown
![Architecture](../media/img_a1b2c3d4.png)
```

This keeps note files portable. When the extension loads a note for display, it rewrites image paths to webview URIs.

### Image Size Limits

Consider a configuration option for max image size (default: 5MB). Large images should be resized/compressed before saving.

---

## 5. Cross-Referencing Design

### Extended Tag Syntax for Notes

```
{radar:SwimlaneName}    -- link to a radar swimlane (existing)
{goal:GoalText}         -- link to a goal by text match
{todo:TodoText}         -- link to a todo by text match
{note:NoteSlug}         -- link to another note page
```

### How Tags Work in Notes

Tags can appear in two places:

1. **Note index in inc0ming.md** (metadata line under the page entry):
   ```markdown
   - Meeting Prep
       Tags: {radar:Infrastructure} {goal:Ship cloud migration Phase 1}
   ```

2. **Inline in note content** (within the .md file body):
   ```markdown
   This is related to the {radar:Infrastructure} swim lane and
   the {todo:Cloud migration runbook} task.
   ```

### Tag Rendering

- In the dashboard, tags render as clickable badges.
- Clicking a tag navigates to the referenced item (using existing `navigateTo` mechanism).
- In the WYSIWYG editor, tags render as inline "chip" elements that are non-editable but deletable.

### Bidirectional References

When a note tags a todo or goal, that todo/goal should show a "Referenced in Notes" indicator. Computed at render time by scanning NoteData for tags pointing to each item.

---

## 6. UI/UX Design

### Dashboard Integration

```html
<div id="notes-container" data-section-key="notes">
    <div class="section-header collapsible" id="notes-header">
        <span class="drag-grip">&#x2847;</span>
        <span class="collapse-chevron open">&#x25bc;</span> Notes
        <span id="notes-count" class="section-count-badge">0</span>
    </div>
    <div id="notes-body">
        <div id="notes-notebook-tabs"></div>
        <div id="notes-page-list"></div>
        <div id="notes-editor-area" class="hidden"></div>
    </div>
</div>
```

### Navigation Flow

1. **Notebook tabs** along the top of the notes section (horizontal scrollable strip).
2. **Page list** showing note titles with created/updated dates, tag badges, and snippet preview.
3. **Clicking a page** opens the TipTap editor inline (replacing the page list).
4. **Back button** returns to the page list.
5. **"+ New Page"** button creates a new note with a default title.

### Editor Toolbar

Minimal floating toolbar:
- Bold, Italic, Strikethrough
- Heading (H1/H2/H3 dropdown)
- Bullet List, Ordered List, Task List
- Code Block, Blockquote
- Link, Image (opens file picker)
- Tag (opens tag picker with autocomplete)
- Separator: Horizontal Rule

### Sidebar Integration

Add "Recent Notes" section showing the 3 most recently modified notes with clickable titles that navigate to the note in the dashboard.

### Keyboard Shortcuts

- `Ctrl+S` in the editor: Save the note content
- `Escape`: Close editor and return to page list
- Standard: `Ctrl+B` (bold), `Ctrl+I` (italic), etc.

---

## 7. inc0ming.md Format Proposal

### New Section: `# Notes`

```markdown
# Notes

## General
- Meeting Prep
    Created: 3/11/26
    Updated: 3/11/26
    Tags: {radar:Infrastructure} {goal:Ship cloud migration Phase 1}
- Architecture Decisions
    Created: 3/5/26
    Updated: 3/10/26
    Tags: {note:meeting-prep}

## Project Alpha
- Sprint Retrospective
    Created: 3/1/26
    Updated: 3/8/26
    Tags: {radar:Security Blocks}
- Design Review Notes
    Created: 2/28/26
    Updated: 3/6/26
```

### Parsing Rules

- `## NotebookName` = notebook heading
- `- PageTitle` = note page entry (unindented list item)
- `    Created: M/D/YY` = 4-space indented metadata
- `    Updated: M/D/YY` = 4-space indented metadata
- `    Tags: {type:target} ...` = 4-space indented tags line

### Slug Generation

Page slug derived from title: lowercase, spaces to hyphens, strip non-alphanumeric:
- "Meeting Prep" -> `meeting-prep`
- "Architecture Decisions" -> `architecture-decisions`

If slug collision occurs, append numeric suffix: `meeting-prep-2`.

### Note Content Files

Each page corresponds to `.inc0ming/notes/<slug>.md` with standard GitHub Flavored Markdown:

```markdown
# Meeting Prep

## Agenda Items

- Review cloud migration status
- Discuss Phase 1 cutover timeline {radar:Infrastructure}
- Budget variance follow-up

## Action Items

- [ ] Prepare failover test results
- [ ] Draft rollback runbook

## Diagram

![Network topology](../media/img_a1b2c3d4.png)
```

---

## 8. Implementation Steps

### Phase 1: Foundation (Data Model and Storage)

| Step | File | Changes |
|------|------|---------|
| 1.1 | `src/models/types.ts` | Add `NotePage`, `NoteTag`, `NoteNotebook`, `NoteData` interfaces. Add `notes` to `ParseResult`. Add note messages to `WebviewMessage`. |
| 1.2 | `src/parsers/incomingParser.ts` | Add `# Notes` detection. Implement `parseNotesSection()`. |
| 1.3 | `src/serializers/incomingSerializer.ts` | Add `notes: NoteData` parameter. Add Notes section serialization. |
| 1.4 | `src/services/dataStore.ts` | Add `_notes` field, accessor, note file I/O (`loadNoteContent`, `saveNoteContent`), `.inc0ming/` directory creation, CRUD mutations, file watcher for `.inc0ming/notes/*.md`. |

### Phase 2: WYSIWYG Editor Bundle

| Step | File | Changes |
|------|------|---------|
| 2.1 | `package.json` | Add devDependencies: `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/pm`, `esbuild`. |
| 2.2 | `media/noteEditor.src.js` | **New file** (source). Initialize TipTap with `injectNonce`, configure extensions, create custom Tag node extension, expose as `window.NoteEditor = { init, setContent, getMarkdown, destroy }`. Bundled to `media/noteEditor.js`. |
| 2.3 | `package.json` | Add esbuild step to `compile` and `watch` scripts. |

### Phase 3: Dashboard Integration

| Step | File | Changes |
|------|------|---------|
| 3.1 | `src/panels/dashboardPanel.ts` | Add `noteEditor.js` script tag. Add notes container HTML. Update CSP (`data:` in `img-src`). Update `localResourceRoots`. Pass nonce as global for TipTap. |
| 3.2 | `media/notesRenderer.js` | **New file.** IIFE renderer with notebook tabs, page list, editor area. Handles page open/close, TipTap integration, image paste/drop. |
| 3.3 | `media/dashboard.js` | Wire `NotesRenderer.setData()`, add message handlers, collapsible setup. |
| 3.4 | `media/dashboard.css` | Notes container, notebook tabs, page list, editor area, toolbar, tag chips styles. |

### Phase 4: Message Handling and Commands

| Step | File | Changes |
|------|------|---------|
| 4.1 | `src/models/types.ts` | Add messages: `addNotebook`, `renameNotebook`, `deleteNotebook`, `addNotePage`, `editNotePageTitle`, `deleteNotePage`, `requestNoteContent`, `saveNoteContent`, `uploadNoteImage`, `updateNoteTags`. |
| 4.2 | `src/panels/dashboardPanel.ts` | Add cases to `_handleMessage()` for all note messages. Handle `requestNoteContent` (read + rewrite image paths), `saveNoteContent` (rewrite URIs + write), `uploadNoteImage` (decode + write + respond). |
| 4.3 | `package.json`, `src/extension.ts` | Register commands: `inc0ming.addNotebook`, `inc0ming.addNotePage`. |

### Phase 5: Sidebar and Cross-References

| Step | File | Changes |
|------|------|---------|
| 5.1 | `src/panels/sidebarViewProvider.ts` | Add "Recent Notes" section to sidebar HTML. Include recent notes data in `_sendData()`. |
| 5.2 | `src/services/dataStore.ts` | Add `computeNoteReferences()` — reverse index of which notes reference each item. |
| 5.3 | `media/sidebar.js`, `media/sidebar.css` | Render "Recent Notes" section. |

### Phase 6: Polish and Testing

| Step | File | Changes |
|------|------|---------|
| 6.1 | `media/notesRenderer.js` | Debounced auto-save (1-2s after last keystroke). Unsaved changes indicator. |
| 6.2 | `test/notesParser.test.ts` | **New file.** Parse, slug generation, tag parsing, serialization round-trip tests. |
| 6.3 | Various | Graceful handling of missing `.inc0ming/`, corrupt/missing note files, slug collisions. |

---

## 9. Open Questions and Trade-offs

### Q1: Should note content be included in inc0ming.md at all?
**Trade-off:** Keeping note content in separate files means `inc0ming.md` alone is not a complete backup. However, putting rich content inline would make the parser fragile and bloat the file.
**Mitigation:** Document that `.inc0ming/` folder must be version-controlled alongside `inc0ming.md`.

### Q2: What happens when the user renames a note page?
The slug changes, so the file must be renamed. All `{note:old-slug}` tags must be updated.
**Recommendation:** Use title-derived slugs but implement rename propagation. If too complex for v1, use UUID-based filenames with the title stored only in the index.

### Q3: TipTap bundle size and load time
~50-80KB gzipped with tree-shaking. Loaded once and cached by `retainContextWhenHidden: true`.
**Mitigation:** Lazy-load the editor bundle only when the user first opens a note.

### Q4: Offline image handling
Images stored in `.inc0ming/media/` are workspace-local and work offline.
**Recommendation:** Always download/save external images locally on paste. Do not allow external image URLs.

### Q5: Conflict with external edits
If a user edits a note `.md` file outside the extension, the WYSIWYG editor should detect the change and reload.
**Recommendation:** Add file watcher for `.inc0ming/notes/` (similar to existing `inc0ming.md` watcher).

### Q6: Maximum note size
Very large notes with many images could be slow in TipTap.
**Recommendation:** Warning when note content exceeds 100KB and/or max 20 images per note.

### Q7: Search across notes
Future consideration: search command using `vscode.workspace.findTextInFiles()`. Out of scope for v1 but the file layout (individual `.md` files) supports it naturally.

### Q8: Export/Import
Since notes are standard markdown files, export is trivial (copy `.inc0ming/`). Import by dropping `.md` files into the notes folder. V2 feature.
