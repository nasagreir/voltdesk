import { applyChargePrices, readChargePrices } from "@/lib/charge-prices";
import { buildDemo } from "@/lib/demo";
import { formatDistance, formatFixed } from "@/lib/format";
import { readAddresses, resolveFences } from "@/lib/places";
import { readSamples } from "@/lib/recorder";
import { deriveCharges, deriveDrives } from "@/lib/sessions";
import { getSettings } from "@/lib/settings";
import { getDashboard } from "@/lib/vehicle-service";
import type {
  ChargeSession,
  ConnectionMode,
  DashboardPayload,
  DistanceUnit,
  DriveSession,
  VehicleView,
} from "@/lib/types";

const LIST_LIMIT = 20;

export function clampDays(raw: string | null, fallback = 14): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(90, Math.max(1, Math.round(value)));
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function whLabel(whPerMile: number | null, unit: DistanceUnit): string | null {
  if (whPerMile == null || !Number.isFinite(whPerMile)) return null;
  const shown = unit === "km" ? whPerMile / 1.609344 : whPerMile;
  return `${Math.round(shown)} Wh/${unit}`;
}

export function vehicleSentence(view: VehicleView, mode: ConnectionMode): string {
  const name = `${view.name} (${view.model}${view.trim ? ` ${view.trim}` : ""})`;
  let activity: string = view.state;
  if (view.state === "driving") activity = `driving at ${view.display.speed}`;
  if (view.state === "charging") activity = `charging at ${view.display.chargerPower}`;
  const where =
    view.atHome === true ? "at home" : view.atHome === false ? "away from home" : "with no home location set";
  const stale = view.stale ? " The last saved report is shown because a live read failed." : "";
  const demo = mode === "demo" ? " This is the demo car, not a live Tesla." : "";
  return `${name} is ${activity} ${where}. Battery ${view.display.battery}, rated range ${view.display.ratedRange}, odometer ${view.display.odometer}. Updated ${view.display.updated}.${stale}${demo}`;
}

function compactVehicle(view: VehicleView) {
  return {
    id: view.id,
    name: view.name,
    model: view.model,
    trim: view.trim,
    vin: view.vin,
    state: view.state,
    stale: view.stale,
    softwareVersion: view.softwareVersion,
    batteryPercent: Math.round(view.batteryPercent),
    chargeLimitPercent: Math.round(view.chargeLimitPercent),
    ratedRange: view.display.ratedRange,
    estimatedRange: view.display.estRange,
    odometer: view.display.odometer,
    speed: view.display.speed,
    shiftState: view.shiftState,
    chargingState: view.chargingState,
    chargerPower: view.display.chargerPower,
    timeToFull: view.display.timeToFull,
    energyAdded: view.display.energyAdded,
    cable: view.cable,
    inside: view.display.inside,
    outside: view.display.outside,
    climateOn: view.climateOn,
    locked: view.locked,
    sentry: view.sentry,
    atHome: view.atHome,
    location: view.display.coords,
    homeDistance: view.display.homeDistance,
    pluggedIn: view.chargingState !== "Disconnected" && view.chargingState !== "",
    alerts: view.alerts,
    updated: view.display.updated,
  };
}

function compactDrive(drive: DriveSession, unit: DistanceUnit) {
  const efficiency = whLabel(drive.efficiencyWhPerMi, unit);
  const distance = formatDistance(drive.distanceMi, unit, 1);
  const line = `${drive.fromLabel} to ${drive.toLabel}, ${distance}, ${Math.round(drive.durationMin)} min${efficiency ? `, ${efficiency}` : ""}${drive.inProgress ? ", in progress" : ""}`;
  return {
    id: drive.id,
    startedAt: drive.startedAt,
    endedAt: drive.endedAt,
    inProgress: drive.inProgress,
    from: drive.fromLabel,
    to: drive.toLabel,
    distance,
    durationMin: Math.round(drive.durationMin),
    averageSpeed: formatDistance(drive.avgSpeedMph, unit, 0).replace(unit, unit === "km" ? "km/h" : "mph"),
    efficiency,
    startBatteryPercent: Math.round(drive.startBattery),
    endBatteryPercent: Math.round(drive.endBattery),
    summary: line,
  };
}

function compactCharge(charge: ChargeSession, unit: DistanceUnit) {
  const added = formatFixed(charge.energyKwh, "kWh", 2);
  const cost =
    charge.costUsd == null
      ? null
      : `$${charge.costUsd.toFixed(2)}${charge.costSource === "guess" ? " (estimate)" : ""}`;
  const line = `${charge.kind} charge at ${charge.placeLabel}, ${added} added${cost ? `, ${cost}` : ""}, ${Math.round(charge.durationMin)} min${charge.inProgress ? ", in progress" : ""}`;
  return {
    id: charge.id,
    startedAt: charge.startedAt,
    endedAt: charge.endedAt,
    inProgress: charge.inProgress,
    place: charge.placeLabel,
    kind: charge.kind,
    energyAdded: added,
    energyUsed: formatFixed(charge.energyUsedKwh, "kWh", 2),
    cost,
    durationMin: Math.round(charge.durationMin),
    peakPower: formatFixed(charge.peakPowerKw, "kW", 1),
    rangeAdded: formatDistance(charge.rangeAddedMi, unit, 0),
    startBatteryPercent: Math.round(charge.startBattery),
    endBatteryPercent: Math.round(charge.endBattery),
    summary: line,
  };
}

