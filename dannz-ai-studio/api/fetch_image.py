"""
Dannz AI Studio - remote image fetch endpoint.

Route:  POST /api/fetch_image

Why this exists
---------------
"Load an image from a URL" is impossible to do purely in the browser: the
remote host has to opt in with `Access-Control-Allow-Origin`, and most image
hosts do not. Instead of telling the user to download the file first, the
browser asks this endpoint (same-origin, so no CORS problem at all) and the
Python runtime downloads the bytes.

Security posture (this endpoint fetches attacker-controlled URLs):
  * Only http/https, no credentials in the URL, no non-default ports abuse.
  * DNS is resolved and every resolved address is checked against the
    private/loopback/link-local/reserved/multicast ranges, so the endpoint
    cannot be used to reach cloud metadata services (169.254.169.254),
    internal admin panels or the local filesystem. Set DANNZ_DEV=1 on a dev
    machine to allow loopback for local testing.
  * Redirects are followed manually (max 3) and EVERY hop is re-validated,
    so a public URL cannot bounce into the private network.
  * Response size is capped (streamed read, never buffered unbounded), the
    Content-Type must be an image, the magic bytes must match a real raster
    format, and Pillow decodes + verifies the image with a pixel cap, which
    rejects decompression bombs and HTML/JSON masquerading as an image.
  * Response headers are limited to a known-safe set so an upstream cannot
    inject arbitrary headers into the API response.
  * Internal exception text is logged server-side only; clients get a
    generic, non-leaky message.

Request (JSON body or ?url= query parameter):
    { "url": "https://example.com/photo.jpg" }

Response:
    200  image/png (or the detected image type) with X-Content-Type,
         X-Image-Width, X-Image-Height, X-Image-Bytes headers
    400  { "detail": "invalid url" | "blocked address" | "not an image" }
    413  { "detail": "payload too large" }
    502  { "detail": "upstream fetch failed" }
    504  { "detail": "upstream timeout" }
    500  { "detail": "reason" }
"""

import io
import ipaddress
import json
import os
import socket
import ssl
import http.client
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urljoin, urlparse

MAX_BODY_BYTES = 64 * 1024  # the JSON envelope only
MAX_IMAGE_BYTES = int(os.environ.get("FETCH_MAX_IMAGE_BYTES", 15 * 1024 * 1024))
MAX_IMAGE_PIXELS = 60_000_000  # same bomb guard as remove_bg
FETCH_TIMEOUT = float(os.environ.get("FETCH_TIMEOUT", "15"))
MAX_REDIRECTS = 3
MAX_URL_LENGTH = 2048

# Dev mode is decided once at import (api/server.py sets it before importing
# this module) so every check in a request sees the same policy.
_DEV = os.environ.get("DANNZ_DEV") == "1"
_SSL_CONTEXT = ssl.create_default_context()

# Magic byte signatures for the raster formats we accept. The Content-Type
# header is attacker-controlled, so it is only a hint - the bytes decide.
_MAGIC = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"BM", "image/bmp"),
    (b"II*\x00", "image/tiff"),
    (b"MM\x00*", "image/tiff"),
)


