// DOM for the rule-editor panel. All state logic lives in ../editor.js; this file only shows text and forwards input.
// Error text and rule names are user-controlled: they are always set as plain text (textContent).
import { el } from "./controls.js";

const DEBOUNCE_MS = 200;

export function createEditorPanel({ toggle, panel, textarea, list, status, resetBtn, copyBtn, onInput, onReset, onToggle, announce }) {
  let timer;
  let flashTimer;
  const open = (on) => {
    panel.hidden = !on;
    toggle.setAttribute("aria-expanded", String(on));
    document.body.classList.toggle("editor-open", on);
    onToggle?.(on);
  };
  const flash = (text) => {
    const before = status.textContent;
    status.textContent = text;
    announce(text);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (status.textContent = before), 2500);
  };

  toggle.addEventListener("click", () => {
    open(panel.hidden);
    if (!panel.hidden) textarea.focus();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      open(false);
      toggle.focus();
    }
  });
  textarea.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => onInput(textarea.value), DEBOUNCE_MS);
  });
  resetBtn.addEventListener("click", () => {
    clearTimeout(timer);
    onReset();
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      flash("복사했습니다");
    } catch {
      textarea.focus();
      textarea.select();
      flash("복사하지 못했습니다. 선택된 텍스트를 Ctrl+C로 복사하세요");
    }
  });

  return {
    /** Show an editor's state. `replaceText` is true when the textarea must be overwritten (type switch, reset), not while typing. */
    show(ed, replaceText) {
      if (replaceText) textarea.value = ed.text;
      status.textContent = ed.status;
      status.dataset.state = ed.status;
      list.replaceChildren(...ed.errors.map((m) => el("li", "editor-error", m)));
      list.hidden = ed.errors.length === 0;
      textarea.setAttribute("aria-invalid", String(ed.errors.length > 0));
      announce(ed.errors.length ? `규칙 오류 ${ed.errors.length}개: ${ed.errors[0]}` : ed.status);
    },
  };
}
