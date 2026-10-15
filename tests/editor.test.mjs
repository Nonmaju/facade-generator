import test from "node:test";
import assert from "node:assert/strict";
import { createEditor, storageKey } from "../web/studio/editor.js";
import { generate } from "../web/studio/grammar/engine.js";
import { loadType } from "./grammar/helpers.mjs";

const grid = loadType("grid");
const tryGen = (def) => generate(def, {});
const memory = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const edited = (mutate) => {
  const d = structuredClone(grid);
  mutate(d);
  return JSON.stringify(d, null, 2);
};

test("a new editor shows the built-in rules as pretty JSON and reports the original state", () => {
  const ed = createEditor(grid, memory());
  assert.equal(ed.text, JSON.stringify(grid, null, 2));
  assert.deepEqual(ed.activeDef, grid);
  assert.equal(ed.status, "원래 규칙");
  assert.deepEqual(ed.errors, []);
});

test("round trip: the built-in text edited back in is unchanged and stores nothing", () => {
  const store = memory();
  const ed = createEditor(grid, store);
  ed.edit(ed.text, tryGen);
  assert.deepEqual(ed.activeDef, grid);
  assert.equal(ed.status, "원래 규칙");
  assert.equal(store.m.size, 0);
});

test("a valid edit becomes the active def, is saved, and comes back after a restore", () => {
  const store = memory();
  const text = edited((d) => (d.rules.Floor[1].size = 4.2));
  const ed = createEditor(grid, store);
  ed.edit(text, tryGen);
  assert.equal(ed.status, "적용됨");
  assert.deepEqual(ed.errors, []);
  assert.equal(ed.activeDef.rules.Floor[1].size, 4.2);
  assert.equal(store.getItem(storageKey("grid")), text);

  const again = createEditor(grid, store);
  again.restore(tryGen);
  assert.equal(again.activeDef.rules.Floor[1].size, 4.2);
  assert.equal(again.text, text);
  assert.equal(again.status, "적용됨");
});

test("a syntax error keeps the previous valid def and says so", () => {
  const ed = createEditor(grid, memory());
  ed.edit(edited((d) => (d.rules.Floor[1].size = 4.2)), tryGen);
  const before = ed.activeDef;
  ed.edit('{ "version": 1, ', tryGen);
  assert.equal(ed.status, "오류");
  assert.match(ed.errors[0], /JSON 문법 오류/);
  assert.equal(ed.activeDef, before);
});

test("validation errors keep the previous def and list path: message lines", () => {
  const ed = createEditor(grid, memory());
  ed.edit(edited((d) => (d.rules.Floor[1].map.A = "Ghost")), tryGen);
  assert.equal(ed.status, "오류");
  assert.ok(ed.errors.some((m) => /rules\.Floor\[1\]\.map\.A/.test(m) && /Ghost/.test(m)), ed.errors.join("|"));
  assert.deepEqual(ed.activeDef, grid);
});

test("an engine error (limits) keeps the previous def and shows the message", () => {
  const ed = createEditor(grid, memory());
  ed.edit(edited((d) => (d.rules.Facade = [{ op: "split", axis: "x", parts: [{ size: 1, sym: "Facade" }, { size: "~", sym: "Facade" }] }])), tryGen);
  assert.equal(ed.status, "오류");
  assert.ok(ed.errors.some((m) => /생성 오류/.test(m) && /depth limit/.test(m)), ed.errors.join("|"));
  assert.deepEqual(ed.activeDef, grid);
});

test("changing id or version is rejected", () => {
  const ed = createEditor(grid, memory());
  ed.edit(edited((d) => (d.id = "other")), tryGen);
  assert.ok(ed.errors.some((m) => /^id:/.test(m)));
  ed.edit(edited((d) => (d.version = 2)), tryGen);
  assert.ok(ed.errors.length > 0);
  assert.deepEqual(ed.activeDef, grid);
});

test("input over 100 KB is rejected before parsing", () => {
  const ed = createEditor(grid, memory());
  ed.edit(" ".repeat(100 * 1024 + 1), tryGen);
  assert.equal(ed.status, "오류");
  assert.match(ed.errors[0], /너무 깁니다/);
});

test("long error lists are capped at 20 lines plus a summary", () => {
  const ed = createEditor(grid, memory());
  ed.edit(edited((d) => { d.params = d.params.map((p) => ({ ...p, key: "bad key" })); }), tryGen);
  assert.ok(ed.errors.length <= 21);
  const many = edited((d) => { for (let i = 0; i < 40; i++) d.rules[`S${i}`] = [{ op: "bogus" }]; });
  ed.edit(many, tryGen);
  assert.equal(ed.errors.length, 21);
  assert.match(ed.errors[20], /그 외 \d+개/);
});

test("reset restores the built-in rules and clears the saved edit", () => {
  const store = memory();
  const ed = createEditor(grid, store);
  ed.edit(edited((d) => (d.rules.Floor[1].size = 4.2)), tryGen);
  ed.reset();
  assert.equal(ed.text, JSON.stringify(grid, null, 2));
  assert.deepEqual(ed.activeDef, grid);
  assert.equal(ed.status, "원래 규칙");
  assert.deepEqual(ed.errors, []);
  assert.equal(store.m.size, 0);
});

test("corrupt or invalid saved text is discarded on restore without throwing", () => {
  for (const saved of ["{not json", JSON.stringify({ ...grid, id: "other" }), "", "null", "[]"]) {
    const store = memory();
    store.setItem(storageKey("grid"), saved);
    const ed = createEditor(grid, store);
    assert.doesNotThrow(() => ed.restore(tryGen), saved);
    assert.deepEqual(ed.activeDef, grid);
    assert.equal(ed.status, "원래 규칙");
    assert.equal(store.m.size, 0, "the bad saved value should be removed");
  }
});

test("storage that throws, or no storage at all, still lets the editor work in memory", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } };
  for (const storage of [broken, null, undefined]) {
    const ed = createEditor(grid, storage);
    assert.doesNotThrow(() => ed.restore(tryGen));
    ed.edit(edited((d) => (d.rules.Floor[1].size = 4.2)), tryGen);
    assert.equal(ed.activeDef.rules.Floor[1].size, 4.2);
    assert.doesNotThrow(() => ed.reset());
    assert.deepEqual(ed.activeDef, grid);
  }
});

test("every shipped type survives the editor round trip with its own storage key", () => {
  for (const id of ["grid", "curtainwall", "louver"]) {
    const def = loadType(id);
    const ed = createEditor(def, memory());
    ed.edit(ed.text, tryGen);
    assert.deepEqual(ed.activeDef, def, id);
    assert.equal(storageKey(id), `facade-studio:rules:${id}`);
  }
});
