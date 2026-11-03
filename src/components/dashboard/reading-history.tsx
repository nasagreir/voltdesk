"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DateRangeBar } from "@/components/dashboard/date-range-bar";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReadingEvent, ReadingMetric, ReadingPoint } from "@/lib/reading-series";
import { presetRange } from "@/lib/time";
import { parseTripRange } from "@/lib/trips";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: 400 },
] as const;

const tooltipStyle = {
  background: "#121214",
  border: "1px solid rgb(255 255 255 / 10%)",
  borderRadius: 12,
};

const META: Record<
  Exclude<ReadingMetric, "speed">,
  { title: string; description: string; kind: "bar" | "line" | "tires" | "events"; color: string; digits: number }
> = {
  power: { title: "Motor", description: "Each bar is the strongest motor power that day.", kind: "bar", color: "#f4f4f5", digits: 1 },
  elevation: { title: "Elevation", description: "Each point is the average elevation that day.", kind: "line", color: "#a1a1aa", digits: 0 },
  inside: { title: "Inside", description: "Each point is the average cabin temperature that day.", kind: "line", color: "#fb923c", digits: 0 },
  outside: { title: "Outside", description: "Each point is the average outside temperature that day.", kind: "line", color: "#38bdf8", digits: 0 },
  locked: { title: "Locked", description: "Each bar is the share of readings that day the car was locked.", kind: "bar", color: "#e4e4e7", digits: 0 },
  sentry: { title: "Sentry", description: "Each bar is the share of readings that day Sentry was on.", kind: "bar", color: "#f87171", digits: 0 },
  climate: { title: "Climate", description: "Each bar is the share of readings that day climate was on.", kind: "bar", color: "#34d399", digits: 0 },
  readings: { title: "Updated", description: "Each bar is how many times VoltDesk heard from the car that day.", kind: "bar", color: "#a1a1aa", digits: 0 },
  charger: { title: "Charge power", description: "Each bar is the strongest charge power that day.", kind: "bar", color: "#34d399", digits: 1 },
  chargeRate: { title: "Charge rate", description: "Each bar is the fastest charge rate that day.", kind: "bar", color: "#38bdf8", digits: 0 },
  tires: { title: "Tires", description: "Each line is that tire's average pressure that day.", kind: "tires", color: "#e4e4e7", digits: 1 },
  doors: { title: "Doors", description: "Each bar is the share of readings that day a door was open.", kind: "bar", color: "#e4e4e7", digits: 0 },
  windows: { title: "Windows", description: "Each bar is the share of readings that day a window was open.", kind: "bar", color: "#e4e4e7", digits: 0 },
  frunk: { title: "Frunk", description: "Each bar is the share of readings that day the frunk was open.", kind: "bar", color: "#e4e4e7", digits: 0 },
  trunk: { title: "Trunk", description: "Each bar is the share of readings that day the trunk was open.", kind: "bar", color: "#e4e4e7", digits: 0 },
  port: { title: "Charge port", description: "Each bar is the share of readings that day the charge port was open.", kind: "bar", color: "#34d399", digits: 0 },
  software: { title: "Software", description: "Versions VoltDesk saw on the car in this range.", kind: "events", color: "", digits: 0 },
};

function shown(value: number | null, unitLabel: string, digits: number) {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return unitLabel ? `${text} ${unitLabel}` : text;
}

