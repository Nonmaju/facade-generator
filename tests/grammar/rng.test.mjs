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
