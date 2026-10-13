# Parametric Facade Studio — Implementation Plan, Part 2 (studio page, README)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the engine and 3D view from Part 1 into the real studio page (approved mockup B), make the seed control honest, and rewrite the README as the project story.

**Architecture:** One static page (`web/index.html`) with a full-bleed Three.js canvas and floating controls. The page glue (`studio/app.js`) stays thin; everything testable lives in pure modules (`studio/state.js`, the grammar, the type JSON). The seed's visibility is data (`showWhen` in the type schema), not hard-coded UI. The old gallery page is renamed and no longer linked.

**Tech Stack:** Plain ES modules (no build step), Three.js 0.160.0 via importmap, `node --test`, Python 3 + Pillow only for the one-off swatch tool.

**Spec:** `docs/superpowers/specs/2026-10-12-parametric-facade-studio-design.md` (decisions table: studio tab = mockup B, no gallery tab, `랜덤` switches rhythm to random and the seed shows only then).

**Mockup:** https://claude.ai/artifact/ApANK5WvetZidis1o3xYPw (private claude.ai canvas; boards `B.dc.html` = the studio, `Mobile.dc.html` = phone layout, restyled with B's dark palette; `Main.dc.html` = rejected option A; `Gallery.dc.html` is obsolete). If the link does not open for the executor, the CSS in Task 3 is the source of truth.

## Global Constraints

- Cost 0, no GPU, static site, everything in the browser. Plain ES modules, no build step.
- UI text in Korean. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Deploy / enabling Pages / renaming the repo need the user's explicit OK first.** `.env` is gitignored: never commit or print it.
- Textures CC0 only (ambientCG), 1K JPG, credited in the README. No new downloads in this plan.
- Grammar code stays pure JS (no DOM, no Three.js under `web/studio/grammar/` and `web/studio/state.js`). Rule sets are JSON only: no functions, no `eval`.
- Run every command from the repository root (the worktree). `npm test` is `node --test` (Node 24 does not accept a directory argument; pass file paths).
- Commit command shape: `git commit -m "<subject>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`. Push only to the work branch (`git push origin claude/lucid-sammet-a4b4c4`); the user merges.
- Browser checks: the three.js CDN and the pane can be slow after a reload, and requestAnimationFrame pauses while the pane is hidden. Wait until `#status` is non-empty before scripting, and take a screenshot before reading `#status` (it wakes rendering). The browser caches ES modules on `localhost:8000`: before checking a changed file run `fetch(url, {cache: "reload"})` for it in the page, or use a fresh port.

## Review Focus

Conditions the spec implies but a reasonable person could trip over; each has a test or checklist line in the named task.

1. **Seed visibility across state changes:** after `랜덤` shows the seed slider, picking a non-random preset or another type must hide it again; the seed must never be visible while it has no effect. Task 1 (state tests) and Task 3 checklist.
2. **`랜덤` must always change the facade:** in all three types, repeated presses give different facades, and the new seed is never equal to the current one. Task 1.
3. **Mid-width overlap:** at 1000-1359 px the dock, the right column and the status chip must not cover each other, and the dock must stay on one line. Task 3 checklist.
4. **Keyboard and screen-reader basics:** every control reachable with Tab and visibly focused; groups have names; pressed state is exposed (`aria-pressed`). Task 3 checklist.
5. **Failure paths:** a missing type file shows a Korean message instead of a blank page; no WebGL shows the Korean notice; a failed PNG save does not throw. Task 3 (site test covers the `#fallback` element; checklist covers the missing file).

## File structure

```
web/index.html                 NEW studio page (the old gallery page moves to legacy-gallery.html)
web/legacy-gallery.html        renamed old index.html, not linked
web/studio/app.js              NEW page glue (replaces debug.js)
web/studio/state.js            NEW pure state helpers
web/studio/studio.css          NEW styles (mockup B)
web/studio/view/controls.js    REWRITTEN (segmented buttons, showWhen)
web/studio/grammar/validate.js MODIFIED (showWhen)
web/studio/types/*.json        MODIFIED (seed.showWhen)
web/textures/<id>/thumb.jpg    NEW swatch thumbnails (x6)
tools/make_thumbs.py           NEW
tests/state.test.mjs  tests/site.test.mjs   NEW
tests/grammar/validate.test.mjs  tests/textures.test.mjs   MODIFIED
README.md  docs/images/studio.png   REWRITTEN / NEW
web/studio-debug.html  web/studio/debug.js   DELETED
```

---

### Task 1: `showWhen` schema field and pure state helpers

**Files:**
- Create: `web/studio/state.js`
- Modify: `web/studio/grammar/validate.js`, `web/studio/types/grid.json`, `web/studio/types/curtainwall.json`, `web/studio/types/louver.json`
- Test: `tests/state.test.mjs` (new), `tests/grammar/validate.test.mjs` (append)

