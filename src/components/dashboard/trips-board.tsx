"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ShareCardButton } from "@/components/dashboard/share-card-button";
import { TripMap } from "@/components/dashboard/trip-map";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistance, formatFixed, formatTemp } from "@/lib/format";
import {
  DRIVE_SHARE_DEFAULTS,
  DRIVE_SHARE_PRESETS,
  driveShareOptions,
  driveShareTitle,
  formatDuration,
  formatShareRange,
  formatSpeed,
  formatWh,
  RANGE_SHARE_DEFAULTS,
  rangeShareOptions,
} from "@/lib/share-card";
import { formatChicagoStamp, presetRange } from "@/lib/time";
import { parseTripRange } from "@/lib/trips";
import type { DistanceUnit, DriveSession, TempUnit, TripsPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const presets = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "Year", days: 365 },
  { label: "All", days: 400 },
];

function DriveShare({
  trip,
  unit,
  temp,
  size = "xs",
}: {
  trip: DriveSession;
  unit: DistanceUnit;
  temp: TempUnit;
  size?: "xs" | "sm";
}) {
  return (
    <ShareCardButton
      kind="trip"
      size={size}
      title={driveShareTitle(trip)}
      subtitle={`${formatChicagoStamp(new Date(trip.startedAt))} CT`}
      footnote="VoltDesk"
      options={driveShareOptions(trip, unit, temp)}
      defaults={DRIVE_SHARE_DEFAULTS}
      presets={DRIVE_SHARE_PRESETS}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/5 px-3 py-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-heading text-lg leading-tight break-words">{value}</div>
    </div>
  );
}

