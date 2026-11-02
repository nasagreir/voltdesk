import { activityFrom } from "./sessions";
import { chicagoDate, chicagoYMD, addCalendarDays, dayIndex } from "./time";
import type { ShiftState, Vehicle, VehicleSample } from "./types";

export const DEMO_HOME = {
  lat: 41.9482,
  lng: -87.6684,
  label: "Home",
  radiusM: 250,
};

const WORK = { lat: 41.8858, lng: -87.6324 };
const MID = {
  lat: (DEMO_HOME.lat + WORK.lat) / 2,
  lng: (DEMO_HOME.lng + WORK.lng) / 2,
};

const PACK_KWH = 78.1;
const FULL_RANGE_MI = 310;
const VEHICLE_ID = "demo-roadrunner";

interface Frame {
  at: number;
  battery: number;
  driveMi: number;
  shift: ShiftState;
  charging: string;
  energy: number;
  lat: number;
  lng: number;
  power: number;
  inside: number;
  outside: number;
  speed: number;
}

function frame(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  battery: number,
  driveMi: number,
  shift: ShiftState,
  charging: string,
  energy: number,
  place: "home" | "work" | "mid",
  power: number,
  inside: number,
  outside: number,
  speed: number,
): Frame {
  const coords = place === "home" ? DEMO_HOME : place === "work" ? WORK : MID;
  return {
    at: chicagoDate(y, m, d, hour, minute).getTime(),
    battery,
    driveMi,
    shift,
    charging,
    energy,
    lat: coords.lat,
    lng: coords.lng,
    power,
    inside,
    outside,
    speed,
  };
}

