"""
Dannz AI Studio - Background removal API (Vercel Serverless, zero external AI APIs).

Route:  POST /api/remove_bg
Auth:   none required - runs fully on the server CPU using open-source models.

Security posture (see README "Security"):
  * CORS is closed by default. Set ALLOWED_ORIGINS="https://a.example,https://b.example"
    (or DANNZ_DEV=1 for localhost) to allow cross-origin browser calls. With no
    configuration the endpoint is same-origin only.
  * Request bodies are bounded to MAX_BODY_BYTES and streamed, never trusting a
    single Content-Length read.
  * Model names are validated against a strict regex + allowlist. Heavy models
    (100+ MB weights) are opt-in via ALLOW_HEAVY_MODELS=1 so a public instance
    cannot be pushed into multi-hundred-megabyte cold starts by default.
  * Inference is serialised behind a semaphore: one image at a time per
    instance, which is also the CPU-bound reality of ONNX here.
  * Internal exception text is logged server-side only; clients get a generic
    message so stack traces, paths and library versions never leak.

Request (multipart/form-data):
    image         file    (required) JPG / PNG / WebP source image
    model         string  u2netp (default) | silueta | u2net_human_seg
                          (heavy models need ALLOW_HEAVY_MODELS=1)
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
    429  application/json { "detail": "server busy" }
    500  application/json { "detail": "reason" }
"""

import io
import json
import os
import re
import threading
import time
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Vercel/Lambda give the function a read-only home, so the weights must live in
# /tmp there. On a local machine rembg's own default (~/.rembg/models) is used,
# which keeps an already-downloaded model warm instead of re-fetching it.
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    os.environ.setdefault("U2NET_HOME", "/tmp/.u2net")
    os.environ.setdefault("HOME", "/tmp")

MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", 4.5 * 1024 * 1024))  # Vercel Hobby cap
MAX_MULTIPART_PARTS = 8
MAX_IMAGE_PIXELS = 60_000_000  # ~60 MP: blocks decompression bombs
DEFAULT_MODEL = "u2netp"
DEFAULT_MAX_SIZE = 1600

# Small/cheap weights: safe defaults for a public instance.
LIGHT_MODELS = ("u2netp", "silueta", "u2net_human_seg")
# 100+ MB weights: only reachable when an operator opts in.
HEAVY_MODELS = ("u2net", "isnet-general-use", "isnet-anime", "u2net_cloth_seg", "sam")
ALLOWED_MODELS = tuple(sorted(LIGHT_MODELS + HEAVY_MODELS))

# [a-z0-9] then up to 39 of [a-z0-9_-]: no separators, no dots, no traversal.
_MODEL_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")

# One inference at a time per instance (CPU bound; also the DoS guard).
_inference_gate = threading.BoundedSemaphore(int(os.environ.get("MAX_CONCURRENCY", "1")))

_session = None
_session_model = None


# ------------------------------------------------------------------ origins --
def allowed_origins() -> set:
    """CORS allowlist. Empty => same-origin only (no CORS header emitted)."""
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if raw:
        return {o.strip().rstrip("/").lower() for o in raw.split(",") if o.strip()}
    if os.environ.get("DANNZ_DEV") == "1":
        return {
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        }
    return set()


# ------------------------------------------------------------------- models --
def validate_model(raw) -> str:
    """Return a permitted model name, or raise ValueError with a safe reason."""
    if not isinstance(raw, str):
        raise ValueError("invalid model")
    candidate = raw.strip().lower()
    if not candidate or len(candidate) > 40 or not _MODEL_RE.match(candidate):
        raise ValueError("invalid model")
    if candidate not in ALLOWED_MODELS:
        raise ValueError("unsupported model")
    if candidate in HEAVY_MODELS and os.environ.get("ALLOW_HEAVY_MODELS") != "1":
        raise ValueError("model not enabled on this instance")
    return candidate


