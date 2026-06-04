// Simple native IndexedDB utility for caching large datasets to bypass the 5MB localStorage limit.

export class IndexedDBCache {
  private dbName = "jc_tennis_cache_db";
  private storeName = "key_value_store";

  private getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve((request.result as T) || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("IndexedDB read failed, falling back:", e);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("IndexedDB write failed:", e);
    }
  }
}

export const cacheDb = new IndexedDBCache();
