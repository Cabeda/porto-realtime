"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLocale } from "@/lib/i18n";
import { AuthModal } from "@/components/AuthModal";

interface SettingsModalProps {
  onClose: () => void;
  onResetOnboarding?: () => void;
}

export function SettingsModal({ onClose, onResetOnboarding }: SettingsModalProps) {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const { user, isAuthenticated, logout } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[2000] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
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
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
              {t.auth.account}
            </h3>
            {isAuthenticated && user ? (
              <div className="flex items-center justify-between bg-surface-sunken rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-content-inverse text-sm font-bold flex-shrink-0">
                    {user.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content truncate">{user.email}</p>
                    <p className="text-xs text-content-muted">{t.auth.loggedInAs}</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await logout();
                  }}
                  className="text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium flex-shrink-0 ml-2"
                >
                  {t.auth.logout}
                </button>
              </div>
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
            <p className="text-sm text-content-secondary mb-3">
              {t.settings.aboutDescription}
            </p>
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
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}
