# Facade Generator — Design

Sketch + materials + free text -> gallery of photoreal facade renders, one per material.

## Decisions
- **Approach:** static web app, browser calls Gemini image model directly (BYOK). No backend.
- **Keys:** dev = own Gemini key pasted in the UI; deploy = users paste theirs. Stored in `localStorage` only, never sent to any server of ours.
- **Gallery scope (C):** v1 = 1 sketch x N materials. Later = M sketches x N materials matrix by looping the same `render()`.
- **Input (A):** sketch upload + material preset checkboxes (exposed concrete, red brick, glass curtain wall, wood louver) + one free-text box applied to all.
- **Output (A):** gallery cards, lightbox, per-image download, ZIP of all. No variants, no history (next-step candidates).

## Components
1. Key input (`localStorage`)
2. Input panel (sketch, material checkboxes, free text)
3. Gallery (card per material: loading / done / failed+retry)
4. Lightbox + download

## Flow
Generate -> one request per material (2-3 concurrent) -> fill cards as they finish.
Core function: `render(sketch, material, extraText) -> image`.
Prompt shape: keep the sketch's form, proportions and line placement exactly; render as photorealistic architectural exterior finished in {material}; {extraText}.

## Errors
Per card: bad key, quota (429), safety block -> reason + retry. One failure never stops the rest.

## Risk and first step
Biggest risk: form preservation. **Spike first** (`spike/`): call the image model with real sketches, judge shape fidelity, tune the prompt. If fidelity is poor, revisit the approach before building UI.
Model ID to be confirmed against official docs at implementation time.

## Testing
Spike samples + one small check on the prompt builder.
