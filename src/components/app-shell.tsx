"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Car, ChartLine, Clock3, LogOut, MapPin, Route, Settings2, Wrench } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Garage", icon: Car },
  { href: "/trips", label: "Trips", icon: Route },
  { href: "/timeline", label: "Timeline", icon: Clock3 },
  { href: "/reports", label: "Reports", icon: ChartLine },
  { href: "/places", label: "Places", icon: MapPin },
  { href: "/maintenance", label: "Service", icon: Wrench },
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
      <header className="safe-px safe-pt relative z-20 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="duo-header-row mx-auto flex w-full max-w-6xl items-center justify-between gap-2 py-3 short:py-1.5">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e31937] text-sm font-semibold text-white short:size-8">
              V
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-base tracking-tight">VoltDesk</span>
              <span className="block truncate text-[11px] text-muted-foreground short:hidden">
                {username ? username : "Tesla"}
              </span>
            </span>
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto min-[560px]:flex">
              {links.map((link) => {
                const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "shrink-0 rounded-full px-2 py-1.5 text-[13px] text-muted-foreground min-[720px]:px-2.5 min-[720px]:text-sm min-[900px]:px-3",
                      active && "bg-white/10 text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="safe-px safe-pb-nav relative z-10 mx-auto w-full max-w-6xl flex-1 py-5 short:py-2">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/95 backdrop-blur min-[560px]:hidden">
        <div className="grid grid-cols-7 px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
          {links.map((link) => {
            const Icon = link.icon;
            const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] text-muted-foreground",
                  active && "text-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active && "text-[#e31937]")} />
                <span className="w-full truncate text-center">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
