import { activityFrom } from "./sessions";
import { addCalendarDays, chicagoDate, chicagoParts, chicagoYMD, dayIndex } from "./time";
import type { ShiftState, Vehicle, VehicleActivity, VehicleSample } from "./types";

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
const VEHICLE_ID = "demo-roadrunner";

export const DEMO_FENCES = [
  {
    id: "home",
    name: "Home",
    lat: DEMO_HOME.lat,
    lng: DEMO_HOME.lng,
    radiusM: 250,
    costPerKwh: 0.14,
    sessionFee: 0,
  },
  {
    id: "work",
    name: "Work",
    lat: WORK.lat,
    lng: WORK.lng,
    radiusM: 200,
    costPerKwh: 0,
    sessionFee: 0,
  },
];

interface Frame {
  at: number;
  battery: number;
  driveMi: number;
  shift: ShiftState;
  charging: string;
  energy: number;
  lat: number;
  lng: number;
  elevation: number;
  power: number;
  inside: number;
  outside: number;
  speed: number;
}

function placeOf(place: "home" | "work" | "mid") {
  if (place === "home") return { ...DEMO_HOME, elevation: 181 };
  if (place === "work") return { ...WORK, elevation: 180 };
  return { ...MID, elevation: 186 };
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
  const coords = placeOf(place);
  return {
    at: chicagoDate(y, m, d, hour, minute).getTime(),
    battery,
    driveMi,
    shift,
    charging,
    energy,
    lat: coords.lat,
    lng: coords.lng,
    elevation: coords.elevation,
    power,
    inside,
    outside,
    speed,
  };
}

