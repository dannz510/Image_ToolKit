import { useEffect, useState } from 'react';
import { toastStore, type Toast } from '../../utils/toast';
import { Icon } from './Icon';

const TYPE_STYLES: Record<Toast['type'], { cls: string; icon: string }> = {
  success: { cls: 'border-success/40 text-success', icon: 'save' },
  error: { cls: 'border-error/40 text-error', icon: 'info' },
  warning: { cls: 'border-warning/40 text-warning', icon: 'info' },
  info: { cls: 'border-accent-primary/40 text-accent-primary', icon: 'info' },
};

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => toastStore.subscribe(setToasts), []);

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-14 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`glass pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-card animate-rise-in ${style.cls}`}
          >
            <Icon name={style.icon} size={15} className="mt-0.5" />
            <p className="flex-1 font-ui leading-snug text-text-primary">
              {toastStore.resolve(toast)}
            </p>
            <button
              type="button"
              onClick={() => toastStore.remove(toast.id)}
              className="toolbar-btn !p-1"
              aria-label="Dismiss"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
