import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ColorAdjustments,
  Region,
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
} from '../types';
import { generateId, formatBytes, formatTime, sanitizeFilename, blobToDataUrl } from '../utils';
import { progressStore, type ProcessingProgress } from '../utils/progress';
import { toastStore } from '../utils/toast';
import { storage } from '../utils/storage';
import {
  ApiError,
  applyBackgroundColor,
  checkApiHealth,
  convertFormat,
  cropToRatio,
  eraseRegions,
  measureBlob,
  prepareForUpload,
  removeBackground,
  resizeImage,
} from '../services/api';
import { createZip, downloadBlob } from '../services/zip';

export type QueueStatus = 'pending' | 'processing' | 'done' | 'failed';

interface StudioContextValue {
  // view
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // data
  files: ImageFile[];
  results: ProcessedResult[];
  activeFile: ImageFile | null;
  activeResult: ProcessedResult | null;
  setActiveFileId: (id: string) => void;
  setActiveResultId: (id: string) => void;

  // options
  options: ProcessingOptions;
  setOptions: (patch: Partial<ProcessingOptions>) => void;
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
  addFiles: (incoming: File[]) => Promise<void>;
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
  layers: Layer[];
  loadResultIntoWorkspace: (resultId: string) => void;

  // ui helpers
  isDragging: boolean;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const MAX_PERSISTED = 20;

export function StudioProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [results, setResults] = useState<ProcessedResult[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [options, setOptionsState] = useState<ProcessingOptions>(DEFAULT_PROCESSING_OPTIONS);
  const [adjustments, setAdjustmentsState] = useState<ColorAdjustments>(DEFAULT_COLOR_ADJUSTMENTS);
  const [progress, setProgress] = useState<ProcessingProgress>(progressStore.getSnapshot());
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [queueStatus, setQueueStatus] = useState<Record<string, QueueStatus>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tool, setTool] = useState<ToolMode>('select');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isErasing, setIsErasing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /* ------------------------------------------------------------ bootstrapping */
  useEffect(() => progressStore.subscribe(setProgress), []);

  useEffect(() => {
    (async () => {
      try {
        const [savedOptions, savedAdjustments, savedHistory] = await Promise.all([
          storage.getSetting<ProcessingOptions>('options'),
          storage.getSetting<ColorAdjustments>('adjustments'),
          storage.getHistory(),
        ]);
        if (savedOptions) setOptionsState((prev) => ({ ...prev, ...savedOptions }));
        if (savedAdjustments) setAdjustmentsState((prev) => ({ ...prev, ...savedAdjustments }));
        setHistory(savedHistory.slice(-50).reverse());
      } catch {
        /* first run */
      }
    })();
  }, []);

