"""
Local development router for the Dannz AI Studio Python API.

Run both endpoints without Vercel:

    python api/server.py
    # GET  http://127.0.0.1:8000/api/health
    # POST http://127.0.0.1:8000/api/remove_bg

The Vite dev server proxies /api -> http://127.0.0.1:8000, so the frontend
can call /api/remove_bg exactly like it does in production.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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
    print("=" * 60)
    print(" Dannz AI Studio - local API")
    print(f"   health:     http://127.0.0.1:{port}/api/health")
    print(f"   remove_bg:  http://127.0.0.1:{port}/api/remove_bg")
    print("=" * 60)
    ThreadingHTTPServer(("0.0.0.0", port), DevRouter).serve_forever()
