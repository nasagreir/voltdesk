"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShareCardButton } from "@/components/dashboard/share-card-button";
import { TripMap } from "@/components/dashboard/trip-map";
import { formatChargeCost } from "@/lib/charge-cost";
import { formatDistance, formatFixed, formatTemp, money } from "@/lib/format";
import {
  DRIVE_SHARE_DEFAULTS,
  DRIVE_SHARE_PRESETS,
  driveShareOptions,
  driveShareTitle,
} from "@/lib/share-card";
import { formatChicagoStamp } from "@/lib/time";
import type { ChargeSession, DistanceUnit, DriveSession, TempUnit, VehicleSample } from "@/lib/types";

function ChargeAmountForm({
  charge,
  onSaved,
}: {
  charge: ChargeSession;
  onSaved: (charge: ChargeSession) => void;
}) {
  const [amount, setAmount] = useState(charge.actualUsd == null ? "" : charge.actualUsd.toFixed(2));
  const [pending, setPending] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guess =
    charge.guessUsd == null
      ? "There is no rate for this session, so it stays out of the total until you enter what you paid."
      : charge.guessUsd === 0
        ? "The guess is free until you enter what you paid."
        : `The guess is ${money(charge.guessUsd)} until you enter what you paid.`;

  async function submit(next: number | null) {
    setPending(next == null ? "clear" : "save");
    setError(null);
    try {
      const response = await fetch(`/api/charges/${encodeURIComponent(charge.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: next }),
      });
      const body = (await response.json()) as { error?: string; charge?: ChargeSession };
      if (!response.ok || !body.charge) throw new Error(body.error ?? "Could not save the amount");
      onSaved(body.charge);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the amount");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actual amount</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{guess}</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(amount);
            if (amount.trim() === "" || !Number.isFinite(value) || value < 0) {
              setError("Enter a dollar amount, or use the guess.");
              return;
            }
            void submit(value);
          }}
        >
          <div className="grid gap-1.5 text-sm">
            <Label htmlFor="charge-amount">Amount paid (USD)</Label>
            <Input
              id="charge-amount"
              inputMode="decimal"
              className="w-32"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending != null}>
            {pending === "save" ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending != null || charge.costSource !== "actual"}
            onClick={() => void submit(null)}
          >
            {pending === "clear" ? "Clearing…" : "Use the guess"}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-heading text-lg">{value}</div>
    </div>
  );
}

export function SessionDetail({ kind, id }: { kind: "drive" | "charge"; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [drive, setDrive] = useState<DriveSession | null>(null);
  const [charge, setCharge] = useState<ChargeSession | null>(null);
  const [samples, setSamples] = useState<VehicleSample[]>([]);
  const [units, setUnits] = useState<{ distance: DistanceUnit; temp: TempUnit }>({
    distance: "mi",
    temp: "F",
  });
  const [backHref, setBackHref] = useState(kind === "drive" ? "/trips" : "/charging");

  useEffect(() => {
    if (kind !== "drive") return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to) return;
    const href = `/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const timer = setTimeout(() => setBackHref(href), 0);
    return () => clearTimeout(timer);
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/${kind}s/${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Not found");
        if (cancelled) return;
        setUnits(body.units);
        setSamples(body.samples ?? []);
        if (kind === "drive") setDrive(body.drive);
        else setCharge(body.charge);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not open this {kind}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!drive && !charge) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const speedUnit = units.distance === "km" ? "km/h" : "mph";
  const chart = samples.map((sample) => ({
    label: formatChicagoStamp(new Date(sample.at)),
    battery: sample.batteryPercent,
    speed: sample.speedMph,
    power: sample.powerKw,
    elevation: sample.elevationM,
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          {kind === "drive" ? "Trips" : "Charging"}
        </Link>
        <h1 className="font-heading text-2xl tracking-tight">
          {drive ? `${drive.fromLabel} to ${drive.toLabel}` : `${charge?.kind} · ${charge?.placeLabel}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatChicagoStamp(new Date((drive ?? charge)!.startedAt))}
          {(drive ?? charge)?.inProgress ? " · in progress" : ""}
        </p>
        {drive && (
          <div className="mt-3">
            <ShareCardButton
              kind="trip"
              title={driveShareTitle(drive)}
              subtitle={`${formatChicagoStamp(new Date(drive.startedAt))} CT`}
              footnote="VoltDesk"
              options={driveShareOptions(drive, units.distance, units.temp)}
              defaults={DRIVE_SHARE_DEFAULTS}
              presets={DRIVE_SHARE_PRESETS}
              route={drive.path}
            />
          </div>
        )}
      </div>

      {drive && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Distance" value={formatDistance(drive.distanceMi, units.distance, 1)} />
            <Stat label="Duration" value={`${Math.round(drive.durationMin)} min`} />
            <Stat label="Avg speed" value={`${Math.round(units.distance === "km" ? drive.avgSpeedMph * 1.609344 : drive.avgSpeedMph)} ${speedUnit}`} />
            <Stat label="Max speed" value={`${Math.round(units.distance === "km" ? drive.maxSpeedMph * 1.609344 : drive.maxSpeedMph)} ${speedUnit}`} />
            <Stat label="Net" value={drive.efficiencyWhPerMi == null ? "—" : `${Math.round(drive.efficiencyWhPerMi)} Wh/${units.distance}`} />
            <Stat label="Gross" value={drive.grossWhPerMi == null ? "—" : `${Math.round(drive.grossWhPerMi)} Wh/${units.distance}`} />
            <Stat label="Energy" value={formatFixed(drive.energyNetKwh, "kWh", 2)} />
            <Stat label="Battery" value={`${Math.round(drive.startBattery)}→${Math.round(drive.endBattery)}%`} />
            <Stat label="Rated range" value={`${Math.round(drive.startRatedRangeMi)}→${Math.round(drive.endRatedRangeMi)} mi`} />
            <Stat label="Ideal range" value={drive.startIdealRangeMi == null ? "—" : `${Math.round(drive.startIdealRangeMi)}→${Math.round(drive.endIdealRangeMi ?? 0)} mi`} />
            <Stat label="Elevation" value={drive.elevationGainM == null ? "—" : `${Math.round(drive.elevationGainM)} m`} />
            <Stat label="Outside" value={formatTemp(drive.outsideTempC, units.temp)} />
            <Stat label="Power" value={drive.maxPowerKw == null ? "—" : `${Math.round(drive.minPowerKw ?? 0)}–${Math.round(drive.maxPowerKw)} kW`} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Route</CardTitle>
            </CardHeader>
            <CardContent>
              <TripMap trips={[{ id: drive.id, path: drive.path }]} selectedId={drive.id} />
            </CardContent>
          </Card>
        </>
      )}

      {charge && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Added" value={formatFixed(charge.energyKwh, "kWh", 2)} />
          <Stat label="Used" value={formatFixed(charge.energyUsedKwh, "kWh", 2)} />
          <Stat label="Cost" value={formatChargeCost(charge)} />
          <Stat label="Efficiency" value={charge.efficiencyPct == null ? "—" : `${Math.round(charge.efficiencyPct)}%`} />
          <Stat label="Battery" value={`${Math.round(charge.startBattery)}→${Math.round(charge.endBattery)}%`} />
          <Stat label="Range added" value={formatDistance(charge.rangeAddedMi, units.distance, 0)} />
          <Stat label="Peak" value={formatFixed(charge.peakPowerKw, "kW", 1)} />
          <Stat label="Duration" value={`${Math.round(charge.durationMin)} min`} />
          <Stat label="Voltage" value={charge.voltage == null ? "—" : `${Math.round(charge.voltage)} V`} />
          <Stat label="Current" value={charge.current == null ? "—" : `${Math.round(charge.current)} A`} />
          <Stat label="Phases" value={charge.phases == null ? "—" : String(charge.phases)} />
          <Stat label="Outside" value={formatTemp(charge.outsideTempC, units.temp)} />
        </div>
      )}

      {charge && (
        <ChargeAmountForm
          key={`${charge.id}-${charge.costSource}-${charge.costUsd}`}
          charge={charge}
          onSaved={setCharge}
        />
      )}

      {chart.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{drive ? "Speed and battery" : "Battery"}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                <YAxis yAxisId="left" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                <Tooltip contentStyle={{ background: "#121214", border: "1px solid rgb(255 255 255 / 10%)", borderRadius: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="battery" name="Battery %" stroke="#3dd68c" dot={false} strokeWidth={2} />
                {drive && <Line yAxisId="right" type="monotone" dataKey="speed" name="mph" stroke="#e31937" dot={false} strokeWidth={1.5} />}
                {drive && <Line yAxisId="right" type="monotone" dataKey="elevation" name="Elevation m" stroke="#93c5fd" dot={false} strokeWidth={1.5} />}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
