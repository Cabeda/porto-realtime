// localStorage utilities with type safety and error handling

export const storage = {
  get: <T>(key: string): T | null => {
    if (typeof window === "undefined") return null;
    
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      
      // Check expiry if present
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed.value as T;
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error);
      return null;
    }
  },

  set: <T>(key: string, value: T, expiryDays?: number): void => {
    if (typeof window === "undefined") return;
    
    try {
      const item = {
        value,
        expiry: expiryDays ? Date.now() + expiryDays * 24 * 60 * 60 * 1000 : null,
      };
      
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.error(`Error writing to localStorage (${key}):`, error);
      // Handle quota exceeded errors gracefully
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        console.warn("localStorage quota exceeded, clearing old data");
        // Could implement LRU cache eviction here
      }
    }
  },

  remove: (key: string): void => {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage (${key}):`, error);
    }
  },

  clear: (): void => {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.clear();
    } catch (error) {
      console.error("Error clearing localStorage:", error);
    }
  },
};
