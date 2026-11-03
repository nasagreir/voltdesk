import { addCalendarDays, chicagoParts, dayIndex, formatYMD } from "./time";
import { parseTripRange } from "./trips";
import type { DistanceUnit, TempUnit, VehicleSample } from "./types";

export const READING_METRICS = [
  "speed",
  "power",
  "elevation",
  "inside",
  "outside",
  "locked",
  "sentry",
  "climate",
  "readings",
  "charger",
  "chargeRate",
  "tires",
  "doors",
  "windows",
  "frunk",
  "trunk",
  "port",
  "software",
] as const;

export type ReadingMetric = (typeof READING_METRICS)[number];

export interface ReadingPoint {
  day: string;
  label: string;
  value: number | null;
  fl?: number | null;
  fr?: number | null;
  rl?: number | null;
  rr?: number | null;
}

export interface ReadingEvent {
  day: string;
  label: string;
  version: string;
}

export interface ReadingSeries {
  points: ReadingPoint[];
  events: ReadingEvent[];
  high: number | null;
  low: number | null;
  average: number | null;
  unitLabel: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(year: number, month: number, day: number, showYear: boolean): string {
  const base = `${MONTHS[month - 1] ?? ""} ${day}`;
  return showYear ? `${base}, ${year}` : base;
}

function driving(sample: VehicleSample): boolean {
  return sample.speedMph > 3 || sample.shiftState === "D" || sample.shiftState === "R";
}

function temp(celsius: number, unit: TempUnit): number {
  return unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
}

function speedOf(mph: number, unit: DistanceUnit): number {
  return unit === "km" ? mph * 1.609344 : mph;
}

interface Bucket {
  n: number;
  speed: number;
  power: number;
  charger: number;
  rate: number;
  elevation: number;
  elevationN: number;
  inside: number;
  insideN: number;
  outside: number;
  outsideN: number;
  locked: number;
  sentry: number;
  sentryN: number;
  climate: number;
  fl: number;
  fr: number;
  rl: number;
  rr: number;
  tireN: number;
  doors: number;
  windows: number;
  frunk: number;
  trunk: number;
  port: number;
}

function emptyBucket(): Bucket {
  return {
    n: 0,
    speed: 0,
    power: 0,
    charger: 0,
    rate: 0,
    elevation: 0,
    elevationN: 0,
    inside: 0,
    insideN: 0,
    outside: 0,
    outsideN: 0,
    locked: 0,
    sentry: 0,
    sentryN: 0,
    climate: 0,
    fl: 0,
    fr: 0,
    rl: 0,
    rr: 0,
    tireN: 0,
    doors: 0,
    windows: 0,
    frunk: 0,
    trunk: 0,
    port: 0,
  };
}

function absorb(bucket: Bucket, sample: VehicleSample, units: { distance: DistanceUnit; temp: TempUnit }) {
  bucket.n += 1;
  bucket.speed = Math.max(bucket.speed, speedOf(sample.speedMph, units.distance));
  if (sample.powerKw != null && Number.isFinite(sample.powerKw)) bucket.power = Math.max(bucket.power, sample.powerKw);
  if (Number.isFinite(sample.chargerPowerKw)) bucket.charger = Math.max(bucket.charger, sample.chargerPowerKw);
  const rate = sample.chargeRateMph ?? (sample.chargingState === "Charging" && sample.chargerPowerKw > 0 ? 32 : 0);
  bucket.rate = Math.max(bucket.rate, speedOf(rate, units.distance));
  if (sample.elevationM != null && Number.isFinite(sample.elevationM)) {
    bucket.elevation += sample.elevationM;
    bucket.elevationN += 1;
  }
  if (sample.insideTempC != null && Number.isFinite(sample.insideTempC)) {
    bucket.inside += temp(sample.insideTempC, units.temp);
    bucket.insideN += 1;
  }
  if (sample.outsideTempC != null && Number.isFinite(sample.outsideTempC)) {
    bucket.outside += temp(sample.outsideTempC, units.temp);
    bucket.outsideN += 1;
  }
  const moving = driving(sample);
  if (sample.locked ?? !moving) bucket.locked += 1;
  if (sample.sentry != null) {
    bucket.sentryN += 1;
    if (sample.sentry) bucket.sentry += 1;
  }
  if (sample.climateOn ?? moving) bucket.climate += 1;
  const tires = sample.tpmsPsi;
  if (tires && [tires.fl, tires.fr, tires.rl, tires.rr].every((psi) => psi != null && Number.isFinite(psi))) {
    bucket.fl += tires.fl ?? 0;
    bucket.fr += tires.fr ?? 0;
    bucket.rl += tires.rl ?? 0;
    bucket.rr += tires.rr ?? 0;
    bucket.tireN += 1;
  }
  if (sample.doorOpen) bucket.doors += 1;
  if (sample.windowsOpen) bucket.windows += 1;
  if (sample.frunkOpen) bucket.frunk += 1;
  if (sample.trunkOpen) bucket.trunk += 1;
  if (sample.chargePortOpen) bucket.port += 1;
}

function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

function valueOf(metric: ReadingMetric, bucket: Bucket | undefined): Omit<ReadingPoint, "day" | "label"> {
  if (!bucket || bucket.n === 0) {
    if (metric === "speed" || metric === "power" || metric === "charger" || metric === "chargeRate" || metric === "readings") {
      return { value: 0 };
    }
    return { value: null };
  }
  switch (metric) {
    case "speed":
      return { value: Math.round(bucket.speed) };
    case "power":
      return { value: Math.round(bucket.power * 10) / 10 };
    case "elevation":
      return { value: bucket.elevationN ? Math.round(bucket.elevation / bucket.elevationN) : null };
    case "inside":
      return { value: bucket.insideN ? Math.round(bucket.inside / bucket.insideN) : null };
    case "outside":
      return { value: bucket.outsideN ? Math.round(bucket.outside / bucket.outsideN) : null };
    case "locked":
      return { value: percent(bucket.locked, bucket.n) };
    case "sentry":
      return { value: percent(bucket.sentry, bucket.sentryN) };
    case "climate":
      return { value: percent(bucket.climate, bucket.n) };
    case "readings":
      return { value: bucket.n };
    case "charger":
      return { value: Math.round(bucket.charger * 10) / 10 };
    case "chargeRate":
      return { value: Math.round(bucket.rate) };
    case "tires": {
      if (!bucket.tireN) return { value: null, fl: null, fr: null, rl: null, rr: null };
      const fl = Math.round((bucket.fl / bucket.tireN) * 10) / 10;
      const fr = Math.round((bucket.fr / bucket.tireN) * 10) / 10;
      const rl = Math.round((bucket.rl / bucket.tireN) * 10) / 10;
      const rr = Math.round((bucket.rr / bucket.tireN) * 10) / 10;
      return { value: Math.round(((fl + fr + rl + rr) / 4) * 10) / 10, fl, fr, rl, rr };
    }
    case "doors":
      return { value: percent(bucket.doors, bucket.n) };
    case "windows":
      return { value: percent(bucket.windows, bucket.n) };
    case "frunk":
      return { value: percent(bucket.frunk, bucket.n) };
    case "trunk":
      return { value: percent(bucket.trunk, bucket.n) };
    case "port":
      return { value: percent(bucket.port, bucket.n) };
    case "software":
      return { value: null };
    default:
      return { value: null };
  }
}

function unitLabel(metric: ReadingMetric, units: { distance: DistanceUnit; temp: TempUnit }): string {
  switch (metric) {
    case "speed":
    case "chargeRate":
      return units.distance === "km" ? "km/h" : "mph";
    case "power":
    case "charger":
      return "kW";
    case "elevation":
      return "m";
    case "inside":
    case "outside":
      return `°${units.temp}`;
    case "tires":
      return "psi";
    case "readings":
      return "readings";
    case "software":
      return "";
    default:
      return "%";
  }
}

function summarize(metric: ReadingMetric, points: ReadingPoint[]): { high: number | null; low: number | null; average: number | null } {
  const values = points.map((point) => point.value).filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length === 0) return { high: null, low: null, average: null };
  if (metric === "readings") {
    const total = values.reduce((sum, value) => sum + value, 0);
    return { high: Math.max(...values), low: Math.min(...values), average: total };
  }
  const counted = metric === "speed" || metric === "power" || metric === "charger" || metric === "chargeRate"
    ? values.filter((value) => value > 0)
    : values;
  const used = counted.length ? counted : values;
  return {
    high: Math.max(...used),
    low: Math.min(...used),
    average: used.reduce((sum, value) => sum + value, 0) / used.length,
  };
}

