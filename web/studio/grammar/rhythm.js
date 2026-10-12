import { hashSeed, mulberry32 } from "./rng.js";

const FIXED = { regular: "A", alternate: "AB", group: "AAB" };

/** Letter pattern for repeat ops: "A" = main bay, "B" = variant bay. Cycled by index. */
export function makePattern(rhythm, bays, seed) {
  if (Object.hasOwn(FIXED, rhythm)) return FIXED[rhythm];
  if (rhythm !== "random") throw new Error(`unknown rhythm "${rhythm}"`);
  const rand = mulberry32(hashSeed(seed, "rhythm"));
  const letters = Array.from({ length: Math.max(1, bays) }, () => (rand() < 0.3 ? "B" : "A"));
  if (!letters.includes("A")) letters[0] = "A"; // never an all-blank facade
  return letters.join("");
}
