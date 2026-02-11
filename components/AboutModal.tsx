"use client";

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[2000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sobre o Projeto</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 text-gray-700 dark:text-gray-300">
          <p>
            <strong>Porto Explore</strong> é uma aplicação web que fornece informações de transportes públicos em tempo real para o Porto, Portugal.
          </p>

          <div>
            <p className="font-semibold mb-2">Desenvolvido por:</p>
            <p>José Cabeda</p>
          </div>

          <div>
            <p className="font-semibold mb-2">Características:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Localização de autocarros em tempo real</li>
              <li>Horários de paragens</li>
              <li>Visualização de rotas</li>
              <li>Modo escuro</li>
              <li>PWA com suporte offline</li>
            </ul>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <a
              href="https://github.com/Cabeda/porto-realtime"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              Ver no GitHub
            </a>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 pt-2">
            Dados fornecidos pela API OpenTripPlanner do Porto
          </div>

          <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 font-mono">
            Versão: {process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0'}
          </div>
        </div>
      </div>
    </div>
  );
}
