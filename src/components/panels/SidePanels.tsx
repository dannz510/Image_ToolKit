import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';

export function LayersPanel() {
  const { layers, activeResult, activeFile } = useStudio();
  const { t } = useLanguage();

  const source = activeResult ?? activeFile;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">{t('layers.title')}</h3>
        <span className="font-mono text-[10px] text-text-muted">{layers.length}</span>
      </div>

      {!source ? (
        <div className="rounded-lg border border-dashed border-bg-border p-6 text-center">
          <Icon name="layers" size={26} className="mx-auto text-text-muted" />
          <p className="mt-2 font-mono text-xs text-text-muted">{t('layers.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {layers.map((layer, index) => (
            <li
              key={layer.id}
              className="flex items-center gap-2.5 rounded-lg border border-bg-border bg-bg-primary/60 p-2"
            >
              {layer.data ? (
                <img src={layer.data} alt="" className="h-9 w-9 rounded border border-bg-border object-cover" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded border border-bg-border text-text-muted">
                  <Icon name="image" size={14} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-ui text-sm text-text-primary">{layer.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {t(`tool.${layer.type}`)} · {Math.round(layer.opacity * 100)}%
                </p>
              </div>
              <span className="font-mono text-[10px] text-text-muted">#{index + 1}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-bg-border bg-bg-primary/50 p-3">
        <h4 className="label-caps">{t('layers.blend')}</h4>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-text-muted">
          Multiply · Screen · Overlay · Soft Light · Color Dodge · Exclusion
          <br />
          <span className="text-text-secondary">Active in Workspace view.</span>
        </p>
      </div>
    </div>
  );
}

export function HistoryPanel() {
  const { history, clearHistory } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">{t('history.title')}</h3>
        {history.length > 0 && (
          <button type="button" onClick={clearHistory} className="btn-ghost !px-2 !py-1 text-[10px]">
            {t('history.clear')}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="rounded-lg border border-dashed border-bg-border p-6 text-center">
          <Icon name="clock" size={26} className="mx-auto text-text-muted" />
          <p className="mt-2 font-mono text-xs text-text-muted">{t('history.empty')}</p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-bg-border pl-4">
          {history.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent-primary" />
              <p className="font-ui text-xs leading-snug text-text-secondary">
                {t(entry.action, entry.data as Record<string, string | number> | undefined)}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                {new Date(entry.timestamp).toLocaleTimeString()} ·{' '}
                {Math.max(0, Math.round((Date.now() - entry.timestamp) / 1000))}s ago
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PresetsPanel() {
  const { presets, applyPreset, options, adjustments } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <h3 className="label-caps">{t('presets.title')}</h3>
      <div className="space-y-2">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="rounded-lg border border-bg-border bg-bg-primary/60 p-3 transition-colors hover:border-accent-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-wider text-text-primary">
                  {t(`presets.${preset.id}`)}
                </p>
                <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-text-muted">
                  {t(`presets.${preset.id}.desc`)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => applyPreset(preset)}
                className="btn-primary shrink-0 !px-2.5 !py-1 text-[10px]"
              >
                {t('presets.apply')}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries({ ...preset.options, ...preset.adjustments }).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded border border-bg-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted"
                >
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-bg-border bg-bg-primary/50 p-3 font-mono text-[10px] leading-relaxed text-text-muted">
        <p className="mb-1 text-text-secondary">Current state</p>
        model: {options.model} · bg: {options.backgroundColor} · {options.outputFormat.toUpperCase()} @{' '}
        {options.quality}%
        <br />
        B{adjustments.brightness} C{adjustments.contrast} S{adjustments.saturation} H
        {adjustments.hue}
      </div>
    </div>
  );
}
