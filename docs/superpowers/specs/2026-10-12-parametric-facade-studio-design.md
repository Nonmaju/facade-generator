# Parametric Facade Studio — Design (2026-10-12)

Pivot of this repo (same repo, evolved): a browser-only parametric facade studio. A shape grammar turns parameters into a facade; Three.js shows it with real-time PBR material swapping. The earlier SDXL+ControlNet renders stay as an offline AI gallery tab.

## Purpose and success
- Portfolio piece. A visitor opens the page, sees a facade immediately, and within 30 seconds can switch presets, move sliders, and swap materials. No explanation needed.
- Story told by the README: SDXL on a free GPU worked offline -> a public demo can't have a GPU -> rebuild as CPU/browser procedural generation.
- Success = the 30-second demo works on GitHub Pages (after a separate deploy OK), grammar logic is unit-tested, browser behavior checked by checklist.

## Constraints
- Cost 0, no GPU, static site, everything in the browser. Plain ES modules, no build step.
- Textures CC0 only (ambientCG), 1K JPG, credited in README.
- **Deploy / enabling Pages / renaming the repo need the user's explicit OK first.** `.env` is gitignored: never commit or print it.
- UI text in Korean. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Decisions (settled with the user)
| Topic | Decision |
|---|---|
| Facade types | 3 now: grid punched-window, curtain wall, louver/masonry. Built so a rule editor (C) is an additive later step. |
| Parameters | Common 6 (floors, bays, window ratio, floor height, rhythm, seed) + 1-2 per type. |
| Existing UI | Reuse direction: two tabs. Gallery tab is demo-only; live-mode UI is not exposed, `queue.js`/`render.js`/`server/` kept as code. |
| Concrete UI visuals | **Not decided here.** A mockup gate comes first (see Plan structure). |
| Textures | 6 materials x (color + normal + roughness) 1K JPG: concrete, brick, wood, plaster, metal panel, stone. Glass is a texture-less `MeshPhysicalMaterial`. |
| Sketch input (OpenCV.js) | Out of v1; documented as next step (a sketch -> param-values converter fits on top of the param schema). |
| Presets | 2 per type (6 total), first preset auto-loaded on entry, "random" button changes only the seed. |
| Demo video | Not needed; the live Pages site replaces it. |
| Verification | Grammar via `node --test`; browser via checklist run by Claude in the built-in browser; unrun items reported plainly. |
| Repo | Same repo, evolved. Renaming (e.g. `facade-studio`) is optional and needs a separate OK. |

## Architecture
Grammar is pure JS (no DOM, no Three.js) so it is testable with `node --test`. The view layer is thin.

```
web/
  index.html            two tabs: 스튜디오 / AI 갤러리 (visuals per mockup gate)
  studio/
    grammar/            expr.js (safe expression parser), engine.js, rng.js, validate.js
    types/              grid.json, curtainwall.json, louver.json
    view/               scene.js, materials.js, controls.js
  gallery/              existing demo-gallery code moved here; no live-mode UI
  textures/<material>/{color,normal,rough}.jpg
tests/grammar/*.test.mjs
```
- Three.js loaded via an importmap from a CDN with an exact pinned version.
- Data flow: sliders/preset -> `engine(ruleset, params, seed)` -> terminal boxes `{x,y,z,w,h,d,mat,role,path}` (meters, axis-aligned, no rotation) -> grouped per material slot -> instance matrices rewritten. A material swap replaces the slot's material object only; geometry is not rebuilt.
- Material slots: the user swaps 2 slots (primary finish, secondary finish) among the 6 materials. Glass and frame are fixed per type.

## Grammar
Rule set: `{ version: 1, axiom, rules: { Symbol: [{ when?, op, ...args }] } }`; the first rule whose `when` is true wins. Recursion depth cap 32.

Ops (only these six; a new op is added only if two types need it): `split` (axis, parts), `repeat` (axis, size, symbol or pattern+map), `inset` (l,r,t,b, inner, frame), `extrude` (depth, offset; negative offset = recess), `emit` (mat, role), `nil` (a hole).

Sizes: absolute expression, `{r:n}` relative, or `"~"` fill-remainder. If absolutes exceed the parent they are scaled down proportionally (the single overflow rule). `repeat` fits `floor(len/size)` tiles and stretches them to fill exactly. Rhythm = cyclic `pattern` string indexed by `index % length` with a letter->symbol `map`.

