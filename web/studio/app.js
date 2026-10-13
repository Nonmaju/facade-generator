// Studio page glue: types, presets, controls, finishes, random and PNG save around the grammar and the 3D scene.
import { generate } from "./grammar/engine.js";
import { assertValid } from "./grammar/validate.js";
import { buildControls, el } from "./view/controls.js";
import { createScene } from "./view/scene.js";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "./view/catalog.js";
import { loadPreset, randomize } from "./state.js";

const $ = (selector) => document.querySelector(selector);
const setStatus = (text) => ($("#status").textContent = text);
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

  let def;
  let values;
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
        pressed(b, t === def);
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
    def = t;
    activePreset = 0;
    renderTypes();
    renderPresets();
    showValues(loadPreset(def, def.presets[0]), true);
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
