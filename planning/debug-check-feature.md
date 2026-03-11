# Inc0ming Debug/Check Feature — Design Plan

## 1. Current State of Error Handling

### What Already Exists

**Parser-level error collection** (`src/parsers/incomingParser.ts`):
- The `parseIncoming()` function collects errors into a `ParseError[]` array and unparsed lines into an `UnparsedLine[]` array.
- The `ParseError` interface (defined in `src/models/types.ts`) has `line`, `content`, and `message` fields.
- The `UnparsedLine` interface has `content` and `afterSection` fields but notably **no line number**.

**Currently detected errors (Radar section only)**:
1. **Bad date format** on radar items — when `parseDateMDYY()` returns null. Error message: `Could not parse date "X" -- expected M/D/YY format`.
2. **Malformed radar item syntax** — when a line starts with `- ` inside a swimlane but does not match `- M/D/YY - Label`. Error message: `Expected format "- M/D/YY - Label"`.
3. **Orphaned radar items** — items appearing before any `## swimlane` heading. Error message: `Item found before any ## swimlane heading`.

**Diagnostics infrastructure** (`src/services/dataStore.ts`):
- `_diagnostics: vscode.DiagnosticCollection` is created with the key `'inc0ming'`.
- `_updateDiagnostics()` maps `ParseError[]` to `vscode.Diagnostic` objects with `DiagnosticSeverity.Warning` and populates the collection.
- Line numbers are 1-based in `ParseError` and converted to 0-based for VS Code ranges.

**User-facing error notification** (DataStore `load()` method):
- When errors exist after parsing, a warning message is shown: `Inc0ming: N parse issue(s) in inc0ming.md` with a "Show File" action.
- This is only shown on load, not on subsequent file changes.

**Dashboard error forwarding** (`src/panels/dashboardPanel.ts`):
- `parseErrors` is included in the `allData` payload when errors exist.
- However, the dashboard JavaScript (`dashboard.js`) does **not** currently handle or display `parseErrors` in any way.

### What Is Missing

**No validation at all in these sections:**
- TODO section parser silently drops lines it does not recognize.
- Quotes section parser silently ignores non-quote lines.
- Reminders section parser silently ignores unrecognized lines.
- Goals section parser silently ignores lines that do not match expected patterns.

**No structural validation:**
- Missing top-level `#` headings are not reported.
- Duplicate section headings are not detected.
- Empty sections (headings with no items) are not flagged.
- Milestone weight consistency (sum != 100) is not validated.
- Cross-reference validity (`{radar:Name}` pointing to nonexistent swimlane) is not checked.
- Due date format validation is not performed on goals/todos.

**No command to trigger validation on demand:**
- The existing error detection only runs during `load()` or file-change watcher events.
- There is no dedicated "check" or "validate" command registered in `package.json`.

---

## 2. Proposed Validation Rules

### Error (DiagnosticSeverity.Error) — Items will not render correctly

| ID | Section | Rule | Detection Logic |
|----|---------|------|----------------|
| E001 | Radar | Invalid date format on radar item | `parseDateMDYY()` returns null for `- X - Label` |
| E002 | Radar | Malformed radar item syntax | Line starts with `- ` inside swimlane but does not match `- DATE - LABEL` |
| E003 | Radar | Orphaned radar item (before any swimlane) | `- ` line encountered while `currentSwimlane` is null |
| E004 | TODO | Malformed checkbox syntax | Line starts with `*` but does not match `* [ ] text` or `* [x] text` — common typo is `* [] text` or `* [X] text` or using `-` instead of `*` |
| E005 | TODO | Todo item before any section heading | `* [ ] text` line encountered while `currentSection` is null |
| E006 | Goals | Malformed goal checkbox | Line starts with `- ` at root indent but does not match `- [ ] text` or `- [x] text` |
| E007 | Goals | Malformed milestone checkbox | 4-space indented line starts with `- ` but does not match `- [ ] text` or `- [x] text` |
| E008 | Goals | Goal item before any section heading | Goal checkbox line while `currentSection` is null |
| E009 | Structure | Duplicate top-level section heading | Two `# Radar`, two `# TODO`, etc. |
| E010 | Structure | Unknown top-level heading | `# SomethingElse` that is not one of the recognized sections |

### Warning (DiagnosticSeverity.Warning) — Likely unintended, may cause confusion

