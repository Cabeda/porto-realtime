"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";

export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();

  const links = [
    { href: "/", label: t.nav.map, icon: "🗺️", match: (p: string) => p === "/" },
    { href: "/stations", label: t.nav.stations, icon: "🚏", match: (p: string) => p.startsWith("/station") },
    { href: "/community", label: t.nav.community, icon: "🗣️", match: (p: string) => p.startsWith("/community") || p.startsWith("/reviews") || p.startsWith("/proposals") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1000] bg-surface dark:bg-surface-raised border-t border-border sm:hidden safe-area-bottom">
      <div className="flex items-stretch">
        {links.map((link) => {
          const active = link.match(pathname || "");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                active
                  ? "text-accent"
                  : "text-content-muted hover:text-content-secondary"
              }`}
            >
              <span className="text-lg leading-none">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
