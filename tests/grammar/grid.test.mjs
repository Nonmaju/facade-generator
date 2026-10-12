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
