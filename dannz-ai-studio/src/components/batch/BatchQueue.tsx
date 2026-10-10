import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatBytes } from '../../utils';

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-text-muted border-bg-border',
  processing: 'text-accent-primary border-accent-primary/50',
  done: 'text-success border-success/50',
  failed: 'text-error border-error/50',
};

export function BatchQueue() {
  const {
    files,
    queueStatus,
    removeFile,
    clearFiles,
    processBatch,
    downloadAllZip,
    isProcessing,
    results,
    setActiveFileId,
  } = useStudio();
  const { t } = useLanguage();

  const doneCount = files.filter((f) => queueStatus[f.id] === 'done').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-bg-border px-4 py-2.5">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-text-primary">
          {t('batch.title')}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {t('batch.progress', { done: doneCount, total: files.length })}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={processBatch}
          disabled={isProcessing || !files.length}
          className="btn-primary !px-3 !py-1.5 text-xs"
        >
          <Icon name="brain" size={14} />
          {t('batch.processAll')}
        </button>
        <button
          type="button"
          onClick={downloadAllZip}
          disabled={!results.length}
          className="btn-secondary !px-3 !py-1.5 text-xs"
        >
          <Icon name="download-cloud" size={14} />
          {t('batch.downloadZip')}
        </button>
        <button
          type="button"
          onClick={clearFiles}
          disabled={!files.length}
          className="btn-ghost !px-3 !py-1.5 text-xs"
        >
          <Icon name="trash" size={14} />
          {t('batch.clear')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center">
              <Icon name="layers" size={36} className="mx-auto text-text-muted" />
              <p className="mt-3 font-mono text-xs text-text-muted">{t('batch.empty')}</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-bg-border">
            {files.map((file, index) => {
              const status = queueStatus[file.id] ?? 'pending';
              const result = results.find((r) => r.originalName === file.name);
              return (
                <li
                  key={file.id}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-secondary/60"
                >
                  <span className="w-6 text-center font-mono text-[11px] text-text-muted">
                    {index + 1}
                  </span>
                  <img
                    src={file.dataUrl}
                    alt=""
                    className="h-10 w-10 rounded border border-bg-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-ui text-sm text-text-primary">{file.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {formatBytes(file.size)} · {file.width}×{file.height}
                      {result && ` → ${formatBytes(result.resultSize)}`}
                    </p>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_STYLE[status]}`}
                  >
                    {t(`batch.${status}`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveFileId(file.id)}
                    className="toolbar-btn !p-1.5"
                    title={t('nav.single')}
                    aria-label={t('nav.single')}
                  >
                    <Icon name="image" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="toolbar-btn !p-1.5 hover:text-error"
                    title={t('batch.remove')}
                    aria-label={t('batch.remove')}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
