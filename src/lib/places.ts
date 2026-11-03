import { promises as fs } from "node:fs";
import { getDataDir } from "@/lib/auth/paths";
import path from "node:path";
import { DEMO_FENCES } from "@/lib/demo";
import { addressKey, matchFence } from "@/lib/sessions";
import { readJson, writeJson } from "@/lib/store";
import type { AppSettings, ConnectionMode, Geofence, VehicleSample } from "@/lib/types";

function fencesPath() {
  return path.join(getDataDir(), "geofences.json");
}

function addressesPath() {
  return path.join(getDataDir(), "addresses.json");
}

export async function readSavedFences(): Promise<Geofence[] | null> {
  try {
    const raw = await fs.readFile(fencesPath(), "utf8");
    const parsed = JSON.parse(raw) as Geofence[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeFences(fences: Geofence[]) {
  await writeJson(fencesPath(), fences);
}

export function applyHomeSettings(fences: Geofence[], settings: AppSettings): Geofence[] {
  if (settings.homeLat == null || settings.homeLng == null) return fences;
  const previous = fences.find((fence) => fence.id === "home");
  const home: Geofence = {
    id: "home",
    name: settings.homeLabel.trim() || "Home",
    lat: settings.homeLat,
    lng: settings.homeLng,
    radiusM: settings.homeRadiusM,
    costPerKwh: settings.electricityRateUsd,
    sessionFee: previous?.sessionFee ?? 0,
  };
  return [home, ...fences.filter((fence) => fence.id !== "home")];
}

export function applyWorkSettings(fences: Geofence[], settings: AppSettings): Geofence[] {
  if (settings.workLat == null || settings.workLng == null) return fences;
  const previous = fences.find((fence) => fence.id === "work");
  const work: Geofence = {
    id: "work",
    name: settings.workLabel.trim() || "Work",
    lat: settings.workLat,
    lng: settings.workLng,
    radiusM: settings.workRadiusM,
    costPerKwh: settings.workRateUsd,
    sessionFee: previous?.sessionFee ?? 0,
  };
  const index = fences.findIndex((fence) => fence.id === "work");
  if (index < 0) return [...fences, work];
  return fences.map((fence, i) => (i === index ? work : fence));
}

export function applySavedPlaces(fences: Geofence[], settings: AppSettings): Geofence[] {
  return applyWorkSettings(applyHomeSettings(fences, settings), settings);
}

export async function resolveFences(
  settings: AppSettings,
  mode: ConnectionMode,
): Promise<{ fences: Geofence[]; persisted: boolean }> {
  const saved = await readSavedFences();
  if (saved) return { fences: applySavedPlaces(saved, settings), persisted: true };
  if (mode === "demo" || settings.source === "demo") {
    return { fences: applySavedPlaces(DEMO_FENCES, settings), persisted: false };
  }
  return { fences: applySavedPlaces([], settings), persisted: false };
}

export async function readAddresses(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(addressesPath(), {});
}

export async function rememberAddresses(
  samples: VehicleSample[],
  fences: Geofence[],
): Promise<Record<string, string>> {
  const cache = await readAddresses();
  const missing: Array<{ lat: number; lng: number; key: string }> = [];
  for (const sample of samples) {
    if (sample.lat == null || sample.lng == null) continue;
    if (matchFence(sample.lat, sample.lng, fences)) continue;
    const key = addressKey(sample.lat, sample.lng);
    if (cache[key] || missing.some((item) => item.key === key)) continue;
    missing.push({ lat: sample.lat, lng: sample.lng, key });
    if (missing.length >= 2) break;
  }
  let changed = false;
  for (const point of missing) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(point.lat));
      url.searchParams.set("lon", String(point.lng));
      url.searchParams.set("zoom", "16");
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "VoltDesk/1.0 (self-hosted Tesla dashboard)",
        },
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      });
      if (!response.ok) break;
      const body = (await response.json()) as { display_name?: string };
      const label = body.display_name?.split(",").slice(0, 3).join(",").trim();
      if (!label) continue;
      cache[point.key] = label;
      changed = true;
    } catch {
      break;
    }
  }
  if (changed) {
    try {
      await writeJson(addressesPath(), cache);
    } catch {
      /* a parallel request may be writing the same cache */
    }
  }
  return cache;
}
