"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLocale } from "@/lib/i18n";
import { AuthModal } from "@/components/AuthModal";

interface SettingsModalProps {
  onClose: () => void;
  onResetOnboarding?: () => void;
  mapStyle?: string;
  onMapStyleChange?: (style: string) => void;
  showActivity?: boolean;
  onToggleActivity?: (show: boolean) => void;
  showAnimations?: boolean;
  onToggleAnimations?: (show: boolean) => void;
}

export function SettingsModal({ onClose, onResetOnboarding, mapStyle, onMapStyleChange, showActivity, onToggleActivity, showAnimations, onToggleAnimations }: SettingsModalProps) {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const { user, isAuthenticated, logout } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Close on Escape (but not when AuthModal is open)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showAuthModal) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, showAuthModal]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const toggleDarkMode = () => {
    const newValue = !isDark;
    setIsDark(newValue);
    if (newValue) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
    }
  };

  const initial = user ? (user.name?.[0] || user.email[0]).toUpperCase() : "";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[2000] flex items-end sm:items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-raised rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface-raised rounded-t-2xl">
          <h2 className="text-lg font-bold text-content">{t.settings.title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-sunken text-content-muted transition-colors text-lg"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Language */}
          <div>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
              {t.settings.language}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setLocale("pt")}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  locale === "pt"
                    ? "bg-accent text-content-inverse"
                    : "bg-surface-sunken text-content-secondary hover:bg-border"
                }`}
              >
                🇵🇹 Português
              </button>
              <button
                onClick={() => setLocale("en")}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  locale === "en"
                    ? "bg-accent text-content-inverse"
                    : "bg-surface-sunken text-content-secondary hover:bg-border"
                }`}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          {/* Theme */}
          <div>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
              {t.settings.theme}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => { if (isDark) toggleDarkMode(); }}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  !isDark
                    ? "bg-accent text-content-inverse"
                    : "bg-surface-sunken text-content-secondary hover:bg-border"
                }`}
              >
                ☀️ {t.settings.lightMode}
              </button>
              <button
                onClick={() => { if (!isDark) toggleDarkMode(); }}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  isDark
                    ? "bg-accent text-content-inverse"
                    : "bg-surface-sunken text-content-secondary hover:bg-border"
                }`}
              >
                🌙 {t.settings.darkMode}
              </button>
            </div>
          </div>

          {/* Account */}
          <div>

          {/* Map Style */}
          {mapStyle && onMapStyleChange && (
            <div>
              <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
                {t.settings.mapStyle}
              </h3>
              <div className="flex gap-2">
                {([
                  { key: "standard", label: t.settings.mapStandard, icon: "🗺️" },
                  { key: "satellite", label: t.settings.mapSatellite, icon: "🛰️" },
                  { key: "terrain", label: t.settings.mapTerrain, icon: "⛰️" },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => onMapStyleChange(key)}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                      mapStyle === key
                        ? "bg-accent text-white"
                        : "bg-surface-sunken text-content-secondary hover:bg-border"
                    }`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Activity Bubbles Toggle */}
          {onToggleActivity && (
            <div>
              <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
                {t.settings.showActivity}
              </h3>
              <button
                onClick={() => onToggleActivity(!showActivity)}
                className={`w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                  showActivity
                    ? "bg-accent text-white"
                    : "bg-surface-sunken text-content-secondary hover:bg-border"
                }`}
              >
                <span>✨ {t.settings.showActivityDesc}</span>
                <span className="text-lg">{showActivity ? "✓" : ""}</span>
              </button>

              {/* Animations sub-toggle — only visible when activity is on */}
              {showActivity && onToggleAnimations && (
                <button
                  onClick={() => onToggleAnimations(!showAnimations)}
                  className={`w-full mt-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                    showAnimations
                      ? "bg-emerald-500 text-white"
                      : "bg-surface-sunken text-content-secondary hover:bg-border"
                  }`}
                >
                  <span>🚲 {t.settings.showAnimationsDesc}</span>
                  <span className="text-lg">{showAnimations ? "✓" : ""}</span>
                </button>
              )}
            </div>
          )}

            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
              {t.auth.account}
            </h3>
            {isAuthenticated && user ? (
              <>
              <div className="flex items-center justify-between bg-surface-sunken rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-content-inverse text-sm font-bold flex-shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    {user.name && (
                      <p className="text-sm font-medium text-content truncate">{user.name}</p>
                    )}
                    <p className="text-xs text-content-muted truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsLoggingOut(true);
                    await logout();
                    setIsLoggingOut(false);
                  }}
                  disabled={isLoggingOut}
                  className="text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium flex-shrink-0 ml-2 disabled:opacity-50"
                >
                  {isLoggingOut ? t.auth.loggingOut : t.auth.logout}
                </button>
              </div>
              {/* GDPR: Export data + Delete account */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/account");
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `portomove-data-export-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      setToast(t.auth.exportDataError);
                    }
                  }}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-surface-sunken text-content-secondary hover:bg-border transition-colors"
                >
                  📥 {t.auth.exportData}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  🗑️ {t.auth.deleteAccount}
                </button>
              </div>
              {showDeleteConfirm && (
                <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-700 dark:text-red-300 mb-2">{t.auth.deleteAccountConfirm}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setIsDeleting(true);
                        try {
                          const res = await fetch("/api/account", { method: "DELETE" });
                          if (res.ok) {
                            await logout();
                            setToast(t.auth.deleteAccountSuccess);
                            onClose();
                          } else {
                            setToast(t.auth.deleteAccountError);
                          }
                        } catch {
                          setToast(t.auth.deleteAccountError);
                        } finally {
                          setIsDeleting(false);
                          setShowDeleteConfirm(false);
                        }
                      }}
                      disabled={isDeleting}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? t.auth.deleting : t.auth.deleteAccount}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-surface-sunken text-content-secondary hover:bg-border transition-colors"
                    >
                      {t.auth.close}
                    </button>
                  </div>
                </div>
              )}
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full py-2.5 px-3 rounded-lg text-sm font-medium bg-accent text-content-inverse hover:bg-accent-hover transition-colors"
              >
                {t.auth.login}
              </button>
            )}
          </div>

          {/* About */}
          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
              {t.settings.aboutProject}
            </h3>
            <p className="text-sm text-content-secondary mb-2">
              {t.settings.aboutDescription}
            </p>
            <p className="text-sm text-accent font-medium mb-3">
              {t.settings.missionStatement}
            </p>
            <div className="flex flex-col gap-2 mb-3">
              <a
                href="/reviews"
                className="inline-flex items-center gap-2 text-sm bg-accent/10 text-accent hover:bg-accent/20 rounded-lg px-3 py-2 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                {t.settings.ctaFeedback}
              </a>
              <a
                href="https://github.com/Cabeda/porto-realtime/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm bg-surface-secondary text-content-secondary hover:text-content-primary rounded-lg px-3 py-2 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {t.settings.ctaBugsFeatures}
              </a>
            </div>
            <p className="text-xs text-content-muted mb-3">
              {t.settings.developedBy}: José Cabeda
            </p>
            <a
              href="https://github.com/Cabeda/porto-realtime"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover font-medium"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              {t.settings.viewOnGithub}
            </a>
          </div>

          {/* Footer actions */}
          <div className="border-t border-border pt-4 space-y-2">
            <a
              href="/privacy"
              className="text-sm text-accent hover:text-accent-hover transition-colors block"
            >
              🔒 {t.settings.privacyPolicy}
            </a>
            {onResetOnboarding && (
              <button
                onClick={() => { onResetOnboarding(); onClose(); }}
                className="text-sm text-accent hover:text-accent-hover transition-colors"
              >
                🔄 {t.settings.resetOnboarding}
              </button>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted font-mono">
                {t.settings.version}: {process.env.NEXT_PUBLIC_APP_VERSION || "2.0.0"}
              </span>
              <span className="text-xs text-content-muted">
                {t.settings.dataProvider}
              </span>
            </div>
          </div>
        </div>
      </div>
      {showAuthModal && createPortal(
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />,
        document.body
      )}
      {toast && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] bg-surface-raised text-content text-sm font-medium px-4 py-2 rounded-xl shadow-lg border border-border animate-fade-in">
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}
