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
import { formatDistance, formatFixed, money } from "@/lib/format";
import { formatChicagoStamp } from "@/lib/time";
import type { HistoryPayload, HistoryRange } from "@/lib/types";

const ranges: HistoryRange[] = ["24h", "7d", "14d"];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-heading text-lg">{value}</div>
    </div>
  );
}

export function HistoryBoard({
  focus,
}: {
  focus: "history" | "drives" | "charges";
}) {
  const [range, setRange] = useState<HistoryRange>(focus === "history" ? "24h" : "14d");
  const [payload, setPayload] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/history?range=${range}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "History failed");
        if (!cancelled) {
          setPayload(body as HistoryPayload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "History failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const unit = payload?.units.distance ?? "mi";
  const title = focus === "drives" ? "Drives" : focus === "charges" ? "Charges" : "History";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {payload?.vehicleName ?? "Vehicle"} · times in Chicago
          </p>
        </div>
        <div className="flex gap-1">
          {ranges.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={item === range ? "default" : "outline"}
              onClick={() => setRange(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load history</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!payload && !error && <p className="text-sm text-muted-foreground">Loading records…</p>}

      {payload && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Distance" value={formatDistance(payload.summary.distanceMi, unit, 1)} />
            <Stat label="Drives" value={String(payload.summary.driveCount)} />
            <Stat
              label="Efficiency"
              value={
                payload.summary.avgWhPerMi == null
                  ? "—"
                  : `${Math.round(payload.summary.avgWhPerMi)} Wh/${unit}`
              }
            />
            <Stat
              label="Energy added"
              value={`${payload.summary.energyAddedKwh.toFixed(1)} kWh`}
            />
            <Stat label="Charges" value={String(payload.summary.chargeCount)} />
            <Stat label="Charge cost" value={money(payload.summary.costUsd)} />
            <Stat
              label="Battery"
              value={
                payload.summary.minBattery == null
                  ? "—"
                  : `${Math.round(payload.summary.minBattery)}–${Math.round(payload.summary.maxBattery ?? 0)}%`
              }
            />
            <Stat
              label="Time driving"
              value={`${Math.round(payload.summary.driveMinutes)} min`}
            />
          </div>

          {focus === "history" && (
            <Card>
              <CardHeader>
                <CardTitle>Battery and rated range</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {payload.series.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No samples in this window yet. VoltDesk stores a point on each poll once a car is connected.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={payload.series}>
                      <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                      <YAxis yAxisId="battery" domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                      <YAxis yAxisId="range" orientation="right" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={40} />
                      <Tooltip
                        contentStyle={{ background: "#121214", border: "1px solid rgb(255 255 255 / 10%)", borderRadius: 12 }}
                      />
                      <Line yAxisId="battery" type="monotone" dataKey="batteryPercent" name="Battery %" stroke="#3dd68c" dot={false} strokeWidth={2} />
                      <Line yAxisId="range" type="monotone" dataKey="ratedRangeMi" name="Rated range (mi)" stroke="#f4f4f5" dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}

          {focus !== "charges" && (
            <Card>
              <CardHeader>
                <CardTitle>Drives</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {payload.drives.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No drives in this window.</p>
                ) : (
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">When</th>
                        <th className="py-2 font-medium">From</th>
                        <th className="py-2 font-medium">To</th>
                        <th className="py-2 font-medium">Distance</th>
                        <th className="py-2 font-medium">Duration</th>
                        <th className="py-2 font-medium">Battery</th>
                        <th className="py-2 font-medium">Wh/{unit}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.drives.map((drive) => (
                        <tr key={drive.id} className="border-t border-white/10">
                          <td className="py-2">
                            <Link className="underline-offset-2 hover:underline" href={`/drives/${encodeURIComponent(drive.id)}`}>
                              {formatChicagoStamp(new Date(drive.startedAt))}
                            </Link>
                          </td>
                          <td className="py-2">{drive.fromLabel}</td>
                          <td className="py-2">{drive.inProgress ? "In progress" : drive.toLabel}</td>
                          <td className="py-2">{formatDistance(drive.distanceMi, unit, 1)}</td>
                          <td className="py-2">{Math.round(drive.durationMin)}m</td>
                          <td className="py-2">
                            {Math.round(drive.startBattery)}→{Math.round(drive.endBattery)}%
                          </td>
                          <td className="py-2">
                            {drive.efficiencyWhPerMi == null ? "—" : Math.round(drive.efficiencyWhPerMi)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {focus !== "drives" && (
            <Card>
              <CardHeader>
                <CardTitle>Charges</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {payload.charges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No charges in this window.</p>
                ) : (
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">When</th>
                        <th className="py-2 font-medium">Place</th>
                        <th className="py-2 font-medium">Energy</th>
                        <th className="py-2 font-medium">Battery</th>
                        <th className="py-2 font-medium">Peak</th>
                        <th className="py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.charges.map((charge) => (
                        <tr key={charge.id} className="border-t border-white/10">
                          <td className="py-2">
                            <Link className="underline-offset-2 hover:underline" href={`/charges/${encodeURIComponent(charge.id)}`}>
                              {formatChicagoStamp(new Date(charge.startedAt))}
                            </Link>
                          </td>
                          <td className="py-2">{charge.inProgress ? `${charge.placeLabel} · now` : charge.placeLabel}</td>
                          <td className="py-2">{formatFixed(charge.energyKwh, "kWh", 1)}</td>
                          <td className="py-2">
                            {Math.round(charge.startBattery)}→{Math.round(charge.endBattery)}%
                          </td>
                          <td className="py-2">{formatFixed(charge.peakPowerKw, "kW", 1)}</td>
                          <td className="py-2">{money(charge.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
