"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChargeHistory } from "@/components/dashboard/charge-history";
import { ReadingHistory } from "@/components/dashboard/reading-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardPayload, VehicleView } from "@/lib/types";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/5 px-3 py-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-heading text-base leading-tight break-words min-[420px]:text-lg">{value}</div>
    </div>
  );
}

export function ChargingBoard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicleId, setVehicleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load charging");
      setPayload(body as DashboardPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load charging");
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

  useEffect(() => {
    if (!payload) return;
    const active = payload.vehicles.some((item) => item.state === "driving" || item.state === "charging");
    const seconds = payload.liveData
      ? 15
      : active
        ? Math.min(15, payload.pollIntervalSeconds)
        : Math.max(15, payload.pollIntervalSeconds);
    const timer = window.setInterval(() => {
      void load();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [load, payload]);

  const vehicle: VehicleView | null =
    payload?.vehicles.find((item) => item.id === vehicleId) ?? payload?.vehicles[0] ?? null;

  if (loading && !payload) {
    return <p className="text-sm text-muted-foreground">Reading the charge…</p>;
  }

  if (error && !payload) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Charging unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!payload || !vehicle) {
    return <p className="text-sm text-muted-foreground">No vehicle in this feed yet.</p>;
  }

  const charging = vehicle.state === "charging";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight short:text-xl">Charging</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {vehicle.name} · {charging ? "plugged in and charging" : vehicle.chargingState || "not charging"} ·{" "}
            {vehicle.display.updated}
          </p>
        </div>
        {payload.vehicles.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {payload.vehicles.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.id === vehicle.id ? "default" : "outline"}
                onClick={() => setVehicleId(item.id)}
              >
                {item.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Right now</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
          <Fact label="State" value={vehicle.chargingState || "—"} />
          <ReadingHistory vehicleId={vehicle.id} metric="charger" idPrefix="charge-power" label="Power" value={vehicle.display.chargerPower} />
          <ReadingHistory vehicleId={vehicle.id} metric="chargeRate" idPrefix="charge-rate" label="Rate" value={vehicle.display.chargeRate} />
          <Fact label="Time to limit" value={vehicle.display.timeToFull} />
          <Fact label="Done by" value={vehicle.display.doneBy} />
          <Fact label="Added" value={vehicle.display.energyAdded} />
          <Fact label="Cable" value={vehicle.cable || "—"} />
          <Fact label="Charge port" value={vehicle.chargePortOpen ? "Open" : "Closed"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicle.chargeCosts ? (
            <ChargeHistory vehicleId={vehicle.id} initial={vehicle.chargeCosts} />
          ) : (
            <p className="text-sm text-muted-foreground">No charge cost history for this car yet.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/charges" className="underline-offset-2 hover:underline">
              Session log
            </Link>{" "}
            lists each charge with peak power and the battery change.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
