// Smoke checks for the static page: it must reference files that exist and contain every element app.js looks up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const WEB = new URL("../web/", import.meta.url);
const html = readFileSync(new URL("index.html", WEB), "utf8");
const app = readFileSync(new URL("studio/app.js", WEB), "utf8");

test("index.html is the Korean studio page with a pinned Three.js", () => {
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<title>파사드 스튜디오<\/title>/);
  assert.match(html, /three@0\.160\.0\/build\/three\.module\.js/);
  assert.equal((html.match(/<canvas\b/g) ?? []).length, 1);
});

test("every local src/href in index.html points at a real file", () => {
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|mailto:)/.test(u));
  assert.ok(refs.includes("studio/studio.css") && refs.includes("studio/app.js"));
  for (const ref of refs) assert.ok(existsSync(new URL(ref, WEB)), `missing ${ref}`);
});

test("every #id that app.js looks up exists in index.html", () => {
  const wanted = new Set([...app.matchAll(/\$\(["'`]#([\w-]+)/g)].map((m) => m[1]).filter((id) => !id.endsWith("-")));
  wanted.add("finish-primary").add("finish-secondary"); // app.js builds these two from a template string
  for (const id of wanted) assert.match(html, new RegExp(`id="${id}"`), `index.html has no #${id}`);
});

test("the studio page does not link to the legacy gallery or its live-mode server field", () => {
  assert.doesNotMatch(html, /legacy-gallery|live|서버 설정/i);
});

test("the old gallery code is gone, and the sample images it produced are kept", () => {
  for (const f of ["legacy-gallery.html", "app.js", "queue.js", "render.js", "style.css", "../server/kaggle_server.py", "../tools/make_samples.py"]) {
    assert.ok(!existsSync(new URL(f, WEB)), `${f} should have been deleted`);
  }
  for (const id of ["modern", "villa_elev"]) {
    for (const f of ["sketch", "concrete", "brick", "glass", "wood"]) assert.ok(existsSync(new URL(`samples/${id}/${f}.jpg`, WEB)), `missing samples/${id}/${f}.jpg`);
  }
});

test("the canvas is exposed as an image with a text alternative", () => {
  assert.match(html, /<canvas[^>]*\brole="img"[^>]*\baria-label="[^"]+"/);
});

test("sliders get an explicit accessible name (the wrapping label would otherwise name the <output>, which is its first labelable child)", () => {
  const controls = readFileSync(new URL("studio/view/controls.js", WEB), "utf8");
  assert.match(controls, /input\.setAttribute\("aria-label", p\.label\)/);
  assert.match(controls, /out\.setAttribute\("aria-hidden", "true"\)/);
});

test("swatch buttons keep a visible keyboard focus ring: a .swatch:focus-visible rule exists and the base rules draw the resting ring with box-shadow, not outline", () => {
  const css = readFileSync(new URL("studio/studio.css", WEB), "utf8");
  assert.match(css, /\.swatch:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  const base = css.match(/\.swatch\s*\{[^}]*\}/)[0];
  const pressed = css.match(/\.swatch\[aria-pressed="true"\]\s*\{[^}]*\}/)[0];
  assert.doesNotMatch(base + pressed, /\boutline:\s*[^n;]/, "an outline on .swatch would override the shared :focus-visible ring");
});

test("the two swatch rows are named groups, so a screen reader can tell 주 마감재 from 보조 마감재", () => {
  const app = readFileSync(new URL("studio/app.js", WEB), "utf8");
  assert.match(app, /swatches\.setAttribute\("role", "group"\)/);
  assert.match(app, /swatches\.setAttribute\("aria-label", title\)/);
});

test("a blocked or failed module load shows a Korean notice instead of a blank page", () => {
  assert.match(html, /<script>[^<]*dataset\.ready[^<]*<\/script>/); // classic inline script: runs even if the module graph (three.js CDN) fails
  assert.match(html, /id="load-error"[^>]*hidden/);
  assert.match(app, /document\.documentElement\.dataset\.ready\s*=\s*"1"/);
});

test("the visible status chip is not a live region; a separate screen-reader-only region announces changes after a pause", () => {
  assert.doesNotMatch(html, /id="status"[^>]*role="status"/);
  assert.match(html, /id="announce"[^>]*role="status"/);
  assert.match(app, /clearTimeout\(announceTimer\)/);
});

test("forced-colors mode keeps the pressed state visible without relying on color alone", () => {
  const css = readFileSync(new URL("studio/studio.css", WEB), "utf8");
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /forced-colors[\s\S]*aria-pressed="true"[\s\S]*(outline|border)/);
});

test("the rule editor panel: toggle and panel exist, ids match what app.js looks up, and the new files never use innerHTML", () => {
  for (const id of ["edit-toggle", "editor", "editor-text", "editor-errors", "editor-status", "editor-reset", "editor-copy"]) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html has no #${id}`);
    assert.match(app, new RegExp(`#${id}`), `app.js never looks up #${id}`);
  }
  assert.match(html, /id="editor"[^>]*\bhidden\b/);
  assert.match(html, /id="edit-toggle"[^>]*aria-expanded="false"/);
  for (const f of ["studio/editor.js", "studio/view/editor-panel.js"]) {
    assert.doesNotMatch(readFileSync(new URL(f, WEB), "utf8"), /innerHTML|insertAdjacentHTML|outerHTML/, `${f} must not build HTML from text`);
  }
});

test("the header editor button has its own readable (dark glass) style, and an open panel narrows the 3D view instead of covering it", () => {
  const css = readFileSync(new URL("studio/studio.css", WEB), "utf8");
  assert.match(css, /\.bar-actions \.btn-ghost\s*\{[^}]*background:\s*var\(--card\)/);
  assert.match(css, /body\.editor-open #view\s*\{[^}]*width:\s*calc\(100vw - /);
  assert.match(readFileSync(new URL("studio/view/editor-panel.js", WEB), "utf8"), /onToggle/);
  assert.match(app, /onToggle:\s*\(\)\s*=>\s*schedule\(true\)/);
});
