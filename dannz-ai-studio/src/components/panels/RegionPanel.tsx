import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatDimensions } from '../../utils';
import type { Region } from '../../types';

type Phase = 'idle' | 'drawing';

/** How an erase region was drawn: freehand brush (default) or a drag box. */
type ToolKind = 'stroke' | 'rect';

interface StrokeDraft {
  id: string;
  /** Normalised (0..1) points in image space. */
  points: { x: number; y: number }[];
}

interface BoxDraft {
  originX: number;
  originY: number;
  x: number;
  y: number;
}

/**
 * Manual region erase over the current cut-out.
 *
 * The brush is the primary tool: drag to paint, and each stroke is stored as a
 * normalised polyline plus a radius, so the erase stays valid at any zoom and
 * survives a re-render. Rectangles remain available for rough blocks. "Apply"
 * clears those pixels to transparency and commits the result as a new version.
 */
export function RegionPanel() {
  const { activeResult, regions, addRegion, removeRegion, clearRegions, applyRegionErase, isErasing } =
    useStudio();
  const { t } = useLanguage();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<ToolKind>('stroke');
  const [brushSize, setBrushSize] = useState(24); // % of a 900px reference width
  // `phase` is mirrored in a ref: pointer handlers fire outside React's render
  // cycle, so reading state directly can see a stale value mid-drag.
  // Drawing state lives in a ref: pointer handlers fire outside React's render
  // cycle, so reading state directly can see a stale value mid-drag.
  // `isDrawing` is kept only to repaint the cursor.
  const [isDrawing, setIsDrawing] = useState(false);
  const phaseRef = useRef<Phase>('idle');
  const strokeRef = useRef<StrokeDraft | null>(null);
  const boxRef = useRef<BoxDraft | null>(null);

  const beginPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setIsDrawing(next === 'drawing');
  }, []);

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
    const unit = w / 900; // keeps strokes visually consistent across image sizes

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const brushRadius = (radius: number | undefined) =>
      Math.max(2, (radius ?? brushSize / 900) * w);

    const paintRegion = (region: Region, dashed: boolean) => {
      ctx.fillStyle = dashed ? 'rgba(232, 107, 85, 0.45)' : 'rgba(214, 82, 58, 0.28)';
      ctx.strokeStyle = dashed ? '#e86b55' : '#D6523A';
      ctx.lineWidth = Math.max(1, unit);

      if (region.kind === 'stroke' && region.points?.length) {
        const radius = brushRadius(region.radius);
        ctx.beginPath();
        for (const point of region.points) {
          const px = point.x * w;
          const py = point.y * h;
          if (ctx.lineWidth === 0) ctx.moveTo(px, py);
          ctx.moveTo(px + radius, py);
          ctx.arc(px, py, radius, 0, Math.PI * 2);
        }
        ctx.fill();
        if (dashed) {
          ctx.setLineDash([unit * 6, unit * 6]);
          ctx.strokeStyle = '#e86b55';
          ctx.beginPath();
          region.points.forEach((p, i) => {
            const px = p.x * w;
            const py = p.y * h;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
        return;
      }

      ctx.fillRect(region.x, region.y, region.width, region.height);
      if (dashed) {
        ctx.setLineDash([unit * 6, unit * 6]);
        ctx.strokeRect(region.x, region.y, region.width, region.height);
        ctx.setLineDash([]);
      } else {
        ctx.strokeRect(region.x, region.y, region.width, region.height);
      }
    };

    for (const region of regions) paintRegion(region, false);

    // Live stroke while drawing.
    const stroke = strokeRef.current;
    if (stroke) {
      ctx.fillStyle = 'rgba(232, 107, 85, 0.5)';
      ctx.beginPath();
      for (const point of stroke.points) {
        const px = point.x * w;
        const py = point.y * h;
        const radius = brushRadius(brushSize / 900);
        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Live box while drawing.
    const box = boxRef.current;
    if (box) {
      const x = Math.min(box.originX, box.x);
      const y = Math.min(box.originY, box.y);
      const width = Math.abs(box.x - box.originX);
      const height = Math.abs(box.y - box.originY);
      ctx.fillStyle = 'rgba(232, 107, 85, 0.45)';
      ctx.fillRect(x, y, width, height);
      ctx.setLineDash([unit * 6, unit * 6]);
      ctx.strokeStyle = '#e86b55';
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
    }
  }, [regions, brushSize]);

  useEffect(redraw, [redraw, activeResult]);

  /* ------------------------------------------------------------ pointer */

  /** Client coordinates -> normalised image coordinates (0..1). */
  const toNormalised = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toNormalised(e.clientX, e.clientY);
      if (tool === 'stroke') {
        strokeRef.current = { id: `region-${Date.now()}`, points: [point] };
      } else {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        const w = canvas?.width || img?.naturalWidth || 0;
        const h = canvas?.height || img?.naturalHeight || 0;
        const px = point.x * w;
        const py = point.y * h;
        boxRef.current = { originX: px, originY: py, x: px, y: py };
      }
      beginPhase('drawing');
      // Capture keeps the stroke alive when the pointer leaves the canvas.
      // Not every environment allows it (and it throws for unknown ids), so
      // failure is non-fatal.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unavailable - drawing still works without it */
      }
      redraw();
    },
    [beginPhase, redraw, tool, toNormalised]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phaseRef.current !== 'drawing') return;
      const point = toNormalised(e.clientX, e.clientY);

      if (tool === 'stroke' && strokeRef.current) {
        const points = strokeRef.current.points;
        const last = points[points.length - 1];
        // Throttle: only append once the pointer moved a little.
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.004) {
          strokeRef.current.points.push(point);
          redraw();
        }
        return;
      }

      if (tool === 'rect' && boxRef.current) {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        const w = canvas?.width || img?.naturalWidth || 0;
        const h = canvas?.height || img?.naturalHeight || 0;
        boxRef.current.x = point.x * w;
        boxRef.current.y = point.y * h;
        redraw();
      }
    },
    [redraw, tool, toNormalised]
  );

  const finishDrawing = useCallback(() => {
    if (phaseRef.current !== 'drawing') return;
    beginPhase('idle');

    if (tool === 'stroke' && strokeRef.current) {
      const points = strokeRef.current.points;
      strokeRef.current = null;
      if (points.length >= 1) {
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        addRegion({
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: 'stroke',
          x: Math.round(Math.min(...xs) * 1000) / 1000,
          y: Math.round(Math.min(...ys) * 1000) / 1000,
          width: Math.round((Math.max(...xs) - Math.min(...xs)) * 1000) / 1000,
          height: Math.round((Math.max(...ys) - Math.min(...ys)) * 1000) / 1000,
          points,
          radius: brushSize / 900,
        });
      }
      redraw();
      return;
    }

    if (tool === 'rect' && boxRef.current) {
      const box = boxRef.current;
      boxRef.current = null;
      const x = Math.round(Math.min(box.originX, box.x));
      const y = Math.round(Math.min(box.originY, box.y));
      const width = Math.round(Math.abs(box.x - box.originX));
      const height = Math.round(Math.abs(box.y - box.originY));
      if (width >= 6 && height >= 6) {
        addRegion({
          id: `rect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: 'rect',
          x,
          y,
          width,
          height,
        });
      }
      redraw();
    }
  }, [addRegion, beginPhase, brushSize, redraw, tool]);

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

      {/* tool switch */}
          <div className="flex gap-1 rounded-xl bg-bg-primary/50 p-1 mica">
          <button
            type="button"
            onClick={() => setTool('stroke')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-bg-border/50 bg-bg-primary/50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out glow-hover ${
              tool === 'stroke' ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon name="brush" size={13} />
            {t('region.brush')}
          </button>
          <button
            type="button"
            onClick={() => setTool('rect')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-bg-border/50 bg-bg-primary/50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out glow-hover ${
              tool === 'rect' ? 'border-accent-primary bg-accent-primary/15 text-accent-primary option-active' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
          <Icon name="box" size={13} />
          {t('region.rect')}
        </button>
      </div>

      {/* brush size (brush mode only) */}
      {tool === 'stroke' && (
        <label className="block">
          <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
            {t('region.brushSize')}
            <span className="text-text-muted">{brushSize}px</span>
          </span>
          <input
            type="range"
            min={6}
            max={90}
            step={1}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="slider mt-1.5"
          />
        </label>
      )}

      {/* drawing surface */}
      <div className="checker relative overflow-hidden rounded-xl border border-bg-border/30 mica">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          className={`block w-full touch-none ${isDrawing ? 'cursor-crosshair' : 'cursor-crosshair'}`}
          aria-label={t('region.title')}
        />
        <img ref={imageRef} src={activeResult.resultDataUrl} alt="" className="hidden" />
        {regions.length > 0 && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-light">
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
              <Icon name={region.kind === 'stroke' ? 'brush' : 'box'} size={12} className="text-text-muted" />
              <span className="flex-1 font-mono text-[10px] text-text-secondary">
                {region.kind === 'stroke'
                  ? t('region.brushMeta', { points: region.points?.length ?? 0 })
                  : `${region.width}×${region.height} @ ${region.x},${region.y}`}
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
