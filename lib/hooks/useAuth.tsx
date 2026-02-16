"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { getAnonymousId } from "@/lib/anonymous-id";

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Request a magic link OTP for the given email */
  login: (email: string) => Promise<void>;
  /** Verify the OTP code and create a session */
  verify: (email: string, code: string) => Promise<AuthUser>;
  /** Clear the session */
  logout: () => Promise<void>;
  /** Refresh the auth state */
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  verify: async () => {
    throw new Error("Not initialized");
  },
  logout: async () => {},
  refresh: () => {},
});

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return { user: null };
  return res.json();
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<{ user: AuthUser | null }>(
    "/api/auth/me",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      errorRetryCount: 1,
    }
  );

  const user = data?.user ?? null;

  const login = useCallback(async (email: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "LOGIN_FAILED");
    }
  }, []);

  const verify = useCallback(
    async (email: string, code: string): Promise<AuthUser> => {
      const anonId = getAnonymousId();

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, anonId }),
      });

      if (res.status === 401) throw new Error("INVALID_CODE");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "VERIFY_FAILED");
      }

      const data = await res.json();
      // Refresh the auth state
      await mutate({ user: data.user }, false);
      return data.user;
    },
    [mutate]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await mutate({ user: null }, false);
  }, [mutate]);

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      verify,
      logout,
      refresh,
    }),
    [user, isLoading, login, verify, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