**Interfaces:**
- Consumes: `generate` (Part 1), `mulberry32` (Part 1), `typeIds`/`loadType` from `tests/grammar/helpers.mjs` (Part 1).
- Produces: `defaultValues(def)`, `loadPreset(def, preset?) -> values`, `isVisible(param, values) -> boolean`, `randomize(def, values, rand?) -> values` (rhythm `"random"`, a seed different from the current one, input not mutated). Type-file param field `showWhen: { key, equals }` (`key` = another enum or bool param; `equals` = one of its options, or true/false). All three types get `seed.showWhen = { key: "rhythm", equals: "random" }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/state.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../web/studio/grammar/engine.js";
import { mulberry32 } from "../web/studio/grammar/rng.js";
import { defaultValues, loadPreset, isVisible, randomize } from "../web/studio/state.js";
import { typeIds, loadType } from "./grammar/helpers.mjs";

const mini = {
  params: [
    { key: "bays", type: "int", min: 2, max: 12, step: 1, default: 6 },
    { key: "rhythm", type: "enum", default: "regular", options: [{ value: "regular" }, { value: "random" }] },
    { key: "seed", type: "int", min: 0, max: 9, step: 1, default: 3, showWhen: { key: "rhythm", equals: "random" } },
  ],
};

test("loadPreset: schema defaults overridden by the preset, and missing preset means defaults", () => {
  assert.deepEqual(defaultValues(mini), { bays: 6, rhythm: "regular", seed: 3 });
  assert.deepEqual(loadPreset(mini, { values: { bays: 9 } }), { bays: 9, rhythm: "regular", seed: 3 });
  assert.deepEqual(loadPreset(mini, undefined), defaultValues(mini));
});

test("isVisible: the seed shows only while rhythm is random; plain params always show", () => {
  const [bays, , seed] = mini.params;
  assert.equal(isVisible(bays, { rhythm: "regular" }), true);
  assert.equal(isVisible(seed, { rhythm: "regular" }), false);
  assert.equal(isVisible(seed, { rhythm: "random" }), true);
});

test("randomize: rhythm becomes random, the seed changes and stays in range, nothing else changes", () => {
  const before = { bays: 7, rhythm: "regular", seed: 3 };
  const after = randomize(mini, before, mulberry32(1));
  assert.equal(after.rhythm, "random");
  assert.equal(after.bays, 7);
  assert.notEqual(after.seed, 3);
  assert.ok(Number.isInteger(after.seed) && after.seed >= 0 && after.seed <= 9);
  assert.deepEqual(before, { bays: 7, rhythm: "regular", seed: 3 }, "input must not be mutated");
});

test("randomize never returns the seed it was given, even if the random source repeats it", () => {
  for (let current = 0; current <= 9; current++) {
    const after = randomize(mini, { bays: 6, rhythm: "random", seed: current }, () => current / 10);
    assert.notEqual(after.seed, current, `current seed ${current}`);
    assert.ok(after.seed >= 0 && after.seed <= 9);
  }
});

test("randomize on a type without a seed param still switches the rhythm and adds no seed", () => {
  const noSeed = { params: [mini.params[1]] };
  assert.deepEqual(randomize(noSeed, { rhythm: "regular" }), { rhythm: "random" });
});

for (const id of typeIds()) {
  const def = loadType(id);

  test(`${id}: the seed is hidden for the presets and shown after 랜덤`, () => {
    const seed = def.params.find((p) => p.key === "seed");
    assert.deepEqual(seed.showWhen, { key: "rhythm", equals: "random" });
    for (const pr of def.presets.filter((p) => p.values.rhythm !== "random")) {
      assert.equal(isVisible(seed, loadPreset(def, pr)), false, pr.label);
    }
    assert.equal(isVisible(seed, randomize(def, loadPreset(def, def.presets[0]))), true);
  });

  test(`${id}: pressing 랜덤 repeatedly gives visibly different facades`, () => {
    const rand = mulberry32(42);
    let values = { ...loadPreset(def, def.presets[0]), bays: 8 };
    const looks = new Set();
    for (let i = 0; i < 20; i++) {
      values = randomize(def, values, rand);
      looks.add(JSON.stringify(generate(def, values).terminals.map((t) => `${t.path}:${t.mat}:${t.role}`)));
    }
    assert.ok(looks.size >= 3, `only ${looks.size} distinct facades from 20 presses`);
  });
}
````

Append this test to the end of `tests/grammar/validate.test.mjs` (it uses the file's existing `errorsOf` helper and `good()` type; `params[0]` is the int `n`, `params[1]` the enum `r`, `params[2]` the bool `b`):

```js

test("showWhen must name another enum or bool param and one of its values", () => {
  assert.deepEqual(errorsOf((d) => (d.params[0].showWhen = { key: "r", equals: "a" })), []);
  assert.deepEqual(errorsOf((d) => (d.params[0].showWhen = { key: "b", equals: true })), []);
  assert.match(errorsOf((d) => (d.params[0].showWhen = { key: "nope", equals: "a" })).join(), /params\[0\]\.showWhen: key must name another param/);
  assert.match(errorsOf((d) => (d.params[0].showWhen = { key: "n", equals: 1 })).join(), /showWhen: key must name another param/); // itself
  assert.match(errorsOf((d) => (d.params[1].showWhen = { key: "n", equals: 1 })).join(), /params\[1\]\.showWhen: target must be an enum or bool/);
  assert.match(errorsOf((d) => (d.params[0].showWhen = { key: "r", equals: "zzz" })).join(), /showWhen: target must be an enum or bool/);
  assert.match(errorsOf((d) => (d.params[0].showWhen = { key: "b", equals: "true" })).join(), /showWhen: target must be an enum or bool/);
  assert.match(errorsOf((d) => (d.params[0].showWhen = "r")).join(), /showWhen/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/state.test.mjs tests/grammar/validate.test.mjs`
Expected: FAIL: `tests/state.test.mjs` cannot find `web/studio/state.js`; the new validate test fails (the validator ignores `showWhen`, so the error cases produce no errors).

- [ ] **Step 3: Implement**

Create `web/studio/state.js`:

````javascript
// Pure helpers for the studio page state (no DOM), so node --test can cover them.

export const defaultValues = (def) => Object.fromEntries(def.params.map((p) => [p.key, p.default]));

/** Values for a preset: the schema defaults overridden by the preset's own values. */
export const loadPreset = (def, preset) => ({ ...defaultValues(def), ...(preset?.values ?? {}) });

/** A param is shown unless its `showWhen` condition fails (e.g. the seed only while rhythm is "random"). */
export const isVisible = (param, values) => !param.showWhen || values[param.showWhen.key] === param.showWhen.equals;

/** The 랜덤 button: switch rhythm to "random" and draw a different seed, so every click changes the facade. */
export function randomize(def, values, rand = Math.random) {
  const next = { ...values, rhythm: "random" };
  const seed = def.params.find((p) => p.key === "seed");
  if (seed) {
    const range = seed.max - seed.min + 1;
    let s = seed.min + Math.floor(rand() * range);
    if (s === values.seed && range > 1) s = seed.min + ((s - seed.min + 1) % range);
    next.seed = s;
  }
  return next;
}
````

In `web/studio/grammar/validate.js`, in the params loop, directly after the line `} else if (typeof p.default !== "boolean") bad(at, "bool default must be true/false");` and before that loop's closing `});`, add:

```js
    if (p.showWhen !== undefined) {
      const w = p.showWhen;
      const target = params.find((q) => q.key === w?.key);
      const okEquals = target?.type === "enum" ? target.options?.some((o) => o.value === w.equals) : target?.type === "bool" ? typeof w.equals === "boolean" : false;
      if (!target || target.key === p.key) bad(`${at}.showWhen`, "key must name another param");
      else if (!okEquals) bad(`${at}.showWhen`, "target must be an enum or bool param and equals one of its values");
    }
