import { formatChicagoStamp, chicagoParts } from "./time";
import {
  deriveCharges,
  deriveDrives,
  placeLabel,
  sampleActivity,
  type PlaceHint,
} from "./sessions";
import type {
  ChargeSession,
  DriveSession,
  ReportsPayload,
  TimelineItem,
  VehicleActivity,
  VehicleSample,
} from "./types";

const GAP_MS = 45 * 60 * 1000;

function emptyTotals(): Record<VehicleActivity, number> {
  return { parked: 0, driving: 0, charging: 0, asleep: 0, offline: 0 };
}

function take<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const out = items.filter((_, index) => index % step === 0);
  const last = items[items.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function weighted(drives: DriveSession[], pick: (drive: DriveSession) => number | null): number | null {
  let wh = 0;
  let miles = 0;
  for (const drive of drives) {
    const value = pick(drive);
    if (value == null) continue;
    wh += value * drive.distanceMi;
    miles += drive.distanceMi;
  }
  return miles > 0 ? wh / miles : null;
}

function sumCost(charges: ChargeSession[]): number | null {
  const costs = charges.map((charge) => charge.costUsd).filter((cost): cost is number => cost != null);
  if (costs.length === 0) return null;
  return costs.reduce((sum, cost) => sum + cost, 0);
}

function bucket(charges: ChargeSession[]) {
  return {
    count: charges.length,
    energyKwh: charges.reduce((sum, charge) => sum + charge.energyKwh, 0),
    costUsd: sumCost(charges),
  };
}

export function buildReports(input: {
  samples: VehicleSample[];
  now: Date;
  days: number;
  vehicleId?: string | null;
  rateUsdPerKwh: number | null;
  places?: PlaceHint;
  addresses?: Record<string, string>;
  units: ReportsPayload["units"];
  mode: ReportsPayload["mode"];
  source: ReportsPayload["source"];
  message: string;
}): ReportsPayload {
  const windowDays = input.days > 0 ? input.days : 400;
  const cutoff = input.now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const vehicleSamples = input.samples
    .filter((sample) => {
      if (input.vehicleId && sample.vehicleId !== input.vehicleId) return false;
      return new Date(sample.at).getTime() <= input.now.getTime();
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const inWindow = vehicleSamples.filter((sample) => new Date(sample.at).getTime() >= cutoff);
  const drives = deriveDrives(vehicleSamples, input.places, input.addresses).filter(
    (drive) => new Date(drive.endedAt).getTime() >= cutoff,
  );
  const charges = deriveCharges(
    vehicleSamples,
    input.rateUsdPerKwh,
    input.places,
    input.addresses,
  ).filter((charge) => new Date(charge.endedAt).getTime() >= cutoff);

  const distanceMi = drives.reduce((sum, drive) => sum + drive.distanceMi, 0);
  const driveMinutes = drives.reduce((sum, drive) => sum + drive.durationMin, 0);
  const speeds = drives.map((drive) => drive.maxSpeedMph);
  const elevation = drives
    .map((drive) => drive.elevationGainM)
    .filter((value): value is number => value != null);
  const energyAddedKwh = charges.reduce((sum, charge) => sum + charge.energyKwh, 0);
  const chargeMinutes = charges.reduce((sum, charge) => sum + charge.durationMin, 0);

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, distanceMi: 0 }));
  for (const drive of drives) {
    const hour = chicagoParts(new Date(drive.startedAt)).hour;
    const slot = byHour[hour];
    if (!slot) continue;
    slot.count += 1;
    slot.distanceMi += drive.distanceMi;
  }

  const ac = charges.filter((charge) => charge.kind === "AC");
  const dc = charges.filter((charge) => charge.kind === "DC");
  const placeMap = new Map<string, ChargeSession[]>();
  for (const charge of charges) {
    const list = placeMap.get(charge.placeLabel) ?? [];
    list.push(charge);
    placeMap.set(charge.placeLabel, list);
  }

  const efficiencyPoints = drives.map((drive) => ({
    at: drive.startedAt,
    label: formatChicagoStamp(new Date(drive.startedAt)),
    netWhPerMi: drive.efficiencyWhPerMi,
    grossWhPerMi: drive.grossWhPerMi,
    distanceMi: drive.distanceMi,
  }));

  const healthByDay = new Map<string, VehicleSample>();
  for (const sample of inWindow) {
    if (sample.batteryPercent < 15 || sample.ratedRangeMi <= 0) continue;
    const key = chicagoParts(new Date(sample.at)).key;
    const current = healthByDay.get(key);
    if (!current || Math.abs(sample.batteryPercent - 70) < Math.abs(current.batteryPercent - 70)) {
      healthByDay.set(key, sample);
    }
  }
  const healthPoints = [...healthByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, sample]) => {
      const fullRatedMi = sample.ratedRangeMi / (sample.batteryPercent / 100);
      return {
        at: sample.at,
        label: chicagoParts(new Date(sample.at)).key.slice(5),
        odometerMi: sample.odometerMi,
        fullRatedMi,
        degradationPct: null as number | null,
      };
    });
  const nominal = healthPoints[0]?.fullRatedMi ?? null;
  for (const point of healthPoints) {
    point.degradationPct =
      nominal && nominal > 0 ? ((nominal - point.fullRatedMi) / nominal) * 100 : null;
  }
  const currentHealth = healthPoints[healthPoints.length - 1];

  const levelSource = take(inWindow, 240);
  const chargeLevel = levelSource.map((sample) => ({
    at: sample.at,
    label: formatChicagoStamp(new Date(sample.at)),
    batteryPercent: sample.batteryPercent,
    usablePercent: sample.usableBatteryPercent ?? null,
  }));
  const projectedRange = levelSource.map((sample) => ({
    at: sample.at,
    label: formatChicagoStamp(new Date(sample.at)),
    ratedRangeMi: sample.ratedRangeMi,
    estRangeMi: sample.estRangeMi ?? null,
  }));
  const temperatures = take(
    inWindow.filter((sample) => sample.insideTempC != null || sample.outsideTempC != null),
    240,
  ).map((sample) => ({
    at: sample.at,
    label: formatChicagoStamp(new Date(sample.at)),
    insideC: sample.insideTempC,
    outsideC: sample.outsideTempC,
  }));

  const vampireEvents: ReportsPayload["vampire"]["events"] = [];
  let parked: VehicleSample[] = [];
  const flushParked = () => {
    if (parked.length < 2) {
      parked = [];
      return;
    }
    const start = parked[0];
    const end = parked[parked.length - 1];
    const hours = (new Date(end.at).getTime() - new Date(start.at).getTime()) / 3_600_000;
    const socDrop = start.batteryPercent - end.batteryPercent;
    if (hours >= 0.5 && socDrop >= 0.4) {
      vampireEvents.push({
        startedAt: start.at,
        endedAt: end.at,
        hours,
        socDrop,
        place: placeLabel(start.lat, start.lng, input.places, input.addresses),
      });
    }
    parked = [];
  };
  for (const sample of inWindow) {
    const activity = sampleActivity(sample);
    if (activity === "parked" || activity === "asleep") parked.push(sample);
    else flushParked();
  }
  flushParked();
  const totalSocDrop = vampireEvents.reduce((sum, event) => sum + event.socDrop, 0);
  const totalHours = vampireEvents.reduce((sum, event) => sum + event.hours, 0);

  const segments: ReportsPayload["states"]["segments"] = [];
  const totals = emptyTotals();
  let open: { activity: VehicleActivity; start: VehicleSample; end: VehicleSample } | null = null;
  const closeOpen = () => {
    if (!open) return;
    const minutes = (new Date(open.end.at).getTime() - new Date(open.start.at).getTime()) / 60_000;
    if (minutes > 0) {
      segments.push({
        startedAt: open.start.at,
        endedAt: open.end.at,
        activity: open.activity,
        minutes,
      });
      totals[open.activity] += minutes;
    }
    open = null;
  };
  for (const sample of inWindow) {
    const activity = sampleActivity(sample);
    if (!open) {
      open = { activity, start: sample, end: sample };
      continue;
    }
    const gap = new Date(sample.at).getTime() - new Date(open.end.at).getTime();
    if (activity === open.activity && gap <= GAP_MS) {
      open.end = sample;
      continue;
    }
    const previousEnd = open.end;
    closeOpen();
    if (gap > GAP_MS) {
      const minutes = gap / 60_000;
      segments.push({
        startedAt: previousEnd.at,
        endedAt: sample.at,
        activity: "offline",
        minutes,
      });
      totals.offline += minutes;
    }
    open = { activity, start: sample, end: sample };
  }
  closeOpen();

  const mileageMap = new Map<string, { min: number; max: number }>();
  for (const sample of inWindow) {
    const key = chicagoParts(new Date(sample.at)).key;
    const slot = mileageMap.get(key);
    if (!slot) mileageMap.set(key, { min: sample.odometerMi, max: sample.odometerMi });
    else {
      slot.min = Math.min(slot.min, sample.odometerMi);
      slot.max = Math.max(slot.max, sample.odometerMi);
    }
  }
  const mileagePoints = [...mileageMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, slot]) => ({
      day: day.slice(5),
      odometerMi: slot.max,
      distanceMi: Math.max(0, slot.max - slot.min),
    }));

  const updates: ReportsPayload["updates"] = [];
  let seenVersion = "";
  for (const sample of vehicleSamples) {
    const version = sample.softwareVersion?.trim();
    if (!version || version === seenVersion) continue;
    if (new Date(sample.at).getTime() < cutoff) {
      seenVersion = version;
      continue;
    }
    updates.push({ at: sample.at, version, odometerMi: sample.odometerMi });
    seenVersion = version;
  }

  const locationMap = new Map<string, { visits: number; minutes: number; lat: number | null; lng: number | null }>();
  let stay: VehicleSample[] | null = null;
  const flushStay = () => {
    if (!stay || stay.length === 0) {
      stay = null;
      return;
    }
    const start = stay[0];
    const end = stay[stay.length - 1];
    const name = placeLabel(start.lat, start.lng, input.places, input.addresses);
    const slot = locationMap.get(name) ?? { visits: 0, minutes: 0, lat: start.lat, lng: start.lng };
    slot.visits += 1;
    slot.minutes += Math.max(0, (new Date(end.at).getTime() - new Date(start.at).getTime()) / 60_000);
    locationMap.set(name, slot);
    stay = null;
  };
  for (const sample of inWindow) {
    const activity = sampleActivity(sample);
    if (activity === "parked" || activity === "asleep" || activity === "charging") {
      if (!stay) stay = [sample];
      else stay.push(sample);
    } else flushStay();
  }
  flushStay();

  const visited = take(
    inWindow.filter((sample) => sample.lat != null && sample.lng != null),
    300,
  ).map((sample) => ({ lat: sample.lat as number, lng: sample.lng as number }));

  const timeline: TimelineItem[] = [
    ...drives.map((drive) => ({
      at: drive.startedAt,
      kind: "drive" as const,
      title: drive.inProgress ? "Driving" : `${drive.fromLabel} to ${drive.toLabel}`,
      detail: `${drive.distanceMi.toFixed(1)} mi · ${Math.round(drive.durationMin)} min`,
      id: drive.id,
    })),
    ...charges.map((charge) => ({
      at: charge.startedAt,
      kind: "charge" as const,
      title: `${charge.kind} charge · ${charge.placeLabel}`,
      detail: `${charge.energyKwh.toFixed(1)} kWh · ${Math.round(charge.startBattery)}→${Math.round(charge.endBattery)}%`,
      id: charge.id,
    })),
    ...updates.map((update) => ({
      at: update.at,
      kind: "update" as const,
      title: `Software ${update.version}`,
      detail: `${Math.round(update.odometerMi).toLocaleString("en-US")} mi`,
    })),
    ...vampireEvents.map((event) => ({
      at: event.startedAt,
      kind: "state" as const,
      title: `Parked at ${event.place}`,
      detail: `${event.socDrop.toFixed(1)}% over ${event.hours.toFixed(1)} h`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 120);

  const recentDrives = drives.slice().reverse().slice(0, 200);
  const recentCharges = charges.slice().reverse().slice(0, 200);

  return {
    vehicleId: input.vehicleId ?? inWindow[0]?.vehicleId ?? null,
    vehicleName: inWindow[0]?.name ?? vehicleSamples[0]?.name ?? null,
    mode: input.mode,
    source: input.source,
    message: input.message,
    fetchedAt: input.now.toISOString(),
    from: new Date(cutoff).toISOString(),
    to: input.now.toISOString(),
    days: windowDays,
    units: input.units,
    statistics: {
      distanceMi,
      driveCount: drives.length,
      driveMinutes,
      avgSpeedMph: driveMinutes > 0 ? distanceMi / (driveMinutes / 60) : null,
      maxSpeedMph: speeds.length ? Math.max(...speeds) : null,
      avgWhPerMi: weighted(drives, (drive) => drive.efficiencyWhPerMi),
      avgGrossWhPerMi: weighted(drives, (drive) => drive.grossWhPerMi),
      elevationGainM: elevation.length ? elevation.reduce((sum, value) => sum + value, 0) : null,
      chargeCount: charges.length,
      energyAddedKwh,
      chargeMinutes,
      costUsd: sumCost(charges),
    },
    driveStats: {
      count: drives.length,
      distanceMi,
      durationMin: driveMinutes,
      avgDistanceMi: drives.length ? distanceMi / drives.length : null,
      avgDurationMin: drives.length ? driveMinutes / drives.length : null,
      avgSpeedMph: driveMinutes > 0 ? distanceMi / (driveMinutes / 60) : null,
      maxSpeedMph: speeds.length ? Math.max(...speeds) : null,
      efficiencyWhPerMi: weighted(drives, (drive) => drive.efficiencyWhPerMi),
      energyNetKwh: drives.reduce((sum, drive) => sum + (drive.energyNetKwh ?? 0), 0),
      byHour,
    },
    chargingStats: {
      count: charges.length,
      energyKwh: energyAddedKwh,
      energyUsedKwh: charges.reduce((sum, charge) => sum + charge.energyUsedKwh, 0),
      costUsd: sumCost(charges),
      durationMin: chargeMinutes,
      ac: bucket(ac),
      dc: bucket(dc),
      byPlace: [...placeMap.entries()]
        .map(([place, list]) => ({
          place,
          count: list.length,
          energyKwh: list.reduce((sum, charge) => sum + charge.energyKwh, 0),
          costUsd: sumCost(list),
        }))
        .sort((a, b) => b.energyKwh - a.energyKwh),
    },
    efficiency: {
      avgNetWhPerMi: weighted(drives, (drive) => drive.efficiencyWhPerMi),
      avgGrossWhPerMi: weighted(drives, (drive) => drive.grossWhPerMi),
      points: efficiencyPoints,
    },
    batteryHealth: {
      nominalMi: nominal,
      currentFullRatedMi: currentHealth?.fullRatedMi ?? null,
      degradationPct: currentHealth?.degradationPct ?? null,
      note: "Rated range at the sampled state of charge, scaled to a full pack. LFP cars (some Model 3 and Model Y RWD) should still be charged to 100% on the schedule Tesla recommends. Their reported range moves around more than a nickel pack, so treat this curve as a trend.",
      points: healthPoints,
    },
    chargeLevel,
    projectedRange,
    vampire: {
      totalSocDrop,
      totalHours,
      avgPctPerHour: totalHours > 0 ? totalSocDrop / totalHours : null,
      events: vampireEvents.slice().reverse(),
    },
    states: { segments: segments.slice(-80), totals },
    mileage: {
      totalMi: mileagePoints.reduce((sum, point) => sum + point.distanceMi, 0),
      points: mileagePoints,
    },
    temperatures,
    updates,
    timeline,
    locations: [...locationMap.entries()]
      .map(([name, slot]) => ({ name, ...slot }))
      .sort((a, b) => b.minutes - a.minutes),
    visited,
    drives: recentDrives,
    charges: recentCharges,
  };
}
