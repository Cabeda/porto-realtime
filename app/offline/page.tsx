"use client";

import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function Offline() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="absolute top-4 right-4">
            <DarkModeToggle />
          </div>

          <div className="text-6xl mb-6">📡</div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Sem Ligação</h1>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Não foi possível conectar à internet. Algumas funcionalidades podem estar limitadas.
          </p>

          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-left">
            <h2 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">ℹ️ Modo Offline</h2>
            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <li>• Dados em cache podem estar desatualizados</li>
              <li>• Favoritos continuam disponíveis</li>
              <li>• Volte online para dados em tempo real</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold"
            >
              🔄 Tentar Novamente
            </button>

            <Link
              href="/"
              className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-semibold text-center"
            >
              🗺️ Ir para o Mapa
            </Link>

            <Link
              href="/stations"
              className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-semibold text-center"
            >
              📍 Ver Estações
            </Link>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
            Os dados podem estar em cache. Última atualização: {new Date().toLocaleString("pt-PT")}
          </p>
        </div>
      </div>
    </div>
  );
}
