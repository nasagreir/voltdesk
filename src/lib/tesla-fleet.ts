import { updateRefreshToken } from "@/lib/settings";
import { activityFrom } from "@/lib/sessions";
import { milesBetween } from "@/lib/geo";
import type { AppSettings, ShiftState, TeslaRegion, Vehicle } from "@/lib/types";

const AUTH_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";

const FLEET_BASE: Record<TeslaRegion, string> = {
  na: "https://fleet-api.prd.na.vn.cloud.tesla.com",
  eu: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
  cn: "https://fleet-api.prd.cn.vn.cloud.tesla.cn",
};

interface TokenCache {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
}

const tokens = new Map<string, TokenCache>();

export class TeslaRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchToken(settings: AppSettings): Promise<string> {
  const cached = tokens.get(settings.teslaRefreshToken);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: settings.teslaClientId,
    refresh_token: settings.teslaRefreshToken,
  });
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new TeslaRequestError(
      json.error_description || json.error || `Tesla auth failed (${response.status})`,
      response.status,
    );
  }
  if (json.refresh_token && json.refresh_token !== settings.teslaRefreshToken) {
    await updateRefreshToken(json.refresh_token);
    tokens.delete(settings.teslaRefreshToken);
  }
  const refresh = json.refresh_token || settings.teslaRefreshToken;
  tokens.set(refresh, {
    accessToken: json.access_token,
    refreshToken: refresh,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

async function fleetFetch<T>(settings: AppSettings, path: string, init?: RequestInit): Promise<T> {
  const access = await fetchToken(settings);
  const response = await fetch(`${FLEET_BASE[settings.teslaRegion]}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(25_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new TeslaRequestError(
      json.error_description || json.error || `Tesla API ${response.status}`,
      response.status,
    );
  }
  return json;
}

interface ListedVehicle {
  id: number | string;
  vehicle_id?: number | string;
  vin: string;
  display_name?: string | null;
  state?: string;
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maybeNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function modelName(carType: string): string {
  const key = carType.toLowerCase();
  if (key.includes("cyber")) return "Cybertruck";
  if (key.includes("modely") || key === "y") return "Model Y";
  if (key.includes("model3") || key === "3") return "Model 3";
  if (key.includes("models") || key === "s") return "Model S";
  if (key.includes("modelx") || key === "x") return "Model X";
  return carType ? carType : "Tesla";
}

function packKwh(carType: string): number {
  const key = carType.toLowerCase();
  if (key.includes("cyber")) return 123;
  if (key.includes("models") || key.includes("modelx")) return 100;
  if (key.includes("model3")) return 75;
  if (key.includes("modely")) return 78.1;
  return 75;
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shiftOf(value: unknown): ShiftState {
  const raw = String(value ?? "").toUpperCase();
  return raw === "D" || raw === "R" || raw === "P" || raw === "N" ? raw : null;
}

function barToPsi(value: unknown): number | null {
  const bar = maybeNum(value);
  if (bar == null) return null;
  return Math.round(bar * 14.5038 * 10) / 10;
}

export async function listTeslaVehicles(settings: AppSettings): Promise<ListedVehicle[]> {
  const json = await fleetFetch<{ response?: ListedVehicle[] }>(settings, "/api/1/vehicles");
  return Array.isArray(json.response) ? json.response : [];
}

export async function wakeTeslaVehicle(settings: AppSettings, id: string): Promise<string> {
  const json = await fleetFetch<{ response?: { state?: string } }>(
    settings,
    `/api/1/vehicles/${encodeURIComponent(id)}/wake_up`,
    { method: "POST" },
  );
  return json.response?.state ?? "waking";
}

async function readVehicleData(settings: AppSettings, tag: string): Promise<Record<string, unknown>> {
  const endpoints = [
    "charge_state;climate_state;drive_state;location_data;vehicle_state;vehicle_config;gui_settings",
    "charge_state;climate_state;drive_state;vehicle_state;vehicle_config;gui_settings",
  ];
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const data = await fleetFetch<{ response?: Record<string, unknown> }>(
        settings,
        `/api/1/vehicles/${encodeURIComponent(tag)}/vehicle_data?endpoints=${encodeURIComponent(endpoint)}`,
      );
      return data.response ?? {};
    } catch (error) {
      lastError = error;
      if (
        error instanceof TeslaRequestError &&
        (error.status === 400 || error.status === 403 || error.status === 404)
      ) {
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new TeslaRequestError("Tesla vehicle data failed", 502);
}

export async function fetchTeslaVehicles(settings: AppSettings): Promise<Vehicle[]> {
  if (!settings.teslaClientId || !settings.teslaRefreshToken) {
    throw new TeslaRequestError("Tesla client id and refresh token are required", 400);
  }
  const listed = await listTeslaVehicles(settings);
  const vehicles: Vehicle[] = [];
  for (const car of listed.slice(0, 8)) {
    const tag = car.vin || String(car.id);
    const asleep = (car.state ?? "").toLowerCase() !== "online";
    if (asleep) {
      vehicles.push(asleepVehicle(car));
      continue;
    }
    try {
      const data = await readVehicleData(settings, tag);
      vehicles.push(mapVehicleData(car, data, settings));
    } catch (error) {
      if (error instanceof TeslaRequestError && (error.status === 408 || error.status === 429)) {
        vehicles.push(asleepVehicle(car));
        continue;
      }
      throw error;
    }
  }
  return vehicles;
}

function asleepVehicle(car: ListedVehicle): Vehicle {
  const offline = (car.state ?? "").toLowerCase() === "offline";
  return {
    id: car.vin || String(car.id),
    name: car.display_name || "Tesla",
    vin: car.vin || "",
    model: "Tesla",
    trim: "",
    color: "",
    packKwh: 75,
    state: offline ? "offline" : "asleep",
    softwareVersion: "",
    updateAvailable: null,
    odometerMi: 0,
    batteryPercent: 0,
    chargeLimitPercent: 0,
    ratedRangeMi: 0,
    estRangeMi: 0,
    chargingState: "",
    chargerPowerKw: 0,
    chargeRateMph: 0,
    minutesToFull: null,
    energyAddedKwh: 0,
    cable: "",
    chargePortOpen: false,
    insideTempC: null,
    outsideTempC: null,
    climateOn: false,
    setpointC: null,
    locked: null,
    sentry: null,
    windowsOpen: false,
    frunkOpen: false,
    trunkOpen: false,
    doorOpen: false,
    tpmsPsi: { fl: null, fr: null, rl: null, rr: null },
    lat: null,
    lng: null,
    heading: null,
    speedMph: 0,
    shiftState: null,
    atHome: null,
    homeDistanceMi: null,
    lastUpdated: new Date().toISOString(),
    stale: true,
    alerts: [
      offline
        ? "Car is offline"
        : "Car is asleep. Wake it when you want a fresh report.",
    ],
  };
}

function mapVehicleData(
  car: ListedVehicle,
  data: Record<string, unknown>,
  settings: AppSettings,
): Vehicle {
  const charge = (data.charge_state ?? {}) as Record<string, unknown>;
  const climate = (data.climate_state ?? {}) as Record<string, unknown>;
  const drive = (data.drive_state ?? {}) as Record<string, unknown>;
  const vehicle = (data.vehicle_state ?? {}) as Record<string, unknown>;
  const config = (data.vehicle_config ?? {}) as Record<string, unknown>;
  const gui = (data.gui_settings ?? {}) as Record<string, unknown>;
  const metric = String(gui.gui_distance_units ?? "").toLowerCase().includes("km");
  const toMiles = (value: number) => (metric ? value / 1.609344 : value);
  const carType = String(config.car_type ?? "");
  const shift = shiftOf(drive.shift_state);
  const speed = maybeNum(drive.speed);
  const chargingState = String(charge.charging_state ?? "");
  const battery = num(charge.battery_level);
  const lat = maybeNum(drive.latitude) ?? maybeNum(drive.native_latitude);
  const lng = maybeNum(drive.longitude) ?? maybeNum(drive.native_longitude);
  const home =
    settings.homeLat != null && settings.homeLng != null && lat != null && lng != null
      ? milesBetween(lat, lng, settings.homeLat, settings.homeLng)
      : null;
  const windows = ["fd_window", "fp_window", "rd_window", "rp_window"].some(
    (key) => num(vehicle[key]) > 0,
  );
  const doorOpen = ["df", "pf", "dr", "pr"].some((key) => num(vehicle[key]) > 0);
  const update = (vehicle.software_update ?? {}) as Record<string, unknown>;
  const updateVersion = String(update.version ?? "").trim();
  const state = activityFrom({
    chargingState,
    shiftState: shift,
    speedMph: speed == null ? 0 : metric ? speed / 1.609344 : speed,
  });
  const minutes = maybeNum(charge.minutes_to_full_charge);
  const hours = maybeNum(charge.time_to_full_charge);
  const alerts: string[] = [];
  if (battery > 0 && battery <= 20) alerts.push("Battery is at or below 20%");
  const tpms = {
    fl: barToPsi(vehicle.tpms_pressure_fl),
    fr: barToPsi(vehicle.tpms_pressure_fr),
    rl: barToPsi(vehicle.tpms_pressure_rl),
    rr: barToPsi(vehicle.tpms_pressure_rr),
  };
  for (const [corner, psi] of Object.entries(tpms)) {
    if (psi != null && (psi < 36 || psi > 48)) alerts.push(`${corner.toUpperCase()} tire is ${psi} psi`);
  }

  return {
    id: car.vin || String(car.id),
    name: car.display_name || "Tesla",
    vin: car.vin || "",
    model: modelName(carType),
    trim: titleCase(String(config.trim_badging ?? "")),
    color: titleCase(String(config.exterior_color ?? "")),
    packKwh: packKwh(carType),
    state,
    softwareVersion: String(vehicle.car_version ?? ""),
    updateAvailable: updateVersion || null,
    odometerMi: toMiles(num(vehicle.odometer)),
    batteryPercent: battery,
    chargeLimitPercent: num(charge.charge_limit_soc),
    ratedRangeMi: toMiles(num(charge.battery_range)),
    estRangeMi: toMiles(num(charge.est_battery_range)),
    chargingState,
    chargerPowerKw: num(charge.charger_power),
    chargeRateMph: toMiles(num(charge.charge_rate)),
    minutesToFull: minutes ?? (hours == null ? null : hours * 60),
    energyAddedKwh: num(charge.charge_energy_added),
    cable: String(charge.conn_charge_cable ?? charge.fast_charger_brand ?? ""),
    chargePortOpen: Boolean(charge.charge_port_door_open),
    insideTempC: maybeNum(climate.inside_temp),
    outsideTempC: maybeNum(climate.outside_temp),
    climateOn: Boolean(climate.is_climate_on),
    setpointC: maybeNum(climate.driver_temp_setting),
    locked: typeof vehicle.locked === "boolean" ? vehicle.locked : null,
    sentry: typeof vehicle.sentry_mode === "boolean" ? vehicle.sentry_mode : null,
    windowsOpen: windows,
    frunkOpen: num(vehicle.ft) > 0,
    trunkOpen: num(vehicle.rt) > 0,
    doorOpen,
    tpmsPsi: tpms,
    lat,
    lng,
    heading: maybeNum(drive.heading),
    speedMph: speed == null ? 0 : metric ? speed / 1.609344 : speed,
    shiftState: shift,
    atHome: home == null ? null : home * 1609.344 <= settings.homeRadiusM,
    homeDistanceMi: home,
    lastUpdated: new Date().toISOString(),
    stale: false,
    alerts,
  };
}
