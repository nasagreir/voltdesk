import { haversineMeters } from "./geo";
import type {
  ChargeSession,
  DriveSession,
  Geofence,
  ShiftState,
  VehicleActivity,
  VehicleSample,
} from "./types";

export type PlaceHint =
  | Geofence[]
  | { lat: number; lng: number; label: string; radiusM: number }
  | null
  | undefined;

const WH_PER_RATED_MILE = 252;

export function isMoving(sample: {
  shiftState: ShiftState;
  speedMph: number;
}): boolean {
  return (
    sample.shiftState === "D" ||
    sample.shiftState === "R" ||
    sample.speedMph > 3
  );
}

export function isCharging(sample: { chargingState: string }): boolean {
  const state = sample.chargingState.toLowerCase();
  return state === "charging" || state === "starting";
}

export function activityFrom(input: {
  chargingState: string;
  shiftState: ShiftState;
  speedMph?: number;
  asleep?: boolean;
  offline?: boolean;
}): VehicleActivity {
  if (input.offline) return "offline";
  if (isCharging(input)) return "charging";
  if (isMoving({ shiftState: input.shiftState, speedMph: input.speedMph ?? 0 })) {
    return "driving";
  }
  if (input.asleep) return "asleep";
  return "parked";
}

export function sampleActivity(sample: VehicleSample): VehicleActivity {
  if (sample.activity) return sample.activity;
  return activityFrom({
    chargingState: sample.chargingState,
    shiftState: sample.shiftState,
    speedMph: sample.speedMph,
  });
}

export function asFences(hint: PlaceHint): Geofence[] {
  if (!hint) return [];
  if (Array.isArray(hint)) return hint;
  if (hint.lat == null || hint.lng == null) return [];
  return [
    {
      id: "home",
      name: hint.label || "Home",
      lat: hint.lat,
      lng: hint.lng,
      radiusM: hint.radiusM,
      costPerKwh: 0,
      sessionFee: 0,
    },
  ];
}

export function matchFence(
  lat: number,
  lng: number,
  fences: Geofence[],
): Geofence | null {
  let best: { fence: Geofence; meters: number } | null = null;
  for (const fence of fences) {
    const meters = haversineMeters(lat, lng, fence.lat, fence.lng);
    if (meters <= fence.radiusM && (!best || meters < best.meters)) {
      best = { fence, meters };
    }
  }
  return best?.fence ?? null;
}

