// Deterministic randomness. The seed of each shape is hash(global seed, child-index path),
// so changing one slider never reshuffles unrelated shapes.
export function hashSeed(seed, path) {
  let h = (2166136261 ^ (seed | 0)) >>> 0;
  for (const ch of String(path)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: returns a function giving floats in [0, 1). */
export function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
