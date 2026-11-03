import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir, getSettingsFilePath } from "@/lib/auth/paths";
import { readJson, writeJson } from "@/lib/store";
import type { AppSettings, PublicSettings, SourcePreference, TeslaRegion } from "@/lib/types";

const DEFAULTS: AppSettings = {
  source: "auto",
  homeAssistantUrl: "",
  homeAssistantToken: "",
  teslaEntityPrefix: "",
  teslaRefreshToken: "",
  teslaClientId: "",
  teslaRegion: "na",
  pollIntervalSeconds: 60,
  distanceUnit: "mi",
  tempUnit: "F",
  electricityRateUsd: 0.14,
  homeLabel: "Home",
  homeLat: null,
  homeLng: null,
  homeRadiusM: 200,
  apiToken: "",
};

function asRegion(value: string | undefined): TeslaRegion {
  return value === "eu" || value === "cn" || value === "na" ? value : "na";
}

function asSource(value: string | undefined): SourcePreference {
  if (
    value === "tesla" ||
    value === "home-assistant" ||
    value === "demo" ||
    value === "auto"
  ) {
    return value;
  }
  return "auto";
}

async function readDotEnv(): Promise<Record<string, string>> {
  const file = path.join(process.cwd(), ".env.local");
  try {
    const raw = await fs.readFile(file, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function pick(
  file: Partial<AppSettings>,
  env: Record<string, string>,
  key: keyof AppSettings,
  envName: string,
): string {
  const fromFile = file[key];
  if (typeof fromFile === "string" && fromFile.trim()) return fromFile.trim();
  return (env[envName] ?? process.env[envName] ?? "").trim();
}

export async function getSettings(): Promise<AppSettings> {
  const [file, env] = await Promise.all([
    readJson<Partial<AppSettings>>(getSettingsFilePath(), {}),
    readDotEnv(),
  ]);
  const poll = Number(
    file.pollIntervalSeconds ??
      env.POLL_INTERVAL_SECONDS ??
      process.env.POLL_INTERVAL_SECONDS ??
      DEFAULTS.pollIntervalSeconds,
  );
  const rate = Number(
    file.electricityRateUsd ??
      env.ELECTRICITY_RATE_USD ??
      process.env.ELECTRICITY_RATE_USD ??
      DEFAULTS.electricityRateUsd,
  );
  const homeLatRaw = file.homeLat ?? env.HOME_LAT ?? process.env.HOME_LAT;
  const homeLngRaw = file.homeLng ?? env.HOME_LNG ?? process.env.HOME_LNG;
  const homeLat = homeLatRaw == null || homeLatRaw === "" ? null : Number(homeLatRaw);
  const homeLng = homeLngRaw == null || homeLngRaw === "" ? null : Number(homeLngRaw);

  return {
    source: asSource(String(file.source ?? env.VOLTDESK_SOURCE ?? process.env.VOLTDESK_SOURCE ?? "auto")),
    homeAssistantUrl: pick(file, env, "homeAssistantUrl", "HOME_ASSISTANT_URL").replace(/\/$/, ""),
    homeAssistantToken: pick(file, env, "homeAssistantToken", "HOME_ASSISTANT_TOKEN"),
    teslaEntityPrefix: pick(file, env, "teslaEntityPrefix", "TESLA_ENTITY_PREFIX"),
    teslaRefreshToken: pick(file, env, "teslaRefreshToken", "TESLA_REFRESH_TOKEN"),
    teslaClientId: pick(file, env, "teslaClientId", "TESLA_CLIENT_ID"),
    teslaRegion: asRegion(
      String(file.teslaRegion ?? env.TESLA_REGION ?? process.env.TESLA_REGION ?? "na"),
    ),
    pollIntervalSeconds: Number.isFinite(poll) ? Math.min(3600, Math.max(15, poll)) : 60,
    distanceUnit: file.distanceUnit === "km" || env.DISTANCE_UNIT === "km" ? "km" : "mi",
    tempUnit: file.tempUnit === "C" || env.TEMP_UNIT === "C" ? "C" : "F",
    electricityRateUsd: Number.isFinite(rate) ? rate : DEFAULTS.electricityRateUsd,
    homeLabel: (file.homeLabel || env.HOME_LABEL || DEFAULTS.homeLabel).slice(0, 40),
    homeLat: homeLat != null && Number.isFinite(homeLat) ? homeLat : null,
    homeLng: homeLng != null && Number.isFinite(homeLng) ? homeLng : null,
    homeRadiusM: Number(file.homeRadiusM ?? env.HOME_RADIUS_M ?? DEFAULTS.homeRadiusM) || 200,
    apiToken: typeof file.apiToken === "string" ? file.apiToken.trim() : "",
  };
}

export async function environmentApiToken(): Promise<string> {
  const env = await readDotEnv();
  return (env.VOLTDESK_API_TOKEN ?? process.env.VOLTDESK_API_TOKEN ?? "").trim();
}

export async function acceptedBotTokens(): Promise<string[]> {
  const [settings, envToken] = await Promise.all([getSettings(), environmentApiToken()]);
  return [...new Set([settings.apiToken, envToken].map((token) => token.trim()).filter(Boolean))];
}

export function demoForced(settings: AppSettings): boolean {
  const flag = (process.env.FORCE_DEMO_MODE ?? "").toLowerCase();
  return settings.source === "demo" || flag === "1" || flag === "true";
}

export function toPublicSettings(
  settings: AppSettings,
  access?: { fromEnvironment?: boolean },
): PublicSettings {
  const fromFile = Boolean(settings.apiToken);
  const fromEnvironment =
    access?.fromEnvironment ?? Boolean((process.env.VOLTDESK_API_TOKEN ?? "").trim());
  return {
    source: settings.source,
    homeAssistantUrl: settings.homeAssistantUrl,
    homeAssistantConfigured: Boolean(settings.homeAssistantUrl && settings.homeAssistantToken),
    teslaEntityPrefix: settings.teslaEntityPrefix,
    teslaConfigured: Boolean(settings.teslaRefreshToken && settings.teslaClientId),
    teslaClientId: settings.teslaClientId,
    teslaRegion: settings.teslaRegion,
    pollIntervalSeconds: settings.pollIntervalSeconds,
    distanceUnit: settings.distanceUnit,
    tempUnit: settings.tempUnit,
    electricityRateUsd: settings.electricityRateUsd,
    homeLabel: settings.homeLabel,
    homeLat: settings.homeLat,
    homeLng: settings.homeLng,
    homeRadiusM: settings.homeRadiusM,
    demoForced: demoForced(settings),
    botApiConfigured: fromFile || fromEnvironment,
    botApiFromFile: fromFile,
    botApiFromEnvironment: fromEnvironment,
  };
}

export async function saveSettings(next: AppSettings) {
  await fs.mkdir(getDataDir(), { recursive: true });
  await writeJson(getSettingsFilePath(), next);
}

export async function updateRefreshToken(token: string) {
  const current = await getSettings();
  if (current.teslaRefreshToken === token) return;
  await saveSettings({ ...current, teslaRefreshToken: token });
}
