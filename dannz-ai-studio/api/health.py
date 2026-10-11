"""
Dannz AI Studio - health endpoint.

Route: GET /api/health

Deliberately terse: this endpoint is public, so it reports liveness and the
default model only. It does not enumerate cached weights, filesystem paths or
library versions - those details stay in the server logs.

CORS follows the same allowlist as /api/remove_bg (closed by default).
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Vercel/Lambda give the function a read-only home, so the weights must live in
# /tmp there. Everywhere else (local dev) rembg's own default (~/.rembg) is
# used, so an already-downloaded model is reused instead of fetched again.
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    os.environ.setdefault("U2NET_HOME", "/tmp/.u2net")
    os.environ.setdefault("HOME", "/tmp")

# Import the model policy from the worker instead of restating it: adding a
# model in one place then leaves the other silently out of date, and /api/health
# would advertise a model /api/remove_bg refuses.
from remove_bg import LIGHT_MODELS, HEAVY_MODELS  # noqa: E402


def _model_cache_dir() -> str:
    """Mirror rembg's own model-root resolution (rembg.sessions.base)."""
    if os.getenv("U2NET_HOME"):
        return os.environ["U2NET_HOME"]
    xdg = os.getenv("XDG_DATA_HOME")
    default = os.path.join(xdg, "rembg") if xdg else os.path.join("~", ".rembg")
    return os.path.expanduser(os.getenv("REMBG_HOME", default))


CACHE_DIR = _model_cache_dir()


def allowed_origins() -> set:
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


def _cache_count() -> int:
    try:
        return len(os.listdir(CACHE_DIR)) if os.path.isdir(CACHE_DIR) else 0
    except OSError:
        return 0


def send_json(h, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    origin = h.headers.get("Origin")
    if origin and origin.rstrip("/").lower() in allowed_origins():
        h.send_header("Access-Control-Allow-Origin", origin)
        h.send_header("Vary", "Origin")
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


def do_get(h) -> None:
    heavy_enabled = os.environ.get("ALLOW_HEAVY_MODELS") == "1"
    send_json(
        h,
        200,
        {
            "status": "ok",
            "service": "dannz-ai-studio-api",
            "models": list(LIGHT_MODELS),
            "default_model": "u2netp",
            "heavy_models": list(HEAVY_MODELS),
            "heavy_models_enabled": heavy_enabled,
            "warm": _cache_count() > 0,
        },
    )


def do_post(h) -> None:
    do_get(h)


class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel expects this name
    server_version = "DannzHealth/1.1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[health] {fmt % args}")

    def do_GET(self) -> None:  # noqa: N802
        do_get(self)

    def do_POST(self) -> None:  # noqa: N802 - convenience: same payload on POST
        do_post(self)


if __name__ == "__main__":
    from http.server import ThreadingHTTPServer

    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")  # loopback by default
    print(f"[health] local API on http://{host}:{port}/api/health")
    ThreadingHTTPServer((host, port), handler).serve_forever()
