import { promises as fs } from "node:fs";
import path from "node:path";
import { getLatestFilePath, getSamplesFilePath } from "@/lib/auth/paths";
import { readJson, writeJson } from "@/lib/store";
import type { Vehicle, VehicleSample } from "@/lib/types";

const KEEP_MS = 400 * 24 * 60 * 60 * 1000;

export function vehicleToSample(vehicle: Vehicle): VehicleSample {
  return {
    at: vehicle.lastUpdated,
    vehicleId: vehicle.id,
    name: vehicle.name,
    batteryPercent: vehicle.batteryPercent,
    ratedRangeMi: vehicle.ratedRangeMi,
    odometerMi: vehicle.odometerMi,
    chargingState: vehicle.chargingState,
    chargerPowerKw: vehicle.chargerPowerKw,
    energyAddedKwh: vehicle.energyAddedKwh,
    shiftState: vehicle.shiftState,
    speedMph: vehicle.speedMph,
    lat: vehicle.lat,
    lng: vehicle.lng,
    insideTempC: vehicle.insideTempC,
    outsideTempC: vehicle.outsideTempC,
    packKwh: vehicle.packKwh,
    powerKw: vehicle.powerKw ?? null,
    elevationM: vehicle.elevationM ?? null,
    idealRangeMi: vehicle.idealRangeMi ?? null,
    estRangeMi: vehicle.estRangeMi,
    usableBatteryPercent: vehicle.usableBatteryPercent ?? null,
    chargerVoltage: vehicle.chargerVoltage ?? null,
    chargerCurrent: vehicle.chargerCurrent ?? null,
    chargerPhases: vehicle.chargerPhases ?? null,
    fastCharger: vehicle.fastCharger ?? false,
    softwareVersion: vehicle.softwareVersion || undefined,
    activity: vehicle.state,
  };
}

export async function readSamples(): Promise<VehicleSample[]> {
  try {
    const raw = await fs.readFile(getSamplesFilePath(), "utf8");
    const cutoff = Date.now() - KEEP_MS;
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as VehicleSample)
      .filter((sample) => new Date(sample.at).getTime() >= cutoff);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function recordVehicles(vehicles: Vehicle[], minIntervalSec: number) {
  const fresh = vehicles.filter((vehicle) => vehicle.batteryPercent > 0 || vehicle.odometerMi > 0);
  if (fresh.length === 0) return;
  const existing = await readSamples();
  const lines: string[] = [];
  for (const vehicle of fresh) {
    const previous = [...existing].reverse().find((sample) => sample.vehicleId === vehicle.id);
    const sample = vehicleToSample(vehicle);
    const quiet = vehicle.state === "asleep" || vehicle.state === "offline";
    const intervalSec = quiet ? Math.max(minIntervalSec, 15 * 60) : minIntervalSec;
    if (previous) {
      const delta = new Date(sample.at).getTime() - new Date(previous.at).getTime();
      if (delta < intervalSec * 1000) continue;
    }
    lines.push(JSON.stringify(sample));
    existing.push(sample);
  }
  if (lines.length === 0) return;
  await fs.mkdir(path.dirname(getSamplesFilePath()), { recursive: true });
  await fs.appendFile(getSamplesFilePath(), `${lines.join("\n")}\n`, { mode: 0o600 });
  const stat = await fs.stat(getSamplesFilePath());
  if (stat.size > 20_000_000) {
    const trimmed = existing.filter((sample) => Date.now() - new Date(sample.at).getTime() < KEEP_MS);
    await fs.writeFile(
      getSamplesFilePath(),
      `${trimmed.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
      { mode: 0o600 },
    );
  }
}

export async function readLatest(): Promise<Record<string, Vehicle>> {
  return readJson<Record<string, Vehicle>>(getLatestFilePath(), {});
}

export async function writeLatest(vehicles: Vehicle[]) {
  const current = await readLatest();
  for (const vehicle of vehicles) {
    if (!vehicle.stale) current[vehicle.id] = vehicle;
  }
  await writeJson(getLatestFilePath(), current);
}

export function mergeAsleep(vehicle: Vehicle, previous: Vehicle | undefined): Vehicle {
  if (!vehicle.stale || !previous) return vehicle;
  return {
    ...previous,
    state: vehicle.state,
    stale: true,
    lastUpdated: previous.lastUpdated,
    alerts: [
      vehicle.state === "offline"
        ? "Car is offline. Showing the last report VoltDesk saved."
        : "Car is asleep. Showing the last report VoltDesk saved.",
      ...previous.alerts.filter((alert) => !alert.toLowerCase().includes("asleep")),
    ],
  };
}