```

In each of `web/studio/types/grid.json`, `curtainwall.json`, `louver.json`, change the `seed` param from

```json
      "max": 9999,
      "step": 1,
      "default": 1
    }
```

to

```json
      "max": 9999,
      "step": 1,
      "default": 1,
      "showWhen": {
        "key": "rhythm",
        "equals": "random"
      }
    }
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test tests/state.test.mjs tests/grammar/validate.test.mjs`
Expected: 17 tests pass, 0 fail.
Run: `npm test`
Expected: everything passes (the existing type tests, golden snapshot and the rest are unaffected: `showWhen` changes no terminals).

- [ ] **Step 5: Commit and push**

```bash
git add web/studio/state.js web/studio/grammar/validate.js web/studio/types tests/state.test.mjs tests/grammar/validate.test.mjs
git commit -m "feat(types): showWhen param field and pure studio state helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin claude/lucid-sammet-a4b4c4
```

---

### Task 2: Swatch thumbnails

**Files:**
- Create: `tools/make_thumbs.py`, `web/textures/<id>/thumb.jpg` (x6, generated)
- Test: `tests/textures.test.mjs` (append)

**Interfaces:**
- Consumes: `MATERIAL_CATALOG` and the test file's existing `web`, `jpegSize` helpers (Part 1).
- Produces: `web/textures/<id>/thumb.jpg`, 112x112 JPEG under 20 KB, one per catalog finish (used by the finish pickers in Task 3).

- [ ] **Step 1: Write the failing test**

Append to `tests/textures.test.mjs`:

```js

test("every finish has a small swatch thumbnail (112x112 JPEG under 20 KB)", () => {
  for (const m of MATERIAL_CATALOG) {
    const url = web(`textures/${m.id}/thumb.jpg`);
    assert.ok(existsSync(url), `missing textures/${m.id}/thumb.jpg (run tools/make_thumbs.py)`);
    const buf = readFileSync(url);
    assert.ok(buf.length < 20_000, `${m.id}/thumb.jpg is ${buf.length} bytes`);
    assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    assert.deepEqual(jpegSize(buf), { w: 112, h: 112 });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/textures.test.mjs`
Expected: 1 FAIL: `missing textures/concrete/thumb.jpg (run tools/make_thumbs.py)`; the other 5 pass.

- [ ] **Step 3: Write the tool and run it**

Create `tools/make_thumbs.py` (needs Pillow: `python -m pip install pillow` if `python -I -c "import PIL"` fails):

````python
"""Make 112x112 swatch thumbnails (web/textures/<finish>/thumb.jpg) from each finish's color.jpg.

Dev tool, run by hand after the textures change: needs Pillow (pip install pillow).
Usage: python -I tools/make_thumbs.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent / "web" / "textures"

for folder in sorted(p for p in ROOT.iterdir() if p.is_dir()):
    src = folder / "color.jpg"
    if not src.exists():
        continue
    im = Image.open(src).convert("RGB")
    w, h = im.size
    side = min(w, h)  # the largest centered square the image allows
    left, top = (w - side) // 2, (h - side) // 2
    thumb = im.crop((left, top, left + side, top + side)).resize((112, 112), Image.LANCZOS)
    thumb.save(folder / "thumb.jpg", quality=82, optimize=True)
    print("ok", folder.name)
````

Run: `python -I tools/make_thumbs.py`
Expected: six lines `ok brick`, `ok concrete`, `ok metal`, `ok plaster`, `ok stone`, `ok wood`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/textures.test.mjs`
Expected: 6 tests pass, 0 fail.

- [ ] **Step 5: Commit and push**

```bash
git add tools/make_thumbs.py web/textures tests/textures.test.mjs
git commit -m "feat(textures): swatch thumbnails for the finish pickers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin claude/lucid-sammet-a4b4c4
```

---

### Task 3: The studio page (browser-verified)

**Files:**
- Rename: `web/index.html` -> `web/legacy-gallery.html`
- Delete: `web/studio-debug.html`, `web/studio/debug.js`
- Create: `web/index.html`, `web/studio/app.js`, `web/studio/studio.css`
- Rewrite: `web/studio/view/controls.js`
- Test: `tests/site.test.mjs`

**Interfaces:**
- Consumes: `generate`, `assertValid`, `createScene` (`setTerminals`, `setMaterial`, `fit`, `screenshot`), `MATERIAL_CATALOG`, `DEFAULT_FINISH`, `loadPreset`, `randomize`, `isVisible` (all earlier tasks and Part 1), the three type files and `index.json`, `textures/<id>/thumb.jpg`.
- Produces: the studio page. `buildControls(container, def, values, onChange)` and `el(tag, className?, text?)` from `controls.js` (the previous controls API is kept; enums now render as segmented buttons, bools as checkboxes, and params whose `showWhen` fails are hidden via the `hidden` attribute).

Behavior to build (mockup B): dark glass cards over a full-bleed canvas. Header pill (logo, title, `프로젝트 이야기` link to the README) and an orange `PNG 저장` button at the top; parameter card on the right; finish picker card (주 마감재, 보조 마감재, 6 texture swatches each) bottom-left; a bottom dock with the type buttons, the two presets of the current type and `랜덤`; a status chip bottom-right (`247개 부재 · 21.6m × 17.6m`). Touching any control un-presses the preset chip. Switching type loads that type's first preset and keeps the chosen finishes. Below 1360 px the two cards share one scrolling column on the right and the status chip moves to the top-left; below 821 px everything stacks under a sticky 3D view with 44 px touch targets.

- [ ] **Step 1: Move the old page out of the way and write the failing test**

Run:

```bash
git mv web/index.html web/legacy-gallery.html
git rm web/studio-debug.html web/studio/debug.js
```

Create `tests/site.test.mjs`:

````javascript
// Smoke checks for the static page: it must reference files that exist and contain every element app.js looks up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const WEB = new URL("../web/", import.meta.url);
const html = readFileSync(new URL("index.html", WEB), "utf8");
const app = readFileSync(new URL("studio/app.js", WEB), "utf8");

test("index.html is the Korean studio page with a pinned Three.js", () => {
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<title>파사드 스튜디오<\/title>/);
  assert.match(html, /three@0\.160\.0\/build\/three\.module\.js/);
  assert.equal((html.match(/<canvas\b/g) ?? []).length, 1);
});

test("every local src/href in index.html points at a real file", () => {
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|mailto:)/.test(u));
  assert.ok(refs.includes("studio/studio.css") && refs.includes("studio/app.js"));
  for (const ref of refs) assert.ok(existsSync(new URL(ref, WEB)), `missing ${ref}`);
});

