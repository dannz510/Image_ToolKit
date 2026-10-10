import { useEffect, useRef, useState } from 'react';
import { useCanvas } from '../../hooks/useCanvas';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import type { ToolMode } from '../../types';

const TOOL_BUTTONS: { id: ToolMode; icon: string; labelKey: string }[] = [
  { id: 'select', icon: 'box', labelKey: 'tool.select' },
  { id: 'brush', icon: 'brush', labelKey: 'tool.brush' },
  { id: 'eraser', icon: 'eraser', labelKey: 'tool.eraser' },
  { id: 'crop', icon: 'crop', labelKey: 'tool.crop' },
];

export function CanvasWorkspace() {
  const {
    activeResult,
    activeFile,
    tool,
    setTool,
    adjustments,
    layers,
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
  } = useCanvas();
  const loadedIdRef = useRef<string | null>(null);

  // Mount fabric
  useEffect(() => {
    if (containerRef.current) initializeCanvas(containerRef.current);
    return () => disposeCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the active image once per selection
  useEffect(() => {
    const source = activeResult ?? activeFile;
    if (!canvas || !source) return;
    const key = 'resultDataUrl' in source ? source.id : source.id;
    if (loadedIdRef.current === key) return;
    loadedIdRef.current = key;
    void loadImage(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, activeResult, activeFile]);

  // Push colour adjustments to the canvas (non-destructive: filters re-applied)
  useEffect(() => {
    if (canvas) applyAdjustments(adjustments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustments, canvas]);
  // Keyboard: undo/redo. Bound to window events so the global shortcut hook in
  // AppShell can drive the same actions without reaching into canvas internals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
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

  const handleFit = () => {
    setZoom(1);
    setZoomLabel(100);
  };

  const handleSavePng = () => {
    const dataUrl = exportCanvas('png', 100);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'dannz-workspace.png';
    a.click();
  };

  return (
    <div className="relative flex h-full flex-col bg-bg-primary">
      {/* floating toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-lg px-1.5 py-1 shadow-card">
          {TOOL_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setTool(btn.id)}
              className={`toolbar-btn !rounded-md ${tool === btn.id ? 'toolbar-btn-active' : ''}`}
              title={t(btn.labelKey)}
              aria-label={t(btn.labelKey)}
            >
              <Icon name={btn.icon} size={15} />
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-bg-border" />
          <button
            type="button"
            onClick={() => handleZoom(1.2)}
            className="toolbar-btn !rounded-md"
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
            className="toolbar-btn !rounded-md"
            title={t('top.zoomOut')}
            aria-label={t('top.zoomOut')}
          >
            <Icon name="minus" size={15} />
          </button>
          <button
            type="button"
            onClick={handleFit}
            className="toolbar-btn !rounded-md"
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
            className="toolbar-btn !rounded-md disabled:opacity-30"
            title={`${t('top.undo')} (Ctrl+Z)`}
            aria-label={t('top.undo')}
          >
            <Icon name="rotate-ccw" size={15} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="toolbar-btn !rounded-md disabled:opacity-30"
            title={`${t('top.redo')} (Ctrl+Y)`}
            aria-label={t('top.redo')}
          >
            <Icon name="rotate-cw" size={15} />
          </button>
          <div className="mx-1 h-5 w-px bg-bg-border" />
          <button
            type="button"
            onClick={handleSavePng}
            className="toolbar-btn !rounded-md"
            title={t('top.export')}
            aria-label={t('top.export')}
          >
            <Icon name="save" size={15} />
          </button>
        </div>
      </div>

      {/* canvas mount */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1"
        style={{ touchAction: 'none' }}
        aria-label={t('nav.workspace')}
      />

      {/* hint strip */}
      <div className="flex items-center justify-center gap-3 border-t border-bg-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
        <span>Scroll: zoom</span>
        <span>Drag: pan</span>
        <span>Ctrl+Z: undo</span>
        <span className="hidden sm:inline">
          {t('layers.title')}: {layers.length}
        </span>
      </div>
    </div>
  );
}
