import { withActor } from "@/lib/auth/actor";
import { dataPath, readJson, writeJson } from "@/lib/store";
import type { ChargeSession } from "@/lib/types";

export type ChargePriceMap = Record<string, number>;

function pricesPath() {
  return dataPath("charge-prices.json");
}

export async function readChargePrices(): Promise<ChargePriceMap> {
  return withActor(readChargePricesNow);
}

async function readChargePricesNow(): Promise<ChargePriceMap> {
  const raw = await readJson<Record<string, unknown>>(pricesPath(), {});
  const prices: ChargePriceMap = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) prices[id] = value;
  }
  return prices;
}

export async function setChargePrice(id: string, amount: number | null) {
  return withActor(() => setChargePriceNow(id, amount));
}

async function setChargePriceNow(id: string, amount: number | null) {
  const prices = await readChargePrices();
  if (amount == null) delete prices[id];
  else prices[id] = Math.round(amount * 100) / 100;
  await writeJson(pricesPath(), prices);
}

export function applyChargePrices(charges: readonly ChargeSession[], prices: ChargePriceMap): ChargeSession[] {
  return charges.map((charge) => {
    const actual = prices[charge.id];
    if (actual == null) return charge;
    return {
      ...charge,
      guessUsd: charge.guessUsd ?? charge.costUsd,
      actualUsd: actual,
      costUsd: actual,
      free: actual === 0,
      costSource: "actual",
    };
  });
}
