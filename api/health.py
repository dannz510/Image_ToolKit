"""
Dannz AI Studio - health endpoint.

Route: GET /api/health

Reports service status, available models and whether any model weights are
already cached on the instance (a warm instance skips the first-run download).
"""

import json
import os
from http.server import BaseHTTPRequestHandler

os.environ.setdefault("U2NET_HOME", "/tmp/.u2net")
os.environ.setdefault("HOME", "/tmp")

CACHE_DIR = os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net"))

MODELS = (
    "u2netp",
    "u2net",
    "isnet-general-use",
    "isnet-anime",
    "u2net_human_seg",
    "u2net_cloth_seg",
    "silueta",
)


def _cache_state() -> dict:
    try:
        files = os.listdir(CACHE_DIR) if os.path.isdir(CACHE_DIR) else []
    except OSError:
        files = []
    return {
        "dir": CACHE_DIR,
        "files": sorted(files),
        "warm": len(files) > 0,
    }


def send_json(h, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


def do_get(h) -> None:
    rembg_ready = True
    try:
        import rembg  # noqa: F401
    except Exception:  # noqa: BLE001
        rembg_ready = False

    send_json(
        h,
        200,
        {
            "status": "ok",
            "service": "dannz-ai-studio-api",
            "models": list(MODELS),
            "default_model": "u2netp",
            "rembg_installed": rembg_ready,
            "model_cache": _cache_state(),
        },
    )


def do_post(h) -> None:
    do_get(h)


class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel expects this name
    server_version = "DannzHealth/1.0"
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
    print(f"[health] local API on http://127.0.0.1:{port}/api/health")
    ThreadingHTTPServer(("0.0.0.0", port), handler).serve_forever()
