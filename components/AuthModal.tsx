"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTranslations } from "@/lib/hooks/useTranslations";

type Step = "email" | "code" | "success";

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const { login, verify } = useAuth();
  const t = useTranslations().auth;
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Focus the appropriate input on step change
  useEffect(() => {
    if (step === "email") emailRef.current?.focus();
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setError(null);
    setIsLoading(true);

    try {
      await login(email.trim());
      setStep("code");
    } catch (err) {
      if (err instanceof Error && err.message === "RATE_LIMITED") {
        setError(t.rateLimited);
      } else {
        setError(t.sendError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) return;
    setError(null);
    setIsLoading(true);

    try {
      await verify(email.trim(), code);
      setStep("success");
      // Auto-close after brief success state
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_CODE") {
        setError(t.invalidCode);
      } else {
        setError(t.verifyError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSendCode();
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleVerifyCode();
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
          <h2 className="text-lg font-bold text-content">{t.loginTitle}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-sunken text-content-muted transition-colors"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          {step === "email" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                {t.emailPrompt}
              </p>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                placeholder={t.emailPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="email"
                disabled={isLoading}
              />
              <button
                onClick={handleSendCode}
                disabled={!email.trim() || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.sending : t.sendCode}
              </button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                {t.codeSent}{" "}
                <span className="font-medium text-content">{email}</span>
              </p>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={handleCodeKeyDown}
                placeholder="000000"
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm text-center text-2xl tracking-[0.3em] font-mono"
                autoComplete="one-time-code"
                disabled={isLoading}
              />
              <button
                onClick={handleVerifyCode}
                disabled={code.length !== 6 || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.verifying : t.verify}
              </button>
              <button
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.changeEmail}
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
