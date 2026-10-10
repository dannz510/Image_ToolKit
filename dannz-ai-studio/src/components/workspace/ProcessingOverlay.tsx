import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';

/**
 * Neural Scan - processing overlay. Shows the current pipeline stage,
 * a progress bar and a cancel action.
 */
export function ProcessingOverlay() {
  const { isProcessing, progress, cancelProcessing } = useStudio();
  const { t } = useLanguage();
  if (!isProcessing) return null;

  const total = progress.total || 1;
  const pct = Math.min(100, Math.round((progress.current / total) * 100));
  const stageKeys: Record<string, string> = {
    removing: 'process.stage.removing',
    background: 'process.stage.background',
    resize: 'process.stage.resize',
    finalize: 'process.stage.finalize',
    batch: 'process.stage.batch',
    processing: 'process.processing',
  };
  const stageLabel = t(stageKeys[progress.stage] ?? 'process.processing');

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg-primary/85 backdrop-blur-sm">
      <div className="w-[min(92vw,420px)] text-center">
        <div className="scanline relative mx-auto h-24 w-24 overflow-hidden rounded-xl border border-accent-primary/40 bg-bg-tertiary">
          <Icon name="brain" size={40} className="absolute inset-0 m-auto text-accent-primary" />
        </div>
        <p className="mt-5 font-display text-lg font-bold uppercase tracking-[0.2em] text-text-primary">
          {stageLabel}
        </p>
        <p className="mt-1 font-mono text-xs text-text-muted">
          {progress.current} / {progress.total} · {progress.message}
        </p>
        <div className="mx-auto mt-4 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-accent-primary shadow-glow-sm transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button type="button" onClick={cancelProcessing} className="btn-ghost mt-5 text-xs">
          {t('process.cancel')}
        </button>
      </div>
    </div>
  );
}
