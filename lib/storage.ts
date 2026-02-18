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
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        // Evict expired entries and largest cache keys, then retry once
        try {
          const keysToEvict: { key: string; size: number }[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              if (parsed.expiry && Date.now() > parsed.expiry) {
                localStorage.removeItem(k);
                continue;
              }
            } catch { /* not our format, skip */ }
            keysToEvict.push({ key: k, size: raw.length });
          }
          // Remove the 3 largest entries to free space
          keysToEvict.sort((a, b) => b.size - a.size);
          for (const entry of keysToEvict.slice(0, 3)) {
            localStorage.removeItem(entry.key);
          }
          // Retry
          const item = {
            value,
            expiry: expiryDays ? Date.now() + expiryDays * 24 * 60 * 60 * 1000 : null,
          };
          localStorage.setItem(key, JSON.stringify(item));
        } catch {
          // Still failing — silently give up
        }
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
