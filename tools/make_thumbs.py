"""Make 112x112 swatch thumbnails (web/textures/<finish>/thumb.jpg) from each finish's color.jpg.

Dev tool, run by hand after the textures change: needs Pillow (pip install pillow).
Usage: python -I tools/make_thumbs.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent / "web" / "textures"

for folder in sorted(p for p in ROOT.iterdir() if p.is_dir()):
    src = folder / "color.jpg"
    if not src.exists():
        continue
    im = Image.open(src).convert("RGB")
    w, h = im.size
    side = min(w, h)  # the largest centered square the image allows
    left, top = (w - side) // 2, (h - side) // 2
    thumb = im.crop((left, top, left + side, top + side)).resize((112, 112), Image.LANCZOS)
    thumb.save(folder / "thumb.jpg", quality=82, optimize=True)
    print("ok", folder.name)