function dayFrames(y: number, m: number, d: number): Frame[] {
  return [
    frame(y, m, d, 0, 15, 68, 0, "P", "Disconnected", 0, "home", 0, 17, 6, 0),
    frame(y, m, d, 0, 35, 69, 0, "P", "Charging", 0.2, "home", 11.5, 18, 6, 0),
    frame(y, m, d, 3, 0, 75, 0, "P", "Charging", 5.4, "home", 11.5, 20, 5, 0),
    frame(y, m, d, 6, 20, 80, 0, "P", "Charging", 9.4, "home", 7.2, 21, 5, 0),
    frame(y, m, d, 6, 40, 80, 0, "P", "Disconnected", 9.4, "home", 0, 20, 6, 0),
    frame(y, m, d, 7, 45, 80, 0, "D", "Disconnected", 0, "home", 0, 21, 6, 28),
    frame(y, m, d, 8, 4, 78, 6, "D", "Disconnected", 0, "mid", 0, 21, 7, 58),
    frame(y, m, d, 8, 22, 76, 11.4, "P", "Disconnected", 0, "work", 0, 19, 8, 0),
    frame(y, m, d, 12, 30, 75, 11.4, "P", "Disconnected", 0, "work", 0, 18, 11, 0),
    frame(y, m, d, 17, 15, 74, 11.4, "P", "Disconnected", 0, "work", 0, 19, 10, 0),
    frame(y, m, d, 17, 22, 74, 11.4, "D", "Disconnected", 0, "work", 0, 21, 9, 26),
    frame(y, m, d, 17, 42, 72, 17.2, "D", "Disconnected", 0, "mid", 0, 21, 8, 55),
    frame(y, m, d, 18, 2, 70, 23, "P", "Disconnected", 0, "home", 0, 20, 7, 0),
    frame(y, m, d, 23, 40, 68, 23, "P", "Disconnected", 0, "home", 0, 18, 6, 0),
  ];
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function fullRangeMi(odometerMi: number): number {
  const miles = Math.max(0, odometerMi - 16840);
  // A used pack sits near 292 miles. The last stretch keeps sloping so the
  // battery-health chart moves across the two weeks of demo history.
  const tail = Math.max(0, miles - 23_000);
  return Math.max(250, 292 - tail * 0.012);
}

function activityFor(current: Frame): VehicleActivity {
  if (current.charging === "Charging") return "charging";
  if (current.shift === "D" || current.shift === "R" || current.speed > 3) return "driving";
  const hour = chicagoParts(new Date(current.at)).hour;
  if (hour >= 23 || hour < 6) return "asleep";
  return "parked";
}

function lived(
  driving: boolean,
  charging: boolean,
  lat: number,
  lng: number,
  fast: boolean,
  chargerPowerKw: number,
): Pick<
  VehicleSample,
  | "locked"
  | "sentry"
  | "climateOn"
  | "chargeRateMph"
  | "tpmsPsi"
  | "doorOpen"
  | "windowsOpen"
  | "frunkOpen"
  | "trunkOpen"
  | "chargePortOpen"
> {
  const atWork = Math.abs(lat - WORK.lat) < 0.01 && Math.abs(lng - WORK.lng) < 0.01;
  return {
    locked: !driving,
    sentry: !driving && atWork,
    climateOn: driving,
    chargeRateMph: charging ? (fast || chargerPowerKw > 50 ? 520 : 32) : 0,
    tpmsPsi: { fl: 42, fr: 42.2, rl: 41.8, rr: 42.1 },
    doorOpen: false,
    windowsOpen: false,
    frunkOpen: false,
    trunkOpen: false,
    chargePortOpen: charging,
  };
}

function sampleFrom(
  frameAt: Frame,
  odoBase: number,
  atMs: number,
  softwareVersion: string,
  next?: Frame,
  u = 0,
): VehicleSample {
  const battery = next ? lerp(frameAt.battery, next.battery, u) : frameAt.battery;
  const driveMi = next ? lerp(frameAt.driveMi, next.driveMi, u) : frameAt.driveMi;
  const lat = next ? lerp(frameAt.lat, next.lat, u) : frameAt.lat;
  const lng = next ? lerp(frameAt.lng, next.lng, u) : frameAt.lng;
  const inside = next ? lerp(frameAt.inside, next.inside, u) : frameAt.inside;
  const outside = next ? lerp(frameAt.outside, next.outside, u) : frameAt.outside;
  const speed = next ? lerp(frameAt.speed, next.speed, u) : frameAt.speed;
  const elevation = next ? lerp(frameAt.elevation, next.elevation, u) : frameAt.elevation;
  const odometerMi = odoBase + driveMi;
  const rated = (battery / 100) * fullRangeMi(odometerMi);
  const charging = frameAt.charging === "Charging";
  const driving = frameAt.shift === "D" || frameAt.shift === "R";
  return {
    at: new Date(atMs).toISOString(),
    vehicleId: VEHICLE_ID,
    name: "Roadrunner",
    batteryPercent: Math.round(battery * 10) / 10,
    ratedRangeMi: rated,
    estRangeMi: rated * 0.93,
    idealRangeMi: rated * 1.2,
    usableBatteryPercent: battery,
    odometerMi,
    chargingState: frameAt.charging,
    chargerPowerKw: frameAt.power,
    energyAddedKwh: next ? lerp(frameAt.energy, next.energy, u) : frameAt.energy,
    shiftState: frameAt.shift,
    speedMph: speed,
    lat,
    lng,
    insideTempC: inside,
    outsideTempC: outside,
    packKwh: PACK_KWH,
    powerKw: driving ? speed * 0.55 + 8 : 0,
    elevationM: elevation,
    chargerVoltage: charging ? 240 : null,
    chargerCurrent: charging ? frameAt.power / 0.24 : null,
    chargerPhases: charging ? 1 : null,
    fastCharger: false,
    softwareVersion,
    activity: activityFor(frameAt),
    ...lived(driving, charging, lat, lng, false, frameAt.power),
  };
}

export function buildDemoSamples(now: Date): VehicleSample[] {
  const today = chicagoYMD(now);
  const nowMs = now.getTime();
  const samples: VehicleSample[] = [];

  for (let offset = -13; offset <= 0; offset += 1) {
    const day = addCalendarDays(today.y, today.m, today.d, offset);
    const base = 16840 + dayIndex(day.y, day.m, day.d) * 23;
    const version = offset <= -7 ? "2026.20.7" : "2026.32.6";
    const frames = dayFrames(day.y, day.m, day.d);
    for (let i = 0; i < frames.length; i += 1) {
      const current = frames[i];
      if (current.at > nowMs) break;
      const upcoming = frames[i + 1];
      samples.push(sampleFrom(current, base, current.at, version));
      if (!upcoming) continue;
      const segmentEnd = Math.min(upcoming.at, nowMs);
      const sameActivity = upcoming.shift === current.shift && upcoming.charging === current.charging;
      if (sameActivity) {
        const driving = current.shift === "D" || current.shift === "R";
        const step = driving ? 4 * 60 * 1000 : 20 * 60 * 1000;
        for (let t = current.at + step; t < segmentEnd; t += step) {
          const u = (t - current.at) / (upcoming.at - current.at);
          samples.push(sampleFrom(current, base, t, version, upcoming, u));
        }
      }
      if (nowMs > current.at && nowMs < upcoming.at) {
        const u = (nowMs - current.at) / (upcoming.at - current.at);
        samples.push(sampleFrom(current, base, nowMs, version, upcoming, u));
      }
    }

    if ((offset === -2 || offset === -6) && chicagoDate(day.y, day.m, day.d, 12, 48).getTime() <= nowMs) {
      samples.push(
        parkedCharge(chicagoDate(day.y, day.m, day.d, 12, 32), 74, 0.2, 6, WORK.lat, WORK.lng, base + 11.4, "Charging", false, version),
        parkedCharge(chicagoDate(day.y, day.m, day.d, 12, 48), 78, 3.4, 6, WORK.lat, WORK.lng, base + 11.4, "Charging", false, version),
      );
    }
    if (offset === -3 && chicagoDate(day.y, day.m, day.d, 19, 18).getTime() <= nowMs) {
      const stall = { lat: 41.829, lng: -87.633 };
      samples.push(
        parkedCharge(chicagoDate(day.y, day.m, day.d, 19, 5), 28, 1, 140, stall.lat, stall.lng, base + 23, "Charging", true, version),
        parkedCharge(chicagoDate(day.y, day.m, day.d, 19, 18), 64, 29, 90, stall.lat, stall.lng, base + 23, "Charging", true, version),
      );
    }
  }

  samples.sort((a, b) => a.at.localeCompare(b.at));
  return samples;
}

function parkedCharge(
  at: Date,
  battery: number,
  energy: number,
  power: number,
  lat: number,
  lng: number,
  odometerMi: number,
  chargingState: string,
  fast: boolean,
  version: string,
): VehicleSample {
  const rated = (battery / 100) * 280;
  return {
    at: at.toISOString(),
    vehicleId: VEHICLE_ID,
    name: "Roadrunner",
    batteryPercent: battery,
    ratedRangeMi: rated,
    estRangeMi: rated * 0.93,
    idealRangeMi: rated * 1.2,
    usableBatteryPercent: battery,
    odometerMi,
    chargingState,
    chargerPowerKw: power,
    energyAddedKwh: energy,
    shiftState: "P",
    speedMph: 0,
    lat,
    lng,
    insideTempC: 21,
    outsideTempC: 8,
    packKwh: PACK_KWH,
    powerKw: 0,
    elevationM: 180,
    chargerVoltage: fast ? 400 : 240,
    chargerCurrent: power > 0 ? power / (fast ? 0.4 : 0.24) : 0,
    chargerPhases: fast ? null : 1,
    fastCharger: fast,
    softwareVersion: version,
    activity: chargingState === "Charging" ? "charging" : "parked",
    ...lived(false, chargingState === "Charging", lat, lng, fast, power),
  };
}

export function vehicleFromSample(
  sample: VehicleSample,
  home: { lat: number; lng: number; label: string; radiusM: number } | null,
): Vehicle {
  const homeDistanceMi =
    home && sample.lat != null && sample.lng != null
      ? Math.hypot(
          (sample.lat - home.lat) * 69,
          (sample.lng - home.lng) * 69 * Math.cos((home.lat * Math.PI) / 180),
        )
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
  const state =
    sample.activity ??
    activityFrom({
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
    softwareVersion: sample.softwareVersion || "2026.32.6",
    updateAvailable: sample.softwareVersion === "2026.20.7" ? "2026.32.6" : null,
    odometerMi: sample.odometerMi,
    batteryPercent: sample.batteryPercent,
    chargeLimitPercent: 80,
    ratedRangeMi: sample.ratedRangeMi,
    estRangeMi: sample.estRangeMi ?? sample.ratedRangeMi * 0.93,
    idealRangeMi: sample.idealRangeMi ?? null,
    usableBatteryPercent: sample.usableBatteryPercent ?? sample.batteryPercent,
    chargingState: sample.chargingState,
    chargerPowerKw: sample.chargerPowerKw,
    chargeRateMph: sample.chargeRateMph ?? (state === "charging" ? 36 : 0),
    minutesToFull,
    energyAddedKwh: sample.energyAddedKwh,
    cable: state === "charging" ? "Wall Connector" : "",
    insideTempC: sample.insideTempC,
    outsideTempC: sample.outsideTempC,
    climateOn: sample.climateOn ?? state === "driving",
    setpointC: 21,
    locked: sample.locked ?? state !== "driving",
    sentry: sample.sentry ?? Boolean(atWork && state !== "driving"),
    windowsOpen: sample.windowsOpen ?? false,
    frunkOpen: sample.frunkOpen ?? false,
    trunkOpen: sample.trunkOpen ?? false,
    doorOpen: sample.doorOpen ?? false,
    chargePortOpen: sample.chargePortOpen ?? state === "charging",
    tpmsPsi: sample.tpmsPsi ?? { fl: 42, fr: 42.2, rl: 41.8, rr: 42.1 },
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
    powerKw: sample.powerKw ?? null,
    elevationM: sample.elevationM ?? null,
    chargerVoltage: sample.chargerVoltage ?? null,
    chargerCurrent: sample.chargerCurrent ?? null,
    chargerPhases: sample.chargerPhases ?? null,
    fastCharger: sample.fastCharger ?? false,
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
