"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
/** Returns true only on the client after hydration. */
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function DarkModeToggle() {
  const mounted = useMounted();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("darkMode");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return stored ? stored === "true" : prefersDark;
  });

  // Sync DOM class with state
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

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

  // Prevent flash by not rendering until mounted
  if (!mounted) {
    return (
      <button className="p-2 rounded-lg bg-surface-sunken w-10 h-10">
        <span className="text-xl">☀️</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleDarkMode}
      className="p-2 rounded-lg bg-surface-sunken hover:bg-border transition-colors"
      aria-label="Toggle dark mode"
      title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
    >
      <span className="text-xl">{isDark ? "🌙" : "☀️"}</span>
    </button>
  );
}
