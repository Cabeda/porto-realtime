"use client";

import { useEffect, useState } from "react";

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope);
          
          // Check for updates periodically (every 60 seconds)
          setInterval(() => {
            registration.update();
          }, 60000);

          // Listen for update found
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available
                console.log('[PWA] New version available');
                setUpdateAvailable(true);
                setShowUpdatePrompt(true);
              }
            });
          });

          // Initial update check
          registration.update();
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error);
        });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('[PWA] Service Worker updated to version:', event.data.version);
          // Show update notification
          setUpdateAvailable(true);
          setShowUpdatePrompt(true);
        }
      });

      // Listen for controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] New Service Worker activated, reloading page...');
        // Reload the page to get the latest content
        window.location.reload();
      });
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default browser install prompt
      e.preventDefault();
      
      // Store the event for later use
      setDeferredPrompt(e);
      
      // Check if user has dismissed the prompt before
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Cleanup
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
    console.log('[PWA] User choice:', outcome);

    // Clear the prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleUpdate = () => {
    setShowUpdatePrompt(false);
    
    // Tell the waiting service worker to skip waiting and activate immediately
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          // If no waiting worker, just reload
          window.location.reload();
        }
      });
    }
  };

  const handleDismissUpdate = () => {
    setShowUpdatePrompt(false);
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
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                  Instalar Porto Realtime
                </h3>
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

      {/* Update Prompt */}
      {showUpdatePrompt && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[10000] max-w-md w-full px-4">
          <div className="bg-green-50 dark:bg-green-900/30 rounded-lg shadow-2xl border-2 border-green-500 dark:border-green-600 p-4">
            <div className="flex items-start gap-3">
              <div className="text-3xl">🔄</div>
              <div className="flex-1">
                <h3 className="font-bold text-green-900 dark:text-green-100 mb-1">
                  Nova Versão Disponível
                </h3>
                <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                  Uma nova versão da aplicação está disponível. Atualize para obter as últimas funcionalidades.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdate}
                    className="px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm font-semibold"
                  >
                    Atualizar Agora
                  </button>
                  <button
                    onClick={handleDismissUpdate}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-semibold"
                  >
                    Mais tarde
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
