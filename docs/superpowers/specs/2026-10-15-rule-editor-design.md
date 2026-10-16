# Rule Editor — Design (2026-10-15)

Let a visitor edit the facade grammar (the JSON rule set of the current facade type) and see the 3D result update live. This is step "C" of the studio's original goal; the studio spec (`2026-10-12-parametric-facade-studio-design.md`) made the grammar data-driven so this is an addition, not a rewrite.

## Purpose and success
- Portfolio value: the visitor sees that the facade really comes from editable rules, not from hard-coded geometry.
- Success = a visitor can open the editor, change a rule (for example a `repeat` size or a `when` condition), see either the facade change or a clear Korean error with the rule path, and get back to the original with one click. Bad input never breaks the page.

## Decisions (settled with the user, 2026-10-15)
| Topic | Decision |
|---|---|
| Edit method | A JSON text editor: a plain `<textarea>`. No editor library. (Form-based and node-graph editors rejected: several times the work.) |
| Persistence | Per facade type in `localStorage`; memory only when storage is unavailable; `원래대로` restores the built-in rules. No link sharing, no file import/export in this version. |
| Layout | A panel that opens from the right (about 480 px on desktop) via a `규칙 편집` header button; the 3D stays visible on the left; the parameter card is hidden while the panel is open. On phones the panel stacks under the 3D. |
| Look | Same dark glass style as mockup B. The user will review the finished result and ask for changes. |
| Implementation timing | Next usage window. This session produces the spec only. |

## Behavior
- Opening the panel shows the current type's rule set (the editable JSON, pretty-printed) in the textarea. The editable document is the whole type file (`params`, `rules`, `presets` ...) minus nothing: the same format a type file has.
- Input is validated 200 ms after the last keystroke:
  1. `JSON.parse` fails -> one message with the position text the parser gives.
  2. Parse ok -> `assertValid` rules (`validateType`) -> a list of `path: message` lines (for example `rules.Floor[1].size: ...`).
  3. Validation ok -> try `generate` with the current parameter values. Engine errors (shape/terminal/time limits, bad sizes, depth) are shown in the same list.
  4. All ok -> the 3D updates, the status says `적용됨`, the parameter controls are rebuilt from the edited `params`.
- On any error the 3D keeps the **last valid** rule set. The error list shows below the textarea (text only, set with `textContent`).
- Buttons: `원래대로` (back to the built-in type, clears the saved edit, resets the textarea) and `JSON 복사` (copies the textarea text; if the clipboard is unavailable the text stays selected and a Korean hint is shown).
- The type switcher and the presets keep working: each type has its own edit. Switching type closes nothing; the textarea shows the new type's current rules.
- The edited type keeps its `id`; changing `id` or `version` in the editor is a validation error (the editor edits rules, not identity).

## Persistence and failure handling
- Key `facade-studio:rules:<typeId>` holds the edited JSON text. Reads and writes are wrapped in try/catch; failure means memory only.
- On load a saved edit is validated like fresh input; if it fails to parse or validate, it is discarded and the built-in rules are used (the page never starts broken).
- Paste/input size limit 100 KB; longer input is rejected with a Korean message before parsing.

## Safety
- The input is untrusted. Already enforced by the engine and validator (Part 1/hardening PR): expression length and nesting limits, no `eval`, reserved keys rejected, shape limit 50 000, terminal limit 20 000, 250 ms generation backstop, validator never throws.
- Error text and rule names are user-controlled: always `textContent`, never `innerHTML`.
- The editor adds no network access and no new dependency.

## Out of scope (can be added later)
Line numbers, syntax highlighting, autocomplete, undo stack beyond the textarea's own, link sharing (compressed JSON in the URL hash), file import/export, adding new facade types, a form or node-graph editor, symbol-reference navigation.

## Architecture
```
web/studio/editor.js            pure state logic (no DOM), node --test covers it
web/studio/view/editor-panel.js DOM for the panel; textContent only
web/studio/app.js               wires the button, the panel and regenerate (small changes)
web/studio/studio.css           panel styles (dark glass, 480 px, stacked under 820 px)
web/index.html                  header button + panel container
tests/editor.test.mjs           state logic tests
tests/site.test.mjs             element ids, no innerHTML in the new files
```
`editor.js` interface (pure):
- `createEditor(builtinDef, storage)` where `storage` is `{ getItem, setItem, removeItem }` or null.
- `.text` (current textarea text), `.activeDef` (last valid def), `.errors` (array of strings), `.status` (`"적용됨" | "오류" | "원래 규칙"`).
- `.edit(text)` -> re-validates, updates `.errors` / `.activeDef`; ignores input over 100 KB with a message.
- `.reset()` -> built-in rules, clears storage.
- `.restore()` -> loads and validates the saved edit, falls back silently to built-in.
- `generate` is injected for testability: `edit(text, tryGenerate)` where `tryGenerate(def)` throws on engine errors.

## Testing
Automated (`node --test`, pure):
- Valid edit becomes the active def and is saved under the type's key; the next `restore()` returns it.
- Syntax error keeps the previous valid def and reports a parse message.
- Validation errors keep the previous def and list `path: message` lines.
- An engine error (for example a self-recursive rule hitting the limits) keeps the previous def and shows the message.
- `reset()` restores the built-in def, clears storage, `.text` equals the built-in JSON.
- Corrupt or invalid saved text: `restore()` uses the built-in def and does not throw; storage that throws on read/write: the editor still works in memory.
- Over-size input is rejected before parsing.
- Changing `id` or `version` is rejected.
- Round trip: built-in text -> `edit` -> unchanged def.

Browser checklist (the executor, built-in browser; unrun items reported as not run):
1. Opening the panel shows the pretty-printed rules; the parameter card hides.
2. A valid change (for example a `repeat` size) updates the 3D within about a second; the status says applied.
3. Breaking the JSON, then a bad op name, then a self-recursive rule: each shows a Korean message with the path where applicable, and the 3D stays on the last valid facade.
4. Reload: the edit comes back; `원래대로` clears it, and a reload keeps the original.
5. Saved garbage in `localStorage` (set via the console): the page starts normally with the built-in rules.
6. Switching types keeps each type's own edit; presets still load.
7. Keyboard: Tab reaches the button, textarea, `원래대로`, `JSON 복사`; the error list is announced after a pause (same pattern as the status chip).
8. Narrow screens: 1000 px and 375 px layouts; the textarea does not overflow.

## Risks
- A long error list on a badly broken rule: cap the list at 20 lines with a "그 외 N개" line.
- Re-building the parameter controls while the user types: only rebuild when the `params` part actually changed.
- The parameter schema can be edited away (for example removing `floors`); the validator and the engine already reject types the engine cannot run, so the last valid def stays.
