import test from "node:test";
import assert from "node:assert/strict";
import { createBackend } from "../web/render.js";

const manifest = { renders: { modern: { brick: "samples/modern/brick.jpg" } } };

test("demo mode returns the pre-rendered image", async () => {
  const render = createBackend({ manifest, delayMs: 0 });
  assert.equal(await render({ sketchId: "modern", material: "brick" }), "samples/modern/brick.jpg");
});

test("demo mode rejects unknown combinations", async () => {
  const render = createBackend({ manifest, delayMs: 0 });
  await assert.rejects(render({ sketchId: "modern", material: "wood" }), /데모에 없는/);
});

test("live mode posts to /render and returns a blob url", async () => {
  let call;
  const fetchFn = async (url, opts) => {
    call = { url, body: opts.body };
    return { ok: true, blob: async () => new Blob(["img"]) };
  };
  const render = createBackend({ manifest, serverUrl: "https://x.example/", fetchFn });
  const out = await render({ sketchFile: new Blob(["s"]), material: "glass", extraText: "dusk" });
  assert.equal(call.url, "https://x.example/render");
  assert.equal(call.body.get("material"), "glass");
  assert.equal(call.body.get("extra"), "dusk");
  assert.ok(out.startsWith("blob:"));
});

test("live mode reports server errors and unreachable servers", async () => {
  const bad = createBackend({ manifest, serverUrl: "https://x", fetchFn: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(bad({ sketchFile: new Blob(["s"]), material: "glass" }), /서버 오류 500/);
  const down = createBackend({ manifest, serverUrl: "https://x", fetchFn: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(down({ sketchFile: new Blob(["s"]), material: "glass" }), /연결할 수 없습니다/);
});
