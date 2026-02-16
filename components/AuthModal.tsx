"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTranslations } from "@/lib/hooks/useTranslations";

type Step = "signin" | "signup" | "verify-email" | "forgot-password" | "reset-password" | "success";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const { signIn, signUp, sendVerificationOtp, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
  const t = useTranslations().auth;
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input on step change
  useEffect(() => {
    firstInputRef.current?.focus();
  }, [step]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /** Map API error messages to user-friendly translated strings */
  function mapError(err: unknown): string {
    const msg = err instanceof Error ? err.message : "";
    const lower = msg.toLowerCase();
    if (lower.includes("invalid") && (lower.includes("email") || lower.includes("password"))) {
      return t.invalidCredentials;
    }
    if (lower.includes("already") || lower.includes("exists") || lower.includes("duplicate")) {
      return t.emailAlreadyInUse;
    }
    if (lower.includes("password") && (lower.includes("short") || lower.includes("length") || lower.includes("least"))) {
      return t.passwordTooShort;
    }
    return msg || t.sendError;
  }

  function validateEmail(): boolean {
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(t.invalidEmail);
      return false;
    }
    return true;
  }

  function validatePassword(pw: string = password): boolean {
    if (pw.length < MIN_PASSWORD_LENGTH) {
      setError(t.passwordTooShort);
      return false;
    }
    return true;
  }

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setError(null);
    if (!validateEmail() || !validatePassword()) return;
    setIsLoading(true);

    try {
      await signIn(email.trim(), password);
      setStep("success");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !name.trim()) return;
    setError(null);
    if (!validateEmail() || !validatePassword()) return;
    setIsLoading(true);

    try {
      await signUp(email.trim(), password, name.trim());
      // After sign-up, send verification OTP and go to verify step
      try {
        await sendVerificationOtp(email.trim());
      } catch {
        // If OTP send fails, still proceed — user can resend
      }
      setOtp("");
      setStep("verify-email");
    } catch (err) {
      setError(mapError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!otp.trim()) return;
    setError(null);
    setIsLoading(true);

    try {
      await verifyEmail(email.trim(), otp.trim());
      setStep("success");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch {
      setError(t.verifyError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      await sendVerificationOtp(email.trim());
      setInfo(t.otpSent);
    } catch {
      setError(t.otpSendError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) return;
    setError(null);
    if (!validateEmail()) return;
    setIsLoading(true);

    try {
      await requestPasswordReset(email.trim());
      setOtp("");
      setNewPassword("");
      setInfo(t.resetCodeSent);
      setStep("reset-password");
    } catch (err) {
      setError(mapError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp.trim() || !newPassword) return;
    setError(null);
    if (!validatePassword(newPassword)) return;
    setIsLoading(true);

    try {
      await resetPassword(email.trim(), otp.trim(), newPassword);
      setInfo(null);
      setStep("success");
      // Don't auto-close — let user go back to sign in
    } catch {
      setError(t.resetError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (step === "signin") handleSignIn();
      else if (step === "signup") handleSignUp();
      else if (step === "verify-email") handleVerifyEmail();
      else if (step === "forgot-password") handleForgotPassword();
      else if (step === "reset-password") handleResetPassword();
    }
  };

  const passwordInput = (autoComplete: string, value: string, onChange: (v: string) => void, placeholder: string = t.passwordPlaceholder) => (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        autoComplete={autoComplete}
        disabled={isLoading}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content transition-colors"
        aria-label={showPassword ? t.hidePassword : t.showPassword}
        tabIndex={-1}
      >
        {showPassword ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );

  const title = step === "signup" ? t.signUpTitle
    : step === "verify-email" ? t.verifyEmailTitle
    : step === "forgot-password" || step === "reset-password" ? t.resetPasswordTitle
    : t.loginTitle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-surface-raised rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-content">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-sunken text-content-muted transition-colors"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* Sign In */}
          {step === "signin" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">{t.emailPrompt}</p>
              <input
                ref={firstInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.emailPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="email"
                disabled={isLoading}
              />
              {passwordInput("current-password", password, setPassword)}
              <button
                onClick={handleSignIn}
                disabled={!email.trim() || !password || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.sending : t.login}
              </button>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep("forgot-password"); setError(null); setInfo(null); }}
                  className="text-sm text-content-muted hover:text-accent transition-colors"
                >
                  {t.forgotPassword}
                </button>
                <button
                  onClick={() => { setStep("signup"); setError(null); setInfo(null); }}
                  className="text-sm text-content-muted hover:text-accent transition-colors"
                >
                  {t.noAccount}
                </button>
              </div>
            </div>
          )}

          {/* Sign Up */}
          {step === "signup" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">{t.signUpPrompt}</p>
              <input
                ref={firstInputRef}
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
              <div>
                {passwordInput("new-password", password, setPassword)}
                <p className="text-xs text-content-muted mt-1">{t.passwordHint}</p>
              </div>
              <button
                onClick={handleSignUp}
                disabled={!email.trim() || !password || !name.trim() || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.sending : t.signUp}
              </button>
              <button
                onClick={() => { setStep("signin"); setError(null); setInfo(null); }}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.hasAccount}
              </button>
            </div>
          )}

          {/* Email Verification (OTP) */}
          {step === "verify-email" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">{t.verifyEmailPrompt}</p>
              <p className="text-xs text-content-muted">{email}</p>
              <input
                ref={firstInputRef}
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={handleKeyDown}
                placeholder={t.otpPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm text-center tracking-widest text-lg"
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={isLoading}
              />
              <button
                onClick={handleVerifyEmail}
                disabled={otp.length < 6 || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.verifying : t.verify}
              </button>
              <button
                onClick={handleResendOtp}
                disabled={isLoading}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.resendOtp}
              </button>
            </div>
          )}

          {/* Forgot Password — enter email */}
          {step === "forgot-password" && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">{t.resetPasswordPrompt}</p>
              <input
                ref={firstInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.emailPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoComplete="email"
                disabled={isLoading}
              />
              <button
                onClick={handleForgotPassword}
                disabled={!email.trim() || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.sendingResetCode : t.sendResetCode}
              </button>
              <button
                onClick={() => { setStep("signin"); setError(null); setInfo(null); }}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.backToSignIn}
              </button>
            </div>
          )}

          {/* Reset Password — enter OTP + new password */}
          {step === "reset-password" && (
            <div className="space-y-4">
              <p className="text-xs text-content-muted">{email}</p>
              <input
                ref={firstInputRef}
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={handleKeyDown}
                placeholder={t.otpPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm text-center tracking-widest text-lg"
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={isLoading}
              />
              <div>
                {passwordInput("new-password", newPassword, setNewPassword, t.newPasswordPlaceholder)}
                <p className="text-xs text-content-muted mt-1">{t.passwordHint}</p>
              </div>
              <button
                onClick={handleResetPassword}
                disabled={otp.length < 6 || !newPassword || isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
              >
                {isLoading ? t.resettingPassword : t.resetPassword}
              </button>
              <button
                onClick={() => { setStep("signin"); setError(null); setInfo(null); }}
                className="w-full text-sm text-content-muted hover:text-accent transition-colors"
              >
                {t.backToSignIn}
              </button>
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="text-center py-4 space-y-2">
              <div className="text-4xl">✓</div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                {t.loginSuccess}
              </p>
              {/* After password reset, show link back to sign in */}
              {newPassword && (
                <button
                  onClick={() => { setStep("signin"); setError(null); setInfo(null); setNewPassword(""); setOtp(""); }}
                  className="text-sm text-accent hover:text-accent-hover transition-colors mt-2"
                >
                  {t.backToSignIn}
                </button>
              )}
            </div>
          )}

          {/* Info message */}
          {info && (
            <div className="mt-3 text-sm text-center py-2 px-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {info}
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
