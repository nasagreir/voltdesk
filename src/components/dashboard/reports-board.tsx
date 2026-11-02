"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { RouteMap } from "@/components/dashboard/route-map";
import { formatDistance, formatFixed, money } from "@/lib/format";
import { formatChicagoStamp } from "@/lib/time";
import type { ReportsPayload, VehicleActivity } from "@/lib/types";

const sections = [
  ["statistics", "Statistics"],
  ["trip", "Trip"],
  ["drives", "Drive stats"],
  ["charging", "Charging stats"],
  ["efficiency", "Efficiency"],
  ["battery", "Battery health"],
  ["level", "Charge level"],
  ["range", "Projected range"],
  ["vampire", "Vampire"],
  ["states", "States"],
  ["mileage", "Mileage"],
  ["temperatures", "Temperatures"],
  ["updates", "Updates"],
  ["visited", "Visited"],
  ["timeline", "Timeline"],
] as const;

type Section = (typeof sections)[number][0];

const dayChoices = [
  [7, "7d"],
  [30, "30d"],
  [90, "90d"],
  [365, "1y"],
  [0, "All"],
] as const;

const stateLabel: Record<VehicleActivity, string> = {
  parked: "Parked",
  driving: "Driving",
  charging: "Charging",
  asleep: "Asleep",
  offline: "Offline",
};

function wh(value: number | null, unit: "mi" | "km") {
  if (value == null) return "—";
  const shown = unit === "km" ? value / 1.609344 : value;
  return `${Math.round(shown)} Wh/${unit}`;
}