function since<T extends { endedAt: string; inProgress: boolean }>(items: T[], days: number): T[] {
  const cutoff = Date.now() - days * 86_400_000;
  return items
    .filter((item) => item.inProgress || new Date(item.endedAt).getTime() >= cutoff)
    .reverse();
}

async function sessions(days: number) {
  const settings = await getSettings();
  const dashboard = await getDashboard();
  const vehicle = dashboard.vehicles[0] ?? null;
  const samples =
    dashboard.mode === "demo" ? buildDemo().samples : await readSamples();
  const scoped = samples.filter((sample) => !vehicle || sample.vehicleId === vehicle.id);
  const { fences } = await resolveFences(settings, dashboard.mode);
  const addresses = await readAddresses();
  const prices = await readChargePrices().catch(() => ({}));
  const drives = since(deriveDrives(scoped, fences, addresses), days);
  const charges = since(
    applyChargePrices(deriveCharges(scoped, settings.electricityRateUsd, fences, addresses), prices),
    days,
  );
  return { settings, dashboard, vehicle, drives, charges };
}

function meta(dashboard: DashboardPayload) {
  return {
    readOnly: true,
    mode: dashboard.mode,
    source: dashboard.source,
    message: dashboard.message,
    fetchedAt: dashboard.fetchedAt,
    units: dashboard.units,
  };
}

export async function botVehicle() {
  const dashboard = await getDashboard();
  const vehicles = dashboard.vehicles.map(compactVehicle);
  const first = dashboard.vehicles[0];
  return {
    ...meta(dashboard),
    brief: first
      ? vehicleSentence(first, dashboard.mode)
      : "No car is reporting.",
    vehicles,
  };
}

export async function botDrives(days: number) {
  const { dashboard, drives } = await sessions(days);
  const unit = dashboard.units.distance;
  const distance = drives.reduce((sum, drive) => sum + drive.distanceMi, 0);
  const listed = drives.slice(0, LIST_LIMIT);
  return {
    ...meta(dashboard),
    days,
    count: drives.length,
    distance: formatDistance(distance, unit, 1),
    truncated: drives.length > listed.length,
    drives: listed.map((drive) => compactDrive(drive, unit)),
  };
}

export async function botCharges(days: number) {
  const { dashboard, charges } = await sessions(days);
  const unit = dashboard.units.distance;
  const energy = charges.reduce((sum, charge) => sum + charge.energyKwh, 0);
  const cost = charges.reduce((sum, charge) => sum + (charge.costUsd ?? 0), 0);
  const priced = charges.some((charge) => charge.costUsd != null);
  const listed = charges.slice(0, LIST_LIMIT);
  return {
    ...meta(dashboard),
    days,
    count: charges.length,
    energyAdded: formatFixed(energy, "kWh", 2),
    cost: priced ? `$${cost.toFixed(2)}` : null,
    truncated: charges.length > listed.length,
    charges: listed.map((charge) => compactCharge(charge, unit)),
  };
}

export async function botSummary() {
  const { dashboard, vehicle, drives, charges } = await sessions(7);
  const unit = dashboard.units.distance;
  const distance = drives.reduce((sum, drive) => sum + drive.distanceMi, 0);
  const energy = charges.reduce((sum, charge) => sum + charge.energyKwh, 0);
  const driveWord = drives.length === 1 ? "drive" : "drives";
  const chargeWord = charges.length === 1 ? "charge" : "charges";
  const week =
    drives.length === 0 && charges.length === 0
      ? " No drives or charges in the last 7 days."
      : ` Over the last 7 days: ${drives.length} ${driveWord} covering ${formatDistance(distance, unit, 1)}, and ${charges.length} ${chargeWord} adding ${formatFixed(energy, "kWh", 1)}.`;
  const car = vehicle ? vehicleSentence(vehicle, dashboard.mode) : "No car is reporting.";
  return {
    ...meta(dashboard),
    brief: `${car}${week}`,
    vehicle: vehicle ? compactVehicle(vehicle) : null,
    last7Days: {
      drives: drives.length,
      distance: formatDistance(distance, unit, 1),
      charges: charges.length,
      energyAdded: formatFixed(round(energy, 1), "kWh", 1),
    },
  };
}

export function botDiscovery(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    name: "VoltDesk",
    readOnly: true,
    auth: "Authorization: Bearer <token>",
    cannot: ["wake", "unlock", "start", "change settings", "read Tesla or Home Assistant secrets"],
    endpoints: [
      { method: "GET", path: "/api/v1", auth: false, description: "This description. No vehicle data." },
      { method: "GET", path: "/api/v1/summary", auth: true, description: "One brief a bot can quote, plus the last 7 days." },
      { method: "GET", path: "/api/v1/vehicle", auth: true, description: "Current state of each car VoltDesk is tracking." },
      { method: "GET", path: "/api/v1/drives?days=14", auth: true, description: "Recent drives. days is 1 to 90. At most 20 are listed." },
      { method: "GET", path: "/api/v1/charges?days=14", auth: true, description: "Recent charges. days is 1 to 90. At most 20 are listed." },
    ],
    tool: {
      name: "voltdesk_car",
      description:
        "Read the Tesla tracked by VoltDesk. Use summary for a short answer. Use vehicle, drives, or charges for detail. This API is read-only: it cannot wake, unlock, or start the car.",
      baseUrl: `${base}/api/v1`,
      authorization: "Bearer <token>",
      requests: {
        summary: `GET ${base}/api/v1/summary`,
        vehicle: `GET ${base}/api/v1/vehicle`,
        drives: `GET ${base}/api/v1/drives?days=14`,
        charges: `GET ${base}/api/v1/charges?days=14`,
      },
    },
  };
}
