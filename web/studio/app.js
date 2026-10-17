// Studio page glue: types, presets, controls, finishes, random and PNG save around the grammar and the 3D scene.
import { generate } from "./grammar/engine.js";
import { assertValid } from "./grammar/validate.js";
import { buildControls, el } from "./view/controls.js";
import { createScene } from "./view/scene.js";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "./view/catalog.js";
import { loadPreset, randomize, reconcileValues } from "./state.js";
import { createEditor } from "./editor.js";
import { createEditorPanel } from "./view/editor-panel.js";

const $ = (selector) => document.querySelector(selector);
let announceTimer;
// The chip changes on every frame while a slider is dragged; tell screen readers only once the changes pause.
const announce = (text) => {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => ($("#announce").textContent = text), 700);
};
const setStatus = (text) => {
  $("#status").textContent = text;
  announce(text);
};
const storage = (() => {
  try {
    return window.localStorage; // reading the property itself can throw (blocked cookies, private modes)
  } catch {
    return null;
  }
})();
const FINISH_SLOTS = [
  ["primary", "주 마감재"],
  ["secondary", "보조 마감재"],
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return res.json();
}

async function main() {
  document.documentElement.dataset.ready = "1"; // tells index.html the modules loaded, so it skips the load-error notice
  const scene = createScene($("#view"));
  if (!scene) {
    $("#fallback").hidden = false;
    return;
  }

  let types;
  try {
    const ids = await getJson("studio/types/index.json");
    types = await Promise.all(ids.map(async (id) => assertValid(await getJson(`studio/types/${id}.json`))));
  } catch (e) {
    setStatus(`파사드 유형을 불러오지 못했습니다: ${e.message}`);
    return;
  }

  // One editor per built-in type: it holds that type's edited rules (restored from storage) and the last valid def.
  const editors = new Map(types.map((t) => [t.id, createEditor(t, storage)]));
  for (const ed of editors.values()) ed.restore((d) => generate(d, {}));
  let current = types[0]; // the selected built-in type
  let def; // its active (possibly edited) definition
  let values;
  let panel; // the rule-editor panel, created below
  let activePreset = 0; // -1 once a control has been touched
  let queued = false;
  let refit = false;

  function regenerate() {
    try {
      const r = generate(def, values);
      scene.setTerminals(r.terminals);
      if (refit) scene.fit(r.width, r.height);
      refit = false;
      setStatus(`${r.terminals.length}개 부재 · ${r.width.toFixed(1)}m × ${r.height.toFixed(1)}m`);
    } catch (e) {
      setStatus(`생성 오류: ${e.message}`);
    }
  }
  function schedule(fit = false) {
    refit ||= fit;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      regenerate();
    });
  }

  function pressed(button, on) {
    button.setAttribute("aria-pressed", String(on));
  }
  function renderTypes() {
    $("#types").replaceChildren(
      ...types.map((t) => {
        const b = el("button", "seg-btn", t.label);
        b.type = "button";
        pressed(b, t === current);
        b.addEventListener("click", () => selectType(t));
        return b;
      })
    );
  }
  function renderPresets() {
    $("#presets").replaceChildren(
      ...def.presets.map((pr, i) => {
        const b = el("button", "chip-btn", pr.label);
        b.type = "button";
        pressed(b, i === activePreset);
        b.addEventListener("click", () => selectPreset(i));
        return b;
      })
    );
  }
  function showValues(next, fit) {
    values = next;
    buildControls($("#controls"), def, values, () => {
      if (activePreset !== -1) {
        activePreset = -1;
        renderPresets();
      }
      schedule();
    });
    schedule(fit);
  }
  function selectType(t) {
    current = t;
    def = editors.get(t.id).activeDef;
    activePreset = 0;
    renderTypes();
    renderPresets();
    showValues(loadPreset(def, def.presets[0]), true);
    panel?.show(editors.get(t.id), true);
  }
  function selectPreset(i) {
    activePreset = i;
    renderPresets();
    showValues(loadPreset(def, def.presets[i]), true);
  }

  for (const [slot, title] of FINISH_SLOTS) {
    const box = $(`#finish-${slot}`);
    const name = el("span", "finish-name");
    const swatches = el("div", "swatches");
    swatches.setAttribute("role", "group");
    swatches.setAttribute("aria-label", title);
    const buttons = MATERIAL_CATALOG.map((m) => {
      const b = el("button", "swatch");
      b.type = "button";
      b.setAttribute("aria-label", m.label);
      const img = el("img");
      Object.assign(img, { src: `textures/${m.id}/thumb.jpg`, alt: "" });
      b.append(img);
      b.addEventListener("click", () => choose(m));
      return [m, b];
    });
    const choose = (m) => {
      scene.setMaterial(slot, m.id);
      name.textContent = m.label;
      buttons.forEach(([other, b]) => pressed(b, other === m));
    };
    swatches.append(...buttons.map(([, b]) => b));
    const head = el("div", "finish-head");
    head.append(el("span", "finish-title", title), name);
    box.replaceChildren(head, swatches);
    choose(MATERIAL_CATALOG.find((m) => m.id === DEFAULT_FINISH[slot]));
  }

  // Rule editor: edits go through the pure editor; a valid result replaces the active def and the controls follow its schema.
  function applyEdited(replaceText) {
    const ed = editors.get(current.id);
    panel.show(ed, replaceText);
    if (ed.status === "오류" || ed.activeDef === def) return;
    const schemaChanged = JSON.stringify(ed.activeDef.params) !== JSON.stringify(def.params);
    const presetsChanged = JSON.stringify(ed.activeDef.presets) !== JSON.stringify(def.presets);
    def = ed.activeDef;
    if (presetsChanged) {
      if (activePreset >= def.presets.length) activePreset = -1;
      renderPresets();
    }
    if (schemaChanged) showValues(reconcileValues(def, values), false);
    else schedule(); // same schema: keep the controls (and the user's focus), only regenerate
  }
  panel = createEditorPanel({
    toggle: $("#edit-toggle"), panel: $("#editor"), textarea: $("#editor-text"), list: $("#editor-errors"),
    status: $("#editor-status"), resetBtn: $("#editor-reset"), copyBtn: $("#editor-copy"), announce,
    onToggle: () => schedule(true), // the 3D view changes width: re-frame the facade
    onInput: (text) => {
      editors.get(current.id).edit(text, (d) => generate(d, values));
      applyEdited(false);
    },
    onReset: () => {
      editors.get(current.id).reset();
      applyEdited(true);
    },
  });

  // Fold / unfold the parameter and finishes cards: a folded card shows only its title row.
  for (const name of ["params", "finishes"]) {
    const toggle = $(`#${name}-toggle`);
    const body = $(`#${name}-body`);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
    });
  }

  $("#random").addEventListener("click", () => {
    activePreset = -1;
    renderPresets();
    showValues(randomize(def, values), false);
  });

  $("#shot").addEventListener("click", async () => {
    const blob = await scene.screenshot();
    if (!blob) {
      setStatus("이미지를 저장하지 못했습니다.");
      return;
    }
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `facade-${def.id}.png` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  selectType(types[0]);
}

main();
