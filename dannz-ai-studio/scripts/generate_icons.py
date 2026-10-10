#!/usr/bin/env python3
"""
Dannz AI Studio - brand asset generator (standard library only).

Renders the brand mark (gradient rounded tile + white target reticle) and
writes every icon the app and PWA need:

    public/favicon.svg
    public/favicon.ico              (16 / 32 / 48 multi-size)
    public/apple-touch-icon.png     (180x180)
    public/icon-192.png
    public/icon-512.png
    public/icon-192-maskable.png
    public/icon-512-maskable.png

Usage:  python scripts/generate_icons.py
"""

import math
import os
import struct
import zlib

# ---------------------------------------------------------------- constants
BRAND_STOPS = [
    (0.00, (214, 82, 58)),    # #D6523A
    (0.50, (232, 107, 85)),   # #E86B55
    (1.00, (245, 158, 11)),   # #F59E0B
]
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")

# Supersampling factor for smooth edges on small sizes.
SS = 4


def lerp(a, b, t):
    return a + (b - a) * t


def gradient(x, y, size):
    """Diagonal gradient across the tile."""
    t = (x + y) / max(1, 2 * (size - 1))
    for i in range(len(BRAND_STOPS) - 1):
        t0, c0 = BRAND_STOPS[i]
        t1, c1 = BRAND_STOPS[i + 1]
        if t0 <= t <= t1:
            local = (t - t0) / (t1 - t0)
            return (
                round(lerp(c0[0], c1[0], local)),
                round(lerp(c0[1], c1[1], local)),
                round(lerp(c0[2], c1[2], local)),
            )
    return BRAND_STOPS[-1][1]


def rounded_rect_inside(x, y, size, radius):
    """True when (x, y) lies inside the rounded rectangle."""
    cx = min(max(x, radius), size - 1 - radius)
    cy = min(max(y, radius), size - 1 - radius)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= radius * radius


def ring_alpha(x, y, size, radius, width, dash_on, dash_off, phase=0.0):
    """Coverage of a dashed ring centred at the tile middle."""
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    dx = x - cx
    dy = y - cy
    dist = math.hypot(dx, dy)
    half = width / 2.0
    if abs(dist - radius) > half:
        return 0.0
    edge = 1.0 - (abs(dist - radius) / half)  # soft edge
    angle = math.atan2(dy, dx) + phase
    period = dash_on + dash_off
    pos = ((angle + math.pi) / (2 * math.pi)) * 2 * math.pi * radius
    pos = pos % period
    return edge if pos <= dash_on else 0.0


def cross_alpha(x, y, size, arm, thickness):
    """Coverage of the plus-shaped reticle centre."""
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    dx = abs(x - cx)
    dy = abs(y - cy)
    if dx <= thickness / 2.0 and dy <= arm:
        return 1.0
    if dy <= thickness / 2.0 and dx <= arm:
        return 1.0
    return 0.0


def core_alpha(x, y, size, radius):
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    return max(0.0, 1.0 - math.hypot(x - cx, y - cy) / radius)


