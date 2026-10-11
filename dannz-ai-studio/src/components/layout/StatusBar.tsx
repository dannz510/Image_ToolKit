import { useEffect, useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDimensions } from '../../utils';

export function StatusBar() {
  const { viewMode, files, results, activeResult, apiOnline, isProcessing, progress } = useStudio();
  const { t } = useLanguage();
  const [fps, setFps] = useState(0);

  // Lightweight FPS probe (rAF), only while something is on screen.
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames += 1;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const status = isProcessing
    ? t('status.processing', { name: progress.message || t('process.processing') })
    : activeResult
      ? activeResult.originalName
      : files.length
        ? t('status.images', { count: files.length })
        : t('status.noImage');

  return (
    <footer className="relative z-30 flex h-7 items-center gap-4 border-t border-bg-border/40 bg-bg-secondary/45 px-3 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur-md">
      <span className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isProcessing ? 'bg-accent-primary animate-pulse' : 'bg-success'
          }`}
        />
        <span className="truncate max-w-[220px] sm:max-w-none">{status}</span>
      </span>

      {activeResult && (
        <span className="hidden sm:inline">
          {t('compare.dimensions')}: {formatDimensions(activeResult.width, activeResult.height)}
        </span>
      )}

      <span className="hidden md:inline">
        {t('status.images', { count: results.length })} / {files.length}
      </span>

      <div className="flex-1" />

      <span>
        {t('status.mode')}: {t(`nav.${viewMode}`)}
      </span>
      <span className="hidden sm:inline">
        {t('status.api')}:{' '}
        <span className={apiOnline ? 'text-success' : apiOnline === false ? 'text-error' : ''}>
          {apiOnline === null ? '—' : apiOnline ? t('ai.apiOnline') : t('ai.apiOffline')}
        </span>
      </span>
      <span className="tabular-nums">
        {t('status.fps')}: {fps}
      </span>
    </footer>
  );
}