test("every #id that app.js looks up exists in index.html", () => {
  const wanted = new Set([...app.matchAll(/\$\(["'`]#([\w-]+)/g)].map((m) => m[1]).filter((id) => !id.endsWith("-")));
  wanted.add("finish-primary").add("finish-secondary"); // app.js builds these two from a template string
  for (const id of wanted) assert.match(html, new RegExp(`id="${id}"`), `index.html has no #${id}`);
});

test("the studio page does not link to the legacy gallery or its live-mode server field", () => {
  assert.doesNotMatch(html, /legacy-gallery|live|서버 설정/i);
});

test("the old gallery page is kept as legacy-gallery.html, outside the studio page", () => {
  assert.ok(existsSync(new URL("legacy-gallery.html", WEB)));
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/site.test.mjs`
Expected: FAIL (`ENOENT`: there is no `web/index.html` or `web/studio/app.js` yet).

- [ ] **Step 3: Write the page**

Create `web/studio/view/controls.js` (replaces the Part 1 file):

````javascript
// Builds one control per param from the type's schema: sliders for int/float, segmented buttons for enums,
// a checkbox for bools. Class names only (studio.css styles them); text goes in with textContent, never innerHTML.
import { isVisible } from "../state.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const decimals = (step) => (String(step).split(".")[1] ?? "").length;

function slider(p, values, onChange) {
  const row = el("label", "param");
  const head = el("span", "param-head");
  const out = el("output", "param-value");
  const show = (v) => (out.textContent = Number(v).toFixed(decimals(p.step)));
  head.append(el("span", "param-name", p.label), out);
  const input = el("input");
  Object.assign(input, { type: "range", min: p.min, max: p.max, step: p.step, value: values[p.key] });
  show(input.value);
  input.addEventListener("input", () => {
    show(input.value);
    onChange(Number(input.value));
  });
  row.append(head, input);
  return row;
}

function segmented(p, values, onChange) {
  const row = el("div", "param");
  row.append(el("span", "param-name", p.label));
  const group = el("div", "seg");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", p.label);
  const buttons = p.options.map((o) => {
    const b = el("button", "seg-btn", o.label);
    b.type = "button";
    b.addEventListener("click", () => {
      onChange(o.value);
      sync();
    });
    b.dataset.value = o.value;
    return b;
  });
  const sync = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === values[p.key])));
  sync();
  group.append(...buttons);
  row.append(group);
  return row;
}

function toggle(p, values, onChange) {
  const row = el("label", "param param-bool");
  row.append(el("span", "param-name", p.label));
  const input = el("input");
  Object.assign(input, { type: "checkbox", checked: values[p.key] });
  input.addEventListener("input", () => onChange(input.checked));
  row.append(input);
  return row;
}

/** Fills `container` with the controls of `def`. `values` is edited in place; `onChange(key)` runs after each edit. */
export function buildControls(container, def, values, onChange) {
  container.replaceChildren();
  const rows = [];
  const refresh = () => rows.forEach(([p, row]) => (row.hidden = !isVisible(p, values)));
  for (const p of def.params) {
    const set = (v) => {
      values[p.key] = v;
      refresh();
      onChange(p.key);
    };
    const row = p.type === "enum" ? segmented(p, values, set) : p.type === "bool" ? toggle(p, values, set) : slider(p, values, set);
    row.dataset.key = p.key;
    rows.push([p, row]);
    container.append(row);
  }
  refresh();
}
````

Create `web/studio/app.js`:

````javascript
// Studio page glue: types, presets, controls, finishes, random and PNG save around the grammar and the 3D scene.
import { generate } from "./grammar/engine.js";
import { assertValid } from "./grammar/validate.js";
import { buildControls, el } from "./view/controls.js";
import { createScene } from "./view/scene.js";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "./view/catalog.js";
import { loadPreset, randomize } from "./state.js";

const $ = (selector) => document.querySelector(selector);
const setStatus = (text) => ($("#status").textContent = text);
const FINISH_SLOTS = [
  ["primary", "주 마감재"],
  ["secondary", "보조 마감재"],
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return res.json();
}

async function main() {
  const scene = createScene($("#view"));
  if (!scene) {
    $("#fallback").hidden = false;
    return;
  }

  let types;
  try {
    const ids = await getJson("studio/types/index.json");
    types = await Promise.all(ids.map(async (id) => assertValid(await getJson(`studio/types/${id}.json`))));
  } catch (e) {
    setStatus(`파사드 유형을 불러오지 못했습니다: ${e.message}`);
    return;
  }

  let def;
  let values;
  let activePreset = 0; // -1 once a control has been touched
  let queued = false;
  let refit = false;

  function regenerate() {
    try {
      const r = generate(def, values);
      scene.setTerminals(r.terminals);
      if (refit) scene.fit(r.width, r.height);
      refit = false;
      setStatus(`${r.terminals.length}개 부재 · ${r.width.toFixed(1)}m × ${r.height.toFixed(1)}m`);
    } catch (e) {
      setStatus(`생성 오류: ${e.message}`);
    }
  }
  function schedule(fit = false) {
    refit ||= fit;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      regenerate();
    });
  }

  function pressed(button, on) {
    button.setAttribute("aria-pressed", String(on));
  }
  function renderTypes() {
    $("#types").replaceChildren(
      ...types.map((t) => {
        const b = el("button", "seg-btn", t.label);
        b.type = "button";
        pressed(b, t === def);
        b.addEventListener("click", () => selectType(t));
        return b;
      })
    );
  }
  function renderPresets() {
    $("#presets").replaceChildren(
      ...def.presets.map((pr, i) => {
        const b = el("button", "chip-btn", pr.label);
        b.type = "button";
        pressed(b, i === activePreset);
        b.addEventListener("click", () => selectPreset(i));
        return b;
      })
    );
  }
  function showValues(next, fit) {
    values = next;
    buildControls($("#controls"), def, values, () => {
      if (activePreset !== -1) {
        activePreset = -1;
        renderPresets();
      }
      schedule();
    });
    schedule(fit);
  }
  function selectType(t) {
    def = t;
    activePreset = 0;
    renderTypes();
    renderPresets();
    showValues(loadPreset(def, def.presets[0]), true);
  }
  function selectPreset(i) {
    activePreset = i;
    renderPresets();
    showValues(loadPreset(def, def.presets[i]), true);
  }

  for (const [slot, title] of FINISH_SLOTS) {
    const box = $(`#finish-${slot}`);
    const name = el("span", "finish-name");
    const swatches = el("div", "swatches");
    const buttons = MATERIAL_CATALOG.map((m) => {
      const b = el("button", "swatch");
      b.type = "button";
      b.setAttribute("aria-label", m.label);
      const img = el("img");
      Object.assign(img, { src: `textures/${m.id}/thumb.jpg`, alt: "" });
      b.append(img);
      b.addEventListener("click", () => choose(m));
      return [m, b];
    });
    const choose = (m) => {
      scene.setMaterial(slot, m.id);
      name.textContent = m.label;
      buttons.forEach(([other, b]) => pressed(b, other === m));
    };
    swatches.append(...buttons.map(([, b]) => b));
    const head = el("div", "finish-head");
    head.append(el("span", "finish-title", title), name);
    box.replaceChildren(head, swatches);
    choose(MATERIAL_CATALOG.find((m) => m.id === DEFAULT_FINISH[slot]));
  }

  $("#random").addEventListener("click", () => {
    activePreset = -1;
    renderPresets();
    showValues(randomize(def, values), false);
  });

  $("#shot").addEventListener("click", async () => {
    const blob = await scene.screenshot();
    if (!blob) {
      setStatus("이미지를 저장하지 못했습니다.");
      return;
    }
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `facade-${def.id}.png` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  selectType(types[0]);
}

main();
````

Create `web/index.html`:

````html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>파사드 스튜디오</title>
  <meta name="description" content="파라미터로 건물 파사드를 만들고 재질을 실시간으로 바꿔보는 브라우저 스튜디오. GPU 없이 브라우저에서만 동작합니다.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=swap">
  <link rel="stylesheet" href="studio/studio.css">
  <script type="importmap">
    { "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    } }
  </script>
</head>
<body>
  <header class="bar">
    <div class="pill">
      <div class="brand">
        <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" rx="5" fill="#EDEFF1"/><g fill="#15181B"><rect x="6" y="6" width="5" height="5" rx="1"/><rect x="12" y="6" width="5" height="5" rx="1"/><rect x="18" y="6" width="5" height="5" rx="1"/><rect x="6" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/><rect x="18" y="12" width="5" height="5" rx="1"/><rect x="6" y="18" width="5" height="5" rx="1"/><rect x="12" y="18" width="5" height="5" rx="1"/></g><rect x="18" y="18" width="5" height="5" rx="1" fill="#FF6A3D"/></svg>
        <h1>파사드 스튜디오</h1>
      </div>
      <a class="link" href="https://github.com/Nonmaju/facade-generator#readme" target="_blank" rel="noopener">프로젝트 이야기</a>
    </div>
    <button id="shot" class="btn-accent" type="button">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>
      PNG 저장
    </button>
  </header>

  <canvas id="view" aria-label="파사드 3D 미리보기. 드래그로 회전하고 휠로 확대합니다."></canvas>

  <div class="dock">
    <div id="types" class="seg seg-pill" role="group" aria-label="파사드 유형"></div>
    <div class="dock-sep" aria-hidden="true"></div>
    <div id="presets" class="chips" role="group" aria-label="프리셋"></div>
    <div class="dock-sep" aria-hidden="true"></div>
    <button id="random" class="btn-ghost" type="button">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/></svg>
      랜덤
    </button>
  </div>

  <p id="status" class="chip" role="status"></p>

  <div class="side">
    <section class="card params" aria-labelledby="params-title">
      <h2 id="params-title">파라미터</h2>
      <div id="controls"></div>
    </section>
    <section class="card finishes" aria-label="재질">
      <div id="finish-primary" class="finish"></div>
      <div id="finish-secondary" class="finish"></div>
    </section>
  </div>

  <p id="fallback" class="notice" role="alert" hidden>이 브라우저에서는 WebGL을 사용할 수 없어 3D 미리보기를 표시할 수 없습니다. 다른 브라우저에서 열어보세요.</p>

  <script type="module" src="studio/app.js"></script>
</body>
</html>
````

Create `web/studio/studio.css`:

````
/* Studio page: dark, full-bleed 3D canvas with floating controls (mockup B). */
:root {
  --bg: #0e1114;
  --card: rgba(18, 21, 24, 0.84);
  --line: rgba(255, 255, 255, 0.12);
  --ink: #edeff1;
  --soft: #c3c8cd;
  --muted: #9aa1a8;
  --accent: #ff6a3d;
  --on-accent: #15181b;
  --font: "Noto Sans KR", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--ink); font: 14px/1.45 var(--font); overflow: hidden; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button { font-family: inherit; }

#view { position: fixed; inset: 0; z-index: 0; width: 100%; height: 100%; display: block; }

/* Shared glass look */
.card, .pill, .dock, .chip { background: var(--card); border: 1px solid var(--line); backdrop-filter: blur(10px); }

/* Top bar */
.bar { position: fixed; z-index: 2; left: 24px; right: 24px; top: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: none; }
.bar > * { pointer-events: auto; }
.pill { display: flex; align-items: center; gap: 18px; padding: 8px 18px; border-radius: 999px; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand h1 { margin: 0; font-size: 15px; font-weight: 700; }
.link { color: var(--soft); font-size: 13px; text-decoration: none; }
.link:hover { color: var(--ink); text-decoration: underline; }
.btn-accent { display: flex; align-items: center; gap: 8px; padding: 11px 18px; border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent); font: 700 14px var(--font); cursor: pointer; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35); }
.btn-accent:hover { filter: brightness(1.08); }

/* Side column: parameters (right) and finishes (bottom-left) */
.side { display: contents; }
.card { position: fixed; z-index: 2; border-radius: 16px; color: var(--ink); }
.params { right: 24px; top: 84px; width: 300px; max-height: calc(100vh - 210px); overflow: auto; padding: 16px 18px 18px; }
.params h2 { margin: 0 0 12px; font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.04em; }
#controls { display: flex; flex-direction: column; gap: 12px; }
.param { display: block; }
.param-head { display: flex; justify-content: space-between; font-weight: 500; }
.param-name { font-weight: 500; }
.param-value { font-family: var(--mono); color: var(--muted); }
.param input[type="range"] { width: 100%; margin: 4px 0 0; accent-color: var(--accent); }
.param-bool { display: flex; align-items: center; justify-content: space-between; }
.param-bool input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }

.seg { display: flex; padding: 3px; gap: 2px; margin-top: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 10px; }
.seg-btn { flex: 1; border: 0; padding: 6px 0; border-radius: 8px; background: transparent; color: var(--soft); font: 500 13px var(--font); cursor: pointer; }
.seg-btn[aria-pressed="true"] { background: var(--ink); color: var(--on-accent); font-weight: 700; }

.finishes { left: 24px; bottom: 24px; width: 312px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.finish-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.finish-title { font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.04em; }
.finish-name { font-size: 13px; font-weight: 500; }
.swatches { display: flex; gap: 8px; }
.swatch { width: 40px; height: 40px; padding: 0; overflow: hidden; border: 2px solid #121518; outline: 1px solid rgba(255, 255, 255, 0.22); border-radius: 10px; background: none; cursor: pointer; }
.swatch[aria-pressed="true"] { outline: 2.5px solid var(--accent); }
.swatch img { display: block; width: 100%; height: 100%; object-fit: cover; }

/* Bottom dock: type, presets, random */
.dock { position: fixed; z-index: 2; left: 50%; bottom: 24px; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 48px); display: flex; align-items: center; gap: 14px; padding: 8px; border-radius: 999px; }
.dock .seg { margin: 0; border-radius: 999px; }
.dock .seg-btn { padding: 8px 18px; border-radius: 999px; font-size: 14px; white-space: nowrap; }
.dock-sep { width: 1px; height: 24px; background: var(--line); }
.chips { display: flex; gap: 6px; }
.chip-btn { padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(255, 255, 255, 0.22); background: transparent; color: var(--ink); font: 500 13px var(--font); white-space: nowrap; cursor: pointer; }
.chip-btn[aria-pressed="true"] { border-color: var(--accent); background: rgba(255, 106, 61, 0.16); color: #ffb29a; font-weight: 700; }
.btn-ghost { white-space: nowrap; display: flex; align-items: center; gap: 8px; margin-right: 4px; padding: 8px 14px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.1); color: var(--ink); font: 700 13px var(--font); cursor: pointer; }
.btn-ghost:hover { background: rgba(255, 255, 255, 0.16); }

.chip { position: fixed; z-index: 2; right: 24px; bottom: 24px; margin: 0; padding: 8px 14px; border-radius: 999px; font-family: var(--mono); font-size: 13px; }
.notice { position: fixed; z-index: 3; left: 50%; top: 50%; transform: translate(-50%, -50%); max-width: 420px; margin: 0; padding: 18px 22px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); text-align: center; }

/* Mid-width laptops: both cards share one scrolling column on the right; the status chip moves to the top. */
@media (max-width: 1359px) {
  .side { position: fixed; z-index: 2; right: 24px; top: 84px; width: 300px; max-height: calc(100vh - 172px); overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  .params, .finishes { position: static; width: auto; max-height: none; overflow: visible; }
  .chip { right: auto; bottom: auto; left: 24px; top: 84px; }
}

/* Phones and narrow windows: 3D on top (sticky), everything else stacked below. */
@media (max-width: 820px) {
  body { overflow: auto; height: auto; min-height: 100%; }
  .bar { position: static; padding: 12px 16px; flex-wrap: wrap; }
  #view { position: sticky; top: 0; height: 46vh; min-height: 260px; }
  .dock { position: static; transform: none; width: auto; max-width: none; margin: 12px 12px 0; flex-direction: column; align-items: stretch; gap: 12px; border-radius: 16px; }
  .dock .seg { border-radius: 12px; }
  .dock .seg-btn { flex: 1; min-height: 44px; padding: 8px 4px; border-radius: 10px; font-size: 14px; }
  .dock-sep { display: none; }
  .chips { flex-wrap: wrap; }
  .chip-btn { flex: 1; min-height: 44px; }
  .btn-ghost { justify-content: center; min-height: 44px; margin: 0; }
  .chip { position: static; display: inline-block; margin: 12px 12px 0; }
  .side { position: static; width: auto; max-height: none; overflow: visible; padding: 12px; }
  .finishes { padding: 14px 16px; }
  .swatches { justify-content: space-between; }
  .swatch { width: 48px; height: 48px; }
  .param input[type="range"] { height: 28px; }
  .param-bool { min-height: 44px; }
  .param-bool input { width: 22px; height: 22px; }
  .seg-btn { min-height: 44px; }
}
````

- [ ] **Step 4: Run the unit suite**

Run: `node --check web/studio/app.js && node --check web/studio/state.js && node --check web/studio/view/controls.js`
Expected: no output (syntax ok).
Run: `npm test`
Expected: everything passes, including the 5 new site tests.

- [ ] **Step 5: Serve it and run the browser checklist**

Run in the background: `python -m http.server 8000 -d web`. Open `http://localhost:8000/index.html` in the built-in browser. Record PASS / FAIL / NOT RUN with one sentence of evidence for each line; a FAIL means fix and rerun the line.

1. **Loads:** the facade shows with textures, the layout matches mockup B at 1440x900 (header pill and `PNG 저장` on top, parameter card right, finish card bottom-left, dock bottom-center, status chip bottom-right). The seed slider is NOT in the parameter card. Console: no errors.
2. **Types and presets:** click every type and both presets of each. After each (screenshot first, then read `#status`) the part count equals that preset's `count` in `tests/grammar/golden.json`; the clicked preset chip is pressed. Type-specific params appear (`1층 상가` and `파라펫 높이`; `베이당 멀리언 분할`; `층당 루버 개수` and `루버 돌출`).
3. **Sliders and un-pressing:** move a slider: the facade changes and both preset chips become un-pressed. Set every slider to its min and max for each type: no `생성 오류` text.
4. **랜덤 and the seed (Review Focus 1, 2):** click `랜덤`: the rhythm shows `랜덤`, the `시드` slider appears with a new value, the facade changes, presets are un-pressed. Click again: the seed value differs. Then click a non-random preset (or another type): the `시드` slider disappears again.
5. **Finishes:** pick each of the 6 swatches in both pickers: the clicked swatch gets the orange outline, the name beside the title changes, the facade surface changes. Switch type: the chosen finishes stay.
6. **PNG:** click `PNG 저장`: no console error. (State plainly that the saved file was not inspected.)
7. **Mid width (Review Focus 3):** emulate 1280x720 and 1000x700: the dock is one line (no wrapped `랜덤`), the dock does not cover the right column or the status chip, the finish card is reachable by scrolling the right column.
8. **Phone:** emulate 375x812: header, then the sticky 3D view, then the dock (44 px buttons), status, parameters, finishes; nothing is cut off horizontally; the 3D view stays while scrolling.
9. **Keyboard and names (Review Focus 4):** press Tab repeatedly from the top: focus reaches the link, `PNG 저장`, the type buttons, presets, `랜덤`, every control and swatch, each with a visible orange focus ring; `read_page` shows names for the button groups (`파사드 유형`, `프리셋`, the param labels) and `aria-pressed` on the toggled buttons.
10. **Failure paths (Review Focus 5):** run `mv web/studio/types/louver.json web/studio/types/louver_off.json`, reload: the status chip shows the Korean message `파사드 유형을 불러오지 못했습니다: …` and the page does not break; then `mv web/studio/types/louver_off.json web/studio/types/louver.json`. The `WebGL unavailable` notice cannot be forced in the built-in browser: mark NOT RUN, and note that `#fallback` exists (site test).

Stop the server afterwards (and reset any viewport emulation).

- [ ] **Step 6: Commit and push**

```bash
git add -A web tests
git commit -m "feat(studio): the studio page (mockup B), segmented controls, finish pickers, legacy gallery renamed" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin claude/lucid-sammet-a4b4c4
```

(`git add -A web tests` picks up the rename, the two deletions and the new files; check `git status` first: nothing outside `web/` and `tests/` should be staged.)

---

### Task 4: README as the project story

**Files:**
- Rewrite: `README.md`
- Create: `docs/images/studio.png`

**Interfaces:**
- Consumes: the finished studio page (Task 3), `web/samples/modern/*.jpg`, `web/textures/CREDITS.md`.
- Produces: the README (Korean): what it is, how to try it, the GPU-to-browser story with the SDXL images, how it works, structure, tests, the legacy gallery note, credits, and an honest status line ("not deployed").

- [ ] **Step 1: Capture the screenshot for the README**

Run in the background: `python -m http.server 8000 -d web`. With the Playwright browser tool: resize to 1440x900, navigate to `http://localhost:8000/index.html`, wait until the text `개 부재` appears, then take a viewport screenshot (not an element) to `docs/images/studio.png` (relative paths resolve against the worktree root; create `docs/images/` first with `mkdir -p docs/images`). Stop the server. Open the image and confirm it shows the textured facade and all cards, not an empty page.

- [ ] **Step 2: Write the README**

Replace `README.md` with:

````
# 파사드 스튜디오

파라미터로 건물 파사드를 만들고 재질을 실시간으로 바꿔보는 브라우저 스튜디오입니다. GPU도 서버도 필요 없이 브라우저에서만 동작합니다.

![스튜디오 화면](docs/images/studio.png)

**상태:** 로컬에서 실행할 수 있습니다. 아직 배포하지 않았습니다.

## 해보기

```bash
python -m http.server 8000 -d web
```

http://localhost:8000 을 엽니다. 3D 라이브러리(Three.js)와 글꼴을 CDN에서 불러오므로 인터넷이 필요합니다.

- 아래 독에서 파사드 유형(`그리드 창`, `커튼월`, `루버 / 조적`)과 프리셋을 고릅니다.
- 오른쪽 카드의 슬라이더로 층수, 베이 수, 창 비율, 층고, 리듬을 바꿉니다.
- 왼쪽 아래에서 주 마감재와 보조 마감재를 바꿉니다. 6종 모두 실제 PBR 텍스처입니다.
- `랜덤`은 리듬을 `랜덤`으로 바꾸고 새 시드를 뽑습니다. 시드 슬라이더는 그때만 나타납니다.
- `PNG 저장`으로 지금 보는 화면을 저장합니다.

## 왜 이렇게 만들었나: GPU에서 브라우저로

처음에는 스케치 한 장에서 SDXL + ControlNet으로 파사드 렌더를 만들었습니다. 스케치의 형태를 지키면서 재질만 바꾼 결과가 나왔습니다.

| 입력 스케치 | 노출 콘크리트 | 적벽돌 | 통유리 커튼월 | 우드 루버 |
|---|---|---|---|---|
| <img src="web/samples/modern/sketch.jpg" width="150"> | <img src="web/samples/modern/concrete.jpg" width="150"> | <img src="web/samples/modern/brick.jpg" width="150"> | <img src="web/samples/modern/glass.jpg" width="150"> | <img src="web/samples/modern/wood.jpg" width="150"> |

문제는 이 방식이 GPU가 있어야만 돌아간다는 점이었습니다. 무료로 쓸 수 있는 GPU(Kaggle)는 세션이 자주 끊기고, 이미지 생성 API는 무료 한도가 없었습니다. 그래서 공개 사이트에서 방문자가 직접 써볼 수 없었습니다. 그래서 방향을 바꿔, AI가 그림을 그리는 대신 **규칙으로 파사드를 만들고 브라우저에서 바로 그리는** 스튜디오로 다시 만들었습니다.

## 어떻게 동작하나

- **파사드 문법(shape grammar):** 입면(직사각형)을 `split`, `repeat`, `inset`, `emit`, `nil` 다섯 연산으로 쪼개 부재(박스) 목록을 만듭니다. 규칙은 JSON이고 해석기는 순수 JS입니다. 식은 직접 만든 작은 파서로 계산하며 `eval`을 쓰지 않습니다.
- **유형은 JSON 파일 하나:** 규칙, 파라미터 스키마, 프리셋이 한 파일에 들어 있고 슬라이더는 스키마에서 자동으로 만들어집니다. 새 유형을 추가하려면 JSON 파일을 하나 추가하면 됩니다.
- **같은 값이면 같은 결과:** 무작위 값은 모양마다 경로 해시로 시드를 정해서, 슬라이더 하나를 움직여도 전체가 뒤섞이지 않습니다.
- **렌더링:** Three.js. 재질 슬롯별로 `InstancedMesh` 하나를 쓰고, 재질을 바꿀 때는 지오메트리를 다시 만들지 않습니다. 박스에 입히는 텍스처가 늘어나지 않도록 월드 좌표 기준 UV를 직접 계산합니다.

## 구조

```
web/
  index.html            스튜디오 페이지
  studio/
    app.js state.js studio.css
    grammar/            문법 엔진 (순수 JS): expr, rng, rhythm, engine, validate
    types/              grid.json curtainwall.json louver.json + index.json
    view/               Three.js 장면, 재질, 컨트롤, 카메라 맞춤
  textures/             ambientCG 1K 텍스처 6종 + 견본 썸네일
  legacy-gallery.html   예전 SDXL 갤러리 (스튜디오와 연결하지 않음)
server/                 예전 Kaggle 서버 (검증하지 않음)
tests/ tools/           테스트, 텍스처 내려받기와 견본 만들기
docs/superpowers/       스펙과 구현 계획
```

## 테스트

```bash
npm test
```

Node 18 이상이 필요합니다. 문법 엔진은 `node --test`로 검증합니다. 모든 유형이 모든 파라미터 극단 조합에서 부재가 겹치지 않고 입면을 빈틈없이 채우는지, 같은 입력이 같은 결과를 내는지, 식 파서가 위험한 이름을 거부하는지 등을 확인합니다. 3D 화면은 브라우저에서 직접 점검했습니다.

## 예전 갤러리

`web/legacy-gallery.html`은 처음에 만든 갤러리입니다. 미리 생성해 둔 SDXL 결과를 보여주고, 서버 주소를 입력하면 직접 올린 스케치를 렌더하는 라이브 모드가 있습니다. 라이브 모드(`server/kaggle_server.py`)는 Kaggle에서 실제로 돌려보지 않았습니다. 스튜디오에서는 연결하지 않았습니다.

## 크레딧

텍스처는 모두 [ambientCG](https://ambientcg.com)의 CC0 자료입니다.

| 재질 | 에셋 |
|---|---|
| 콘크리트 | [Concrete034](https://ambientcg.com/view?id=Concrete034) |
| 벽돌 | [Bricks085](https://ambientcg.com/view?id=Bricks085) |
| 목재 | [Wood095](https://ambientcg.com/view?id=Wood095) |
| 플라스터 | [PaintedPlaster017](https://ambientcg.com/view?id=PaintedPlaster017) |
| 금속 패널 | [MetalPlates008](https://ambientcg.com/view?id=MetalPlates008) |
| 석재 | [Tiles143](https://ambientcg.com/view?id=Tiles143) |

예전 갤러리의 스케치: `villa_elev`는 Rijksmuseum RP-T-1966-65-1(CC0)의 일부이고, `modern`은 직접 그렸습니다.

설계 문서: [스펙](docs/superpowers/specs/2026-10-12-parametric-facade-studio-design.md), [구현 계획 Part 1](docs/superpowers/plans/2026-10-12-parametric-facade-studio-part1.md)
````

- [ ] **Step 3: Check the README against reality**

Run: `grep -o '](docs/[^)]*)\|src="web/[^"]*"' README.md | sed 's/.*[(="]\(docs\|web\)/\1/; s/[)"]$//'` and confirm every listed path exists (`ls` each). Re-read the "구조" tree against `git ls-files web | head -50`. Fix any mismatch in the README, not by moving files.

- [ ] **Step 4: Commit and push**

```bash
git add README.md docs/images/studio.png
git commit -m "docs: README tells the GPU-to-browser story and how the studio works" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin claude/lucid-sammet-a4b4c4
```

---

### Task 5: Final checks and handoff

**Files:** none (verification and report only).

**Interfaces:**
- Consumes: everything above.
- Produces: a verified branch and an honest report.

- [ ] **Step 1: Full suite and repository state**

Run: `npm test`
Expected: all tests pass (read the totals; report them).
Run: `git status --short && git log --oneline origin/main..HEAD`
Expected: clean tree; the list of commits on top of `origin/main`.

- [ ] **Step 2: Consistency pass**

Check that these agree with each other and with the page as built: `CLAUDE.md` (no gallery tab), the spec (decisions table, out of scope), the README, `web/studio/types/*.json` (`seed.showWhen`), `tests/site.test.mjs` (no link to the legacy page). Fix any drift.

- [ ] **Step 3: Report**

Report to the user, in Korean and plainly: what the page does now; which checklist lines of Task 3 passed, which failed and were fixed, which were NOT RUN (WebGL-unavailable notice, the saved PNG file, anything else) and why; the open question about deleting the old gallery code (`web/legacy-gallery.html`, `web/app.js`, `web/queue.js`, `web/render.js`, `web/style.css`, `server/`, `web/samples` and their tests): leave it, ask. Deploying or enabling Pages is the user's decision, not this plan's. Then open (or update) the pull request for the user to merge.

---

## Out of scope

Deploying or enabling GitHub Pages, renaming the repo, deleting the old gallery code, sketch input (OpenCV.js), the rule editor, the deferred Part 1 review minors (engine hardening for user-authored rules: `hasOwn` lookups, finite guards for inset margins and root size, a terminal-count cap, a validator that never throws, scene teardown).
