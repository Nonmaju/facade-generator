# Parametric Facade Studio — Implementation Plan, Part 1 (engine, 3D view, UI gate)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-JS shape-grammar engine with three facade types, a Three.js view with real-time PBR material swapping, and stop at the UI mockup gate.

**Architecture:** Facade types are JSON files (params schema + rules + presets) interpreted by one small pure-JS engine that outputs flat terminal boxes. A thin Three.js layer draws one `InstancedMesh` per material slot. Grammar logic is tested with `node --test`; the 3D view is checked in the browser with a checklist. A throwaway debug page lets us exercise everything before the real UI exists.

**Tech Stack:** Plain ES modules (no build step), Three.js 0.160.0 via importmap from jsDelivr, `node --test` (Node >= 18; verified on Node 24), Python 3 only for the one-off texture download script.

**Spec:** `docs/superpowers/specs/2026-10-12-parametric-facade-studio-design.md` (read its "Implementation clarifications" section: it overrides the earlier text where they differ).

**Scope of this plan:** Tasks 1-11. It ends at the UI mockup gate (Task 11). The real UI, the gallery-tab move, the README story and the final checks are **Part 2**, written after the user approves a mockup (see "Part 2 scope" at the end). No UI visuals are decided or coded here.

## Global Constraints

- Cost 0, no GPU, static site, everything in the browser. Plain ES modules, no build step.
- Textures CC0 only (ambientCG), 1K JPG, credited in README (Part 2) and in `web/textures/CREDITS.md`.
- **Deploy / enabling Pages / renaming the repo need the user's explicit OK first.** `.env` is gitignored: never commit or print it.
- Downloading any file (the textures) needs the user's explicit OK after you state filename, source and size.
- UI text in Korean. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Grammar code is pure JS: no DOM, no Three.js imports under `web/studio/grammar/`.
- Rule sets are JSON only: no functions, no `eval` / `new Function` anywhere.
- Run every command from the repository root (the worktree). Run the whole suite with `npm test` (that is `node --test`; Node 24 does not accept a directory argument, pass file paths instead).
- Commit command shape (two `-m` so the trailer is its own paragraph):
  `git commit -m "<subject>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

## Review Focus

Inputs and conditions the spec implies but a reasonable person could trip over; each has a test in the named task.

1. **Float tile counts:** `bays x 3.6` divided by `3.6` must give exactly `bays` tiles for every bay count 1-12 (25.2 / 3.6 must not give 6). Task 3 (`repeat: float-safe tile counts`) and Task 8 sweep.
2. **Extreme parameter combinations:** every param at min and max (all 11 bay counts, all rhythms, storefront on/off) must give finite, positive-size terminals that tile the facade. Task 8.
3. **Zero-size leftovers:** `parapet = 0`, `windowRatio` 0.3 and 0.9, margins larger than a bay must not emit zero- or negative-size boxes. Task 3 (`inset`) and Task 5.
4. **Missing or fake texture files:** a 404, or an HTML error page saved as `.jpg`, must not leave a black or blank facade. Task 9 (JPEG signature test) and Task 10 (fallback check).
5. **Switching from a big facade to a small one:** stale boxes from the previous facade must not stay visible, and growing past the instance capacity must reallocate. Task 10 checklist.

## File structure

```
web/
  studio-debug.html            throwaway debug page (deleted in Part 2)
  studio/
    debug.js                   throwaway glue (replaced in Part 2)
    grammar/                   pure JS
      expr.js rng.js rhythm.js engine.js validate.js
    types/                     grid.json curtainwall.json louver.json index.json
    view/                      catalog.js materials.js scene.js controls.js
  textures/<material>/{color,normal,rough}.jpg + CREDITS.md
tests/
  grammar/                     expr rng engine validate grid curtainwall louver types golden + helpers.mjs
  textures.test.mjs
tools/fetch_textures.py  tools/textures.json
```

---

### Task 1: Safe expression evaluator

**Files:**
- Create: `web/studio/grammar/expr.js`
- Test: `tests/grammar/expr.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `compile(src: string): AST` (throws a readable `Error` on bad syntax, forbidden names, unknown functions; caches), `evalExpr(src: string | number | boolean, scope: object, fns?: { rand?: () => number }): any` (numbers/booleans pass through).

- [ ] **Step 1: Write the failing test**

Create `tests/grammar/expr.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { evalExpr, compile } from "../../web/studio/grammar/expr.js";

const scope = { params: { floors: 5, bays: 6, storefront: true, name: "AB" }, shape: { w: 10, h: 4 }, index: 0, count: 3 };

test("arithmetic, precedence, parentheses", () => {
  const cases = [
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 / 4", 2.5],
    ["7 % 4", 3],
    ["-3 + 5", 2],
    ["2 * -3", -6],
    ["params.floors * params.bays", 30],
    ["shape.w / params.bays", 10 / 6],
    ["1.5 + .5", 2],
  ];
  for (const [src, want] of cases) assert.equal(evalExpr(src, scope), want, src);
});

test("comparisons, logic, ternary", () => {
  const cases = [
    ["index == 0", true],
    ["index != 0", false],
    ["params.floors >= 5 && params.floors <= 5", true],
    ["params.floors < 3 || params.storefront", true],
    ["!params.storefront", false],
    ["params.floors > 4 ? 10 : 20", 10],
    ["params.floors > 9 ? 10 : params.floors > 4 ? 20 : 30", 20],
    ["params.storefront && index == 0", true],
  ];
  for (const [src, want] of cases) assert.equal(evalExpr(src, scope), want, src);
});

test("functions and passthrough values", () => {
  assert.equal(evalExpr("min(2, 5)", scope), 2);
  assert.equal(evalExpr("max(2, 5)", scope), 5);
  assert.equal(evalExpr("floor(2.9)", scope), 2);
  assert.equal(evalExpr("clamp(12, 0, 10)", scope), 10);
  assert.equal(evalExpr(3.6, scope), 3.6);
  assert.equal(evalExpr(true, scope), true);
  assert.equal(evalExpr("params.name", scope), "AB");
});

test("rand() comes from the caller and is unavailable otherwise", () => {
  assert.equal(evalExpr("rand()", scope, { rand: () => 0.25 }), 0.25);
  assert.throws(() => evalExpr("rand()", scope), /not available/);
});

test("rejects unsafe or unknown names", () => {
  for (const src of ["constructor", "params.constructor", "__proto__", "shape.__proto__.x", "params.prototype"]) {
    assert.throws(() => compile(src), /forbidden/, src);
  }
  assert.throws(() => evalExpr("nope", scope), /unknown identifier/);
  assert.throws(() => evalExpr("params.nope", scope), /unknown identifier/);
  assert.throws(() => compile("sqrt(4)"), /unknown function/);
  assert.throws(() => compile("alert(1)"), /unknown function/);
});

test("rejects malformed input with readable errors", () => {
  for (const src of ["1 +", "(1 + 2", "1 2", "a.", "1 ? 2", "@", "1 + * 2"]) {
    assert.throws(() => compile(src), Error, src);
  }
});

test("non-string, non-number expressions are rejected", () => {
  assert.throws(() => evalExpr({}, scope), /must be a string or number/);
  assert.throws(() => evalExpr(null, scope), /must be a string or number/);
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/grammar/expr.test.mjs`
Expected: FAIL with `Cannot find module` for `web/studio/grammar/expr.js`.

- [ ] **Step 3: Write the implementation**

Create `web/studio/grammar/expr.js`:

````javascript
// Safe expression parser/evaluator for facade rules.
// Hand-written on purpose: rule sets will eventually hold user-typed text, so no eval / new Function.
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const BUILTINS = {
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
};
const BIN_PREC = {
  "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6,
};
const TOKEN = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_]\w*)|(&&|\|\||<=|>=|==|!=|[-+*/%<>!?:(),.]))/y;

function tokenize(src) {
  const out = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`bad expression "${src}" near index ${pos}`);
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ k: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ k: "id", v: m[2] });
    else out.push({ k: "op", v: m[3] });
  }
  return out;
}

function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  const isOp = (v) => toks[i]?.k === "op" && toks[i].v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`expected "${v}" in "${src}"`);
    i++;
  };

  function ternary() {
    const c = binary(1);
    if (!isOp("?")) return c;
    i++;
    const a = ternary();
    expect(":");
    const b = ternary();
    return { t: "cond", c, a, b };
  }
  function binary(minPrec) {
    let left = unary();
    for (;;) {
      const tk = toks[i];
      const prec = tk?.k === "op" ? BIN_PREC[tk.v] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      i++;
      const right = binary(prec + 1);
      left = { t: "bin", op: tk.v, a: left, b: right };
    }
  }
  function unary() {
    if (isOp("!") || isOp("-")) {
      const op = toks[i++].v;
      return { t: "un", op, a: unary() };
    }
    return primary();
  }
  function primary() {
    const tk = toks[i++];
    if (!tk) throw new Error(`unexpected end of "${src}"`);
    if (tk.k === "num") return { t: "num", v: tk.v };
    if (tk.k === "id") {
      if (isOp("(")) {
        i++;
        const args = [];
        if (!isOp(")")) {
          args.push(ternary());
          while (isOp(",")) {
            i++;
            args.push(ternary());
          }
        }
        expect(")");
        return { t: "call", name: tk.v, args };
      }
      const path = [tk.v];
      while (isOp(".")) {
        i++;
        const n = toks[i++];
        if (n?.k !== "id") throw new Error(`expected a name after "." in "${src}"`);
        path.push(n.v);
      }
      return { t: "id", path };
    }
    if (tk.v === "(") {
      const e = ternary();
      expect(")");
      return e;
    }
    throw new Error(`unexpected "${tk.v}" in "${src}"`);
  }

  const ast = ternary();
  if (i < toks.length) throw new Error(`unexpected "${toks[i].v}" in "${src}"`);
  return ast;
}

function check(n) {
  switch (n.t) {
    case "id":
      for (const p of n.path) if (FORBIDDEN.has(p)) throw new Error(`forbidden name "${p}"`);
      break;
    case "call":
      if (!Object.hasOwn(BUILTINS, n.name) && n.name !== "rand") throw new Error(`unknown function "${n.name}"`);
      n.args.forEach(check);
      break;
    case "un":
      check(n.a);
      break;
    case "bin":
      check(n.a);
      check(n.b);
      break;
    case "cond":
      check(n.c);
      check(n.a);
      check(n.b);
      break;
  }
}

const cache = new Map();

/** Parse + check an expression string once; throws a readable Error if it is invalid. */
export function compile(src) {
  let ast = cache.get(src);
  if (!ast) {
    ast = parse(src);
    check(ast);
    cache.set(src, ast);
  }
  return ast;
}

function run(n, scope, fns) {
  switch (n.t) {
    case "num":
      return n.v;
    case "id": {
      let v = scope;
      for (const p of n.path) {
        if (v === null || typeof v !== "object" || !Object.hasOwn(v, p)) {
          throw new Error(`unknown identifier "${n.path.join(".")}"`);
        }
        v = v[p];
      }
      return v;
    }
    case "call": {
      const f = n.name === "rand" ? fns.rand : BUILTINS[n.name];
      if (typeof f !== "function") throw new Error(`function "${n.name}" is not available here`);
      return f(...n.args.map((a) => run(a, scope, fns)));
    }
    case "un": {
      const a = run(n.a, scope, fns);
      return n.op === "!" ? !a : -a;
    }
    case "cond":
      return run(n.c, scope, fns) ? run(n.a, scope, fns) : run(n.b, scope, fns);
    case "bin": {
      if (n.op === "&&") return run(n.a, scope, fns) && run(n.b, scope, fns);
      if (n.op === "||") return run(n.a, scope, fns) || run(n.b, scope, fns);
      const a = run(n.a, scope, fns);
      const b = run(n.b, scope, fns);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
        case "==": return a === b;
        case "!=": return a !== b;
      }
    }
  }
  throw new Error(`bad node ${n.t}`);
}

/** Evaluate an expression string (numbers and booleans pass through). `fns.rand` supplies rand(). */
export function evalExpr(src, scope = {}, fns = {}) {
  if (typeof src === "number" || typeof src === "boolean") return src;
  if (typeof src !== "string") throw new Error(`expression must be a string or number, got ${typeof src}`);
  return run(compile(src), scope, fns);
}
````

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/grammar/expr.test.mjs`
Expected: 7 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/studio/grammar/expr.js tests/grammar/expr.test.mjs
git commit -m "feat(grammar): safe expression evaluator" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Seeded randomness and rhythm patterns

**Files:**
- Create: `web/studio/grammar/rng.js`, `web/studio/grammar/rhythm.js`
- Test: `tests/grammar/rng.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `hashSeed(seed: number, path: string): number` (uint32), `mulberry32(seed: number): () => number` (floats in [0,1)), `makePattern(rhythm: "regular"|"alternate"|"group"|"random", bays: number, seed: number): string` (letters `A`/`B`; random never all-`B`).

- [ ] **Step 1: Write the failing test**

