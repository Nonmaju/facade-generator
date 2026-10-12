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
