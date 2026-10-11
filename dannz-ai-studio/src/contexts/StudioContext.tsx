import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ColorAdjustments,
  CropBox,
  Region,
  BrushSettings,
  ShapeSettings,
  TextSettings,
  DEFAULT_COLOR_ADJUSTMENTS,
  DEFAULT_PROCESSING_OPTIONS,
  HistoryEntry,
  ImageFile,
  Layer,
  Preset,
  ProcessedResult,
  ProcessingOptions,
  ToolMode,
  ViewMode,
  PRESETS,
} from "../types";
import {
  generateId,
  formatBytes,
  formatTime,
  sanitizeFilename,
  blobToDataUrl,
  dataUrlToBlob,
  isSupportedFormat,
} from "../utils";
import { progressStore, type ProcessingProgress } from "../utils/progress";
import { toastStore } from "../utils/toast";
import { storage } from "../utils/storage";
import {
  ApiError,
  applyBackgroundColor,
  applyColorFilters,
  checkApiHealth,
  convertFormat,
  cropToRatio,
  eraseRegions,
  fetchRemoteImage,
  isSafeImageDataUrl,
  measureBlob,
  prepareForUpload,
  removeBackground,
  resizeImage,
} from "../services/api";
import { createZip, downloadBlob } from "../services/zip";

export type QueueStatus = "pending" | "processing" | "done" | "failed";

/** Refuse obviously oversized files before spending memory decoding them. */
const MAX_CLIENT_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Models a default API instance will accept. Larger weights are opt-in
 * server-side (ALLOW_HEAVY_MODELS=1), so the client treats anything outside
 * this list as unavailable and falls back to the default model.
 */
const LIGHT_MODELS: ProcessingOptions["model"][] = [
  "u2netp",
  "silueta",
  "u2net_human_seg",
];

