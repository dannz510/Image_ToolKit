import { useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Modal } from '../ui/Modal';
import { Field, SelectRow, SliderRow } from '../ui/Fields';
import { Icon } from '../ui/Icon';
import { sanitizeFilename } from '../../utils';
import { convertFormat, resizeImage, applyBackgroundColor } from '../../services/api';

/**
 * Export dialog: pick format/quality/scale/background, preview the effect and
 * download the active result (or every result at once).
 */
export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeResult, results, options, setOptions, downloadResult, downloadAllZip } = useStudio();
  const { t } = useLanguage();
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>(options.outputFormat);
  const [quality, setQuality] = useState(options.quality);
  const [scale, setScale] = useState(100);
  const [background, setBackground] = useState<'transparent' | 'white' | 'black'>('transparent');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const buildPreview = async () => {
    if (!activeResult) return;
    setBusy(true);
    try {
      let blob: Blob = activeResult.resultBlob;
      if (background !== 'transparent' || format !== 'png') {
        blob = await applyBackgroundColor(blob, background, format, quality);
      }
      if (scale !== 100) {
        blob = await resizeImage(
          blob,
          Math.round(activeResult.width * (scale / 100)),
          Math.round(activeResult.height * (scale / 100)),
          true
        );
      }
      blob = await convertFormat(blob, format, quality);
      const url = URL.createObjectURL(blob);
      setPreview(url);
    } catch {
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!activeResult) return;
    setOptions({ outputFormat: format, quality });
    if (preview) {
      const a = document.createElement('a');
      a.href = preview;
      a.download = `${sanitizeFilename(activeResult.originalName)}-danz.${format}`;
      a.click();
    } else {
      await downloadResult(activeResult.id);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('export.title')}
      width="max-w-xl"
      footer={
        <>
          {results.length > 1 && (
            <button
              type="button"
              onClick={() => {
                void downloadAllZip();
                onClose();
              }}
              className="btn-secondary text-xs"
            >
              <Icon name="download-cloud" size={14} />
              {t('export.downloadAll', { count: results.length })}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            {t('common.close')}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!activeResult || busy}
            className="btn-primary text-xs"
          >
            <Icon name="download" size={14} />
            {t('export.download')}
          </button>
        </>
      }
    >
      {!activeResult ? (
        <p className="py-6 text-center font-mono text-xs text-text-muted">
          {t('toast.noSelection')}
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-4">
            <Field label={t('export.fileName')} htmlFor="export-name">
              <input
                id="export-name"
                className="input font-mono text-xs"
                defaultValue={`${sanitizeFilename(activeResult.originalName)}-danz`}
              />
            </Field>
            <SelectRow
              label={t('export.format')}
              value={format}
              onChange={(next) => {
                setFormat(next);
                setPreview(null);
              }}
              options={[
                { value: 'png', label: 'PNG — transparent' },
                { value: 'jpg', label: 'JPG — smallest' },
                { value: 'webp', label: 'WebP — modern' },
              ]}
            />
            <SliderRow
              label={t('export.quality')}
              value={quality}
              min={10}
              max={100}
              suffix="%"
              onChange={(next) => {
                setQuality(next);
                setPreview(null);
              }}
            />
            <SliderRow
              label={t('export.scale')}
              value={scale}
              min={10}
              max={200}
              suffix="%"
              onChange={(next) => {
                setScale(next);
                setPreview(null);
              }}
            />
            <SelectRow
              label={t('export.background')}
              value={background}
              onChange={(next) => {
                setBackground(next);
                setPreview(null);
              }}
              options={[
                { value: 'transparent', label: t('adjust.bgTransparent') },
                { value: 'white', label: t('adjust.bgWhite') },
                { value: 'black', label: t('adjust.bgBlack') },
              ]}
            />
            <button type="button" onClick={buildPreview} className="btn-secondary w-full text-xs">
              <Icon name="image" size={14} />
              {t('export.preview')}
            </button>
          </div>

          <div className="space-y-2">
            <p className="label-caps">{t('export.preview')}</p>
            <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-bg-border">
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-contain" />
              ) : (
                <img
                  src={activeResult.resultDataUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {t('export.estimated')}:{' '}
              {formatBytes(activeResult.resultSize)} → {format} @ {quality}% · {scale}%
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
