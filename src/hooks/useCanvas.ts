import { useState, useCallback, useRef, useEffect } from 'react';
import { fabric } from 'fabric';
import {
  ImageFile,
  ProcessedResult,
  Layer,
  ToolMode,
  BrushSettings,
  ColorAdjustments,
  CropBox,
} from '../types';
import { generateId } from '../utils';

interface UseCanvasReturn {
  canvas: fabric.Canvas | null;
  canvasElRef: React.RefObject<HTMLCanvasElement>;
  initializeCanvas: (container: HTMLDivElement) => void;
  disposeCanvas: () => void;
  loadImage: (image: ImageFile | ProcessedResult) => Promise<void>;
  addLayer: (layer: Omit<Layer, 'id'>) => string;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  getLayers: () => Layer[];
  setToolMode: (mode: ToolMode) => void;
  toolMode: ToolMode;
  brushSettings: BrushSettings;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setZoom: (zoom: number) => void;
  zoom: number;
  pan: (deltaX: number, deltaY: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportCanvas: (format: 'png' | 'jpg' | 'webp', quality: number) => string;
  applyAdjustments: (adjustments: ColorAdjustments) => void;
  cropToSelection: (box: CropBox) => void;
  clearCanvas: () => void;
}

/** fabric v5 does not type custom props - narrow them explicitly. */
interface CustomProps {
  id?: string;
  name?: string;
  blendMode?: string;
}

type WithCustom<T> = T & CustomProps;

const DRAWING_TOOLS: ToolMode[] = ['brush', 'eraser'];
const EXTRA_PROPS = ['id', 'name', 'blendMode'];
const MAX_HISTORY = 50;

export function useCanvas(): UseCanvasReturn {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [toolMode, setToolModeState] = useState<ToolMode>('select');
  const [brushSettings, setBrushSettingsState] = useState<BrushSettings>({
    size: 20,
    opacity: 1,
    color: '#000000',
    hardness: 0.5,
    flow: 1,
  });
  const [zoom, setZoom] = useState(1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyRef = useRef<Record<string, unknown>[]>([]);
  const historyIndexRef = useRef(-1);
  const restoringRef = useRef(false);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const saveToHistory = useCallback(() => {
    if (!canvas || restoringRef.current) return;
    const json = canvas.toJSON(EXTRA_PROPS) as Record<string, unknown> | undefined;
    if (!json) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    setHistoryVersion((v) => v + 1);
  }, [canvas]);

  const initializeCanvas = useCallback(
    (container: HTMLDivElement) => {
      if (canvasElRef.current && canvasElRef.current.parentElement === container) return;

      const canvasEl = document.createElement('canvas');
      canvasEl.className = 'block h-full w-full touch-none';
      container.appendChild(canvasEl);
      canvasElRef.current = canvasEl;

      const fabricCanvas = new fabric.Canvas(canvasEl, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
        backgroundColor: 'rgb(21, 23, 26)',
        selection: true,
        preserveObjectStacking: true,
        renderOnAddRemove: true,
      });

      fabricCanvas.on('object:added', () => saveToHistory());
      fabricCanvas.on('object:removed', () => saveToHistory());
      fabricCanvas.on('object:modified', () => saveToHistory());

      fabricCanvas.on('mouse:wheel', (opt) => {
        const delta = opt.e.deltaY;
        const zoomFactor = delta > 0 ? 0.9 : 1.1;
        const newZoom = clamp(fabricCanvas.getZoom() * zoomFactor, 0.1, 10);
        fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, newZoom);
        setZoom(newZoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      setCanvas(fabricCanvas);
      saveToHistory();
    },
    [saveToHistory]
  );

  const disposeCanvas = useCallback(() => {
    if (canvas) {
      canvas.dispose();
      setCanvas(null);
    }
    if (canvasElRef.current && canvasElRef.current.parentElement) {
      canvasElRef.current.parentElement.removeChild(canvasElRef.current);
    }
    canvasElRef.current = null;
    historyRef.current = [];
    historyIndexRef.current = -1;
  }, [canvas]);

  const setToolMode = useCallback(
    (mode: ToolMode) => {
      setToolModeState(mode);
      if (!canvas) return;
      const drawing = DRAWING_TOOLS.includes(mode);
      canvas.isDrawingMode = drawing;
      if (drawing) {
        canvas.freeDrawingBrush.color =
          mode === 'eraser' ? 'rgba(255,255,255,1)' : brushSettings.color;
        canvas.freeDrawingBrush.width = brushSettings.size;
        canvas.selection = !drawing;
      } else {
        canvas.selection = true;
      }
    },
    [canvas, brushSettings]
  );

  const setBrushSettings = useCallback(
    (settings: Partial<BrushSettings>) => {
      setBrushSettingsState((prev) => {
        const next = { ...prev, ...settings };
        if (canvas && DRAWING_TOOLS.includes(toolMode)) {
          canvas.freeDrawingBrush.color =
            toolMode === 'eraser' ? 'rgba(255,255,255,1)' : next.color;
          canvas.freeDrawingBrush.width = next.size;
        }
        return next;
      });
    },
    [canvas, toolMode]
  );

  const loadImage = useCallback(
    async (image: ImageFile | ProcessedResult) => {
      if (!canvas) return;
      const url = 'resultDataUrl' in image ? image.resultDataUrl : image.dataUrl;
      const name = 'originalName' in image ? image.originalName : image.name;
      await new Promise<void>((resolve) => {
        fabric.Image.fromURL(url, (img) => {
          const scale = Math.min(
            ((canvas.width ?? 800) * 0.9) / (img.width ?? 1),
            ((canvas.height ?? 600) * 0.9) / (img.height ?? 1),
            1
          );
          img.scale(scale);
          Object.assign(img as WithCustom<fabric.Image>, { id: generateId(), name });
          img.set({
            left: (canvas.width ?? 800) / 2,
            top: (canvas.height ?? 600) / 2,
            originX: 'center',
            originY: 'center',
          });
          canvas.clear();
          canvas.add(img);
          canvas.renderAll();
          saveToHistory();
          resolve();
        });
      });
    },
    [canvas, saveToHistory]
  );

  const addLayer = useCallback(
    (layer: Omit<Layer, 'id'>): string => {
      const id = generateId();
      saveToHistory();
      return id || layer.name || 'layer';
    },
    [saveToHistory]
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as WithCustom<fabric.Object>).id === layerId);
      if (obj) {
        canvas.remove(obj);
        canvas.renderAll();
      }
    },
    [canvas]
  );

