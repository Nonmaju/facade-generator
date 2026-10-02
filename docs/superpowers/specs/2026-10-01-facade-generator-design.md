# Facade Generator — Design (rev 2, 2026-10-02)

Sketch + materials + free text -> gallery of photoreal facade renders, one per material.

## Revision note
Rev 1 assumed a static web app calling Gemini directly (BYOK). Spike results changed that:
- Gemini free tier has **no image-generation quota** (429, limit 0). Paid only.
- SDXL + ControlNet (Canny) on a free Kaggle/Colab GPU **preserves form well** and costs 0 in development.
  Spike v2 with `CONTROL_SCALE=0.55` gave clearly distinguishable materials on modern/villa sketches.
  Known issues: glow on glass, volumes added beside the building, pencil-texture noise on rough sketches (Canny).
So: frontend + separate image server. BYOK is dropped; the deploy model is decided after the UI works.

## Decisions
- **Frontend:** static web page (no framework needed unless the UI outgrows it).
- **Image server:** `POST /render` with `{sketch, material, extraText}` -> image. This contract is the only coupling; the server can be swapped.
- **Server by stage:** mock (canned images) -> Kaggle notebook + tunnel (free, unverified) -> hosted GPU (fal.ai / Replicate, ~$0.04-0.08 per image) for deploy.
- **Deploy model (undecided):** limited free trial / user-key proxy / portfolio demo only. Decide after the UI is done.
- **Gallery scope:** v1 = 1 sketch x N materials. Later = M sketches x N materials matrix by looping the same call.
- **Input:** sketch upload + material checkboxes (exposed concrete, red brick, glass curtain wall, wood louver) + one free-text box applied to all.
- **Output:** gallery cards, lightbox, per-image download, ZIP of all. No variants, no history yet.

## Build order
1. **Mock server + UI** (no GPU needed): finish the whole UI against canned images.
2. **Quality work in the notebook, in parallel:** per-material prompts, stronger negative prompt (glow, extra side volumes), Lineart/Scribble ControlNet for pencil sketches. Record final settings (`CONTROL_SCALE` etc.) here.
3. **Real server:** run the notebook as an API behind a tunnel, point the UI at it. Verify the tunnel + CORS works at all (not yet verified).
4. **Deploy decision.**

## Components (frontend)
1. Server URL setting (mock by default)
2. Input panel (sketch, material checkboxes, free text)
3. Gallery (card per material: loading / done / failed+retry)
4. Lightbox + download / ZIP

## Flow
Generate -> one request per material, **sequential or 1-2 concurrent** (a free GPU renders ~1 image/min) -> cards fill as results arrive.

## Errors
Per card: server unreachable / session expired, timeout, bad output -> reason + retry. One failure never stops the rest. Free GPU sessions drop often, so "server unreachable" is a first-class state.

## Testing
Mock server doubles as the test fixture. Spike sketches in `spike/` are the regression set; compare renders by eye against the spike contact sheets.
