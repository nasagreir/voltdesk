import { milesBetween } from "@/lib/geo";
import { activityFrom } from "@/lib/sessions";
import type { AppSettings, ShiftState, Vehicle } from "@/lib/types";

interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated?: string;
}

const EMPTY_TIRES = { fl: null, fr: null, rl: null, rr: null };

function usable(state: HaState | undefined): boolean {
  if (!state) return false;
  const value = state.state.toLowerCase();
  return value !== "unavailable" && value !== "unknown" && value !== "none";
}

function objectId(entityId: string): string {
  return entityId.split(".").slice(1).join(".").toLowerCase();
}

function findMetric(states: HaState[], prefix: string, suffixes: string[]): HaState | undefined {
  const normalized = prefix.toLowerCase().replace(/^sensor\.|^binary_sensor\.|^device_tracker\.|^lock\.|^climate\./, "");
  const pool = states.filter((state) => {
    const id = objectId(state.entity_id);
    if (!normalized) return true;
    return id === normalized || id.startsWith(`${normalized}_`) || id.startsWith(`${normalized}.`);
  });
  for (const suffix of suffixes) {
    const hit = pool.find((state) => {
      const id = objectId(state.entity_id);
      return id === suffix || id.endsWith(`_${suffix}`) || id.endsWith(suffix);
    });
    if (usable(hit)) return hit;
  }
  return undefined;
}

function numberOf(state: HaState | undefined): number | null {
  if (!usable(state)) return null;
  const parsed = Number.parseFloat(state!.state);
  return Number.isFinite(parsed) ? parsed : null;
}

function unit(state: HaState | undefined): string {
  return String(state?.attributes.unit_of_measurement ?? "").toLowerCase();
}

function toMiles(value: number | null, state: HaState | undefined): number | null {
  if (value == null) return null;
  const u = unit(state);
  if (u.includes("km")) return value / 1.609344;
  return value;
}

function toC(value: number | null, state: HaState | undefined): number | null {
  if (value == null) return null;
  const u = unit(state);
  if (u.includes("f")) return ((value - 32) * 5) / 9;
  return value;
}

function toPsi(value: number | null, state: HaState | undefined): number | null {
  if (value == null) return null;
  const u = unit(state);
  if (u.includes("bar")) return value * 14.5038;
  if (u.includes("kpa")) return value * 0.145038;
  return value;
}

function on(state: HaState | undefined): boolean | null {
  if (!usable(state)) return null;
  const value = state!.state.toLowerCase();
  if (["on", "open", "locked", "heat", "cool", "heat_cool", "auto", "true", "charging"].includes(value)) {
    return true;
  }
  if (["off", "closed", "unlocked", "false", "not_charging"].includes(value)) return false;
  return null;
}

function shiftOf(state: HaState | undefined): ShiftState {
  const raw = (state?.state ?? "").toUpperCase();
  return raw === "D" || raw === "R" || raw === "P" || raw === "N" ? raw : null;
}

export function discoverPrefixes(states: HaState[]): string[] {
  const found = new Set<string>();
  for (const state of states) {
    const id = objectId(state.entity_id);
    const match = id.match(/^(.+)_(?:battery|battery_level)$/);
    if (!match) continue;
    const prefix = match[1];
    if (/tesla|model_?[3syx]|cyber/.test(prefix) || /tesla|model/.test(JSON.stringify(state.attributes).toLowerCase())) {
      found.add(prefix);
    }
  }
  return [...found];
}

