"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function minutesRemaining(until: string | null, nowIso: string) {
  if (!until) return null;
  const ends = Date.parse(until);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(ends) || !Number.isFinite(now) || ends <= now) return null;
  return Math.max(1, Math.round((ends - now) / 60_000));
}

export function LiveData({
  enabled,
  until,
  now,
  demo,
  onChange,
}: {
  enabled: boolean;
  until: string | null;
  now: string;
  demo?: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minutesLeft = enabled ? minutesRemaining(until, now) : null;

  async function setEnabled(next: boolean) {
    setPending(true);
    setError(null);
    try {
      await onChange(next);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change live data");
    } finally {
      setPending(false);
    }
  }

  if (enabled) {
    return (
      <Alert>
        <AlertTitle>Live data is on</AlertTitle>
        <AlertDescription>
          <p>
            {demo
              ? "Demo mode is only refreshing the sample car. On a connected car the battery drains faster."
              : "The car stays awake and the battery drains faster."}
            {minutesLeft != null ? ` This turns itself off in about ${minutesLeft} min.` : ""}
          </p>
          <Button className="mt-2" size="sm" variant="outline" disabled={pending} onClick={() => void setEnabled(false)}>
            {pending ? "Turning off…" : "Turn off"}
          </Button>
          {error && <p className="mt-2 text-red-300">{error}</p>}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card/80 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm">Live data is off</p>
          <p className="text-xs text-muted-foreground">The garage keeps the last report while the car sleeps.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide" : "View live data"}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-sm text-amber-100">
            {demo
              ? "On a connected car this wakes it and checks about every 15 seconds, so the battery drains faster. Demo mode only refreshes the sample."
              : "This wakes the car and checks it about every 15 seconds. The battery drains faster while live data is on."}{" "}
            It turns itself off after 30 minutes.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => void setEnabled(true)}>
              {pending ? "Turning on…" : "Turn on for 30 minutes"}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
