/**
 * Client for the Dannz background-removal API plus the local image pipeline
 * (background composite, resize, crop, format conversion, colour adjustments)
 * that runs on canvas.
 */

import type { ColorAdjustments } from "../types";

const API_BASE = "/api";
const UPLOAD_MAX_EDGE = 1600; // keeps Vercel Hobby well under its 4.5 MB body cap

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface RemoveBgOptions {
  model?: string;
  maxSize?: number;
  alphaMatting?: boolean;
  fgThreshold?: number;
  bgThreshold?: number;
  erodeSize?: number;
}

export interface RemoveBgMeta {
  model: string;
  ms: number;
  inputSize: string;
  outputSize: string;
  inputBytes: number;
  outputBytes: number;
}

export interface ProcessedBlob {
  blob: Blob;
  meta: RemoveBgMeta;
}

/* ------------------------------------------------------------------ utils */

function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ApiError("Could not decode image"));
    if (typeof src === "string") img.src = src;
    else img.src = URL.createObjectURL(src);
  });
}

function drawToBlob(
  canvas: HTMLCanvasElement,
  format: "png" | "jpg" | "webp",
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new ApiError("Canvas export failed")),
      getMimeType(format),
      Math.min(1, Math.max(0.05, quality / 100)),
    );
  });
}

export function getMimeType(format: string): string {
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

export async function measureBlob(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const img = await loadImage(blob);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Downscale a File/Blob so uploads stay small (Vercel Hobby caps at 4.5 MB).
 * Returns the original blob when it already fits.
 */
export async function prepareForUpload(
  blob: Blob,
  maxEdge = UPLOAD_MAX_EDGE,
): Promise<Blob> {
  const img = await loadImage(blob);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= maxEdge) {
    if (blob.size < 4 * 1024 * 1024) return blob;
  }
  const ratio = Math.min(
    maxEdge / img.naturalWidth,
    maxEdge / img.naturalHeight,
    1,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return drawToBlob(canvas, "png", 100);
}

/* --------------------------------------------------------------------- API */

/**
 * Download a remote image through our own API.
 *
 * A browser cannot read cross-origin responses unless the remote host sends
 * `Access-Control-Allow-Origin`, and most image hosts do not. The Python
 * endpoint (`POST /api/fetch_image`) fetches the bytes server-side - and
 * re-validates the URL (scheme, credentials, DNS range, size, real image
 * magic bytes) so the proxy stays a proxy and nothing more.
 *
 * `status === 0` means the API itself was unreachable, which is the caller's
 * signal to fall back to a direct browser fetch.
 */
export interface RemoteImage {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
}

export async function fetchRemoteImage(
  url: string,
  timeoutMs = 20000,
): Promise<RemoteImage> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(`${API_BASE}/fetch_image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Image fetch API unreachable", 0);
  } finally {
    clearTimeout(timer);
  }

  // 503 is the dev proxy's "API not running" answer (see vite.config.ts) and
  // is treated exactly like a network failure by the caller.
  if (response.status === 503) {
    throw new ApiError("Image fetch API unreachable", 0);
  }

  if (!response.ok) {
    let detail = `API error ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, response.status);
  }

  const blob = await response.blob();
  return {
    blob,
    contentType: blob.type || "image/png",
    width: Number(response.headers.get("X-Image-Width") || 0),
    height: Number(response.headers.get("X-Image-Height") || 0),
  };
}

export async function checkApiHealth(timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function removeBackground(
  image: Blob,
  options: RemoveBgOptions = {},
  signal?: AbortSignal,
): Promise<ProcessedBlob> {
  const form = new FormData();
  form.append("image", image, "upload.png");
  if (options.model) form.append("model", options.model);
  if (options.maxSize) form.append("max_size", String(options.maxSize));
  if (options.alphaMatting) form.append("alpha_matting", "true");
  if (options.fgThreshold)
    form.append("fg_threshold", String(options.fgThreshold));
  if (options.bgThreshold)
    form.append("bg_threshold", String(options.bgThreshold));
  if (options.erodeSize) form.append("erode_size", String(options.erodeSize));

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/remove_bg`, {
      method: "POST",
      body: form,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError("Background removal API unreachable");
  }

  if (!response.ok) {
    let detail = `API error ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, response.status);
  }

  const blob = await response.blob();
  return {
    blob,
    meta: {
      model: response.headers.get("X-Model") || options.model || "u2netp",
      ms: Number(response.headers.get("X-Processing-Time-Ms") || 0) / 1000,
      inputSize: response.headers.get("X-Input-Size") || "",
      outputSize: response.headers.get("X-Output-Size") || "",
      inputBytes: Number(response.headers.get("X-Input-Bytes") || image.size),
      outputBytes: Number(response.headers.get("X-Output-Bytes") || blob.size),
    },
  };
}

