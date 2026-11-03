import { buildDemo, DEMO_HOME } from "@/lib/demo";
import { presentVehicle } from "@/lib/format";
import { buildHistory } from "@/lib/history";
import { fetchHomeAssistantVehicles, wakeHomeAssistant } from "@/lib/home-assistant";
import { readAddresses, rememberAddresses, resolveFences } from "@/lib/places";
import { mergeAsleep, readLatest, readSamples, recordVehicles, writeLatest } from "@/lib/recorder";
import { buildReports } from "@/lib/reports";
import { deriveCharges, deriveDrives } from "@/lib/sessions";
import { tripSummary, tripsOverlapping } from "@/lib/trips";
import { isLiveData, pollSeconds } from "@/lib/live-data";
import { summarizeCharges } from "@/lib/charge-cost";
import { estimateTripRange, presentTripRange } from "@/lib/trip-range";
import { demoForced, getSettings } from "@/lib/settings";
import { fetchTeslaVehicles, TeslaRequestError, wakeTeslaVehicle } from "@/lib/tesla-fleet";
import type {
  AppSettings,
  ChargeSession,
  DashboardPayload,
  DriveSession,
  HistoryPayload,
  HistoryRange,
  ReportsPayload,
  TripsPayload,
  Vehicle,
  VehicleSample,
} from "@/lib/types";

const CACHE_MS = 12_000;
let cached: { at: number; payload: DashboardPayload } | null = null;
let inflight: Promise<DashboardPayload> | null = null;

function recordEvery(vehicles: Vehicle[], settings: AppSettings) {
  return pollSeconds(
    vehicles.map((vehicle) => vehicle.state),
    settings.pollIntervalSeconds,
    isLiveData(settings.liveDataUntil),
  );
}

function suggestedPoll(vehicles: Vehicle[], settings: AppSettings) {
  return recordEvery(vehicles, settings);
}

function liveFields(settings: AppSettings) {
  const live = isLiveData(settings.liveDataUntil);
  return { liveData: live, liveDataUntil: live ? settings.liveDataUntil : null };
}

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

async function withTripRanges(
  vehicles: Vehicle[],
  settings: AppSettings,
  mode: DashboardPayload["mode"],
) {
  const views = presentAll(vehicles, settings);
  const now = new Date();
  let samples: VehicleSample[] = [];
  try {
    samples = mode === "demo" ? buildDemo(now).samples : await readSamples();
  } catch {
    samples = [];
  }
  const drives = samples.length > 0 ? deriveDrives(samples) : [];
  let fences: Awaited<ReturnType<typeof resolveFences>>["fences"] = [];
  try {
    fences = (await resolveFences(settings, mode)).fences;
  } catch {
    fences = [];
  }
  const charges = samples.length > 0 ? deriveCharges(samples, settings.electricityRateUsd, fences) : [];
  return views.map((view) => ({
    ...view,
    chargeCosts: summarizeCharges(
      charges.filter((charge) => charge.vehicleId === view.id),
      now,
    ),
    tripRange: presentTripRange(
      estimateTripRange(
        {
          drives: drives.filter((drive) => drive.vehicleId === view.id),
          batteryPercent: view.batteryPercent,
          chargeLimitPercent: view.chargeLimitPercent,
          packKwh: view.packKwh,
          now,
        },
        now,
      ),
      settings.distanceUnit,
    ),
  }));
}

