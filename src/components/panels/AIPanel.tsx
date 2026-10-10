import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Field, SelectRow, SliderRow, ToggleRow } from '../ui/Fields';

export function AIPanel() {
  const { options, setOptions, checkApi, apiOnline } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="label-caps">{t('ai.model')}</h3>
        <SelectRow
          label={t('ai.model')}
          value={options.model}
          onChange={(model) => setOptions({ model })}
          options={[
            { value: 'u2netp', label: t('ai.model.u2netp') },
            { value: 'u2net', label: t('ai.model.u2net') },
            { value: 'isnet-general-use', label: t('ai.model.isnet') },
            { value: 'u2net_human_seg', label: t('ai.model.human') },
            { value: 'silueta', label: t('ai.model.silueta') },
          ]}
        />
        <SliderRow
          label={t('ai.maxSize')}
          hint={t('ai.maxSize.hint')}
          value={options.maxSize}
          min={320}
          max={2400}
          step={80}
          suffix="px"
          onChange={(maxSize) => setOptions({ maxSize })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="label-caps">{t('ai.alphaMatting')}</h3>
        <ToggleRow
          label={t('ai.alphaMatting')}
          hint={t('ai.alphaMatting.hint')}
          checked={options.alphaMatting}
          onChange={(alphaMatting) => setOptions({ alphaMatting })}
        />
        {options.alphaMatting && (
          <div className="space-y-2 rounded-lg border border-bg-border bg-bg-primary/50 p-3">
            <SliderRow
              label={t('ai.fgThreshold')}
              value={options.fgThreshold}
              min={0}
              max={255}
              onChange={(fgThreshold) => setOptions({ fgThreshold })}
            />
            <SliderRow
              label={t('ai.bgThreshold')}
              value={options.bgThreshold}
              min={0}
              max={255}
              onChange={(bgThreshold) => setOptions({ bgThreshold })}
            />
            <SliderRow
              label={t('ai.erodeSize')}
              value={options.erodeSize}
              min={0}
              max={40}
              onChange={(erodeSize) => setOptions({ erodeSize })}
            />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="label-caps">{t('ai.apiStatus')}</h3>
          <button type="button" onClick={checkApi} className="btn-ghost !px-2 !py-1 text-[10px]">
            {t('ai.apiCheck')}
          </button>
        </div>
        <p
          className={`font-mono text-xs ${
            apiOnline ? 'text-success' : apiOnline === false ? 'text-error' : 'text-text-muted'
          }`}
        >
          {apiOnline === null ? '—' : apiOnline ? t('ai.apiOnline') : t('ai.apiOffline')}
        </p>
        <p className="font-mono text-[10px] leading-relaxed text-text-muted">{t('ai.apiHint')}</p>
      </section>

      <Field label={t('panel.output')}>
        <p className="font-mono text-[10px] leading-relaxed text-text-muted">
          u2netp ≈ 176 MB model, first call downloads once, then warm. isnet-general-use gives
          the sharpest edges on hair and fur.
        </p>
      </Field>
    </div>
  );
}
