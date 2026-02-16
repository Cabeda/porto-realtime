"use client";

import { LocaleProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/hooks/useAuth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AuthProvider>{children}</AuthProvider>
    </LocaleProvider>
  );
}
