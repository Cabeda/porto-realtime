"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">😵</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Algo correu mal
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
          Ocorreu um erro inesperado. Tente novamente ou volte ao mapa.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 font-mono">
            Ref: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Tentar novamente
          </button>
          <Link
            href="/"
            className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm text-center"
          >
            Voltar ao mapa
          </Link>
        </div>
      </div>
    </div>
  );
}
