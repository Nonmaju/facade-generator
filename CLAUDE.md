# facade-generator -> parametric facade studio (pivot)

## Handoff
- Existing (done, public repo, not deployed): the SDXL+ControlNet gallery and Kaggle server were deleted on 2026-10-14 (recover from commit 9c15fb3); only the images (web/samples) and spike/ remain. See README.md and the old design docs under docs/superpowers/.
- New direction (user decision): turn this repo into a **parametric facade studio** (brainstorm item 2): procedural facade from parameters (floors, window ratio, rhythm) via a shape grammar, real-time PBR material swapping in Three.js. No gallery tab (user decision 2026-10-13): the old SDXL results appear as a few images in the README, which tells the "GPU constraint -> CPU/browser pivot" story. Optional: sketch input via OpenCV.js line detection snapped to a grid.
- Brainstorm caveats (Opus inference, unmeasured): difficulty ~3/5, 3-5 weeks; output is Three.js quality, not photoreal; do not try diffusion in the browser.

## Working rules (set by the user)
- Main work on **Sonnet 5.5**; for judgment calls consult **Opus 5.5** (Agent tool, model "opus", give full context, it starts cold).
- Use `superpowers:brainstorming` first: one question at a time, 2-3 approaches, approval, spec in docs/superpowers/specs/, then writing-plans. No code before design approval.
- Verify before claiming; say plainly what was not run.

## Hard constraints
- Cost 0, no GPU, static site, everything in the browser. Target: GitHub Pages (repo is already public).
- **Deploying / enabling Pages / any publish needs the user's explicit OK first.** `.env` is gitignored: never commit it or print its contents.
- Textures only CC0 / clearly licensed (e.g. ambientCG), 1K size, credit them in README.
- Include a sample/preset button so a visitor can try it in 30 seconds.
- UI text in Korean. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
