import { formatDistance } from "@/lib/format";
import type { DistanceUnit, DriveSession, TripRange } from "@/lib/types";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TARGET_MILES = 300;
const MIN_MILES = 15;

export interface TripRangeInput {
  drives: readonly Pick<DriveSession, "distanceMi" | "efficiencyWhPerMi" | "endedAt" | "inProgress">[];
  batteryPercent: number;
  chargeLimitPercent: number;
  packKwh: number;
  now?: Date;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function rangeMiles(percent: number, packKwh: number, whPerMi: number) {
  return ((clampPercent(percent) / 100) * packKwh * 1000) / whPerMi;
}

export function estimateTripRange(input: TripRangeInput, now = input.now ?? new Date()) {
  const pack = input.packKwh;
  const nowMs = now.getTime();
  const recent = input.drives
    .filter((drive) => {
      if (drive.inProgress) return false;
      const wh = drive.efficiencyWhPerMi;
      if (wh == null || wh < 80 || wh > 900) return false;
      if (drive.distanceMi < 0.2) return false;
      const ended = Date.parse(drive.endedAt);
      return Number.isFinite(ended) && nowMs - ended <= WINDOW_MS && ended <= nowMs;
    })
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));

  let distanceMi = 0;
  let wattHours = 0;
  let trips = 0;
  for (const drive of recent) {
    if (distanceMi >= TARGET_MILES && trips >= 3) break;
    distanceMi += drive.distanceMi;
    wattHours += (drive.efficiencyWhPerMi ?? 0) * drive.distanceMi;
    trips += 1;
  }

  if (pack <= 0 || distanceMi < MIN_MILES || wattHours <= 0) {
    return { rangeMi: null, atLimitMi: null, whPerMi: null, trips, distanceMi };
  }

  const whPerMi = wattHours / distanceMi;
  return {
    rangeMi: rangeMiles(input.batteryPercent, pack, whPerMi),
    atLimitMi: rangeMiles(input.chargeLimitPercent, pack, whPerMi),
    whPerMi,
    trips,
    distanceMi,
  };
}

function consumptionLabel(whPerMi: number | null, unit: DistanceUnit) {
  if (whPerMi == null || !Number.isFinite(whPerMi)) return "—";
  const shown = unit === "km" ? whPerMi / 1.609344 : whPerMi;
  return `${Math.round(shown)} Wh/${unit}`;
}

export function presentTripRange(
  estimate: ReturnType<typeof estimateTripRange>,
  unit: DistanceUnit,
): TripRange {
  return {
    ...estimate,
    range: estimate.rangeMi == null ? "—" : formatDistance(estimate.rangeMi, unit, 0),
    atLimit: estimate.atLimitMi == null ? "—" : formatDistance(estimate.atLimitMi, unit, 0),
    consumption: consumptionLabel(estimate.whPerMi, unit),
    distance: formatDistance(estimate.distanceMi, unit, 0),
  };
}
