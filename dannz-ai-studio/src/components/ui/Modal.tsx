import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useLanguage } from '../../contexts/LanguageContext';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

/**
 * Overlay dialog.
 *
 * Rendered through a portal into <body> on purpose: the TopBar applies
 * `backdrop-blur`, which creates a containing block for `position: fixed`
 * descendants. Rendering the modal inline would clip it to the 56px header
 * instead of the viewport. The portal escapes every stacking and filter
 * context, so `z-index` and `inset-0` behave as intended.
 */
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: ModalProps) {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog for keyboard and screen-reader users.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`panel mica my-auto flex w-full ${width} max-h-[calc(100vh-2rem)] flex-col overflow-hidden outline-none`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-bg-border/40 px-5 py-3.5">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            className="toolbar-btn glow-hover"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-bg-border/40 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