export function TripsBoard() {
  const router = useRouter();
  const search = useSearchParams();
  const initial = presetRange(30);
  const [from, setFrom] = useState(search.get("from") || initial.from);
  const [to, setTo] = useState(search.get("to") || initial.to);
  const [payload, setPayload] = useState<TripsPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rangeError = (() => {
    const parsed = parseTripRange(from, to);
    return "error" in parsed ? parsed.error : null;
  })();
  const error = rangeError ?? fetchError;

  useEffect(() => {
    const next = `/trips?from=${from}&to=${to}`;
    if (window.location.pathname + window.location.search !== next) {
      router.replace(next, { scroll: false });
    }
  }, [from, to, router]);

  useEffect(() => {
    if (rangeError) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/trips?from=${from}&to=${to}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Trips failed");
        if (cancelled) return;
        setPayload(body as TripsPayload);
        setFetchError(null);
      } catch (err) {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : "Trips failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, rangeError]);

  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    setSelectedId(null);
    const parsed = parseTripRange(nextFrom, nextTo);
    setLoading(!("error" in parsed));
  }

  const unit: DistanceUnit = payload?.units.distance ?? "mi";
  const temp: TempUnit = payload?.units.temp ?? "F";
  const trips = payload?.trips ?? [];
  const selected = trips.find((trip) => trip.id === selectedId) ?? null;
  const detailHref = selected
    ? `/trips/${encodeURIComponent(selected.id)}?from=${from}&to=${to}`
    : "/trips";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl tracking-tight short:text-xl">Trips</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {payload?.vehicleName ?? "The car"} · each drive is kept with the sample history, about 400 days. Times are Central.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {presets.map((preset) => {
          const range = presetRange(preset.days);
          const active = range.from === from && range.to === to;
          return (
            <Button
              key={preset.label}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => applyRange(range.from, range.to)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="grid gap-1.5 text-sm">
          <Label htmlFor="trip-from">From</Label>
          <Input id="trip-from" type="date" value={from} onChange={(event) => applyRange(event.target.value, to)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <Label htmlFor="trip-to">To</Label>
          <Input id="trip-to" type="date" value={to} onChange={(event) => applyRange(from, event.target.value)} />
        </label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load trips</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading && !payload && <p className="text-sm text-muted-foreground">Loading trips…</p>}

      {payload && !rangeError && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Trips" value={String(payload.summary.count)} />
            <Stat label="Distance" value={formatDistance(payload.summary.distanceMi, unit, 1)} />
            <Stat label="Time driving" value={formatDuration(payload.summary.durationMin)} />
            <Stat label="Efficiency" value={formatWh(payload.summary.avgWhPerMi, unit)} />
          </div>
          <ShareCardButton
            kind="trips"
            label="Share this range"
            title={payload.vehicleName || "Trips"}
            subtitle={formatShareRange(from, to)}
            footnote="Times are Central · VoltDesk"
            options={rangeShareOptions(payload.summary, unit)}
            defaults={RANGE_SHARE_DEFAULTS}
          />

          <div className="duo-fold grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
            <div className="min-w-0 space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>{selected ? `${selected.fromLabel} to ${selected.toLabel}` : "Routes in this range"}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {trips.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No trips between these dates. A drive is recorded when the car moves.
                    </p>
                  ) : (
                    <TripMap
                      trips={trips.map((trip) => ({ id: trip.id, path: trip.path }))}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                  )}
                  {selected && <TripFacts trip={selected} unit={unit} temp={temp} href={detailHref} />}
                  {selected && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(null)}>
                      Show every trip in this range
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid min-w-0 gap-2 min-[900px]:max-h-[40rem] min-[900px]:overflow-y-auto">
              {trips.length === 0 && (
                <p className="text-sm text-muted-foreground">The log is empty for this range.</p>
              )}
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  id={`trip-${trip.id}`}
                  className={cn(
                    "rounded-xl border px-3 py-2",
                    trip.id === selectedId ? "border-[#e31937] bg-white/5" : "border-white/10",
                  )}
                >
                  <button type="button" className="w-full text-left" onClick={() => setSelectedId(trip.id)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium break-words">
                        {trip.fromLabel} to {trip.inProgress ? "in progress" : trip.toLabel}
                      </p>
                      <p className="shrink-0 text-sm">{formatDistance(trip.distanceMi, unit, 1)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatChicagoStamp(new Date(trip.startedAt))} CT · {formatDuration(trip.durationMin)} ·{" "}
                      {Math.round(trip.startBattery)}→{Math.round(trip.endBattery)}% · {formatWh(trip.efficiencyWhPerMi, unit)}
                    </p>
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/trips/${encodeURIComponent(trip.id)}?from=${from}&to=${to}`}
                      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Trip details
                    </Link>
                    <DriveShare trip={trip} unit={unit} temp={temp} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TripFacts({
  trip,
  unit,
  temp,
  href,
}: {
  trip: DriveSession;
  unit: DistanceUnit;
  temp: TempUnit;
  href: string;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {formatChicagoStamp(new Date(trip.startedAt))} CT
        {trip.inProgress ? " · in progress" : ` to ${formatChicagoStamp(new Date(trip.endedAt))} CT`}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Distance" value={formatDistance(trip.distanceMi, unit, 1)} />
        <Stat label="Duration" value={formatDuration(trip.durationMin)} />
        <Stat label="Avg speed" value={formatSpeed(trip.avgSpeedMph, unit)} />
        <Stat label="Max speed" value={formatSpeed(trip.maxSpeedMph, unit)} />
        <Stat label="Battery" value={`${Math.round(trip.startBattery)}→${Math.round(trip.endBattery)}%`} />
        <Stat label="Efficiency" value={formatWh(trip.efficiencyWhPerMi, unit)} />
        <Stat label="Energy" value={formatFixed(trip.energyNetKwh, "kWh", 2)} />
        <Stat label="Elevation" value={trip.elevationGainM == null ? "—" : `${Math.round(trip.elevationGainM)} m`} />
        <Stat label="Outside" value={formatTemp(trip.outsideTempC, temp)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={href} className="text-sm underline-offset-2 hover:underline">
          Open the full trip
        </Link>
        <DriveShare trip={trip} unit={unit} temp={temp} size="sm" />
      </div>
    </div>
  );
}
