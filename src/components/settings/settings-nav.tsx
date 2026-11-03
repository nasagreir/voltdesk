"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings", label: "Connections" },
  { href: "/settings/bot", label: "Grok bot" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex w-full gap-1 overflow-x-auto" aria-label="Settings">
      {tabs.map((tab) => {
        const active = tab.href === "/settings" ? pathname === "/settings" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm text-muted-foreground",
              active && "bg-white/10 text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
