import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import { BRUSH_PROFILES, type BrushType } from '../../types';

const BRUSH_TYPES: BrushType[] = ['brush', 'pen', 'pencil', 'marker', 'airbrush'];

/** A compact HSV colour wheel rendered with a conic-gradient disc. */
function ColorWheel({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-20 w-20 shrink-0 rounded-full border border-bg-border"
        style={{
          background:
            'conic-gradient(from 0deg, #ff004d, #ff9500, #ffe600, #4cff00, #00ffb3, #00b3ff, #4d00ff, #ff00d4, #ff004d)',
        }}
        aria-hidden="true"
      >
        <span className="absolute inset-[26%] rounded-full border border-bg-border bg-bg-primary" />
      </div>
      <div className="flex-1 space-y-2">
        <label className="flex items-center gap-2">
          <span className="label-caps w-16">Pick</span>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#D6523A'}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border border-bg-border bg-bg-secondary p-1"
            aria-label="Brush colour"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="label-caps w-16">Hex</span>
          <input
            type="text"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#RRGGBB"
            className="input !py-1 font-mono text-[11px]"
          />
        </label>
      </div>
    </div>
  );
}

/** Brush panel: colour, size, opacity and the brush family. */
export function BrushPanel() {
  const { brushSettings, setBrushSettings } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Icon name="brush" size={15} className="text-accent-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-text-primary">
          {t('tool.brush')}
        </h3>
      </div>

      <ColorWheel color={brushSettings.color} onChange={(color) => setBrushSettings({ color })} />

      <label className="block">
        <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
          {t('brush.size')}
          <span className="text-text-muted">{brushSettings.size}px</span>
        </span>
        <input
          type="range"
          min={2}
          max={180}
          step={1}
          value={brushSettings.size}
          onChange={(e) => setBrushSettings({ size: Number(e.target.value) })}
          className="slider mt-1.5"
        />
      </label>

      <label className="block">
        <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
          {t('brush.opacity')}
          <span className="text-text-muted">{Math.round(brushSettings.opacity * 100)}%</span>
        </span>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(brushSettings.opacity * 100)}
          onChange={(e) => setBrushSettings({ opacity: Number(e.target.value) / 100 })}
          className="slider mt-1.5"
        />
      </label>

      <div>
        <span className="label-caps">{t('brush.type')}</span>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {BRUSH_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setBrushSettings({ type })}
              className={`flex items-center gap-2 rounded-lg border border-bg-border/50 bg-bg-primary/30 px-2.5 py-2 text-left transition-all duration-200 ease-out glow-hover ${
                brushSettings.type === type
                  ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active'
                  : 'border-bg-border text-text-secondary hover:border-text-muted hover:text-text-primary'
              }`}
              aria-pressed={brushSettings.type === type}
            >
              <Icon name="brush" size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t(`brush.${type}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Live preview of the stroke this configuration produces. */}
      <div>
        <span className="label-caps">{t('brush.preview')}</span>
        <div className="checker mt-2 flex h-20 items-center justify-center overflow-hidden rounded-lg border border-bg-border">
          <svg width="150" height="46" viewBox="0 0 150 46" aria-hidden="true">
            <path
              d="M6 30 C 40 4, 70 44, 104 20 S 138 8, 144 26"
              fill="none"
              stroke={brushSettings.color}
              strokeWidth={Math.max(1, brushSettings.size * (BRUSH_PROFILES[brushSettings.type]?.widthScale ?? 1) * 0.4)}
              strokeLinecap="round"
              opacity={brushSettings.opacity * (BRUSH_PROFILES[brushSettings.type]?.alpha ?? 1)}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Crop panel: aspect lock, the live readout and the apply action. */
export function CropPanel() {
  const { cropBox, setCropAspect, applyCrop } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Icon name="crop" size={15} className="text-accent-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-text-primary">
          {t('tool.crop')}
        </h3>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-muted">{t('crop.hint')}</p>

      <div>
        <span className="label-caps">{t('crop.ratio')}</span>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(
            [
              ['original', null],
              ['1:1', 1],
              ['16:9', 16 / 9],
              ['4:3', 4 / 3],
              ['3:2', 3 / 2],
              ['9:16', 9 / 16],
            ] as [string, number | null][]
          ).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => setCropAspect(value)}
              className="rounded-lg border border-bg-border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-bg-border bg-bg-primary/50 p-3">
        <span className="label-caps">{t('crop.selection')}</span>
        <p className="mt-1 font-mono text-xs text-text-primary">
          {cropBox ? `${cropBox.width} x ${cropBox.height} px` : t('crop.none')}
        </p>
      </div>

      <button
        type="button"
        onClick={applyCrop}
        disabled={!cropBox}
        className="btn-primary w-full disabled:opacity-40"
      >
        <Icon name="crop" size={14} />
        {t('crop.apply')}
      </button>
    </div>
  );
}

/** Shape panel: which shape, fill and stroke. */
export function ShapePanel() {
  const { shapeSettings, setShapeSettings } = useStudio();
  const { t } = useLanguage();

  const kinds = [
    ['rect', 'shape.rect'],
    ['ellipse', 'shape.ellipse'],
    ['line', 'shape.line'],
    ['arrow', 'shape.arrow'],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Icon name="shape" size={15} className="text-accent-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-text-primary">
          {t('tool.shape')}
        </h3>
      </div>

      <div>
        <span className="label-caps">{t('shape.kind')}</span>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {kinds.map(([kind, labelKey]) => (
            <button
              key={kind}
              type="button"
              onClick={() => setShapeSettings({ kind: kind as typeof shapeSettings.kind })}
              className={`flex items-center gap-2 rounded-lg border border-bg-border/50 bg-bg-primary/30 px-2.5 py-2 transition-all duration-200 ease-out glow-hover ${
                shapeSettings.kind === kind
                  ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active'
                  : 'border-bg-border text-text-secondary hover:border-text-muted hover:text-text-primary'
              }`}
              aria-pressed={shapeSettings.kind === kind}
            >
              <Icon name="shape" size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wider">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
          {t('shape.strokeWidth')}
          <span className="text-text-muted">{shapeSettings.strokeWidth}px</span>
        </span>
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={shapeSettings.strokeWidth}
          onChange={(e) => setShapeSettings({ strokeWidth: Number(e.target.value) })}
          className="slider mt-1.5"
        />
      </label>

      <div className="space-y-2">
        <span className="label-caps">{t('shape.fill')}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShapeSettings({ fill: 'none' })}
            className={`flex-1 rounded-lg border border-bg-border/50 bg-bg-primary/30 px-2 py-1.5 text-[11px] uppercase tracking-wider transition-all duration-200 ease-out glow-hover ${
              shapeSettings.fill === 'none'
                ? 'border-accent-primary text-accent-primary'
                : 'border-bg-border text-text-secondary'
            }`}
          >
            {t('shape.fillNone')}
          </button>
          <input
            type="color"
            value={shapeSettings.fill === 'none' ? '#ffffff' : shapeSettings.fill}
            onChange={(e) => setShapeSettings({ fill: e.target.value })}
            className="h-9 w-14 cursor-pointer rounded border border-bg-border bg-bg-secondary p-1"
            aria-label={t('shape.fillColor')}
          />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <span className="label-caps w-16">{t('shape.stroke')}</span>
        <input
          type="color"
          value={shapeSettings.stroke}
          onChange={(e) => setShapeSettings({ stroke: e.target.value })}
          className="h-8 w-12 cursor-pointer rounded border border-bg-border bg-bg-secondary p-1"
        />
        <input
          type="text"
          value={shapeSettings.stroke}
          onChange={(e) => setShapeSettings({ stroke: e.target.value })}
          className="input !py-1 font-mono text-[11px]"
          placeholder="#RRGGBB"
        />
      </label>
    </div>
  );
}

/** Text panel: font family, size, weight, colour and alignment. */
export function TextPanel() {
  const { textSettings, setTextSettings } = useStudio();
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Icon name="text" size={15} className="text-accent-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-text-primary">
          {t('tool.text')}
        </h3>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-muted">{t('text.hint')}</p>

      <div>
        <span className="label-caps">{t('text.font')}</span>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(
            [
              ['display', 'Oswald'],
              ['ui', 'Barlow'],
              ['mono', 'Mono'],
            ] as const
          ).map(([family, label]) => (
            <button
              key={family}
              type="button"
              onClick={() => setTextSettings({ fontFamily: family })}
              className={`rounded-lg border border-bg-border/50 bg-bg-primary/30 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out glow-hover ${
                textSettings.fontFamily === family
                  ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active'
                  : 'border-bg-border text-text-secondary hover:border-text-muted hover:text-text-primary'
              }`}
              aria-pressed={textSettings.fontFamily === family}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
          {t('text.size')}
          <span className="text-text-muted">{textSettings.fontSize}px</span>
        </span>
        <input
          type="range"
          min={10}
          max={280}
          step={1}
          value={textSettings.fontSize}
          onChange={(e) => setTextSettings({ fontSize: Number(e.target.value) })}
          className="slider mt-1.5"
        />
      </label>

      <div>
        <span className="label-caps">{t('text.weight')}</span>
        <div className="mt-2 flex gap-1.5">
          {([400, 700] as const).map((weight) => (
            <button
              key={weight}
              type="button"
              onClick={() => setTextSettings({ fontWeight: weight })}
              className={`flex-1 rounded-lg border border-bg-border/50 bg-bg-primary/30 px-2 py-1.5 text-[11px] uppercase tracking-wider transition-all duration-200 ease-out glow-hover ${
                textSettings.fontWeight === weight
                  ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active'
                  : 'border-bg-border text-text-secondary hover:border-text-muted hover:text-text-primary'
              }`}
              aria-pressed={textSettings.fontWeight === weight}
            >
              {weight === 700 ? t('text.bold') : t('text.regular')}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2">
        <span className="label-caps w-16">{t('text.color')}</span>
        <input
          type="color"
          value={textSettings.color}
          onChange={(e) => setTextSettings({ color: e.target.value })}
          className="h-8 w-12 cursor-pointer rounded border border-bg-border bg-bg-secondary p-1"
        />
        <input
          type="text"
          value={textSettings.color}
          onChange={(e) => setTextSettings({ color: e.target.value })}
          className="input !py-1 font-mono text-[11px]"
          placeholder="#RRGGBB"
        />
      </label>

      <div>
        <span className="label-caps">{t('text.align')}</span>
        <div className="mt-2 flex gap-1.5">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => setTextSettings({ align })}
              className={`flex-1 rounded-lg border border-bg-border/50 bg-bg-primary/30 px-2 py-1.5 text-[11px] uppercase tracking-wider transition-all duration-200 ease-out glow-hover ${
                textSettings.align === align
                  ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active'
                  : 'border-bg-border text-text-secondary hover:border-text-muted hover:text-text-primary'
              }`}
              aria-pressed={textSettings.align === align}
            >
              {t(`text.${align}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
