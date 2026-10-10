import { dictionaries } from '../i18n';
import type { Language } from '../contexts/LanguageContext';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  /** Either a literal message or an i18n key (e.g. "toast.apiOnline"). */
  message: string;
  vars?: Record<string, string | number>;
  duration?: number;
}

type ToastListener = (toasts: Toast[]) => void;

let currentLang: Language = 'en';

/** Called by LanguageContext so toast keys render in the active language. */
export function setToastLanguage(lang: Language): void {
  currentLang = lang;
}

function translate(key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLang] as Record<string, string>;
  let value = dict[key] ?? (dictionaries.en as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}

class ToastStore {
  private toasts: Toast[] = [];
  private listeners: ToastListener[] = [];

  subscribe(listener: ToastListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  add(toast: Omit<Toast, 'id'>): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    };
    this.toasts.push(newToast);
    this.notify();
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => this.remove(id), newToast.duration);
    }
    return id;
  }

  remove(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear(): void {
    this.toasts = [];
    this.notify();
  }

  success(message: string, vars?: Record<string, string | number>, duration?: number): string {
    return this.add({ type: 'success', message, vars, duration });
  }

  error(message: string, vars?: Record<string, string | number>, duration?: number): string {
    return this.add({ type: 'error', message, vars, duration });
  }

  warning(message: string, vars?: Record<string, string | number>, duration?: number): string {
    return this.add({ type: 'warning', message, vars, duration });
  }

  info(message: string, vars?: Record<string, string | number>, duration?: number): string {
    return this.add({ type: 'info', message, vars, duration });
  }

  /** Resolve a toast's message for display. */
  resolve(toast: Toast): string {
    return translate(toast.message, toast.vars);
  }
}

export const toastStore = new ToastStore();

export function useToast() {
  return {
    success: (message: string, vars?: Record<string, string | number>, duration?: number) =>
      toastStore.success(message, vars, duration),
    error: (message: string, vars?: Record<string, string | number>, duration?: number) =>
      toastStore.error(message, vars, duration),
    warning: (message: string, vars?: Record<string, string | number>, duration?: number) =>
      toastStore.warning(message, vars, duration),
    info: (message: string, vars?: Record<string, string | number>, duration?: number) =>
      toastStore.info(message, vars, duration),
    remove: (id: string) => toastStore.remove(id),
    clear: () => toastStore.clear(),
  };
}