| ID | Section | Rule | Detection Logic |
|----|---------|------|----------------|
| W001 | Radar | Sub-group without parent swimlane | `### ` heading before any `## ` swimlane heading |
| W002 | TODO | Invalid due date format | `Due:` line where value does not match M/D/YY |
| W003 | Goals | Invalid due date on goal or milestone | `Due:` value does not pass `parseDateMDYY()` |
| W004 | Goals | Milestone weights do not sum to 100% | After parsing all milestones of a goal, total != 100 (only if any have explicit weights) |
| W005 | Goals | Mixed weighted and unweighted milestones | Some milestones have explicit `(N%)` and some do not |
| W006 | Cross-ref | Broken radar link | `{radar:Name}` where Name does not match any swimlane in `# Radar` |
| W007 | TODO | Indented content with no parent todo | 4-space indented line when `currentItem` is null |
| W008 | Goals | Indented content with no parent goal | 4-space or 8-space indented line when `currentGoal` or `currentMilestone` is null |
| W009 | Reminders | Talking point without parent meeting | `- text` line before any `## Meeting` heading |
| W010 | Reminders | Invalid day tag | Parenthetical contains unrecognized day abbreviations |
| W011 | Structure | Empty section | A `## Heading` with no items before the next heading or EOF |
| W012 | Radar | Swimlane color metadata in wrong position | `<!-- color: X -->` appearing after items rather than immediately after `## Heading` |

### Information (DiagnosticSeverity.Information) — Stylistic or advisory

| ID | Section | Rule | Detection Logic |
|----|---------|------|----------------|
| I001 | Radar | Past-due radar item | Radar item date is in the past |
| I002 | TODO | Overdue todo | Todo with `Due:` date in the past and not completed |
| I003 | Goals | Overdue goal or milestone | Goal/milestone with `Due:` date in the past and not completed |
| I004 | Goals | Completed goal with incomplete milestones | Goal marked `[x]` but has milestones marked `[ ]` |
| I005 | Quotes | Non-standard quote format | Line in Quotes section that does not start with `> ` |
| I006 | Structure | Unrecognized lines in section | Lines that were silently skipped by the parser |
| I007 | TODO | Todo has radar link but no due date | Linked to radar but no `Due:` so it will not appear on scanner |

---

## 3. Diagnostics Integration Design

### 3.1 Problems Panel Integration

The existing `_diagnostics` collection is the right mechanism. The current `_updateDiagnostics()` method needs to be expanded to handle the full validation rule set.

**Diagnostic structure per rule:**
```
- Range: line number (0-based), column 0 to end of line
- Severity: Error / Warning / Information (per table above)
- Source: 'inc0ming'
- Code: rule ID (e.g., 'E001', 'W004')
- Message: human-readable description
```

**Line number tracking requirement:** The current parser only tracks line numbers for the Radar section. The TODO, Quotes, Reminders, and Goals parsers need to receive and track `lineOffset` so that each validation issue includes its precise line number. This is the most significant parser change required.

### 3.2 Architecture: Separate Validator

**Recommended: Separate `FileValidator` class** rather than embedding all validation into the parser.

Rationale:
- The parser's job is to produce the data model. It should continue to report hard parse errors (E001-E003) that prevent data extraction.
- The validator operates on the raw file content independently, performing a second pass specifically for diagnostics.
- This keeps the parser focused and testable, and allows the validator to check cross-cutting concerns (broken radar links, weight sums) that span multiple sections.

The validator would:
1. Accept the raw file content string.
2. Accept the parsed `ParseResult` (for cross-reference checks that need the data model).
3. Return a `ValidationResult` containing an array of `ValidationIssue` objects.

### 3.3 Code Actions (Quick Fixes)

VS Code supports `CodeActionProvider` to offer quick fixes. This would be a separate class that registers for the `inc0ming.md` file and provides fixes based on the diagnostic code.

This is a **Phase 2** feature. For the initial implementation, diagnostics in the Problems panel is the primary goal.

---

## 4. Quick Fix / Auto-Repair Possibilities

### High Feasibility (Phase 2)

| Diagnostic | Fix | Mechanism |
|-----------|-----|-----------|
| E004: `* [] text` (missing space) | Insert space: `* [ ] text` | `WorkspaceEdit` text replacement |
| E004: `* [X] text` (capital X) | Lowercase: `* [x] text` | `WorkspaceEdit` text replacement |
| W002/W003: `Due: 3-15-26` (dashes) | Convert to `Due: 3/15/26` | `WorkspaceEdit` text replacement |
| W002/W003: `Due: 03/15/2026` (4-digit year) | Convert to `Due: 3/15/26` | `WorkspaceEdit` text replacement |
| E001: `13/1/26` (likely D/M/YY) | Offer swap: `1/13/26` | `WorkspaceEdit` with user confirmation |
| W011: Empty section | Offer to remove heading | `WorkspaceEdit` line deletion |

### Medium Feasibility (Phase 3)

| Diagnostic | Fix |
|-----------|-----|
| W004: Weights don't sum to 100% | Offer to redistribute evenly |
| W006: Broken radar link | Show quickpick of existing swimlane names |
| E005/E008: Item before section | Move item under first section of its type |

