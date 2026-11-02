"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Car, ChartLine, LogOut, PlugZap, Route, Settings2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Garage", icon: Car },
  { href: "/drives", label: "Drives", icon: Route },
  { href: "/charges", label: "Charges", icon: PlugZap },
  { href: "/history", label: "History", icon: ChartLine },
  { href: "/settings", label: "Connections", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const body = await response.json();
      if (body.needsSetup) {
        router.replace("/setup");
        return;
      }
      setUsername(body.username ?? null);
    })();
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="garage-grid pointer-events-none absolute inset-0 opacity-70" />
      <header className="safe-px relative z-20 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#e31937] text-sm font-semibold text-white">
              V
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-base tracking-tight">VoltDesk</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {username ? username : "Tesla"}
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm text-muted-foreground",
                    active && "bg-white/10 text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="safe-px safe-pb-nav relative z-10 mx-auto w-full max-w-6xl flex-1 py-5">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 text-[10px] text-muted-foreground",
                  active && "text-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-[#e31937]")} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