Create `tests/grammar/rng.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { hashSeed, mulberry32 } from "../../web/studio/grammar/rng.js";
import { makePattern } from "../../web/studio/grammar/rhythm.js";

test("mulberry32 is deterministic and in [0,1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test("hashSeed depends on both seed and path", () => {
  assert.equal(hashSeed(1, "0.3.2"), hashSeed(1, "0.3.2"));
  assert.notEqual(hashSeed(1, "0.3.2"), hashSeed(2, "0.3.2"));
  assert.notEqual(hashSeed(1, "0.3.2"), hashSeed(1, "0.3.3"));
});

test("fixed rhythms", () => {
  assert.equal(makePattern("regular", 6, 1), "A");
  assert.equal(makePattern("alternate", 6, 1), "AB");
  assert.equal(makePattern("group", 6, 1), "AAB");
});

test("random rhythm: deterministic per seed, right length, never all-B", () => {
  assert.equal(makePattern("random", 8, 7), makePattern("random", 8, 7));
  assert.equal(makePattern("random", 8, 7).length, 8);
  for (let seed = 0; seed < 300; seed++) {
    const p = makePattern("random", 2, seed);
    assert.match(p, /^[AB]{2}$/);
    assert.ok(p.includes("A"), `seed ${seed} gave ${p}`);
  }
  const distinct = new Set(Array.from({ length: 50 }, (_, s) => makePattern("random", 10, s)));
  assert.ok(distinct.size > 10, "seeds should give different patterns");
});

test("unknown rhythm throws", () => {
  assert.throws(() => makePattern("zigzag", 4, 1), /unknown rhythm/);
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/grammar/rng.test.mjs`
Expected: FAIL with `Cannot find module` for `rng.js`.

- [ ] **Step 3: Write the implementation**

Create `web/studio/grammar/rng.js`:

````javascript
// Deterministic randomness. The seed of each shape is hash(global seed, child-index path),
// so changing one slider never reshuffles unrelated shapes.
export function hashSeed(seed, path) {
  let h = (2166136261 ^ (seed | 0)) >>> 0;
  for (const ch of String(path)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: returns a function giving floats in [0, 1). */
export function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
````

Create `web/studio/grammar/rhythm.js`:

````javascript
import { hashSeed, mulberry32 } from "./rng.js";

const FIXED = { regular: "A", alternate: "AB", group: "AAB" };

/** Letter pattern for repeat ops: "A" = main bay, "B" = variant bay. Cycled by index. */
export function makePattern(rhythm, bays, seed) {
  if (Object.hasOwn(FIXED, rhythm)) return FIXED[rhythm];
  if (rhythm !== "random") throw new Error(`unknown rhythm "${rhythm}"`);
  const rand = mulberry32(hashSeed(seed, "rhythm"));
  const letters = Array.from({ length: Math.max(1, bays) }, () => (rand() < 0.3 ? "B" : "A"));
  if (!letters.includes("A")) letters[0] = "A"; // never an all-blank facade
  return letters.join("");
}
````

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/grammar/rng.test.mjs`
Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/studio/grammar/rng.js web/studio/grammar/rhythm.js tests/grammar/rng.test.mjs
git commit -m "feat(grammar): per-shape seeded rng and rhythm patterns" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Grammar engine (five ops)

**Files:**
- Create: `web/studio/grammar/engine.js`
- Test: `tests/grammar/engine.test.mjs`

**Interfaces:**
- Consumes: `evalExpr` (Task 1), `hashSeed`, `mulberry32` (Task 2), `makePattern` (Task 2).
- Produces: `resolveParams(typeDef, values?): object` (schema defaults + overrides + derived `pattern` when `rhythm` and `bays` exist), `generate(typeDef, values?): { width, height, params, terminals }` where each terminal is `{ x, y, z, w, h, d, mat, role, path }` in meters. Facade plane: x right, y up, origin bottom-left; z toward the viewer; a terminal spans `z .. z+d`.
- Ops: `split`, `repeat`, `inset`, `emit`, `nil`. Size rule (single, documented): absolute expression, `{r: n}` relative, or `"~"` fill. Children always tile the parent exactly: if absolutes overflow, or nothing is flexible, absolutes are scaled proportionally.

- [ ] **Step 1: Write the failing test**

Create `tests/grammar/engine.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { generate, resolveParams } from "../../web/studio/grammar/engine.js";

// A tiny type: just enough params for the engine, rules supplied per test.
const mini = (rules, size = { w: 10, h: 6 }, extraParams = []) => ({
  version: 1, id: "mini", label: "mini", size, axiom: "S", rules, presets: [],
  params: [{ key: "seed", type: "int", min: 0, max: 9, step: 1, default: 1, label: "s" }, ...extraParams],
});
const leaf = (role, extra = {}) => [{ op: "emit", mat: "primary", role, depth: 0.1, ...extra }];
const area = (ts) => ts.reduce((s, t) => s + t.w * t.h, 0);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} vs ${b}`);

test("split: absolute + relative + fill sum to the parent", () => {
  const def = mini({
    S: [{ op: "split", axis: "x", parts: [{ size: 2, sym: "A" }, { size: { r: 1 }, sym: "B" }, { size: { r: 3 }, sym: "C" }, { size: "~", sym: "D" }] }],
    A: leaf("a"), B: leaf("b"), C: leaf("c"), D: leaf("d"),
  });
  const { terminals } = generate(def);
  const w = Object.fromEntries(terminals.map((t) => [t.role, t.w]));
  near(w.a, 2);
  // remaining 8 split by weights 1:3:1
  near(w.b, 8 / 5); near(w.c, 24 / 5); near(w.d, 8 / 5);
  near(area(terminals), 60);
});

test("split: absolutes that overflow are scaled down proportionally", () => {
  const def = mini({
    S: [{ op: "split", axis: "x", parts: [{ size: 8, sym: "A" }, { size: 8, sym: "B" }, { size: "~", sym: "C" }] }],
    A: leaf("a"), B: leaf("b"), C: leaf("c"),
  });
  const { terminals } = generate(def);
  assert.deepEqual(terminals.map((t) => t.role), ["a", "b"]); // the fill part gets 0 and is skipped
  near(terminals[0].w, 5); near(terminals[1].w, 5);
});

test("split: with nothing flexible, absolutes are scaled to fill the parent", () => {
  const def = mini({
    S: [{ op: "split", axis: "y", parts: [{ size: 1, sym: "A" }, { size: 2, sym: "B" }] }],
    A: leaf("a"), B: leaf("b"),
  });
  const { terminals } = generate(def);
  near(terminals[0].h, 2); near(terminals[1].h, 4);
  near(terminals[1].y, 2);
});

test("repeat: float-safe tile counts and exact filling", () => {
  for (let n = 1; n <= 12; n++) {
    const def = mini({ S: [{ op: "repeat", axis: "x", size: 3.6, sym: "A" }], A: leaf("a") }, { w: `${n} * 3.6`, h: 3 });
    const { terminals } = generate(def);
    assert.equal(terminals.length, n, `n=${n}`);
    near(area(terminals), n * 3.6 * 3);
  }
});

test("repeat: tile count rounds down and tiles stretch", () => {
  const def = mini({ S: [{ op: "repeat", axis: "x", size: 3, sym: "A" }], A: leaf("a") }, { w: 10, h: 2 });
  const { terminals } = generate(def);
  assert.equal(terminals.length, 3);
  near(terminals[0].w, 10 / 3);
});

test("repeat: pattern cycles by index and index/count are visible to expressions", () => {
  const def = mini({
    S: [{ op: "repeat", axis: "x", size: 1, pattern: "params.p", map: { A: "A", B: "B" } }],
    A: leaf("a"), B: leaf("b"),
  }, { w: 5, h: 1 }, [{ key: "p", type: "enum", default: "AB", options: [{ value: "AB" }], label: "p" }]);
  const { terminals } = generate(def);
  assert.deepEqual(terminals.map((t) => t.role), ["a", "b", "a", "b", "a"]);

  const def2 = mini({
    S: [{ op: "repeat", axis: "x", size: 1, sym: "T" }],
    T: [{ when: "index == count - 1", op: "emit", mat: "primary", role: "last", depth: 0.1 }, { op: "emit", mat: "primary", role: "other", depth: 0.1 }],
  }, { w: 4, h: 1 });
  assert.deepEqual(generate(def2).terminals.map((t) => t.role), ["other", "other", "other", "last"]);
});

test("pattern letter without a map entry throws", () => {
  const def = mini({ S: [{ op: "repeat", axis: "x", size: 1, pattern: "params.p", map: { A: "A" } }], A: leaf("a") },
    { w: 2, h: 1 }, [{ key: "p", type: "enum", default: "AB", options: [{ value: "AB" }], label: "p" }]);
  assert.throws(() => generate(def), /no map entry/);
});

test("inset: frame ring + inner tile the parent exactly", () => {
  const def = mini({
    S: [{ op: "inset", l: 1, r: 2, t: 0.5, b: 1.5, inner: "In", frame: "Fr" }],
    In: leaf("inner", { offset: 0.2 }), Fr: leaf("frame"),
  });
  const { terminals } = generate(def);
  near(area(terminals), 60);
  const inner = terminals.find((t) => t.role === "inner");
  near(inner.x, 1); near(inner.y, 1.5); near(inner.w, 7); near(inner.h, 4);
  assert.equal(terminals.filter((t) => t.role === "frame").length, 4);
});

test("inset: zero margins skip empty pieces; huge margins keep a thin inner", () => {
  const zero = mini({ S: [{ op: "inset", l: 1, r: 1, inner: "In", frame: "Fr" }], In: leaf("inner"), Fr: leaf("frame") });
  assert.equal(generate(zero).terminals.filter((t) => t.role === "frame").length, 2);

  const huge = mini({ S: [{ op: "inset", l: 100, r: 100, t: 100, b: 100, inner: "In", frame: "Fr" }], In: leaf("inner"), Fr: leaf("frame") });
  const { terminals } = generate(huge);
  near(area(terminals), 60);
  const inner = terminals.find((t) => t.role === "inner");
  assert.ok(inner.w >= 0.0199 && inner.h >= 0.0199);
});

test("nil produces nothing; a rule list with no match produces nothing", () => {
  const nil = mini({ S: [{ op: "nil" }] });
  assert.equal(generate(nil).terminals.length, 0);
  const none = mini({ S: [{ when: "params.seed > 100", op: "emit", mat: "primary", role: "x" }] });
  assert.equal(generate(none).terminals.length, 0);
});

test("the first matching rule wins", () => {
  const def = mini({
    S: [{ when: "params.seed == 1", op: "emit", mat: "primary", role: "one" }, { op: "emit", mat: "primary", role: "other" }],
  });
  assert.equal(generate(def, { seed: 1 }).terminals[0].role, "one");
  assert.equal(generate(def, { seed: 2 }).terminals[0].role, "other");
});

test("recursion is capped", () => {
  const def = mini({ S: [{ op: "split", axis: "x", parts: [{ size: 1, sym: "S" }] }] });
  assert.throws(() => generate(def), /depth limit/);
});

test("errors name the path: unknown symbol, bad sizes, bad emit depth", () => {
  assert.throws(() => generate(mini({ S: [{ op: "repeat", axis: "x", size: 1, sym: "Nope" }] })), /no rules for symbol "Nope" at 0\.0/);
  assert.throws(() => generate(mini({ S: [{ op: "repeat", axis: "x", size: 0, sym: "S" }] })), /repeat size/);
  assert.throws(() => generate(mini({ S: [{ op: "split", axis: "x", parts: [{ size: -1, sym: "A" }] }], A: leaf("a") })), /bad split size/);
  assert.throws(() => generate(mini({ S: [{ op: "emit", mat: "primary", role: "x", depth: 0 }] })), /bad depth/);
});

test("paths are unique and deterministic; seed changes only rand-dependent output", () => {
  const def = mini({
    S: [{ op: "repeat", axis: "x", size: 1, sym: "T" }],
    T: [{ when: "rand() < 0.5", op: "emit", mat: "primary", role: "lo", depth: 0.1 }, { op: "emit", mat: "primary", role: "hi", depth: 0.1 }],
  }, { w: 40, h: 1 });
  const a = generate(def, { seed: 1 }).terminals;
  assert.deepEqual(a, generate(def, { seed: 1 }).terminals);
  assert.equal(new Set(a.map((t) => t.path)).size, a.length);
  const b = generate(def, { seed: 2 }).terminals;
  assert.notDeepEqual(a.map((t) => t.role), b.map((t) => t.role));
  assert.deepEqual(a.map((t) => t.x), b.map((t) => t.x)); // geometry layout is seed-independent
});

test("resolveParams: defaults, overrides, derived pattern", () => {
  const def = {
    params: [
      { key: "bays", default: 4 }, { key: "rhythm", default: "alternate" }, { key: "seed", default: 3 },
    ],
  };
  assert.deepEqual(resolveParams(def, {}), { bays: 4, rhythm: "alternate", seed: 3, pattern: "AB" });
  assert.equal(resolveParams(def, { rhythm: "regular" }).pattern, "A");
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/grammar/engine.test.mjs`
Expected: FAIL with `Cannot find module` for `engine.js`.

- [ ] **Step 3: Write the implementation**

Create `web/studio/grammar/engine.js`:

````javascript
// Shape-grammar interpreter. Pure JS: no DOM, no Three.js.
// Coordinates: facade plane, x right, y up, meters, origin bottom-left. z points toward the viewer.
import { evalExpr } from "./expr.js";
import { hashSeed, mulberry32 } from "./rng.js";
import { makePattern } from "./rhythm.js";

const EPS = 1e-6;
const MIN_INNER = 0.02; // inset never leaves an inner rect thinner than this
const MAX_DEPTH = 32;

/** Defaults from the type's param schema, overridden by `values`, plus the derived rhythm pattern. */
export function resolveParams(typeDef, values = {}) {
  const p = {};
  for (const d of typeDef.params) p[d.key] = Object.hasOwn(values, d.key) ? values[d.key] : d.default;
  if (p.rhythm !== undefined && p.bays !== undefined) p.pattern = makePattern(p.rhythm, p.bays, p.seed ?? 0);
  return p;
}

/** Run a type definition. Returns { width, height, params, terminals }. */
export function generate(typeDef, values = {}) {
  const params = resolveParams(typeDef, values);
  const scope = { params };
  const root = {
    x: 0, y: 0,
    w: evalExpr(typeDef.size.w, scope),
    h: evalExpr(typeDef.size.h, scope),
    index: 0, count: 1, path: "0",
  };
  const terminals = [];
  apply(typeDef.rules, typeDef.axiom, root, params, params.seed ?? 0, 0, terminals);
  return { width: root.w, height: root.h, params, terminals };
}

function apply(rules, sym, shape, params, seed, depth, out) {
  if (depth > MAX_DEPTH) throw new Error(`depth limit (${MAX_DEPTH}) hit at ${shape.path} (${sym})`);
  const list = rules[sym];
  if (!list) throw new Error(`no rules for symbol "${sym}" at ${shape.path}`);

  const rand = mulberry32(hashSeed(seed, shape.path));
  const scope = {
    params,
    shape: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    index: shape.index,
    count: shape.count,
  };
  const ev = (e) => evalExpr(e, scope, { rand });
  const rule = list.find((r) => r.when === undefined || ev(r.when));
  if (!rule) return; // no rule matched: nothing is produced

  const next = (child, s) => apply(rules, s, child, params, seed, depth + 1, out);
  const isX = rule.axis === "x";
  const child = (start, len, i, n) => ({
    x: isX ? start : shape.x,
    y: isX ? shape.y : start,
    w: isX ? len : shape.w,
    h: isX ? shape.h : len,
    index: i, count: n, path: `${shape.path}.${i}`,
  });

  switch (rule.op) {
    case "nil":
      return;

    case "split": {
      const sizes = splitSizes(rule.parts.map((p) => p.size), isX ? shape.w : shape.h, ev, shape.path);
      let pos = isX ? shape.x : shape.y;
      rule.parts.forEach((p, i) => {
        if (sizes[i] > EPS) next(child(pos, sizes[i], i, rule.parts.length), p.sym);
        pos += sizes[i];
      });
      return;
    }

    case "repeat": {
      const len = isX ? shape.w : shape.h;
      const size = ev(rule.size);
      if (!(size > EPS)) throw new Error(`repeat size must be > 0 at ${shape.path}`);
      const n = Math.max(1, Math.floor(len / size + 1e-9)); // +1e-9: 25.2/3.6 must give 7, not 6
      const tile = len / n;
      const pattern = rule.pattern === undefined ? null : String(ev(rule.pattern));
      const start = isX ? shape.x : shape.y;
      for (let i = 0; i < n; i++) {
        const s = pattern ? rule.map[pattern[i % pattern.length]] : rule.sym;
        if (!s) throw new Error(`pattern letter "${pattern[i % pattern.length]}" has no map entry at ${shape.path}`);
        next(child(start + i * tile, tile, i, n), s);
      }
      return;
    }

    case "inset": {
      const m = (e) => (e === undefined ? 0 : Math.max(0, ev(e)));
      const [l, r] = fit(m(rule.l), m(rule.r), shape.w);
      const [b, t] = fit(m(rule.b), m(rule.t), shape.h);
      const piece = (x, y, w, h, i) => ({ x, y, w, h, index: i, count: 5, path: `${shape.path}.${i}` });
      const ring = [
        [shape.x, shape.y, shape.w, b], // bottom
        [shape.x, shape.y + shape.h - t, shape.w, t], // top
        [shape.x, shape.y + b, l, shape.h - b - t], // left
        [shape.x + shape.w - r, shape.y + b, r, shape.h - b - t], // right
      ];
      ring.forEach(([x, y, w, h], i) => {
        if (w > EPS && h > EPS) next(piece(x, y, w, h, i), rule.frame);
      });
      next(piece(shape.x + l, shape.y + b, shape.w - l - r, shape.h - b - t, 4), rule.inner);
      return;
    }

    case "emit": {
      const d = rule.depth === undefined ? 0.05 : ev(rule.depth);
      const z = rule.offset === undefined ? 0 : ev(rule.offset);
      if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(z)) throw new Error(`bad depth/offset at ${shape.path}`);
      out.push({ x: shape.x, y: shape.y, z, w: shape.w, h: shape.h, d, mat: rule.mat, role: rule.role, path: shape.path });
      return;
    }

    default:
      throw new Error(`unknown op "${rule.op}" at ${shape.path}`);
  }
}

