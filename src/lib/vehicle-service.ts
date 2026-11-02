import { buildDemo, DEMO_HOME } from "@/lib/demo";
import { presentVehicle } from "@/lib/format";
import { buildHistory } from "@/lib/history";
import { fetchHomeAssistantVehicles, wakeHomeAssistant } from "@/lib/home-assistant";
import { mergeAsleep, readLatest, readSamples, recordVehicles, writeLatest } from "@/lib/recorder";
import { demoForced, getSettings } from "@/lib/settings";
import { fetchTeslaVehicles, TeslaRequestError, wakeTeslaVehicle } from "@/lib/tesla-fleet";
import type { AppSettings, DashboardPayload, HistoryPayload, HistoryRange, Vehicle } from "@/lib/types";

const CACHE_MS = 12_000;
let cached: { at: number; payload: DashboardPayload } | null = null;
let inflight: Promise<DashboardPayload> | null = null;

function homeOf(settings: AppSettings) {
  if (settings.homeLat == null || settings.homeLng == null) return null;
  return {
    lat: settings.homeLat,
    lng: settings.homeLng,
    label: settings.homeLabel || "Home",
    radiusM: settings.homeRadiusM,
  };
}

function presentAll(vehicles: Vehicle[], settings: AppSettings) {
  const units = { distance: settings.distanceUnit, temp: settings.tempUnit };
  return vehicles.map((vehicle) => presentVehicle(vehicle, units));
}

async function fromTesla(settings: AppSettings): Promise<Vehicle[]> {
  const live = await fetchTeslaVehicles(settings);
  const latest = await readLatest();
  return live.map((vehicle) => mergeAsleep(vehicle, latest[vehicle.id]));
}

