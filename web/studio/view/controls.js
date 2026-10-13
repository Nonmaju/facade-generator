// Builds one control per param from the type's schema: sliders for int/float, segmented buttons for enums,
// a checkbox for bools. Class names only (studio.css styles them); text goes in with textContent, never innerHTML.
import { isVisible } from "../state.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const decimals = (step) => (String(step).split(".")[1] ?? "").length;

function slider(p, values, onChange) {
  const row = el("label", "param");
  const head = el("span", "param-head");
  const out = el("output", "param-value");
  out.setAttribute("aria-hidden", "true"); // the slider announces its own value
  const show = (v) => (out.textContent = Number(v).toFixed(decimals(p.step)));
  head.append(el("span", "param-name", p.label), out);
  const input = el("input");
  Object.assign(input, { type: "range", min: p.min, max: p.max, step: p.step, value: values[p.key] });
  input.setAttribute("aria-label", p.label); // the wrapping <label> names the <output> (its first labelable child), not the slider
  show(input.value);
  input.addEventListener("input", () => {
    show(input.value);
    onChange(Number(input.value));
  });
  row.append(head, input);
  return row;
}

function segmented(p, values, onChange) {
  const row = el("div", "param");
  row.append(el("span", "param-name", p.label));
  const group = el("div", "seg");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", p.label);
  const buttons = p.options.map((o) => {
    const b = el("button", "seg-btn", o.label);
    b.type = "button";
    b.addEventListener("click", () => {
      onChange(o.value);
      sync();
    });
    b.dataset.value = o.value;
    return b;
  });
  const sync = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === values[p.key])));
  sync();
  group.append(...buttons);
  row.append(group);
  return row;
}

function toggle(p, values, onChange) {
  const row = el("label", "param param-bool");
  row.append(el("span", "param-name", p.label));
  const input = el("input");
  Object.assign(input, { type: "checkbox", checked: values[p.key] });
  input.addEventListener("input", () => onChange(input.checked));
  row.append(input);
  return row;
}

/** Fills `container` with the controls of `def`. `values` is edited in place; `onChange(key)` runs after each edit. */
export function buildControls(container, def, values, onChange) {
  container.replaceChildren();
  const rows = [];
  const refresh = () => rows.forEach(([p, row]) => (row.hidden = !isVisible(p, values)));
  for (const p of def.params) {
    const set = (v) => {
      values[p.key] = v;
      refresh();
      onChange(p.key);
    };
    const row = p.type === "enum" ? segmented(p, values, set) : p.type === "bool" ? toggle(p, values, set) : slider(p, values, set);
    row.dataset.key = p.key;
    rows.push([p, row]);
    container.append(row);
  }
  refresh();
}
