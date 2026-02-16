"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { AuthModal } from "@/components/AuthModal";

/**
 * Compact user menu: shows login button when unauthenticated,
 * or user avatar + name when authenticated.
 */
export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const t = useTranslations().auth;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!isAuthenticated || !user) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-accent hover:text-accent-hover hover:bg-surface-sunken rounded-lg transition-colors"
        >
          {t.login}
        </button>
        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => setShowAuthModal(false)}
          />
        )}
      </>
    );
  }

  const initial = (user.name?.[0] || user.email[0]).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-content-inverse text-sm font-bold hover:opacity-90 transition-opacity"
        title={user.name || user.email}
        aria-label={`${t.account}: ${user.name || user.email}`}
      >
        {initial}
      </button>

      {showDropdown && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-20"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-10 z-30 bg-surface-raised rounded-lg shadow-xl border border-border py-2 min-w-[200px]">
            <div className="px-3 py-2 border-b border-border">
              {user.name && (
                <p className="text-sm font-medium text-content truncate">{user.name}</p>
              )}
              <p className="text-xs text-content-muted truncate">{user.email}</p>
            </div>
            <button
              onClick={async () => {
                setIsLoggingOut(true);
                await logout();
                setShowDropdown(false);
                setIsLoggingOut(false);
              }}
              disabled={isLoggingOut}
              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-surface-sunken transition-colors disabled:opacity-50"
            >
              {isLoggingOut ? t.loggingOut : t.logout}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
