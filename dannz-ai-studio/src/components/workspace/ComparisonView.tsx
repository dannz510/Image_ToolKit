import { useMemo, useRef, useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatBytes, formatDimensions, formatTime } from '../../utils';

/**
 * Side-by-side (and slider) comparison of original vs processed image,
 * with before/after size, dimensions and processing time.
 */
export function ComparisonView() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'side' | 'slider'>('side');
  const [split, setSplit] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  /** Move the divider to the horizontal position of a client X coordinate. */
  const applySplit = (clientX: number) => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };
  const {
    activeFile,
    activeFileId,
    activeResult,
    displayedResult,
    isRenderingPreview,
    downloadResult,
    results,
    files,
    setActiveFileId,
    setActiveResultId,
    loadResultIntoWorkspace,
  } = useStudio();

  /** Every uploaded image, with its result thumbnail when one exists. */
  const allImages = useMemo(
    () =>
      files.map((file) => {
        const match = results.find((r) => r.originalName === file.name);
        return {
          id: file.id,
          name: file.name,
          thumb: match ? match.resultDataUrl : file.dataUrl,
          hasResult: Boolean(match),
        };
      }),
    [files, results]
  );

  if (!activeFile) return null;

  if (!activeResult) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Icon name="image" size={40} className="mx-auto text-text-muted" />
          <p className="mt-3 font-display text-lg uppercase tracking-wider text-text-secondary">
            {t('drop.title')}
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted">
            {t('drop.subtitle')}
          </p>
        </div>
      </div>
    );
  }

  const saved = activeResult.originalSize - activeResult.resultSize;
  const savedPct = activeResult.originalSize
    ? Math.round((saved / activeResult.originalSize) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-2 border-b border-bg-border/40 bg-bg-secondary/30 px-4 py-2 backdrop-blur-sm">
        <div className="flex rounded-xl bg-bg-primary/50 p-0.5 mica">
          <button
            type="button"
            onClick={() => setMode('side')}
            className={`rounded-lg border border-bg-border/50 bg-bg-primary/50 px-2.5 py-1 glow-hover text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out ${
              mode === 'side' ? 'border-accent-primary bg-accent-primary/15 text-accent-primary shadow-glow' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('compare.before')} / {t('compare.after')}
          </button>
          <button
            type="button"
            onClick={() => setMode('slider')}
            className={`rounded-lg border border-bg-border/50 bg-bg-primary/50 px-2.5 py-1 glow-hover text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out ${
              mode === 'slider' ? 'border-accent-primary bg-accent-primary/15 text-accent-primary shadow-glow' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('compare.swap')}
          </button>
        </div>
        <div className="flex-1" />
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted sm:inline">
          {t('compare.time')}: {formatTime(activeResult.processingTime)}
        </span>
        <button
          type="button"
          className="btn-ghost !px-2.5 !py-1.5 text-xs"
          onClick={() => loadResultIntoWorkspace(activeResult.id)}
        >
          <Icon name="edit" size={13} />
          {t('nav.workspace')}
        </button>
        <button
          type="button"
          className="btn-primary !px-2.5 !py-1.5 text-xs"
          onClick={() => downloadResult(activeResult.id)}
        >
          <Icon name="download" size={13} />
          {t('compare.download')}
        </button>
      </div>

      {/* viewport */}
      <div className="min-h-0 flex-1 p-4">
        {mode === 'side' ? (
          <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2">
            <figure className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-bg-border/30 bg-bg-card/60 mica">
              <figcaption className="flex items-center justify-between border-b border-bg-border/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t('compare.original')}
                <span>{formatBytes(activeResult.originalSize)}</span>
              </figcaption>
              <div className="min-h-0 flex-1 overflow-hidden checker">
                <img
                  src={activeFile.dataUrl}
                  alt={activeFile.name}
                  className="h-full w-full object-contain"
                />
              </div>
            </figure>
            <figure className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-bg-border/30 bg-bg-card/60 mica">
              <figcaption className="flex items-center justify-between border-b border-bg-border/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent-primary">
                {t('compare.result')}
                <span className="flex items-center gap-2">
                  {isRenderingPreview && (
                    <span className="text-text-muted">{t('compare.rendering')}</span>
                  )}
                  {formatBytes(activeResult.resultSize)}
                </span>
              </figcaption>
              <div className="min-h-0 flex-1 overflow-hidden checker">
                <img
                  src={displayedResult?.resultDataUrl ?? activeResult.resultDataUrl}
                  alt={activeResult.originalName}
                  className="h-full w-full object-contain"
                />
              </div>
            </figure>
          </div>
        ) : (
          <div
            ref={sliderRef}
            className="relative h-full min-h-0 cursor-ew-resize select-none touch-none overflow-hidden rounded-xl border border-bg-border/30 mica checker"
            onPointerDown={(e) => {
              // Explicit drag (pointer capture) + draggable={false} on the
              // images: without both, browsers start a native image drag that
              // hijacks the pointer and the divider stops following it, and
              // touch screens never moved it at all (there was only a
              // mouse-move binding).
              e.currentTarget.setPointerCapture(e.pointerId);
              dragRef.current = true;
              applySplit(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!dragRef.current) return;
              applySplit(e.clientX);
            }}
            onPointerUp={(e) => {
              dragRef.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={() => {
              dragRef.current = false;
            }}
          >
            <img
              src={activeFile.dataUrl}
              alt={activeFile.name}
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            >
              <img
                src={displayedResult?.resultDataUrl ?? activeResult.resultDataUrl}
                alt={activeResult.originalName}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />
            </div>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent-primary shadow-glow"
              style={{ left: `${split}%` }}
            />
            <span className="pointer-events-none absolute left-3 top-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase text-white">
              {t('compare.before')}
            </span>
            <span className="pointer-events-none absolute right-3 top-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase text-accent-light">
              {t('compare.after')}
            </span>
          </div>
        )}
      </div>

      {/* image selector strip: jump between uploaded images and their results */}
      {allImages.length > 1 && (
         <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-bg-border/40 bg-bg-secondary/30 px-3 py-2 backdrop-blur-sm">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t('compare.images')}
          </span>
          {allImages.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveFileId(item.id)}
               className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border-2 transition-all duration-200 ease-out ${
                item.id === activeFileId
                  ? 'border-accent-primary shadow-glow'
                  : 'border-bg-border hover:border-text-muted glow-hover'
              }`}
              title={item.name}
            >
              <img src={item.thumb} alt="" className="h-full w-full object-cover" />
              {item.hasResult && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-tl bg-success" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* stats strip */}
       <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-bg-border/40 bg-bg-secondary/30 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur-sm">
        <span>
          {t('compare.dimensions')}: {formatDimensions(activeResult.width, activeResult.height)}
        </span>
        <span>
          {t('compare.sizeBefore')}: {formatBytes(activeResult.originalSize)}
        </span>
        <span className="text-accent-primary">
          {t('compare.sizeAfter')}: {formatBytes(activeResult.resultSize)}
        </span>
        {saved > 0 && (
          <span className="text-success">
            {t('compare.saved')}: {formatBytes(saved)} ({savedPct}%)
          </span>
        )}
        <div className="flex-1" />
        {results.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="sr-only">{t('compare.result')}</span>
            <select
              className="select !w-auto !py-1 text-[11px]"
              value={activeResult.id}
              onChange={(e) => setActiveResultId(e.target.value)}
            >
              {results.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.originalName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
