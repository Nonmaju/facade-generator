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

test("the Pages workflow deploys on pushes to main (and by hand), runs the tests first, and never switches Pages on or runs on PRs", () => {
  const path = new URL("../.github/workflows/pages.yml", import.meta.url);
  assert.ok(existsSync(path));
  const yml = readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"); // comments may mention the forbidden options
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(yml, /^\s*(pull_request|schedule):/m, "a PR or a timer must never deploy");
  assert.doesNotMatch(yml, /enablement/);
  assert.ok(yml.indexOf("npm test") < yml.indexOf("deploy-pages"), "tests must run before the deploy step");
  assert.match(yml, /path:\s*web$/m);
  assert.match(yml, /pages:\s*write/);
  assert.match(yml, /id-token:\s*write/);
});

test("README and CLAUDE.md say the site is live at its address, and no longer say it is not deployed", () => {
  const root = new URL("../", import.meta.url);
  const readme = readFileSync(new URL("README.md", root), "utf8");
  assert.match(readme, /https:\/\/nonmaju\.github\.io\/facade-studio\//);
  assert.doesNotMatch(readme, /아직 배포하지 않았습니다/);
  assert.doesNotMatch(readFileSync(new URL("CLAUDE.md", root), "utf8"), /not deployed/);
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

test("three.js is served from this repo (pinned 160, MIT notice kept), not from a CDN", () => {
  const html = readFileSync(new URL("index.html", WEB), "utf8");
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.equal(map.three, "./vendor/three/three.module.min.js");
  assert.equal(map["three/addons/"], "./vendor/three/addons/");
  for (const f of ["vendor/three/three.module.min.js", "vendor/three/addons/controls/OrbitControls.js", "vendor/three/addons/environments/RoomEnvironment.js", "vendor/three/LICENSE"]) assert.ok(exists(f), f);
  assert.match(readFileSync(new URL("vendor/three/three.module.min.js", WEB), "utf8").slice(0, 400), /const t="160"/);
  assert.match(readFileSync(new URL("vendor/three/LICENSE", WEB), "utf8"), /MIT License/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/, "only Google Fonts may remain as an external dependency");
  for (const f of tracked) if (/^web\/studio\/.*\.js$/.test(f)) assert.doesNotMatch(readFileSync(new URL("../" + f, WEB), "utf8"), /cdn\.jsdelivr\.net/, f);
});

test("the repo has an MIT LICENSE with a named holder, and package.json says MIT", () => {
  const root = new URL("../", import.meta.url);
  const text = readFileSync(new URL("LICENSE", root), "utf8");
  assert.match(text, /^MIT License/);
  assert.match(text, /Copyright \(c\) 2026 \S+/);
  assert.equal(JSON.parse(readFileSync(new URL("package.json", root), "utf8")).license, "MIT");
});

test("the sharing image and address are absolute and point at the final site name", () => {
  const html = readFileSync(new URL("index.html", WEB), "utf8");
  assert.match(html, /property="og:url" content="https:\/\/nonmaju\.github\.io\/facade-studio\/"/);
  assert.match(html, /property="og:image" content="https:\/\/nonmaju\.github\.io\/facade-studio\/og\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.ok(exists("og.png"));
  const png = readFileSync(new URL("og.png", WEB));
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test("the old repo name does not appear in the docs, scripts or page links", () => {
  const root = new URL("../", import.meta.url);
  const files = ["README.md", "package.json", "CLAUDE.md", "web/index.html"];
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, root), "utf8"), /facade-generator/, `${f} still names the old repo`);
});
