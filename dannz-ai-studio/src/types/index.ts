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

export interface BrushSettings {
  size: number;
  opacity: number;
  color: string;
  hardness: number;
  flow: number;
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A user-drawn erase rectangle (coordinates in the image's own pixel space). */
export interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

export const BACKGROUND_COLORS: Record<string, string> = {
  transparent: 'transparent',
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