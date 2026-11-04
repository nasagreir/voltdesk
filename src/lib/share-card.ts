import { formatDistance, formatFixed, formatTemp } from "./format";
import type { DistanceUnit, DriveSession, TempUnit, VehicleActivity, VehicleView } from "./types";

export interface ShareStat {
  id: string;
  label: string;
  value: string;
}

export interface SharePreset {
  id: string;
  label: string;
  ids: string[];
}

export const SHARE_CARD_MAX = 6;
export const SHARE_CARD_WIDTH = 1080;

const STATE_LABEL: Record<VehicleActivity, string> = {
  parked: "Parked",
  driving: "Driving",
  charging: "Charging",
  asleep: "Asleep",
  offline: "Offline",
};

export const CAR_SHARE_DEFAULTS = ["battery", "rated", "trips", "odometer"];

export const CAR_SHARE_PRESETS: SharePreset[] = [
  { id: "battery", label: "Battery", ids: ["battery", "rated", "trips", "odometer"] },
  { id: "cabin", label: "Cabin", ids: ["inside", "outside", "climate", "state"] },
  { id: "charge", label: "Charge", ids: ["charge", "power", "rate", "battery"] },
];

export const DRIVE_SHARE_DEFAULTS = ["distance", "duration", "avg", "efficiency"];

export const DRIVE_SHARE_PRESETS: SharePreset[] = [
  { id: "drive", label: "Drive", ids: ["distance", "duration", "avg", "efficiency"] },
  { id: "speed", label: "Speed", ids: ["avg", "max", "distance", "duration"] },
];

export const RANGE_SHARE_DEFAULTS = ["count", "distance", "time", "efficiency"];

export function blankShareValue(value: string): boolean {
  const text = value.trim();
  return text.length === 0 || text === "—" || text === "-";
}

export function usableShareStats(options: ShareStat[]): ShareStat[] {
  return options.filter((stat) => !blankShareValue(stat.value));
}

/** Keeps the chosen order, drops blanks and unknown ids, and stops at six. */
export function pickShareStats(options: ShareStat[], selectedIds: string[]): ShareStat[] {
  const usable = usableShareStats(options);
  const picked: ShareStat[] = [];
  for (const id of selectedIds) {
    if (picked.length >= SHARE_CARD_MAX) break;
    const stat = usable.find((item) => item.id === id);
    if (!stat || picked.some((item) => item.id === stat.id)) continue;
    picked.push(stat);
  }
  return picked;
}

export function initialShareSelection(options: ShareStat[], defaults: string[]): string[] {
  const picked = pickShareStats(options, defaults);
  if (picked.length > 0) return picked.map((stat) => stat.id);
  return usableShareStats(options)
    .slice(0, 4)
    .map((stat) => stat.id);
}

export function shareFilename(kind: "car" | "trip" | "trips", title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `voltdesk-${kind}-${slug || "card"}.png`;
}

/** Square for one row. Each extra row adds a stat band and keeps the footnote close. */
export function shareCardPixelSize(statCount: number): { width: number; height: number } {
  const count = Math.max(0, Math.round(statCount));
  const rows = Math.max(1, Math.ceil(count / 2));
  if (rows <= 1) return { width: SHARE_CARD_WIDTH, height: SHARE_CARD_WIDTH };
  const header = 300;
  const cell = 230;
  const gap = 20;
  const footer = 120;
  return { width: SHARE_CARD_WIDTH, height: header + rows * cell + (rows - 1) * gap + footer };
}

