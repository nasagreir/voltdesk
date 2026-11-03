"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DateRangeBar } from "@/components/dashboard/date-range-bar";
import { presetRange } from "@/lib/time";
import { parseTripRange } from "@/lib/trips";
import type { ChargeCostSummary } from "@/lib/types";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: 400 },
] as const;

export function ChargeHistory({ vehicleId, initial }: { vehicleId: string; initial: ChargeCostSummary }) {
  const start = presetRange(30);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [summary, setSummary] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseTripRange(from, to);
    const timer = window.setTimeout(() => {
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      void (async () => {
        setError(null);
        try {
          const params = new URLSearchParams({ from, to, vehicle: vehicleId });
          const response = await fetch(`/api/charge-summary?${params}`, { cache: "no-store" });
          const body = (await response.json()) as ChargeCostSummary & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Could not load charge costs");
          setSummary(body);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not load charge costs");
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [from, to, vehicleId]);

  return (
    <div className="space-y-3">
      <DateRangeBar
        from={from}
        to={to}
        onChange={(nextFrom, nextTo) => {
          setFrom(nextFrom);
          setTo(nextTo);
        }}
        presets={PRESETS}
        fromId="charge-from"
        toId="charge-to"
        tone="page"
      />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {summary.count === 0 ? "No charges in this range" : `${summary.count} ${summary.count === 1 ? "charge" : "charges"}`}
            </p>
            <p className="font-heading text-lg">{summary.total}</p>
          </div>
          {summary.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No charges in this range yet.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {summary.lines.map((line) => (
                <li key={line.id}>
                  <Link
                    href={`/charges/${encodeURIComponent(line.id)}`}
                    className="flex items-start justify-between gap-3 py-2 text-sm hover:text-foreground"
                  >
                    <div className="min-w-0">
                      <div>{line.label}</div>
                      <div className="text-xs break-words text-muted-foreground">
                        {line.when} · {line.place} · {line.energy}
                      </div>
                    </div>
                    <div className="shrink-0">{line.cost}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {summary.count > summary.lines.length && (
            <p className="text-xs text-muted-foreground">
              Showing {summary.lines.length} of {summary.count}. The total includes every priced charge in the range.
            </p>
          )}
          {summary.unpriced > 0 && (
            <p className="text-xs text-muted-foreground">
              {summary.unpriced === 1
                ? "1 Supercharger session stays out of the total until you enter the amount. Tesla does not send that price."
                : `${summary.unpriced} Supercharger sessions stay out of the total until you enter the amounts. Tesla does not send those prices.`}
            </p>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        <Link href="/settings#home-charging" className="underline-offset-2 hover:underline">
          Home
        </Link>{" "}
        and{" "}
        <Link href="/settings#work-charging" className="underline-offset-2 hover:underline">
          work
        </Link>{" "}
        locations tag those charges and set the guess. Open a charge to enter what you actually paid.
      </p>
    </div>
  );
}
