// Structural validation of a facade type file. Returns readable errors that name the rule path.
import { compile } from "./expr.js";

export const SLOTS = ["primary", "secondary", "glass", "frame"];
const OPS = ["split", "repeat", "inset", "emit", "nil"];
const PARAM_TYPES = ["int", "float", "enum", "bool"];

export function validateType(def) {
  if (!def || typeof def !== "object") return ["root: must be an object"];
  const errs = [];
  const bad = (path, msg) => errs.push(`${path}: ${msg}`);
  const exprOk = (path, e) => {
    if (typeof e === "number" || typeof e === "boolean") return;
    if (typeof e !== "string") return bad(path, "must be a number or an expression string");
    try {
      compile(e);
    } catch (err) {
      bad(path, err.message);
    }
  };

  if (def.version !== 1) bad("version", "must be 1");
  if (typeof def.id !== "string" || !def.id) bad("id", "required string");
  if (typeof def.label !== "string" || !def.label) bad("label", "required string");
  if (!def.size) bad("size", "required {w, h}");
  else {
    exprOk("size.w", def.size.w);
    exprOk("size.h", def.size.h);
  }

  const keys = new Set();
  const params = Array.isArray(def.params) ? def.params : (bad("params", "must be an array"), []);
  params.forEach((p, i) => {
    const at = `params[${i}]`;
    if (typeof p.key !== "string" || !p.key) return bad(at, "key required");
    if (keys.has(p.key)) bad(at, `duplicate key "${p.key}"`);
    keys.add(p.key);
    if (typeof p.label !== "string") bad(at, "label required");
    if (!PARAM_TYPES.includes(p.type)) return bad(at, `type must be one of ${PARAM_TYPES.join(", ")}`);
    if (p.type === "int" || p.type === "float") {
      if (!(p.min <= p.default && p.default <= p.max)) bad(at, "default must lie within [min, max]");
      if (!(p.step > 0)) bad(at, "step must be > 0");
    } else if (p.type === "enum") {
      if (!Array.isArray(p.options) || !p.options.length) bad(at, "options required");
      else if (!p.options.some((o) => o.value === p.default)) bad(at, "default must be one of the options");
    } else if (typeof p.default !== "boolean") bad(at, "bool default must be true/false");
    if (p.showWhen !== undefined) {
      const w = p.showWhen;
      const target = params.find((q) => q.key === w?.key);
      const okEquals = target?.type === "enum" ? target.options?.some((o) => o.value === w.equals) : target?.type === "bool" ? typeof w.equals === "boolean" : false;
      if (!target || target.key === p.key) bad(`${at}.showWhen`, "key must name another param");
      else if (!okEquals) bad(`${at}.showWhen`, "target must be an enum or bool param and equals one of its values");
    }
  });

  const rules = def.rules && typeof def.rules === "object" ? def.rules : (bad("rules", "required object"), {});
  if (!Object.hasOwn(rules, def.axiom)) bad("axiom", `"${def.axiom}" has no rules`);
  const sym = (path, s) => {
    if (!Object.hasOwn(rules, s)) bad(path, `unknown symbol "${s}"`);
  };
  for (const [name, list] of Object.entries(rules)) {
    if (!Array.isArray(list)) {
      bad(`rules.${name}`, "must be an array of rules");
      continue;
    }
    list.forEach((r, i) => {
      const at = `rules.${name}[${i}]`;
      if (r.when !== undefined) exprOk(`${at}.when`, r.when);
      if (!OPS.includes(r.op)) return bad(at, `op must be one of ${OPS.join(", ")}`);
      if ((r.op === "split" || r.op === "repeat") && r.axis !== "x" && r.axis !== "y") bad(at, 'axis must be "x" or "y"');
      if (r.op === "split") {
        if (!Array.isArray(r.parts) || !r.parts.length) return bad(at, "parts required");
        r.parts.forEach((p, j) => {
          const pa = `${at}.parts[${j}]`;
          if (p.size === "~") {
            // fill remainder
          } else if (p.size && typeof p.size === "object") exprOk(`${pa}.size.r`, p.size.r);
          else exprOk(`${pa}.size`, p.size);
          sym(`${pa}.sym`, p.sym);
        });
      } else if (r.op === "repeat") {
        exprOk(`${at}.size`, r.size);
        if (r.pattern !== undefined) {
          exprOk(`${at}.pattern`, r.pattern);
          if (!r.map || typeof r.map !== "object") bad(at, "pattern needs a map");
          else for (const [k, s] of Object.entries(r.map)) sym(`${at}.map.${k}`, s);
        } else sym(`${at}.sym`, r.sym);
      } else if (r.op === "inset") {
        for (const k of ["l", "r", "t", "b"]) if (r[k] !== undefined) exprOk(`${at}.${k}`, r[k]);
        sym(`${at}.inner`, r.inner);
        sym(`${at}.frame`, r.frame);
      } else if (r.op === "emit") {
        if (!SLOTS.includes(r.mat)) bad(at, `mat must be one of ${SLOTS.join(", ")}`);
        if (typeof r.role !== "string") bad(at, "role required");
        for (const k of ["depth", "offset"]) if (r[k] !== undefined) exprOk(`${at}.${k}`, r[k]);
      }
    });
  }

  (Array.isArray(def.presets) ? def.presets : (bad("presets", "must be an array"), [])).forEach((pr, i) => {
    const at = `presets[${i}]`;
    if (typeof pr.label !== "string") bad(at, "label required");
    for (const [k, v] of Object.entries(pr.values ?? {})) {
      const p = params.find((q) => q.key === k);
      if (!p) bad(`${at}.values.${k}`, "no such param");
      else if ((p.type === "int" || p.type === "float") && !(v >= p.min && v <= p.max)) bad(`${at}.values.${k}`, "out of range");
      else if (p.type === "enum" && !p.options?.some((o) => o.value === v)) bad(`${at}.values.${k}`, "not an option");
      else if (p.type === "bool" && typeof v !== "boolean") bad(`${at}.values.${k}`, "must be true/false");
    }
  });
  return errs;
}

export function assertValid(def) {
  const errs = validateType(def);
  if (errs.length) throw new Error(`invalid facade type "${def?.id}":\n  ${errs.join("\n  ")}`);
  return def;
}
