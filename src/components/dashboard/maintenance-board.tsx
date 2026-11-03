"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export function MaintenanceBoard() {
  const [payload, setPayload] = useState<MaintenancePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [when, setWhen] = useState<Record<string, string>>({});
  const [miles, setMiles] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/maintenance", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load service");
      setPayload(body as MaintenancePayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load service");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(body: unknown, busyId: string) {
    setBusy(busyId);
    setError(null);
    try {
      const response = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "Could not save");
      setPayload(next as MaintenancePayload);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function mark(id: string) {
    const date = when[id]?.trim();
    const rawMiles = miles[id]?.trim();
    const markBody: { id: string; at?: string; odometerMi?: number } = { id };
    if (date) markBody.at = date;
    if (rawMiles) {
      const value = Number(rawMiles);
      if (!Number.isFinite(value)) {
        setError("Odometer has to be a number of miles.");
        return;
      }
      markBody.odometerMi = value;
    }
    const saved = await save({ mark: markBody }, id);
    if (!saved) return;
    setWhen((current) => ({ ...current, [id]: "" }));
    setMiles((current) => ({ ...current, [id]: "" }));
  }

  if (loading && !payload) return <p className="text-sm text-muted-foreground">Reading the service list…</p>;

  if (error && !payload) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Service unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!payload) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Maintenance</p>
        <h1 className="font-heading text-2xl tracking-tight short:text-xl">Service</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Tesla’s list for this car: tire rotation, cabin air filter, brake fluid health check, wiper blades, and brake
          caliper cleaning where roads are salted. There is no routine oil change. A HEPA filter is every 3 years only
          if the car has one. {payload.disclaimer}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {payload.vehicleName ? `${payload.vehicleName} · ` : ""}
          {payload.model ? `${payload.model} · ` : ""}
          odometer {payload.odometerLabel}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex items-start justify-between gap-4 pt-6">
          <div>
            <p className="font-medium">Salted roads</p>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Chicago salts roads in winter, so brake caliper cleaning starts on. Turn this off if your roads are not
              salted.
            </p>
          </div>
          <Switch
            checked={payload.saltedRoads}
            disabled={busy !== null}
            aria-label="Salted roads"
            onCheckedChange={(checked) => void save({ saltedRoads: checked }, "salt")}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {payload.items.map((item) => (
          <Card key={item.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{item.title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{item.interval}</p>
              </div>
              <Badge variant={badgeVariant(item.status)}>{STATUS_LABEL[item.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{item.remaining}</p>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
              <p className="text-sm text-muted-foreground">Last done: {item.lastLabel}</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid w-full gap-1.5 text-sm min-[560px]:w-44">
                  <Label htmlFor={`${item.id}-date`}>Date</Label>
                  <Input
                    id={`${item.id}-date`}
                    type="date"
                    value={when[item.id] ?? ""}
                    onChange={(event) => setWhen((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                </label>
                <label className="grid w-full gap-1.5 text-sm min-[560px]:w-44">
                  <Label htmlFor={`${item.id}-miles`}>Miles</Label>
                  <Input
                    id={`${item.id}-miles`}
                    inputMode="decimal"
                    value={miles[item.id] ?? ""}
                    placeholder="Current odometer"
                    onChange={(event) => setMiles((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                </label>
                <Button type="button" className="w-full min-[560px]:w-auto" disabled={busy !== null} onClick={() => void mark(item.id)}>
                  {busy === item.id ? "Saving…" : "Mark done"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave the date and miles blank to use today and the current odometer.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
