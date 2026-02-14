"use client";

import { useState } from "react";
import type { RouteInfo } from "@/lib/types";

interface OnboardingFlowProps {
  availableRoutes: RouteInfo[];
  onComplete: (selectedRoutes: string[], locationGranted: boolean) => void;
  onSkip: () => void;
}

export function OnboardingFlow({ availableRoutes, onComplete, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  const toggleRoute = (route: string) => {
    setSelectedRoutes(prev =>
      prev.includes(route)
        ? prev.filter(r => r !== route)
        : [...prev, route]
    );
  };

  const busRoutes = availableRoutes.filter((r) => r.mode === "BUS");
  const metroRoutes = availableRoutes.filter((r) => r.mode === "SUBWAY");

  const handleLocationRequest = () => {
    setIsRequestingLocation(true);
    
    if (!navigator.geolocation) {
      // No geolocation support, skip to completion
      setTimeout(() => {
        onComplete(selectedRoutes, false);
      }, 500);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        // Location granted - complete onboarding
        setTimeout(() => {
          onComplete(selectedRoutes, true);
        }, 500);
      },
      (error) => {
        // Location denied or error - still complete onboarding
        console.error("Onboarding location error:", error.code, error.message);
        setTimeout(() => {
          onComplete(selectedRoutes, false);
        }, 500);
      },
      {
        // More lenient settings for better Android/Firefox compatibility
        enableHighAccuracy: false, // Use network location (faster, more reliable)
        timeout: 15000, // 15 seconds instead of 5s
        maximumAge: 60000, // Accept 1-minute-old cached location
      }
    );
  };

  const handleSkipRoutes = () => {
    setStep(2);
  };

  const handleContinueWithRoutes = () => {
    if (selectedRoutes.length > 0) {
      setStep(2);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center space-y-8 animate-fade-in">
            <div className="space-y-4">
              <div className="text-7xl mb-4 animate-bounce-slow">🚌</div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                PortoMove
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md mx-auto">
                Acompanhe os autocarros do Porto em tempo real
              </p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl">
              <ul className="space-y-3 text-left">
                <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <span className="text-2xl">🗺️</span>
                  <span>Mapa em tempo real</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <span className="text-2xl">⭐</span>
                  <span>Linhas favoritas</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <span className="text-2xl">📍</span>
                  <span>Paragens próximas</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <span className="text-2xl">🌙</span>
                  <span>Modo escuro</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold text-lg shadow-lg transition-all transform hover:scale-105"
            >
              Começar
            </button>
            <button
              onClick={onSkip}
              className="mt-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
            >
              Saltar tudo
            </button>
          </div>
        )}

        {/* Step 1: Select Routes */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="text-5xl mb-2">🎯</div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Quais linhas usa?
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Selecione as suas linhas favoritas para começar
              </p>
            </div>

            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">
              {/* Scroll hint */}
              <div className="px-6 pt-4 pb-2 bg-gradient-to-b from-white/95 to-transparent dark:from-gray-800/95 sticky top-0 z-10">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  ↓ Role para ver todas as linhas ↓
                </p>
              </div>
              
              {/* Scrollable route grid */}
              <div className="px-6 pb-4 max-h-[50vh] overflow-y-auto">
                {busRoutes.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      🚌 Autocarros ({busRoutes.length})
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {busRoutes.map(route => (
                        <button
                          key={route.gtfsId}
                          onClick={() => toggleRoute(route.shortName)}
                          className={`py-3 px-4 rounded-xl font-semibold text-sm transition-all transform ${
                            selectedRoutes.includes(route.shortName)
                              ? "bg-blue-600 text-white shadow-md scale-105"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                          }`}
                          title={route.longName}
                        >
                          {route.shortName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {metroRoutes.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      🚇 Metro ({metroRoutes.length})
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {metroRoutes.map(route => (
                        <button
                          key={route.gtfsId}
                          onClick={() => toggleRoute(route.shortName)}
                          className={`py-3 px-4 rounded-xl font-semibold text-sm transition-all transform ${
                            selectedRoutes.includes(route.shortName)
                              ? "bg-blue-600 text-white shadow-md scale-105"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                          }`}
                          title={route.longName}
                        >
                          {route.shortName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Selection counter - sticky at bottom */}
              {selectedRoutes.length > 0 && (
                <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 sticky bottom-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center font-medium">
                    ✓ {selectedRoutes.length} linha{selectedRoutes.length > 1 ? 's' : ''} selecionada{selectedRoutes.length > 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkipRoutes}
                className="flex-1 py-4 px-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-2xl font-semibold transition-all"
              >
                Saltar
              </button>
              <button
                onClick={handleContinueWithRoutes}
                disabled={selectedRoutes.length === 0}
                className="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Location Permission */}
        {step === 2 && (
          <div className="space-y-8 animate-fade-in text-center">
            <div className="space-y-3">
              <div className="text-6xl mb-4">📍</div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Encontrar paragens próximas
              </h2>
              <p className="text-gray-600 dark:text-gray-300 max-w-sm mx-auto">
                Permitir acesso à localização para ver as paragens mais próximas de si
              </p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl">
              <div className="space-y-4">
                <div className="flex items-start gap-3 text-left">
                  <span className="text-2xl">🔒</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      Privacidade garantida
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      A sua localização nunca é guardada ou partilhada
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-left">
                  <span className="text-2xl">⚡</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      Totalmente opcional
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Pode usar a app sem partilhar a localização
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleLocationRequest}
                disabled={isRequestingLocation}
                className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold text-lg shadow-lg transition-all transform hover:scale-105 disabled:opacity-50"
              >
                {isRequestingLocation ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⏳</span>
                    A processar...
                  </span>
                ) : (
                  'Permitir Localização'
                )}
              </button>
              <button
                onClick={() => onComplete(selectedRoutes, false)}
                className="w-full py-3 px-6 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
