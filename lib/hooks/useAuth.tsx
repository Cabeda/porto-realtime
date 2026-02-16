"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { authClient } from "@/lib/auth-client";

interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Sign up with email + password */
  signUp: (email: string, password: string, name: string) => Promise<void>;
  /** Sign in with email + password */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign in with a social provider (e.g. Google) */
  signInSocial: (provider: "google") => Promise<void>;
  /** Clear the session */
  logout: () => Promise<void>;
  /** Send email verification OTP */
  sendVerificationOtp: (email: string) => Promise<void>;
  /** Verify email with OTP */
  verifyEmail: (email: string, otp: string) => Promise<void>;
  /** Request password reset OTP */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Reset password with OTP + new password */
  resetPassword: (email: string, otp: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  signUp: async () => {},
  signIn: async () => {},
  signInSocial: async () => {},
  logout: async () => {},
  sendVerificationOtp: async () => {},
  verifyEmail: async () => {},
  requestPasswordReset: async () => {},
  resetPassword: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();

  const user: AuthUser | null = session.data?.user
    ? {
        id: session.data.user.id,
        email: session.data.user.email,
        name: session.data.user.name,
      }
    : null;

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (error) throw new Error(error.message ?? "Sign up failed");
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({
      email,
      password,
    });
    if (error) throw new Error(error.message ?? "Sign in failed");
  }, []);

  const signInSocial = useCallback(async (provider: "google") => {
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: window.location.href,
    });
    if (error) throw new Error(error.message ?? "Social sign in failed");
  }, []);

  const logout = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const sendVerificationOtp = useCallback(async (email: string) => {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (error) throw new Error(error.message ?? "Failed to send verification code");
  }, []);

  const verifyEmail = useCallback(async (email: string, otp: string) => {
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (error) throw new Error(error.message ?? "Email verification failed");
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await authClient.forgetPassword.emailOtp({ email });
    if (error) throw new Error(error.message ?? "Failed to send reset code");
  }, []);

  const resetPassword = useCallback(async (email: string, otp: string, password: string) => {
    const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
    if (error) throw new Error(error.message ?? "Password reset failed");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: session.isPending,
      isAuthenticated: !!user,
      signUp,
      signIn,
      signInSocial,
      logout,
      sendVerificationOtp,
      verifyEmail,
      requestPasswordReset,
      resetPassword,
    }),
    [user, session.isPending, signUp, signIn, signInSocial, logout, sendVerificationOtp, verifyEmail, requestPasswordReset, resetPassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
