import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';

export function LayersPanel() {
  const {
    layers,
    activeResult,
    activeFile,
    selectedLayerIds,
    toggleLayerSelection,
    selectAllLayers,
    deleteSelectedLayers,
    moveLayer,
    toggleLayerVisibility,
    setLayerOpacity,
    viewMode,
  } = useStudio();
  const { t } = useLanguage();

  const source = activeResult ?? activeFile;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">{t('layers.title')}</h3>
        <span className="font-mono text-[10px] text-text-muted">{layers.length}</span>
      </div>

      {viewMode !== 'workspace' && (
        <p className="rounded-lg border border-bg-border bg-bg-primary/50 p-2.5 font-mono text-[10px] leading-relaxed text-text-muted">
          {t('layers.workspaceOnly')}
        </p>
      )}

      {layers.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={selectAllLayers}
            className="btn-ghost !px-2 !py-1 text-[10px]"
          >
            {selectedLayerIds.length === layers.length
              ? t('layers.deselectAll')
              : t('layers.selectAll')}
          </button>
          <button
            type="button"
            onClick={deleteSelectedLayers}
            disabled={!selectedLayerIds.length}
            className="btn-ghost !px-2 !py-1 text-[10px] disabled:opacity-40"
          >
            <Icon name="trash" size={11} />
            {t('layers.deleteSelected')}
            {selectedLayerIds.length > 0 && ` (${selectedLayerIds.length})`}
          </button>
        </div>
      )}

      {!source && layers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-bg-border p-6 text-center">
          <Icon name="layers" size={26} className="mx-auto text-text-muted" />
          <p className="mt-2 font-mono text-xs text-text-muted">{t('layers.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {layers.map((layer, index) => {
            const selected = selectedLayerIds.includes(layer.id);
            return (
              <li
                key={layer.id}
                className={`rounded-lg border border-bg-border/30 bg-bg-primary/50 p-2 transition-all duration-200 ease-out glow-hover ${
                  selected ? 'border-accent-primary option-active' : 'border-bg-border/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleLayerSelection(layer.id, (e.nativeEvent as MouseEvent).shiftKey)}
                    className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))]"
                    aria-label={t('layers.select')}
                  />
                  <button
                    type="button"
                    onClick={() => toggleLayerVisibility(layer.id)}
                    className="toolbar-btn !p-1"
                    aria-label={t('layers.visibility')}
                    title={t('layers.visibility')}
                  >
                    <Icon
                      name={layer.visible ? 'box' : 'close'}
                      size={13}
                      className={layer.visible ? '' : 'opacity-40'}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-ui text-sm text-text-primary">{layer.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {t(`tool.${layer.type}`)} · {Math.round(layer.opacity * 100)}%
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveLayer(layer.id, 'up')}
                      disabled={index === layers.length - 1}
                      className="toolbar-btn !p-1 disabled:opacity-30"
                      aria-label={t('layers.moveUp')}
                      title={t('layers.moveUp')}
                    >
                      <Icon name="chevron-right" size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLayer(layer.id, 'down')}
                      disabled={index === 0}
                      className="toolbar-btn !p-1 disabled:opacity-30"
                      aria-label={t('layers.moveDown')}
                      title={t('layers.moveDown')}
                    >
                      <Icon name="chevron-left" size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLayerSelection(layer.id, false)}
                      className="toolbar-btn !p-1 hover:text-error"
                      aria-label={t('layers.delete')}
                      title={t('layers.delete')}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
                {selected && (
                  <label className="mt-2 flex items-center gap-2">
                    <span className="label-caps w-16">{t('layers.opacity')}</span>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={1}
                      value={Math.round(layer.opacity * 100)}
                      onChange={(e) => setLayerOpacity(layer.id, Number(e.target.value) / 100)}
                      className="slider"
                    />
                    <span className="w-8 text-right font-mono text-[10px] text-text-muted">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {layers.length > 0 && (
        <p className="font-mono text-[10px] leading-relaxed text-text-muted">
          Shift+click to select several. Delete removes them from the canvas.
        </p>
      )}
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
            className="rounded-xl border border-bg-border/30 bg-bg-primary/40 mica p-3 transition-all duration-200 ease-out glow-hover hover:border-accent-primary/40"
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
