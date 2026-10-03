# facade-generator

Upload an architectural sketch, pick materials, get a gallery of facade renders to compare.

**Status:** working demo mode, run locally (see below). Not deployed. Live mode is unverified.

## How it works
- **Demo mode (public site):** pick a sample sketch + materials and the page shows renders generated offline with SDXL + ControlNet (Canny, `CONTROL_SCALE=0.55`). It needs no server and costs nothing to host.
- **Live mode:** enter a server URL in the page to render your own uploaded sketch. The server must implement `POST /render` (multipart `sketch`, `material`, `extra` -> image). `server/kaggle_server.py` does this on a free Kaggle GPU behind a cloudflared tunnel. **Not yet verified on Kaggle** (syntax-checked only).

## Run / test
- Local: `python -m http.server 8000 -d web`, then open http://localhost:8000
- Tests: `npm test` (Node >= 18)
- Refresh demo images: `python tools/make_samples.py <renders_dir>`

## Credits
`villa_elev` is a crop of Rijksmuseum RP-T-1966-65-1 (CC0); `modern` is drawn by the author.

Design: [docs/superpowers/specs/2026-10-01-facade-generator-design.md](docs/superpowers/specs/2026-10-01-facade-generator-design.md)
Plan: [docs/superpowers/plans/2026-10-02-demo-ui.md](docs/superpowers/plans/2026-10-02-demo-ui.md) (Task 6, the demo video, is skipped for now)
