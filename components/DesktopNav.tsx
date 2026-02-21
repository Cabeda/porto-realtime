"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";

const NAV_ITEMS = [
  { href: "/", key: "map" as const, icon: "🗺️" },
  { href: "/stations", key: "stations" as const, icon: "🚏" },
  { href: "/analytics", key: "analytics" as const, icon: "📊" },
  { href: "/community", key: "community" as const, icon: "⭐" },
];

export function DesktopNav() {
  const t = useTranslations();
  const pathname = usePathname() || "";

  return (
    <div className="hidden sm:flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              active
                ? "text-accent bg-accent-subtle"
                : "text-content-secondary hover:text-accent hover:bg-surface-sunken"
            }`}
          >
            {item.icon} {t.nav[item.key]}
          </Link>
        );
      })}
    </div>
  );
}
