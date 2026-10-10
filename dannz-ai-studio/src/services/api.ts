/**
 * Client for the Dannz background-removal API plus the local image pipeline
 * (background composite, resize, crop, format conversion) that runs on canvas.
 */

const API_BASE = '/api';
const UPLOAD_MAX_EDGE = 1600; // keeps Vercel Hobby well under its 4.5 MB body cap

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
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
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ApiError('Could not decode image'));
    if (typeof src === 'string') img.src = src;
    else img.src = URL.createObjectURL(src);
  });
}

function drawToBlob(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpg' | 'webp',
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ApiError('Canvas export failed'))),
      getMimeType(format),
      Math.min(1, Math.max(0.05, quality / 100))
    );
  });
}

export function getMimeType(format: string): string {
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

export async function measureBlob(blob: Blob): Promise<{ width: number; height: number }> {
  const img = await loadImage(blob);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Downscale a File/Blob so uploads stay small (Vercel Hobby caps at 4.5 MB).
 * Returns the original blob when it already fits.
 */
export async function prepareForUpload(blob: Blob, maxEdge = UPLOAD_MAX_EDGE): Promise<Blob> {
  const img = await loadImage(blob);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= maxEdge) {
    if (blob.size < 4 * 1024 * 1024) return blob;
  }
  const ratio = Math.min(maxEdge / img.naturalWidth, maxEdge / img.naturalHeight, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiError('Canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return drawToBlob(canvas, 'png', 100);
}

/* --------------------------------------------------------------------- API */

export async function checkApiHealth(timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function removeBackground(
  image: Blob,
  options: RemoveBgOptions = {},
  signal?: AbortSignal
): Promise<ProcessedBlob> {
  const form = new FormData();
  form.append('image', image, 'upload.png');
  if (options.model) form.append('model', options.model);
  if (options.maxSize) form.append('max_size', String(options.maxSize));
  if (options.alphaMatting) form.append('alpha_matting', 'true');
  if (options.fgThreshold) form.append('fg_threshold', String(options.fgThreshold));
  if (options.bgThreshold) form.append('bg_threshold', String(options.bgThreshold));
  if (options.erodeSize) form.append('erode_size', String(options.erodeSize));

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/remove_bg`, { method: 'POST', body: form, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Background removal API unreachable');
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
      model: response.headers.get('X-Model') || options.model || 'u2netp',
      ms: Number(response.headers.get('X-Processing-Time-Ms') || 0) / 1000,
      inputSize: response.headers.get('X-Input-Size') || '',
      outputSize: response.headers.get('X-Output-Size') || '',
      inputBytes: Number(response.headers.get('X-Input-Bytes') || image.size),
      outputBytes: Number(response.headers.get('X-Output-Bytes') || blob.size),
    },
  };
}

/* ------------------------------------------------------- local canvas ops */

/** Composite a transparent PNG over a solid colour. */
export async function applyBackgroundColor(
  image: Blob,
  color: string,
  format: 'png' | 'jpg' | 'webp',
  quality: number
): Promise<Blob> {
  if (color === 'transparent' && format === 'png') return image;
  const img = await loadImage(image);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiError('Canvas unavailable');
  if (color !== 'transparent') {
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
  maintainAspectRatio: boolean
): Promise<Blob> {
  const img = await loadImage(image);
  let targetW = width;
  let targetH = height;
  if (maintainAspectRatio) {
    const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    targetW = Math.max(1, Math.round(img.naturalWidth * ratio));
    targetH = Math.max(1, Math.round(img.naturalHeight * ratio));
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiError('Canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return drawToBlob(canvas, 'png', 100);
}

/** Centre-crop to a ratio such as '1:1' / '16:9'. */
export async function cropToRatio(image: Blob, ratio: string): Promise<Blob> {
  if (ratio === 'original') return image;
  const [rw, rh] = ratio.split(':').map(Number);
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
  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiError('Canvas unavailable');
  ctx.drawImage(img, offsetX, offsetY, cropW, cropH, 0, 0, cropW, cropH);
  return drawToBlob(canvas, 'png', 100);
}

/** Pure re-encode - used for format conversion and quality compression. */
export async function convertFormat(
  image: Blob,
  format: 'png' | 'jpg' | 'webp',
  quality: number
): Promise<Blob> {
  const img = await loadImage(image);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiError('Canvas unavailable');
  // JPEG/WebP have no alpha: flatten onto white when the source has one.
  if (format !== 'png') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  return drawToBlob(canvas, format, quality);
}

/** Rectangle in the image's own pixel space. */
export interface EraseRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Manual region erase: paints transparency over each rectangle.
 * `clearRect` zeroes the alpha channel, so the result stays a lossless RGBA PNG
 * that can still be composited or re-exported later.
 */
export async function eraseRegions(image: Blob, rects: EraseRect[]): Promise<Blob> {
  const safe = rects.filter((r) => r.width > 0 && r.height > 0);
  if (!safe.length) return image;

  const img = await loadImage(image);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiError('Canvas unavailable');
  ctx.drawImage(img, 0, 0);

  for (const r of safe) {
    const x = Math.max(0, Math.round(r.x));
    const y = Math.max(0, Math.round(r.y));
    const width = Math.min(canvas.width - x, Math.round(r.width));
    const height = Math.min(canvas.height - y, Math.round(r.height));
    if (width > 0 && height > 0) ctx.clearRect(x, y, width, height);
  }

  return drawToBlob(canvas, 'png', 100);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ApiError('Could not read blob'));
    reader.readAsDataURL(blob);
  });
}
