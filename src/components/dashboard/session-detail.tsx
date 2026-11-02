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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RouteMap } from "@/components/dashboard/route-map";
import { formatDistance, formatFixed, formatTemp, money } from "@/lib/format";
import { formatChicagoStamp } from "@/lib/time";
import type { ChargeSession, DistanceUnit, DriveSession, TempUnit, VehicleSample } from "@/lib/types";

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
        <Link href={kind === "drive" ? "/drives" : "/charges"} className="text-sm text-muted-foreground hover:text-foreground">
          {kind === "drive" ? "Drives" : "Charges"}
        </Link>
        <h1 className="font-heading text-2xl tracking-tight">
          {drive ? `${drive.fromLabel} to ${drive.toLabel}` : `${charge?.kind} · ${charge?.placeLabel}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatChicagoStamp(new Date((drive ?? charge)!.startedAt))}
          {(drive ?? charge)?.inProgress ? " · in progress" : ""}
        </p>
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
              <RouteMap points={drive.path} />
            </CardContent>
          </Card>
        </>
      )}

      {charge && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Added" value={formatFixed(charge.energyKwh, "kWh", 2)} />
          <Stat label="Used" value={formatFixed(charge.energyUsedKwh, "kWh", 2)} />
          <Stat label="Cost" value={money(charge.costUsd)} />
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
