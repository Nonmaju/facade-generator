// Shape-grammar interpreter. Pure JS: no DOM, no Three.js.
// Coordinates: facade plane, x right, y up, meters, origin bottom-left. z points toward the viewer.
import { evalExpr } from "./expr.js";
import { hashSeed, mulberry32 } from "./rng.js";
import { makePattern } from "./rhythm.js";

const EPS = 1e-6;
const MIN_INNER = 0.02; // inset never leaves an inner rect thinner than this
const MAX_DEPTH = 32;

/** Defaults from the type's param schema, overridden by `values`, plus the derived rhythm pattern. */
export function resolveParams(typeDef, values = {}) {
  const p = {};
  for (const d of typeDef.params) p[d.key] = Object.hasOwn(values, d.key) ? values[d.key] : d.default;
  if (p.rhythm !== undefined && p.bays !== undefined) p.pattern = makePattern(p.rhythm, p.bays, p.seed ?? 0);
  return p;
}

/** Run a type definition. Returns { width, height, params, terminals }. */
export function generate(typeDef, values = {}) {
  const params = resolveParams(typeDef, values);
  const scope = { params };
  const root = {
    x: 0, y: 0,
    w: evalExpr(typeDef.size.w, scope),
    h: evalExpr(typeDef.size.h, scope),
    index: 0, count: 1, path: "0",
  };
  const terminals = [];
  apply(typeDef.rules, typeDef.axiom, root, params, params.seed ?? 0, 0, terminals);
  return { width: root.w, height: root.h, params, terminals };
}

function apply(rules, sym, shape, params, seed, depth, out) {
  if (depth > MAX_DEPTH) throw new Error(`depth limit (${MAX_DEPTH}) hit at ${shape.path} (${sym})`);
  const list = rules[sym];
  if (!list) throw new Error(`no rules for symbol "${sym}" at ${shape.path}`);

  const rand = mulberry32(hashSeed(seed, shape.path));
  const scope = {
    params,
    shape: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    index: shape.index,
    count: shape.count,
  };
  const ev = (e) => evalExpr(e, scope, { rand });
  const rule = list.find((r) => r.when === undefined || ev(r.when));
  if (!rule) return; // no rule matched: nothing is produced

  const next = (child, s) => apply(rules, s, child, params, seed, depth + 1, out);
  const isX = rule.axis === "x";
  const child = (start, len, i, n) => ({
    x: isX ? start : shape.x,
    y: isX ? shape.y : start,
    w: isX ? len : shape.w,
    h: isX ? shape.h : len,
    index: i, count: n, path: `${shape.path}.${i}`,
  });

  switch (rule.op) {
    case "nil":
      return;

    case "split": {
      const sizes = splitSizes(rule.parts.map((p) => p.size), isX ? shape.w : shape.h, ev, shape.path);
      let pos = isX ? shape.x : shape.y;
      rule.parts.forEach((p, i) => {
        if (sizes[i] > EPS) next(child(pos, sizes[i], i, rule.parts.length), p.sym);
        pos += sizes[i];
      });
      return;
    }

    case "repeat": {
      const len = isX ? shape.w : shape.h;
      const size = ev(rule.size);
      if (!(size > EPS)) throw new Error(`repeat size must be > 0 at ${shape.path}`);
      const n = Math.max(1, Math.floor(len / size + 1e-9)); // +1e-9: 25.2/3.6 must give 7, not 6
      const tile = len / n;
      const pattern = rule.pattern === undefined ? null : String(ev(rule.pattern));
      const start = isX ? shape.x : shape.y;
      for (let i = 0; i < n; i++) {
        const s = pattern ? rule.map[pattern[i % pattern.length]] : rule.sym;
        if (!s) throw new Error(`pattern letter "${pattern[i % pattern.length]}" has no map entry at ${shape.path}`);
        next(child(start + i * tile, tile, i, n), s);
      }
      return;
    }

    case "inset": {
      const m = (e) => (e === undefined ? 0 : Math.max(0, ev(e)));
      const [l, r] = fit(m(rule.l), m(rule.r), shape.w);
      const [b, t] = fit(m(rule.b), m(rule.t), shape.h);
      const piece = (x, y, w, h, i) => ({ x, y, w, h, index: i, count: 5, path: `${shape.path}.${i}` });
      const ring = [
        [shape.x, shape.y, shape.w, b], // bottom
        [shape.x, shape.y + shape.h - t, shape.w, t], // top
        [shape.x, shape.y + b, l, shape.h - b - t], // left
        [shape.x + shape.w - r, shape.y + b, r, shape.h - b - t], // right
      ];
      ring.forEach(([x, y, w, h], i) => {
        if (w > EPS && h > EPS) next(piece(x, y, w, h, i), rule.frame);
      });
      next(piece(shape.x + l, shape.y + b, shape.w - l - r, shape.h - b - t, 4), rule.inner);
      return;
    }

    case "emit": {
      const d = rule.depth === undefined ? 0.05 : ev(rule.depth);
      const z = rule.offset === undefined ? 0 : ev(rule.offset);
      if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(z)) throw new Error(`bad depth/offset at ${shape.path}`);
      out.push({ x: shape.x, y: shape.y, z, w: shape.w, h: shape.h, d, mat: rule.mat, role: rule.role, path: shape.path });
      return;
    }

    default:
      throw new Error(`unknown op "${rule.op}" at ${shape.path}`);
  }
}

/** The single size rule: absolute exprs + {r:n} relative + "~" fill. Result always sums to `len`. */
function splitSizes(specs, len, ev, path) {
  const abs = [];
  const rel = [];
  let absSum = 0;
  let relSum = 0;
  specs.forEach((s, i) => {
    abs[i] = 0;
    rel[i] = 0;
    if (s === "~") rel[i] = 1;
    else if (s !== null && typeof s === "object") rel[i] = ev(s.r);
    else abs[i] = ev(s);
    for (const v of [abs[i], rel[i]]) {
      if (!Number.isFinite(v) || v < 0) throw new Error(`bad split size at ${path}`);
    }
    absSum += abs[i];
    relSum += rel[i];
  });
  if (relSum > 0 && absSum < len) {
    const remaining = len - absSum;
    return specs.map((_, i) => abs[i] + (remaining * rel[i]) / relSum);
  }
  // Absolutes overflow, or nothing is flexible: scale absolutes proportionally so children tile the parent.
  const k = absSum > 0 ? len / absSum : 0;
  return abs.map((a) => a * k);
}

/** Shrink two margins proportionally so at least MIN_INNER of `len` remains. */
function fit(a, b, len) {
  const room = Math.max(len - MIN_INNER, 0);
  const s = a + b > room ? room / (a + b) : 1;
  return [a * s, b * s];
}
