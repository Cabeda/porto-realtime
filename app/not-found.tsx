"use client";

import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-surface-raised rounded-2xl shadow-lg p-8 text-center relative">
          <div className="absolute top-4 right-4">
            <DarkModeToggle />
          </div>

          <div className="text-7xl mb-2">🚌</div>
          <div className="text-2xl mb-6">💨</div>

          <h1 className="text-5xl font-black text-content mb-2">404</h1>
          <h2 className="text-xl font-bold text-content mb-4">O autocarro já passou.</h2>

          <p className="text-content-muted mb-2">
            Esta página não existe — ou saiu da paragem antes de chegares.
          </p>
          <p className="text-content-muted text-sm mb-8">Próxima paragem: a página principal.</p>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition-colors"
          >
            🗺️ Apanhar o próximo
          </Link>
        </div>
      </div>
    </div>
  );
}