---

## 5. Common Corruption Patterns and How to Detect Them

### Pattern 1: Wrong checkbox prefix in TODO section
**What happens:** User writes `- [ ] text` instead of `* [ ] text` in TODO.
**Effect:** Item silently ignored by TODO parser.
**Detection:** Regex scan in TODO section for lines matching `^- \[[ x]\]` that are not indented.

### Pattern 2: Tab characters instead of 4 spaces
**What happens:** Editors sometimes insert tabs instead of spaces for indentation.
**Effect:** `Due:` lines, notes, and milestones are not recognized.
**Detection:** Scan for lines containing `\t` inside any section.

### Pattern 3: Incorrect indentation depth
**What happens:** 2-space or 3-space indent instead of 4-space.
**Effect:** Lines silently ignored.
**Detection:** Lines starting with 1-3 spaces followed by `Due:`, `Completed`, `- [`, or `- text`.

### Pattern 4: Stray `#` heading levels
**What happens:** User adds `#### Sub-sub-group` or `# ` inside a section body.
**Effect:** May split sections unexpectedly or be silently ignored.
**Detection:** Scan for heading levels that don't match expected patterns for the current section.

### Pattern 5: Missing blank line between sections
**What happens:** No blank line after a section's last item before the next `# Section`.
**Effect:** Usually benign, but can mask other issues.
**Detection:** Advisory check for consistent blank line separators.

### Pattern 6: Color comment on wrong line
**What happens:** `<!-- color: #ff6699 -->` placed before the `## Swimlane` heading or after items.
**Effect:** Color assigned to wrong swimlane.
**Detection:** Check that color comments appear on the line immediately following a `##` heading.

### Pattern 7: Unicode whitespace
**What happens:** Non-breaking spaces (U+00A0) or other Unicode whitespace pasted from web/documents.
**Effect:** Regex matches fail silently.
**Detection:** Scan for non-ASCII whitespace characters on any line.

### Pattern 8: Duplicate swimlane or section names
**What happens:** Two `## Work` headings in TODO or two `## Birthdays` in Radar.
**Effect:** `{radar:Work}` cross-references become ambiguous.
**Detection:** Collect heading names per top-level section and flag duplicates.

### Pattern 9: Missing `## section` in TODO/Goals
**What happens:** User writes items directly under `# TODO` without a `## Section` heading.
**Effect:** Items are silently dropped.
**Detection:** Track `currentSection === null` when encountering item lines.

### Pattern 10: Milestone on wrong goal (indentation error)
**What happens:** A milestone line appears when `currentGoal` is null.
**Effect:** Milestone is silently ignored.
**Detection:** Track `currentGoal === null` when encountering 4-space indented `- [ ]` lines.

---

## 6. Command Registration and UX Flow

### 6.1 Command Registration

Add to `package.json` `contributes.commands`:
```json
{
  "command": "inc0ming.checkFile",
  "title": "Check File",
  "icon": "$(checklist)",
  "category": "Inc0ming"
}
```

### 6.2 UX Flow

1. User opens Command Palette, types "Inc0ming: Check File".
2. The command handler:
   a. Reads the current `inc0ming.md` content.
   b. Runs the `FileValidator` against the raw content + parsed result.
   c. Populates the `_diagnostics` collection with all issues.
   d. Shows a summary notification:
      - If no issues: `"Inc0ming: No issues found in inc0ming.md"` (information message).
      - If issues: `"Inc0ming: Found N issue(s) in inc0ming.md"` with actions "Show Problems" and "Show File".
   e. "Show Problems" opens the Problems panel.
   f. "Show File" opens `inc0ming.md` in the editor.
3. User clicks an issue in the Problems panel to jump to the exact line.

### 6.3 Automatic vs. On-Demand

- **On-demand (primary):** The `inc0ming.checkFile` command runs the full validation suite.
- **Automatic (lightweight):** The existing `_updateDiagnostics()` call continues to show hard parse errors on every load/save. Optionally expanded to include a fast subset of rules.

---

## 7. Implementation Steps

### Step 1: Add Line Number Tracking to All Parsers
**File:** `src/parsers/incomingParser.ts`

Currently, only `parseRadarSection` receives `lineOffset` and `errors`. Modify the signatures of `parseTodoSection`, `parseQuotesSection`, `parseRemindersSection`, and `parseGoalsSection` to also receive `lineOffset` and `errors`/`unparsedLines` parameters. Track `lineNumber = lineOffset + i + 1` in each section parser's loop.

### Step 2: Create the ValidationIssue Type
**File:** `src/models/types.ts`

