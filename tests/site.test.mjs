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

test("the old gallery page is kept as legacy-gallery.html, outside the studio page", () => {
  assert.ok(existsSync(new URL("legacy-gallery.html", WEB)));
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
