"""Spike: does a Gemini image model preserve sketch form? Throwaway, stdlib only.

usage: python spike/spike.py <sketch.png> [--model gemini-3.1-flash-image] [--extra "dusk, forest"]
key:   GEMINI_API_KEY env var, or a line GEMINI_API_KEY=... in .env
out:   spike/out/<sketch>__<material>.png
"""
import argparse, base64, json, mimetypes, os, pathlib, sys, urllib.error, urllib.request

MATERIALS = {
    "concrete": "exposed concrete (modern industrial finish)",
    "brick": "red brick facade (warm classic look)",
    "glass": "full-height glass curtain wall (maximum openness)",
    "wood": "timber louvers and wood cladding (natural, eco-friendly texture)",
}
PROMPT = (
    "Convert this architectural sketch into a photorealistic exterior render. "
    "Keep the sketch's form EXACTLY: same silhouette, proportions, floor heights, openings and line placement. "
    "Do not add, remove or move any volume. Finish the facade in {material}. {extra}"
)

def key():
    k = os.environ.get("GEMINI_API_KEY")
    if not k and pathlib.Path(".env").exists():
        for line in pathlib.Path(".env").read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                k = line.split("=", 1)[1].strip()
    return k or sys.exit("set GEMINI_API_KEY (env var or .env)")

def render(sketch, material, extra, model, api_key):
    mime = mimetypes.guess_type(sketch)[0] or "image/png"
    body = {"contents": [{"parts": [
        {"text": PROMPT.format(material=material, extra=extra)},
        {"inline_data": {"mime_type": mime, "data": base64.b64encode(pathlib.Path(sketch).read_bytes()).decode()}},
    ]}], "generationConfig": {"responseModalities": ["IMAGE"]}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": api_key})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:500]}")
    for p in res["candidates"][0]["content"]["parts"]:
        d = p.get("inlineData") or p.get("inline_data")
        if d:
            return base64.b64decode(d["data"])
    sys.exit(f"no image in response: {json.dumps(res)[:500]}")

if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("sketch"); a.add_argument("--model", default="gemini-3.1-flash-image")
    a.add_argument("--extra", default=""); a.add_argument("--only", help="comma list of material keys")
    a = a.parse_args()
    out = pathlib.Path("spike/out"); out.mkdir(parents=True, exist_ok=True)
    k = key()
    for name in (a.only.split(",") if a.only else MATERIALS):
        img = render(a.sketch, MATERIALS[name], a.extra, a.model, k)
        f = out / f"{pathlib.Path(a.sketch).stem}__{name}.png"
        f.write_bytes(img); print("saved", f)