export function addressKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function placeLabel(
  lat: number | null,
  lng: number | null,
  hint?: PlaceHint,
  addresses?: Record<string, string>,
): string {
  if (lat == null || lng == null) return "Unknown";
  const fence = matchFence(lat, lng, asFences(hint));
  if (fence) return fence.name || "Home";
  const cached = addresses?.[addressKey(lat, lng)];
  if (cached) return cached;
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

function finite(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => value != null && Number.isFinite(value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function thinPath(
  points: Array<{ lat: number; lng: number }>,
  max = 60,
): Array<{ lat: number; lng: number }> {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

function elevationGain(group: VehicleSample[]): number | null {
  let gain = 0;
  let prev: number | null = null;
  let seen = false;
  for (const sample of group) {
    if (sample.elevationM == null || !Number.isFinite(sample.elevationM)) continue;
    if (prev != null && sample.elevationM > prev) gain += sample.elevationM - prev;
    prev = sample.elevationM;
    seen = true;
  }
  return seen ? gain : null;
}

export function deriveDrives(
  samples: VehicleSample[],
  places?: PlaceHint,
  addresses?: Record<string, string>,
): DriveSession[] {
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  const drives: DriveSession[] = [];
  let open: VehicleSample[] | null = null;

  const close = (group: VehicleSample[], inProgress: boolean) => {
    const start = group[0];
    const end = group[group.length - 1];
    const distance = end.odometerMi - start.odometerMi;
    const durationMin =
      (new Date(end.at).getTime() - new Date(start.at).getTime()) / 60_000;
    if (distance < 0.1 || durationMin < 1) return;
    const pack = end.packKwh || start.packKwh || 75;
    const drop = start.batteryPercent - end.batteryPercent;
    const wh = (drop / 100) * pack * 1000;
    const efficiency = distance > 0.2 && drop > 0 ? wh / distance : null;
    const ratedDrop = start.ratedRangeMi - end.ratedRangeMi;
    const gross = distance > 0.2 && ratedDrop > 0 ? (ratedDrop * WH_PER_RATED_MILE) / distance : null;
    const moving = group.filter((sample) => isMoving(sample));
    const speeds = finite(moving.map((sample) => sample.speedMph));
    const powers = finite(moving.map((sample) => sample.powerKw));
    const temps = finite(group.map((sample) => sample.outsideTempC));
    const path = thinPath(
      group
        .filter((sample) => sample.lat != null && sample.lng != null)
        .map((sample) => ({ lat: sample.lat as number, lng: sample.lng as number })),
    );
    drives.push({
      id: `${start.vehicleId}-${start.at}`,
      vehicleId: start.vehicleId,
      startedAt: start.at,
      endedAt: end.at,
      inProgress,
      distanceMi: distance,
      durationMin,
      startBattery: start.batteryPercent,
      endBattery: end.batteryPercent,
      efficiencyWhPerMi: efficiency,
      fromLabel: placeLabel(start.lat, start.lng, places, addresses),
      toLabel: placeLabel(end.lat, end.lng, places, addresses),
      energyNetKwh: Number.isFinite(drop) ? (drop / 100) * pack : null,
      grossWhPerMi: gross,
      avgSpeedMph: durationMin > 0 ? distance / (durationMin / 60) : 0,
      maxSpeedMph: speeds.length ? Math.max(...speeds) : 0,
      maxPowerKw: powers.length ? Math.max(...powers) : null,
      minPowerKw: powers.length ? Math.min(...powers) : null,
      outsideTempC: average(temps),
      elevationGainM: elevationGain(group),
      startRatedRangeMi: start.ratedRangeMi,
      endRatedRangeMi: end.ratedRangeMi,
      startIdealRangeMi: start.idealRangeMi ?? null,
      endIdealRangeMi: end.idealRangeMi ?? null,
      path,
    });
  };

  let previous: VehicleSample | null = null;
  for (const sample of sorted) {
    const moving = isMoving(sample);
    if (moving && !open) {
      const previousClose =
        previous != null &&
        new Date(sample.at).getTime() - new Date(previous.at).getTime() < 15 * 60 * 1000 &&
        !isMoving(previous);
      open = previousClose && previous ? [previous, sample] : [sample];
    } else if (moving && open) open.push(sample);
    else if (!moving && open) {
      open.push(sample);
      close(open, false);
      open = null;
    }
    previous = sample;
  }
  if (open) close(open, true);
  return drives;
}

export function deriveCharges(
  samples: VehicleSample[],
  rateUsdPerKwh: number | null,
  places?: PlaceHint,
  addresses?: Record<string, string>,
): ChargeSession[] {
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  const charges: ChargeSession[] = [];
  let open: VehicleSample[] | null = null;
  const priced = Array.isArray(places);

  const close = (group: VehicleSample[], inProgress: boolean) => {
    const start = group[0];
    const end = group[group.length - 1];
    const durationMin =
      (new Date(end.at).getTime() - new Date(start.at).getTime()) / 60_000;
    let energy = end.energyAddedKwh - start.energyAddedKwh;
    if (!Number.isFinite(energy) || energy < 0) energy = end.energyAddedKwh;
    if (energy < 0.15) {
      const pack = end.packKwh || 75;
      energy = Math.max(0, ((end.batteryPercent - start.batteryPercent) / 100) * pack);
    }
    if (energy < 0.2 && durationMin < 2) return;
    const chargingSamples = group.filter((sample) => isCharging(sample));
    const peak = group.reduce((max, sample) => Math.max(max, sample.chargerPowerKw), 0);
    const fast = group.some((sample) => sample.fastCharger);
    const kind: "AC" | "DC" = fast || peak >= 20 ? "DC" : "AC";
    const avgKw =
      chargingSamples.reduce((sum, sample) => sum + sample.chargerPowerKw, 0) /
      Math.max(1, chargingSamples.length);
    const hours = Math.max(durationMin, 0) / 60;
    const integrated = avgKw > 0.2 && hours > 0 ? avgKw * hours : 0;
    const fromAdded = energy / (kind === "DC" ? 0.97 : 0.93);
    const energyUsed =
      integrated >= energy && integrated <= energy * 1.35 ? integrated : fromAdded;
    const fence =
      start.lat != null && start.lng != null
        ? matchFence(start.lat, start.lng, asFences(places))
        : null;
    let cost: number | null = null;
    if (priced && fence) cost = energy * fence.costPerKwh + fence.sessionFee;
    else if (rateUsdPerKwh != null) cost = energy * rateUsdPerKwh;
    const volts = finite(group.map((sample) => sample.chargerVoltage));
    const amps = finite(group.map((sample) => sample.chargerCurrent));
    const phases = finite(group.map((sample) => sample.chargerPhases));
    const temps = finite(group.map((sample) => sample.outsideTempC));
    const rangeAdded = end.ratedRangeMi - start.ratedRangeMi;
    charges.push({
      id: `${start.vehicleId}-charge-${start.at}`,
      vehicleId: start.vehicleId,
      startedAt: start.at,
      endedAt: end.at,
      inProgress,
      energyKwh: energy,
      startBattery: start.batteryPercent,
      endBattery: end.batteryPercent,
      durationMin,
      peakPowerKw: peak,
      costUsd: cost,
      placeLabel: placeLabel(start.lat, start.lng, places, addresses),
      energyUsedKwh: energyUsed,
      rangeAddedMi: rangeAdded > 0 ? rangeAdded : 0,
      kind,
      voltage: average(volts),
      current: average(amps),
      phases: phases.length ? Math.max(...phases) : null,
      outsideTempC: average(temps),
      efficiencyPct: energyUsed > 0 ? (energy / energyUsed) * 100 : null,
      lat: start.lat,
      lng: start.lng,
    });
  };

  for (const sample of sorted) {
    if (isCharging(sample)) {
      if (!open) open = [sample];
      else open.push(sample);
    } else if (open) {
      open.push(sample);
      close(open, false);
      open = null;
    }
  }
  if (open) close(open, true);
  return charges;
}
