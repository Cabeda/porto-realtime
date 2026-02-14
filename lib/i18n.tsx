"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

export type Locale = "pt" | "en";

const STORAGE_KEY = "portomove-locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "pt";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "pt") return saved;
    // Auto-detect from browser
    const browserLang = navigator.language.slice(0, 2);
    return browserLang === "pt" ? "pt" : "en";
  } catch {
    return "pt";
  }
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "pt",
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
