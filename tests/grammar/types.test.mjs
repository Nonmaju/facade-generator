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
