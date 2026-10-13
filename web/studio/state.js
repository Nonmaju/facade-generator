// Pure helpers for the studio page state (no DOM), so node --test can cover them.

export const defaultValues = (def) => Object.fromEntries(def.params.map((p) => [p.key, p.default]));

/** Values for a preset: the schema defaults overridden by the preset's own values. */
export const loadPreset = (def, preset) => ({ ...defaultValues(def), ...(preset?.values ?? {}) });

/** A param is shown unless its `showWhen` condition fails (e.g. the seed only while rhythm is "random"). */
export const isVisible = (param, values) => !param.showWhen || values[param.showWhen.key] === param.showWhen.equals;

/** The 랜덤 button: switch rhythm to "random" and draw a different seed, so every click changes the facade. */
export function randomize(def, values, rand = Math.random) {
  const next = { ...values, rhythm: "random" };
  const seed = def.params.find((p) => p.key === "seed");
  if (seed) {
    const range = seed.max - seed.min + 1;
    let s = seed.min + Math.floor(rand() * range);
    if (s === values.seed && range > 1) s = seed.min + ((s - seed.min + 1) % range);
    next.seed = s;
  }
  return next;
}
