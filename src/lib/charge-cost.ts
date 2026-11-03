import { money } from "@/lib/format";
import { chargeBillingLabel } from "@/lib/sessions";
import { formatChicagoStamp } from "@/lib/time";
import type { ChargeCostSummary, ChargeSession } from "@/lib/types";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LINES = 8;

export function summarizeCharges(charges: readonly ChargeSession[], now = new Date()): ChargeCostSummary {
  const recent = charges
    .filter((charge) => {
      const started = Date.parse(charge.startedAt);
      return Number.isFinite(started) && now.getTime() - started <= WINDOW_MS && started <= now.getTime();
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
      cost: charge.free ? "Free" : money(charge.costUsd),
      free: charge.free,
      billing: charge.billing,
    })),
    total: priced.length > 0 ? money(totalUsd) : "—",
    totalUsd: priced.length > 0 ? totalUsd : 0,
    unpriced: recent.filter((charge) => charge.costUsd == null).length,
    count: recent.length,
    windowDays: 30,
  };
}
