import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const manifest = JSON.parse(readFileSync("web/samples/manifest.json", "utf8"));

test("every manifest path exists on disk", () => {
  const paths = [
    ...manifest.sketches.map((s) => s.src),
    ...Object.values(manifest.renders).flatMap((m) => Object.values(m)),
  ];
  assert.ok(paths.length >= 10);
  for (const p of paths) assert.ok(existsSync(`web/${p}`), `missing web/${p}`);
});

test("every sketch has a render for every material", () => {
  for (const s of manifest.sketches)
    for (const m of manifest.materials)
      assert.ok(manifest.renders[s.id]?.[m.id], `${s.id}/${m.id}`);
});
