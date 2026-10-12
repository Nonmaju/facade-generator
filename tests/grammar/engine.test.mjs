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