/** Calendar day, anchored at UTC noon so a YYYY-MM-DD does not shift. */
export function formatShareDay(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatShareRange(from: string, to: string): string {
  if (from === to) return formatShareDay(from);
  return `${formatShareDay(from)} – ${formatShareDay(to)}`;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
}

export function formatSpeed(mph: number, unit: DistanceUnit): string {
  const value = unit === "km" ? mph * 1.609344 : mph;
  return `${Math.round(value)} ${unit === "km" ? "km/h" : "mph"}`;
}

export function formatWh(whPerMi: number | null, unit: DistanceUnit): string {
  if (whPerMi == null || !Number.isFinite(whPerMi)) return "—";
  const shown = unit === "km" ? whPerMi / 1.609344 : whPerMi;
  return `${Math.round(shown)} Wh/${unit}`;
}

export function driveShareTitle(drive: Pick<DriveSession, "fromLabel" | "toLabel" | "inProgress">): string {
  return drive.inProgress ? `${drive.fromLabel} · in progress` : `${drive.fromLabel} to ${drive.toLabel}`;
}

export function carShareOptions(vehicle: VehicleView): ShareStat[] {
  const display = vehicle.display;
  return usableShareStats([
    { id: "battery", label: "Battery", value: display.battery },
    { id: "rated", label: "Rated range", value: display.ratedRange },
    { id: "ideal", label: "Ideal range", value: display.idealRange },
    { id: "estimate", label: "Tesla estimate", value: display.estRange },
    { id: "trips", label: "From trips", value: vehicle.tripRange?.range ?? "—" },
    { id: "odometer", label: "Odometer", value: display.odometer },
    { id: "state", label: "State", value: STATE_LABEL[vehicle.state] },
    { id: "speed", label: "Speed", value: display.speed },
    { id: "inside", label: "Inside", value: display.inside },
    { id: "outside", label: "Outside", value: display.outside },
    { id: "climate", label: "Climate", value: vehicle.climateOn ? `On ${display.setpoint}` : "Off" },
    { id: "motor", label: "Motor", value: display.power },
    { id: "charge", label: "Charge state", value: vehicle.chargingState },
    { id: "power", label: "Charge power", value: display.chargerPower },
    { id: "rate", label: "Charge rate", value: display.chargeRate },
    { id: "software", label: "Software", value: vehicle.softwareVersion },
    { id: "efficiency", label: "Efficiency", value: vehicle.tripRange?.consumption ?? "—" },
  ]);
}

export function driveShareOptions(drive: DriveSession, unit: DistanceUnit, temp: TempUnit): ShareStat[] {
  return usableShareStats([
    { id: "distance", label: "Distance", value: formatDistance(drive.distanceMi, unit, 1) },
    { id: "duration", label: "Duration", value: formatDuration(drive.durationMin) },
    { id: "avg", label: "Avg speed", value: formatSpeed(drive.avgSpeedMph, unit) },
    { id: "efficiency", label: "Efficiency", value: formatWh(drive.efficiencyWhPerMi, unit) },
    { id: "max", label: "Max speed", value: formatSpeed(drive.maxSpeedMph, unit) },
    {
      id: "battery",
      label: "Battery",
      value: `${Math.round(drive.startBattery)}→${Math.round(drive.endBattery)}%`,
    },
    { id: "energy", label: "Energy", value: formatFixed(drive.energyNetKwh, "kWh", 2) },
    {
      id: "elevation",
      label: "Elevation",
      value: drive.elevationGainM == null ? "—" : `${Math.round(drive.elevationGainM)} m`,
    },
    { id: "outside", label: "Outside", value: formatTemp(drive.outsideTempC, temp) },
  ]);
}

export function rangeShareOptions(
  summary: { count: number; distanceMi: number; durationMin: number; avgWhPerMi: number | null },
  unit: DistanceUnit,
): ShareStat[] {
  return usableShareStats([
    { id: "count", label: "Trips", value: String(summary.count) },
    { id: "distance", label: "Distance", value: formatDistance(summary.distanceMi, unit, 1) },
    { id: "time", label: "Time driving", value: formatDuration(summary.durationMin) },
    { id: "efficiency", label: "Efficiency", value: formatWh(summary.avgWhPerMi, unit) },
  ]);
}