export function ReadingHistory({
  vehicleId,
  metric,
  idPrefix,
  value,
  label,
}: {
  vehicleId: string;
  metric: Exclude<ReadingMetric, "speed">;
  idPrefix: string;
  value: string;
  label?: string;
}) {
  const meta = META[metric];
  const initial = presetRange(30);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [points, setPoints] = useState<ReadingPoint[]>([]);
  const [events, setEvents] = useState<ReadingEvent[]>([]);
  const [high, setHigh] = useState<number | null>(null);
  const [average, setAverage] = useState<number | null>(null);
  const [unitLabel, setUnitLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseTripRange(from, to);
    const timer = window.setTimeout(() => {
      if ("error" in parsed) {
        setPoints([]);
        setEvents([]);
        setError(parsed.error);
        setLoading(false);
        return;
      }
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams({ metric, from, to, vehicle: vehicleId });
          const response = await fetch(`/api/series?${params}`, { cache: "no-store" });
          const body = (await response.json()) as {
            error?: string;
            points?: ReadingPoint[];
            events?: ReadingEvent[];
            high?: number | null;
            average?: number | null;
            unitLabel?: string;
          };
          if (!response.ok) throw new Error(body.error ?? "Could not load history");
          setPoints(body.points ?? []);
          setEvents(body.events ?? []);
          setHigh(body.high ?? null);
          setAverage(body.average ?? null);
          setUnitLabel(body.unitLabel ?? "");
        } catch (err) {
          setPoints([]);
          setEvents([]);
          setError(err instanceof Error ? err.message : "Could not load history");
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, from, to, vehicleId, metric]);

  const hasChart =
    meta.kind === "bar"
      ? points.length > 0
      : points.some((point) => point.value != null || point.fl != null);
  const chart =
    meta.kind === "line" || meta.kind === "tires"
      ? points
      : points.map((point) => ({ ...point, value: point.value ?? 0 }));

  return (
    <>
      <button
        type="button"
        className="min-w-0 rounded-xl bg-white/5 px-3 py-3 text-left short:px-2 short:py-2 hover:bg-white/10"
        onClick={() => setOpen(true)}
      >
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label ?? meta.title}</div>
        <div className="mt-1 font-heading text-base leading-tight break-words min-[420px]:text-lg short:text-sm">{value}</div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>{meta.title}</DialogTitle>
                <DialogDescription>
                  {meta.description} History is kept for about 400 days.
                </DialogDescription>
              </div>
              <DialogClose />
            </div>
            {meta.kind !== "events" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 px-3 py-3">
                  <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{metric === "readings" ? "Busiest day" : "High"}</div>
                  <div className="mt-1 font-heading text-lg">{loading ? "Loading…" : shown(high, unitLabel, meta.digits)}</div>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-3">
                  <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{metric === "readings" ? "Readings" : "Average"}</div>
                  <div className="mt-1 font-heading text-lg">{loading ? "Loading…" : shown(average, metric === "readings" ? "" : unitLabel, meta.digits)}</div>
                </div>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-3">
              <DateRangeBar
                from={from}
                to={to}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom);
                  setTo(nextTo);
                }}
                presets={PRESETS}
                fromId={`${idPrefix}-from`}
                toId={`${idPrefix}-to`}
              />
            </div>
            {meta.kind === "events" ? (
              <ul className="mt-3 space-y-2 text-sm">
                {events.length === 0 ? (
                  <li className="text-muted-foreground">No software change in this range.</li>
                ) : (
                  events.map((event) => (
                    <li key={`${event.day}-${event.version}`} className="flex items-baseline justify-between gap-3">
                      <span>{event.version}</span>
                      <span className="text-muted-foreground">{event.label}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="mt-3 h-56 short:h-40">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading history…</p>
                ) : !hasChart ? (
                  <p className="text-sm text-muted-foreground">No readings in this range yet.</p>
                ) : meta.kind === "line" || meta.kind === "tires" ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                      <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={tooltipStyle} />
                      {meta.kind === "tires" ? (
                        <>
                          <Line type="monotone" dataKey="fl" name="Front left" stroke="#f4f4f5" dot={false} strokeWidth={1.5} connectNulls />
                          <Line type="monotone" dataKey="fr" name="Front right" stroke="#38bdf8" dot={false} strokeWidth={1.5} connectNulls />
                          <Line type="monotone" dataKey="rl" name="Rear left" stroke="#fb923c" dot={false} strokeWidth={1.5} connectNulls />
                          <Line type="monotone" dataKey="rr" name="Rear right" stroke="#34d399" dot={false} strokeWidth={1.5} connectNulls />
                        </>
                      ) : (
                        <Line type="monotone" dataKey="value" name={meta.title} stroke={meta.color} dot={false} strokeWidth={1.5} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart}>
                      <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                      <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} domain={unitLabel === "%" ? [0, 100] : undefined} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" name={meta.title} fill={meta.color} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </>
  );
}
