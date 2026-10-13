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

  test(`${id}: every 랜덤 press changes the facade, from every preset and at the minimum, default and maximum bays`, () => {
    const bays = def.params.find((p) => p.key === "bays");
    const look = (v) => JSON.stringify(generate(def, v).terminals.map((t) => `${t.path}:${t.mat}:${t.role}`));
    for (const pr of def.presets) {
      for (const n of [bays.min, bays.default, bays.max]) {
        const rand = mulberry32(n * 31 + 7);
        let values = { ...loadPreset(def, pr), bays: n };
        for (let i = 0; i < 60; i++) {
          const next = randomize(def, values, rand);
          assert.notEqual(look(next), look(values), `${id} / ${pr.label} / bays=${n}: press ${i + 1} left the facade unchanged`);
          values = next;
        }
      }
    }
  });
}