export function isReadingMetric(value: string | null): value is ReadingMetric {
  return READING_METRICS.includes(value as ReadingMetric);
}

/** One point per Chicago day in the range. Quiet days stay in the series. */
export function dailyReadings(
  samples: readonly VehicleSample[],
  metric: ReadingMetric,
  fromDay: string,
  toDay: string,
  units: { distance: DistanceUnit; temp: TempUnit },
): ReadingSeries | { error: string } {
  const parsed = parseTripRange(fromDay, toDay);
  if ("error" in parsed) return parsed;
  const start = chicagoParts(parsed.from);
  const end = chicagoParts(parsed.to);
  const showYear = start.y !== end.y;
  const count = dayIndex(end.y, end.m, end.d) - dayIndex(start.y, start.m, start.d) + 1;
  const byDay = new Map<string, Bucket>();
  const versions: ReadingEvent[] = [];
  let seenVersion = "";

  const ordered = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  for (const sample of ordered) {
    const parts = chicagoParts(new Date(sample.at));
    if (parts.key < start.key || parts.key > end.key) {
      if (parts.key < start.key && sample.softwareVersion) seenVersion = sample.softwareVersion;
      continue;
    }
    const bucket = byDay.get(parts.key) ?? emptyBucket();
    absorb(bucket, sample, units);
    byDay.set(parts.key, bucket);
    const version = sample.softwareVersion?.trim();
    if (version && (versions.length === 0 || version !== seenVersion)) {
      versions.push({ day: parts.key, label: labelFor(parts.y, parts.m, parts.d, showYear), version });
      seenVersion = version;
    }
  }

  const points: ReadingPoint[] = [];
  let cursor = { y: start.y, m: start.m, d: start.d };
  for (let index = 0; index < count; index += 1) {
    const key = formatYMD(cursor.y, cursor.m, cursor.d);
    points.push({
      day: key,
      label: labelFor(cursor.y, cursor.m, cursor.d, showYear),
      ...valueOf(metric, byDay.get(key)),
    });
    cursor = addCalendarDays(cursor.y, cursor.m, cursor.d, 1);
  }

  return {
    points,
    events: versions,
    ...summarize(metric, points),
    unitLabel: unitLabel(metric, units),
  };
}
