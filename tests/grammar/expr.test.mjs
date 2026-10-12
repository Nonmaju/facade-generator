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
