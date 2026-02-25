"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("");

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[PWA] Service Worker registered:", registration.scope);

          // More aggressive update checking - every 30 seconds
          setInterval(() => {
            console.log("[PWA] Checking for updates...");
            registration.update();
          }, 30000);

          // Listen for update found
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            console.log("[PWA] Update found, new worker installing...");

            newWorker.addEventListener("statechange", () => {
              console.log("[PWA] New worker state:", newWorker.state);
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New service worker available
                console.log("[PWA] New version available - showing update prompt");
                setUpdateAvailable(true);
                setShowUpdatePrompt(true);
              }
            });
          });

          // Initial update check
          registration.update();
        })
        .catch((error) => {
          console.error("[PWA] Service Worker registration failed:", error);
        });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "SW_UPDATED") {
          console.log("[PWA] Service Worker updated to version:", event.data.version);
          setCurrentVersion(event.data.version || "");
          // Show update notification
          setUpdateAvailable(true);
          setShowUpdatePrompt(true);
        }
      });

      // Listen for controller change (new SW activated)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("[PWA] New Service Worker activated, reloading page...");
        // Reload the page to get the latest content
        window.location.reload();
      });
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default browser install prompt
      e.preventDefault();

      // Store the event for later use
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Check if user has dismissed the prompt before
      const dismissed = localStorage.getItem("pwa-install-dismissed");
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Cleanup
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    console.log("[PWA] User choice:", outcome);

    // Clear the prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  const handleUpdate = () => {
    setShowUpdatePrompt(false);

    // Tell the waiting service worker to skip waiting and activate immediately
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting) {
          console.log("[PWA] Telling waiting worker to skip waiting...");
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        } else {
          // If no waiting worker, just reload
          console.log("[PWA] No waiting worker, forcing reload...");
          window.location.reload();
        }
      });
    } else {
      // Fallback: just reload
      window.location.reload();
    }
  };

  const handleDismissUpdate = () => {
    setShowUpdatePrompt(false);
    // Show again in 5 minutes if user dismisses
    setTimeout(
      () => {
        if (updateAvailable) {
          setShowUpdatePrompt(true);
        }
      },
      5 * 60 * 1000
    );
  };

  return (
    <>
      {/* Install Prompt */}
      {showPrompt && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[10000] max-w-md w-full px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start gap-3">
              <div className="text-3xl">📱</div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Instalar PortoMove</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Adicione ao ecrã inicial para acesso rápido e funcionalidades offline
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleInstall}
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm font-semibold"
                  >
                    Instalar
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-semibold"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Prompt - Persistent and more visible */}
      {showUpdatePrompt && (
        <div className="fixed top-0 left-0 right-0 z-[10001] bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
          <div className="max-w-screen-xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-2xl animate-bounce">🎉</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-sm sm:text-base">
                    Nova Versão Disponível!
                    {currentVersion && (
                      <span className="ml-2 text-xs opacity-90">v{currentVersion}</span>
                    )}
                  </h3>
                  <p className="text-xs sm:text-sm text-green-50 hidden sm:block">
                    Clique em atualizar para obter as últimas melhorias
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={handleUpdate}
                  className="px-4 py-2 bg-white text-green-600 rounded-lg hover:bg-green-50 transition-colors text-sm font-bold shadow-md"
                >
                  ✨ Atualizar
                </button>
                <button
                  onClick={handleDismissUpdate}
                  className="px-3 py-2 bg-green-600/50 hover:bg-green-600/70 text-white rounded-lg transition-colors text-sm"
                  title="Lembrar mais tarde"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