async function fetchStates(settings: AppSettings): Promise<HaState[]> {
  const response = await fetch(`${settings.homeAssistantUrl}/api/states`, {
    headers: {
      authorization: `Bearer ${settings.homeAssistantToken}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Home Assistant returned ${response.status}`);
  }
  const json = (await response.json()) as HaState[];
  return Array.isArray(json) ? json : [];
}

function vehicleFromPrefix(states: HaState[], prefix: string, settings: AppSettings): Vehicle | null {
  const battery = findMetric(states, prefix, ["battery", "battery_level", "soc"]);
  const batteryPct = numberOf(battery);
  if (batteryPct == null) return null;
  const range = findMetric(states, prefix, ["battery_range", "rated_range", "rated_battery_range"]);
  const est = findMetric(states, prefix, ["est_battery_range", "estimated_battery_range", "ideal_battery_range"]);
  const charging = findMetric(states, prefix, ["charging_state", "charging"]);
  const power = findMetric(states, prefix, ["charger_power", "charge_power"]);
  const rate = findMetric(states, prefix, ["charge_rate"]);
  const energy = findMetric(states, prefix, ["charge_energy_added"]);
  const limit = findMetric(states, prefix, ["charge_limit_soc", "charge_limit"]);
  const minutes = findMetric(states, prefix, ["minutes_to_full_charge"]);
  const hours = findMetric(states, prefix, ["time_to_full_charge"]);
  const odo = findMetric(states, prefix, ["odometer"]);
  const inside = findMetric(states, prefix, ["inside_temp", "interior_temperature"]);
  const outside = findMetric(states, prefix, ["outside_temp", "exterior_temperature"]);
  const setpoint = findMetric(states, prefix, ["driver_temp_setting", "temperature"]);
  const climate = findMetric(states, prefix, ["hvac_climate_system", "climate"]);
  const lock = findMetric(states, prefix, ["lock", "doors"]);
  const sentry = findMetric(states, prefix, ["sentry_mode"]);
  const online = findMetric(states, prefix, ["online", "status"]);
  const shift = findMetric(states, prefix, ["shift_state"]);
  const speed = findMetric(states, prefix, ["speed"]);
  const ideal = findMetric(states, prefix, ["ideal_battery_range"]);
  const motor = findMetric(states, prefix, ["motor_power", "drive_power"]);
  const elevation = findMetric(states, prefix, ["elevation"]);
  const voltage = findMetric(states, prefix, ["charger_voltage"]);
  const amps = findMetric(states, prefix, ["charger_actual_current", "charger_current"]);
  const phases = findMetric(states, prefix, ["charger_phases"]);
  const software = findMetric(states, prefix, ["software_version", "car_version"]);
  const tracker = findMetric(states, prefix, ["location", "location_tracker"]);
  const versionText = software && Number.isNaN(Number(software.state)) ? software.state : "";
  const lat = tracker ? Number(tracker.attributes.latitude) : Number.NaN;
  const lng = tracker ? Number(tracker.attributes.longitude) : Number.NaN;
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng);
  const chargingStateRaw = charging?.state ?? "";
  const chargingState =
    chargingStateRaw.toLowerCase() === "on"
      ? "Charging"
      : chargingStateRaw.toLowerCase() === "off"
        ? "Disconnected"
        : chargingStateRaw;
  const shiftState = shiftOf(shift);
  const speedMph = toMiles(numberOf(speed), speed) ?? 0;
  const asleep = online ? online.state.toLowerCase() === "off" || online.state.toLowerCase() === "asleep" : false;
  const name =
    String(battery?.attributes.friendly_name ?? "")
      .replace(/\bbattery(?: level)?\b/i, "")
      .trim() || prefix.replaceAll("_", " ");
  const homeDistance =
    hasFix && settings.homeLat != null && settings.homeLng != null
      ? milesBetween(lat, lng, settings.homeLat, settings.homeLng)
      : null;
  const tire = (suffixes: string[]) =>
    toPsi(numberOf(findMetric(states, prefix, suffixes)), findMetric(states, prefix, suffixes));
  const hourValue = numberOf(hours);
  const minuteValue = numberOf(minutes);

  return {
    id: prefix,
    name,
    vin: String(battery?.attributes.vin ?? tracker?.attributes.vin ?? ""),
    model: /model y/i.test(name) ? "Model Y" : /model 3/i.test(name) ? "Model 3" : /cyber/i.test(name) ? "Cybertruck" : "Tesla",
    trim: "",
    color: "",
    packKwh: 75,
    state: activityFrom({
      chargingState,
      shiftState,
      speedMph,
      asleep,
      offline: online?.state.toLowerCase() === "offline",
    }),
    softwareVersion: versionText,
    updateAvailable: null,
    odometerMi: toMiles(numberOf(odo), odo) ?? 0,
    batteryPercent: batteryPct,
    chargeLimitPercent: numberOf(limit) ?? 0,
    ratedRangeMi: toMiles(numberOf(range), range) ?? 0,
    estRangeMi: toMiles(numberOf(est), est) ?? 0,
    chargingState,
    chargerPowerKw: numberOf(power) ?? 0,
    chargeRateMph: toMiles(numberOf(rate), rate) ?? 0,
    minutesToFull: minuteValue ?? (hourValue == null ? null : hourValue * 60),
    energyAddedKwh: numberOf(energy) ?? 0,
    cable: "",
    chargePortOpen: chargingState.toLowerCase() === "charging",
    insideTempC: toC(numberOf(inside), inside),
    outsideTempC: toC(numberOf(outside), outside),
    climateOn: on(climate) === true,
    setpointC: toC(numberOf(setpoint), setpoint),
    locked: lock ? lock.state.toLowerCase() === "locked" || on(lock) === true && lock.entity_id.startsWith("lock.") : null,
    sentry: on(sentry),
    windowsOpen: false,
    frunkOpen: false,
    trunkOpen: false,
    doorOpen: false,
    tpmsPsi: {
      fl: tire(["tpms_pressure_fl", "tire_pressure_front_left"]),
      fr: tire(["tpms_pressure_fr", "tire_pressure_front_right"]),
      rl: tire(["tpms_pressure_rl", "tire_pressure_rear_left"]),
      rr: tire(["tpms_pressure_rr", "tire_pressure_rear_right"]),
    },
    lat: hasFix ? lat : null,
    lng: hasFix ? lng : null,
    heading: null,
    speedMph,
    shiftState,
    atHome: homeDistance == null ? null : homeDistance * 1609.344 <= settings.homeRadiusM,
    homeDistanceMi: homeDistance,
    lastUpdated: battery?.last_updated ?? new Date().toISOString(),
    stale: false,
    alerts: batteryPct <= 20 ? ["Battery is at or below 20%"] : [],
    powerKw: numberOf(motor),
    elevationM: numberOf(elevation),
    idealRangeMi: toMiles(numberOf(ideal), ideal),
    chargerVoltage: numberOf(voltage),
    chargerCurrent: numberOf(amps),
    chargerPhases: numberOf(phases),
  };
}

