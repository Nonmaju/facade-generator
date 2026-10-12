import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const TYPES_DIR = new URL("../../web/studio/types/", import.meta.url);

export const typeIds = () =>
  readdirSync(TYPES_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5)).sort();

export const loadType = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, TYPES_DIR), "utf8"));

/** All param value combinations at the extremes (plus every int in `fullRange` keys). */
export function* sweep(def, fullRange = []) {
  const options = def.params.map((p) => {
    if (p.type === "enum") return p.options.map((o) => o.value);
    if (p.type === "bool") return [false, true];
    if (fullRange.includes(p.key)) {
      const all = [];
      for (let v = p.min; v <= p.max; v += p.step) all.push(Math.round(v * 1000) / 1000);
      return all;
    }
    if (p.key === "seed") return [1, 7];
    return [p.min, p.max];
  });
  const idx = options.map(() => 0);
  for (;;) {
    yield Object.fromEntries(def.params.map((p, i) => [p.key, options[i][idx[i]]]));
    let k = 0;
    while (k < idx.length && ++idx[k] === options[k].length) idx[k++] = 0;
    if (k === idx.length) return;
  }
}

const EPS = 1e-6;
export const sumArea = (ts) => ts.reduce((s, t) => s + t.w * t.h, 0);

/** No two terminals may share positive volume. Sorted by x so it stays fast on the largest facades. */
export function assertNoOverlap(terminals, label = "") {
  const ts = [...terminals].sort((p, q) => p.x - q.x);
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i];
    for (let j = i + 1; j < ts.length; j++) {
      const b = ts[j];
      if (b.x >= a.x + a.w - EPS) break; // everything after this starts to the right of a
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      assert.ok(!(ox > EPS && oy > EPS && oz > EPS), `${label} overlap between ${a.path} (${a.role}) and ${b.path} (${b.role})`);
    }
  }
}

/** Same terminals (matched by path) with coordinates equal up to float noise. */
export function assertSameTerminals(a, b, label = "") {
  assert.deepEqual(a.map((t) => t.path), b.map((t) => t.path), `${label} paths differ`);
  a.forEach((t, i) => {
    for (const k of ["x", "y", "z", "w", "h", "d"]) assert.ok(Math.abs(t[k] - b[i][k]) < 1e-9, `${label} ${t.path}.${k}: ${t[k]} vs ${b[i][k]}`);
    assert.equal(t.mat, b[i].mat);
    assert.equal(t.role, b[i].role);
  });
}

export function assertSane(result, label = "") {
  const { width, height, terminals } = result;
  assert.ok(terminals.length > 0, `${label} no terminals`);
  for (const t of terminals) {
    for (const k of ["x", "y", "z", "w", "h", "d"]) assert.ok(Number.isFinite(t[k]), `${label} ${t.path}.${k} not finite`);
    assert.ok(t.w > 0 && t.h > 0 && t.d > 0, `${label} ${t.path} (${t.role}) has non-positive size`);
    assert.ok(t.x >= -EPS && t.y >= -EPS && t.x + t.w <= width + EPS && t.y + t.h <= height + EPS, `${label} ${t.path} outside the facade`);
  }
  assert.ok(Math.abs(sumArea(terminals) - width * height) < 1e-6, `${label} terminals do not tile the facade`);
}
