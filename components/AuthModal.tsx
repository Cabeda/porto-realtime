"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTranslations } from "@/lib/hooks/useTranslations";

type Step = "signin" | "signup" | "success";

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const t = useTranslations().auth;
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus email input on step change
  useEffect(() => {
    emailRef.current?.focus();
  }, [step]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setError(null);
    setIsLoading(true);

    try {
      await signIn(email.trim(), password);
      setStep("success");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.sendError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !name.trim()) return;
    setError(null);
    setIsLoading(true);

    try {
      await signUp(email.trim(), password, name.trim());
      setStep("success");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.sendError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (step === "signin") handleSignIn();
      else if (step === "signup") handleSignUp();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.loginTitle}
    >
      <div className="bg-surface-raised rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-content">
            {step === "signup" ? t.signUpTitle : t.loginTitle}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-sunken text-content-muted transition-colors"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          {step === "signin" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                {t.emailPrompt}
              </p>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.emailPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="email"
                disabled={isLoading}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.passwordPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                onClick={handleSignIn}
                disabled={!email.trim() || !password || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.sending : t.login}
              </button>
              <button
                onClick={() => {
                  setStep("signup");
                  setError(null);
                }}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.noAccount}
              </button>
            </div>
          )}

          {step === "signup" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                {t.signUpPrompt}
              </p>
              <input
                ref={emailRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.namePlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="name"
                disabled={isLoading}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.emailPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="email"
                disabled={isLoading}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.passwordPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="new-password"
                disabled={isLoading}
              />
              <button
                onClick={handleSignUp}
                disabled={!email.trim() || !password || !name.trim() || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.sending : t.signUp}
              </button>
              <button
                onClick={() => {
                  setStep("signin");
                  setError(null);
                }}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.hasAccount}
              </button>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-4 space-y-2">
              <div className="text-4xl">✓</div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                {t.loginSuccess}
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-3 text-sm text-center py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
