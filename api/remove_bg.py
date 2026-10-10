"""
Dannz AI Studio - Background removal API (Vercel Serverless, zero external AI APIs).

Route:  POST /api/remove_bg
Auth:   none required - runs fully on the server CPU using open-source models.

Request (multipart/form-data):
    image         file    (required) JPG / PNG / WebP source image
    model         string  u2netp (default) | u2net | isnet-general-use |
                          u2net_human_seg | silueta
    max_size      int     longest-edge cap applied before inference (default 1600)
    alpha_matting bool    true/false - softer edges, slower (default false)
    fg_threshold  int     alpha matting foreground threshold (default 240)
    bg_threshold  int     alpha matting background threshold (default 10)
    erode_size    int     alpha matting erode size (default 10)

Request (application/octet-stream alternative, same params as query string):
    POST /api/remove_bg?model=u2netp&max_size=1600     (raw image bytes as body)

Response:
    200  image/png bytes with transparency
    headers: X-Model, X-Processing-Time-Ms, X-Input-Bytes, X-Output-Bytes,
             X-Input-Size, X-Output-Size
    400  application/json { "detail": "reason" }
    413  application/json { "detail": "payload too large" }
    500  application/json { "detail": "reason" }
"""

import io
import json
import os
import time
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Model weights live in /tmp on Vercel (read-only home). Set before importing rembg.
os.environ.setdefault("U2NET_HOME", "/tmp/.u2net")
os.environ.setdefault("HOME", "/tmp")

MAX_BODY_BYTES = 20 * 1024 * 1024  # hard guard; Vercel Hobby caps requests at 4.5 MB
DEFAULT_MODEL = "u2netp"
DEFAULT_MAX_SIZE = 1600
ALLOWED_MODELS = (
    "u2netp",
    "u2net",
    "isnet-general-use",
    "isnet-anime",
    "u2net_human_seg",
    "u2net_cloth_seg",
    "silueta",
    "sam",
)

_session = None
_session_model = None


def get_session(model: str):
    """Lazily create (and cache) an ONNX inference session.

    The cache keeps the model warm between invocations on the same
    serverless instance, which is what makes repeat calls fast.
    """
    global _session, _session_model
    if _session is None or _session_model != model:
        from rembg import new_session  # imported late: keeps cold start minimal

        _session = new_session(model)
        _session_model = model
    return _session


def remove_background(
    image_bytes: bytes,
    model: str = DEFAULT_MODEL,
    max_size: int = DEFAULT_MAX_SIZE,
    alpha_matting: bool = False,
    fg_threshold: int = 240,
    bg_threshold: int = 10,
    erode_size: int = 10,
) -> tuple:
    """Run background removal. Returns (png_bytes, meta)."""
    from PIL import Image, ImageOps
    from rembg import remove

    started = time.time()
    session = get_session(model)

    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)  # honour phone orientation
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    input_w, input_h = image.size
    input_bytes = len(image_bytes)

    downscaled = False
    longest = max(image.size)
    if max_size and longest > max_size:
        ratio = max_size / longest
        image = image.resize(
            (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
            Image.LANCZOS,
        )
        downscaled = True

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)

    output = remove(
        buffer.read(),
        session=session,
        alpha_matting=alpha_matting,
        alpha_matting_foreground_threshold=fg_threshold,
        alpha_matting_background_threshold=bg_threshold,
        alpha_matting_erode_size=erode_size,
    )

    result_image = Image.open(io.BytesIO(output))
    out_w, out_h = result_image.size

    meta = {
        "model": model,
        "input_size": f"{input_w}x{input_h}",
        "output_size": f"{out_w}x{out_h}",
        "input_bytes": input_bytes,
        "output_bytes": len(output),
        "downscaled": downscaled,
        "ms": round((time.time() - started) * 1000, 1),
    }
    return output, meta


def parse_multipart(content_type: str, body: bytes) -> tuple:
    """Minimal dependency-free multipart/form-data parser."""
    header = (
        b"Content-Type: "
        + content_type.encode("latin-1")
        + b"\r\nMIME-Version: 1.0\r\n\r\n"
    )
    msg = BytesParser(policy=email_policy).parsebytes(header + body)
    fields: dict = {}
    files: list = []
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        filename = part.get_param("filename", header="content-disposition")
        payload = part.get_payload(decode=True) or b""
        if filename:
            files.append((name, filename, payload))
        elif name:
            fields[name] = payload.decode("utf-8", "replace").strip()
    return fields, files


