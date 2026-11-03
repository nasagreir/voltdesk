"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { formatDistance } from "@/lib/format";
import { presetRange } from "@/lib/time";
import { parseTripRange } from "@/lib/trips";
import type { ReadingPoint } from "@/lib/reading-series";
import type { DistanceUnit } from "@/lib/types";

const tooltipStyle = {
  background: "#121214",
  border: "1px solid rgb(255 255 255 / 10%)",
  borderRadius: 12,
};

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: 400 },
] as const;

function formatSpeed(mph: number | null, unit: DistanceUnit) {
  if (mph == null || !Number.isFinite(mph)) return "—";
  return formatDistance(mph, unit, 0).replace(unit, unit === "km" ? "km/h" : "mph");
}

export function SpeedStats({
  vehicleId,
  unit,
  value,
}: {
  vehicleId: string;
  unit: DistanceUnit;
  value: string;
}) {
  const initial = presetRange(30);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [maxSpeedMph, setMaxSpeedMph] = useState<number | null>(null);
  const [avgSpeedMph, setAvgSpeedMph] = useState<number | null>(null);
  const [driveCount, setDriveCount] = useState(0);
  const [points, setPoints] = useState<ReadingPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseTripRange(from, to);
    const timer = window.setTimeout(() => {
      if ("error" in parsed) {
        setMaxSpeedMph(null);
        setAvgSpeedMph(null);
        setDriveCount(0);
        setPoints([]);
        setError(parsed.error);
        setLoading(false);
        return;
      }
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams({ from, to, vehicle: vehicleId });
          const response = await fetch(`/api/speed?${params}`, { cache: "no-store" });
          const body = (await response.json()) as {
            error?: string;
            maxSpeedMph?: number | null;
            avgSpeedMph?: number | null;
            driveCount?: number;
            points?: ReadingPoint[];
          };
          if (!response.ok) throw new Error(body.error ?? "Could not load speed");
          setMaxSpeedMph(body.maxSpeedMph ?? null);
          setAvgSpeedMph(body.avgSpeedMph ?? null);
          setDriveCount(body.driveCount ?? 0);
          setPoints(body.points ?? []);
        } catch (err) {
          setMaxSpeedMph(null);
          setAvgSpeedMph(null);
          setDriveCount(0);
          setPoints([]);
          setError(err instanceof Error ? err.message : "Could not load speed");
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, from, to, vehicleId]);

  return (
    <>
      <button
        type="button"
        className="min-w-0 rounded-xl bg-white/5 px-3 py-3 text-left short:px-2 short:py-2 hover:bg-white/10"
        onClick={() => setOpen(true)}
      >
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">Speed</div>
        <div className="mt-1 font-heading text-base leading-tight break-words min-[420px]:text-lg short:text-sm">{value}</div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>Speed</DialogTitle>
                <DialogDescription>
                  Each bar is the highest speed that day. Highest is the top speed on a drive, and average is the miles driven divided by the time spent driving. History is kept for about 400 days.
                </DialogDescription>
              </div>
              <DialogClose />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 px-3 py-3">
                <div className="text-[11px] tracking-wide text-muted-foreground uppercase">Highest</div>
                <div className="mt-1 font-heading text-lg">{loading ? "Loading…" : formatSpeed(maxSpeedMph, unit)}</div>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-3">
                <div className="text-[11px] tracking-wide text-muted-foreground uppercase">Average</div>
                <div className="mt-1 font-heading text-lg">{loading ? "Loading…" : formatSpeed(avgSpeedMph, unit)}</div>
              </div>
            </div>
            <p className={error ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-muted-foreground"}>
              {error ?? (loading ? "Loading drives…" : driveCount === 0 ? "No drives in this range." : `${driveCount} ${driveCount === 1 ? "drive" : "drives"}`)}
            </p>
            <div className="mt-3">
              <DateRangeBar
                from={from}
                to={to}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom);
                  setTo(nextTo);
                }}
                presets={PRESETS}
                fromId="speed-from"
                toId="speed-to"
              />
            </div>
            <div className="mt-3 h-56 short:h-40">
              {error ? null : points.length === 0 ? (
                <p className="text-sm text-muted-foreground">{loading ? "Loading the chart…" : "No days in this range yet."}</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={points}>
                    <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(speed) => [`${speed} ${unit === "km" ? "km/h" : "mph"}`, "Highest"]}
                    />
                    <Bar dataKey="value" name="Highest" fill="#e31937" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </>
  );
}
