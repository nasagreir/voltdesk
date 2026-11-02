import { formatChicago } from "./time";
import { deriveCharges, deriveDrives, type PlaceHint } from "./sessions";
import type {
  HistoryPayload,
  HistoryRange,
  HistorySeriesPoint,
  VehicleSample,
} from "./types";

const RANGE_MS: Record<HistoryRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};

export function buildHistory(input: {
  samples: VehicleSample[];
  range: HistoryRange;
  now: Date;
  vehicleId?: string | null;
  rateUsdPerKwh: number | null;
  home?: PlaceHint;
  mode: HistoryPayload["mode"];
  source: HistoryPayload["source"];
  units: HistoryPayload["units"];
  message: string;
}): HistoryPayload {
  const cutoff = input.now.getTime() - RANGE_MS[input.range];
  const vehicleSamples = input.samples.filter((sample) => {
    if (input.vehicleId && sample.vehicleId !== input.vehicleId) return false;
    return new Date(sample.at).getTime() <= input.now.getTime();
  });
  const inWindow = vehicleSamples.filter(
    (sample) => new Date(sample.at).getTime() >= cutoff,
  );
  const home = input.home ?? null;
  const drives = deriveDrives(vehicleSamples, home).filter(
    (drive) => new Date(drive.endedAt).getTime() >= cutoff,
  );
  const charges = deriveCharges(vehicleSamples, input.rateUsdPerKwh, home).filter(
    (charge) => new Date(charge.endedAt).getTime() >= cutoff,
  );

  const step = Math.max(1, Math.ceil(inWindow.length / 240));
  const series: HistorySeriesPoint[] = [];
  for (let i = 0; i < inWindow.length; i += step) {
    const sample = inWindow[i];
    series.push({
      at: sample.at,
      label: formatChicago(new Date(sample.at), input.range),
      batteryPercent: sample.batteryPercent,
      ratedRangeMi: sample.ratedRangeMi,
      chargerPowerKw: sample.chargerPowerKw,
    });
  }
  const last = inWindow[inWindow.length - 1];
  if (last && series[series.length - 1]?.at !== last.at) {
    series.push({
      at: last.at,
      label: formatChicago(new Date(last.at), input.range),
      batteryPercent: last.batteryPercent,
      ratedRangeMi: last.ratedRangeMi,
      chargerPowerKw: last.chargerPowerKw,
    });
  }

  const distanceMi = drives.reduce((sum, drive) => sum + drive.distanceMi, 0);
  const weightedWh = drives.reduce((sum, drive) => {
    if (drive.efficiencyWhPerMi == null) return sum;
    return sum + drive.efficiencyWhPerMi * drive.distanceMi;
  }, 0);
  const weightedMiles = drives.reduce((sum, drive) => {
    if (drive.efficiencyWhPerMi == null) return sum;
    return sum + drive.distanceMi;
  }, 0);
  const energyAddedKwh = charges.reduce((sum, charge) => sum + charge.energyKwh, 0);
  const costs = charges
    .map((charge) => charge.costUsd)
    .filter((cost): cost is number => cost != null);
  const batteries = inWindow.map((sample) => sample.batteryPercent);

  return {
    range: input.range,
    vehicleId: input.vehicleId ?? inWindow[0]?.vehicleId ?? null,
    vehicleName: inWindow[0]?.name ?? vehicleSamples[0]?.name ?? null,
    mode: input.mode,
    source: input.source,
    fetchedAt: input.now.toISOString(),
    units: input.units,
    summary: {
      sampleCount: inWindow.length,
      distanceMi,
      driveCount: drives.length,
      avgWhPerMi: weightedMiles > 0 ? weightedWh / weightedMiles : null,
      energyAddedKwh,
      chargeCount: charges.length,
      costUsd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
      driveMinutes: drives.reduce((sum, drive) => sum + drive.durationMin, 0),
      minBattery: batteries.length ? Math.min(...batteries) : null,
      maxBattery: batteries.length ? Math.max(...batteries) : null,
    },
    series,
    drives: drives.slice().reverse(),
    charges: charges.slice().reverse(),
    message: input.message,
  };
}
