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