```typescript
interface ValidationIssue {
    line: number;       // 1-based
    column: number;     // 0-based
    endColumn: number;  // 0-based
    severity: 'error' | 'warning' | 'info';
    code: string;       // e.g. 'E001', 'W004'
    message: string;
    section?: string;   // 'radar' | 'todo' | 'goals' | 'reminders' | 'quotes' | 'structure'
}

interface ValidationResult {
    issues: ValidationIssue[];
    summary: { errors: number; warnings: number; info: number };
}
```

### Step 3: Create the FileValidator
**New file:** `src/services/fileValidator.ts`

The validator:
- Accepts `content: string` and `parseResult: ParseResult`
- Performs a line-by-line scan of the raw content, running section-aware rules
- Performs cross-section checks (broken radar links, weight sums, duplicate names)
- Returns `ValidationResult`

### Step 4: Enhance DataStore with Validation Support
**File:** `src/services/dataStore.ts`

- Add a `validate(): ValidationResult` public method.
- Expand `_updateDiagnostics()` to accept `ValidationIssue[]`.
- Add a `runCheck(): ValidationResult` method that calls `validate()`, updates diagnostics, and returns the summary.

### Step 5: Register the Command
**Files:** `package.json`, `src/extension.ts`

```typescript
vscode.commands.registerCommand('inc0ming.checkFile', async () => {
    const result = store.runCheck();
    if (result.summary.errors + result.summary.warnings + result.summary.info === 0) {
        vscode.window.showInformationMessage('Inc0ming: No issues found in inc0ming.md');
    } else {
        const total = result.summary.errors + result.summary.warnings + result.summary.info;
        const action = await vscode.window.showWarningMessage(
            `Inc0ming: Found ${total} issue(s) in inc0ming.md`,
            'Show Problems', 'Show File'
        );
        if (action === 'Show Problems') {
            vscode.commands.executeCommand('workbench.actions.view.problems');
        } else if (action === 'Show File') {
            const doc = await vscode.workspace.openTextDocument(store.filePath);
            vscode.window.showTextDocument(doc);
        }
    }
});
```

### Step 6: Write Tests for the Validator
**New file:** `test/fileValidator.test.ts`

Tests for each validation rule, clean file tests, edge case tests.

### Step 7: Expand Existing Parser Error Reporting
**File:** `src/parsers/incomingParser.ts`

Add error reporting to TODO, Goals, Reminders, and Quotes parsers for Error-severity rules (E004-E008).

### Step 8 (Phase 2): CodeActionProvider for Quick Fixes
**New file:** `src/services/codeActionProvider.ts`

Register a `vscode.CodeActionProvider` for `{ language: 'markdown', pattern: '**/inc0ming.md' }` that provides `WorkspaceEdit` fixes for high-feasibility items.

---

## 8. Open Questions and Trade-offs

### Q1: Should the validator run automatically on every save, or only on-demand?
**Recommendation:** Run the full validator only on-demand (`inc0ming.checkFile`). Keep existing lightweight error reporting running automatically. Optionally run a "fast subset" automatically.

### Q2: Should the `ParseError` type be unified with `ValidationIssue`?
**Recommendation:** Keep `ParseError` for backward compatibility. The validator converts `ParseError[]` into `ValidationIssue[]` as part of processing. Consolidate in a future major version.

### Q3: How should "info" diagnostics be handled?
**Recommendation:** Info-level diagnostics should only be shown when the user runs the explicit check command. Consider a setting (`inc0ming.checkFile.showInfo: boolean`).

### Q4: Should the `UnparsedLine` type track line numbers?
**Recommendation:** Add an optional `line?: number` field to `UnparsedLine`. Non-breaking change.

### Q5: Should the check command support auto-fix?
**Recommendation:** Two separate commands: `inc0ming.checkFile` (read-only) and `inc0ming.fixFile` (applies safe auto-fixes). Phase 1 is check-only. Quick fixes via `CodeActionProvider` provide a more granular alternative.

---

## Summary of File Changes

| Step | File | Change Type |
|------|------|-------------|
| 1 | `src/parsers/incomingParser.ts` | Modify (add lineOffset to all section parsers) |
| 2 | `src/models/types.ts` | Modify (add ValidationIssue, ValidationResult) |
| 3 | `src/services/fileValidator.ts` | **New file** (core validator logic) |
| 4 | `src/services/dataStore.ts` | Modify (add validate(), enhance _updateDiagnostics()) |
| 5 | `package.json` | Modify (add inc0ming.checkFile command) |
| 5 | `src/extension.ts` | Modify (register checkFile command handler) |
| 6 | `test/fileValidator.test.ts` | **New file** (validator tests) |
| 7 | `src/parsers/incomingParser.ts` | Modify (add error reporting to non-Radar parsers) |
| 8 | `src/services/codeActionProvider.ts` | **New file** (Phase 2, quick fixes) |