  const checkApi = useCallback(async () => {
    const online = await checkApiHealth();
    setApiOnline(online);
    toastStore.info(online ? 'toast.apiOnline' : 'toast.apiOffline');
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
    []
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const accepted = incoming.filter((f) => f.type.startsWith('image/'));
      if (!accepted.length) {
        toastStore.error('drop.formats');
        return;
      }
      const mapped: ImageFile[] = [];
      for (const file of accepted) {
        try {
          const dataUrl = await blobToDataUrl(file);
          const dims = await measureBlob(file);
          mapped.push({
            id: generateId(),
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl,
            width: dims.width,
            height: dims.height,
            format: (file.type.split('/')[1] || 'png') as ImageFile['format'],
          });
        } catch {
          toastStore.error(file.name);
        }
      }
      if (!mapped.length) return;
      setFiles((prev) => [...prev, ...mapped]);
      setActiveFileId((prev) => prev ?? mapped[0].id);
      setQueueStatus((prev) => {
        const next = { ...prev };
        mapped.forEach((f) => (next[f.id] = 'pending'));
        return next;
      });
      await pushHistory('history.uploaded', { name: mapped[0].name, count: mapped.length });
      toastStore.success(`${mapped.length} image${mapped.length > 1 ? 's' : ''} added`);
    },
    [pushHistory]
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
      const next = { ...prev, ...patch };
      storage.saveSetting('options', next).catch(() => {});
      return next;
    });
  }, []);

  const setAdjustments = useCallback((patch: Partial<ColorAdjustments>) => {
    setAdjustmentsState((prev) => {
      const next = { ...prev, ...patch };
      storage.saveSetting('adjustments', next).catch(() => {});
      return next;
    });
  }, []);

  const applyPreset = useCallback(
    (preset: Preset) => {
      setOptionsState((prev) => {
        const next = { ...prev, ...preset.options };
        storage.saveSetting('options', next).catch(() => {});
        return next;
      });
      setAdjustmentsState((prev) => {
        const next = { ...prev, ...preset.adjustments };
        storage.saveSetting('adjustments', next).catch(() => {});
        return next;
      });
      pushHistory('history.preset', { name: preset.name });
      toastStore.success('presets.applied', { name: preset.name });
    },
    [pushHistory]
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
    async (file: File, opts: ProcessingOptions): Promise<ProcessedResult | null> => {
      const started = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let working: Blob = await prepareForUpload(file, opts.maxSize || undefined);
        let transparent = false;

        progressStore.setStage('removing', 'process.stage.removing');
        if (opts.model) {
          try {
            const { blob } = await removeBackground(
              working,
              {
                model: opts.model,
                maxSize: opts.maxSize || undefined,
                alphaMatting: opts.alphaMatting,
                fgThreshold: opts.fgThreshold,
                bgThreshold: opts.bgThreshold,
                erodeSize: opts.erodeSize,
              },
              controller.signal
            );
            working = blob;
            transparent = true;
            setApiOnline(true);
            progressStore.update(0.5, 'process.stage.background');
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
            if (error instanceof ApiError && error.status === 0) {
              setApiOnline(false);
              toastStore.warning('toast.needApi');
            } else {
              throw error;
            }
          }
        }

        if (opts.backgroundColor !== 'transparent') {
          progressStore.update(0.6, 'process.stage.background');
          working = await applyBackgroundColor(
            working,
            opts.backgroundColor,
            opts.outputFormat,
            opts.quality
          );
          transparent = false;
        }

        if (opts.resizeEnabled && opts.resizeWidth && opts.resizeHeight) {
          progressStore.update(0.75, 'process.stage.resize');
          working = await resizeImage(
            working,
            opts.resizeWidth,
            opts.resizeHeight,
            opts.maintainAspectRatio
          );
        }

        if (opts.cropRatio !== 'original') {
          working = await cropToRatio(working, opts.cropRatio);
        }

        progressStore.update(0.9, 'process.stage.finalize');
        if (opts.outputFormat !== 'png') {
          working = await convertFormat(working, opts.outputFormat, opts.quality);
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
    []
  );

  const commitResult = useCallback(
    async (result: ProcessedResult) => {
      setResults((prev) => [result, ...prev].slice(0, MAX_PERSISTED));
      setActiveResultId(result.id);
      setViewMode('single');
      try {
        await storage.saveResult({ ...result, resultBlob: result.resultBlob });
      } catch {
        /* quota */
      }
      await pushHistory('history.processed', {
        name: result.originalName,
        time: formatTime(result.processingTime),
        size: formatBytes(result.resultSize),
      });
    },
    [pushHistory]
  );

  const processActive = useCallback(async (): Promise<ProcessedResult | null> => {
    const file = files.find((f) => f.id === activeFileId);
    if (!file) {
      toastStore.warning('toast.noSelection');
      return null;
    }
    const raw = await fetch(file.dataUrl).then((r) => r.blob());
    const asFile = new File([raw], file.name, { type: file.type || 'image/png' });

    setIsProcessing(true);
    progressStore.start(1, 'removing');
    try {
      const result = await runPipeline(asFile, options);
      if (!result) return null;
      await commitResult(result);
      setQueueStatus((prev) => ({ ...prev, [file.id]: 'done' }));
      progressStore.complete();
      toastStore.success('toast.processed', {
        time: formatTime(result.processingTime),
        size: formatBytes(result.resultSize),
      });
      return result;
    } catch (error) {
      setQueueStatus((prev) => ({ ...prev, [file.id]: 'failed' }));
      const message = error instanceof Error ? error.message : 'Processing failed';
      toastStore.error(message);
      return null;
    } finally {
      setIsProcessing(false);
      setTimeout(() => progressStore.reset(), 1200);
    }
  }, [activeFileId, commitResult, files, options, runPipeline]);

  const processBatch = useCallback(async () => {
    const pending = files.filter((f) => queueStatus[f.id] !== 'done');
    if (!pending.length) {
      toastStore.warning('batch.empty');
      return;
    }
    setIsProcessing(true);
    progressStore.start(pending.length, 'batch');
    let done = 0;

    for (const file of pending) {
      if (abortRef.current?.signal.aborted) break;
      setQueueStatus((prev) => ({ ...prev, [file.id]: 'processing' }));
      progressStore.setStage('processing', `batch.progress:${done}|${pending.length}`);
      try {
        const raw = await fetch(file.dataUrl).then((r) => r.blob());
        const asFile = new File([raw], file.name, { type: file.type || 'image/png' });
        const result = await runPipeline(asFile, options);
        if (result) {
          await commitResult(result);
          setQueueStatus((prev) => ({ ...prev, [file.id]: 'done' }));
          done += 1;
        } else {
          setQueueStatus((prev) => ({ ...prev, [file.id]: 'failed' }));
        }
      } catch {
        setQueueStatus((prev) => ({ ...prev, [file.id]: 'failed' }));
      }
      progressStore.update(done, `batch.progress:${done}|${pending.length}`);
    }

    setIsProcessing(false);
    progressStore.complete();
    if (done) {
      toastStore.success('toast.batchDone', { count: done });
      await pushHistory('history.batchDone', { count: done });
    }
    setTimeout(() => progressStore.reset(), 1500);
  }, [commitResult, files, options, pushHistory, queueStatus, runPipeline]);

  const downloadResult = useCallback(async (id: string) => {
    const result = results.find((r) => r.id === id);
    if (!result) return;
    const name = `${sanitizeFilename(result.originalName)}-dannz.${result.format}`;
    downloadBlob(result.resultBlob, name);
    toastStore.success('toast.downloaded', { name });
    pushHistory('history.exported', { name });
  }, [pushHistory, results]);

  const downloadAllZip = useCallback(async () => {
    if (!results.length) {
      toastStore.warning('batch.empty');
      return;
    }
    toastStore.info('batch.zipping');
    try {
      const entries = results.map((r) => ({
        name: `${sanitizeFilename(r.originalName)}-dannz.${r.format}`,
        blob: r.resultBlob,
      }));
      const zip = await createZip(entries);
      downloadBlob(zip, 'dannz-export.zip');
      toastStore.success('toast.zipReady', { count: entries.length });
      pushHistory('history.exported', { name: 'dannz-export.zip', count: entries.length });
    } catch {
      toastStore.error('toast.zipReady');
    }
  }, [pushHistory, results]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    storage.clearHistory().catch(() => {});
    toastStore.info('history.cleared');
  }, []);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? null,
    [activeFileId, files]
  );
  const activeResult = useMemo(
    () => results.find((r) => r.id === activeResultId) ?? null,
    [activeResultId, results]
  );
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
      toastStore.warning('toast.noSelection');
      return;
    }
    if (!regions.length) {
      toastStore.warning('region.empty');
      return;
    }

    setIsErasing(true);
    progressStore.start(1, 'finalize');
    try {
      const blob = await eraseRegions(source.resultBlob, regions);
      const resultDataUrl = await blobToDataUrl(blob);
      const dims = await measureBlob(blob);
      const stem = source.originalName.replace(/\.[^.]+$/, '') || 'image';

      const result: ProcessedResult = {
        id: generateId(),
        originalId: source.originalId,
        originalName: `${stem}-erased.${source.format}`,
        originalSize: source.originalSize,
        resultSize: blob.size,
        resultDataUrl,
        resultBlob: blob,
        format: 'png',
        processingTime: 0,
        width: dims.width,
        height: dims.height,
        hasTransparency: source.hasTransparency,
      };

      await commitResult(result);
      setRegions([]);
      setTool('select');
      progressStore.complete();
      toastStore.success('region.applied');
      await pushHistory('history.processed', {
        name: result.originalName,
        time: formatTime(0),
        size: formatBytes(result.resultSize),
      });
    } catch (error) {
      toastStore.error(error instanceof Error ? error.message : 'region.failed');
    } finally {
      setIsErasing(false);
      setTimeout(() => progressStore.reset(), 1200);
    }
  }, [activeResult, commitResult, formatBytes, formatTime, pushHistory, regions]);

  const loadResultIntoWorkspace = useCallback(
    (resultId: string) => {
      const result = results.find((r) => r.id === resultId);
      if (!result) return;
      setActiveResultId(resultId);
      setViewMode('workspace');
      setLayers([
        {
          id: result.id,
          name: result.originalName,
          type: 'image',
          visible: true,
          opacity: 1,
          data: result.resultDataUrl,
        },
      ]);
    },
    [results]
  );


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
      if (e.dataTransfer?.files?.length) void addFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles]);

  const value = useMemo<StudioContextValue>(
    () => ({
      viewMode,
      setViewMode,
      files,
      results,
      activeFile,
      activeResult,
      setActiveFileId,
      setActiveResultId,
      options,
      setOptions,
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
      setTool,
      layers,
      loadResultIntoWorkspace,
      isDragging,
    }),
    [
      viewMode, files, results, activeFile, activeResult, options, setOptions,
      adjustments, setAdjustments, applyPreset, progress, isProcessing, apiOnline,
      checkApi, cancelProcessing, queueStatus, addFiles, removeFile, clearFiles,
      processActive, processBatch, downloadResult, downloadAllZip, history,
      clearHistory, regions, addRegion, removeRegion, clearRegions, applyRegionErase,
      isErasing, tool, layers, loadResultIntoWorkspace, isDragging,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider');
  return ctx;
}