  const updateLayer = useCallback(
    (layerId: string, updates: Partial<Layer>) => {
      if (!canvas) return;
      const obj = canvas.getObjects().find(
        (o) => (o as WithCustom<fabric.Object>).id === layerId
      );
      if (obj) {
        Object.assign(obj, updates);
        canvas.renderAll();
      }
    },
    [canvas]
  );

  const getLayers = useCallback((): Layer[] => {
    if (!canvas) return [];
    return canvas.getObjects().map((obj) => {
      const custom = obj as WithCustom<fabric.Object>;
      return {
        id: custom.id || generateId(),
        name: custom.name || 'Layer',
        type: 'image' as const,
        visible: obj.visible !== false,
        opacity: obj.opacity ?? 1,
        data: (obj.toObject() as Record<string, unknown>) as unknown as string,
        blendMode: custom.blendMode,
      };
    });
  }, [canvas]);

  const setZoomState = useCallback(
    (newZoom: number) => {
      if (!canvas) return;
      const clampedZoom = clamp(newZoom, 0.1, 10);
      canvas.zoomToPoint({ x: (canvas.width ?? 0) / 2, y: (canvas.height ?? 0) / 2 }, clampedZoom);
      setZoom(clampedZoom);
      canvas.renderAll();
    },
    [canvas]
  );

