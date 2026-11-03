import { money } from "@/lib/format";
import { chargeBillingLabel } from "@/lib/sessions";
import { formatChicagoStamp } from "@/lib/time";
import type { ChargeCostSummary, ChargeSession } from "@/lib/types";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LINES = 8;

export function formatChargeCost(charge: Pick<ChargeSession, "costUsd" | "free" | "costSource">): string {
  if (charge.costSource === "actual") {
    return charge.costUsd === 0 ? "Free" : money(charge.costUsd);
  }
  if (charge.costUsd == null) return "—";
  if (charge.free || charge.costUsd === 0) return "Free";
  return `est. ${money(charge.costUsd)}`;
}

export function summarizeCharges(
  charges: readonly ChargeSession[],
  now = new Date(),
  bounds?: { from: Date; to: Date },
): ChargeCostSummary {
  const fromMs = bounds?.from.getTime() ?? now.getTime() - WINDOW_MS;
  const toMs = bounds?.to.getTime() ?? now.getTime();
  const recent = charges
    .filter((charge) => {
      const started = Date.parse(charge.startedAt);
      const ended = Date.parse(charge.endedAt);
      if (!Number.isFinite(started) || started > toMs) return false;
      if (bounds) return Number.isFinite(ended) && ended >= fromMs;
      return now.getTime() - started <= WINDOW_MS;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const priced = recent.filter((charge) => charge.costUsd != null);
  const totalUsd = priced.reduce((sum, charge) => sum + (charge.costUsd ?? 0), 0);
  return {
    lines: recent.slice(0, MAX_LINES).map((charge) => ({
      id: charge.id,
      when: formatChicagoStamp(new Date(charge.startedAt)),
      place: /[a-z]/i.test(charge.placeLabel) ? charge.placeLabel : "Not at a saved place",
      label: chargeBillingLabel(charge.billing, charge.free),
      energy: `${charge.energyKwh.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} kWh`,
      cost: formatChargeCost(charge),
      free: charge.free,
      billing: charge.billing,
      source: charge.costSource,
    })),
    total: priced.length > 0 ? money(totalUsd) : "—",
    totalUsd: priced.length > 0 ? totalUsd : 0,
    unpriced: recent.filter((charge) => charge.costUsd == null).length,
    count: recent.length,
    windowDays: bounds ? Math.max(1, Math.round((toMs - fromMs) / 86_400_000)) : 30,
  };
}