/** The single size rule: absolute exprs + {r:n} relative + "~" fill. Result always sums to `len`. */
function splitSizes(specs, len, ev, path) {
  const abs = [];
  const rel = [];
  let absSum = 0;
  let relSum = 0;
  specs.forEach((s, i) => {
    abs[i] = 0;
    rel[i] = 0;
    if (s === "~") rel[i] = 1;
    else if (s !== null && typeof s === "object") rel[i] = ev(s.r);
    else abs[i] = ev(s);
    for (const v of [abs[i], rel[i]]) {
      if (!Number.isFinite(v) || v < 0) throw new Error(`bad split size at ${path}`);
    }
    absSum += abs[i];
    relSum += rel[i];
  });
  if (relSum > 0 && absSum < len) {
    const remaining = len - absSum;
    return specs.map((_, i) => abs[i] + (remaining * rel[i]) / relSum);
  }
  // Absolutes overflow, or nothing is flexible: scale absolutes proportionally so children tile the parent.
  const k = absSum > 0 ? len / absSum : 0;
  return abs.map((a) => a * k);
}

/** Shrink two margins proportionally so at least MIN_INNER of `len` remains. */
function fit(a, b, len) {
  const room = Math.max(len - MIN_INNER, 0);
  const s = a + b > room ? room / (a + b) : 1;
  return [a * s, b * s];
}
````

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/grammar/engine.test.mjs`
Expected: 15 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/studio/grammar/engine.js tests/grammar/engine.test.mjs
git commit -m "feat(grammar): shape-grammar engine with split/repeat/inset/emit/nil" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Type-file validator

**Files:**
- Create: `web/studio/grammar/validate.js`
- Test: `tests/grammar/validate.test.mjs`

**Interfaces:**
- Consumes: `compile` (Task 1).
- Produces: `SLOTS = ["primary","secondary","glass","frame"]`, `validateType(def): string[]` (empty = valid; each message starts with the offending path, e.g. `rules.S[0].sym: unknown symbol "Ghost"`), `assertValid(def): def` (throws one Error listing all messages).

- [ ] **Step 1: Write the failing test**

Create `tests/grammar/validate.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { validateType, assertValid } from "../../web/studio/grammar/validate.js";

const good = () => ({
  version: 1, id: "t", label: "T", size: { w: 10, h: 5 }, axiom: "S",
  params: [
    { key: "n", label: "n", type: "int", min: 1, max: 5, step: 1, default: 2 },
    { key: "r", label: "r", type: "enum", default: "a", options: [{ value: "a", label: "a" }] },
    { key: "b", label: "b", type: "bool", default: false },
  ],
  rules: {
    S: [{ op: "repeat", axis: "x", size: "params.n", sym: "E" }],
    E: [{ op: "emit", mat: "primary", role: "wall" }],
  },
  presets: [{ label: "p", values: { n: 3, r: "a", b: true } }],
});
const errorsOf = (mutate) => {
  const d = good();
  mutate(d);
  return validateType(d);
};

test("a correct type has no errors", () => assert.deepEqual(validateType(good()), []));

test("errors name the offending path", () => {
  assert.match(errorsOf((d) => (d.version = 2)).join(), /version/);
  assert.match(errorsOf((d) => (d.axiom = "Nope")).join(), /axiom/);
  assert.match(errorsOf((d) => (d.rules.S[0].sym = "Ghost")).join(), /rules\.S\[0\]\.sym: unknown symbol "Ghost"/);
  assert.match(errorsOf((d) => (d.rules.S[0].op = "spin")).join(), /rules\.S\[0\]: op must be one of/);
  assert.match(errorsOf((d) => (d.rules.S[0].size = "params.n +")).join(), /rules\.S\[0\]\.size/);
  assert.match(errorsOf((d) => (d.rules.S[0].when = "constructor")).join(), /rules\.S\[0\]\.when: forbidden/);
  assert.match(errorsOf((d) => (d.rules.E[0].mat = "gold")).join(), /rules\.E\[0\]: mat must be/);
  assert.match(errorsOf((d) => (d.rules.S[0].axis = "z")).join(), /axis must be/);
  assert.match(errorsOf((d) => (d.size.w = "bogus(")).join(), /size\.w/);
});

test("param and preset checks", () => {
  assert.match(errorsOf((d) => (d.params[0].default = 9)).join(), /params\[0\]: default must lie/);
  assert.match(errorsOf((d) => d.params.push({ ...d.params[0] })).join(), /duplicate key/);
  assert.match(errorsOf((d) => (d.params[1].default = "zz")).join(), /default must be one of/);
  assert.match(errorsOf((d) => (d.presets[0].values.n = 99)).join(), /presets\[0\]\.values\.n: out of range/);
  assert.match(errorsOf((d) => (d.presets[0].values.q = 1)).join(), /no such param/);
  assert.match(errorsOf((d) => (d.presets[0].values.r = "x")).join(), /not an option/);
  assert.match(errorsOf((d) => (d.presets[0].values.b = 1)).join(), /true\/false/);
});

test("pattern repeat needs a map with known symbols", () => {
  assert.match(errorsOf((d) => (d.rules.S[0] = { op: "repeat", axis: "x", size: 1, pattern: "params.n" })).join(), /needs a map/);
  assert.match(errorsOf((d) => (d.rules.S[0] = { op: "repeat", axis: "x", size: 1, pattern: "params.n", map: { A: "Ghost" } })).join(), /map\.A: unknown symbol/);
});