async function fromTesla(settings: AppSettings): Promise<Vehicle[]> {
  const live = await fetchTeslaVehicles(settings, { wakeAsleep: isLiveData(settings.liveDataUntil) });
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
      await recordVehicles(vehicles, recordEvery(vehicles, settings));
      return { vehicles, source: "tesla", message: "Live from the Tesla Fleet API." };
    } catch (error) {
      const message = error instanceof TeslaRequestError || error instanceof Error ? error.message : "Tesla request failed";
      if (settings.source === "tesla") throw new Error(message);
      errors.push(message);
    }
  }
  if (wantHa) {
    try {
      let vehicles = await fetchHomeAssistantVehicles(settings);
      if (isLiveData(settings.liveDataUntil)) {
        const sleeping = vehicles.filter((vehicle) => vehicle.state === "asleep" || vehicle.state === "offline");
        if (sleeping.length > 0) {
          await Promise.all(sleeping.map((vehicle) => wakeHomeAssistant(settings, vehicle.id).catch(() => null)));
          vehicles = await fetchHomeAssistantVehicles(settings);
        }
      }
      await writeLatest(vehicles);
      await recordVehicles(vehicles, recordEvery(vehicles, settings));
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
  if (!force && inflight) return inflight;
  const task: Promise<DashboardPayload> = (async () => {
    const settings = await getSettings();
    const live = isLiveData(settings.liveDataUntil);
    if (!force && cached && cached.payload.liveData === live && Date.now() - cached.at < (live ? 5_000 : CACHE_MS)) {
      return cached.payload;
    }
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
              vehicles: await withTripRanges(live.vehicles, settings, "live"),
              pollIntervalSeconds: suggestedPoll(live.vehicles, settings),
              ...liveFields(settings),
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
                vehicles: await withTripRanges(
                  saved.map((vehicle) => ({ ...vehicle, stale: true })),
                  settings,
                  "live",
                ),
                pollIntervalSeconds: suggestedPoll(saved, settings),
                ...liveFields(settings),
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
              vehicles: await withTripRanges([demo.vehicle], settings, "demo"),
              pollIntervalSeconds: suggestedPoll([demo.vehicle], settings),
              ...liveFields(settings),
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
        vehicles: await withTripRanges([demo.vehicle], settings, "demo"),
        pollIntervalSeconds: suggestedPoll([demo.vehicle], settings),
        ...liveFields(settings),
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
      vehicles: await withTripRanges([demo.vehicle], settings, "demo"),
      pollIntervalSeconds: suggestedPoll([demo.vehicle], settings),
      ...liveFields(settings),
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

async function contextFor(vehicleId?: string | null) {
  const settings = await getSettings();
  const dashboard = await getDashboard();
  const now = new Date();
  const selected = vehicleId || dashboard.vehicles[0]?.id || null;
  const { fences } = await resolveFences(settings, dashboard.mode);
  const samples =
    dashboard.mode === "demo" ? buildDemo(now).samples : await readSamples();
  const scoped = samples.filter((sample) => !selected || sample.vehicleId === selected);
  return { settings, dashboard, now, selected, fences, samples: scoped };
}

export async function getHistory(range: HistoryRange, vehicleId?: string | null): Promise<HistoryPayload> {
  const { settings, dashboard, now, selected, fences, samples } = await contextFor(vehicleId);
  const home = fences.length > 0 ? fences : (homeOf(settings) ?? (dashboard.mode === "demo" ? DEMO_HOME : null));
  return buildHistory({
    samples,
    range,
    now,
    vehicleId: selected,
    rateUsdPerKwh: settings.electricityRateUsd,
    home,
    mode: dashboard.mode,
    source: dashboard.source,
    units: { distance: settings.distanceUnit, temp: settings.tempUnit },
    message: dashboard.message,
  });
}

export async function getTrips(from: Date, to: Date, fromDay: string, toDay: string, vehicleId?: string | null): Promise<TripsPayload> {
  const { settings, dashboard, selected, fences, samples } = await contextFor(vehicleId);
  const addresses = await readAddresses();
  const drives = deriveDrives(samples, fences, addresses);
  const trips = tripsOverlapping(drives, from.getTime(), to.getTime());
  const vehicle = dashboard.vehicles.find((item) => item.id === selected) ?? dashboard.vehicles[0];
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    fromDay,
    toDay,
    vehicleId: selected,
    vehicleName: vehicle?.name ?? null,
    mode: dashboard.mode,
    source: dashboard.source,
    message: dashboard.message,
    units: { distance: settings.distanceUnit, temp: settings.tempUnit },
    summary: tripSummary(trips),
    trips,
  };
}

export async function getReports(days: number, vehicleId?: string | null): Promise<ReportsPayload> {
  const { settings, dashboard, now, selected, fences, samples } = await contextFor(vehicleId);
  let addresses: Record<string, string> = {};
  try {
    addresses = await rememberAddresses(samples, fences);
  } catch {
    addresses = await readAddresses().catch(() => ({}));
  }
  return buildReports({
    samples,
    now,
    days,
    vehicleId: selected,
    rateUsdPerKwh: settings.electricityRateUsd,
    places: fences,
    addresses,
    units: { distance: settings.distanceUnit, temp: settings.tempUnit },
    mode: dashboard.mode,
    source: dashboard.source,
    message: dashboard.message,
  });
}

function samplesBetween(samples: VehicleSample[], start: string, end: string): VehicleSample[] {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  const span = samples.filter((sample) => {
    const at = new Date(sample.at).getTime();
    return at >= from && at <= to;
  });
  if (span.length <= 400) return span;
  const step = Math.ceil(span.length / 400);
  return span.filter((_, index) => index % step === 0);
}

export async function getDrive(id: string): Promise<{
  drive: DriveSession;
  samples: VehicleSample[];
  units: ReportsPayload["units"];
} | null> {
  const { settings, selected, fences, samples } = await contextFor(null);
  const addresses = await readAddresses();
  const drives = deriveDrives(samples, fences, addresses);
  const drive = drives.find((item) => item.id === id && (!selected || item.vehicleId === selected));
  if (!drive) return null;
  return {
    drive,
    samples: samplesBetween(samples, drive.startedAt, drive.endedAt),
    units: { distance: settings.distanceUnit, temp: settings.tempUnit },
  };
}

export async function getCharge(id: string): Promise<{
  charge: ChargeSession;
  samples: VehicleSample[];
  units: ReportsPayload["units"];
} | null> {
  const { settings, selected, fences, samples } = await contextFor(null);
  const addresses = await readAddresses();
  const charges = deriveCharges(samples, settings.electricityRateUsd, fences, addresses);
  const charge = charges.find((item) => item.id === id && (!selected || item.vehicleId === selected));
  if (!charge) return null;
  return {
    charge,
    samples: samplesBetween(samples, charge.startedAt, charge.endedAt),
    units: { distance: settings.distanceUnit, temp: settings.tempUnit },
  };
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
