import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "../web/studio/view/catalog.js";

const web = (p) => new URL(`../web/${p}`, import.meta.url);
const assets = JSON.parse(readFileSync(new URL("../tools/textures.json", import.meta.url), "utf8"));

test("catalog has the 6 finishes and valid defaults", () => {
  assert.deepEqual(MATERIAL_CATALOG.map((m) => m.id).sort(), ["brick", "concrete", "metal", "plaster", "stone", "wood"]);
  for (const id of Object.values(DEFAULT_FINISH)) assert.ok(MATERIAL_CATALOG.some((m) => m.id === id));
  for (const m of MATERIAL_CATALOG) assert.ok(m.tile > 0 && Number.isInteger(m.fallback));
});

test("every finish has color/normal/rough JPGs of a sane size", () => {
  for (const m of MATERIAL_CATALOG) {
    for (const f of ["color.jpg", "normal.jpg", "rough.jpg"]) {
      const url = web(`textures/${m.id}/${f}`);
      assert.ok(existsSync(url), `missing textures/${m.id}/${f}`);
      const size = statSync(url).size;
      assert.ok(size > 10_000 && size < 3_000_000, `${m.id}/${f} is ${size} bytes`);
      const head = readFileSync(url).subarray(0, 3);
      assert.deepEqual([...head], [0xff, 0xd8, 0xff], `${m.id}/${f} is not a JPEG`); // downloaded, not an HTML error page
    }
  }
});

test("total texture payload stays under 20 MB", () => {
  let total = 0;
  for (const m of MATERIAL_CATALOG) for (const f of ["color.jpg", "normal.jpg", "rough.jpg"]) total += statSync(web(`textures/${m.id}/${f}`)).size;
  assert.ok(total < 20_000_000, `${(total / 1e6).toFixed(1)} MB`);
});

test("tools/textures.json covers the catalog and CREDITS.md credits every asset as CC0", () => {
  assert.deepEqual(Object.keys(assets).sort(), MATERIAL_CATALOG.map((m) => m.id).sort());
  const credits = readFileSync(web("textures/CREDITS.md"), "utf8");
  assert.match(credits, /CC0/);
  assert.match(credits, /ambientcg\.com/i);
  for (const asset of Object.values(assets)) assert.ok(credits.includes(asset), `CREDITS.md does not mention ${asset}`);
});