test("garbage input does not throw", () => {
  assert.deepEqual(validateType(null), ["root: must be an object"]);
  assert.ok(validateType({}).length > 0);
  assert.throws(() => assertValid({}), /invalid facade type/);
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/grammar/validate.test.mjs`
Expected: FAIL with `Cannot find module` for `validate.js`.

- [ ] **Step 3: Write the implementation**

Create `web/studio/grammar/validate.js`:

````javascript
// Structural validation of a facade type file. Returns readable errors that name the rule path.
import { compile } from "./expr.js";

export const SLOTS = ["primary", "secondary", "glass", "frame"];
const OPS = ["split", "repeat", "inset", "emit", "nil"];
const PARAM_TYPES = ["int", "float", "enum", "bool"];

export function validateType(def) {
  if (!def || typeof def !== "object") return ["root: must be an object"];
  const errs = [];
  const bad = (path, msg) => errs.push(`${path}: ${msg}`);
  const exprOk = (path, e) => {
    if (typeof e === "number" || typeof e === "boolean") return;
    if (typeof e !== "string") return bad(path, "must be a number or an expression string");
    try {
      compile(e);
    } catch (err) {
      bad(path, err.message);
    }
  };

  if (def.version !== 1) bad("version", "must be 1");
  if (typeof def.id !== "string" || !def.id) bad("id", "required string");
  if (typeof def.label !== "string" || !def.label) bad("label", "required string");
  if (!def.size) bad("size", "required {w, h}");
  else {
    exprOk("size.w", def.size.w);
    exprOk("size.h", def.size.h);
  }

  const keys = new Set();
  const params = Array.isArray(def.params) ? def.params : (bad("params", "must be an array"), []);
  params.forEach((p, i) => {
    const at = `params[${i}]`;
    if (typeof p.key !== "string" || !p.key) return bad(at, "key required");
    if (keys.has(p.key)) bad(at, `duplicate key "${p.key}"`);
    keys.add(p.key);
    if (typeof p.label !== "string") bad(at, "label required");
    if (!PARAM_TYPES.includes(p.type)) return bad(at, `type must be one of ${PARAM_TYPES.join(", ")}`);
    if (p.type === "int" || p.type === "float") {
      if (!(p.min <= p.default && p.default <= p.max)) bad(at, "default must lie within [min, max]");
      if (!(p.step > 0)) bad(at, "step must be > 0");
    } else if (p.type === "enum") {
      if (!Array.isArray(p.options) || !p.options.length) bad(at, "options required");
      else if (!p.options.some((o) => o.value === p.default)) bad(at, "default must be one of the options");
    } else if (typeof p.default !== "boolean") bad(at, "bool default must be true/false");
  });

  const rules = def.rules && typeof def.rules === "object" ? def.rules : (bad("rules", "required object"), {});
  if (!Object.hasOwn(rules, def.axiom)) bad("axiom", `"${def.axiom}" has no rules`);
  const sym = (path, s) => {
    if (!Object.hasOwn(rules, s)) bad(path, `unknown symbol "${s}"`);
  };
  for (const [name, list] of Object.entries(rules)) {
    if (!Array.isArray(list)) {
      bad(`rules.${name}`, "must be an array of rules");
      continue;
    }
    list.forEach((r, i) => {
      const at = `rules.${name}[${i}]`;
      if (r.when !== undefined) exprOk(`${at}.when`, r.when);
      if (!OPS.includes(r.op)) return bad(at, `op must be one of ${OPS.join(", ")}`);
      if ((r.op === "split" || r.op === "repeat") && r.axis !== "x" && r.axis !== "y") bad(at, 'axis must be "x" or "y"');
      if (r.op === "split") {
        if (!Array.isArray(r.parts) || !r.parts.length) return bad(at, "parts required");
        r.parts.forEach((p, j) => {
          const pa = `${at}.parts[${j}]`;
          if (p.size === "~") {
            // fill remainder
          } else if (p.size && typeof p.size === "object") exprOk(`${pa}.size.r`, p.size.r);
          else exprOk(`${pa}.size`, p.size);
          sym(`${pa}.sym`, p.sym);
        });
      } else if (r.op === "repeat") {
        exprOk(`${at}.size`, r.size);
        if (r.pattern !== undefined) {
          exprOk(`${at}.pattern`, r.pattern);
          if (!r.map || typeof r.map !== "object") bad(at, "pattern needs a map");
          else for (const [k, s] of Object.entries(r.map)) sym(`${at}.map.${k}`, s);
        } else sym(`${at}.sym`, r.sym);
      } else if (r.op === "inset") {
        for (const k of ["l", "r", "t", "b"]) if (r[k] !== undefined) exprOk(`${at}.${k}`, r[k]);
        sym(`${at}.inner`, r.inner);
        sym(`${at}.frame`, r.frame);
      } else if (r.op === "emit") {
        if (!SLOTS.includes(r.mat)) bad(at, `mat must be one of ${SLOTS.join(", ")}`);
        if (typeof r.role !== "string") bad(at, "role required");
        for (const k of ["depth", "offset"]) if (r[k] !== undefined) exprOk(`${at}.${k}`, r[k]);
      }
    });
  }

  (Array.isArray(def.presets) ? def.presets : (bad("presets", "must be an array"), [])).forEach((pr, i) => {
    const at = `presets[${i}]`;
    if (typeof pr.label !== "string") bad(at, "label required");
    for (const [k, v] of Object.entries(pr.values ?? {})) {
      const p = params.find((q) => q.key === k);
      if (!p) bad(`${at}.values.${k}`, "no such param");
      else if ((p.type === "int" || p.type === "float") && !(v >= p.min && v <= p.max)) bad(`${at}.values.${k}`, "out of range");
      else if (p.type === "enum" && !p.options?.some((o) => o.value === v)) bad(`${at}.values.${k}`, "not an option");
      else if (p.type === "bool" && typeof v !== "boolean") bad(`${at}.values.${k}`, "must be true/false");
    }
  });
  return errs;
}

export function assertValid(def) {
  const errs = validateType(def);
  if (errs.length) throw new Error(`invalid facade type "${def?.id}":\n  ${errs.join("\n  ")}`);
  return def;
}
````

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/grammar/validate.test.mjs`
Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/studio/grammar/validate.js tests/grammar/validate.test.mjs
git commit -m "feat(grammar): type-file validator with path-aware errors" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Grid facade type

**Files:**
- Create: `web/studio/types/grid.json`, `tests/grammar/helpers.mjs`
- Test: `tests/grammar/grid.test.mjs`

**Interfaces:**
- Consumes: `generate` (Task 3), `makePattern` (Task 2).
- Produces: the `grid` type file (format below, shared by all types) and `tests/grammar/helpers.mjs` exporting `typeIds()`, `loadType(id)`, `sweep(def, fullRangeKeys?)`, `sumArea(ts)`, `assertNoOverlap(ts, label?)`, `assertSameTerminals(a, b, label?)`, `assertSane(result, label?)`.

Type file format: `{ version: 1, id, label (Korean), size: {w, h} (expressions), params: [{key, label, type: int|float|enum|bool, min, max, step, default, options?}], axiom, rules, presets: [{label, values}] }`. Common params in every type: `floors, bays, windowRatio, floorHeight, rhythm, seed`. `windowRatio` is the linear fraction of the bay's width and height that is opening. The wall is the bay minus the window opening (four ring pieces), so there is no hidden slab and all terminals tile the facade plane. Terminal slots: `primary`, `secondary` (swappable finishes), `glass`, `frame`.

- [ ] **Step 1: Write the shared test helpers**

Create `tests/grammar/helpers.mjs`:

````javascript
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const TYPES_DIR = new URL("../../web/studio/types/", import.meta.url);

export const typeIds = () =>
  readdirSync(TYPES_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5)).sort();

export const loadType = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, TYPES_DIR), "utf8"));

/** All param value combinations at the extremes (plus every int in `fullRange` keys). */
export function* sweep(def, fullRange = []) {
  const options = def.params.map((p) => {
    if (p.type === "enum") return p.options.map((o) => o.value);
    if (p.type === "bool") return [false, true];
    if (fullRange.includes(p.key)) {
      const all = [];
      for (let v = p.min; v <= p.max; v += p.step) all.push(Math.round(v * 1000) / 1000);
      return all;
    }
    if (p.key === "seed") return [1, 7];
    return [p.min, p.max];
  });
  const idx = options.map(() => 0);
  for (;;) {
    yield Object.fromEntries(def.params.map((p, i) => [p.key, options[i][idx[i]]]));
    let k = 0;
    while (k < idx.length && ++idx[k] === options[k].length) idx[k++] = 0;
    if (k === idx.length) return;
  }
}

const EPS = 1e-6;
export const sumArea = (ts) => ts.reduce((s, t) => s + t.w * t.h, 0);

/** No two terminals may share positive volume. Sorted by x so it stays fast on the largest facades. */
export function assertNoOverlap(terminals, label = "") {
  const ts = [...terminals].sort((p, q) => p.x - q.x);
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i];
    for (let j = i + 1; j < ts.length; j++) {
      const b = ts[j];
      if (b.x >= a.x + a.w - EPS) break; // everything after this starts to the right of a
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      assert.ok(!(ox > EPS && oy > EPS && oz > EPS), `${label} overlap between ${a.path} (${a.role}) and ${b.path} (${b.role})`);
    }
  }
}

/** Same terminals (matched by path) with coordinates equal up to float noise. */
export function assertSameTerminals(a, b, label = "") {
  assert.deepEqual(a.map((t) => t.path), b.map((t) => t.path), `${label} paths differ`);
  a.forEach((t, i) => {
    for (const k of ["x", "y", "z", "w", "h", "d"]) assert.ok(Math.abs(t[k] - b[i][k]) < 1e-9, `${label} ${t.path}.${k}: ${t[k]} vs ${b[i][k]}`);
    assert.equal(t.mat, b[i].mat);
    assert.equal(t.role, b[i].role);
  });
}

export function assertSane(result, label = "") {
  const { width, height, terminals } = result;
  assert.ok(terminals.length > 0, `${label} no terminals`);
  for (const t of terminals) {
    for (const k of ["x", "y", "z", "w", "h", "d"]) assert.ok(Number.isFinite(t[k]), `${label} ${t.path}.${k} not finite`);
    assert.ok(t.w > 0 && t.h > 0 && t.d > 0, `${label} ${t.path} (${t.role}) has non-positive size`);
    assert.ok(t.x >= -EPS && t.y >= -EPS && t.x + t.w <= width + EPS && t.y + t.h <= height + EPS, `${label} ${t.path} outside the facade`);
  }
  assert.ok(Math.abs(sumArea(terminals) - width * height) < 1e-6, `${label} terminals do not tile the facade`);
}
````

- [ ] **Step 2: Write the failing test**

Create `tests/grammar/grid.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../../web/studio/grammar/engine.js";
import { makePattern } from "../../web/studio/grammar/rhythm.js";
import { loadType } from "./helpers.mjs";

const grid = loadType("grid");
const count = (r, role) => r.terminals.filter((t) => t.role === role).length;
const aBays = (rhythm, bays, seed) => {
  const p = makePattern(rhythm, bays, seed);
  return Array.from({ length: bays }, (_, i) => p[i % p.length]).filter((c) => c === "A").length;
};

test("grid: window count follows floors x bays (regular rhythm)", () => {
  for (const storefront of [true, false]) {
    for (const [floors, bays] of [[2, 2], [5, 6], [12, 12], [3, 9]]) {
      const r = generate(grid, { floors, bays, rhythm: "regular", storefront });
      assert.equal(count(r, "window"), floors * bays, `${floors}x${bays} storefront=${storefront}`);
    }
  }
});

test("grid: window count for every rhythm = A bays per floor (storefront floor is all glass)", () => {
  for (const rhythm of ["regular", "alternate", "group", "random"]) {
    for (const storefront of [true, false]) {
      const floors = 6, bays = 7, seed = 5;
      const r = generate(grid, { floors, bays, rhythm, seed, storefront });
      const perFloor = aBays(rhythm, bays, seed);
      const want = storefront ? bays + (floors - 1) * perFloor : floors * perFloor;
      assert.equal(count(r, "window"), want, `${rhythm} storefront=${storefront}`);
      assert.equal(count(r, "panel"), floors * bays - (storefront ? bays : 0) - (want - (storefront ? bays : 0)), `${rhythm} panels`);
    }
  }
});

test("grid: storefront uses thicker frames and the facade height includes the parapet", () => {
  const r = generate(grid, { floors: 4, floorHeight: 3.4, parapet: 0.6 });
  assert.ok(Math.abs(r.height - (4 * 3.4 + 0.6)) < 1e-9);
  assert.ok(Math.abs(r.width - 6 * 3.6) < 1e-9);
  assert.equal(count(r, "parapet"), 1);
});

test("grid: zero parapet emits no parapet and no zero-size terminal", () => {
  const r = generate(grid, { parapet: 0 });
  assert.equal(count(r, "parapet"), 0);
  assert.ok(r.terminals.every((t) => t.w > 0 && t.h > 0));
});

test("grid: each window glass is recessed behind the wall face", () => {
  const r = generate(grid, { storefront: false });
  const wall = r.terminals.find((t) => t.role === "wall");
  for (const g of r.terminals.filter((t) => t.role === "window")) assert.ok(g.z + g.d < wall.z + wall.d);
});
````

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/grammar/grid.test.mjs`
Expected: FAIL (`ENOENT` for `grid.json`).

- [ ] **Step 4: Write the type file**

Create `web/studio/types/grid.json`:

````json
{
  "version": 1,
  "id": "grid",
  "label": "그리드 창",
  "size": {
    "w": "params.bays * 3.6",
    "h": "params.floors * params.floorHeight + params.parapet"
  },
  "params": [
    {
      "key": "floors",
      "label": "층수",
      "type": "int",
      "min": 2,
      "max": 12,
      "step": 1,
      "default": 5
    },
    {
      "key": "bays",
      "label": "베이 수",
      "type": "int",
      "min": 2,
      "max": 12,
      "step": 1,
      "default": 6
    },
    {
      "key": "windowRatio",
      "label": "창 비율",
      "type": "float",
      "min": 0.3,
      "max": 0.9,
      "step": 0.05,
      "default": 0.6
    },
    {
      "key": "floorHeight",
      "label": "층고 (m)",
      "type": "float",
      "min": 2.8,
      "max": 4.5,
      "step": 0.1,
      "default": 3.4
    },
    {
      "key": "rhythm",
      "label": "리듬",
      "type": "enum",
      "default": "regular",
      "options": [
        {
          "value": "regular",
          "label": "규칙"
        },
        {
          "value": "alternate",
          "label": "교차"
        },
        {
          "value": "group",
          "label": "그룹"
        },
        {
          "value": "random",
          "label": "랜덤"
        }
      ]
    },
    {
      "key": "seed",
      "label": "시드",
      "type": "int",
      "min": 0,
      "max": 9999,
      "step": 1,
      "default": 1
    },
    {
      "key": "storefront",
      "label": "1층 상가",
      "type": "bool",
      "default": true
    },
    {
      "key": "parapet",
      "label": "파라펫 높이 (m)",
      "type": "float",
      "min": 0,
      "max": 1.2,
      "step": 0.1,
      "default": 0.6
    }
  ],
  "axiom": "Facade",
  "rules": {
    "Facade": [
      {
        "op": "split",
        "axis": "y",
        "parts": [
          {
            "size": "params.floors * params.floorHeight",
            "sym": "Body"
          },
          {
            "size": "~",
            "sym": "Parapet"
          }
        ]
      }
    ],
    "Body": [
      {
        "op": "repeat",
        "axis": "y",
        "size": "params.floorHeight",
        "sym": "Floor"
      }
    ],
    "Floor": [
      {
        "when": "params.storefront && index == 0",
        "op": "repeat",
        "axis": "x",
        "size": 3.6,
        "sym": "ShopBay"
      },
      {
        "op": "repeat",
        "axis": "x",
        "size": 3.6,
        "pattern": "params.pattern",
        "map": {
          "A": "BayA",
          "B": "BayB"
        }
      }
    ],
    "Parapet": [
      {
        "op": "emit",
        "mat": "secondary",
        "role": "parapet",
        "depth": 0.4
      }
    ],
    "BayA": [
      {
        "op": "inset",
        "l": "shape.w * (1 - params.windowRatio) / 2",
        "r": "shape.w * (1 - params.windowRatio) / 2",
        "b": "shape.h * (1 - params.windowRatio) * 0.6",
        "t": "shape.h * (1 - params.windowRatio) * 0.4",
        "inner": "Win",
        "frame": "WallPiece"
      }
    ],
    "BayB": [
      {
        "op": "emit",
        "mat": "secondary",
        "role": "panel",
        "depth": 0.3
      }
    ],
    "WallPiece": [
      {
        "op": "emit",
        "mat": "primary",
        "role": "wall",
        "depth": 0.3
      }
    ],
    "Win": [
      {
        "op": "inset",
        "l": 0.06,
        "r": 0.06,
        "t": 0.06,
        "b": 0.06,
        "inner": "Glass",
        "frame": "FramePiece"
      }
    ],
    "FramePiece": [
      {
        "op": "emit",
        "mat": "frame",
        "role": "frame",
        "depth": 0.1,
        "offset": 0.1
      }
    ],
    "Glass": [
      {
        "op": "emit",
        "mat": "glass",
        "role": "window",
        "depth": 0.02,
        "offset": 0.12
      }
    ],
    "ShopBay": [
      {
        "op": "inset",
        "l": 0.2,
        "r": 0.2,
        "t": 0.5,
        "b": 0.1,
        "inner": "ShopGlass",
        "frame": "ShopFrame"
      }
    ],
    "ShopFrame": [
      {
        "op": "emit",
        "mat": "frame",
        "role": "frame",
        "depth": 0.3
      }
    ],
    "ShopGlass": [
      {
        "op": "emit",
        "mat": "glass",
        "role": "window",
        "depth": 0.02,
        "offset": 0.1
      }
    ]
  },
  "presets": [
    {
      "label": "5층 규칙형",
      "values": {
        "floors": 5,
        "bays": 6,
        "windowRatio": 0.6,
        "floorHeight": 3.4,
        "rhythm": "regular",
        "seed": 1,
        "storefront": true,
        "parapet": 0.6
      }
    },
    {
      "label": "8층 교차 리듬",
      "values": {
        "floors": 8,
        "bays": 8,
        "windowRatio": 0.5,
        "floorHeight": 3.2,
        "rhythm": "alternate",
        "seed": 3,
        "storefront": false,
        "parapet": 0.9
      }
    }
  ]
}
````

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test tests/grammar/grid.test.mjs`
Expected: 5 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add web/studio/types/grid.json tests/grammar/helpers.mjs tests/grammar/grid.test.mjs
git commit -m "feat(types): grid punched-window facade type" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Curtain wall facade type

**Files:**
- Create: `web/studio/types/curtainwall.json`
- Test: `tests/grammar/curtainwall.test.mjs`

**Interfaces:**
- Consumes: `generate` (Task 3), `loadType` (Task 5).
- Produces: the `curtainwall` type file. Extra param: `divisions` (1-4 mullion cells per bay). Each cell has two mullion strips (left and right, drawn adjacent so they read as one mullion), hence mullion strips = `2 x floors x bays x divisions`.

- [ ] **Step 1: Write the failing test**

Create `tests/grammar/curtainwall.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../../web/studio/grammar/engine.js";
import { loadType } from "./helpers.mjs";

const cw = loadType("curtainwall");
const count = (r, role) => r.terminals.filter((t) => t.role === role).length;

test("curtainwall: glass cells = floors x bays x divisions; 2 mullion strips per cell", () => {
  for (const divisions of [1, 2, 3, 4]) {
    for (const bays of [2, 5, 7, 12]) {
      const floors = 3;
      const r = generate(cw, { floors, bays, divisions });
      const cells = floors * bays * divisions;
      assert.equal(count(r, "window"), cells, `bays=${bays} div=${divisions}`);
      assert.equal(count(r, "mullion"), 2 * cells);
      assert.equal(count(r, "spandrel"), cells);
    }
  }
});

test("curtainwall: windowRatio sets the vision-glass share of each floor", () => {
  const r = generate(cw, { floors: 2, bays: 2, divisions: 1, windowRatio: 0.75, floorHeight: 4 });
  const g = r.terminals.find((t) => t.role === "window");
  assert.ok(Math.abs(g.h - 3) < 1e-9);
  const s = r.terminals.find((t) => t.role === "spandrel");
  assert.ok(Math.abs(s.h - 1) < 1e-9);
});