function dayFrames(y: number, m: number, d: number): Frame[] {
  return [
    frame(y, m, d, 0, 15, 68, 0, "P", "Disconnected", 0, "home", 0, 17, 6, 0),
    frame(y, m, d, 0, 35, 69, 0, "P", "Charging", 0.6, "home", 11.5, 18, 6, 0),
    frame(y, m, d, 3, 0, 75, 0, "P", "Charging", 5.4, "home", 11.5, 20, 5, 0),
    frame(y, m, d, 6, 20, 80, 0, "P", "Charging", 9.4, "home", 7.2, 21, 5, 0),
    frame(y, m, d, 6, 40, 80, 0, "P", "Disconnected", 0, "home", 0, 20, 6, 0),
    frame(y, m, d, 7, 45, 80, 0, "D", "Disconnected", 0, "home", 0, 21, 6, 28),
    frame(y, m, d, 8, 4, 78, 6, "D", "Disconnected", 0, "mid", 0, 21, 7, 34),
    frame(y, m, d, 8, 22, 76, 11.4, "P", "Disconnected", 0, "work", 0, 19, 8, 0),
    frame(y, m, d, 12, 30, 75, 11.4, "P", "Disconnected", 0, "work", 0, 18, 11, 0),
    frame(y, m, d, 17, 15, 74, 11.4, "P", "Disconnected", 0, "work", 0, 19, 10, 0),
    frame(y, m, d, 17, 22, 74, 11.4, "D", "Disconnected", 0, "work", 0, 21, 9, 26),
    frame(y, m, d, 17, 42, 72, 17.2, "D", "Disconnected", 0, "mid", 0, 21, 8, 33),
    frame(y, m, d, 18, 2, 70, 23, "P", "Disconnected", 0, "home", 0, 20, 7, 0),
    frame(y, m, d, 23, 40, 68, 23, "P", "Disconnected", 0, "home", 0, 18, 6, 0),
  ];
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function sampleFrom(frameAt: Frame, odoBase: number, atMs: number, next?: Frame, u = 0): VehicleSample {
  const battery = next ? lerp(frameAt.battery, next.battery, u) : frameAt.battery;
  const driveMi = next ? lerp(frameAt.driveMi, next.driveMi, u) : frameAt.driveMi;
  const lat = next ? lerp(frameAt.lat, next.lat, u) : frameAt.lat;
  const lng = next ? lerp(frameAt.lng, next.lng, u) : frameAt.lng;
  const inside = next ? lerp(frameAt.inside, next.inside, u) : frameAt.inside;
  const outside = next ? lerp(frameAt.outside, next.outside, u) : frameAt.outside;
  return {
    at: new Date(atMs).toISOString(),
    vehicleId: VEHICLE_ID,
    name: "Roadrunner",
    batteryPercent: Math.round(battery * 10) / 10,
    ratedRangeMi: (battery / 100) * FULL_RANGE_MI,
    odometerMi: odoBase + driveMi,
    chargingState: frameAt.charging,
    chargerPowerKw: frameAt.power,
    energyAddedKwh: next ? lerp(frameAt.energy, next.energy, u) : frameAt.energy,
    shiftState: frameAt.shift,
    speedMph: frameAt.speed,
    lat,
    lng,
    insideTempC: inside,
    outsideTempC: outside,
    packKwh: PACK_KWH,
  };
}

export function buildDemoSamples(now: Date): VehicleSample[] {
  const today = chicagoYMD(now);
  const nowMs = now.getTime();
  const samples: VehicleSample[] = [];

  for (let offset = -13; offset <= 0; offset += 1) {
    const day = addCalendarDays(today.y, today.m, today.d, offset);
    const base = 16840 + dayIndex(day.y, day.m, day.d) * 23;
    const frames = dayFrames(day.y, day.m, day.d);
    for (let i = 0; i < frames.length; i += 1) {
      const current = frames[i];
      if (current.at > nowMs) break;
      const upcoming = frames[i + 1];
      samples.push(sampleFrom(current, base, current.at));
      if (!upcoming) continue;
      const segmentEnd = Math.min(upcoming.at, nowMs);
      const step = 20 * 60 * 1000;
      for (let t = current.at + step; t < segmentEnd; t += step) {
        const u = (t - current.at) / (upcoming.at - current.at);
        samples.push(sampleFrom(current, base, t, upcoming, u));
      }
      if (nowMs > current.at && nowMs < upcoming.at) {
        const u = (nowMs - current.at) / (upcoming.at - current.at);
        samples.push(sampleFrom(current, base, nowMs, upcoming, u));
      }
    }
  }

  samples.sort((a, b) => a.at.localeCompare(b.at));
  return samples;
}

export function vehicleFromSample(
  sample: VehicleSample,
  home: { lat: number; lng: number; label: string; radiusM: number } | null,
): Vehicle {
  const homeDistanceMi =
    home && sample.lat != null && sample.lng != null
      ? (Math.hypot(
          (sample.lat - home.lat) * 69,
          (sample.lng - home.lng) * 69 * Math.cos((home.lat * Math.PI) / 180),
        ))
      : null;
  const atHome =
    homeDistanceMi == null || home == null
      ? null
      : homeDistanceMi * 1609.344 <= home.radiusM;
  const atWork =
    sample.lat != null &&
    sample.lng != null &&
    Math.abs(sample.lat - WORK.lat) < 0.01 &&
    Math.abs(sample.lng - WORK.lng) < 0.01;
  const state = activityFrom({
    chargingState: sample.chargingState,
    shiftState: sample.shiftState,
    speedMph: sample.speedMph,
  });
  const minutesToFull =
    state === "charging" && sample.batteryPercent < 80 && sample.chargerPowerKw > 0
      ? ((80 - sample.batteryPercent) / 100) * sample.packKwh / sample.chargerPowerKw * 60
      : null;

  return {
    id: sample.vehicleId,
    name: sample.name,
    vin: "7SAYGDEE0PF000001",
    model: "Model Y",
    trim: "Long Range AWD",
    color: "Pearl White",
    packKwh: sample.packKwh,
    state,
    softwareVersion: "2026.32.6",
    updateAvailable: null,
    odometerMi: sample.odometerMi,
    batteryPercent: sample.batteryPercent,
    chargeLimitPercent: 80,
    ratedRangeMi: sample.ratedRangeMi,
    estRangeMi: sample.ratedRangeMi * 0.93,
    chargingState: sample.chargingState,
    chargerPowerKw: sample.chargerPowerKw,
    chargeRateMph: state === "charging" ? 36 : 0,
    minutesToFull,
    energyAddedKwh: sample.energyAddedKwh,
    cable: state === "charging" ? "Wall Connector" : "",
    chargePortOpen: state === "charging",
    insideTempC: sample.insideTempC,
    outsideTempC: sample.outsideTempC,
    climateOn: state === "driving",
    setpointC: 21,
    locked: state !== "driving",
    sentry: Boolean(atWork && state !== "driving"),
    windowsOpen: false,
    frunkOpen: false,
    trunkOpen: false,
    doorOpen: false,
    tpmsPsi: { fl: 42, fr: 42.2, rl: 41.8, rr: 42.1 },
    lat: sample.lat,
    lng: sample.lng,
    heading: state === "driving" ? (sample.shiftState === "D" ? 120 : 300) : 18,
    speedMph: sample.speedMph,
    shiftState: sample.shiftState,
    atHome,
    homeDistanceMi,
    lastUpdated: sample.at,
    stale: false,
    alerts: [],
  };
}

export function buildDemo(now = new Date()): {
  vehicle: Vehicle;
  samples: VehicleSample[];
} {
  const samples = buildDemoSamples(now);
  const latest = samples[samples.length - 1];
  if (!latest) {
    throw new Error("Demo timeline produced no samples");
  }
  return { vehicle: vehicleFromSample(latest, DEMO_HOME), samples };
}