def _to_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _to_int(value, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------- sending --
def _cors(h) -> None:
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


def send_json(h, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    _cors(h)
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


def send_image(h, status: int, data: bytes, meta: dict) -> None:
    h.send_response(status)
    h.send_header("Content-Type", "image/png")
    h.send_header("Content-Length", str(len(data)))
    h.send_header("X-Model", meta["model"])
    h.send_header("X-Processing-Time-Ms", str(meta["ms"]))
    h.send_header("X-Input-Size", meta["input_size"])
    h.send_header("X-Output-Size", meta["output_size"])
    h.send_header("X-Input-Bytes", str(meta["input_bytes"]))
    h.send_header("X-Output-Bytes", str(meta["output_bytes"]))
    _cors(h)
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(data)


# ------------------------------------------------------------------ routes --
def do_get(h) -> None:
    send_json(
        h,
        200,
        {
            "service": "dannz-remove-bg",
            "usage": "POST an image with multipart field 'image' (or raw body + ?model=)",
            "models": list(ALLOWED_MODELS),
            "default_model": DEFAULT_MODEL,
            "max_body_bytes": MAX_BODY_BYTES,
        },
    )


def do_options(h) -> None:
    h.send_response(204)
    h.send_header("Content-Length", "0")
    _cors(h)
    h.end_headers()


def do_post(h) -> None:
    try:
        length = int(h.headers.get("Content-Length") or 0)
    except ValueError:
        length = 0
    if length <= 0:
        send_json(h, 400, {"detail": "empty request body"})
        return
    if length > MAX_BODY_BYTES:
        send_json(h, 413, {"detail": "payload too large (max 20 MB)"})
        return

    body = h.rfile.read(length)
    content_type = h.headers.get("Content-Type", "")

    image_bytes = None
    filename = "image"
    fields: dict = {}
    files: list = []

    if content_type.startswith("multipart/form-data"):
        fields, files = parse_multipart(content_type, body)
        for name, fname, payload in files:
            if name == "image" or len(files) == 1:
                image_bytes = payload
                filename = fname
                break
        if image_bytes is None and "image" in fields:
            image_bytes = fields["image"].encode("latin-1")
    else:
        image_bytes = body

    if not image_bytes:
        send_json(
            h,
            400,
            {"detail": "missing image (multipart field 'image' or raw body)"},
        )
        return

    query = {k: v[0] for k, v in parse_qs(urlparse(h.path).query).items()}

    def param(key: str, default):
        return fields.get(key, query.get(key, default))

    model = str(param("model", DEFAULT_MODEL))
    if model not in ALLOWED_MODELS:
        send_json(
            h,
            400,
            {"detail": f"unsupported model '{model}'", "models": list(ALLOWED_MODELS)},
        )
        return

    try:
        png, meta = remove_background(
            image_bytes,
            model=model,
            max_size=_to_int(param("max_size", DEFAULT_MAX_SIZE), DEFAULT_MAX_SIZE),
            alpha_matting=_to_bool(param("alpha_matting", None)),
            fg_threshold=_to_int(param("fg_threshold", 240), 240),
            bg_threshold=_to_int(param("bg_threshold", 10), 10),
            erode_size=_to_int(param("erode_size", 10), 10),
        )
    except Exception as exc:  # noqa: BLE001 - surface any failure as JSON
        print(f"[remove_bg] failed on {filename}: {exc}")
        send_json(h, 500, {"detail": f"background removal failed: {exc}"})
        return

    send_image(h, 200, png, meta)


# ------------------------------------------------------- Vercel entrypoint --
class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel expects this name
    server_version = "DannzRemoveBG/2.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep Vercel logs quiet but useful
        print(f"[remove_bg] {fmt % args}")

    def do_OPTIONS(self) -> None:  # noqa: N802 - http.server naming
        do_options(self)

    def do_GET(self) -> None:  # noqa: N802
        do_get(self)

    def do_POST(self) -> None:  # noqa: N802
        do_post(self)


# ---- local entrypoint: python api/remove_bg.py  (dev, no Vercel needed) ----
if __name__ == "__main__":
    from http.server import ThreadingHTTPServer

    port = int(os.environ.get("PORT", "8000"))
    print(f"[remove_bg] local API on http://127.0.0.1:{port}  (POST /api/remove_bg)")
    ThreadingHTTPServer(("0.0.0.0", port), handler).serve_forever()
