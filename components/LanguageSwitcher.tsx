"use client";

import { useLocale, type Locale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  const toggle = () => {
    setLocale(locale === "pt" ? "en" : "pt");
  };

  return (
    <button
      onClick={toggle}
      className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      title={locale === "pt" ? "Switch to English" : "Mudar para Português"}
      aria-label={locale === "pt" ? "Switch to English" : "Mudar para Português"}
    >
      {locale === "pt" ? "EN" : "PT"}
    </button>
  );
}
