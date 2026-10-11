"""
Local development router for the Dannz AI Studio Python API.

Run every endpoint without Vercel:

    python api/server.py
    # GET  http://127.0.0.1:8000/api/health
    # POST http://127.0.0.1:8000/api/remove_bg
    # POST http://127.0.0.1:8000/api/fetch_image      (same-origin URL import)

The Vite dev server proxies /api -> http://127.0.0.1:8000, so the frontend
can call these exactly like it does in production.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# This router only ever runs on a developer machine (Vercel calls the
# individual handlers, never this file), so dev mode is unconditional here:
# localhost origins are allowed and a local image host may be fetched by
# /api/fetch_image. The link-local/metadata ranges stay blocked regardless.
os.environ["DANNZ_DEV"] = "1"

import fetch_image  # noqa: E402
import health  # noqa: E402
import remove_bg  # noqa: E402


class DevRouter(BaseHTTPRequestHandler):
    server_version = "DannzDevAPI/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[dev-api] {self.address_string()} {fmt % args}")

    def _dispatch(self, method: str) -> None:
        path = self.path.split("?")[0].rstrip("/")
        if path == "/api/health":
            (health.do_get if method == "GET" else health.do_post)(self)
        elif path == "/api/fetch_image":
            (fetch_image.do_get if method == "GET" else fetch_image.do_post)(self)
        elif path == "/api/remove_bg":
            (remove_bg.do_get if method == "GET" else remove_bg.do_post)(self)
        else:
            body = b'{"detail":"not found"}'
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    # Loopback by default. Set HOST=0.0.0.0 explicitly when you need LAN
    # access (e.g. testing the PWA from a phone) - the dev API has no auth.
    host = os.environ.get("HOST", "127.0.0.1")
    print("=" * 60)
    print(" Dannz AI Studio - local API")
    print(f"   health:      http://{host}:{port}/api/health")
    print(f"   remove_bg:   http://{host}:{port}/api/remove_bg")
    print(f"   fetch_image: http://{host}:{port}/api/fetch_image")
    if host == "0.0.0.0":
        print("   WARNING: bound to all interfaces - no auth, dev only")
    print("=" * 60)
    ThreadingHTTPServer((host, port), DevRouter).serve_forever()
