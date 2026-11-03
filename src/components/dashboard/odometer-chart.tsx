"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistance, milesTo } from "@/lib/format";
import type { DailyDistancePoint } from "@/lib/daily-distance";
import { presetRange } from "@/lib/time";
import { parseTripRange } from "@/lib/trips";
import type { DistanceUnit } from "@/lib/types";

const WINDOWS = [7, 30, 90] as const;

const tooltipStyle = {
  background: "#121214",
  border: "1px solid rgb(255 255 255 / 10%)",
  borderRadius: 12,
};

export function OdometerChart({
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
  const [points, setPoints] = useState<DailyDistancePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseTripRange(from, to);
    const timer = window.setTimeout(() => {
      if ("error" in parsed) {
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
          const response = await fetch(`/api/mileage?${params}`, { cache: "no-store" });
          const body = (await response.json()) as { error?: string; points?: DailyDistancePoint[] };
          if (!response.ok) throw new Error(body.error ?? "Could not load daily driving");
          setPoints(body.points ?? []);
        } catch (err) {
          setPoints([]);
          setError(err instanceof Error ? err.message : "Could not load daily driving");
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, from, to, vehicleId]);

  const totalMi = points.reduce((sum, point) => sum + point.distanceMi, 0);
  const chart = points.map((point) => ({
    ...point,
    distance: Number(milesTo(point.distanceMi, unit).toFixed(1)),
  }));

  return (
    <>
      <button
        type="button"
        className="min-w-0 rounded-xl bg-white/5 px-3 py-3 text-left short:px-2 short:py-2 hover:bg-white/10"
        onClick={() => setOpen(true)}
      >
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">Odometer</div>
        <div className="mt-1 font-heading text-base leading-tight break-words min-[420px]:text-lg short:text-sm">{value}</div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>Driving</DialogTitle>
                <DialogDescription>
                  Each bar is how far the odometer moved that day. History is kept for about 400 days.
                </DialogDescription>
              </div>
              <DialogClose />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-heading text-lg">{loading ? "Loading…" : error ? "—" : formatDistance(totalMi, unit, 1)}</p>
              <div className="flex gap-1">
                {WINDOWS.map((windowDays) => {
                  const range = presetRange(windowDays);
                  const active = range.from === from && range.to === to;
                  return (
                    <Button
                      key={windowDays}
                      type="button"
                      size="sm"
                      variant={active ? "secondary" : "ghost"}
                      onClick={() => {
                        setFrom(range.from);
                        setTo(range.to);
                      }}
                    >
                      {windowDays}d
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="grid min-w-0 gap-1.5 text-sm">
                <Label htmlFor="odo-from">From</Label>
                <Input id="odo-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="grid min-w-0 gap-1.5 text-sm">
                <Label htmlFor="odo-to">To</Label>
                <Input id="odo-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
            <div className="mt-3 h-56 short:h-40">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : chart.length === 0 ? (
                <p className="text-sm text-muted-foreground">No days in this window yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={24} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(_distance, _name, item) => {
                        const miles = (item?.payload as { distanceMi?: number } | undefined)?.distanceMi ?? 0;
                        return [formatDistance(miles, unit, 1), "Driven"];
                      }}
                      labelFormatter={(_label, payload) => {
                        const point = payload?.[0]?.payload as { label?: string } | undefined;
                        return point?.label ?? "";
                      }}
                    />
                    <Bar dataKey="distance" name="Driven" fill="#e31937" radius={[3, 3, 0, 0]} />
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