export async function fetchHomeAssistantVehicles(settings: AppSettings): Promise<Vehicle[]> {
  const states = await fetchStates(settings);
  const prefixes = settings.teslaEntityPrefix
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  const resolved = prefixes.length > 0 ? prefixes : discoverPrefixes(states);
  if (resolved.length === 0) {
    throw new Error(
      "No Tesla entities found. Set the entity prefix, for example model_y for sensor.model_y_battery.",
    );
  }
  const vehicles = resolved
    .map((prefix) => vehicleFromPrefix(states, prefix, settings))
    .filter((vehicle): vehicle is Vehicle => vehicle != null);
  if (vehicles.length === 0) {
    throw new Error(`Home Assistant is up, but nothing matched prefix “${resolved.join(", ")}”.`);
  }
  return vehicles.map((vehicle) => ({
    ...vehicle,
    tpmsPsi: vehicle.tpmsPsi ?? EMPTY_TIRES,
  }));
}

export async function wakeHomeAssistant(settings: AppSettings, id: string): Promise<string> {
  const prefixes = [id, settings.teslaEntityPrefix.split(",")[0]?.trim()].filter(Boolean);
  const entityId = `button.${prefixes[0]}_wake`;
  const response = await fetch(`${settings.homeAssistantUrl}/api/services/button/press`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.homeAssistantToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Wake failed (${response.status}). Expected ${entityId}.`);
  }
  return "waking";
}