Expressions: a small hand-written parser (no `eval`, no `new Function`). Scope: `params.*`, `shape.w/h`, `index`, `count`, `rand()`; functions `min max clamp floor`; operators `+ - * / %`, comparisons, `&& || !`, ternary. Parsed once per rule set, ASTs cached.

Randomness: seeded PRNG (mulberry32); per-shape seed = hash(global seed, child-index path such as `0.3.2`). No shared stream, so one slider never reshuffles everything.

Left out of v1: rotation, non-rectangular shapes, 3D mass/roof ops, user-defined functions, JS callbacks inside rules (enforced by a JSON round-trip test per type), editor UI/undo/graph view. Two cheap C-enablers only: the `version` field and a validator that reports the rule path in error messages.

### Facade type file
`{ version, id, label (Korean), params: [{key, type: int|float|enum|pattern, min, max, step, default, label}], rules, presets: [{label, values}] }`. Sliders are generated from `params`; presets are `{type, values}`. This is the same format a future editor would save.

### The three types
1. **grid** — floors by `split(y)`, bays by `repeat(x)`, each bay `inset` = frame + recessed glass, wall box behind; a `B` bay is a blank wall panel. Type params: storefront ground floor (on/off), parapet height.
2. **curtainwall** — mullions by `repeat(x)`, each floor `split(y)` into spandrel panel + vision glass; window ratio = vision-glass height ratio. Type param: mullion divisions per bay (1-4).
3. **louver** — masonry wall with openings plus thin horizontal louvers by `repeat(y)` extruded outward. Type params: louvers per floor, louver depth.

Common 6 params: floors, bays, window ratio, floor height, rhythm (regular `A` / alternate `AB` / group `AAB` / random via `rand()`), seed.

## Rendering
- One `InstancedMesh` per material slot, unit `BoxGeometry`, per-instance matrices; capacity allocated at 2x and reallocated only on overflow.
- Box UVs would stretch textures: use world-space UVs via an `onBeforeCompile` patch, with a per-material "one texture tile = N meters" setting. Budget about one day.
- Lighting: hemisphere + directional + Three.js built-in `RoomEnvironment` (no external HDRI download). `OrbitControls`. Glass = transparent `MeshPhysicalMaterial` with environment reflection.
- PNG screenshot button (reuses the existing download code).

## Plan structure and the UI mockup gate
1. UI-independent work first: grammar engine + tests, three type files, Three.js view core, a throwaway debug page.
2. **UI mockup gate:** before any real UI code, obtain mockups (Claude Design, or an artifact made by Claude; method chosen at that point), the user reviews them and decides. No UI implementation before that approval.
3. UI implementation per the approved mockup.
4. Move the gallery into its tab, README story, credits.
5. Final checks.

Rough schedule 3-5 weeks (unmeasured estimate).

## Testing
Automated (`node --test`, pure):
- Tiling: children of every split/repeat sum to the parent within 1e-6 and stay inside it.
- No overlaps among coplanar terminals of the same layer (O(n^2) is fine at test sizes).
- Count invariants: grid windows = floors x bays (minus storefront); mullions = bays x divisions + 1.
- Determinism: same params+seed deep-equal; a different seed changes only `rand`-dependent fields.
- Stability: changing `floors` does not change ground-floor terminal paths.
- Expression parser: case table; rejects `constructor`, `__proto__`, unknown identifiers.
- Each type file survives `JSON.parse(JSON.stringify(...))` unchanged; validator accepts all shipped types.
- Perf smoke: largest preset generates in under 50 ms (loose bound).
- Golden snapshot per preset: terminal count + bounding box only.

Browser checklist (Claude, built-in browser, local `python -m http.server`): all 6 presets load, sliders regenerate, 6 materials swap on both slots, tab switch works, screenshot button works, console errors = 0, screenshots saved. Anything not run is reported as not run.

## Risks
- UV stretching on instances (patch above; fallback: accept stretch on thin parts or merge geometry per slot).
- Op vocabulary creep (rule: new op only if two types need it).
- Over-building for the editor (only `version` + validator now).
- Rules sliding back into code (JSON round-trip test).
- CDN version drift (pinned exact version) and texture size (6 materials, about 6-9 MB expected).

## Out of scope
Sketch input (OpenCV.js), rule editor (C), demo video, live-mode UI, deployment, repo rename.

## Credits
Textures: ambientCG (CC0), listed per material in README at implementation time. Existing: `villa_elev` is a crop of Rijksmuseum RP-T-1966-65-1 (CC0); `modern` is drawn by the author.