def clamp_int(value, default: int, low: int, high: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return max(low, min(high, parsed))


def get_session(model: str):
    """Lazily create (and cache) an ONNX inference session.

    The cache keeps the model warm between invocations on the same
    serverless instance, which is what makes repeat calls fast.

    `ort.SessionOptions` is tuned for single-image CPU inference: the graph
    optimizer runs at full level, and execution stays sequential - with one
    image per call the inter-op thread pool only adds hand-off overhead.
    """
    global _session, _session_model
    if _session is None or _session_model != model:
        import onnxruntime as ort
        from rembg import new_session  # imported late: keeps cold start minimal

        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

        _session = new_session(model, sess_opts=options)
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
    image.load()  # force decode before trusting dimensions
    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise ValueError("image too large")

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

    # Serialise CPU-bound inference: protects a shared instance from queue
    # explosion and keeps memory bounded to one image at a time.
    acquired = _inference_gate.acquire(timeout=int(os.environ.get("INFERENCE_TIMEOUT", "25")))
    if not acquired:
        raise TimeoutError("server busy")
    try:
        # The decoded image is handed to rembg directly instead of being
        # re-encoded to PNG and parsed again: that saves one full encode +
        # one full decode of the (possibly 1600px) input per request.
        result_image = remove(
            image,
            session=session,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=fg_threshold,
            alpha_matting_background_threshold=bg_threshold,
            alpha_matting_erode_size=erode_size,
        )
    finally:
        _inference_gate.release()

    # rembg returns a PIL image when it is given one (see rembg.remove), but
    # stay defensive: anything unexpected is normalised back to bytes.
    if isinstance(result_image, bytes):
        output = result_image
        result_image = Image.open(io.BytesIO(output))
    else:
        result_image = result_image.convert("RGBA") if result_image.mode == "P" else result_image
        buffer = io.BytesIO()
        result_image.save(buffer, format="PNG")
        output = buffer.getvalue()

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
    """Minimal dependency-free multipart/form-data parser (bounded)."""
    header = (
        b"Content-Type: "
        + content_type.encode("latin-1")
        + b"\r\nMIME-Version: 1.0\r\n\r\n"
    )
    msg = BytesParser(policy=email_policy).parsebytes(header + body)
    fields: dict = {}
    files: list = []
    for index, part in enumerate(msg.iter_parts()):
        if index >= MAX_MULTIPART_PARTS:
            break  # ignore trailing/extra parts
        name = part.get_param("name", header="content-disposition")
        filename = part.get_param("filename", header="content-disposition")
        payload = part.get_payload(decode=True) or b""
        if filename:
            files.append((name, filename, payload))
        elif name:
            fields[name] = payload.decode("utf-8", "replace").strip()
    return fields, files


def to_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------- sending --
def _cors(h) -> None:
    """Echo the Origin only when it is explicitly allowlisted."""
    origin = h.headers.get("Origin")
    if not origin:
        return
    if origin.rstrip("/").lower() not in allowed_origins():
        return
    h.send_header("Access-Control-Allow-Origin", origin)
    h.send_header("Vary", "Origin")
    h.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")
    h.send_header("Access-Control-Max-Age", "600")


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


def read_bounded_body(h, limit: int) -> bytes:
    """Read exactly Content-Length bytes, never trusting a single huge read."""
    try:
        length = int(h.headers.get("Content-Length") or 0)
    except ValueError:
        raise ValueError("invalid Content-Length")
    if length <= 0:
        raise ValueError("empty request body")
    if length > limit:
        raise ValueError("payload too large")
    chunks = []
    remaining = length
    while remaining > 0:
        chunk = h.rfile.read(min(remaining, 1 << 20))
        if not chunk:
            raise ValueError("truncated request body")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


# ------------------------------------------------------------------ routes --
def do_get(h) -> None:
    send_json(
        h,
        200,
        {
            "service": "dannz-remove-bg",
            "usage": "POST an image with multipart field 'image' (or raw body + ?model=)",
            "models": list(LIGHT_MODELS),
            "heavy_models_enabled": os.environ.get("ALLOW_HEAVY_MODELS") == "1",
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
        body = read_bounded_body(h, MAX_BODY_BYTES)
    except ValueError as exc:
        message = str(exc)
        status = 413 if "too large" in message else 400
        send_json(h, status, {"detail": message})
        return

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

    try:
        model = validate_model(param("model", DEFAULT_MODEL))
    except ValueError as exc:
        send_json(
            h,
            400,
            {"detail": str(exc), "models": list(LIGHT_MODELS)},
        )
        return

    try:
        png, meta = remove_background(
            image_bytes,
            model=model,
            max_size=clamp_int(param("max_size", DEFAULT_MAX_SIZE), DEFAULT_MAX_SIZE, 32, 4000),
            alpha_matting=to_bool(param("alpha_matting", None)),
            fg_threshold=clamp_int(param("fg_threshold", 240), 240, 0, 255),
            bg_threshold=clamp_int(param("bg_threshold", 10), 10, 0, 255),
            erode_size=clamp_int(param("erode_size", 10), 10, 0, 40),
        )
    except TimeoutError:
        send_json(h, 429, {"detail": "server busy, retry shortly"})
        return
    except Exception as exc:  # noqa: BLE001 - detail stays server-side
        # Log the real cause for operators; return a generic message so
        # paths, library versions and stack traces never reach the client.
        print(f"[remove_bg] failed on {filename!r}: {type(exc).__name__}: {exc}")
        send_json(h, 500, {"detail": "background removal failed"})
        return

    send_image(h, 200, png, meta)


# ------------------------------------------------------- Vercel entrypoint --
class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel expects this name
    server_version = "DannzRemoveBG/2.1"
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
    host = os.environ.get("HOST", "127.0.0.1")  # loopback by default
    print(f"[remove_bg] local API on http://{host}:{port}  (POST /api/remove_bg)")
    ThreadingHTTPServer((host, port), handler).serve_forever()
