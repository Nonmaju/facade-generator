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