function duration(minutes: number) {
  if (minutes >= 48 * 60) return `${(minutes / (60 * 24)).toFixed(1)} d`;
  if (minutes >= 120) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes)} min`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-heading text-lg">{value}</div>
    </div>
  );
}

function ChartFrame({
  data,
  children,
}: {
  data: unknown[];
  children: ReactNode;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No samples in this window yet.</p>;
  }
  return <div className="h-64">{children}</div>;
}

const tooltipStyle = {
  background: "#121214",
  border: "1px solid rgb(255 255 255 / 10%)",
  borderRadius: 12,
};

export function ReportsBoard({ only }: { only?: Section }) {
  const [section, setSection] = useState<Section>(only ?? "statistics");
  const [days, setDays] = useState(30);
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const active = only ?? section;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/reports?days=${days}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Reports failed");
        if (!cancelled) {
          setPayload(body as ReportsPayload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Reports failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const unit = payload?.units.distance ?? "mi";
  const tempUnit = payload?.units.temp ?? "F";
  const trip = useMemo(() => {
    const from = fromText.trim().toLowerCase();
    const to = toText.trim().toLowerCase();
    return (payload?.drives ?? []).filter((drive) => {
      if (from && !drive.fromLabel.toLowerCase().includes(from)) return false;
      if (to && !drive.toLabel.toLowerCase().includes(to)) return false;
      return true;
    });
  }, [fromText, payload?.drives, toText]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">
            {only === "timeline" ? "Timeline" : "Reports"}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {payload?.vehicleName ?? "Vehicle"} · Chicago time. VoltDesk polls the car, about every 15 seconds while it is driving or charging, and on your normal interval while it is parked. This is not a Tesla streaming socket.
          </p>
        </div>
        <div className="flex gap-1">
          {dayChoices.map(([value, label]) => (
            <Button key={label} size="sm" variant={value === days ? "default" : "outline"} onClick={() => setDays(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {!only && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {sections.map(([id, label]) => (
            <Button key={id} size="sm" variant={id === active ? "default" : "outline"} onClick={() => setSection(id)}>
              {label}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load reports</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!payload && !error && <p className="text-sm text-muted-foreground">Building the reports…</p>}

      {payload && active === "statistics" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Distance" value={formatDistance(payload.statistics.distanceMi, unit, 1)} />
          <Stat label="Drives" value={String(payload.statistics.driveCount)} />
          <Stat label="Driving" value={duration(payload.statistics.driveMinutes)} />
          <Stat label="Avg speed" value={payload.statistics.avgSpeedMph == null ? "—" : formatDistance(payload.statistics.avgSpeedMph, unit, 0).replace(unit, unit === "km" ? "km/h" : "mph")} />
          <Stat label="Max speed" value={payload.statistics.maxSpeedMph == null ? "—" : formatDistance(payload.statistics.maxSpeedMph, unit, 0).replace(unit, unit === "km" ? "km/h" : "mph")} />
          <Stat label="Net Wh" value={wh(payload.statistics.avgWhPerMi, unit)} />
          <Stat label="Gross Wh" value={wh(payload.statistics.avgGrossWhPerMi, unit)} />
          <Stat label="Elevation" value={payload.statistics.elevationGainM == null ? "—" : `${Math.round(payload.statistics.elevationGainM)} m`} />
          <Stat label="Charges" value={String(payload.statistics.chargeCount)} />
          <Stat label="Energy added" value={formatFixed(payload.statistics.energyAddedKwh, "kWh", 1)} />
          <Stat label="Charging" value={duration(payload.statistics.chargeMinutes)} />
          <Stat label="Cost" value={money(payload.statistics.costUsd)} />
        </div>
      )}

      {payload && active === "trip" && (
        <Card>
          <CardHeader>
            <CardTitle>Trip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={fromText} onChange={(event) => setFromText(event.target.value)} placeholder="From, such as Home" aria-label="From" />
              <Input value={toText} onChange={(event) => setToText(event.target.value)} placeholder="To, such as Work" aria-label="To" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Trips" value={String(trip.length)} />
              <Stat label="Distance" value={formatDistance(trip.reduce((sum, drive) => sum + drive.distanceMi, 0), unit, 1)} />
              <Stat label="Time" value={duration(trip.reduce((sum, drive) => sum + drive.durationMin, 0))} />
              <Stat
                label="Net Wh"
                value={wh(
                  (() => {
                    const miles = trip.reduce((sum, drive) => sum + (drive.efficiencyWhPerMi == null ? 0 : drive.distanceMi), 0);
                    const total = trip.reduce((sum, drive) => sum + (drive.efficiencyWhPerMi ?? 0) * (drive.efficiencyWhPerMi == null ? 0 : drive.distanceMi), 0);
                    return miles > 0 ? total / miles : null;
                  })(),
                  unit,
                )}
              />
            </div>
            {trip.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drives match that start and end.</p>
            ) : (
              <DriveTable drives={trip} unit={unit} />
            )}
          </CardContent>
        </Card>
      )}

      {payload && active === "drives" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Drives" value={String(payload.driveStats.count)} />
            <Stat label="Avg distance" value={payload.driveStats.avgDistanceMi == null ? "—" : formatDistance(payload.driveStats.avgDistanceMi, unit, 1)} />
            <Stat label="Avg duration" value={payload.driveStats.avgDurationMin == null ? "—" : duration(payload.driveStats.avgDurationMin)} />
            <Stat label="Energy used" value={formatFixed(payload.driveStats.energyNetKwh, "kWh", 1)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Starts by hour</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartFrame data={payload.driveStats.byHour}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={payload.driveStats.byHour}>
                    <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="count" name="Drives" stroke="#e31937" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            </CardContent>
          </Card>
          <DriveTable drives={payload.drives} unit={unit} />
        </div>
      )}

      {payload && active === "charging" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="AC charges" value={String(payload.chargingStats.ac.count)} />
            <Stat label="AC energy" value={formatFixed(payload.chargingStats.ac.energyKwh, "kWh", 1)} />
            <Stat label="DC charges" value={String(payload.chargingStats.dc.count)} />
            <Stat label="DC energy" value={formatFixed(payload.chargingStats.dc.energyKwh, "kWh", 1)} />
            <Stat label="AC cost" value={money(payload.chargingStats.ac.costUsd)} />
            <Stat label="DC cost" value={money(payload.chargingStats.dc.costUsd)} />
            <Stat label="Energy used" value={formatFixed(payload.chargingStats.energyUsedKwh, "kWh", 1)} />
            <Stat label="Total cost" value={money(payload.chargingStats.costUsd)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>By place</CardTitle>
            </CardHeader>
            <CardContent>
              {payload.chargingStats.byPlace.length === 0 ? (
                <p className="text-sm text-muted-foreground">No charges in this window.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Place</th>
                      <th className="py-2 font-medium">Charges</th>
                      <th className="py-2 font-medium">Energy</th>
                      <th className="py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.chargingStats.byPlace.map((place) => (
                      <tr key={place.place} className="border-t border-white/10">
                        <td className="py-2">{place.place}</td>
                        <td className="py-2">{place.count}</td>
                        <td className="py-2">{formatFixed(place.energyKwh, "kWh", 1)}</td>
                        <td className="py-2">{money(place.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <ChargeTable charges={payload.charges} />
        </div>
      )}

      {payload && active === "efficiency" && (
        <Card>
          <CardHeader>
            <CardTitle>
              Net {wh(payload.efficiency.avgNetWhPerMi, unit)} · gross {wh(payload.efficiency.avgGrossWhPerMi, unit)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Net uses the state-of-charge drop and the pack size. Gross uses rated miles at 252 Wh each, so the two lines separate as the pack wears.
            </p>
            <ChartFrame data={payload.efficiency.points}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.efficiency.points}>
                  <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={40} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="netWhPerMi" name="Net Wh/mi" stroke="#3dd68c" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="grossWhPerMi" name="Gross Wh/mi" stroke="#f4f4f5" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
      )}

      {payload && active === "battery" && (
        <Card>
          <CardHeader>
            <CardTitle>
              Full rated{" "}
              {payload.batteryHealth.currentFullRatedMi == null
                ? "—"
                : formatDistance(payload.batteryHealth.currentFullRatedMi, unit, 0)}
              {payload.batteryHealth.degradationPct == null
                ? ""
                : ` · ${payload.batteryHealth.degradationPct.toFixed(1)}% from the start of this window`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChartFrame data={payload.batteryHealth.points}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.batteryHealth.points}>
                  <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={40} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="fullRatedMi" name="Full rated mi" stroke="#e31937" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
            <p className="text-sm text-muted-foreground">{payload.batteryHealth.note}</p>
          </CardContent>
        </Card>
      )}

      {payload && active === "level" && (
        <Card>
          <CardHeader>
            <CardTitle>Charge level</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartFrame data={payload.chargeLevel}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.chargeLevel}>
                  <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="batteryPercent" name="Battery %" stroke="#3dd68c" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="usablePercent" name="Usable %" stroke="#f4f4f5" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
      )}

      {payload && active === "range" && (
        <Card>
          <CardHeader>
            <CardTitle>Projected range</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartFrame data={payload.projectedRange}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.projectedRange}>
                  <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={40} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="ratedRangeMi" name="Rated mi" stroke="#f4f4f5" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="estRangeMi" name="Estimated mi" stroke="#e31937" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
      )}

      {payload && active === "vampire" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {payload.vampire.totalSocDrop.toFixed(1)}% over {payload.vampire.totalHours.toFixed(1)} h parked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stat
              label="Average"
              value={payload.vampire.avgPctPerHour == null ? "—" : `${payload.vampire.avgPctPerHour.toFixed(2)} %/h`}
            />
            {payload.vampire.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parked drain of at least half an hour in this window.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">When</th>
                    <th className="py-2 font-medium">Place</th>
                    <th className="py-2 font-medium">Hours</th>
                    <th className="py-2 font-medium">Drop</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.vampire.events.map((event) => (
                    <tr key={event.startedAt} className="border-t border-white/10">
                      <td className="py-2">{formatChicagoStamp(new Date(event.startedAt))}</td>
                      <td className="py-2">{event.place}</td>
                      <td className="py-2">{event.hours.toFixed(1)}</td>
                      <td className="py-2">{event.socDrop.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {payload && active === "states" && (
        <Card>
          <CardHeader>
            <CardTitle>States</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(Object.keys(stateLabel) as VehicleActivity[]).map((activity) => (
                <Stat key={activity} label={stateLabel[activity]} value={duration(payload.states.totals[activity])} />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              A gap longer than 45 minutes is marked offline. Asleep is recorded when the car reports it, or overnight in the demo.
            </p>
          </CardContent>
        </Card>
      )}

      {payload && active === "mileage" && (
        <Card>
          <CardHeader>
            <CardTitle>{formatDistance(payload.mileage.totalMi, unit, 1)} in this window</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartFrame data={payload.mileage.points}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.mileage.points}>
                  <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                  <YAxis yAxisId="day" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                  <YAxis yAxisId="odo" orientation="right" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={48} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line yAxisId="day" type="monotone" dataKey="distanceMi" name="Miles that day" stroke="#e31937" dot={false} strokeWidth={2} />
                  <Line yAxisId="odo" type="monotone" dataKey="odometerMi" name="Odometer" stroke="#f4f4f5" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
      )}

      {payload && active === "temperatures" && (
        <Card>
          <CardHeader>
            <CardTitle>Temperatures</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartFrame data={payload.temperatures}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={payload.temperatures.map((point) => ({
                    ...point,
                    inside: point.insideC == null ? null : tempUnit === "F" ? (point.insideC * 9) / 5 + 32 : point.insideC,
                    outside: point.outsideC == null ? null : tempUnit === "F" ? (point.outsideC * 9) / 5 + 32 : point.outsideC,
                  }))}
                >
                  <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="inside" name={`Inside °${tempUnit}`} stroke="#e31937" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="outside" name={`Outside °${tempUnit}`} stroke="#93c5fd" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
      )}

      {payload && active === "updates" && (
        <Card>
          <CardHeader>
            <CardTitle>Software</CardTitle>
          </CardHeader>
          <CardContent>
            {payload.updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No software version has been recorded in this window.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">When</th>
                    <th className="py-2 font-medium">Version</th>
                    <th className="py-2 font-medium">Odometer</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.updates.map((update) => (
                    <tr key={`${update.at}-${update.version}`} className="border-t border-white/10">
                      <td className="py-2">{formatChicagoStamp(new Date(update.at))}</td>
                      <td className="py-2">{update.version}</td>
                      <td className="py-2">{formatDistance(update.odometerMi, unit, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {payload && active === "visited" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visited</CardTitle>
            </CardHeader>
            <CardContent>
              <RouteMap points={payload.visited} className="h-72" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Places</CardTitle>
            </CardHeader>
            <CardContent>
              {payload.locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No parked time in this window.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Place</th>
                      <th className="py-2 font-medium">Visits</th>
                      <th className="py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.locations.map((place) => (
                      <tr key={place.name} className="border-t border-white/10">
                        <td className="py-2">{place.name}</td>
                        <td className="py-2">{place.visits}</td>
                        <td className="py-2">{Math.round(place.minutes)} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {payload && active === "timeline" && <Timeline items={payload.timeline} />}
    </div>
  );
}

function DriveTable({
  drives,
  unit,
}: {
  drives: ReportsPayload["drives"];
  unit: ReportsPayload["units"]["distance"];
}) {
  if (drives.length === 0) return <p className="text-sm text-muted-foreground">No drives in this window.</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Drives</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">When</th>
              <th className="py-2 font-medium">From</th>
              <th className="py-2 font-medium">To</th>
              <th className="py-2 font-medium">Distance</th>
              <th className="py-2 font-medium">Wh</th>
            </tr>
          </thead>
          <tbody>
            {drives.slice(0, 40).map((drive) => (
              <tr key={drive.id} className="border-t border-white/10">
                <td className="py-2">
                  <Link className="underline-offset-2 hover:underline" href={`/drives/${encodeURIComponent(drive.id)}`}>
                    {formatChicagoStamp(new Date(drive.startedAt))}
                  </Link>
                </td>
                <td className="py-2">{drive.fromLabel}</td>
                <td className="py-2">{drive.inProgress ? "In progress" : drive.toLabel}</td>
                <td className="py-2">{formatDistance(drive.distanceMi, unit, 1)}</td>
                <td className="py-2">{drive.efficiencyWhPerMi == null ? "—" : Math.round(drive.efficiencyWhPerMi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ChargeTable({ charges }: { charges: ReportsPayload["charges"] }) {
  if (charges.length === 0) return <p className="text-sm text-muted-foreground">No charges in this window.</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Charges</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">When</th>
              <th className="py-2 font-medium">Place</th>
              <th className="py-2 font-medium">Kind</th>
              <th className="py-2 font-medium">Energy</th>
              <th className="py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {charges.slice(0, 40).map((charge) => (
              <tr key={charge.id} className="border-t border-white/10">
                <td className="py-2">
                  <Link className="underline-offset-2 hover:underline" href={`/charges/${encodeURIComponent(charge.id)}`}>
                    {formatChicagoStamp(new Date(charge.startedAt))}
                  </Link>
                </td>
                <td className="py-2">{charge.placeLabel}</td>
                <td className="py-2">{charge.kind}</td>
                <td className="py-2">{formatFixed(charge.energyKwh, "kWh", 1)}</td>
                <td className="py-2">{money(charge.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function Timeline({ items }: { items: ReportsPayload["timeline"] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing recorded in this window yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {items.map((item) => {
        const href =
          item.kind === "drive" && item.id
            ? `/drives/${encodeURIComponent(item.id)}`
            : item.kind === "charge" && item.id
              ? `/charges/${encodeURIComponent(item.id)}`
              : null;
        const body = (
          <div className="rounded-xl bg-white/5 px-3 py-3">
            <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {formatChicagoStamp(new Date(item.at))} · {item.kind}
            </div>
            <div className="mt-1 font-heading">{item.title}</div>
            <div className="text-sm text-muted-foreground">{item.detail}</div>
          </div>
        );
        return (
          <li key={`${item.kind}-${item.at}-${item.title}`}>
            {href ? <Link href={href}>{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}
