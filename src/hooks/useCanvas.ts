import { useState, useCallback, useRef, useEffect } from "react";
import { fabric } from "fabric";
import {
  ImageFile,
  ProcessedResult,
  Layer,
  ToolMode,
  BrushSettings,
  ShapeSettings,
  TextSettings,
  CropBox,
  BRUSH_PROFILES,
} from "../types";
import { generateId } from "../utils";

interface UseCanvasReturn {
  canvas: fabric.Canvas | null;
  initializeCanvas: (container: HTMLDivElement) => void;
  disposeCanvas: () => void;
  loadImage: (image: ImageFile | ProcessedResult) => Promise<void>;
  /** Register the callback that receives layer updates. */
  registerLayersListener: (
    listener: ((layers: Layer[]) => void) | null,
  ) => void;
  /** Register the bridge the panels use to mutate canvas objects. */
  registerCanvasBridge: (bridge: CanvasBridge | null) => void;
  setZoom: (zoom: number) => void;
  zoom: number;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportCanvas: (format: "png" | "jpg" | "webp", quality: number) => string;
  applyAdjustments: (adjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    hue: number;
    blur: number;
  }) => void;
  clearCanvas: () => void;
  applyCrop: () => void;
}

/** Panel -> canvas hooks registered by StudioContext. */
export interface CanvasBridge {
  remove: (ids: string[]) => void;
  reorder: (id: string, direction: "up" | "down") => void;
  toggleVisibility: (id: string) => void;
  setOpacity: (id: string, opacity: number) => void;
}

const DRAWING_TOOLS: ToolMode[] = ["brush", "eraser"];
const MAX_HISTORY = 50;

type WithCustom<T> = T & { id?: string; name?: string; blendMode?: string };

/**
 * fabric v5 does not know about our custom props, so every options object that
 * carries an id goes through here.
 */
function withId<T extends object>(options: T, id: string, name?: string): T {
  return Object.assign(options, { id, ...(name ? { name } : {}) });
}

/** Convert a fabric object into the Layer shape the panels consume. */
function toLayer(obj: fabric.Object): Layer {
  const custom = obj as WithCustom<fabric.Object>;
  const names: Record<string, string> = {
    rect: "Rectangle",
    ellipse: "Ellipse",
    circle: "Circle",
    line: "Line",
    "i-text": "Text",
    text: "Text",
    textbox: "Text",
    path: "Stroke",
    group: "Group",
    image: "Image",
  };
  return {
    id: custom.id || generateId(),
    name: custom.name || names[obj.type ?? ""] || "Object",
    type: obj.type === "image" ? "image" : "shape",
    visible: obj.visible !== false,
    opacity: obj.opacity ?? 1,
    data: obj.toObject() as unknown as string,
    blendMode: custom.blendMode,
  };
}