const NAMED_BACKGROUNDS = ["transparent", "white", "black", "slate"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Force persisted options back into a valid range.
 *
 * Options written by an older build (or a manual edit) can carry values that
 * silently change the output - e.g. a white background plus a JPEG format,
 * which turns a transparent cutout into an opaque white image. Anything
 * unexpected falls back to the transparent/PNG default.
 */
function normalizeOptions(options: ProcessingOptions): ProcessingOptions {
  const defaults = DEFAULT_PROCESSING_OPTIONS;
  const bg = String(options.backgroundColor ?? "").toLowerCase();
  const isNamed = NAMED_BACKGROUNDS.includes(bg);
  const isHex = HEX_COLOR.test(bg);

  return {
    ...options,
    model: LIGHT_MODELS.includes(options.model)
      ? options.model
      : defaults.model,
    backgroundColor: isNamed || isHex ? bg : "transparent",
    outputFormat: (["png", "jpg", "webp"] as const).includes(
      options.outputFormat,
    )
      ? options.outputFormat
      : "png",
    quality: clampNumber(options.quality, 10, 100, 90),
    maxSize: clampNumber(options.maxSize, 160, 4000, 1600),
    fgThreshold: clampNumber(options.fgThreshold, 0, 255, 240),
    bgThreshold: clampNumber(options.bgThreshold, 0, 255, 10),
    erodeSize: clampNumber(options.erodeSize, 0, 40, 10),
    resizeWidth: options.resizeEnabled ? options.resizeWidth : null,
    resizeHeight: options.resizeEnabled ? options.resizeHeight : null,
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

interface StudioContextValue {
  // view
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // data
  files: ImageFile[];
  results: ProcessedResult[];
  activeFile: ImageFile | null;
  activeFileId: string | null;
  activeResult: ProcessedResult | null;
  setActiveFileId: (id: string) => void;
  setActiveResultId: (id: string) => void;

  // options
  options: ProcessingOptions;
  setOptions: (patch: Partial<ProcessingOptions>) => void;
  resetOptions: () => ProcessingOptions;
  adjustments: ColorAdjustments;
  setAdjustments: (patch: Partial<ColorAdjustments>) => void;
  applyPreset: (preset: Preset) => void;
  presets: Preset[];

  // processing
  progress: ProcessingProgress;
  isProcessing: boolean;
  apiOnline: boolean | null;
  setApiOnline: (online: boolean | null) => void;
  checkApi: () => Promise<void>;
  cancelProcessing: () => void;

  // queue
  queueStatus: Record<string, QueueStatus>;

  // actions
  addFiles: (incoming: File[], autoProcess?: boolean) => Promise<void>;
  addFromUrl: (url: string) => Promise<void>;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  processActive: () => Promise<ProcessedResult | null>;
  processBatch: () => Promise<void>;
  downloadResult: (id: string) => Promise<void>;
  downloadAllZip: () => Promise<void>;

  // history
  history: HistoryEntry[];
  clearHistory: () => void;

  // manual region erase
  regions: Region[];
  addRegion: (rect: Region) => void;
  removeRegion: (id: string) => void;
  clearRegions: () => void;
  applyRegionErase: () => Promise<void>;
  isErasing: boolean;

  // editor
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;
  /** Active tool configuration - each tool panel edits its own slice. */
  brushSettings: BrushSettings;
  setBrushSettings: (patch: Partial<BrushSettings>) => void;
  shapeSettings: ShapeSettings;
  setShapeSettings: (patch: Partial<ShapeSettings>) => void;
  textSettings: TextSettings;
  setTextSettings: (patch: Partial<TextSettings>) => void;
  /** Selection in the layer stack. */
  selectedLayerIds: string[];
  toggleLayerSelection: (id: string, additive: boolean) => void;
  clearLayerSelection: () => void;
  selectAllLayers: () => void;
  deleteSelectedLayers: () => void;
  moveLayer: (id: string, direction: "up" | "down") => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  appendLayer: (layer: Layer) => void;
  /** Replace the layer list with what the canvas currently holds. */
  syncLayers: (layers: Layer[]) => void;
  layers: Layer[];
  loadResultIntoWorkspace: (resultId: string) => void;

  // canvas bridge (registered by CanvasWorkspace; used by the panels)
  registerCanvasBridge: (
    bridge: {
      remove: (ids: string[]) => void;
      reorder: (id: string, direction: "up" | "down") => void;
      toggleVisibility: (id: string) => void;
      setOpacity: (id: string, opacity: number) => void;
      applyCrop: () => void;
    } | null,
  ) => void;
  registerLayersListener: (
    listener: ((layers: Layer[]) => void) | null,
  ) => void;

  // crop tool
  cropBox: CropBox | null;
  setCropBox: (box: CropBox | null) => void;
  cropAspect: number | null;
  setCropAspect: (aspect: number | null) => void;
  applyCrop: () => void;

  // live adjustment preview
  displayedResult: ProcessedResult | null;
  isRenderingPreview: boolean;

  // ui helpers
  isDragging: boolean;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const MAX_PERSISTED = 20;

export function StudioProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [results, setResults] = useState<ProcessedResult[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [options, setOptionsState] = useState<ProcessingOptions>(
    DEFAULT_PROCESSING_OPTIONS,
  );
  const [adjustments, setAdjustmentsState] = useState<ColorAdjustments>(
    DEFAULT_COLOR_ADJUSTMENTS,
  );
  const [progress, setProgress] = useState<ProcessingProgress>(
    progressStore.getSnapshot(),
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [queueStatus, setQueueStatus] = useState<Record<string, QueueStatus>>(
    {},
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tool, setTool] = useState<ToolMode>("select");
  const [layers, setLayers] = useState<Layer[]>([]);
  const [brushSettings, setBrushSettingsState] = useState<BrushSettings>({
    size: 24,
    opacity: 1,
    color: "#D6523A",
    type: "brush",
  });
  const [shapeSettings, setShapeSettingsState] = useState<ShapeSettings>({
    kind: "rect",
    fill: "none",
    stroke: "#D6523A",
    strokeWidth: 4,
  });
  const [textSettings, setTextSettingsState] = useState<TextSettings>({
    fontFamily: "display",
    fontSize: 64,
    fontWeight: 700,
    color: "#F7F5EF",
    align: "left",
  });
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [cropAspect, setCropAspect] = useState<number | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isErasing, setIsErasing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Re-entry guard for the processing pipeline. `isProcessing` is state: the
   * callback below closes over the value from the render it was created in, so
   * a rapid second trigger (Ctrl+Enter held down, double click before the
   * button disables) would start a second pipeline before the state update
   * lands. A ref flips synchronously and can be read by any invocation.
   */
  const pipelineInFlightRef = useRef(false);
  /**
   * Lets `addFiles` kick off processing without depending on
   * `processActive`'s identity (which would make every option change recreate
   * the add callback).
   */
  const processActiveRef = useRef<(() => Promise<unknown>) | null>(null);

  /**
   * Bridges to the Fabric canvas. The context owns the layer list (so panels
   * can stay dumb), and the canvas registers these once on mount so a layer
   * operation actually moves the rendered object too.
   */
  const canvasDeleteRef = useRef<((ids: string[]) => void) | null>(null);
  const canvasReorderRef = useRef<
    ((id: string, dir: "up" | "down") => void) | null
  >(null);
  const canvasVisibilityRef = useRef<((id: string) => void) | null>(null);
  const canvasOpacityRef = useRef<
    ((id: string, opacity: number) => void) | null
  >(null);
  const canvasApplyCropRef = useRef<(() => void) | null>(null);
  const layersListenerRef = useRef<((layers: Layer[]) => void) | null>(null);

  /**
   * Called by CanvasWorkspace so panel actions reach the canvas, and so canvas
   * mutations (drawing, deleting) flow back into the layer panel.
   */
  const registerCanvasBridge = useCallback(
    (
      bridge: {
        remove: (ids: string[]) => void;
        reorder: (id: string, direction: "up" | "down") => void;
        toggleVisibility: (id: string) => void;
        setOpacity: (id: string, opacity: number) => void;
        applyCrop: () => void;
      } | null,
    ) => {
      canvasDeleteRef.current = bridge?.remove ?? null;
      canvasReorderRef.current = bridge?.reorder ?? null;
      canvasVisibilityRef.current = bridge?.toggleVisibility ?? null;
      canvasOpacityRef.current = bridge?.setOpacity ?? null;
      canvasApplyCropRef.current = bridge?.applyCrop ?? null;
    },
    [],
  );

  const registerLayersListener = useCallback(
    (listener: ((layers: Layer[]) => void) | null) => {
      layersListenerRef.current = listener;
    },
    [],
  );

  /** Crop: run the canvas-side operation (context owns the box/aspect state). */
  const applyCrop = useCallback(() => {
    canvasApplyCropRef.current?.();
  }, []);

  /* ------------------------------------------------------------ bootstrapping */
  useEffect(() => progressStore.subscribe(setProgress), []);

  useEffect(() => {
    (async () => {
      try {
        const [savedOptions, savedAdjustments, savedHistory] =
          await Promise.all([
            storage.getSetting<ProcessingOptions>("options"),
            storage.getSetting<ColorAdjustments>("adjustments"),
            storage.getHistory(),
          ]);
        if (savedOptions) {
          setOptionsState((prev) =>
            normalizeOptions({ ...prev, ...savedOptions }),
          );
        }
        if (savedAdjustments)
          setAdjustmentsState((prev) => ({ ...prev, ...savedAdjustments }));
        setHistory(savedHistory.slice(-50).reverse());
      } catch {
        /* first run */
      }
    })();
  }, []);

  const checkApi = useCallback(async () => {
    const online = await checkApiHealth();
    setApiOnline(online);
    toastStore.info(online ? "toast.apiOnline" : "toast.apiOffline");
  }, []);

  /* ------------------------------------------------------------------ actions */
  const pushHistory = useCallback(
    async (key: string, vars?: Record<string, string | number>) => {
      const entry: HistoryEntry = {
        id: generateId(),
        action: key,
        timestamp: Date.now(),
        data: vars ?? null,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 50));
      try {
        await storage.addHistoryEntry(entry);
      } catch {
        /* storage full */
      }
    },
    [],
  );

  const addFiles = useCallback(
    async (incoming: File[], autoProcess = false) => {
      // Accept by MIME type when present, otherwise fall back to the
      // extension (drag-and-drop from some OSes leaves `type` empty).
      const accepted = incoming.filter(
        (f) => f.type.startsWith("image/") || isSupportedFormat(f.name),
      );
      if (!accepted.length) {
        toastStore.error("drop.formats");
        return;
      }
      // Client-side cap before any decoding happens.
      const oversized = accepted.filter((f) => f.size > MAX_CLIENT_FILE_BYTES);
      if (oversized.length) {
        toastStore.error("drop.tooLarge", {
          mb: Math.round(MAX_CLIENT_FILE_BYTES / 1048576),
        });
        return;
      }

      const mapped: ImageFile[] = [];
      for (const file of accepted) {
        try {
          const dataUrl = await blobToDataUrl(file);
          if (!isSafeImageDataUrl(dataUrl)) {
            toastStore.error("drop.notImage", { name: file.name });
            continue;
          }
          const dims = await measureBlob(file);
          mapped.push({
            id: generateId(),
            name: file.name,
            size: file.size,
            type: file.type || "image/png",
            dataUrl,
            width: dims.width,
            height: dims.height,
            format: (file.type.split("/")[1] || "png") as ImageFile["format"],
          });
        } catch {
          toastStore.error("drop.notImage", { name: file.name });
        }
      }
      if (!mapped.length) return;
      setFiles((prev) => [...prev, ...mapped]);
      setActiveFileId((prev) => prev ?? mapped[0].id);
      setQueueStatus((prev) => {
        const next = { ...prev };
        mapped.forEach((f) => (next[f.id] = "pending"));
        return next;
      });
      await pushHistory("history.uploaded", {
        name: mapped[0].name,
        count: mapped.length,
      });
      toastStore.success("drop.added", { count: mapped.length });

      // Dropped / pasted images are processed straight away so the flow is
      // "drop -> result" instead of "drop -> empty tab -> find the button".
      if (autoProcess && mapped.length) {
        window.setTimeout(() => void processActiveRef.current?.(), 50);
      }
    },
    [pushHistory],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setQueueStatus((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveFileId((prev) => (prev === id ? null : prev));
  }, []);

  /**
   * Load an image from a URL.
   *
   * A browser alone cannot read most cross-origin image responses (the host
   * must send `Access-Control-Allow-Origin`), and this app runs with
   * `connect-src 'self'`, so the bytes must come from our own API: same-origin
   * request in, server-side fetch out, with the remote URL validated there.
   * When the API is not running nothing else can fetch the image, and the user
   * gets told exactly that (start it with `npm run api`).
   */
  const addFromUrl = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        toastStore.error("drop.urlInvalid");
        throw new Error("invalid url");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        toastStore.error("drop.urlInvalid");
        throw new Error("invalid protocol");
      }

      let blob: Blob;
      let type = "image/png";
      try {
        const remote = await fetchRemoteImage(parsed.toString());
        blob = remote.blob;
        type = remote.contentType;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) {
          // The API itself is not running: no fetch can reach another origin,
          // so say so instead of blaming the remote host.
          toastStore.error("toast.needApi");
          throw error;
        }
        // The API answered, so its reason is authoritative.
        const detail = error instanceof ApiError ? error.message : "";
        const reason = /not an image/i.test(detail)
          ? "drop.urlNotImage"
          : /too large/i.test(detail)
            ? "drop.urlTooLarge"
            : "drop.urlBlocked";
        toastStore.error(reason);
        throw error instanceof Error ? error : new Error("fetch failed");
      }

      const decodedName = decodeURIComponent(
        parsed.pathname.split("/").pop() || "",
      );
      const fallbackName = `remote-image.${type.split("/")[1] || "png"}`;
      await addFiles(
        [new File([blob], decodedName || fallbackName, { type })],
        true,
      );
    },
    [addFiles],
  );

  const clearFiles = useCallback(() => {
    setFiles([]);
    setResults([]);
    setQueueStatus({});
    setActiveFileId(null);
    setActiveResultId(null);
    setLayers([]);
  }, []);

  const setOptions = useCallback((patch: Partial<ProcessingOptions>) => {
    setOptionsState((prev) => {
      const next = normalizeOptions({ ...prev, ...patch });
      storage.saveSetting("options", next).catch(() => {});
      return next;
    });
  }, []);

  /** Restore the transparent/PNG defaults (the panel exposes this as a reset). */
  const resetOptions = useCallback(() => {
    const next = normalizeOptions({ ...DEFAULT_PROCESSING_OPTIONS });
    storage.saveSetting("options", next).catch(() => {});
    setOptionsState(next);
    return next;
  }, []);

  const setAdjustments = useCallback((patch: Partial<ColorAdjustments>) => {
    setAdjustmentsState((prev) => {
      const next = { ...prev, ...patch };
      storage.saveSetting("adjustments", next).catch(() => {});
      return next;
    });
  }, []);

  const applyPreset = useCallback(
    (preset: Preset) => {
      setOptionsState((prev) => {
        const next = { ...prev, ...preset.options };
        storage.saveSetting("options", next).catch(() => {});
        return next;
      });
      setAdjustmentsState((prev) => {
        const next = { ...prev, ...preset.adjustments };
        storage.saveSetting("adjustments", next).catch(() => {});
        return next;
      });
      pushHistory("history.preset", { name: preset.name });
      toastStore.success("presets.applied", { name: preset.name });
    },
    [pushHistory],
  );

  const cancelProcessing = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsProcessing(false);
    progressStore.reset();
  }, []);

  /**
   * Full pipeline: API cutout -> background colour -> resize -> crop -> encode.
   * Falls back to "adjustments only" when the API is unreachable.
   */
  const runPipeline = useCallback(
    async (
      file: File,
      opts: ProcessingOptions,
    ): Promise<ProcessedResult | null> => {
      const started = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;

      const cutoutOptions = (model: string) => ({
        model,
        maxSize: opts.maxSize || undefined,
        alphaMatting: opts.alphaMatting,
        fgThreshold: opts.fgThreshold,
        bgThreshold: opts.bgThreshold,
        erodeSize: opts.erodeSize,
      });

      try {
        let working: Blob = await prepareForUpload(
          file,
          opts.maxSize || undefined,
        );
        let transparent = false;

        progressStore.setStage("removing", "process.stage.removing");
        if (opts.model) {
          try {
            const { blob } = await removeBackground(
              working,
              cutoutOptions(opts.model),
              controller.signal,
            );
            working = blob;
            transparent = true;
            setApiOnline(true);
            progressStore.update(0.5, "process.stage.background");
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
              throw error;

            if (error instanceof ApiError && error.status === 0) {
              // API unreachable: keep going with local adjustments only.
              setApiOnline(false);
              toastStore.warning("toast.needApi");
            } else if (
              error instanceof ApiError &&
              error.status === 400 &&
              /model/i.test(error.message) &&
              opts.model !== DEFAULT_PROCESSING_OPTIONS.model
            ) {
              // The instance refuses this model (heavy models are opt-in).
              // Retry once with the default so the user still gets a cutout.
              const fallbackModel = DEFAULT_PROCESSING_OPTIONS.model;
              const { blob } = await removeBackground(
                working,
                cutoutOptions(fallbackModel),
                controller.signal,
              );
              working = blob;
              transparent = true;
              setApiOnline(true);
              setOptionsState((prev) => {
                const next = { ...prev, model: fallbackModel };
                storage.saveSetting("options", next).catch(() => {});
                return next;
              });
              toastStore.info("ai.modelFallback", {
                model: opts.model,
                fallback: fallbackModel,
              });
            } else {
              throw error;
            }
          }
        }

        if (opts.backgroundColor !== "transparent") {
          progressStore.update(0.6, "process.stage.background");
          working = await applyBackgroundColor(
            working,
            opts.backgroundColor,
            opts.outputFormat,
            opts.quality,
          );
          transparent = false;
        }

        if (opts.resizeEnabled && opts.resizeWidth && opts.resizeHeight) {
          progressStore.update(0.75, "process.stage.resize");
          working = await resizeImage(
            working,
            opts.resizeWidth,
            opts.resizeHeight,
            opts.maintainAspectRatio,
          );
        }

        if (opts.cropRatio !== "original") {
          working = await cropToRatio(working, opts.cropRatio);
        }

        progressStore.update(0.9, "process.stage.finalize");
        if (opts.outputFormat !== "png") {
          working = await convertFormat(
            working,
            opts.outputFormat,
            opts.quality,
          );
        }

        const resultDataUrl = await blobToDataUrl(working);
        const dims = await measureBlob(working);
        const processingTime = (performance.now() - started) / 1000;

        const result: ProcessedResult = {
          id: generateId(),
          originalId: generateId(),
          originalName: file.name,
          originalSize: file.size,
          resultSize: working.size,
          resultDataUrl,
          resultBlob: working,
          format: opts.outputFormat,
          processingTime,
          width: dims.width,
          height: dims.height,
          hasTransparency: transparent,
        };
        return result;
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const commitResult = useCallback(
    async (result: ProcessedResult) => {
      setResults((prev) => [result, ...prev].slice(0, MAX_PERSISTED));
      setActiveResultId(result.id);
      setViewMode("single");
      try {
        await storage.saveResult({ ...result, resultBlob: result.resultBlob });
      } catch {
        /* quota */
      }
      await pushHistory("history.processed", {
        name: result.originalName,
        time: formatTime(result.processingTime),
        size: formatBytes(result.resultSize),
      });
    },
    [pushHistory],
  );

  const processActive =
    useCallback(async (): Promise<ProcessedResult | null> => {
      const file = files.find((f) => f.id === activeFileId);
      if (!file) {
        toastStore.warning("toast.noSelection");
        return null;
      }
      // One pipeline at a time: a second trigger while the first is running
      // would fire a duplicate API request and commit a duplicate result.
      if (pipelineInFlightRef.current) return null;
      pipelineInFlightRef.current = true;
      // data: URLs are not fetchable in every engine - decode locally instead.
      const raw = dataUrlToBlob(file.dataUrl);
      const asFile = new File([raw], file.name, {
        type: file.type || "image/png",
      });

      setIsProcessing(true);
      progressStore.start(1, "removing");
      try {
        const result = await runPipeline(asFile, options);
        if (!result) return null;
        await commitResult(result);
        setQueueStatus((prev) => ({ ...prev, [file.id]: "done" }));
        progressStore.complete();
        toastStore.success("toast.processed", {
          time: formatTime(result.processingTime),
          size: formatBytes(result.resultSize),
        });
        return result;
      } catch (error) {
        setQueueStatus((prev) => ({ ...prev, [file.id]: "failed" }));
        const message =
          error instanceof Error ? error.message : "Processing failed";
        toastStore.error(message);
        return null;
      } finally {
        pipelineInFlightRef.current = false;
        setIsProcessing(false);
        setTimeout(() => progressStore.reset(), 1200);
      }
    }, [activeFileId, commitResult, files, options, runPipeline]);

  // Keep the ref pointing at the latest processActive for auto-process.
  processActiveRef.current = processActive;

  const processBatch = useCallback(async () => {
    const pending = files.filter((f) => queueStatus[f.id] !== "done");
    if (!pending.length) {
      toastStore.warning("batch.empty");
      return;
    }
    // Same re-entry guard as processActive: two batch runs at once would
    // interleave API calls and double-count the progress bar.
    if (pipelineInFlightRef.current) return;
    pipelineInFlightRef.current = true;
    setIsProcessing(true);
    progressStore.start(pending.length, "batch");
    let done = 0;

    try {
      for (const file of pending) {
        if (abortRef.current?.signal.aborted) break;
        setQueueStatus((prev) => ({ ...prev, [file.id]: "processing" }));
        progressStore.setStage(
          "processing",
          `batch.progress:${done}|${pending.length}`,
        );
        try {
          // data: URLs are not fetchable in every engine - decode locally instead.
          const raw = dataUrlToBlob(file.dataUrl);
          const asFile = new File([raw], file.name, {
            type: file.type || "image/png",
          });
          const result = await runPipeline(asFile, options);
          if (result) {
            await commitResult(result);
            setQueueStatus((prev) => ({ ...prev, [file.id]: "done" }));
            done += 1;
          } else {
            setQueueStatus((prev) => ({ ...prev, [file.id]: "failed" }));
          }
        } catch {
          setQueueStatus((prev) => ({ ...prev, [file.id]: "failed" }));
        }
        progressStore.update(done, `batch.progress:${done}|${pending.length}`);
      }
    } finally {
      pipelineInFlightRef.current = false;
      setIsProcessing(false);
      progressStore.complete();
      if (done) {
        toastStore.success("toast.batchDone", { count: done });
        await pushHistory("history.batchDone", { count: done });
      }
      setTimeout(() => progressStore.reset(), 1500);
    }
  }, [commitResult, files, options, pushHistory, queueStatus, runPipeline]);

  /**
   * Build the final blob for a result: adjustments -> background composite ->
   * resize -> crop -> format. Both the live preview and every export path use
   * this, so what you see is exactly what downloads.
   *
   * `skipResizeCrop` keeps the preview fast and matches the on-screen size.
   */
  const buildDerivedBlob = useCallback(
    async (
      source: ProcessedResult,
      opts: ProcessingOptions,
      adj: ColorAdjustments,
      cropRatio: string,
      skipResizeCrop = false,
    ): Promise<Blob> => {
      let blob: Blob = source.resultBlob;

      const neutral =
        adj.brightness === 0 &&
        adj.contrast === 0 &&
        adj.saturation === 0 &&
        adj.hue === 0 &&
        adj.blur === 0 &&
        adj.sharpen === 0;

      if (!neutral) {
        blob = await applyColorFilters(blob, adj);
      }

      const background = opts.backgroundColor;
      const hasBackground = background !== "transparent";
      if (hasBackground) {
        blob = await applyBackgroundColor(
          blob,
          background,
          // PNG keeps its alpha, so a solid background on PNG is previewed as
          // the flattened version the export will actually produce.
          opts.outputFormat === "png" ? "jpg" : opts.outputFormat,
          opts.quality,
        );
      }

      if (
        !skipResizeCrop &&
        opts.resizeEnabled &&
        opts.resizeWidth &&
        opts.resizeHeight
      ) {
        blob = await resizeImage(
          blob,
          opts.resizeWidth,
          opts.resizeHeight,
          opts.maintainAspectRatio,
        );
      }

      if (!skipResizeCrop && cropRatio !== "original") {
        blob = await cropToRatio(blob, cropRatio);
      }

      // Always end in the requested container so format + quality are honoured.
      if (opts.outputFormat !== "png" || hasBackground) {
        blob = await convertFormat(blob, opts.outputFormat, opts.quality);
      }

      return blob;
    },
    [],
  );

  const downloadResult = useCallback(
    async (id: string) => {
      const result = results.find((r) => r.id === id);
      if (!result) return;
      const blob = await buildDerivedBlob(
        result,
        options,
        adjustments,
        options.cropRatio,
      );
      const name = `${sanitizeFilename(result.originalName)}-danz.${options.outputFormat}`;
      downloadBlob(blob, name);
      toastStore.success("toast.downloaded", { name });
      pushHistory("history.exported", { name });
    },
    [adjustments, buildDerivedBlob, options, pushHistory, results],
  );

  const downloadAllZip = useCallback(async () => {
    if (!results.length) {
      toastStore.warning("batch.empty");
      return;
    }
    toastStore.info("batch.zipping");
    try {
      const entries = results.map((r) => ({
        name: `${sanitizeFilename(r.originalName)}-dannz.${r.format}`,
        blob: r.resultBlob,
      }));
      const zip = await createZip(entries);
      downloadBlob(zip, "dannz-export.zip");
      toastStore.success("toast.zipReady", { count: entries.length });
      pushHistory("history.exported", {
        name: "dannz-export.zip",
        count: entries.length,
      });
    } catch {
      toastStore.error("toast.zipReady");
    }
  }, [pushHistory, results]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    storage.clearHistory().catch(() => {});
    toastStore.info("history.cleared");
  }, []);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? null,
    [activeFileId, files],
  );
  const activeResult = useMemo(
    () => results.find((r) => r.id === activeResultId) ?? null,
    [activeResultId, results],
  );

  /**
   * Live preview of the active result with the adjustment stack applied.
   *
   * Adjustments used to only exist inside the Fabric workspace, so the sliders
   * in the right panel did nothing in the default single view. The preview is
   * derived (not stored), debounced, and always falls back to the untouched
   * result, so moving a slider can never lose work.
   */
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  // Guards against re-running for an adjustment stack we already rendered.
  const previewKeyRef = useRef("");

  useEffect(() => {
    if (!activeResult) {
      previewKeyRef.current = "";
      setPreviewDataUrl(null);
      setIsRenderingPreview(false);
      return;
    }

    const a = adjustments;
    const isNeutral =
      a.brightness === 0 &&
      a.contrast === 0 &&
      a.saturation === 0 &&
      a.hue === 0 &&
      a.blur === 0 &&
      a.sharpen === 0;

    // A solid background has to be composited into the preview too, otherwise
    // picking a colour in the Adjust panel changes nothing on screen.
    const background = options.backgroundColor;
    const hasBackground = background !== "transparent";

    // Stable key for the work; identical work must never re-run.
    const key = `${activeResult.id}|${isNeutral ? "n" : [a.brightness, a.contrast, a.saturation, a.hue, a.blur, a.sharpen].join(",")}|${background}|${options.outputFormat}|${options.quality}`;
    if (key === previewKeyRef.current) return;
    previewKeyRef.current = key;

    if (isNeutral && !hasBackground) {
      setPreviewDataUrl(null);
      setIsRenderingPreview(false);
      return;
    }

    let cancelled = false;
    setIsRenderingPreview(true);
    const timer = window.setTimeout(async () => {
      try {
        const blob = await buildDerivedBlob(
          activeResult,
          options,
          adjustments,
          "original",
          true,
        );
        if (cancelled) return;
        setPreviewDataUrl(await blobToDataUrl(blob));
      } catch {
        if (!cancelled) setPreviewDataUrl(null);
      } finally {
        if (!cancelled) setIsRenderingPreview(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeResult, adjustments, options, buildDerivedBlob]);

  /** What the result pane should display right now. */
  const displayedResult = useMemo(() => {
    if (!activeResult) return null;
    if (!previewDataUrl) return activeResult;
    return { ...activeResult, resultDataUrl: previewDataUrl };
  }, [activeResult, previewDataUrl]);
  /* ------------------------------------------------------------ region erase */

  const addRegion = useCallback((rect: Region) => {
    setRegions((prev) => [...prev, rect]);
  }, []);

  const removeRegion = useCallback((id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearRegions = useCallback(() => setRegions([]), []);

  /**
   * Erase every drawn rectangle from the active result and commit the cut-out
   * version as a brand-new result, so the original stays in history.
   */
  const applyRegionErase = useCallback(async () => {
    const source = activeResult;
    if (!source) {
      toastStore.warning("toast.noSelection");
      return;
    }
    if (!regions.length) {
      toastStore.warning("region.empty");
      return;
    }

    setIsErasing(true);
    progressStore.start(1, "finalize");
    try {
      const blob = await eraseRegions(source.resultBlob, regions);
      const resultDataUrl = await blobToDataUrl(blob);
      const dims = await measureBlob(blob);
      const stem = source.originalName.replace(/\.[^.]+$/, "") || "image";

      const result: ProcessedResult = {
        id: generateId(),
        originalId: source.originalId,
        originalName: `${stem}-erased.${source.format}`,
        originalSize: source.originalSize,
        resultSize: blob.size,
        resultDataUrl,
        resultBlob: blob,
        format: "png",
        processingTime: 0,
        width: dims.width,
        height: dims.height,
        hasTransparency: source.hasTransparency,
      };

      await commitResult(result);
      setRegions([]);
      setTool("select");
      progressStore.complete();
      toastStore.success("region.applied");
      await pushHistory("history.processed", {
        name: result.originalName,
        time: formatTime(0),
        size: formatBytes(result.resultSize),
      });
    } catch (error) {
      toastStore.error(
        error instanceof Error ? error.message : "region.failed",
      );
    } finally {
      setIsErasing(false);
      setTimeout(() => progressStore.reset(), 1200);
    }
  }, [
    activeResult,
    commitResult,
    formatBytes,
    formatTime,
    pushHistory,
    regions,
  ]);

  const loadResultIntoWorkspace = useCallback(
    (resultId: string) => {
      const result = results.find((r) => r.id === resultId);
      if (!result) return;
      setActiveResultId(resultId);
      setViewMode("workspace");
      setLayers([
        {
          id: result.id,
          name: result.originalName,
          type: "image",
          visible: true,
          opacity: 1,
          data: result.resultDataUrl,
        },
      ]);
      setSelectedLayerIds([]);
    },
    [results],
  );

  /* ------------------------------------------------------------ tool config */

  const setBrushSettings = useCallback((patch: Partial<BrushSettings>) => {
    setBrushSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setShapeSettings = useCallback((patch: Partial<ShapeSettings>) => {
    setShapeSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setTextSettings = useCallback((patch: Partial<TextSettings>) => {
    setTextSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Switch tools; a brand-new selection never carries over between tools. */
  const setToolAndClearSelection = useCallback((next: ToolMode) => {
    setTool(next);
    setSelectedLayerIds([]);
  }, []);

  /* ------------------------------------------------------- layer management */

  const toggleLayerSelection = useCallback((id: string, additive: boolean) => {
    setSelectedLayerIds((prev) =>
      additive
        ? prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id]
        : prev.length === 1 && prev[0] === id
          ? []
          : [id],
    );
  }, []);

  const clearLayerSelection = useCallback(() => setSelectedLayerIds([]), []);
  const selectAllLayers = useCallback(
    () => setSelectedLayerIds(layers.map((l) => l.id)),
    [layers],
  );

  /** Delete the selected layers, plus the canvas objects they stand for. */
  const deleteSelectedLayers = useCallback(() => {
    if (!selectedLayerIds.length) return;
    setLayers((prev) =>
      prev.filter((layer) => !selectedLayerIds.includes(layer.id)),
    );
    setSelectedLayerIds([]);
    // The canvas keeps its own copy - tell it which ids to drop.
    canvasDeleteRef.current?.(selectedLayerIds);
  }, [selectedLayerIds]);

  /** Move a layer up or down the stack (top = index 0). */
  const moveLayer = useCallback((id: string, direction: "up" | "down") => {
    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.id === id);
      if (index === -1) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    canvasReorderRef.current?.(id, direction);
  }, []);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer,
      ),
    );
    canvasVisibilityRef.current?.(id);
  }, []);

  const setLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, opacity } : layer)),
    );
    canvasOpacityRef.current?.(id, opacity);
  }, []);

  /** A layer added by a tool (brush stroke, shape, text). */
  const appendLayer = useCallback((layer: Layer) => {
    setLayers((prev) => [layer, ...prev]);
  }, []);

  /**
   * The canvas is the source of truth for the layer stack, so its emissions
   * replace the list rather than appending to it.
   */
  const syncLayers = useCallback((incoming: Layer[]) => {
    setLayers(incoming);
  }, []);

  /* Global drag & drop anywhere in the window. */
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      e.preventDefault();
      depth += 1;
      setIsDragging(true);
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files?.length) {
        // Dropped images are processed immediately - no extra click needed.
        void addFiles(Array.from(e.dataTransfer.files), true);
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  /* Paste an image from the clipboard (Ctrl/Cmd+V, or a screenshot). */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Don't hijack pasting into a text field.
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length) {
        e.preventDefault();
        void addFiles(images, true); // pasted images process immediately too
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const value = useMemo<StudioContextValue>(
    () => ({
      viewMode,
      setViewMode,
      files,
      results,
      activeFile,
      activeFileId,
      activeResult,
      setActiveFileId,
      setActiveResultId,
      options,
      setOptions,
      resetOptions,
      adjustments,
      setAdjustments,
      applyPreset,
      presets: PRESETS,
      progress,
      isProcessing,
      apiOnline,
      setApiOnline,
      checkApi,
      cancelProcessing,
      queueStatus,
      addFiles,
      addFromUrl,
      removeFile,
      clearFiles,
      processActive,
      processBatch,
      downloadResult,
      downloadAllZip,
      history,
      clearHistory,
      regions,
      addRegion,
      removeRegion,
      clearRegions,
      applyRegionErase,
      isErasing,
      tool,
      setTool: setToolAndClearSelection,
      brushSettings,
      setBrushSettings,
      shapeSettings,
      setShapeSettings,
      textSettings,
      setTextSettings,
      selectedLayerIds,
      toggleLayerSelection,
      clearLayerSelection,
      selectAllLayers,
      deleteSelectedLayers,
      moveLayer,
      toggleLayerVisibility,
      setLayerOpacity,
      appendLayer,
      syncLayers,
      registerCanvasBridge,
      registerLayersListener,
      cropBox,
      setCropBox,
      cropAspect,
      setCropAspect,
      applyCrop,
      layers,
      loadResultIntoWorkspace,
      displayedResult,
      isRenderingPreview,
      isDragging,
    }),
    [
      viewMode,
      files,
      results,
      activeFile,
      activeResult,
      options,
      setOptions,
      resetOptions,
      adjustments,
      setAdjustments,
      applyPreset,
      progress,
      isProcessing,
      apiOnline,
      checkApi,
      cancelProcessing,
      queueStatus,
      addFiles,
      addFromUrl,
      removeFile,
      clearFiles,
      processActive,
      processBatch,
      downloadResult,
      downloadAllZip,
      history,
      clearHistory,
      regions,
      addRegion,
      removeRegion,
      clearRegions,
      applyRegionErase,
      isErasing,
      tool,
      brushSettings,
      shapeSettings,
      textSettings,
      selectedLayerIds,
      toggleLayerSelection,
      clearLayerSelection,
      selectAllLayers,
      deleteSelectedLayers,
      moveLayer,
      toggleLayerVisibility,
      setLayerOpacity,
      appendLayer,
      registerCanvasBridge,
      registerLayersListener,
      cropBox,
      cropAspect,
      applyCrop,
      layers,
      loadResultIntoWorkspace,
      displayedResult,
      isRenderingPreview,
      isDragging,
    ],
  );

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside StudioProvider");
  return ctx;
}