  const pan = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!canvas) return;
      const vpt = canvas.viewportTransform;
      if (vpt) {
        vpt[4] = (vpt[4] ?? 0) + deltaX;
        vpt[5] = (vpt[5] ?? 0) + deltaY;
        canvas.setViewportTransform(vpt);
        canvas.renderAll();
      }
    },
    [canvas]
  );

  const restoreState = useCallback(
    (json: Record<string, unknown>) => {
      if (!canvas) return;
      restoringRef.current = true;
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
        restoringRef.current = false;
        setHistoryVersion((v) => v + 1);
      });
    },
    [canvas]
  );

  const undo = useCallback(() => {
    if (!canvas || historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    restoreState(historyRef.current[historyIndexRef.current]);
  }, [canvas, restoreState]);

  const redo = useCallback(() => {
    if (!canvas || historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    restoreState(historyRef.current[historyIndexRef.current]);
  }, [canvas, restoreState]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const exportCanvas = useCallback(
    (format: 'png' | 'jpg' | 'webp', quality: number): string => {
      if (!canvas) return '';
      const mimeType =
        format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      return canvas.toDataURL({ format: mimeType, quality: quality / 100 });
    },
    [canvas]
  );

  const applyAdjustments = useCallback(
    (adjustments: ColorAdjustments) => {
      if (!canvas) return;
      const objects = canvas.getObjects();
      objects.forEach((obj) => {
        if (obj.type === 'image') {
          const image = obj as fabric.Image;
          const filters: fabric.IBaseFilter[] = [];
          if (adjustments.brightness !== 0) {
            filters.push(
              new fabric.Image.filters.Brightness({ brightness: adjustments.brightness / 100 })
            );
          }
          if (adjustments.contrast !== 0) {
            filters.push(
              new fabric.Image.filters.Contrast({ contrast: adjustments.contrast / 100 })
            );
          }
          if (adjustments.saturation !== 0) {
            filters.push(
              new fabric.Image.filters.Saturation({ saturation: adjustments.saturation / 100 })
            );
          }
          if (adjustments.hue !== 0) {
            filters.push(
              new fabric.Image.filters.HueRotation({
                rotation: (adjustments.hue * Math.PI) / 180,
              })
            );
          }
          if (adjustments.blur > 0) {
            filters.push(new fabric.Image.filters.Blur({ blur: adjustments.blur }));
          }
          image.filters = filters;
          image.applyFilters();
        }
      });
      canvas.renderAll();
    },
    [canvas]
  );

  const cropToSelection = useCallback(
    (box: CropBox) => {
      if (!canvas) return;
      canvas.clipPath = new fabric.Rect({
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        absolutePositioned: true,
      });
      canvas.renderAll();
      saveToHistory();
    },
    [canvas, saveToHistory]
  );

  const clearCanvas = useCallback(() => {
    if (!canvas) return;
    canvas.clear();
    canvas.renderAll();
    saveToHistory();
  }, [canvas, saveToHistory]);

  // Keep canvas sized to its container on window resize
  useEffect(() => {
    if (!canvas) return;
    const onResize = () => {
      const parent = canvasElRef.current?.parentElement;
      if (!parent) return;
      canvas.setDimensions({
        width: parent.clientWidth,
        height: parent.clientHeight,
      });
      canvas.renderAll();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [canvas]);

  // historyVersion forces consumers to re-render when undo/redo changes
  useEffect(() => {
    setZoom((z) => z);
  }, [historyVersion]);

  return {
    canvas,
    canvasElRef,
    initializeCanvas,
    disposeCanvas,
    loadImage,
    addLayer,
    removeLayer,
    updateLayer,
    getLayers,
    setToolMode,
    toolMode,
    brushSettings,
    setBrushSettings,
    setZoom: setZoomState,
    zoom,
    pan,
    undo,
    redo,
    canUndo,
    canRedo,
    exportCanvas,
    applyAdjustments,
    cropToSelection,
    clearCanvas,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
