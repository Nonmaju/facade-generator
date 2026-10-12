"""Download ambientCG (CC0) 1K-JPG packs listed in tools/textures.json into web/textures/<material>/.

tools/textures.json maps a catalog material id to an ambientCG asset id, e.g. {"brick": "Bricks059"}.
Run it only after the user approved the list and the download. Usage: python -I tools/fetch_textures.py
"""
import io
import json
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
# zip member suffix -> file name our renderer expects
WANT = {"Color": "color.jpg", "NormalGL": "normal.jpg", "Roughness": "rough.jpg"}


def main():
    mapping = json.loads((ROOT / "tools" / "textures.json").read_text(encoding="utf-8"))
    for material, asset in mapping.items():
        url = f"https://ambientcg.com/get?file={asset}_1K-JPG.zip"
        print("GET", url)
        req = urllib.request.Request(url, headers={"User-Agent": "facade-studio-fetch"})
        data = urllib.request.urlopen(req, timeout=60).read()
        out = ROOT / "web" / "textures" / material
        out.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for suffix, name in WANT.items():
                member = f"{asset}_1K-JPG_{suffix}.jpg"
                # Read only the three exact members into memory; nothing else from the zip is extracted.
                (out / name).write_bytes(z.read(member))  # KeyError = zip layout changed: stop and look
        print("ok", material, asset, f"{len(data) // 1024} KB zip")


if __name__ == "__main__":
    main()
