import { useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatBytes, formatDimensions, formatTime } from '../../utils';

/**
 * Side-by-side (and slider) comparison of original vs processed image,
 * with before/after size, dimensions and processing time.
 */
export function ComparisonView() {
  const { activeFile, activeResult, downloadResult, results, setActiveResultId, loadResultIntoWorkspace } =
    useStudio();
  const { t } = useLanguage();
  const [mode, setMode] = useState<'side' | 'slider'>('side');
  const [split, setSplit] = useState(50);

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
      <div className="flex items-center gap-2 border-b border-bg-border px-4 py-2">
        <div className="flex rounded-md bg-bg-primary p-0.5">
          <button
            type="button"
            onClick={() => setMode('side')}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
              mode === 'side' ? 'bg-accent-primary text-white' : 'text-text-secondary'
            }`}
          >
            {t('compare.before')} / {t('compare.after')}
          </button>
          <button
            type="button"
            onClick={() => setMode('slider')}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
              mode === 'slider' ? 'bg-accent-primary text-white' : 'text-text-secondary'
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
            <figure className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-bg-border bg-bg-card">
              <figcaption className="flex items-center justify-between border-b border-bg-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
            <figure className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-bg-border bg-bg-card">
              <figcaption className="flex items-center justify-between border-b border-bg-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent-primary">
                {t('compare.result')}
                <span>{formatBytes(activeResult.resultSize)}</span>
              </figcaption>
              <div className="min-h-0 flex-1 overflow-hidden checker">
                <img
                  src={activeResult.resultDataUrl}
                  alt={activeResult.originalName}
                  className="h-full w-full object-contain"
                />
              </div>
            </figure>
          </div>
        ) : (
          <div
            className="relative h-full min-h-0 select-none overflow-hidden rounded-lg border border-bg-border checker"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSplit(((e.clientX - rect.left) / rect.width) * 100);
            }}
          >
            <img
              src={activeFile.dataUrl}
              alt={activeFile.name}
              className="absolute inset-0 h-full w-full object-contain"
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            >
              <img
                src={activeResult.resultDataUrl}
                alt={activeResult.originalName}
                className="absolute inset-0 h-full w-full object-contain"
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

      {/* stats strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-bg-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
