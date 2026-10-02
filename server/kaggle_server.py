"""Run inside a Kaggle GPU notebook (Internet: On):
  !pip -q install diffusers transformers accelerate safetensors opencv-python-headless fastapi uvicorn python-multipart nest_asyncio
  # upload this file as a dataset or paste it with %%writefile kaggle_server.py, then in a cell:
  import kaggle_server; kaggle_server.main()
It prints a https://*.trycloudflare.com URL: paste that into the web page's server field."""
import io, re, subprocess, threading
import cv2, numpy as np, torch
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

CONTROL_SCALE, CANNY, STEPS, SEED, MAXSIDE = 0.55, (50, 150), 30, 42, 1024
MATERIALS = {
    "concrete": "exposed concrete finish, modern industrial look",
    "brick": "red brick facade, warm classic look",
    "glass": "full-height glass curtain wall, maximum openness",
    "wood": "timber louvers and wood cladding, natural texture",
}
PROMPT = ("photorealistic architectural exterior photograph, {m}, natural daylight, "
          "professional architecture photography, highly detailed {extra}")
NEG = ("sketch, drawing, line art, cartoon, painting, lowres, blurry, text, watermark, "
       "extra floors, distorted geometry")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_lock = threading.Lock()
_pipe = None

def pipe():
    global _pipe
    if _pipe is None:
        from diffusers import AutoencoderKL, ControlNetModel, StableDiffusionXLControlNetPipeline
        cn = ControlNetModel.from_pretrained("diffusers/controlnet-canny-sdxl-1.0",
                                             torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
        vae = AutoencoderKL.from_pretrained("madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
        _pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0", controlnet=cn, vae=vae,
            torch_dtype=torch.float16, variant="fp16", use_safetensors=True).to("cuda")
    return _pipe

def control_image(raw: bytes):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    s = MAXSIDE / max(im.size)
    im = im.resize((max(8, int(im.width * s) // 8 * 8), max(8, int(im.height * s) // 8 * 8)), Image.LANCZOS)
    g = cv2.GaussianBlur(cv2.cvtColor(np.array(im), cv2.COLOR_RGB2GRAY), (3, 3), 0)
    return Image.fromarray(np.stack([cv2.Canny(g, *CANNY)] * 3, -1))

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/render")
def render(sketch: UploadFile = File(...), material: str = Form(...), extra: str = Form("")):
    if material not in MATERIALS:
        raise HTTPException(400, f"unknown material {material}")
    ctrl = control_image(sketch.file.read())
    with _lock:   # ponytail: one GPU job at a time; add a queue if several users matter
        img = pipe()(PROMPT.format(m=MATERIALS[material], extra=extra), negative_prompt=NEG, image=ctrl,
                     controlnet_conditioning_scale=CONTROL_SCALE, num_inference_steps=STEPS,
                     generator=torch.Generator("cpu").manual_seed(SEED)).images[0]
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")

def main(port=8000):
    import nest_asyncio, uvicorn
    nest_asyncio.apply()
    subprocess.run("wget -q -O cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x cloudflared",
                   shell=True, check=True)
    t = subprocess.Popen(["./cloudflared", "tunnel", "--url", f"http://localhost:{port}"],
                         stderr=subprocess.PIPE, text=True)

    def show_url():
        for line in t.stderr:
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if m:
                print("\nSERVER URL:", m.group(0))
                return

    threading.Thread(target=show_url, daemon=True).start()
    pipe()   # load the model now so the first request is not slow
    uvicorn.run(app, host="0.0.0.0", port=port)
