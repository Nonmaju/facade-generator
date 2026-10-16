// Golden snapshot per preset: terminal count + bounding box only (full JSON would be brittle).
// Regenerate on purpose with:  UPDATE_GOLDEN=1 node --test tests/grammar/golden.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { generate } from "../../web/studio/grammar/engine.js";
import { typeIds, loadType } from "./helpers.mjs";

const FILE = new URL("./golden.json", import.meta.url);
const r3 = (v) => Math.round(v * 1000) / 1000;

function snapshot() {
  const out = {};
  for (const id of typeIds()) {
    const def = loadType(id);
    for (const pr of def.presets) {
      const { terminals, width, height } = generate(def, pr.values);
      const xs = terminals.flatMap((t) => [t.x, t.x + t.w]);
      const ys = terminals.flatMap((t) => [t.y, t.y + t.h]);
      const zs = terminals.flatMap((t) => [t.z, t.z + t.d]);
      out[`${id}/${pr.label}`] = {
        count: terminals.length, width: r3(width), height: r3(height),
        bbox: [r3(Math.min(...xs)), r3(Math.min(...ys)), r3(Math.min(...zs)), r3(Math.max(...xs)), r3(Math.max(...ys)), r3(Math.max(...zs))],
      };
    }
  }
  return out;
}

test("presets match the golden snapshot", () => {
  const now = snapshot();
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(FILE, JSON.stringify(now, null, 2) + "\n");
    return;
  }
  assert.ok(existsSync(FILE), "golden.json is missing: run with UPDATE_GOLDEN=1 once and commit it (a missing snapshot must not pass silently)");
  assert.deepEqual(now, JSON.parse(readFileSync(FILE, "utf8")));
});
