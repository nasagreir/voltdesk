import { chicagoParts, formatChicagoClock, formatChicagoStamp } from "./time";
import type {
  DistanceUnit,
  TempUnit,
  TirePressures,
  Vehicle,
  VehicleDisplay,
  VehicleView,
} from "./types";

export function milesTo(distanceMi: number, unit: DistanceUnit): number {
  return unit === "km" ? distanceMi * 1.609344 : distanceMi;
}

export function formatDistance(distanceMi: number, unit: DistanceUnit, digits = 0): string {
  const value = milesTo(distanceMi, unit);
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })} ${unit}`;
}

export function formatTemp(celsius: number | null, unit: TempUnit): string {
  if (celsius == null || !Number.isFinite(celsius)) return "—";
  const value = unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(value)}°${unit}`;
}

export function formatFixed(value: number | null, suffix: string, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })} ${suffix}`;
}

export function formatDoneBy(updatedIso: string, minutes: number | null, charging: boolean): string {
  if (!charging || minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes <= 1) return "Now";
  const updated = new Date(updatedIso);
  const done = new Date(updated.getTime() + minutes * 60_000);
  if (!Number.isFinite(done.getTime())) return "—";
  const clock = formatChicagoClock(done);
  const start = chicagoParts(updated);
  const end = chicagoParts(done);
  if (start.key === end.key) return clock;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(done);
  return `${weekday} ${clock}`;
}

export function presentVehicle(
  vehicle: Vehicle,
  units: { distance: DistanceUnit; temp: TempUnit },
): VehicleView {
  const tpms = (key: keyof TirePressures) =>
    formatFixed(vehicle.tpmsPsi[key], "psi", 1);
  const display: VehicleDisplay = {
    odometer: formatDistance(vehicle.odometerMi, units.distance, 0),
    ratedRange: formatDistance(vehicle.ratedRangeMi, units.distance, 0),
    estRange: formatDistance(vehicle.estRangeMi, units.distance, 0),
    battery: `${Math.round(vehicle.batteryPercent)}%`,
    chargeLimit: `${Math.round(vehicle.chargeLimitPercent)}%`,
    chargerPower: formatFixed(vehicle.chargerPowerKw, "kW", 1),
    chargeRate: formatDistance(vehicle.chargeRateMph, units.distance, 0).replace(
      units.distance,
      units.distance === "km" ? "km/h" : "mph",
    ),
    timeToFull:
      vehicle.minutesToFull == null
        ? "—"
        : vehicle.minutesToFull >= 60
          ? `${Math.floor(vehicle.minutesToFull / 60)}h ${Math.round(vehicle.minutesToFull % 60)}m`
          : `${Math.round(vehicle.minutesToFull)}m`,
    doneBy: formatDoneBy(vehicle.lastUpdated, vehicle.minutesToFull, vehicle.state === "charging"),
    energyAdded: formatFixed(vehicle.energyAddedKwh, "kWh", 1),
    inside: formatTemp(vehicle.insideTempC, units.temp),
    outside: formatTemp(vehicle.outsideTempC, units.temp),
    setpoint: formatTemp(vehicle.setpointC, units.temp),
    speed: formatDistance(vehicle.speedMph, units.distance, 0).replace(
      units.distance,
      units.distance === "km" ? "km/h" : "mph",
    ),
    tpms: { fl: tpms("fl"), fr: tpms("fr"), rl: tpms("rl"), rr: tpms("rr") },
    coords:
      vehicle.lat == null || vehicle.lng == null
        ? "No fix"
        : `${vehicle.lat.toFixed(5)}, ${vehicle.lng.toFixed(5)}`,
    homeDistance:
      vehicle.homeDistanceMi == null
        ? "—"
        : formatDistance(vehicle.homeDistanceMi, units.distance, 1),
    updated: formatChicagoStamp(new Date(vehicle.lastUpdated)),
    idealRange:
      vehicle.idealRangeMi == null
        ? "—"
        : formatDistance(vehicle.idealRangeMi, units.distance, 0),
    power: formatFixed(vehicle.powerKw ?? null, "kW", 1),
    elevation:
      vehicle.elevationM == null ? "—" : `${Math.round(vehicle.elevationM)} m`,
  };
  return { ...vehicle, display };
}

export function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