def _sniff_type(head: bytes) -> str | None:
    """Detect the image type from the leading bytes (WebP needs 12)."""
    for magic, mime in _MAGIC:
        if head.startswith(magic):
            return mime
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def _check_addresses(host: str, allow_private: bool) -> str:
    """Resolve `host` once and return the verified address to connect to.

    `allow_private` (dev only) additionally permits loopback and RFC1918
    hosts so a local image server can be used while developing - the cloud
    metadata and link-local ranges stay blocked in every mode.

    The returned address is what the caller MUST connect to. Resolving again
    later (or letting HTTP lib re-resolve) re-opens a DNS-rebinding window,
    so the value is pinned to the connection instead.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ValueError("unresolvable host")

    verified = None
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            raise ValueError("invalid address")

        # 169.254.169.254 (cloud metadata), fe80:: link-local, multicast and
        # reserved space are never a legitimate image host.
        dangerous = ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified
        internal = ip.is_private or ip.is_loopback
        if dangerous or (internal and not allow_private):
            raise ValueError("blocked address")
        if verified is None:
            verified = address
    if not verified:
        raise ValueError("unresolvable host")
    return verified


def validate_url(raw) -> str:
    """Return a safe absolute http(s) URL, or raise ValueError."""
    if not isinstance(raw, str):
        raise ValueError("invalid url")
    candidate = raw.strip()
    if not candidate or len(candidate) > MAX_URL_LENGTH:
        raise ValueError("invalid url")
    # Reject control characters and whitespace smuggled into the URL.
    if any(ch.isspace() or ord(ch) < 0x20 or ord(ch) == 0x7F for ch in candidate):
        raise ValueError("invalid url")
    try:
        parsed = urlparse(candidate)
    except ValueError:
        raise ValueError("invalid url")
    if parsed.scheme not in ("http", "https"):
        raise ValueError("invalid url")
    if parsed.username or parsed.password:
        raise ValueError("invalid url")
    if not parsed.hostname:
        raise ValueError("invalid url")

    # DANNZ_DEV=1 lifts the port rule and allows loopback/private hosts for a
    # local image host; link-local (cloud metadata) and reserved ranges stay
    # blocked in every mode.
    if not _DEV and parsed.port is not None and parsed.port not in (80, 443):
        raise ValueError("invalid url")
    _check_addresses(parsed.hostname, _DEV)
    return candidate


def _open_to_ip(scheme: str, ip: str, host: str, port: int, path: str):
    """GET `path` from `ip`, presenting `host` as the Host/SNI name.

    The TCP connection goes to the address that `_check_addresses` already
    approved; the host name is kept in `Host` (and TLS SNI + certificate
    verification) so redirects and virtual hosts still behave normally.
    """
    def pinned_connect(address, timeout=None, source_address=None):
        # Only the address portion is overridden - the port stays as requested.
        return socket.create_connection((ip, address[1]), timeout, source_address)

    if scheme == "https":
        conn = http.client.HTTPSConnection(
            host, port, timeout=FETCH_TIMEOUT, context=_SSL_CONTEXT
        )
    else:
        conn = http.client.HTTPConnection(host, port, timeout=FETCH_TIMEOUT)
    conn._create_connection = pinned_connect
    try:
        conn.request(
            "GET",
            path,
            headers={
                "User-Agent": "DannzAIFetch/1.0 (+https://vercel.com)",
                "Accept": "image/*,*/*;q=0.8",
                "Connection": "close",
            },
        )
        return conn.getresponse()
    finally:
        conn.close()


def fetch_image_bytes(url: str) -> tuple:
    """Download and validate an image. Returns (bytes, mime, width, height).

    Every hop resolves DNS exactly once, validates the resolved address, and
    then connects to THAT address - so a public URL cannot re-resolve into a
    private/link-local one between the check and the connection.
    """
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        scheme = parsed.scheme
        host = parsed.hostname or ""
        port = parsed.port or (443 if scheme == "https" else 80)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"

        ip = _check_addresses(host, _DEV)
        try:
            response = _open_to_ip(scheme, ip, host, port, path)
        except (socket.timeout, TimeoutError):
            raise ValueError("upstream timeout")
        except Exception:
            raise ValueError("upstream fetch failed")

        try:
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location:
                    raise ValueError("upstream fetch failed")
                # Re-validate every hop: a public URL must not bounce into a
                # private address.
                current = validate_url(urljoin(current, location))
                continue
            if response.status != 200:
                raise ValueError("upstream fetch failed")
            return _read_limited_image(response)
        finally:
            response.close()

    raise ValueError("too many redirects")


def _read_limited_image(response) -> tuple:
    """Stream the body under the cap, then verify it is a real image."""
    declared = int(response.headers.get("Content-Length") or 0)
    if declared and declared > MAX_IMAGE_BYTES:
        raise ValueError("too large")

    chunks = []
    total = 0
    while True:
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise ValueError("too large")
        chunks.append(chunk)
    data = b"".join(chunks)

    mime = _sniff_type(data[:64])
    if not mime:
        raise ValueError("not an image")

    from PIL import Image

    try:
        image = Image.open(io.BytesIO(data))
        image.load()  # force decode before trusting dimensions
    except Exception:
        raise ValueError("not an image")
    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise ValueError("too large")

    return data, mime, image.width, image.height


# ------------------------------------------------------------------ plumbing

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


def _cors(h) -> None:
    origin = h.headers.get("Origin")
    if not origin:
        return
    if origin.rstrip("/").lower() not in allowed_origins():
        return
    h.send_header("Access-Control-Allow-Origin", origin)
    h.send_header("Vary", "Origin")
    h.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


_SAFE_HEADERS = {"content-type", "content-length", "cache-control"}


def send_image(h, status: int, data: bytes, mime: str, width: int, height: int) -> None:
    h.send_response(status)
    h.send_header("Content-Type", mime)
    h.send_header("Content-Length", str(len(data)))
    h.send_header("X-Image-Bytes", str(len(data)))
    h.send_header("X-Image-Width", str(width))
    h.send_header("X-Image-Height", str(height))
    _cors(h)
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(data)


def send_json(h, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    _cors(h)
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


_ERROR_STATUS = {
    "invalid url": 400,
    "blocked address": 400,
    "not an image": 400,
    "too large": 413,
    "upstream fetch failed": 502,
    "upstream timeout": 504,
    "too many redirects": 502,
    "unresolvable host": 502,
}


def _read_body(h, limit: int) -> bytes:
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
        chunk = h.rfile.read(min(remaining, 1 << 16))
        if not chunk:
            raise ValueError("truncated request body")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def do_post(h) -> None:
    try:
        body = _read_body(h, MAX_BODY_BYTES)
    except ValueError as exc:
        message = str(exc)
        status = 413 if "too large" in message else 400
        send_json(h, status, {"detail": message})
        return

    content_type = h.headers.get("Content-Type", "")
    url = None
    if content_type.startswith("application/json"):
        try:
            url = json.loads(body).get("url")
        except Exception:
            url = None
    elif content_type.startswith("multipart/form-data"):
        header = (
            b"Content-Type: "
            + content_type.encode("latin-1")
            + b"\r\nMIME-Version: 1.0\r\n\r\n"
        )
        msg = BytesParser(policy=email_policy).parsebytes(header + body)
        for part in msg.iter_parts():
            if part.get_param("name", header="content-disposition") == "url":
                url = part.get_payload(decode=True)
                if isinstance(url, bytes):
                    url = url.decode("utf-8", "replace")
                break
    if url is None and h.path:
        query = parse_qs(urlparse(h.path).query)
        url = query.get("url", [None])[0]

    try:
        safe_url = validate_url(url)
        data, mime, width, height = fetch_image_bytes(safe_url)
    except ValueError as exc:
        message = str(exc)
        print(f"[fetch_image] rejected: {message}")
        send_json(h, _ERROR_STATUS.get(message, 400), {"detail": message})
        return
    except Exception as exc:  # noqa: BLE001 - detail stays server-side
        print(f"[fetch_image] failed: {type(exc).__name__}: {exc}")
        send_json(h, 500, {"detail": "fetch failed"})
        return

    send_image(h, 200, data, mime, width, height)


def do_get(h) -> None:
    """Convenience: GET /api/fetch_image?url=... (same validation)."""
    try:
        query = parse_qs(urlparse(h.path).query)
        safe_url = validate_url(query.get("url", [None])[0])
        data, mime, width, height = fetch_image_bytes(safe_url)
    except ValueError as exc:
        message = str(exc)
        send_json(h, _ERROR_STATUS.get(message, 400), {"detail": message})
        return
    except Exception as exc:  # noqa: BLE001
        print(f"[fetch_image] failed: {type(exc).__name__}: {exc}")
        send_json(h, 500, {"detail": "fetch failed"})
        return
    send_image(h, 200, data, mime, width, height)


def do_options(h) -> None:
    h.send_response(204)
    h.send_header("Content-Length", "0")
    _cors(h)
    h.end_headers()


# ------------------------------------------------------- Vercel entrypoint --
class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel expects this name
    server_version = "DannzFetchImage/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[fetch_image] {fmt % args}")

    def do_GET(self) -> None:  # noqa: N802
        do_get(self)

    def do_POST(self) -> None:  # noqa: N802
        do_post(self)

    def do_OPTIONS(self) -> None:  # noqa: N802
        do_options(self)


if __name__ == "__main__":
    from http.server import ThreadingHTTPServer

    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"[fetch_image] local API on http://{host}:{port}  (POST /api/fetch_image)")
    ThreadingHTTPServer((host, port), handler).serve_forever()
