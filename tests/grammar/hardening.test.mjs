// Nasty inputs a rule editor could produce. Each must end in a readable Error (or a list of validation messages),
// quickly, and never in a crash, a hang, a prototype write or a silently wrong facade.
import test from "node:test";
import assert from "node:assert/strict";
import { generate, resolveParams } from "../../web/studio/grammar/engine.js";
import { compile } from "../../web/studio/grammar/expr.js";
import { validateType } from "../../web/studio/grammar/validate.js";

const type = (rules, size = { w: 10, h: 6 }, params = []) => ({
  version: 1, id: "t", label: "t", size, axiom: "S", rules, presets: [],
  params: [{ key: "seed", type: "int", min: 0, max: 9, step: 1, default: 1, label: "s" }, ...params],
});
const leaf = [{ op: "emit", mat: "primary", role: "x", depth: 0.1 }];

function failsQuickly(def, pattern) {
  const t0 = performance.now();
  assert.throws(() => generate(def), pattern);
  assert.ok(performance.now() - t0 < 1000, `took ${(performance.now() - t0).toFixed(0)} ms to fail`);
}

test("an inherited name used as a symbol gives the normal 'no rules' error, not a TypeError", () => {
  failsQuickly(type({ S: [{ op: "repeat", axis: "x", size: 1, sym: "toString" }] }), /no rules for symbol "toString"/);
  failsQuickly(type({ S: [{ op: "repeat", axis: "x", size: 1, sym: "constructor" }] }), /no rules for symbol "constructor"/);
});

test("a param key named __proto__ never writes to the prototype", () => {
  const def = type({ S: leaf }, undefined, [{ key: "__proto__", type: "int", min: 0, max: 1, step: 1, default: 1, label: "p" }]);
  resolveParams(def, { ["__proto__"]: { polluted: true } });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(resolveParams(def, {})), Object.prototype);
});

test("the validator rejects param keys that are not plain identifiers or are forbidden", () => {
  for (const key of ["__proto__", "constructor", "a b", "1x", "", "a-b"]) {
    const def = type({ S: leaf }, undefined, [{ key, type: "int", min: 0, max: 1, step: 1, default: 1, label: "p" }]);
    assert.ok(validateType(def).some((m) => /key/.test(m)), `key ${JSON.stringify(key)} was accepted`);
  }
});

test("non-finite or non-positive sizes give readable errors instead of NaN boxes", () => {
  failsQuickly(type({ S: [{ op: "inset", l: "1 / 0", inner: "I", frame: "I" }], I: leaf }), /inset margin/);
  failsQuickly(type({ S: [{ op: "inset", l: "0 / 0", inner: "I", frame: "I" }], I: leaf }), /inset margin/);
  failsQuickly(type({ S: leaf }, { w: "0 / 0", h: 6 }), /facade size/);
  failsQuickly(type({ S: leaf }, { w: 0, h: 6 }), /facade size/);
  failsQuickly(type({ S: leaf }, { w: -3, h: 6 }), /facade size/);
  failsQuickly(type({ S: [{ op: "repeat", axis: "x", size: "1 / 0", sym: "S" }] }), /repeat size/);
  failsQuickly(type({ S: [{ op: "repeat", axis: "x", size: 0.001, sym: "I" }], I: leaf }), /repeat size/);
});

test("runaway fan-out is stopped by the shape limit, even when nothing is emitted", () => {
  const def = type({
    S: [{ op: "repeat", axis: "x", size: 0.034, sym: "R" }],
    R: [{ op: "repeat", axis: "y", size: 0.02, sym: "N" }],
    N: [{ op: "nil" }],
  });
  failsQuickly(def, /shape limit/);
});

test("too many terminals are stopped by the terminal limit", () => {
  const def = type({
    S: [{ op: "repeat", axis: "x", size: "10 / 150", sym: "R" }],
    R: [{ op: "repeat", axis: "y", size: "6 / 150", sym: "E" }],
    E: leaf,
  });
  failsQuickly(def, /terminal limit/);
});

test("self-recursion hits the depth limit immediately", () => {
  failsQuickly(type({ S: [{ op: "split", axis: "x", parts: [{ size: 1, sym: "S" }, { size: "~", sym: "S" }] }] }), /depth limit/);
});

test("expressions: overlong or deeply nested input is rejected without overflowing the stack", () => {
  assert.throws(() => compile("1+".repeat(200) + "1"), /too long/);
  assert.throws(() => compile("(".repeat(60) + "1" + ")".repeat(60)), /too deep/);
  assert.throws(() => compile("-".repeat(60) + "1"), /too deep/);
  assert.doesNotThrow(() => compile("((((1+2))))*3"));
});

test("the validator never throws on garbage; it returns messages", () => {
  const garbage = [
    { version: 1, id: "t", label: "t", size: { w: 1, h: 1 }, axiom: "S", params: [null], rules: { S: leaf }, presets: [] },
    { version: 1, id: "t", label: "t", size: { w: 1, h: 1 }, axiom: "S", params: [], rules: { S: [null] }, presets: [] },
    { version: 1, id: "t", label: "t", size: { w: 1, h: 1 }, axiom: "S", params: [], rules: { S: [{ op: "split", axis: "x", parts: [null] }] }, presets: [] },
    { version: 1, id: "t", label: "t", size: { w: 1, h: 1 }, axiom: "S", params: [], rules: { S: leaf }, presets: [null] },
    { version: 1, id: "t", label: "t", size: null, axiom: "S", params: "x", rules: [], presets: 5 },
    { version: 1, id: "t", label: "t", size: { w: 1, h: 1 }, axiom: "S", params: [], rules: { S: leaf }, presets: [{ label: "p", values: null }] },
  ];
  for (const def of garbage) {
    let out;
    assert.doesNotThrow(() => (out = validateType(def)), JSON.stringify(def).slice(0, 80));
    assert.ok(Array.isArray(out) && out.length > 0, "garbage must produce at least one message");
  }
});