export function useCanvas(
  tool: ToolMode,
  brushSettings: BrushSettings,
  shapeSettings: ShapeSettings,
  textSettings: TextSettings,
  cropAspect: number | null,
  onCropBoxChange: (box: CropBox | null) => void,
): UseCanvasReturn {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [layerTick, setLayerTick] = useState(0);
  const historyRef = useRef<Record<string, unknown>[]>([]);
  const historyIndexRef = useRef(-1);
  const restoringRef = useRef(false);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  /** The canvas, readable inside callbacks without going stale. */
  const canvasLiveRef = useRef<fabric.Canvas | null>(null);
  const layersListenerRef = useRef<((layers: Layer[]) => void) | null>(null);
  const bridgeRef = useRef<CanvasBridge | null>(null);

  // Live copies so event handlers never read stale configuration.
  const toolRef = useRef(tool);
  const brushRef = useRef(brushSettings);
  const shapeRef = useRef(shapeSettings);
  const textRef = useRef(textSettings);
  const cropRectRef = useRef<fabric.Rect | null>(null);
  const cropAspectRef = useRef<number | null>(null);
  const onCropBoxChangeRef = useRef(onCropBoxChange);
  onCropBoxChangeRef.current = onCropBoxChange;
  toolRef.current = tool;
  brushRef.current = brushSettings;
  shapeRef.current = shapeSettings;
  textRef.current = textSettings;
  cropAspectRef.current = cropAspect;

  /* -------------------------------------------------------------- history */

  const saveToHistory = useCallback(() => {
    // Read the live canvas, not the `canvas` state: this callback is created
    // before the canvas exists, and capturing state here would freeze it at
    // null and make every later call a no-op.
    const target = canvasLiveRef.current;
    if (!target || restoringRef.current) return;
    const json = target.toJSON([
      "id",
      "name",
      "blendMode",
      "strokeGroup",
    ]) as Record<string, unknown>;
    historyRef.current = historyRef.current.slice(
      0,
      historyIndexRef.current + 1,
    );
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    setHistoryVersion((v) => v + 1);
  }, []);

  const emitLayers = useCallback(() => {
    const target = canvasLiveRef.current;
    if (!target || !layersListenerRef.current) return;
    layersListenerRef.current(target.getObjects().map(toLayer));
    setLayerTick((n) => n + 1);
  }, []);

  /* ------------------------------------------------------------ lifecycle */

  const initializeCanvas = useCallback(
    (container: HTMLDivElement) => {
      if (
        canvasElRef.current &&
        canvasElRef.current.parentElement === container
      )
        return;

      const canvasEl = document.createElement("canvas");
      canvasEl.className = "block h-full w-full touch-none";
      container.appendChild(canvasEl);
      canvasElRef.current = canvasEl;

      const fabricCanvas = new fabric.Canvas(canvasEl, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
        backgroundColor: "rgb(21, 23, 26)",
        selection: true,
        preserveObjectStacking: true,
        renderOnAddRemove: true,
      });

      const changed = () => {
        saveToHistory();
        emitLayers();
      };
      fabricCanvas.on("object:added", changed);
      fabricCanvas.on("object:removed", changed);
      fabricCanvas.on("object:modified", changed);

      fabricCanvas.on("mouse:wheel", (opt) => {
        const delta = opt.e.deltaY;
        const next = clamp(
          fabricCanvas.getZoom() * (delta > 0 ? 0.9 : 1.1),
          0.1,
          10,
        );
        fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, next);
        setZoom(next);
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      // Set the live ref synchronously so the handlers bound below (and every
      // later emitLayers/saveToHistory call) see the canvas immediately.
      canvasLiveRef.current = fabricCanvas;
      setCanvas(fabricCanvas);
      saveToHistory();
    },
    // Both callbacks now read the live ref, so this stays stable.
    [],
  );

  const disposeCanvas = useCallback(() => {
    if (canvas) {
      canvas.dispose();
      setCanvas(null);
    }
    if (canvasElRef.current?.parentElement) {
      canvasElRef.current.parentElement.removeChild(canvasElRef.current);
    }
    canvasElRef.current = null;
    canvasLiveRef.current = null;
    historyRef.current = [];
    historyIndexRef.current = -1;
  }, [canvas]);

  /* --------------------------------------------------------- brush engine */

  /**
   * Turn Fabric's single path into the textured stroke the active brush
   * profile asks for: several offset copies of the same path read as pencil
   * grain / marker bleed / airbrush haze instead of "one line of N pixels".
   */
  /**
   * Build the textured stroke the active brush profile asks for: several
   * offset copies of the same path read as pencil grain / marker bleed /
   * airbrush haze instead of "one line of N pixels".
   *
   * Returns an array of paths rather than a fabric.Group on purpose - groups
   * make fabric walk `object.group.getZoom()` while drawing borders, which
   * throws for freshly-created nested objects.
   */
  const buildBrushStroke = useCallback((path: fabric.Path): fabric.Object[] => {
    const settings = brushRef.current;
    const profile = BRUSH_PROFILES[settings.type] ?? BRUSH_PROFILES.brush;
    const width = Math.max(1, settings.size * profile.widthScale);
    const strokeId = generateId();

    const baseOptions = {
      strokeWidth: width,
      stroke: settings.color,
      strokeUniform: true,
      fill: "",
      opacity: settings.opacity,
      originX: path.originX,
      originY: path.originY,
      left: path.left ?? 0,
      top: path.top ?? 0,
      scaleX: path.scaleX,
      scaleY: path.scaleY,
    };

    if (profile.passes <= 1 && profile.jitter === 0) {
      path.set(baseOptions);
      Object.assign(path, {
        id: strokeId,
        name: "Stroke",
        strokeGroup: strokeId,
      });
      return [path];
    }

    const copies: fabric.Object[] = [];
    const seed = Math.random() * 1000;
    for (let pass = 0; pass < profile.passes; pass += 1) {
      const angle = seed + pass * 2.399;
      const spread = width * profile.jitter;
      const copy = new fabric.Path(path.path as unknown as string, {
        ...baseOptions,
        strokeWidth: Math.max(1, width * (1 - pass * 0.12)),
        opacity: Math.min(
          1,
          (settings.opacity * profile.alpha * 2.2) / profile.passes,
        ),
        left: (path.left ?? 0) + Math.cos(angle) * spread,
        top: (path.top ?? 0) + Math.sin(angle) * spread,
      });
      Object.assign(copy, {
        id: strokeId,
        name: "Stroke",
        strokeGroup: strokeId,
      });
      copies.push(copy);
    }
    return copies;
  }, []);

  /* --------------------------------------------------------- tool wiring */

  useEffect(() => {
    if (!canvas) return;

    const drawing = DRAWING_TOOLS.includes(tool);
    canvas.isDrawingMode = drawing;
    canvas.selection = !drawing;

    if (drawing) {
      const profile =
        BRUSH_PROFILES[brushSettings.type] ?? BRUSH_PROFILES.brush;
      canvas.freeDrawingBrush.color =
        tool === "eraser" ? "rgba(255,255,255,1)" : brushSettings.color;
      canvas.freeDrawingBrush.width = Math.max(
        1,
        brushSettings.size * (tool === "eraser" ? 1.2 : profile.widthScale),
      );
    }

    if (tool !== "crop" && cropRectRef.current) {
      canvas.remove(cropRectRef.current);
      cropRectRef.current = null;
      canvas.renderAll();
      onCropBoxChangeRef.current(null);
    }
  }, [canvas, tool, brushSettings, layerTick]);

  /* --------------------------------------------------- pointer behaviour */

  useEffect(() => {
    if (!canvas) return;

    const onPathCreated = (e: { path?: fabric.Path }) => {
      if (toolRef.current !== "brush" || !e.path) return;
      const built = buildBrushStroke(e.path);
      canvas.remove(e.path);
      built.forEach((obj) => canvas.add(obj));
      canvas.renderAll();
    };

    // Shape tool: press and drag to size.
    const onShapeDown = (opt: fabric.IEvent) => {
      if (toolRef.current !== "shape") return;
      const pointer = canvas.getPointer(opt.e);
      const s = shapeRef.current;
      const shapeId = generateId();
      const common = {
        left: pointer.x,
        top: pointer.y,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokeUniform: true,
        fill: s.fill === "none" ? "transparent" : s.fill,
      };
      let shape: fabric.Object;
      if (s.kind === "ellipse") {
        shape = withId(
          new fabric.Ellipse({ ...common, rx: 1, ry: 1 }),
          shapeId,
          s.kind,
        );
      } else if (s.kind === "line") {
        shape = withId(
          new fabric.Line(
            [pointer.x, pointer.y, pointer.x + 1, pointer.y + 1],
            {
              stroke: s.stroke,
              strokeWidth: s.strokeWidth,
              strokeUniform: true,
            },
          ),
          shapeId,
          "line",
        );
      } else {
        shape = withId(
          new fabric.Rect({ ...common, width: 1, height: 1 }),
          shapeId,
          s.kind,
        );
      }
      canvas.add(shape);
      canvas.setActiveObject(shape);
    };

    const onShapeMove = (opt: fabric.IEvent) => {
      if (toolRef.current !== "shape") return;
      const active = canvas.getActiveObject();
      if (
        !active ||
        (active as WithCustom<fabric.Object>).id === "crop-overlay"
      )
        return;
      const pointer = canvas.getPointer(opt.e);
      if (active instanceof fabric.Rect) {
        active.set({
          width: Math.max(4, Math.abs(pointer.x - (active.left ?? 0))),
          height: Math.max(4, Math.abs(pointer.y - (active.top ?? 0))),
        });
      } else if (active instanceof fabric.Ellipse) {
        active.set({
          rx: Math.max(2, Math.abs(pointer.x - (active.left ?? 0)) / 2),
          ry: Math.max(2, Math.abs(pointer.y - (active.top ?? 0)) / 2),
        });
      } else if (active instanceof fabric.Line) {
        active.set({ x2: pointer.x, y2: pointer.y });
      }
      canvas.renderAll();
    };

    // Text tool: click to place and start editing immediately.
    const onTextDown = (opt: fabric.IEvent) => {
      if (toolRef.current !== "text") return;
      const pointer = canvas.getPointer(opt.e);
      const s = textRef.current;
      const family =
        s.fontFamily === "display"
          ? "Oswald, Impact, sans-serif"
          : s.fontFamily === "mono"
            ? '"JetBrains Mono", monospace'
            : '"Barlow Condensed", sans-serif';
      const text = withId(
        new fabric.IText("Text", {
          left: pointer.x,
          top: pointer.y,
          fontFamily: family,
          fontSize: s.fontSize,
          fontWeight: String(s.fontWeight),
          fill: s.color,
          textAlign: s.align,
        }),
        generateId(),
        "Text",
      );
      canvas.add(text);
      canvas.setActiveObject(text);
      (text as fabric.IText).enterEditing();
      (text as fabric.IText).selectAll();
    };

    // Crop tool: drag a rectangle, then apply.
    const onCropDown = (opt: fabric.IEvent) => {
      if (cropRectRef.current) return;
      const pointer = canvas.getPointer(opt.e);
      const rect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 1,
        height: 1,
        fill: "rgba(214, 82, 58, 0.14)",
        stroke: "#D6523A",
        strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        strokeUniform: true,
        hasRotatingPoint: false,
      });
      Object.assign(rect, { id: "crop-overlay", name: "Crop" });
      rect.setControlsVisibility({
        mb: false,
        ml: false,
        mr: false,
        mt: false,
      });
      cropRectRef.current = rect;
      canvas.add(rect);
      canvas.setActiveObject(rect);
    };

    const onCropMove = (opt: fabric.IEvent) => {
      const rect = cropRectRef.current;
      if (!rect || toolRef.current !== "crop") return;
      const pointer = canvas.getPointer(opt.e);
      const aspect = cropAspectRef.current;
      let width = Math.abs(pointer.x - (rect.left ?? 0));
      let height = Math.abs(pointer.y - (rect.top ?? 0));
      if (aspect) {
        if (width / height > aspect) width = height * aspect;
        else height = width / aspect;
      }
      rect.set({ width: Math.max(4, width), height: Math.max(4, height) });
      canvas.renderAll();
      onCropBoxChangeRef.current({
        x: Math.round(rect.left ?? 0),
        y: Math.round(rect.top ?? 0),
        width: Math.round(width),
        height: Math.round(height),
      });
    };

    const onCropUp = () => {
      const rect = cropRectRef.current;
      if (!rect) return;
      if ((rect.width ?? 0) < 12 || (rect.height ?? 0) < 12) {
        canvas.remove(rect);
        cropRectRef.current = null;
        onCropBoxChangeRef.current(null);
        canvas.renderAll();
      }
    };

    canvas.on("path:created", onPathCreated as (e: unknown) => void);
    canvas.on("mouse:down", onShapeDown);
    canvas.on("mouse:down", onTextDown);
    canvas.on("mouse:move", onShapeMove);
    canvas.on("mouse:down", onCropDown);
    canvas.on("mouse:move", onCropMove);
    canvas.on("mouse:up", onCropUp);

    return () => {
      canvas.off("path:created", onPathCreated as (e: unknown) => void);
      canvas.off("mouse:down", onShapeDown);
      canvas.off("mouse:down", onTextDown);
      canvas.off("mouse:move", onShapeMove);
      canvas.off("mouse:down", onCropDown);
      canvas.off("mouse:move", onCropMove);
      canvas.off("mouse:up", onCropUp);
    };
  }, [canvas, buildBrushStroke]);

  const applyCrop = useCallback(() => {
    if (!canvas || !cropRectRef.current) return;
    const rect = cropRectRef.current;
    const box = {
      x: Math.round(rect.left ?? 0),
      y: Math.round(rect.top ?? 0),
      width: Math.round(rect.width ?? 0),
      height: Math.round(rect.height ?? 0),
    };
    canvas.remove(rect);
    cropRectRef.current = null;
    onCropBoxChangeRef.current(null);
    canvas.clipPath = new fabric.Rect({
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      absolutePositioned: true,
    });
    canvas.renderAll();
    saveToHistory();
    emitLayers();
  }, [canvas, emitLayers, saveToHistory]);

  /* --------------------------------------------------------------- bridge */

  const removeObjects = useCallback(
    (ids: string[]) => {
      if (!canvas) return;
      canvas
        .getObjects()
        .filter((o) => ids.includes((o as WithCustom<fabric.Object>).id ?? ""))
        .forEach((o) => canvas.remove(o));
      canvas.renderAll();
      emitLayers();
    },
    [canvas, emitLayers],
  );

  const reorderObject = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!canvas) return;
      const objects = canvas.getObjects();
      const index = objects.findIndex(
        (o) => (o as WithCustom<fabric.Object>).id === id,
      );
      if (index === -1) return;
      // Fabric paints later objects on top, so "up" in the panel = later index.
      const target = direction === "up" ? index + 1 : index - 1;
      if (target < 0 || target >= objects.length) return;
      objects[index].moveTo(target);
      canvas.renderAll();
      emitLayers();
    },
    [canvas, emitLayers],
  );

  const toggleObjectVisibility = useCallback(
    (id: string) => {
      if (!canvas) return;
      const obj = canvas
        .getObjects()
        .find((o) => (o as WithCustom<fabric.Object>).id === id);
      if (obj) {
        obj.visible = !obj.visible;
        canvas.renderAll();
        emitLayers();
      }
    },
    [canvas, emitLayers],
  );

  const setObjectOpacity = useCallback(
    (id: string, opacity: number) => {
      if (!canvas) return;
      const obj = canvas
        .getObjects()
        .find((o) => (o as WithCustom<fabric.Object>).id === id);
      if (obj) {
        obj.set({ opacity });
        canvas.renderAll();
        emitLayers();
      }
    },
    [canvas, emitLayers],
  );

  // Keep the published bridge pointing at the latest handlers.
  useEffect(() => {
    bridgeRef.current = {
      remove: removeObjects,
      reorder: reorderObject,
      toggleVisibility: toggleObjectVisibility,
      setOpacity: setObjectOpacity,
    };
  }, [removeObjects, reorderObject, toggleObjectVisibility, setObjectOpacity]);

  const registerLayersListener = useCallback(
    (listener: ((layers: Layer[]) => void) | null) => {
      layersListenerRef.current = listener;
    },
    [],
  );

  const registerCanvasBridge = useCallback((bridge: CanvasBridge | null) => {
    bridgeRef.current = bridge;
  }, []);

  /* ----------------------------------------------------------------- misc */

  const loadImage = useCallback(
    async (image: ImageFile | ProcessedResult) => {
      if (!canvas) return;
      const url =
        "resultDataUrl" in image ? image.resultDataUrl : image.dataUrl;
      const name = "originalName" in image ? image.originalName : image.name;
      await new Promise<void>((resolve) => {
        fabric.Image.fromURL(url, (img) => {
          const scale = Math.min(
            ((canvas.width ?? 800) * 0.9) / (img.width ?? 1),
            ((canvas.height ?? 600) * 0.9) / (img.height ?? 1),
            1,
          );
          img.scale(scale);
          Object.assign(img as WithCustom<fabric.Image>, {
            id: generateId(),
            name,
          });
          img.set({
            left: (canvas.width ?? 800) / 2,
            top: (canvas.height ?? 600) / 2,
            originX: "center",
            originY: "center",
          });
          canvas.clear();
          canvas.clipPath = undefined;
          cropRectRef.current = null;
          canvas.add(img);
          canvas.renderAll();
          saveToHistory();
          emitLayers();
          resolve();
        });
      });
    },
    [canvas, emitLayers, saveToHistory],
  );

  const setZoomState = useCallback(
    (next: number) => {
      if (!canvas) return;
      const clamped = clamp(next, 0.1, 10);
      canvas.zoomToPoint(
        { x: (canvas.width ?? 0) / 2, y: (canvas.height ?? 0) / 2 },
        clamped,
      );
      setZoom(clamped);
      canvas.renderAll();
    },
    [canvas],
  );

  const restore = useCallback(
    (json: Record<string, unknown>) => {
      const target = canvasLiveRef.current;
      if (!target) return;
      restoringRef.current = true;
      target.loadFromJSON(json, () => {
        target.renderAll();
        restoringRef.current = false;
        emitLayers();
        setHistoryVersion((v) => v + 1);
      });
    },
    [canvas, emitLayers],
  );

  const undo = useCallback(() => {
    if (!canvas || historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    restore(historyRef.current[historyIndexRef.current]);
  }, [canvas, restore]);

  const redo = useCallback(() => {
    if (!canvas || historyIndexRef.current >= historyRef.current.length - 1)
      return;
    historyIndexRef.current += 1;
    restore(historyRef.current[historyIndexRef.current]);
  }, [canvas, restore]);

  const exportCanvas = useCallback(
    (format: "png" | "jpg" | "webp", quality: number): string => {
      if (!canvas) return "";
      const mimeType =
        format === "jpg"
          ? "image/jpeg"
          : format === "webp"
            ? "image/webp"
            : "image/png";
      const dataUrl = canvas.toDataURL({
        format: mimeType,
        quality: quality / 100,
      });
      return dataUrl;
    },
    [canvas],
  );

  const applyAdjustments = useCallback(
    (adjustments: {
      brightness: number;
      contrast: number;
      saturation: number;
      hue: number;
      blur: number;
    }) => {
      if (!canvas) return;
      canvas.getObjects().forEach((obj) => {
        if (obj.type !== "image") return;
        const image = obj as fabric.Image;
        const filters: fabric.IBaseFilter[] = [];
        if (adjustments.brightness) {
          filters.push(
            new fabric.Image.filters.Brightness({
              brightness: adjustments.brightness / 100,
            }),
          );
        }
        if (adjustments.contrast) {
          filters.push(
            new fabric.Image.filters.Contrast({
              contrast: adjustments.contrast / 100,
            }),
          );
        }
        if (adjustments.saturation) {
          filters.push(
            new fabric.Image.filters.Saturation({
              saturation: adjustments.saturation / 100,
            }),
          );
        }
        if (adjustments.hue) {
          filters.push(
            new fabric.Image.filters.HueRotation({
              rotation: (adjustments.hue * Math.PI) / 180,
            }),
          );
        }
        if (adjustments.blur > 0) {
          filters.push(
            new fabric.Image.filters.Blur({ blur: adjustments.blur }),
          );
        }
        image.filters = filters;
        image.applyFilters();
      });
      canvas.renderAll();
    },
    [canvas],
  );

  const clearCanvas = useCallback(() => {
    if (!canvas) return;
    canvas.clear();
    canvas.clipPath = undefined;
    cropRectRef.current = null;
    canvas.renderAll();
    saveToHistory();
    emitLayers();
  }, [canvas, emitLayers, saveToHistory]);

  // Keep the canvas sized to its container.
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
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [canvas]);

  // historyVersion/layerTick force consumers to re-read undo availability.
  useEffect(() => {
    setZoom((z) => z);
  }, [historyVersion, layerTick]);

  return {
    canvas,
    initializeCanvas,
    disposeCanvas,
    loadImage,
    registerLayersListener,
    registerCanvasBridge,
    setZoom: setZoomState,
    zoom,
    undo,
    redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
    exportCanvas,
    applyAdjustments,
    clearCanvas,
    applyCrop,
  };
}

/* ---------------------------------------------------------------- helpers */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
