"use client";

import { useEffect, useState } from "react";
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
import type { DistanceUnit } from "@/lib/types";

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
          };
          if (!response.ok) throw new Error(body.error ?? "Could not load speed");
          setMaxSpeedMph(body.maxSpeedMph ?? null);
          setAvgSpeedMph(body.avgSpeedMph ?? null);
          setDriveCount(body.driveCount ?? 0);
        } catch (err) {
          setMaxSpeedMph(null);
          setAvgSpeedMph(null);
          setDriveCount(0);
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
                  Highest is the top speed on a drive. Average is the miles driven divided by the time spent driving.
                  History is kept for about 400 days.
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
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </>
  );
}