test("curtainwall: width is bays x 3.6 and height is floors x floorHeight", () => {
  const r = generate(cw, { floors: 7, bays: 5, floorHeight: 3.5 });
  assert.ok(Math.abs(r.width - 18) < 1e-9 && Math.abs(r.height - 24.5) < 1e-9);
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/grammar/curtainwall.test.mjs`
Expected: FAIL (`ENOENT` for `curtainwall.json`).

- [ ] **Step 3: Write the type file**

Create `web/studio/types/curtainwall.json`:

````json
{
  "version": 1,
  "id": "curtainwall",
  "label": "커튼월",
  "size": {
    "w": "params.bays * 3.6",
    "h": "params.floors * params.floorHeight"
  },
  "params": [
    {
      "key": "floors",
      "label": "층수",
      "type": "int",
      "min": 2,
      "max": 12,
      "step": 1,
      "default": 10
    },
    {
      "key": "bays",
      "label": "베이 수",
      "type": "int",
      "min": 2,
      "max": 12,
      "step": 1,
      "default": 6
    },
    {
      "key": "windowRatio",
      "label": "창 비율",
      "type": "float",
      "min": 0.3,
      "max": 0.9,
      "step": 0.05,
      "default": 0.6
    },
    {
      "key": "floorHeight",
      "label": "층고 (m)",
      "type": "float",
      "min": 2.8,
      "max": 4.5,
      "step": 0.1,
      "default": 3.8
    },
    {
      "key": "rhythm",
      "label": "리듬",
      "type": "enum",
      "default": "regular",
      "options": [
        {
          "value": "regular",
          "label": "규칙"
        },
        {
          "value": "alternate",
          "label": "교차"
        },
        {
          "value": "group",
          "label": "그룹"
        },
        {
          "value": "random",
          "label": "랜덤"
        }
      ]
    },
    {
      "key": "seed",
      "label": "시드",
      "type": "int",
      "min": 0,
      "max": 9999,
      "step": 1,
      "default": 1
    },
    {
      "key": "divisions",
      "label": "베이당 멀리언 분할",
      "type": "int",
      "min": 1,
      "max": 4,
      "step": 1,
      "default": 2
    }
  ],
  "axiom": "Facade",
  "rules": {
    "Facade": [
      {
        "op": "repeat",
        "axis": "y",
        "size": "params.floorHeight",
        "sym": "CFloor"
      }
    ],
    "CFloor": [
      {
        "op": "split",
        "axis": "y",
        "parts": [
          {
            "size": "shape.h * (1 - params.windowRatio)",
            "sym": "Spandrel"
          },
          {
            "size": "~",
            "sym": "Vision"
          }
        ]
      }
    ],
    "Spandrel": [
      {
        "op": "repeat",
        "axis": "x",
        "size": "3.6 / params.divisions",
        "pattern": "params.pattern",
        "map": {
          "A": "SpanA",
          "B": "SpanB"
        }
      }
    ],
    "SpanA": [
      {
        "op": "emit",
        "mat": "secondary",
        "role": "spandrel",
        "depth": 0.08,
        "offset": 0.04
      }
    ],
    "SpanB": [
      {
        "op": "emit",
        "mat": "primary",
        "role": "spandrel",
        "depth": 0.08,
        "offset": 0.04
      }
    ],
    "Vision": [
      {
        "op": "repeat",
        "axis": "x",
        "size": "3.6 / params.divisions",
        "sym": "VCell"
      }
    ],
    "VCell": [
      {
        "op": "inset",
        "l": 0.03,
        "r": 0.03,
        "inner": "VGlass",
        "frame": "Mullion"
      }
    ],
    "VGlass": [
      {
        "op": "emit",
        "mat": "glass",
        "role": "window",
        "depth": 0.02,
        "offset": 0.1
      }
    ],
    "Mullion": [
      {
        "op": "emit",
        "mat": "frame",
        "role": "mullion",
        "depth": 0.16
      }
    ]
  },
  "presets": [
    {
      "label": "오피스 타워",
      "values": {
        "floors": 10,
        "bays": 6,
        "windowRatio": 0.65,
        "floorHeight": 3.8,
        "rhythm": "regular",
        "seed": 1,
        "divisions": 2
      }
    },
    {
      "label": "세밀한 멀리언",
      "values": {
        "floors": 6,
        "bays": 8,
        "windowRatio": 0.75,
        "floorHeight": 3.6,
        "rhythm": "group",
        "seed": 2,
        "divisions": 3
      }
    }
  ]
}
````

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/grammar/curtainwall.test.mjs`
Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/studio/types/curtainwall.json tests/grammar/curtainwall.test.mjs
git commit -m "feat(types): curtain wall facade type" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Louver / masonry facade type

**Files:**
- Create: `web/studio/types/louver.json`
- Test: `tests/grammar/louver.test.mjs`

**Interfaces:**
- Consumes: `generate` (Task 3), `makePattern` (Task 2), `loadType` (Task 5).
- Produces: the `louver` type file. Extra params: `louvers` (3-10 per floor opening), `louverDepth` (0.05-0.4 m beyond the wall face). `A` bays are masonry with a louvered opening; `B` bays are blank secondary-finish panels.

- [ ] **Step 1: Write the failing test**

Create `tests/grammar/louver.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../../web/studio/grammar/engine.js";
import { makePattern } from "../../web/studio/grammar/rhythm.js";
import { loadType } from "./helpers.mjs";

const louver = loadType("louver");
const count = (r, role) => r.terminals.filter((t) => t.role === role).length;

test("louver: louvers per open bay = params.louvers, for every louver count", () => {
  for (let louvers = 3; louvers <= 10; louvers++) {
    const floors = 3, bays = 5;
    const r = generate(louver, { floors, bays, louvers, rhythm: "regular" });
    assert.equal(count(r, "louver"), floors * bays * louvers, `louvers=${louvers}`);
    assert.equal(count(r, "window"), floors * bays * louvers); // one glass gap behind each louver
  }
});

test("louver: blank bays (B) become panels and carry no louvers", () => {
  const floors = 4, bays = 6, seed = 9, louvers = 5;
  const r = generate(louver, { floors, bays, louvers, rhythm: "alternate", seed });
  const p = makePattern("alternate", bays, seed);
  const a = Array.from({ length: bays }, (_, i) => p[i % p.length]).filter((c) => c === "A").length;
  assert.equal(count(r, "louver"), floors * a * louvers);
  assert.equal(count(r, "panel"), floors * (bays - a));
});

test("louver: louvers stand proud of the wall by louverDepth", () => {
  const r = generate(louver, { louverDepth: 0.3 });
  const wall = r.terminals.find((t) => t.role === "wall");
  const l = r.terminals.find((t) => t.role === "louver");
  assert.ok(Math.abs(l.z + l.d - (wall.z + wall.d + 0.3)) < 1e-9);
});

test("louver: louver bars never leave their opening (no louver wider than a bay)", () => {
  const r = generate(louver, {});
  assert.ok(r.terminals.filter((t) => t.role === "louver").every((t) => t.w < 3.6));
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/grammar/louver.test.mjs`
Expected: FAIL (`ENOENT` for `louver.json`).

- [ ] **Step 3: Write the type file**

Create `web/studio/types/louver.json`:

````json
{
  "version": 1,
  "id": "louver",
  "label": "루버 / 조적",
  "size": {
    "w": "params.bays * 3.6",
    "h": "params.floors * params.floorHeight"
  },
  "params": [
    {
      "key": "floors",
      "label": "층수",
      "type": "int",
      "min": 2,
      "max": 12,
      "step": 1,
      "default": 4
    },
    {
      "key": "bays",
      "label": "베이 수",
      "type": "int",
      "min": 2,
      "max": 12,
      "step": 1,
      "default": 6
    },
    {
      "key": "windowRatio",
      "label": "창 비율",
      "type": "float",
      "min": 0.3,
      "max": 0.9,
      "step": 0.05,
      "default": 0.6
    },
    {
      "key": "floorHeight",
      "label": "층고 (m)",
      "type": "float",
      "min": 2.8,
      "max": 4.5,
      "step": 0.1,
      "default": 3.6
    },
    {
      "key": "rhythm",
      "label": "리듬",
      "type": "enum",
      "default": "regular",
      "options": [
        {
          "value": "regular",
          "label": "규칙"
        },
        {
          "value": "alternate",
          "label": "교차"
        },
        {
          "value": "group",
          "label": "그룹"
        },
        {
          "value": "random",
          "label": "랜덤"
        }
      ]
    },
    {
      "key": "seed",
      "label": "시드",
      "type": "int",
      "min": 0,
      "max": 9999,
      "step": 1,
      "default": 1
    },
    {
      "key": "louvers",
      "label": "층당 루버 개수",
      "type": "int",
      "min": 3,
      "max": 10,
      "step": 1,
      "default": 6
    },
    {
      "key": "louverDepth",
      "label": "루버 돌출 (m)",
      "type": "float",
      "min": 0.05,
      "max": 0.4,
      "step": 0.05,
      "default": 0.2
    }
  ],
  "axiom": "Facade",
  "rules": {
    "Facade": [
      {
        "op": "repeat",
        "axis": "y",
        "size": "params.floorHeight",
        "sym": "LFloor"
      }
    ],
    "LFloor": [
      {
        "op": "repeat",
        "axis": "x",
        "size": 3.6,
        "pattern": "params.pattern",
        "map": {
          "A": "LBayA",
          "B": "LBayB"
        }
      }
    ],
    "LBayA": [
      {
        "op": "inset",
        "l": "shape.w * (1 - params.windowRatio) / 2",
        "r": "shape.w * (1 - params.windowRatio) / 2",
        "b": "shape.h * (1 - params.windowRatio) * 0.6",
        "t": "shape.h * (1 - params.windowRatio) * 0.4",
        "inner": "LOpen",
        "frame": "WallPiece"
      }
    ],
    "LBayB": [
      {
        "op": "emit",
        "mat": "secondary",
        "role": "panel",
        "depth": 0.3
      }
    ],
    "WallPiece": [
      {
        "op": "emit",
        "mat": "primary",
        "role": "wall",
        "depth": 0.3
      }
    ],
    "LOpen": [
      {
        "op": "repeat",
        "axis": "y",
        "size": "shape.h / params.louvers",
        "sym": "LCell"
      }
    ],
    "LCell": [
      {
        "op": "split",
        "axis": "y",
        "parts": [
          {
            "size": "shape.h * 0.6",
            "sym": "LGap"
          },
          {
            "size": "~",
            "sym": "Louver"
          }
        ]
      }
    ],
    "LGap": [
      {
        "op": "emit",
        "mat": "glass",
        "role": "window",
        "depth": 0.02,
        "offset": 0.1
      }
    ],
    "Louver": [
      {
        "op": "emit",
        "mat": "secondary",
        "role": "louver",
        "depth": "0.15 + params.louverDepth",
        "offset": 0.15
      }
    ]
  },
  "presets": [
    {
      "label": "루버 스크린",
      "values": {
        "floors": 4,
        "bays": 6,
        "windowRatio": 0.7,
        "floorHeight": 3.6,
        "rhythm": "regular",
        "seed": 1,
        "louvers": 6,
        "louverDepth": 0.2
      }
    },
    {
      "label": "불규칙 조적",
      "values": {
        "floors": 5,
        "bays": 7,
        "windowRatio": 0.6,
        "floorHeight": 3.4,
        "rhythm": "random",
        "seed": 7,
        "louvers": 8,
        "louverDepth": 0.3
      }
    }
  ]
}
````

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/grammar/louver.test.mjs`
Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/studio/types/louver.json tests/grammar/louver.test.mjs
git commit -m "feat(types): louver/masonry facade type" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Cross-type invariants, type index, golden snapshot

**Files:**
- Create: `web/studio/types/index.json`, `tests/grammar/golden.json` (generated)
- Test: `tests/grammar/types.test.mjs`, `tests/grammar/golden.test.mjs`

**Interfaces:**
- Consumes: all three type files, `helpers.mjs` (Task 5), `validateType`/`SLOTS` (Task 4).
- Produces: `types/index.json` (ordered list of type ids the browser fetches), and the guarantees every shipped type satisfies: valid, JSON-only, common params present, 2 presets, at most 9 params, presets tile exactly and are overlap-free and deterministic, every extreme param combination finite and tiling, largest facade under 50 ms, ground floor stable when `floors` changes.

- [ ] **Step 1: Write the type index**

Create `web/studio/types/index.json`:

````json
[
  "grid",
  "curtainwall",
  "louver"
]
````

- [ ] **Step 2: Write the invariants test**

Create `tests/grammar/types.test.mjs`:

````javascript
// Invariants every shipped facade type must satisfy. Type-specific counts live in <type>.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generate } from "../../web/studio/grammar/engine.js";
import { validateType, SLOTS } from "../../web/studio/grammar/validate.js";
import { typeIds, loadType, sweep, assertNoOverlap, assertSane, assertSameTerminals } from "./helpers.mjs";

const COMMON = ["floors", "bays", "windowRatio", "floorHeight", "rhythm", "seed"];

test("types/index.json lists exactly the type files", () => {
  const index = JSON.parse(readFileSync(new URL("../../web/studio/types/index.json", import.meta.url), "utf8"));
  assert.deepEqual([...index].sort(), typeIds());
  assert.ok(index.length >= 3);
});

for (const id of typeIds()) {
  const def = loadType(id);

  test(`${id}: valid, JSON-only, has the common params and 2 presets`, () => {
    assert.deepEqual(validateType(def), []);
    assert.deepEqual(JSON.parse(JSON.stringify(def)), def); // no functions / undefined smuggled in
    for (const k of COMMON) assert.ok(def.params.some((p) => p.key === k), `missing common param ${k}`);
    assert.equal(def.presets.length, 2);
    assert.ok(def.params.length <= 9, "keep the slider count small");
    assert.equal(def.id, id);
  });

  test(`${id}: presets are sane, tile exactly, overlap-free, deterministic`, () => {
    for (const pr of def.presets) {
      const a = generate(def, pr.values);
      assertSane(a, `${id}/${pr.label}`);
      assertNoOverlap(a.terminals, `${id}/${pr.label}`);
      assert.deepEqual(a, generate(def, pr.values));
      assert.ok(a.terminals.every((t) => SLOTS.includes(t.mat)));
    }
  });

  test(`${id}: every extreme parameter combination is finite and tiles the facade`, () => {
    let n = 0;
    for (const values of sweep(def, ["bays"])) {
      assertSane(generate(def, values), `${id} ${JSON.stringify(values)}`);
      n++;
    }
    assert.ok(n > 100, `sweep only covered ${n} combinations`);
  });

  test(`${id}: corner cases are overlap-free`, () => {
    for (const values of sweep(def)) {
      if (values.seed !== 1) continue;
      assertNoOverlap(generate(def, values).terminals, `${id} ${JSON.stringify(values)}`);
    }
  });

  test(`${id}: the largest facade generates in under 50 ms`, () => {
    const biggest = Object.fromEntries(def.params.filter((p) => p.max !== undefined).map((p) => [p.key, p.max]));
    biggest.rhythm = "random";
    generate(def, biggest); // warm-up: parses and caches expressions
    const t0 = performance.now();
    const r = generate(def, biggest);
    const ms = performance.now() - t0;
    assert.ok(ms < 50, `${id} took ${ms.toFixed(1)} ms for ${r.terminals.length} terminals`);
  });

  test(`${id}: changing floors keeps the ground floor's paths and geometry`, () => {
    const base = Object.fromEntries(def.params.map((p) => [p.key, p.default]));
    const ground = (floors) =>
      generate(def, { ...base, floors, storefront: true }).terminals.filter((t) => t.path.startsWith(id === "grid" ? "0.0.0." : "0.0."));
    const a = ground(3);
    const b = ground(7);
    assert.ok(a.length > 0);
    assertSameTerminals(a, b, id);
  });
}
````

- [ ] **Step 3: Write the golden test**

Create `tests/grammar/golden.test.mjs`:

````javascript
// Golden snapshot per preset: terminal count + bounding box only (full JSON would be brittle).
// Regenerate on purpose with:  UPDATE_GOLDEN=1 node --test tests/grammar/golden.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { generate } from "../../web/studio/grammar/engine.js";
import { typeIds, loadType } from "./helpers.mjs";

const FILE = new URL("./golden.json", import.meta.url);
const r3 = (v) => Math.round(v * 1000) / 1000;

function snapshot() {
  const out = {};
  for (const id of typeIds()) {
    const def = loadType(id);
    for (const pr of def.presets) {
      const { terminals, width, height } = generate(def, pr.values);
      const xs = terminals.flatMap((t) => [t.x, t.x + t.w]);
      const ys = terminals.flatMap((t) => [t.y, t.y + t.h]);
      const zs = terminals.flatMap((t) => [t.z, t.z + t.d]);
      out[`${id}/${pr.label}`] = {
        count: terminals.length, width: r3(width), height: r3(height),
        bbox: [r3(Math.min(...xs)), r3(Math.min(...ys)), r3(Math.min(...zs)), r3(Math.max(...xs)), r3(Math.max(...ys)), r3(Math.max(...zs))],
      };
    }
  }
  return out;
}

test("presets match the golden snapshot", () => {
  const now = snapshot();
  if (process.env.UPDATE_GOLDEN || !existsSync(FILE)) {
    writeFileSync(FILE, JSON.stringify(now, null, 2) + "\n");
    return;
  }
  assert.deepEqual(now, JSON.parse(readFileSync(FILE, "utf8")));
});
````

- [ ] **Step 4: Run the invariants and generate the golden file**

Run: `node --test tests/grammar/types.test.mjs tests/grammar/golden.test.mjs`
Expected: 19 invariant tests + the golden test pass (the golden test writes `tests/grammar/golden.json` on its first run). The sweep takes a few seconds.
If any invariant fails, read the message: it names the type, the parameter combination and the terminal path. Fix the type file, not the test.

- [ ] **Step 5: Confirm the golden file is stable**

Run: `node --test tests/grammar/golden.test.mjs` again.
Expected: pass, and `git diff --stat tests/grammar/golden.json` shows no change after the second run. Open `golden.json` and check that it has 6 entries (`grid/…`, `curtainwall/…`, `louver/…`, two each) with plausible counts (hundreds, not 0 or 100000).

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all tests pass, including the pre-existing `tests/*.test.mjs` (manifest, queue, render). Do not continue if any pre-existing test fails.

- [ ] **Step 7: Commit**

