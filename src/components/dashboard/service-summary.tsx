"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MaintenancePayload, ServiceStatus } from "@/lib/types";

const STATUS_LABEL: Record<ServiceStatus, string> = {
  due: "Due",
  soon: "Soon",
  ok: "OK",
  unset: "Not set",
};

function badgeVariant(status: ServiceStatus): "destructive" | "outline" | "secondary" {
  if (status === "due") return "destructive";
  if (status === "ok") return "secondary";
  return "outline";
}

export function ServiceSummary() {
  const [payload, setPayload] = useState<MaintenancePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/maintenance", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load service");
      setPayload(body as MaintenancePayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load service");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const attention = payload?.items.filter((item) => item.status === "due" || item.status === "soon").length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Service</CardTitle>
        <Link href="/maintenance" className="text-sm text-muted-foreground underline underline-offset-2">
          Open
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {!payload && !error && <p className="text-sm text-muted-foreground">Reading the service list…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {payload && (
          <>
            <p className="text-sm text-muted-foreground">
              {attention === 0 ? "Nothing due right now." : `${attention} item${attention === 1 ? "" : "s"} need a look.`}
            </p>
            <ul className="space-y-2">
              {payload.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.remaining}</p>
                  </div>
                  <Badge variant={badgeVariant(item.status)}>{STATUS_LABEL[item.status]}</Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
