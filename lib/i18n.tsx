"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

export type Locale = "pt" | "en";

const STORAGE_KEY = "portomove-locale";
const DEFAULT_LOCALE: Locale = "pt";

function getSavedLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "pt") return saved;
    // Auto-detect from browser
    const browserLang = navigator.language.slice(0, 2);
    return browserLang === "pt" ? "pt" : "en";
  } catch {
    return DEFAULT_LOCALE;
  }
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Always start with the default to match server-rendered HTML
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Sync from localStorage after hydration
  useEffect(() => {
    const saved = getSavedLocale();
    if (saved !== DEFAULT_LOCALE) {
      setLocaleState(saved);
    }
    document.documentElement.lang = saved;
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
