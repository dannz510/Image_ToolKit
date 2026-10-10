import { ImageFile, ProcessedResult, HistoryEntry, Toast } from '../types';

const DB_NAME = 'dannz-ai-studio';
const DB_VERSION = 1;
const STORES = {
  IMAGES: 'images',
  RESULTS: 'results',
  SETTINGS: 'settings',
  HISTORY: 'history',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

class IndexedDBManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.IMAGES)) {
          db.createObjectStore(STORES.IMAGES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.RESULTS)) {
          db.createObjectStore(STORES.RESULTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.HISTORY)) {
          db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async set<T extends object>(store: StoreName, key: string, value: T): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      const request = objectStore.put({ id: key, ...value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(store: StoreName, key: string): Promise<T | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const objectStore = tx.objectStore(store);
      const request = objectStore.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const objectStore = tx.objectStore(store);
      const request = objectStore.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(store: StoreName, key: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      const request = objectStore.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(store: StoreName): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      const request = objectStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new IndexedDBManager();

export const storage = {
  async saveImage(image: ImageFile): Promise<void> {
    await db.set(STORES.IMAGES, image.id, image);
  },

  async getImage(id: string): Promise<ImageFile | null> {
    return db.get<ImageFile>(STORES.IMAGES, id);
  },

  async getAllImages(): Promise<ImageFile[]> {
    return db.getAll<ImageFile>(STORES.IMAGES);
  },

  async deleteImage(id: string): Promise<void> {
    await db.delete(STORES.IMAGES, id);
  },

  async saveResult(result: ProcessedResult): Promise<void> {
    await db.set(STORES.RESULTS, result.id, result);
  },

  async getResult(id: string): Promise<ProcessedResult | null> {
    return db.get<ProcessedResult>(STORES.RESULTS, id);
  },

  async getAllResults(): Promise<ProcessedResult[]> {
    return db.getAll<ProcessedResult>(STORES.RESULTS);
  },

  async deleteResult(id: string): Promise<void> {
    await db.delete(STORES.RESULTS, id);
  },

  async clearResults(): Promise<void> {
    await db.clear(STORES.RESULTS);
  },

  async saveSetting(key: string, value: unknown): Promise<void> {
    await db.set(STORES.SETTINGS, key, { value });
  },

  async getSetting<T>(key: string): Promise<T | null> {
    const result = await db.get<{ value: T }>(STORES.SETTINGS, key);
    return result ? result.value : null;
  },

  async addHistoryEntry(entry: HistoryEntry): Promise<void> {
    await db.set(STORES.HISTORY, entry.id, entry);
  },

  async getHistory(): Promise<HistoryEntry[]> {
    return db.getAll<HistoryEntry>(STORES.HISTORY);
  },

  async clearHistory(): Promise<void> {
    await db.clear(STORES.HISTORY);
  },
};

export const localStorageManager = {
  getKey(prefix: string, id: string): string {
    return `${prefix}-${id}`;
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  },

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.warn('Failed to read from localStorage:', e);
      return null;
    }
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    localStorage.clear();
  },
};

export const toastManager = {
  create(toast: Omit<Toast, 'id'>): Toast {
    return { ...toast, id: generateId() };
  },
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
