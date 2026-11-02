import type {
  ChargeSession,
  DriveSession,
  ShiftState,
  VehicleActivity,
  VehicleSample,
} from "./types";

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

function placeLabel(
  lat: number | null,
  lng: number | null,
  home?: { lat: number; lng: number; label: string; radiusM: number } | null,
): string {
  if (lat == null || lng == null) return "Unknown";
  if (home && home.lat != null && home.lng != null) {
    const meters =
      (Math.acos(
        Math.min(
          1,
          Math.max(
            -1,
            Math.sin((home.lat * Math.PI) / 180) * Math.sin((lat * Math.PI) / 180) +
              Math.cos((home.lat * Math.PI) / 180) *
                Math.cos((lat * Math.PI) / 180) *
                Math.cos(((lng - home.lng) * Math.PI) / 180),
          ),
        ),
      ) *
        6_371_000);
    if (meters <= home.radiusM) return home.label || "Home";
  }
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export function deriveDrives(
  samples: VehicleSample[],
  home?: { lat: number; lng: number; label: string; radiusM: number } | null,
): DriveSession[] {
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  const drives: DriveSession[] = [];
  let open: { start: VehicleSample; end: VehicleSample } | null = null;

  const close = (start: VehicleSample, end: VehicleSample, inProgress: boolean) => {
    const distance = end.odometerMi - start.odometerMi;
    const durationMin =
      (new Date(end.at).getTime() - new Date(start.at).getTime()) / 60_000;
    if (distance < 0.1 || durationMin < 1) return;
    const pack = end.packKwh || start.packKwh || 75;
    const drop = start.batteryPercent - end.batteryPercent;
    const wh = (drop / 100) * pack * 1000;
    const efficiency = distance > 0.2 && drop > 0 ? wh / distance : null;
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
      fromLabel: placeLabel(start.lat, start.lng, home),
      toLabel: placeLabel(end.lat, end.lng, home),
    });
  };

  let previous: VehicleSample | null = null;
  for (const sample of sorted) {
    const moving = isMoving(sample);
    if (moving && !open) {
      const previousClose =
        previous != null &&
        new Date(sample.at).getTime() - new Date(previous.at).getTime() <
          15 * 60 * 1000 &&
        !isMoving(previous);
      open = { start: previousClose && previous ? previous : sample, end: sample };
    } else if (moving && open) open.end = sample;
    else if (!moving && open) {
      close(open.start, open.end, false);
      open = null;
    }
    previous = sample;
  }
  if (open) close(open.start, open.end, true);
  return drives;
}

export function deriveCharges(
  samples: VehicleSample[],
  rateUsdPerKwh: number | null,
  home?: { lat: number; lng: number; label: string; radiusM: number } | null,
): ChargeSession[] {
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  const charges: ChargeSession[] = [];
  let open: VehicleSample[] | null = null;

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
    const peak = group.reduce((max, sample) => Math.max(max, sample.chargerPowerKw), 0);
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
      costUsd: rateUsdPerKwh == null ? null : energy * rateUsdPerKwh,
      placeLabel: placeLabel(start.lat, start.lng, home),
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