```bash
git add web/studio/types/index.json tests/grammar/types.test.mjs tests/grammar/golden.test.mjs tests/grammar/golden.json
git commit -m "test(types): cross-type invariants, type index and golden snapshot" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Material catalog and CC0 textures

**Files:**
- Create: `web/studio/view/catalog.js`, `tools/fetch_textures.py`, `tools/textures.json`, `web/textures/<material>/{color,normal,rough}.jpg` (x6), `web/textures/CREDITS.md`
- Test: `tests/textures.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MATERIAL_CATALOG: [{id, label, tile, fallback}]` for `concrete, brick, wood, plaster, metal, stone`, and `DEFAULT_FINISH = { primary: "brick", secondary: "concrete" }` (used by Task 10). Texture files at `web/textures/<id>/color.jpg|normal.jpg|rough.jpg`.

- [ ] **Step 1: Write the catalog and the failing test**

Create `web/studio/view/catalog.js`:

````javascript
// The 6 swappable finishes. `tile` = meters covered by one texture repeat; `fallback` = flat color used
// until (or if) the texture files fail to load. Texture files: web/textures/<id>/{color,normal,rough}.jpg
export const MATERIAL_CATALOG = [
  { id: "concrete", label: "콘크리트", tile: 2.0, fallback: 0xa9a9a6 },
  { id: "brick", label: "벽돌", tile: 1.2, fallback: 0x9c5a46 },
  { id: "wood", label: "목재", tile: 1.5, fallback: 0x9a7048 },
  { id: "plaster", label: "플라스터", tile: 2.0, fallback: 0xe3ddd0 },
  { id: "metal", label: "금속 패널", tile: 1.0, fallback: 0x8a9096 },
  { id: "stone", label: "석재", tile: 1.5, fallback: 0xb5ad9e },
];

// Which catalog entry each swappable slot starts with.
export const DEFAULT_FINISH = { primary: "brick", secondary: "concrete" };
````

Create `tests/textures.test.mjs`:

````javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "../web/studio/view/catalog.js";

const web = (p) => new URL(`../web/${p}`, import.meta.url);
const assets = JSON.parse(readFileSync(new URL("../tools/textures.json", import.meta.url), "utf8"));

test("catalog has the 6 finishes and valid defaults", () => {
  assert.deepEqual(MATERIAL_CATALOG.map((m) => m.id).sort(), ["brick", "concrete", "metal", "plaster", "stone", "wood"]);
  for (const id of Object.values(DEFAULT_FINISH)) assert.ok(MATERIAL_CATALOG.some((m) => m.id === id));
  for (const m of MATERIAL_CATALOG) assert.ok(m.tile > 0 && Number.isInteger(m.fallback));
});

test("every finish has color/normal/rough JPGs of a sane size", () => {
  for (const m of MATERIAL_CATALOG) {
    for (const f of ["color.jpg", "normal.jpg", "rough.jpg"]) {
      const url = web(`textures/${m.id}/${f}`);
      assert.ok(existsSync(url), `missing textures/${m.id}/${f}`);
      const size = statSync(url).size;
      assert.ok(size > 10_000 && size < 3_000_000, `${m.id}/${f} is ${size} bytes`);
      const head = readFileSync(url).subarray(0, 3);
      assert.deepEqual([...head], [0xff, 0xd8, 0xff], `${m.id}/${f} is not a JPEG`); // downloaded, not an HTML error page
    }
  }
});

test("total texture payload stays under 20 MB", () => {
  let total = 0;
  for (const m of MATERIAL_CATALOG) for (const f of ["color.jpg", "normal.jpg", "rough.jpg"]) total += statSync(web(`textures/${m.id}/${f}`)).size;
  assert.ok(total < 20_000_000, `${(total / 1e6).toFixed(1)} MB`);
});

test("tools/textures.json covers the catalog and CREDITS.md credits every asset as CC0", () => {
  assert.deepEqual(Object.keys(assets).sort(), MATERIAL_CATALOG.map((m) => m.id).sort());
  const credits = readFileSync(web("textures/CREDITS.md"), "utf8");
  assert.match(credits, /CC0/);
  assert.match(credits, /ambientcg\.com/i);
  for (const asset of Object.values(assets)) assert.ok(credits.includes(asset), `CREDITS.md does not mention ${asset}`);
});
````

Create `tools/fetch_textures.py`:

````python
"""Download ambientCG (CC0) 1K-JPG packs listed in tools/textures.json into web/textures/<material>/.

tools/textures.json maps a catalog material id to an ambientCG asset id, e.g. {"brick": "Bricks059"}.
Run it only after the user approved the list and the download. Usage: python -I tools/fetch_textures.py
"""
import io
import json
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
# zip member suffix -> file name our renderer expects
WANT = {"Color": "color.jpg", "NormalGL": "normal.jpg", "Roughness": "rough.jpg"}


def main():
    mapping = json.loads((ROOT / "tools" / "textures.json").read_text(encoding="utf-8"))
    for material, asset in mapping.items():
        url = f"https://ambientcg.com/get?file={asset}_1K-JPG.zip"
        print("GET", url)
        req = urllib.request.Request(url, headers={"User-Agent": "facade-studio-fetch"})
        data = urllib.request.urlopen(req, timeout=60).read()
        out = ROOT / "web" / "textures" / material
        out.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for suffix, name in WANT.items():
                member = f"{asset}_1K-JPG_{suffix}.jpg"
                # Read only the three exact members into memory; nothing else from the zip is extracted.
                (out / name).write_bytes(z.read(member))  # KeyError = zip layout changed: stop and look
        print("ok", material, asset, f"{len(data) // 1024} KB zip")


if __name__ == "__main__":
    main()
````

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/textures.test.mjs`
Expected: FAIL (`ENOENT` for `tools/textures.json`).

- [ ] **Step 3: Choose the assets (no download yet)**

For each of the 6 materials pick one ambientCG asset (https://ambientcg.com, license CC0). Use the built-in browser or WebFetch to read the asset pages. Criteria: a `1K-JPG` download exists, the pattern tiles (no obvious seams), it reads as the material at facade scale (brick: running bond with visible mortar; concrete: board-formed or smooth; wood: vertical-grain cladding; plaster: fine render; metal: panel/sheet with seams; stone: ashlar or cladding). Asset ids cannot be guessed: look them up.

Create `tools/textures.json` with the chosen ids (id format as shown on ambientCG, for example `Bricks059`; use the real ids you found):

```json
{ "concrete": "<ambientCG id>", "brick": "<ambientCG id>", "wood": "<ambientCG id>",
  "plaster": "<ambientCG id>", "metal": "<ambientCG id>", "stone": "<ambientCG id>" }
```

- [ ] **Step 4: STOP and ask the user for explicit OK to download**

Show a table: material, ambientCG asset id and page URL, file to download (`<id>_1K-JPG.zip` from `https://ambientcg.com/get?file=<id>_1K-JPG.zip`), size of each zip as shown on the asset page, the three files that will be kept from each zip (`_Color`, `_NormalGL`, `_Roughness`), and where they go (`web/textures/<material>/`). Wait for a clear yes. A change request means redo Step 3. Do not run the script before the yes.

- [ ] **Step 5: Download**

Run: `python -I tools/fetch_textures.py`
Expected: six `GET` lines and six `ok <material> <id> <n> KB zip` lines. A `KeyError` means a zip member is named differently: open that asset's zip listing, fix `WANT` or the member pattern in the script, and rerun.

- [ ] **Step 6: Write the credits**

Create `web/textures/CREDITS.md` (one row per material, real ids and URLs from `tools/textures.json`):

```markdown
# Texture credits

All textures are from [ambientCG](https://ambientcg.com), licensed CC0 (public domain). 1K JPG packs; only Color, NormalGL and Roughness are used.

| Finish | ambientCG asset | URL |
|---|---|---|
| 콘크리트 (concrete) | <id> | https://ambientcg.com/view?id=<id> |
| 벽돌 (brick) | <id> | https://ambientcg.com/view?id=<id> |
| 목재 (wood) | <id> | https://ambientcg.com/view?id=<id> |
| 플라스터 (plaster) | <id> | https://ambientcg.com/view?id=<id> |
| 금속 패널 (metal) | <id> | https://ambientcg.com/view?id=<id> |
| 석재 (stone) | <id> | https://ambientcg.com/view?id=<id> |
```

(Replace every `<id>` with the real id. The test fails if an asset id from `tools/textures.json` is missing from this file.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/textures.test.mjs`
Expected: 4 tests pass (catalog, files and JPEG signatures, total under 20 MB, credits). If the size test fails because a file is under 10 KB or over 3 MB, look at it: a tiny file is usually an HTML error page, not a JPEG.

- [ ] **Step 8: Commit**

```bash
git add web/studio/view/catalog.js tools/fetch_textures.py tools/textures.json web/textures tests/textures.test.mjs
git commit -m "feat(textures): material catalog and CC0 ambientCG 1K textures" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 3D view core and debug page (browser-verified)

**Files:**
- Create: `web/studio/view/materials.js`, `web/studio/view/scene.js`, `web/studio/view/controls.js`, `web/studio/debug.js`, `web/studio-debug.html`

**Interfaces:**
- Consumes: `generate` (Task 3), `assertValid`/`SLOTS` (Task 4), the three type files and `index.json` (Tasks 5-8), `MATERIAL_CATALOG`/`DEFAULT_FINISH` (Task 9), texture files (Task 9).
- Produces: `createScene(canvas): null | { setTerminals(terminals), setMaterial(slot, finishId), fit(w, h), screenshot(): Promise<Blob> }` (`null` = WebGL unavailable), `createMaterialLibrary(): { forSlot(slot, finishId) }`, `buildControls(container, typeDef, values, onChange)` (unstyled DOM generated from the param schema; class names `param`, `param-name`, `param-value`). These are the pieces Part 2 keeps; `debug.js` and `studio-debug.html` are throwaway.

Three.js specifics that matter: instanced unit boxes have stretched UVs, so `materials.js` replaces the texture UVs with world-space planar UVs (`onBeforeCompile`, relies on Three 0.160's `vMapUv` / `vNormalMapUv` / `vRoughnessMapUv`). If you ever change the pinned version, re-check that patch first.

- [ ] **Step 1: Write the view files**

Create `web/studio/view/materials.js`:

````javascript
import * as THREE from "three";
import { MATERIAL_CATALOG } from "./catalog.js";

const loader = new THREE.TextureLoader();

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x9ec3d6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55,
});
const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.8, roughness: 0.4 });

/**
 * Instanced unit boxes have stretched UVs. Replace them with world-space planar UVs
 * (projection plane chosen by the dominant normal axis) so one texture repeat = `tile` meters.
 */
function useWorldUv(material, tile) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = { value: tile };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTile;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 wn = abs(normalize(mat3(instanceMatrix) * normal));
          vec2 wuv = (wn.z >= wn.x && wn.z >= wn.y) ? wp.xy : ((wn.x >= wn.y) ? wp.zy : wp.xz);
          wuv /= uTile;
          #ifdef USE_MAP
            vMapUv = wuv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = wuv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = wuv;
          #endif
        }`
      );
  };
}

export function createMaterialLibrary() {
  const cache = new Map();

  function finish(id) {
    if (cache.has(id)) return cache.get(id);
    const entry = MATERIAL_CATALOG.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown material "${id}"`);
    // Flat fallback look; textures replace it when (and if) they load.
    const mat = new THREE.MeshStandardMaterial({ color: entry.fallback, roughness: 0.9 });
    useWorldUv(mat, entry.tile);
    const load = (file, apply) =>
      loader.load(
        `textures/${id}/${file}`,
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          apply(t);
          mat.needsUpdate = true;
        },
        undefined,
        () => console.warn(`texture missing, using flat color: textures/${id}/${file}`)
      );
    load("color.jpg", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t;
      mat.color.set(0xffffff);
    });
    load("normal.jpg", (t) => (mat.normalMap = t));
    load("rough.jpg", (t) => {
      mat.roughnessMap = t;
      mat.roughness = 1;
    });
    cache.set(id, mat);
    return mat;
  }

  return {
    /** Material for a slot. Only primary/secondary use `finishId`; glass and frame are fixed. */
    forSlot(slot, finishId) {
      if (slot === "glass") return glass;
      if (slot === "frame") return frame;
      return finish(finishId);
    },
  };
}
````

Create `web/studio/view/scene.js`:

````javascript
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SLOTS } from "../grammar/validate.js";
import { createMaterialLibrary } from "./materials.js";
import { DEFAULT_FINISH } from "./catalog.js";

/**
 * Thin Three.js layer: one InstancedMesh per material slot, fed with terminal boxes from the grammar.
 * Returns null when WebGL is unavailable (the caller shows a message).
 */
export function createScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ec);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const lib = createMaterialLibrary();
  const finish = { ...DEFAULT_FINISH };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const slots = new Map(); // slot -> { mesh, cap }
  const dummy = new THREE.Object3D();
  const materialFor = (slot) => lib.forSlot(slot, finish[slot]);

  function ensure(slot, n) {
    let s = slots.get(slot);
    if (s && s.cap >= n) return s;
    if (s) {
      scene.remove(s.mesh);
      s.mesh.dispose();
    }
    const cap = Math.max(64, n * 2);
    const mesh = new THREE.InstancedMesh(box, materialFor(slot), cap);
    mesh.castShadow = slot !== "glass";
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    s = { mesh, cap };
    slots.set(slot, s);
    return s;
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    /** terminals: [{x,y,z,w,h,d,mat}] from the grammar. Rewrites instance matrices only. */
    setTerminals(terminals) {
      const bySlot = Object.fromEntries(SLOTS.map((s) => [s, []]));
      for (const t of terminals) bySlot[t.mat].push(t);
      for (const slot of SLOTS) {
        const list = bySlot[slot];
        const s = list.length ? ensure(slot, list.length) : slots.get(slot);
        if (!s) continue;
        list.forEach((t, i) => {
          dummy.position.set(t.x + t.w / 2, t.y + t.h / 2, t.z + t.d / 2);
          dummy.scale.set(t.w, t.h, t.d);
          dummy.updateMatrix();
          s.mesh.setMatrixAt(i, dummy.matrix);
        });
        s.mesh.count = list.length;
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    },

    /** Swap the finish of a slot (primary/secondary). Geometry is untouched. */
    setMaterial(slot, finishId) {
      finish[slot] = finishId;
      const s = slots.get(slot);
      if (s) s.mesh.material = materialFor(slot);
    },

    /** Frame a width x height facade (meters) and aim the sun at it. */
    fit(w, h) {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max(h / 2 / t, w / 2 / camera.aspect / t) * 1.25 + 2;
      controls.target.set(w / 2, h / 2, 0);
      camera.position.set(w / 2 + dist * 0.45, h / 2 + dist * 0.1, dist * 0.95);
      sun.position.set(w / 2 - w * 0.6 - 10, h + 25, 35);
      sun.target.position.set(w / 2, h / 2, 0);
      const r = Math.max(w, h) * 1.2;
      Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 250 });
      sun.shadow.camera.updateProjectionMatrix();
      controls.update();
    },

    /** PNG Blob of the current view. */
    screenshot() {
      renderer.render(scene, camera);
      return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    },
  };
}
````

