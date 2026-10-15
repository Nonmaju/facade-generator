// Pure state logic of the rule editor (no DOM): validates edited rule text, keeps the last valid def, persists per type.
// The panel (view/editor-panel.js) only shows `text`, `errors` and `status`; everything testable lives here.
import { validateType } from "./grammar/validate.js";

export const MAX_INPUT = 100 * 1024;
const MAX_ERRORS = 20;

export const storageKey = (typeId) => `facade-studio:rules:${typeId}`;

const attempt = (fn) => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

/**
 * @param builtinDef the shipped type file (never mutated)
 * @param storage    { getItem, setItem, removeItem } such as localStorage, or null/undefined for memory only
 */
export function createEditor(builtinDef, storage) {
  const key = storageKey(builtinDef.id);
  const prettyBuiltin = JSON.stringify(builtinDef, null, 2);
  const read = () => attempt(() => storage?.getItem(key)) ?? null;
  const write = (text) => attempt(() => storage?.setItem(key, text));
  const clear = () => attempt(() => storage?.removeItem(key));

  /** Check text: returns { def } when it is usable, else { errors }. */
  function check(text, tryGenerate) {
    if (typeof text !== "string" || text.length > MAX_INPUT) return { errors: [`입력이 너무 깁니다 (최대 ${MAX_INPUT / 1024}KB)`] };
    let def;
    try {
      def = JSON.parse(text);
    } catch (e) {
      return { errors: [`JSON 문법 오류: ${e.message}`] };
    }
    const errors = validateType(def);
    if (def && typeof def === "object") {
      if (def.id !== builtinDef.id) errors.push("id: 유형 id는 바꿀 수 없습니다");
      if (def.version !== builtinDef.version) errors.push("version: 버전은 바꿀 수 없습니다");
    }
    if (errors.length) return { errors };
    try {
      tryGenerate?.(def);
    } catch (e) {
      return { errors: [`생성 오류: ${e.message}`] };
    }
    return { def };
  }

  const capped = (errors) =>
    errors.length > MAX_ERRORS ? [...errors.slice(0, MAX_ERRORS), `그 외 ${errors.length - MAX_ERRORS}개`] : errors;

  const editor = {
    text: prettyBuiltin,
    activeDef: structuredClone(builtinDef),
    errors: [],
    status: "원래 규칙",

    /** Called as the user types (the panel debounces). On errors the previous valid def stays active. */
    edit(text, tryGenerate) {
      editor.text = text;
      const r = check(text, tryGenerate);
      if (!r.def) {
        editor.errors = capped(r.errors);
        editor.status = "오류";
        return editor;
      }
      editor.errors = [];
      editor.activeDef = r.def;
      if (JSON.stringify(r.def, null, 2) === prettyBuiltin) {
        editor.status = "원래 규칙";
        clear();
      } else {
        editor.status = "적용됨";
        write(text);
      }
      return editor;
    },

    /** Back to the built-in rules; forgets the saved edit. */
    reset() {
      editor.text = prettyBuiltin;
      editor.activeDef = structuredClone(builtinDef);
      editor.errors = [];
      editor.status = "원래 규칙";
      clear();
      return editor;
    },

    /** Load a saved edit at startup. A saved value that no longer validates is dropped; this never throws. */
    restore(tryGenerate) {
      const saved = read();
      if (saved === null) return editor;
      const r = check(saved, tryGenerate);
      if (!r.def) {
        clear();
        return editor.reset();
      }
      return editor.edit(saved, tryGenerate);
    },
  };
  return editor;
}
