// Builds one control per param from the type's schema. Plain, unstyled DOM (class names only):
// the visual design comes later from the approved mockup. textContent only, never innerHTML.
export function buildControls(container, typeDef, values, onChange) {
  container.replaceChildren();
  for (const d of typeDef.params) {
    const row = document.createElement("label");
    row.className = "param";
    const name = document.createElement("span");
    name.className = "param-name";
    name.textContent = d.label;
    const shown = document.createElement("output");
    shown.className = "param-value";
    let input;
    let read;

    if (d.type === "enum") {
      input = document.createElement("select");
      for (const o of d.options) input.append(new Option(o.label, o.value));
      input.value = values[d.key];
      read = () => input.value;
    } else if (d.type === "bool") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = values[d.key];
      read = () => input.checked;
    } else {
      input = document.createElement("input");
      input.type = "range";
      input.min = d.min;
      input.max = d.max;
      input.step = d.step;
      input.value = values[d.key];
      read = () => Number(input.value);
    }
    input.dataset.key = d.key;
    const show = () => (shown.textContent = d.type === "enum" || d.type === "bool" ? "" : String(read()));
    show();
    input.addEventListener("input", () => {
      values[d.key] = read();
      show();
      onChange(d.key);
    });
    row.append(name, input, shown);
    container.append(row);
  }
}
