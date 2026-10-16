// Checks that matter once the site is served by GitHub Pages: a case-sensitive Linux server, a subpath, no secrets.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const WEB = new URL("../web/", import.meta.url);
const tracked = new Set(execFileSync("git", ["ls-files", "web"], { encoding: "utf8", cwd: new URL("..", import.meta.url) }).split("\n").filter(Boolean));
const exists = (rel) => tracked.has(`web/${rel}`);

test("every relative path the page and its modules reference exists with exactly that casing (Pages is case-sensitive)", () => {
  const files = ["index.html", ...[...tracked].filter((f) => /^web\/studio\/.*\.(js|css)$/.test(f)).map((f) => f.slice(4))];
  const missing = [];
  for (const f of files) {
    const text = readFileSync(new URL(f, WEB), "utf8");
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
    const refs = [...text.matchAll(/(?:from\s+|import\s*\(|src=|href=|fetch\()\s*["'`](\.{1,2}\/[\w./-]+\.(?:js|css|json|svg|jpg|png)|studio\/[\w./-]+|textures\/[\w./-]+|favicon\.svg)["'`]/g)].map((m) => m[1]);
    for (const r of refs) {
      const parts = (r.startsWith(".") ? dir + r : r).split("/").reduce((acc, p) => (p === ".." ? acc.slice(0, -1) : p === "." || p === "" ? acc : [...acc, p]), []);
      if (!exists(parts.join("/"))) missing.push(`${f} -> ${r}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every texture and type file the app builds paths for exists with exact casing", () => {
  const catalog = readFileSync(new URL("studio/view/catalog.js", WEB), "utf8");
  const ids = [...catalog.matchAll(/id:\s*"(\w+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 6);
  for (const id of ids) for (const f of ["color.jpg", "normal.jpg", "rough.jpg", "thumb.jpg"]) assert.ok(exists(`textures/${id}/${f}`), `textures/${id}/${f}`);
  for (const t of JSON.parse(readFileSync(new URL("studio/types/index.json", WEB), "utf8"))) assert.ok(exists(`studio/types/${t}.json`), t);
});

test("no file under web/ has spaces, uppercase-only differences or looks like a secret", () => {
  const lower = new Map();
  for (const f of tracked) {
    assert.doesNotMatch(f, /\s/, `${f} contains a space`);
    assert.doesNotMatch(f, /(^|\/)\.env|secret|\.pem$|\.key$/i, `${f} looks private`);
    const k = f.toLowerCase();
    assert.ok(!lower.has(k) || lower.get(k) === f, `${f} differs from ${lower.get(k)} only by case`);
    lower.set(k, f);
  }
});

test("the page uses only relative URLs for its own files, so it works under /<repo>/", () => {
  const html = readFileSync(new URL("index.html", WEB), "utf8");
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  assert.doesNotMatch(readFileSync(new URL("studio/app.js", WEB), "utf8"), /fetch\(["'`]\//);
});

test("the Pages workflow can only be started by hand until the user enables Pages, and never switches Pages on by itself", () => {
  const path = new URL("../.github/workflows/pages.yml", import.meta.url);
  assert.ok(existsSync(path));
  const yml = readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"); // comments may mention the forbidden options
  assert.match(yml, /workflow_dispatch:/);
  assert.doesNotMatch(yml, /^\s*(push|pull_request|schedule):/m, "add the push trigger only after the user enables Pages and a manual run is green");
  assert.doesNotMatch(yml, /enablement/);
  assert.match(yml, /path:\s*web\b/);
  assert.match(yml, /pages:\s*write/);
  assert.match(yml, /id-token:\s*write/);
});

test("the CI workflow runs the tests on pull requests", () => {
  const yml = readFileSync(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  assert.match(yml, /pull_request:/);
  assert.match(yml, /node --test|npm test/);
});

test("the sharing meta tags exist and do not use relative image URLs", () => {
  const html = readFileSync(new URL("index.html", WEB), "utf8");
  for (const re of [/name="theme-color"/, /property="og:title"/, /property="og:description"/, /name="description"/]) assert.match(html, re);
  assert.doesNotMatch(html, /property="og:image"[^>]*content="(?!https:\/\/)/, "og:image must be absolute (set it when the repo name is final)");
});

test("the renderer is sharp on high-DPI screens: pixel ratio is set, capped at 2, and refreshed on resize", () => {
  const scene = readFileSync(new URL("studio/view/scene.js", WEB), "utf8");
  assert.match(scene, /setPixelRatio\(Math\.min\(window\.devicePixelRatio[^)]*,\s*2\)\)/);
  const resize = scene.match(/function resize\(\)\s*\{[\s\S]*?\n  \}/)[0];
  assert.match(resize, /setPixelRatio/);
});