def render_tile(size, maskable=False, supersample=SS):
    """Render RGBA pixel data (bytes) for one icon size."""
    w = size * supersample
    total = w * w
    out = bytearray(total * 4)

    corner_radius = 0.0 if maskable else size * 0.1875
    # Glyph proportions follow the 64x64 source logo.
    scale = size / 64.0
    arm = 20 * scale
    thickness = 2.6 * scale
    ring_radius = 18 * scale
    ring_width = 1.6 * scale
    core_radius = 4.2 * scale
    # Maskable icons keep the glyph inside the 80% safe zone.
    glyph_scale = 0.62 if maskable else 1.0

    for j in range(w):
        y = j / supersample
        for i in range(w):
            x = i / supersample
            idx = (j * w + i) * 4

            inside = True if maskable else rounded_rect_inside(x, y, size, corner_radius)
            if not inside:
                out[idx + 3] = 0
                continue

            r, g, b = gradient(x, y, size)

            # Glyph space: scale about the centre for maskables.
            gx = (size - 1) / 2.0 + (x - (size - 1) / 2.0) / (glyph_scale if maskable else 1.0)
            gy = (size - 1) / 2.0 + (y - (size - 1) / 2.0) / (glyph_scale if maskable else 1.0)

            a_cross = cross_alpha(gx, gy, size, arm, thickness)
            a_ring = ring_alpha(
                gx, gy, size, ring_radius, ring_width,
                dash_on=8 * scale, dash_off=4 * scale,
            )
            a_core = core_alpha(gx, gy, size, core_radius)

            cover = min(1.0, a_cross + a_ring + min(1.0, a_core * 1.4))
            if cover > 0:
                r = lerp(r, 255, cover * 0.96)
                g = lerp(g, 255, cover * 0.96)
                b = lerp(b, 255, cover * 0.96)

            out[idx] = int(round(r))
            out[idx + 1] = int(round(g))
            out[idx + 2] = int(round(b))
            out[idx + 3] = 255

    # Box-filter downsample.
    if supersample == 1:
        return bytes(out)
    final = bytearray(size * size * 4)
    area = supersample * supersample
    for j in range(size):
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(supersample):
                for si in range(supersample):
                    src = (((j * supersample + sj) * w) + (i * supersample + si)) * 4
                    for k in range(4):
                        acc[k] += out[src + k]
            dst = (j * size + i) * 4
            for k in range(4):
                final[dst + k] = int(round(acc[k] / area))
    return bytes(final)


# ------------------------------------------------------------- PNG/ICO IO
def write_png(path, width, height, rgba):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(
        b"\x00" + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height)
    )
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


def write_ico(path, entries):
    """entries: list of (size, png_bytes). PNG-in-ICO keeps it dependency-free."""
    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    dir_bytes = b""
    data_bytes = b""
    for size, png in entries:
        dim = size if size < 256 else 0
        dir_bytes += struct.pack(
            "<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset
        )
        data_bytes += png
        offset += len(png)
    with open(path, "wb") as fh:
        fh.write(header + dir_bytes + data_bytes)


FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="dz" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#D6523A"/>
      <stop offset=".5" stop-color="#E86B55"/>
      <stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="url(#dz)"/>
  <path d="M32 12v40M12 32h40" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".95"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="8 4" opacity=".85"/>
  <circle cx="32" cy="32" r="4.2" fill="#fff"/>
</svg>
"""


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Rendering brand icons ...")
    png_cache = {}

    def png_for(size, maskable=False):
        key = (size, maskable)
        if key not in png_cache:
            import io

            rgba = render_tile(size, maskable=maskable)
            buf = io.BytesIO()
            # write via temp file to reuse write_png
            tmp = os.path.join(OUTPUT_DIR, f".tmp_{size}_{maskable}.png")
            write_png(tmp, size, size, rgba)
            with open(tmp, "rb") as fh:
                png_cache[key] = fh.read()
            os.remove(tmp)
        return png_cache[key]

    # Standard icons
    for size in (192, 512):
        with open(os.path.join(OUTPUT_DIR, f"icon-{size}.png"), "wb") as fh:
            fh.write(png_for(size))
        print(f"  icon-{size}.png")

    for size in (192, 512):
        with open(os.path.join(OUTPUT_DIR, f"icon-{size}-maskable.png"), "wb") as fh:
            fh.write(png_for(size, maskable=True))
        print(f"  icon-{size}-maskable.png")

    with open(os.path.join(OUTPUT_DIR, "apple-touch-icon.png"), "wb") as fh:
        fh.write(png_for(180))
    print("  apple-touch-icon.png")

    write_ico(
        os.path.join(OUTPUT_DIR, "favicon.ico"),
        [(16, png_for(16)), (32, png_for(32)), (48, png_for(48))],
    )
    print("  favicon.ico")

    with open(os.path.join(OUTPUT_DIR, "favicon.svg"), "w", encoding="utf-8") as fh:
        fh.write(FAVICON_SVG)
    print("  favicon.svg")

    print(f"Done -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