Create `web/studio/view/controls.js`:

````javascript
// Builds one control per param from the type's schema. Plain, unstyled DOM (class names only):
// the visual design comes later from the approved mockup. textContent only, never innerHTML.
export function buildControls(container, typeDef, values, onChange) {
  container.replaceChildren();
  for (const d of typeDef.params) {
    const row = document.createElement("label");
    row.className = "param";
    const name = document.createElement("span");
    name.className = "param-name";
    name.textContent = d.label;
    const shown = document.createElement("output");
    shown.className = "param-value";
    let input;
    let read;

    if (d.type === "enum") {
      input = document.createElement("select");
      for (const o of d.options) input.append(new Option(o.label, o.value));
      input.value = values[d.key];
      read = () => input.value;
    } else if (d.type === "bool") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = values[d.key];
      read = () => input.checked;
    } else {
      input = document.createElement("input");
      input.type = "range";
      input.min = d.min;
      input.max = d.max;
      input.step = d.step;
      input.value = values[d.key];
      read = () => Number(input.value);
    }
    input.dataset.key = d.key;
    const show = () => (shown.textContent = d.type === "enum" || d.type === "bool" ? "" : String(read()));
    show();
    input.addEventListener("input", () => {
      values[d.key] = read();
      show();
      onChange(d.key);
    });
    row.append(name, input, shown);
    container.append(row);
  }
}
````

- [ ] **Step 2: Write the debug page**

Create `web/studio-debug.html`:

````html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Facade Studio (debug)</title>
  <!-- THROWAWAY debug page: lets us check the grammar + 3D view before the real UI exists. Replaced in Part 2. -->
  <script type="importmap">
    { "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    } }
  </script>
  <style>
    body { margin: 0; font: 14px system-ui, sans-serif; display: grid; grid-template-columns: 280px 1fr; height: 100vh; }
    aside { padding: 12px; overflow: auto; border-right: 1px solid #ccc; }
    #view { width: 100%; height: 100%; display: block; }
    .param { display: grid; grid-template-columns: 1fr 1fr 3em; gap: 6px; align-items: center; margin: 4px 0; }
    #status { margin: 8px 0; color: #555; }
    @media (max-width: 700px) { body { grid-template-columns: 1fr; grid-template-rows: auto 60vh; height: auto; } }
  </style>
</head>
<body>
  <aside>
    <h3>Facade Studio (debug)</h3>
    <label>유형 <select id="type"></select></label>
    <div id="presets"></div>
    <div id="controls"></div>
    <button id="random" type="button">랜덤 (시드)</button>
    <h4>재질</h4>
    <label>주 마감재 <select id="mat-primary"></select></label><br>
    <label>보조 마감재 <select id="mat-secondary"></select></label>
    <p><button id="shot" type="button">PNG 저장</button></p>
    <p id="status" role="status"></p>
  </aside>
  <canvas id="view"></canvas>
  <script type="module" src="studio/debug.js"></script>
</body>
</html>
````

Create `web/studio/debug.js`:

````javascript
// Throwaway glue for studio-debug.html. The real app glue is written in Part 2 after the UI mockup is approved.
import { generate } from "./grammar/engine.js";
import { assertValid } from "./grammar/validate.js";
import { buildControls } from "./view/controls.js";
import { createScene } from "./view/scene.js";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "./view/catalog.js";

const $ = (s) => document.querySelector(s);
const status = $("#status");
const fail = (msg) => {
  status.textContent = msg;
};

const scene = createScene($("#view"));
if (!scene) {
  fail("이 브라우저에서는 WebGL을 사용할 수 없습니다.");
  throw new Error("WebGL unavailable");
}

let types;
try {
  const ids = await (await fetch("studio/types/index.json")).json();
  types = await Promise.all(ids.map(async (id) => assertValid(await (await fetch(`studio/types/${id}.json`)).json())));
} catch (e) {
  fail(`파사드 유형을 불러오지 못했습니다: ${e.message}`);
  throw e;
}

let def;
let values;
let queued = false;
let refit = false;

function regenerate() {
  try {
    const r = generate(def, values);
    scene.setTerminals(r.terminals);
    if (refit) scene.fit(r.width, r.height);
    refit = false;
    status.textContent = `${r.terminals.length}개 부재 · ${r.width.toFixed(1)}m × ${r.height.toFixed(1)}m`;
  } catch (e) {
    fail(`생성 오류: ${e.message}`);
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

function showControls() {
  buildControls($("#controls"), def, values, () => schedule());
}
function loadValues(preset) {
  values = { ...Object.fromEntries(def.params.map((p) => [p.key, p.default])), ...(preset?.values ?? {}) };
  showControls();
  schedule(true);
}
function selectType(i) {
  def = types[i];
  $("#presets").replaceChildren(
    ...def.presets.map((pr) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = pr.label;
      b.addEventListener("click", () => loadValues(pr));
      return b;
    })
  );
  loadValues(def.presets[0]);
}

$("#type").replaceChildren(...types.map((t, i) => new Option(t.label, i)));
$("#type").addEventListener("change", (e) => selectType(Number(e.target.value)));
$("#random").addEventListener("click", () => {
  values.seed = Math.floor(Math.random() * 10000);
  showControls();
  schedule();
});

for (const slot of ["primary", "secondary"]) {
  const sel = $(`#mat-${slot}`);
  sel.replaceChildren(...MATERIAL_CATALOG.map((m) => new Option(m.label, m.id)));
  sel.value = DEFAULT_FINISH[slot];
  sel.addEventListener("change", () => scene.setMaterial(slot, sel.value));
}

$("#shot").addEventListener("click", async () => {
  const blob = await scene.screenshot();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `facade-${def.id}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
});

selectType(0);
````

- [ ] **Step 3: Syntax-check and run the unit suite**

Run: `for f in web/studio/view/*.js web/studio/debug.js; do node --check "$f" && echo "ok $f"; done`
Expected: `ok` for all five files.
Run: `npm test`
Expected: everything still passes.

- [ ] **Step 4: Serve the site**

Run in the background: `python -m http.server 8000 -d web`
Open `http://localhost:8000/studio-debug.html` in the built-in browser (`mcp__Claude_Browser__preview_start` with that `url`). Prefer `read_page` / `get_page_text` / `read_console_messages` over screenshots for checks.

- [ ] **Step 5: Run the browser checklist and record the result of each line**

For every line write PASS / FAIL / NOT RUN with one sentence of evidence. A FAIL means fix the code and rerun the line; do not skip.

1. **Loads:** page shows a facade (grid, brick + concrete). `read_console_messages` shows 0 errors and no `texture missing` warnings. The status line reads `247개 부재 · 21.6m × 17.6m`, matching `grid/5층 규칙형` in `tests/grammar/golden.json`.
2. **All 6 presets:** switch the type select and click both preset buttons of each type. After each, the status count equals that preset's `count` in `golden.json`, there is no `생성 오류` text, and the facade is visibly different (take a screenshot per preset).
3. **Sliders:** for each type set every slider to its min and then its max (keyboard arrows or `form_input` on `input[data-key]`), including bays 12 x floors 12. Status updates each time, no `생성 오류`, no console errors.
4. **Material swap:** set the primary and then the secondary select through all 6 finishes. The surface visibly changes each time and swapping does not change the status count. Zoom (screenshot `zoom`) on a wall: brick/stone lines must be even on the wide wall pieces AND on the thin pieces above and below windows (that is the world-space UV patch working; stretched or smeared texture on thin pieces = FAIL).
5. **Big to small:** load the louver type, set floors 12, bays 12, louvers 10; then click a small preset (grid preset 1). No leftover boxes from the big facade remain visible and the status count matches `golden.json`. Then go small to big again (this crosses the instance capacity and must reallocate cleanly).
6. **Random button:** click `랜덤 (시드)` on the `random` rhythm; the seed slider value changes and the facade pattern changes; clicking twice quickly does not throw.
7. **Narrow screen:** `resize_window` to the mobile preset (375 wide). The canvas is not zero-sized and the controls are reachable. Reset to desktop afterwards.
8. **Missing texture fallback:** run `mv web/textures/stone web/textures/stone_off`, reload, pick stone as the primary finish: the facade shows a flat stone-colored finish (not black, not blank), the console shows `texture missing, using flat color` warnings, no crash. Then `mv web/textures/stone_off web/textures/stone`.
9. **PNG button:** click `PNG 저장`; no console error. (State plainly that the downloaded file itself was not inspected.)
10. **WebGL unavailable:** cannot be forced in the built-in browser. Mark NOT RUN unless you can disable WebGL in some browser available here; the code path is a `try/catch` around `new THREE.WebGLRenderer` that shows `이 브라우저에서는 WebGL을 사용할 수 없습니다.`

Save the screenshots from items 1-2 and 4 into the session scratchpad; they are reused for the mockup brief in Task 11.

- [ ] **Step 6: Stop the server and commit**

Stop the background server. Then:

```bash
git add web/studio/view/materials.js web/studio/view/scene.js web/studio/view/controls.js web/studio/debug.js web/studio-debug.html
git commit -m "feat(view): Three.js instanced view, PBR material swap, schema-driven controls, debug page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: UI mockup gate (no code)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-parametric-facade-studio-design.md` (Decisions table: replace "Not decided here" with the chosen mockup)

**Interfaces:**
- Consumes: the working debug page and its screenshots (Task 10).
- Produces: an approved UI mockup recorded in the spec, and the go-ahead to write Part 2. **No UI implementation before this task is approved.**

- [ ] **Step 1: Ask how the user wants to get mockups**

Offer: (a) the user gets mockups from Claude Design (as they did for their sunlight lab project), or (b) Claude makes HTML mockups as an artifact. Do not assume; ask and wait.

- [ ] **Step 2: Hand over a mockup brief**

Give the user (or the design tool) this brief, plus the Task 10 screenshots as "what the 3D view looks like now". Everything user-facing is Korean.

- Two tabs: `스튜디오` and `AI 갤러리`.
- Studio tab: large 3D canvas; facade type switcher (그리드 창 / 커튼월 / 루버·조적); 2 preset buttons per type; about 8 sliders generated from the type (층수, 베이 수, 창 비율, 층고, 리듬, 시드 + 1-2 type-specific); a `랜덤` button; two finish pickers (주 마감재, 보조 마감재) with 6 choices each (콘크리트, 벽돌, 목재, 플라스터, 금속 패널, 석재); a PNG save button; a status line.
- First impression: a facade is already on screen when the page opens; a visitor should be able to use it within 30 seconds without reading anything.
- Gallery tab: cards of pre-rendered SDXL results (4 materials x 2 sketches), lightbox, ZIP download; a short note explaining these were generated offline on a GPU.
- Must work at phone width (375 px) and desktop; light and dark themes are optional.
- Existing building blocks that can be reused: `web/style.css`, the lightbox `<dialog>`, the card grid.

- [ ] **Step 3: User reviews the mockups and decides**

Show the options, collect the user's choice and requested changes, iterate until they approve one. Do not start coding the UI.

- [ ] **Step 4: Record the decision**

Replace the "Concrete UI visuals | **Not decided here.** ..." row in the spec's Decisions table with the approved mockup (link or file path) and a two-line summary of the layout. Commit:

```bash
git add docs/superpowers/specs/2026-10-12-parametric-facade-studio-design.md
git commit -m "docs: record approved UI mockup in the spec" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Write Part 2**

Invoke `superpowers:writing-plans` to write `docs/superpowers/plans/<date>-parametric-facade-studio-part2.md` from the approved mockup. Part 1 is complete when that file exists and the user has reviewed it.

---

## Part 2 scope (to be planned after Task 11)

Written as its own plan once the mockup is approved. Expected content:

1. Real `web/index.html` + styles per the approved mockup: two tabs, studio layout, responsive.
2. App glue replacing `web/studio/debug.js` (preset auto-load on entry, random button, finish pickers, PNG save); delete `web/studio-debug.html`.
3. Gallery tab: move the existing demo-gallery code under `web/gallery/` (demo mode only, no live-mode UI; keep `queue.js`, `render.js`, `server/` as code); keep the old tests passing.
4. README rewrite: the "GPU constraint to browser pivot" story, how to run and test, texture credits (ambientCG ids from `web/textures/CREDITS.md`), existing sketch credits, honest status line.
5. Final checks: full `npm test`, the browser checklist on the real page (presets, sliders, 6 finishes, tab switch, console errors 0, phone width), unrun items reported plainly.
6. Out of scope until the user says so: deploying / enabling Pages, renaming the repo.