/* ------------------------------------------------------- local canvas ops */

/** Composite a transparent PNG over a solid colour. */
export async function applyBackgroundColor(
  image: Blob,
  color: string,
  format: "png" | "jpg" | "webp",
  quality: number,
): Promise<Blob> {
  if (color === "transparent" && format === "png") return image;
  const img = await loadImage(image);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");
  if (color !== "transparent") {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  return drawToBlob(canvas, format, quality);
}

/** Resize with optional aspect-ratio preservation (letterbox-free, exact fit). */
export async function resizeImage(
  image: Blob,
  width: number,
  height: number,
  maintainAspectRatio: boolean,
): Promise<Blob> {
  const img = await loadImage(image);
  let targetW = width;
  let targetH = height;
  if (maintainAspectRatio) {
    const ratio = Math.min(
      width / img.naturalWidth,
      height / img.naturalHeight,
    );
    targetW = Math.max(1, Math.round(img.naturalWidth * ratio));
    targetH = Math.max(1, Math.round(img.naturalHeight * ratio));
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return drawToBlob(canvas, "png", 100);
}

/** Centre-crop to a ratio such as '1:1' / '16:9'. */
export async function cropToRatio(image: Blob, ratio: string): Promise<Blob> {
  if (ratio === "original") return image;
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return image;
  const target = rw / rh;
  const img = await loadImage(image);
  let cropW = img.naturalWidth;
  let cropH = img.naturalHeight;
  if (img.naturalWidth / img.naturalHeight > target) {
    cropW = Math.round(img.naturalHeight * target);
  } else {
    cropH = Math.round(img.naturalWidth / target);
  }
  const offsetX = Math.round((img.naturalWidth - cropW) / 2);
  const offsetY = Math.round((img.naturalHeight - cropH) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");
  ctx.drawImage(img, offsetX, offsetY, cropW, cropH, 0, 0, cropW, cropH);
  return drawToBlob(canvas, "png", 100);
}

/** Pure re-encode - used for format conversion and quality compression. */
export async function convertFormat(
  image: Blob,
  format: "png" | "jpg" | "webp",
  quality: number,
): Promise<Blob> {
  const img = await loadImage(image);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");
  // JPEG/WebP have no alpha: flatten onto white when the source has one.
  if (format !== "png") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  return drawToBlob(canvas, format, quality);
}

/**
 * Build a CSS filter string for the adjustment stack.
 *
 * `sharpen` has no CSS equivalent, so it is folded into a small unsharp-style
 * pass by the caller (see applyColorFilters); everything else maps 1:1 to the
 * canvas `ctx.filter` grammar, which means the preview and the export share
 * the exact same maths.
 */
export function adjustmentsToFilter(adjustments: {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
}): string {
  const parts: string[] = [];
  if (adjustments.brightness)
    parts.push(`brightness(${1 + adjustments.brightness / 100})`);
  if (adjustments.contrast)
    parts.push(`contrast(${1 + adjustments.contrast / 100})`);
  if (adjustments.saturation)
    parts.push(`saturate(${Math.max(0, 1 + adjustments.saturation / 100)})`);
  if (adjustments.hue) parts.push(`hue-rotate(${adjustments.hue}deg)`);
  if (adjustments.blur) parts.push(`blur(${adjustments.blur / 4}px)`);
  return parts.length ? parts.join(" ") : "none";
}

/**
 * Apply the adjustment stack to an image and return a new blob.
 * Used for the live preview and for baking adjustments on export.
 *
 * `sharpen` has no CSS filter, so it uses a classic unsharp mask: draw a
 * blurred copy, then add the difference back at the requested strength.
 */
export async function applyColorFilters(
  image: Blob,
  adjustments: ColorAdjustments,
): Promise<Blob> {
  const img = await loadImage(image);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");

  ctx.filter = adjustmentsToFilter(adjustments);
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";

  const strength = Math.max(0, Math.min(1, adjustments.sharpen / 100));
  if (strength > 0) {
    const blurred = document.createElement("canvas");
    blurred.width = canvas.width;
    blurred.height = canvas.height;
    const bctx = blurred.getContext("2d");
    if (bctx) {
      // Blur the already-filtered canvas.
      bctx.filter = `blur(${Math.max(0.5, 2.4 - strength * 1.9)}px)`;
      bctx.drawImage(canvas, 0, 0);
      bctx.filter = "none";

      // high-pass = base - blurred, added back over the base.
      const base = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const blurData = bctx.getImageData(0, 0, canvas.width, canvas.height);
      const out = ctx.createImageData(canvas.width, canvas.height);
      const k = strength * 1.6;
      for (let i = 0; i < base.data.length; i += 4) {
        for (let c = 0; c < 3; c += 1) {
          const highPass = base.data[i + c] - blurData.data[i + c];
          out.data[i + c] = Math.max(
            0,
            Math.min(255, base.data[i + c] + highPass * k),
          );
        }
        out.data[i + 3] = base.data[i + 3];
      }
      ctx.putImageData(out, 0, 0);
    }
  }

  return drawToBlob(canvas, "png", 100);
}

/** Rectangle in the image's own pixel space. */
/**
 * Erase region in the image's own pixel space. Mirrors `Region` in
 * src/types so the panel and the engine speak the same shape.
 */
export interface EraseRect {
  id: string;
  kind?: "rect" | "stroke";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Normalised (0..1) polyline points for brush strokes. */
  points?: { x: number; y: number }[];
  /** Brush radius as a fraction of the image width. */
  radius?: number;
}

const SAFE_IMAGE_MIME =
  /^image\/(png|jpeg|jpg|webp|gif|bmp|x-icon|vnd\.microsoft\.icon)$/;

/**
 * Guard for data URLs that are stored or rendered. Rejects anything that is
 * not a raster image MIME type, so an SVG/HTML payload can never be smuggled
 * in through `blobToDataUrl`. Defence-in-depth for the (currently safe)
 * `<img src>` render path.
 */
export function isSafeImageDataUrl(value: string): boolean {
  if (typeof value !== "string" || !value.startsWith("data:")) return false;
  const comma = value.indexOf(",");
  if (comma === -1) return false;
  const meta = value.slice(5, comma);
  const mime = meta.split(";")[0].toLowerCase();
  const base64 = /;base64/i.test(meta);
  const payload = value.slice(comma + 1);
  if (!base64 || !/^[A-Za-z0-9+/=\s]*$/.test(payload)) return false;
  return SAFE_IMAGE_MIME.test(mime);
}

/**
 * Manual erase: paints transparency over every region.
 *
 * Rectangles are cleared as boxes. Brush strokes are cleared as a chain of
 * circles along the polyline (with interpolation between samples so a fast
 * drag cannot leave gaps), each scaled by the image width.
 *
 * `clearRect`/arc only zero the alpha channel, so the result stays a lossless
 * RGBA PNG that can still be composited or re-exported later.
 */
export async function eraseRegions(
  image: Blob,
  rects: EraseRect[],
): Promise<Blob> {
  const img = await loadImage(image);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("Canvas unavailable");
  ctx.drawImage(img, 0, 0);

  // Clamp every coordinate into the canvas and reject non-finite values.
  let applied = 0;
  for (const rect of rects) {
    const w = Number(rect.width);
    const h = Number(rect.height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) continue;

    // Brush strokes are validated by their points, not by their bounding box:
    // a perfectly vertical stroke has width 0 and a horizontal one height 0.
    if (rect.kind !== 'stroke' && (w <= 0 || h <= 0)) continue;

    if (rect.points && rect.points.length) {
      const radius = Math.max(1, (rect.radius ?? 0.02) * canvas.width);
      // Erase the ALPHA channel, not the pixels: filling normally would paint
      // the current fillStyle (black) instead of transparency.
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      let previous: { x: number; y: number } | null = null;
      for (const point of rect.points) {
        const px = point.x * canvas.width;
        const py = point.y * canvas.height;
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        if (previous) {
          const distance = Math.hypot(px - previous.x, py - previous.y);
          const steps = Math.max(1, Math.ceil(distance / (radius * 0.6)));
          for (let i = 1; i <= steps; i += 1) {
            const t = i / steps;
            ctx.moveTo(
              previous.x + (px - previous.x) * t + radius,
              previous.y + (py - previous.y) * t,
            );
            ctx.arc(
              previous.x + (px - previous.x) * t,
              previous.y + (py - previous.y) * t,
              radius,
              0,
              Math.PI * 2,
            );
          }
        } else {
          ctx.moveTo(px + radius, py);
          ctx.arc(px, py, radius, 0, Math.PI * 2);
        }
        previous = { x: px, y: py };
      }
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
      applied += 1;
      continue;
    }

    const x = Math.max(0, Math.min(canvas.width - 1, Math.round(rect.x)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.round(rect.y)));
    const width = Math.min(canvas.width - x, Math.round(w));
    const height = Math.min(canvas.height - y, Math.round(h));
    if (width > 0 && height > 0) {
      ctx.clearRect(x, y, width, height);
      applied += 1;
    }
  }

  if (applied === 0) return image;
  return drawToBlob(canvas, "png", 100);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ApiError("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}
