import { useEffect, useRef, useState } from 'react';
import { useCanvas } from '../../hooks/useCanvas';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import type { Layer, ToolMode } from '../../types';

const TOOL_BUTTONS: { id: ToolMode; icon: string; labelKey: string }[] = [
  { id: 'select', icon: 'box', labelKey: 'tool.select' },
  { id: 'brush', icon: 'brush', labelKey: 'tool.brush' },
  { id: 'eraser', icon: 'eraser', labelKey: 'tool.eraser' },
  { id: 'crop', icon: 'crop', labelKey: 'tool.crop' },
  { id: 'text', icon: 'text', labelKey: 'tool.text' },
  { id: 'shape', icon: 'shape', labelKey: 'tool.shape' },
];

const HINTS: Record<ToolMode, string> = {
  select: 'workspace.hint.select',
  brush: 'workspace.hint.brush',
  eraser: 'workspace.hint.eraser',
  crop: 'workspace.hint.crop',
  text: 'workspace.hint.text',
  shape: 'workspace.hint.shape',
};

/**
 * The editing surface. Every tool in the left rail lands here, and the right
 * panel swaps to the controls that belong to the active tool - so each tool
 * has a dedicated, meaningful UI rather than one generic panel.
 */
export function CanvasWorkspace() {
  const {
    activeResult,
    activeFile,
    tool,
    setTool,
    adjustments,
    layers,
    brushSettings,
    shapeSettings,
    textSettings,
    cropBox,
    setCropBox,
    cropAspect,
    setCropAspect,
    applyCrop,
    syncLayers,
    registerCanvasBridge,
  } = useStudio();
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLabel, setZoomLabel] = useState(100);
  const {
    canvas,
    initializeCanvas,
    disposeCanvas,
    loadImage,
    setZoom,
    undo,
    redo,
    canUndo,
    canRedo,
    exportCanvas,
    applyAdjustments,
    applyCrop: canvasApplyCrop,
    // The HOOK's listener is the one `emitLayers` actually calls.
    registerLayersListener: registerHookLayersListener,
  } = useCanvas(tool, brushSettings, shapeSettings, textSettings, cropAspect, (box) =>
    setCropBox(box)
  );
  const loadedIdRef = useRef<string | null>(null);
  const loadedCanvasRef = useRef<unknown>(null);
  const applyCropRef = useRef<(() => void) | null>(null);
  // Point the ref at the hook implementation once it exists.
  useEffect(() => {
    applyCropRef.current = canvasApplyCrop;
  }, [canvasApplyCrop]);

  // Mount fabric once.
  useEffect(() => {
    if (containerRef.current) initializeCanvas(containerRef.current);
    return () => {
      disposeCanvas();
      // A future mount gets a brand-new canvas instance, so the image must be
      // re-loaded into it - clear the "already loaded" markers.
      loadedIdRef.current = null;
      loadedCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [localLayers, setLocalLayers] = useState<Layer[]>(layers);
  const layersRef = useRef<Layer[]>(layers);

  /**
   * The canvas emits layers through the HOOK, so the hook's
   * `registerLayersListener` is the one that has to be wired. (Registering
   * only the context version leaves the emissions with nowhere to go and the
   * layer stack stuck at zero.)
   */
  useEffect(() => {
    const receive = (incoming: Layer[]) => {
      layersRef.current = incoming;
      setLocalLayers(incoming);
      syncLayers(incoming); // keep the panels (which read the context) in sync
    };
    registerHookLayersListener(receive);
    return () => registerHookLayersListener(null);
  }, [registerHookLayersListener, syncLayers]);

  // Bridge object-level operations from the panels into the canvas.
  useEffect(() => {
    if (!canvas) return;
    registerCanvasBridge({
      remove: (ids: string[]) => {
        canvas
          .getObjects()
          .filter((o) => ids.includes((o as { id?: string }).id ?? ''))
          .forEach((o) => canvas.remove(o));
        canvas.renderAll();
      },
      reorder: (id: string, dir: 'up' | 'down') => {
        const objects = canvas.getObjects();
        const index = objects.findIndex((o) => (o as { id?: string }).id === id);
        const target = dir === 'up' ? index + 1 : index - 1;
        if (index !== -1 && target >= 0 && target < objects.length) {
          objects[index].moveTo(target);
          canvas.renderAll();
        }
      },
      toggleVisibility: (id: string) => {
        const obj = canvas.getObjects().find((o) => (o as { id?: string }).id === id);
        if (obj) {
          obj.visible = !obj.visible;
          canvas.renderAll();
        }
      },
      setOpacity: (id: string, opacity: number) => {
        const obj = canvas.getObjects().find((o) => (o as { id?: string }).id === id);
        if (obj) {
          obj.set({ opacity });
          canvas.renderAll();
        }
      },
      applyCrop: () => applyCropRef.current?.(),
    });
    return () => registerCanvasBridge(null);
  }, [canvas, registerCanvasBridge]);

  // Load the active image once per selection PER CANVAS INSTANCE. The canvas is
  // recreated on every mount (and on StrictMode's double-mount), so the guard
  // must also track which instance the image was already loaded into -
  // otherwise a fresh canvas stays empty because the id check alone matches.
  useEffect(() => {
    const source = activeResult ?? activeFile;
    if (!canvas || !source) return;
    if (loadedIdRef.current === source.id && loadedCanvasRef.current === canvas)
      return;
    loadedIdRef.current = source.id;
    loadedCanvasRef.current = canvas;
    void loadImage(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, activeResult, activeFile]);

  // Non-destructive colour adjustments on the canvas image.
  useEffect(() => {
    if (canvas) applyAdjustments(adjustments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustments, canvas]);

  // Undo/redo via keyboard and via the global shortcut events.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    const onUndo = () => undo();
    const onRedo = () => redo();
    window.addEventListener('keydown', onKey);
    window.addEventListener('dannz:undo', onUndo);
    window.addEventListener('dannz:redo', onRedo);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dannz:undo', onUndo);
      window.removeEventListener('dannz:redo', onRedo);
    };
  }, [undo, redo]);

  const handleZoom = (factor: number) => {
    if (!canvas) return;
    const next = Math.min(8, Math.max(0.1, canvas.getZoom() * factor));
    setZoom(next);
    setZoomLabel(Math.round(next * 100));
  };

  const handleSavePng = () => {
    const dataUrl = exportCanvas('png', 100);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'danz-workspace.png';
    a.click();
  };

  const layerCount = localLayers.length || layers.length;

  return (
    <div className="relative flex h-full flex-col bg-bg-primary">
      {/* floating toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
         <div className="mica pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-1 rounded-2xl px-1.5 py-1 shadow-mica">
          {TOOL_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setTool(btn.id)}
               className={`toolbar-btn !rounded-lg ${tool === btn.id ? 'toolbar-btn-active' : ''}`}
              title={t(btn.labelKey)}
              aria-label={t(btn.labelKey)}
              aria-pressed={tool === btn.id}
            >
              <Icon name={btn.icon} size={15} />
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-bg-border" />
          <button
            type="button"
            onClick={() => handleZoom(1.2)}
            className="toolbar-btn !rounded-lg"
            title={t('top.zoomIn')}
            aria-label={t('top.zoomIn')}
          >
            <Icon name="plus" size={15} />
          </button>
          <span className="min-w-[46px] text-center font-mono text-[10px] tabular-nums text-text-muted">
            {zoomLabel}%
          </span>
          <button
            type="button"
            onClick={() => handleZoom(1 / 1.2)}
            className="toolbar-btn !rounded-lg"
            title={t('top.zoomOut')}
            aria-label={t('top.zoomOut')}
          >
            <Icon name="minus" size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setZoomLabel(100);
            }}
            className="toolbar-btn !rounded-lg"
            title={t('top.fit')}
            aria-label={t('top.fit')}
          >
            <Icon name="maximize" size={15} />
          </button>
          <div className="mx-1 h-5 w-px bg-bg-border" />
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="toolbar-btn !rounded-lg disabled:opacity-30"
            title={`${t('top.undo')} (Ctrl+Z)`}
            aria-label={t('top.undo')}
          >
            <Icon name="rotate-ccw" size={15} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="toolbar-btn !rounded-lg disabled:opacity-30"
            title={`${t('top.redo')} (Ctrl+Y)`}
            aria-label={t('top.redo')}
          >
            <Icon name="rotate-cw" size={15} />
          </button>
          <div className="mx-1 h-5 w-px bg-bg-border" />
          <button
            type="button"
            onClick={handleSavePng}
            className="toolbar-btn !rounded-lg"
            title={t('top.export')}
            aria-label={t('top.export')}
          >
            <Icon name="save" size={15} />
          </button>
        </div>
      </div>

      {/* crop bar - only while the crop tool is active */}
      {tool === 'crop' && (
        <div className="absolute inset-x-0 top-[3.4rem] z-10 flex flex-wrap items-center justify-center gap-1.5 px-3">
          <div className="mica pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl px-2 py-1.5 shadow-mica">
            {(
              [
                ['original', null],
                ['1:1', 1],
                ['16:9', 16 / 9],
                ['4:3', 4 / 3],
                ['3:2', 3 / 2],
              ] as [string, number | null][]
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => setCropAspect(value)}
                className="rounded-lg border border-bg-border/50 bg-bg-primary/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition-all duration-200 ease-out glow-hover hover:bg-bg-tertiary hover:text-text-primary"
              >
                {label}
              </button>
            ))}
            <span className="font-mono text-[10px] text-text-muted">
              {cropBox ? `${cropBox.width}x${cropBox.height}` : '—'}
            </span>
            <button
              type="button"
              onClick={applyCrop}
              disabled={!cropBox}
              className="btn-primary !px-2.5 !py-1 text-[11px] disabled:opacity-40"
            >
              <Icon name="crop" size={12} />
              {t('workspace.applyCrop')}
            </button>
          </div>
        </div>
      )}

      {/* canvas mount */}
      <div
        ref={containerRef}
        className="canvas-surface min-h-0 flex-1"
        aria-label={t('nav.workspace')}
      />

      {/* hint strip - tells the user what the active tool does */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-bg-border/40 bg-bg-secondary/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur-sm">
        <span>{t(HINTS[tool])}</span>
        <span className="hidden sm:inline">Scroll: zoom</span>
        <span className="hidden sm:inline">Ctrl+Z: undo</span>
        <span className="hidden sm:inline">
          {t('layers.title')}: {layerCount}
        </span>
      </div>
    </div>
  );
}