async function loadLive(settings: AppSettings): Promise<{
  vehicles: Vehicle[];
  source: DashboardPayload["source"];
  message: string;
}> {
  const wantTesla =
    settings.source === "tesla" ||
    (settings.source === "auto" && settings.teslaRefreshToken && settings.teslaClientId);
  const wantHa =
    settings.source === "home-assistant" ||
    (settings.source === "auto" && settings.homeAssistantUrl && settings.homeAssistantToken);

  if (settings.source === "tesla" && (!settings.teslaClientId || !settings.teslaRefreshToken)) {
    throw new Error("Tesla is selected, but the client id or refresh token is missing.");
  }
  if (settings.source === "home-assistant" && (!settings.homeAssistantUrl || !settings.homeAssistantToken)) {
    throw new Error("Home Assistant is selected, but the URL or token is missing.");
  }

  const errors: string[] = [];
  if (wantTesla) {
    try {
      const vehicles = await fromTesla(settings);
      await writeLatest(vehicles);
      await recordVehicles(vehicles, settings.pollIntervalSeconds);
      return { vehicles, source: "tesla", message: "Live from the Tesla Fleet API." };
    } catch (error) {
      const message = error instanceof TeslaRequestError || error instanceof Error ? error.message : "Tesla request failed";
      if (settings.source === "tesla") throw new Error(message);
      errors.push(message);
    }
  }
  if (wantHa) {
    try {
      const vehicles = await fetchHomeAssistantVehicles(settings);
      await writeLatest(vehicles);
      await recordVehicles(vehicles, settings.pollIntervalSeconds);
      const note = errors.length ? ` Tesla was skipped (${errors[0]}).` : "";
      return {
        vehicles,
        source: "home-assistant",
        message: `Live from Home Assistant.${note}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Home Assistant request failed";
      errors.push(message);
      if (settings.source === "home-assistant") throw new Error(message);
    }
  }
  throw new Error(errors.join(" ") || "No live source configured.");
}

async function compose(force = false): Promise<DashboardPayload> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.payload;
  if (!force && inflight) return inflight;
  const task: Promise<DashboardPayload> = (async () => {
    const settings = await getSettings();
    const units = { distance: settings.distanceUnit, temp: settings.tempUnit };
    const now = new Date().toISOString();
    try {
      if (!demoForced(settings) && settings.source !== "demo") {
        const configured =
          (settings.teslaClientId && settings.teslaRefreshToken) ||
          (settings.homeAssistantUrl && settings.homeAssistantToken) ||
          settings.source === "tesla" ||
          settings.source === "home-assistant";
        if (configured) {
          try {
            const live = await loadLive(settings);
            const payload: DashboardPayload = {
              mode: "live",
              source: live.source,
              message: live.message,
              fetchedAt: now,
              units,
              vehicles: presentAll(live.vehicles, settings),
              pollIntervalSeconds: settings.pollIntervalSeconds,
            };
            cached = { at: Date.now(), payload };
            return payload;
          } catch (error) {
            const latest = await readLatest();
            const saved = Object.values(latest);
            if (saved.length > 0) {
              const payload: DashboardPayload = {
                mode: "live",
                source: settings.teslaRefreshToken ? "tesla" : "home-assistant",
                message: `${error instanceof Error ? error.message : "Live data failed."} Showing the last saved report.`,
                fetchedAt: now,
                units,
                vehicles: presentAll(
                  saved.map((vehicle) => ({ ...vehicle, stale: true })),
                  settings,
                ),
                pollIntervalSeconds: settings.pollIntervalSeconds,
              };
              cached = { at: Date.now(), payload };
              return payload;
            }
            const demo = buildDemo();
            const payload: DashboardPayload = {
              mode: "demo",
              source: "demo",
              message: `${error instanceof Error ? error.message : "Live data failed."} Showing the demo Model Y until the connection works.`,
              fetchedAt: now,
              units,
              vehicles: presentAll([demo.vehicle], settings),
              pollIntervalSeconds: settings.pollIntervalSeconds,
            };
            cached = { at: Date.now(), payload };
            return payload;
          }
        }
      }
    } catch (error) {
      const demo = buildDemo();
      return {
        mode: "demo",
        source: "demo",
        message: error instanceof Error ? error.message : "VoltDesk could not load the car.",
        fetchedAt: now,
        units,
        vehicles: presentAll([demo.vehicle], settings),
        pollIntervalSeconds: settings.pollIntervalSeconds,
      };
    }

    const demo = buildDemo();
    const payload: DashboardPayload = {
      mode: "demo",
      source: "demo",
      message:
        "Demo mode. This is a sample Model Y in Chicago, not your car. Add a Tesla Fleet token or Home Assistant on Connections.",
      fetchedAt: now,
      units,
      vehicles: presentAll([demo.vehicle], settings),
      pollIntervalSeconds: settings.pollIntervalSeconds,
    };
    cached = { at: Date.now(), payload };
    return payload;
  })();
  inflight = task.finally(() => {
    inflight = null;
  });
  return task;
}

export function clearDashboardCache() {
  cached = null;
}

export async function getDashboard(): Promise<DashboardPayload> {
  return compose(false);
}

export async function getHistory(range: HistoryRange, vehicleId?: string | null): Promise<HistoryPayload> {
  const settings = await getSettings();
  const dashboard = await getDashboard();
  const now = new Date();
  const units = { distance: settings.distanceUnit, temp: settings.tempUnit };
  const selected = vehicleId || dashboard.vehicles[0]?.id || null;
  const home = homeOf(settings) ?? (dashboard.mode === "demo" ? DEMO_HOME : null);
  const samples =
    dashboard.mode === "demo"
      ? buildDemo(now).samples
      : await readSamples();
  return buildHistory({
    samples,
    range,
    now,
    vehicleId: selected,
    rateUsdPerKwh: settings.electricityRateUsd,
    home,
    mode: dashboard.mode,
    source: dashboard.source,
    units,
    message: dashboard.message,
  });
}

export async function wakeVehicle(id: string): Promise<{ ok: true; state: string }> {
  const settings = await getSettings();
  clearDashboardCache();
  if (settings.teslaRefreshToken && settings.teslaClientId && settings.source !== "home-assistant") {
    const state = await wakeTeslaVehicle(settings, id);
    return { ok: true, state };
  }
  if (settings.homeAssistantUrl && settings.homeAssistantToken) {
    const state = await wakeHomeAssistant(settings, id);
    return { ok: true, state };
  }
  throw new Error("Wake needs a Tesla token or Home Assistant. Demo cars stay asleep on purpose.");
}
