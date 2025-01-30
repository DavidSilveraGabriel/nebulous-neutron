// src/utils/storage.ts

export interface StorageProvider {
    setItem(key: string, value: string): void;
    getItem(key: string): string | null;
  }
  
  
  export class LocalStorageProvider implements StorageProvider {
    setItem(key: string, value: string): void {
      if (typeof localStorage !== 'undefined') {
         localStorage.setItem(key, value);
      }
    }
  
    getItem(key: string): string | null {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return null;
    }
  }
  
  export class InMemoryStorageProvider implements StorageProvider {
    private storage: Map<string, string> = new Map();
    
    setItem(key: string, value: string): void {
      this.storage.set(key, value);
    }
  
    getItem(key: string): string | null {
      return this.storage.get(key) || null;
    }
  }
  
  export const getStorageProvider = (): StorageProvider => {
      // Detect if we're in a browser environment
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        return new LocalStorageProvider();
      } else {
        // If not browser use InMemoryStorage
        return new InMemoryStorageProvider();
      }
    };
  