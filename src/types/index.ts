export interface ImageFile {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  width: number;
  height: number;
  format: 'png' | 'jpg' | 'webp';
}

export interface ProcessedResult {
  id: string;
  originalId: string;
  originalName: string;
  originalSize: number;
  resultSize: number;
  resultDataUrl: string;
  resultBlob: Blob;
  format: 'png' | 'jpg' | 'webp';
  processingTime: number;
  width: number;
  height: number;
  hasTransparency: boolean;
}

export interface ProcessingOptions {
  model: 'u2net' | 'isnet-general-use' | 'u2netp' | 'u2net_human_seg' | 'silueta';
  backgroundColor: 'transparent' | 'white' | 'black' | 'slate' | string;
  outputFormat: 'png' | 'jpg' | 'webp';
  quality: number;
  resizeEnabled: boolean;
  resizeWidth: number | null;
  resizeHeight: number | null;
  maintainAspectRatio: boolean;
  cropRatio: 'original' | '1:1' | '16:9' | '4:3' | '3:2';
  compressionLevel: number;
  maxSize: number;
  alphaMatting: boolean;
  fgThreshold: number;
  bgThreshold: number;
  erodeSize: number;
}

export interface ColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sharpen: number;
  exposure: number;
}

export interface Layer {
  id: string;
  name: string;
  type: 'image' | 'text' | 'shape' | 'adjustment';
  visible: boolean;
  opacity: number;
  data: string | null;
  adjustments?: ColorAdjustments;
  blendMode?: string;
}

export interface HistoryEntry {
  id: string;
  action: string;
  timestamp: number;
  data: unknown;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  options: Partial<ProcessingOptions>;
  adjustments: Partial<ColorAdjustments>;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export type ViewMode = 'single' | 'batch' | 'workspace';
export type ToolMode = 'select' | 'crop' | 'brush' | 'eraser' | 'text' | 'shape';

/**
 * Brush presets. Each one changes the stroke geometry, which is what makes a
 * brush feel like a brush rather than "a line of N pixels".
 */
export type BrushType = 'brush' | 'pen' | 'pencil' | 'marker' | 'airbrush';

export interface BrushSettings {
  size: number;
  opacity: number;
  color: string;
  /** Which brush preset is active - drives the stroke texture. */
  type: BrushType;
}

/** Stroke geometry per brush type. */
export const BRUSH_PROFILES: Record<
  BrushType,
  {
    label: string;
    /** Multiplies the requested size to get the drawn brush width. */
    widthScale: number;
    /** Number of parallel jittered strokes drawn per segment. */
    passes: number;
    /** Random offset of each pass, as a fraction of the width. */
    jitter: number;
    /** Alpha of the main stroke. */
    alpha: number;
    /** Taper the ends of a stroke (pen/pencil feel). */
    taper: boolean;
  }
> = {
  brush: { label: 'Brush', widthScale: 1, passes: 1, jitter: 0, alpha: 1, taper: false },
  pen: { label: 'Pen', widthScale: 0.45, passes: 1, jitter: 0, alpha: 1, taper: true },
  pencil: { label: 'Pencil', widthScale: 0.3, passes: 5, jitter: 0.55, alpha: 0.22, taper: false },
  marker: { label: 'Marker', widthScale: 1.6, passes: 1, jitter: 0.04, alpha: 0.38, taper: false },
  airbrush: { label: 'Airbrush', widthScale: 2.4, passes: 3, jitter: 0.7, alpha: 0.14, taper: false },
};

export interface ShapeSettings {
  kind: 'rect' | 'ellipse' | 'line' | 'arrow';
  fill: string | 'none';
  stroke: string;
  strokeWidth: number;
}

export interface TextSettings {
  fontFamily: 'display' | 'ui' | 'mono';
  fontSize: number;
  fontWeight: 400 | 700;
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A user-drawn erase rectangle (coordinates in the image's own pixel space). */
/**
 * A manual erase region in the image's own pixel space.
 *
 * Two shapes are supported:
 *  - `rect`   - the classic drag a box (x/y/width/height)
 *  - `stroke` - a freehand brush: an ordered polyline plus a radius, which is
 *               what feels natural for cleaning up leftovers on a cut-out
 */
export interface Region {
  id: string;
  /** Brush strokes are the default; rect stays available for rough blocks. */
  kind?: 'rect' | 'stroke';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Normalised (0..1) polyline points, so a stroke survives any resize. */
  points?: { x: number; y: number }[];
  /** Brush radius as a fraction of the image width. */
  radius?: number;
}

export const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  model: 'u2netp',
  backgroundColor: 'transparent',
  outputFormat: 'png',
  quality: 90,
  resizeEnabled: false,
  resizeWidth: null,
  resizeHeight: null,
  maintainAspectRatio: true,
  cropRatio: 'original',
  compressionLevel: 85,
  maxSize: 1600,
  alphaMatting: false,
  fgThreshold: 240,
  bgThreshold: 10,
  erodeSize: 10,
};

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
  sharpen: 0,
  exposure: 0,
};

/**
 * Swatch values for the custom-colour picker.
 *
 * `transparent` is not a valid value for `<input type="color">` (the browser
 * rejects anything that is not a 7-digit hex), so it maps to white: the
 * picker is only a convenience for choosing a solid colour, and the actual
 * transparent option lives in the dropdown above it.
 */
export const BACKGROUND_COLORS: Record<string, string> = {
  transparent: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  slate: '#708090',
};

export const PRESETS: Preset[] = [
  {
    id: 'product-photo',
    name: 'Product Photo',
    description: 'Optimized for e-commerce product images',
    options: { model: 'u2net', backgroundColor: 'white', outputFormat: 'jpg', quality: 95 },
    adjustments: { contrast: 5, brightness: 3, saturation: -5 },
  },
  {
    id: 'portrait',
    name: 'Portrait',
    description: 'Best for portraits and people photography',
    options: { model: 'isnet-general-use', backgroundColor: 'transparent', outputFormat: 'png', quality: 95 },
    adjustments: { brightness: 5, saturation: -3, sharpen: 2 },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon-lit cyberpunk aesthetic',
    options: { model: 'u2netp', backgroundColor: 'black', outputFormat: 'png', quality: 90 },
    adjustments: { contrast: 15, saturation: 20, hue: -30, brightness: 5 },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Film-like color grading',
    options: { model: 'u2net', backgroundColor: 'transparent', outputFormat: 'png', quality: 95 },
    adjustments: { contrast: 8, saturation: -10, brightness: 3, sharpen: 1 },
  },
  {
    id: 'clean-web',
    name: 'Clean Web',
    description: 'Perfect for web graphics and icons',
    options: { model: 'u2netp', backgroundColor: 'transparent', outputFormat: 'png', quality: 100 },
    adjustments: { contrast: 5, brightness: 2 },
  },
];

export const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
export const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];