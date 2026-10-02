"""usage: python tools/make_samples.py <renders_dir>
renders_dir holds <sketch>__<material>.png (from the Colab/Kaggle notebook).
Re-run with a new renders_dir to refresh the demo images."""
import json, pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "samples"
MATERIALS = [("concrete", "노출 콘크리트"), ("brick", "적벽돌 파사드"),
             ("glass", "통유리 커튼월"), ("wood", "우드 루버")]
SKETCHES = [("modern", "현대식 박스"), ("villa_elev", "빌라 입면")]

def save_jpg(src, dst, maxside=1024):
    im = Image.open(src).convert("RGB")
    im.thumbnail((maxside, maxside))
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=85)

def main(renders_dir):
    renders = pathlib.Path(renders_dir)
    manifest = {"materials": [{"id": i, "label": l} for i, l in MATERIALS],
                "sketches": [], "renders": {}}
    for sid, label in SKETCHES:
        save_jpg(ROOT / "spike" / f"{sid}.png", OUT / sid / "sketch.jpg")
        manifest["sketches"].append({"id": sid, "label": label, "src": f"samples/{sid}/sketch.jpg"})
        manifest["renders"][sid] = {}
        for mid, _ in MATERIALS:
            save_jpg(renders / f"{sid}__{mid}.png", OUT / sid / f"{mid}.jpg")
            manifest["renders"][sid][mid] = f"samples/{sid}/{mid}.jpg"
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")
    print("wrote", OUT / "manifest.json")

if __name__ == "__main__":
    main(sys.argv[1])
