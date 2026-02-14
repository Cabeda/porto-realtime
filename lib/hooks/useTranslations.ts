"use client";

import { useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import { getTranslations, type TranslationsType } from "@/lib/translations";

export function useTranslations(): TranslationsType {
  const { locale } = useLocale();
  return useMemo(() => getTranslations(locale), [locale]);
}
