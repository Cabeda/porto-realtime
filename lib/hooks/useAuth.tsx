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
  /** Clear the session */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  signUp: async () => {},
  signIn: async () => {},
  logout: async () => {},
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

  const logout = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: session.isPending,
      isAuthenticated: !!user,
      signUp,
      signIn,
      logout,
    }),
    [user, session.isPending, signUp, signIn, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
