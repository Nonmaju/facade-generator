// Throwaway glue for studio-debug.html. The real app glue is written in Part 2 after the UI mockup is approved.
import { generate } from "./grammar/engine.js";
import { assertValid } from "./grammar/validate.js";
import { buildControls } from "./view/controls.js";
import { createScene } from "./view/scene.js";
import { MATERIAL_CATALOG, DEFAULT_FINISH } from "./view/catalog.js";

const $ = (s) => document.querySelector(s);
const status = $("#status");
const fail = (msg) => {
  status.textContent = msg;
};

const scene = createScene($("#view"));
if (!scene) {
  fail("이 브라우저에서는 WebGL을 사용할 수 없습니다.");
  throw new Error("WebGL unavailable");
}

let types;
try {
  const ids = await (await fetch("studio/types/index.json")).json();
  types = await Promise.all(ids.map(async (id) => assertValid(await (await fetch(`studio/types/${id}.json`)).json())));
} catch (e) {
  fail(`파사드 유형을 불러오지 못했습니다: ${e.message}`);
  throw e;
}

let def;
let values;
let queued = false;
let refit = false;

function regenerate() {
  try {
    const r = generate(def, values);
    scene.setTerminals(r.terminals);
    if (refit) scene.fit(r.width, r.height);
    refit = false;
    status.textContent = `${r.terminals.length}개 부재 · ${r.width.toFixed(1)}m × ${r.height.toFixed(1)}m`;
  } catch (e) {
    fail(`생성 오류: ${e.message}`);
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

function showControls() {
  buildControls($("#controls"), def, values, () => schedule());
}
function loadValues(preset) {
  values = { ...Object.fromEntries(def.params.map((p) => [p.key, p.default])), ...(preset?.values ?? {}) };
  showControls();
  schedule(true);
}
function selectType(i) {
  def = types[i];
  $("#presets").replaceChildren(
    ...def.presets.map((pr) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = pr.label;
      b.addEventListener("click", () => loadValues(pr));
      return b;
    })
  );
  loadValues(def.presets[0]);
}

$("#type").replaceChildren(...types.map((t, i) => new Option(t.label, i)));
$("#type").addEventListener("change", (e) => selectType(Number(e.target.value)));
$("#random").addEventListener("click", () => {
  values.seed = Math.floor(Math.random() * 10000);
  showControls();
  schedule();
});

for (const slot of ["primary", "secondary"]) {
  const sel = $(`#mat-${slot}`);
  sel.replaceChildren(...MATERIAL_CATALOG.map((m) => new Option(m.label, m.id)));
  sel.value = DEFAULT_FINISH[slot];
  sel.addEventListener("change", () => scene.setMaterial(slot, sel.value));
}

$("#shot").addEventListener("click", async () => {
  const blob = await scene.screenshot();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `facade-${def.id}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
});

selectType(0);
