import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatDimensions } from '../../utils';
import type { Region } from '../../types';

type Phase = 'idle' | 'drawing';

interface Draft {
  originX: number;
  originY: number;
  x: number;
  y: number;
}

/**
 * Manual region erase. Draw rectangles straight over the current cut-out; each
 * rectangle is stored in the image's own pixel space so the same coordinates
 * stay valid at any zoom level. "Apply" clears those pixels to transparency.
 */
export function RegionPanel() {
  const { activeResult, regions, addRegion, removeRegion, clearRegions, applyRegionErase, isErasing } =
    useStudio();
  const { t } = useLanguage();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const draftRef = useRef<Draft | null>(null);

  /* ------------------------------------------------------------ rendering */

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Existing erase rectangles.
    ctx.fillStyle = 'rgba(214, 82, 58, 0.28)';
    ctx.strokeStyle = '#D6523A';
    ctx.lineWidth = Math.max(1, w / 900);
    for (const r of regions) {
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
    }

    // In-progress rectangle.
    const draft = draftRef.current;
    if (draft) {
      const x = Math.min(draft.originX, draft.x);
      const y = Math.min(draft.originY, draft.y);
      const width = Math.abs(draft.x - draft.originX);
      const height = Math.abs(draft.y - draft.originY);
      ctx.fillStyle = 'rgba(214, 82, 58, 0.45)';
      ctx.fillRect(x, y, width, height);
      ctx.setLineDash([w / 220, w / 220]);
      ctx.strokeStyle = '#e86b55';
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
    }
  }, [regions]);

  useEffect(redraw, [redraw, activeResult]);

  /* ------------------------------------------------------------ pointer */

  /** Client coordinates -> image pixel coordinates. */
  const toImageSpace = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = toImageSpace(e.clientX, e.clientY);
      draftRef.current = { originX: x, originY: y, x, y };
      setPhase('drawing');
      e.currentTarget.setPointerCapture(e.pointerId);
      redraw();
    },
    [redraw, toImageSpace]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phase !== 'drawing' || !draftRef.current) return;
      const { x, y } = toImageSpace(e.clientX, e.clientY);
      draftRef.current.x = x;
      draftRef.current.y = y;
      redraw();
    },
    [phase, redraw, toImageSpace]
  );

  const handlePointerUp = useCallback(() => {
    const draft = draftRef.current;
    draftRef.current = null;
    setPhase('idle');
    if (!draft) return;

    const x = Math.round(Math.min(draft.originX, draft.x));
    const y = Math.round(Math.min(draft.originY, draft.y));
    const width = Math.round(Math.abs(draft.x - draft.originX));
    const height = Math.round(Math.abs(draft.y - draft.originY));

    // Ignore stray taps.
    if (width >= 6 && height >= 6) {
      addRegion({ id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, x, y, width, height });
    } else {
      redraw();
    }
  }, [addRegion, redraw]);

  /* -------------------------------------------------------------- render */

  if (!activeResult) {
    return (
      <div className="space-y-4">
        <h3 className="label-caps">{t('region.title')}</h3>
        <div className="rounded-lg border border-dashed border-bg-border p-6 text-center">
          <Icon name="brush" size={26} className="mx-auto text-text-muted" />
          <p className="mt-2 font-mono text-xs text-text-muted">{t('region.needResult')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">{t('region.title')}</h3>
        <span className="font-mono text-[10px] text-text-muted">
          {formatDimensions(activeResult.width, activeResult.height)}
        </span>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-muted">{t('region.hint')}</p>

      {/* drawing surface */}
      <div className="checker relative overflow-hidden rounded-lg border border-bg-border">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="block w-full cursor-crosshair touch-none"
          aria-label={t('region.title')}
        />
        <img ref={imageRef} src={activeResult.resultDataUrl} alt="" className="hidden" />
        {regions.length > 0 && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
            {t('region.count', { count: regions.length })}
          </span>
        )}
      </div>

      {/* region list */}
      {regions.length > 0 && (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto">
          {regions.map((region: Region, index: number) => (
            <li
              key={region.id}
              className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-primary/60 px-2 py-1.5"
            >
              <span className="w-5 text-center font-mono text-[10px] text-text-muted">{index + 1}</span>
              <span className="flex-1 font-mono text-[10px] text-text-secondary">
                {region.width}×{region.height} @ {region.x},{region.y}
              </span>
              <button
                type="button"
                onClick={() => removeRegion(region.id)}
                className="toolbar-btn !p-1 hover:text-error"
                aria-label={t('region.remove')}
                title={t('region.remove')}
              >
                <Icon name="trash" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void applyRegionErase()}
          disabled={!regions.length || isErasing}
          className="btn-primary flex-1 text-xs"
        >
          <Icon name="eraser" size={13} />
          {isErasing ? t('process.processing') : t('region.apply')}
        </button>
        <button
          type="button"
          onClick={clearRegions}
          disabled={!regions.length || isErasing}
          className="btn-ghost !px-3 text-xs"
        >
          {t('region.clear')}
        </button>
      </div>
    </div>
  );
}