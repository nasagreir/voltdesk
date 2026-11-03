"use client";

import { useCallback, useEffect, useState } from "react";
import { BatteryDial } from "@/components/dashboard/battery-dial";
import { CarPortrait } from "@/components/dashboard/car-portrait";
import { GrokSuggestions } from "@/components/dashboard/grok-suggestions";
import { LiveData } from "@/components/dashboard/live-data";
import { ChargeHistory } from "@/components/dashboard/charge-history";
import { OdometerChart } from "@/components/dashboard/odometer-chart";
import { SpeedStats } from "@/components/dashboard/speed-stats";
import { ServiceSummary } from "@/components/dashboard/service-summary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DashboardPayload, VehicleView } from "@/lib/types";

const STATE_LABEL: Record<VehicleView["state"], string> = {
  parked: "Parked",
  driving: "Driving",
  charging: "Charging",
  asleep: "Asleep",
  offline: "Offline",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/5 px-3 py-3 short:px-2 short:py-2">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-heading text-base leading-tight break-words min-[420px]:text-lg short:text-sm">{value}</div>
    </div>
  );
}

function VehicleTitle({ vehicle, onSaved }: { vehicle: VehicleView; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(vehicle.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = vehicle.name !== vehicle.reportedName;

  async function save(name: string | null) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/vehicles/${encodeURIComponent(vehicle.id)}/name`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save the name");
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the name");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (!next) {
              setError("Enter a name, or use the name the car reports.");
              return;
            }
            void save(next);
          }}
        >
          <Input
            aria-label="Car name"
            className="w-48 max-w-full"
            maxLength={40}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {custom && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void save(null)}>
              Use {vehicle.reportedName}
            </Button>
          )}
        </form>
      ) : (
        <h1 className="font-heading text-2xl tracking-tight short:text-xl min-[900px]:text-3xl">
          {vehicle.name}
          <span className="text-muted-foreground"> · {vehicle.model}</span>
        </h1>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {!editing && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              setDraft(vehicle.name);
              setError(null);
              setEditing(true);
            }}
          >
            Rename
          </button>
        )}
        {custom && <p className="text-xs text-muted-foreground">The car reports {vehicle.reportedName}.</p>}
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function yesNo(value: boolean | null, yes = "Yes", no = "No") {
  if (value == null) return "—";
  return value ? yes : no;
}

export function Garage() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [wakeNote, setWakeNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load the garage");
      setPayload(body as DashboardPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the garage");
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

  const vehicle =
    payload?.vehicles.find((item) => item.id === vehicleId) ?? payload?.vehicles[0] ?? null;

  async function setLive(enabled: boolean) {
    const response = await fetch("/api/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Could not change live data");
    await load();
  }

  async function wake() {
    if (!vehicle) return;
    setWaking(true);
    setWakeNote(null);
    try {
      const response = await fetch(`/api/vehicles/${encodeURIComponent(vehicle.id)}/wake`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Wake failed");
      setWakeNote("Wake sent. The car can take a minute to come online.");
      window.setTimeout(() => void load(), 4000);
    } catch (err) {
      setWakeNote(err instanceof Error ? err.message : "Wake failed");
    } finally {
      setWaking(false);
    }
  }

  if (loading && !payload) {
    return <p className="text-sm text-muted-foreground">Reading the car…</p>;
  }

  if (error && !payload) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Garage unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!payload || !vehicle) {
    return <p className="text-sm text-muted-foreground">No vehicle in this feed yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            {payload.mode === "demo" ? "Demo" : "Live"} · {payload.source}
          </p>
          <VehicleTitle key={vehicle.id} vehicle={vehicle} onSaved={() => void load()} />
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground short:line-clamp-2">{payload.message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payload.vehicles.length > 1 &&
            payload.vehicles.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.id === vehicle.id ? "default" : "outline"}
                onClick={() => setVehicleId(item.id)}
              >
                {item.name}
              </Button>
            ))}
          <Badge variant={vehicle.stale ? "outline" : "secondary"}>{STATE_LABEL[vehicle.state]}</Badge>
        </div>
      </div>

      <LiveData
        enabled={payload.liveData}
        until={payload.liveDataUntil}
        now={payload.fetchedAt}
        demo={payload.mode === "demo"}
        onChange={setLive}
      />

      {vehicle.alerts.length > 0 && (
        <Alert>
          <AlertTitle>Needs a look</AlertTitle>
          <AlertDescription>{vehicle.alerts.join(" · ")}</AlertDescription>
        </Alert>
      )}

      <CarPortrait
        key={vehicle.id}
        vehicleId={vehicle.id}
        model={vehicle.model}
        trim={vehicle.trim}
        reportedColor={vehicle.color}
      />

      <div className="duo-fold grid gap-4 short:grid-cols-[8.5rem_minmax(0,1fr)] short:gap-2 min-[900px]:grid-cols-[13rem_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardContent className="pt-6 short:px-3 short:pt-3">
            <BatteryDial
              percent={vehicle.batteryPercent}
              limit={vehicle.chargeLimitPercent}
              charging={vehicle.state === "charging"}
              power={vehicle.chargerPowerKw > 0 ? vehicle.display.chargerPower : null}
              label="battery"
              range={vehicle.tripRange?.rangeMi != null ? vehicle.tripRange.range : vehicle.display.ratedRange}
              rangeNote={vehicle.tripRange?.rangeMi != null ? "from trips" : "rated"}
            />
            <div className="mt-2 space-y-1 px-1 text-center text-xs leading-snug break-words text-muted-foreground">
              {vehicle.state === "charging" && (
                <p className="text-emerald-300">
                  Charging
                  {vehicle.chargerPowerKw > 0 ? ` at ${vehicle.display.chargerPower}` : ""}
                  {vehicle.chargeRateMph > 0 ? ` · ${vehicle.display.chargeRate}` : ""}
                  {vehicle.display.doneBy !== "—"
                    ? ` · done around ${vehicle.display.doneBy}`
                    : vehicle.minutesToFull != null
                      ? ` · ${vehicle.display.timeToFull} to the limit`
                      : ""}
                </p>
              )}
              {vehicle.tripRange?.rangeMi != null ? (
                <p>
                  {vehicle.tripRange.consumption} over {vehicle.tripRange.trips}{" "}
                  {vehicle.tripRange.trips === 1 ? "trip" : "trips"}, {vehicle.tripRange.distance}
                  {vehicle.tripRange.atLimitMi != null &&
                  Math.abs(vehicle.tripRange.atLimitMi - vehicle.tripRange.rangeMi) >= 1
                    ? ` · ${vehicle.tripRange.atLimit} at the ${vehicle.display.chargeLimit} limit`
                    : ""}
                </p>
              ) : (
                <p>Not enough recent trips for a personal range yet.</p>
              )}
              <p>
                Rated {vehicle.display.ratedRange} · Tesla estimate {vehicle.display.estRange}
                {vehicle.idealRangeMi != null ? ` · ideal ${vehicle.display.idealRange}` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-4 min-[900px]:gap-3 short:gap-1.5">
          <OdometerChart vehicleId={vehicle.id} unit={payload.units.distance} value={vehicle.display.odometer} />
          <SpeedStats vehicleId={vehicle.id} unit={payload.units.distance} value={vehicle.display.speed} />
          <Fact label="Motor" value={vehicle.display.power} />
          <Fact label="Elevation" value={vehicle.display.elevation} />
          <Fact label="Inside" value={vehicle.display.inside} />
          <Fact label="Outside" value={vehicle.display.outside} />
          <Fact label="Locked" value={yesNo(vehicle.locked, "Locked", "Unlocked")} />
          <Fact label="Sentry" value={yesNo(vehicle.sentry, "On", "Off")} />
          <Fact label="Climate" value={vehicle.climateOn ? `On ${vehicle.display.setpoint}` : "Off"} />
          <Fact label="Updated" value={vehicle.display.updated} />
        </div>
      </div>

      <div className="grid gap-4 min-[560px]:grid-cols-2 book:gap-x-7">
        <Card>
          <CardHeader>
            <CardTitle>Charge</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Fact label="State" value={vehicle.chargingState || "—"} />
            <Fact label="Power" value={vehicle.display.chargerPower} />
            <Fact label="Rate" value={vehicle.display.chargeRate} />
            <Fact label="Time to limit" value={vehicle.display.timeToFull} />
            <Fact label="Done by" value={vehicle.display.doneBy} />
            <Fact label="Added" value={vehicle.display.energyAdded} />
            <Fact label="Cable" value={vehicle.cable || "—"} />
          </CardContent>
          {vehicle.chargeCosts && (
            <CardContent className="space-y-2 border-t border-white/10">
              <ChargeHistory vehicleId={vehicle.id} initial={vehicle.chargeCosts} />
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Body</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Fact label="Doors" value={vehicle.doorOpen ? "Open" : "Closed"} />
            <Fact label="Windows" value={vehicle.windowsOpen ? "Open" : "Closed"} />
            <Fact label="Frunk" value={vehicle.frunkOpen ? "Open" : "Closed"} />
            <Fact label="Trunk" value={vehicle.trunkOpen ? "Open" : "Closed"} />
            <Fact label="Charge port" value={vehicle.chargePortOpen ? "Open" : "Closed"} />
            <Fact label="Software" value={vehicle.softwareVersion || "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tires</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Fact label="Front left" value={vehicle.display.tpms.fl} />
            <Fact label="Front right" value={vehicle.display.tpms.fr} />
            <Fact label="Rear left" value={vehicle.display.tpms.rl} />
            <Fact label="Rear right" value={vehicle.display.tpms.rr} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Location</CardTitle>
            {(vehicle.state === "asleep" || vehicle.stale) && payload.mode === "live" && (
              <Button size="sm" variant="outline" onClick={wake} disabled={waking}>
                {waking ? "Waking…" : "Wake car"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                {vehicle.atHome
                  ? "At home"
                  : vehicle.homeDistanceMi == null
                    ? "Away"
                    : `${vehicle.display.homeDistance} from home`}
              </Badge>
              <span className="text-muted-foreground">{vehicle.display.coords}</span>
            </div>
            {wakeNote && <p className="text-sm text-muted-foreground">{wakeNote}</p>}
            {vehicle.lat != null && vehicle.lng != null ? (
              <iframe
                title="Vehicle location"
                className="h-40 w-full rounded-xl border border-white/10 min-[420px]:h-52 short:h-28"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${vehicle.lng - 0.02}%2C${vehicle.lat - 0.015}%2C${vehicle.lng + 0.02}%2C${vehicle.lat + 0.015}&layer=mapnik&marker=${vehicle.lat}%2C${vehicle.lng}`}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No coordinates in the last report. Wake the car if it is asleep.
              </p>
            )}
            {vehicle.updateAvailable && (
              <p className="text-sm text-muted-foreground">Software waiting: {vehicle.updateAvailable}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {vehicle.trim ? `${vehicle.trim} · ` : ""}
              {vehicle.color ? `${vehicle.color} · ` : ""}
              {vehicle.vin || "VIN hidden"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 min-[560px]:grid-cols-2 book:gap-x-7">
        <GrokSuggestions />
        <ServiceSummary />
      </div>
    </div>
  );
}
