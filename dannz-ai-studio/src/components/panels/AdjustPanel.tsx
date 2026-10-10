import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Field, SelectRow, SliderRow, ToggleRow } from '../ui/Fields';
import { BACKGROUND_COLORS, DEFAULT_COLOR_ADJUSTMENTS, PRESETS } from '../../types';
import type { ColorAdjustments } from '../../types';

const ADJUSTMENT_ROWS: { key: keyof ColorAdjustments; labelKey: string; min: number; max: number }[] = [
  { key: 'brightness', labelKey: 'adjust.brightness', min: -100, max: 100 },
  { key: 'contrast', labelKey: 'adjust.contrast', min: -100, max: 100 },
  { key: 'saturation', labelKey: 'adjust.saturation', min: -100, max: 100 },
  { key: 'hue', labelKey: 'adjust.hue', min: -180, max: 180 },
  { key: 'exposure', labelKey: 'adjust.exposure', min: -100, max: 100 },
  { key: 'blur', labelKey: 'adjust.blur', min: 0, max: 20 },
  { key: 'sharpen', labelKey: 'adjust.sharpen', min: 0, max: 100 },
];

export function AdjustPanel() {
  const { options, setOptions, adjustments, setAdjustments, applyPreset } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="label-caps">{t('panel.adjust')}</h3>
          <button
            type="button"
            className="btn-ghost !px-2 !py-1 text-[10px]"
            onClick={() => setAdjustments(DEFAULT_COLOR_ADJUSTMENTS)}
          >
            {t('adjust.reset')}
          </button>
        </div>
        {ADJUSTMENT_ROWS.map((row) => (
          <SliderRow
            key={row.key}
            label={t(row.labelKey)}
            value={adjustments[row.key]}
            min={row.min}
            max={row.max}
            onChange={(value) => setAdjustments({ [row.key]: value } as Partial<ColorAdjustments>)}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="label-caps">{t('adjust.background')}</h3>
        <SelectRow
          label={t('adjust.background')}
          value={options.backgroundColor}
          onChange={(backgroundColor) => setOptions({ backgroundColor })}
          options={[
            { value: 'transparent', label: t('adjust.bgTransparent') },
            { value: 'white', label: t('adjust.bgWhite') },
            { value: 'black', label: t('adjust.bgBlack') },
            { value: 'slate', label: t('adjust.bgSlate') },
          ]}
        />
        <Field label={t('adjust.bgCustom')} htmlFor="custom-bg">
          <div className="flex gap-2">
            <input
              id="custom-bg"
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-bg-border bg-bg-secondary p-1"
              value={BACKGROUND_COLORS[options.backgroundColor] ?? '#ffffff'}
              onChange={(e) => setOptions({ backgroundColor: e.target.value })}
            />
            <input
              type="text"
              className="input font-mono text-xs"
              value={options.backgroundColor}
              onChange={(e) => setOptions({ backgroundColor: e.target.value })}
              placeholder="#RRGGBB"
            />
          </div>
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="label-caps">{t('panel.output')}</h3>
        <SelectRow
          label={t('adjust.format')}
          value={options.outputFormat}
          onChange={(outputFormat) => setOptions({ outputFormat })}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPG' },
            { value: 'webp', label: 'WebP' },
          ]}
        />
        <SliderRow
          label={t('adjust.quality')}
          value={options.quality}
          min={10}
          max={100}
          suffix="%"
          onChange={(quality) => setOptions({ quality })}
        />
        <SliderRow
          label={t('adjust.compress')}
          value={options.compressionLevel}
          min={10}
          max={100}
          suffix="%"
          onChange={(compressionLevel) => setOptions({ compressionLevel })}
        />
      </section>

      <section className="space-y-3">
        <ToggleRow
          label={t('adjust.resizeEnable')}
          checked={options.resizeEnabled}
          onChange={(resizeEnabled) => setOptions({ resizeEnabled })}
        />
        {options.resizeEnabled && (
          <div className="space-y-2 rounded-lg border border-bg-border bg-bg-primary/50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('adjust.width')} htmlFor="resize-w">
                <input
                  id="resize-w"
                  type="number"
                  min={1}
                  className="input font-mono text-xs"
                  value={options.resizeWidth ?? ''}
                  onChange={(e) =>
                    setOptions({ resizeWidth: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label={t('adjust.height')} htmlFor="resize-h">
                <input
                  id="resize-h"
                  type="number"
                  min={1}
                  className="input font-mono text-xs"
                  value={options.resizeHeight ?? ''}
                  onChange={(e) =>
                    setOptions({ resizeHeight: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
            </div>
            <ToggleRow
              label={t('adjust.maintainRatio')}
              checked={options.maintainAspectRatio}
              onChange={(maintainAspectRatio) => setOptions({ maintainAspectRatio })}
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SelectRow
          label={t('adjust.crop')}
          value={options.cropRatio}
          onChange={(cropRatio) => setOptions({ cropRatio })}
          options={[
            { value: 'original', label: t('adjust.crop.original') },
            { value: '1:1', label: t('adjust.crop.1:1') },
            { value: '16:9', label: t('adjust.crop.16:9') },
            { value: '4:3', label: t('adjust.crop.4:3') },
            { value: '3:2', label: t('adjust.crop.3:2') },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h3 className="label-caps">{t('presets.title')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn-secondary !px-2 !py-1.5 text-[11px]"
              title={preset.description}
              onClick={() => applyPreset(preset)}
            >
              {t(`presets.${preset.id}`)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
