export interface ProcessingProgress {
  current: number;
  total: number;
  stage: string;
  message: string;
}

type ProgressListener = (progress: ProcessingProgress) => void;

class ProgressStore {
  private progress: ProcessingProgress = {
    current: 0,
    total: 0,
    stage: 'idle',
    message: '',
  };
  private listeners: ProgressListener[] = [];

  subscribe(listener: ProgressListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener({ ...this.progress }));
  }

  start(total: number, stage: string = 'processing'): void {
    this.progress = { current: 0, total, stage, message: 'Starting...' };
    this.notify();
  }

  update(current: number, message: string): void {
    this.progress.current = current;
    this.progress.message = message;
    this.notify();
  }

  setStage(stage: string, message: string): void {
    this.progress.stage = stage;
    this.progress.message = message;
    this.notify();
  }

  complete(): void {
    this.progress = {
      current: this.progress.total,
      total: this.progress.total,
      stage: 'complete',
      message: 'Done!',
    };
    this.notify();
  }

  reset(): void {
    this.progress = { current: 0, total: 0, stage: 'idle', message: '' };
    this.notify();
  }

  getSnapshot(): ProcessingProgress {
    return { ...this.progress };
  }
}

export const progressStore = new ProgressStore();

export function useProgress() {
  return {
    start: (total: number, stage?: string) => progressStore.start(total, stage),
    update: (current: number, message: string) => progressStore.update(current, message),
    setStage: (stage: string, message: string) => progressStore.setStage(stage, message),
    complete: () => progressStore.complete(),
    reset: () => progressStore.reset(),
  };
}