import { createBackend } from "./render.js";
import { runJobs } from "./queue.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const manifest = await (await fetch("samples/manifest.json")).json();
const state = { sketchId: "", items: [], file: null };

const serverEl = $("#server");
try { serverEl.value = localStorage.getItem("serverUrl") ?? ""; } catch {}
const isLive = () => serverEl.value.trim() !== "";
function refreshMode() {
  $("#upload").disabled = !isLive();
  $("#mode").textContent = isLive()
    ? "라이브 모드: 서버에서 생성합니다 (장당 약 1분)."
    : "데모 모드: 미리 생성된 결과를 보여줍니다. 추가 설명은 적용되지 않아요.";
  try { localStorage.setItem("serverUrl", serverEl.value.trim()); } catch {}
}
serverEl.addEventListener("input", refreshMode);
$("#upload").addEventListener("change", (e) => { state.file = e.target.files[0] ?? null; });
refreshMode();

$("#sketches").innerHTML = manifest.sketches.map((s, i) =>
  `<label class="thumb"><input type="radio" name="sketch" value="${s.id}" ${i === 0 ? "checked" : ""}>` +
  `<img src="${s.src}" alt="${s.label}"><span>${s.label}</span></label>`).join("");
$("#materials").innerHTML = manifest.materials.map((m) =>
  `<label><input type="checkbox" value="${m.id}" checked> ${m.label}</label>`).join("");

const ext = (it) => (it.result.startsWith("blob:") ? ".png" : ".jpg");

function cardHtml(it, i) {
  const body = it.status === "done"
    ? `<img src="${it.result}" alt="${it.label}" data-act="open">`
    : it.status === "failed"
      ? `<div class="msg">${esc(it.error)}<button data-act="retry">다시 시도</button></div>`
      : `<div class="msg"><span class="spin"></span>생성 중…</div>`;
  return `<figure class="card" data-i="${i}">${body}<figcaption>${it.label}</figcaption></figure>`;
}
function renderGallery() {
  $("#gallery").innerHTML = state.items.map(cardHtml).join("");
  $("#zip").hidden = !state.items.some((i) => i.status === "done");
}

async function start(idxs) {
  const live = isLive();
  const sketch = manifest.sketches.find((s) => s.id === state.sketchId);
  const file = live ? (state.file ?? await (await fetch(sketch.src)).blob()) : null;
  const backend = createBackend({ manifest, serverUrl: serverEl.value.trim() });
  const work = (it) => backend({ sketchId: state.sketchId, sketchFile: file, material: it.material, extraText: $("#extra").value });
  await runJobs(idxs.map((i) => state.items[i]), work, {
    concurrency: live ? 1 : 4,
    onUpdate: (j, patch) => { Object.assign(state.items[idxs[j]], patch); renderGallery(); },
  });
}

$("#go").addEventListener("click", async () => {
  const picked = [...document.querySelectorAll("#materials input:checked")].map((i) => i.value);
  if (!picked.length) return;
  state.sketchId = document.querySelector("input[name=sketch]:checked").value;
  state.items = picked.map((id) => ({ material: id, label: manifest.materials.find((m) => m.id === id).label, status: "loading" }));
  renderGallery();
  $("#go").disabled = true;
  try { await start(picked.map((_, i) => i)); } finally { $("#go").disabled = false; }
});

$("#gallery").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  const act = e.target.dataset.act;
  if (!card || !act) return;
  const i = +card.dataset.i, it = state.items[i];
  if (act === "retry") start([i]);
  if (act === "open") {
    $("#lightbox img").src = it.result;
    Object.assign($("#dl"), { href: it.result, download: `${state.sketchId}__${it.material}${ext(it)}` });
    $("#lightbox").showModal();
  }
});

$("#zip").addEventListener("click", async () => {
  const zip = new JSZip();
  for (const it of state.items.filter((i) => i.status === "done"))
    zip.file(`${state.sketchId}__${it.material}${ext(it)}`, await (await fetch(it.result)).blob());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  a.download = "facade-renders.zip";
  a.click();
});
