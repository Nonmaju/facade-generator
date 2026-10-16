// Pure helpers for the studio page state (no DOM), so node --test can cover them.
import { makePattern } from "./grammar/rhythm.js";

export const defaultValues = (def) => Object.fromEntries(def.params.map((p) => [p.key, p.default]));

/** Values for a preset: the schema defaults overridden by the preset's own values. */
export const loadPreset = (def, preset) => ({ ...defaultValues(def), ...(preset?.values ?? {}) });

/** A param is shown unless its `showWhen` condition fails (e.g. the seed only while rhythm is "random"). */
export const isVisible = (param, values) => !param.showWhen || values[param.showWhen.key] === param.showWhen.equals;

/** After the rules were edited: keep each current value that still fits its (possibly changed) param, else use the default. */
export function reconcileValues(def, values = {}) {
  const out = {};
  for (const p of def.params) {
    const v = values?.[p.key];
    const ok =
      p.type === "enum" ? p.options?.some((o) => o.value === v)
      : p.type === "bool" ? typeof v === "boolean"
      : typeof v === "number" && Number.isFinite(v) && v >= p.min && v <= p.max;
    out[p.key] = ok ? v : p.default;
  }
  return out;
}

// The bay pattern stretched or cut to one letter per bay: two values with different results look different.
const perBay = (pattern, bays) => Array.from({ length: bays }, (_, i) => pattern[i % pattern.length]).join("");

/**
 * The 랜덤 button: switch rhythm to "random" and draw a new seed. A new seed alone can give the same bay pattern
 * (with few bays often), which would leave the facade unchanged, so redraw (bounded) until the pattern differs.
 */
export function randomize(def, values, rand = Math.random) {
  const next = { ...values, rhythm: "random" };
  const seed = def.params.find((p) => p.key === "seed");
  if (!seed) return next;
  const range = seed.max - seed.min + 1;
  const bays = values.bays;
  const before = bays === undefined ? null : perBay(makePattern(values.rhythm, bays, values.seed ?? 0), bays);
  for (let tries = 0; tries < 50; tries++) {
    let s = seed.min + Math.floor(rand() * range);
    if (s === values.seed && range > 1) s = seed.min + ((s - seed.min + 1) % range);
    next.seed = s;
    if (before === null || perBay(makePattern("random", bays, s), bays) !== before) break;
  }
  return next;
}
