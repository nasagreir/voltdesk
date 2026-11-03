import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { clearDashboardCache } from "@/lib/vehicle-service";
import { cleanPaperlessUrl, normalizePaperlessTag } from "@/lib/service-docs";
import {
  environmentApiToken,
  environmentGrokKey,
  environmentPaperlessToken,
  getSettings,
  saveSettings,
  toPublicSettings,
} from "@/lib/settings";
import type { AppSettings } from "@/lib/types";

const bodySchema = z.object({
  source: z.enum(["auto", "tesla", "home-assistant", "demo"]),
  homeAssistantUrl: z.string().max(300),
  homeAssistantToken: z.string().max(4000).optional(),
  clearHomeAssistantToken: z.boolean().optional(),
  teslaEntityPrefix: z.string().max(160),
  teslaClientId: z.string().max(200),
  teslaRefreshToken: z.string().max(8000).optional(),
  clearTeslaRefreshToken: z.boolean().optional(),
  teslaRegion: z.enum(["na", "eu", "cn"]),
  pollIntervalSeconds: z.number().min(15).max(3600),
  distanceUnit: z.enum(["mi", "km"]),
  tempUnit: z.enum(["F", "C"]),
  electricityRateUsd: z.number().min(0).max(10),
  homeLabel: z.string().max(40),
  homeLat: z.number().nullable(),
  homeLng: z.number().nullable(),
  homeRadiusM: z.number().min(20).max(5000),
  workLabel: z.string().max(40),
  workLat: z.number().nullable(),
  workLng: z.number().nullable(),
  workRadiusM: z.number().min(20).max(5000),
  workRateUsd: z.number().min(0).max(10),
  paperlessUrl: z.string().max(300).optional(),
  paperlessTag: z.string().max(50).optional(),
  paperlessToken: z.string().max(500).optional(),
  clearPaperlessToken: z.boolean().optional(),
});

async function publish(settings: Awaited<ReturnType<typeof getSettings>>) {
  const [fromEnvironment, grokFromEnvironment, paperlessFromEnvironment] = await Promise.all([
    environmentApiToken().then(Boolean),
    environmentGrokKey().then(Boolean),
    environmentPaperlessToken().then(Boolean),
  ]);
  return toPublicSettings(settings, { fromEnvironment, grokFromEnvironment, paperlessFromEnvironment });
}

export async function GET() {
  await connection();
  return NextResponse.json(await publish(await getSettings()));
}

export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the connection form and try again." }, { status: 400 });
  }
  const current = await getSettings();
  const body = parsed.data;
  const next: AppSettings = {
    ...current,
    source: body.source,
    homeAssistantUrl: body.homeAssistantUrl.trim().replace(/\/$/, ""),
    homeAssistantToken: body.clearHomeAssistantToken
      ? ""
      : body.homeAssistantToken?.trim() || current.homeAssistantToken,
    teslaEntityPrefix: body.teslaEntityPrefix.trim(),
    teslaClientId: body.teslaClientId.trim(),
    teslaRefreshToken: body.clearTeslaRefreshToken
      ? ""
      : body.teslaRefreshToken?.trim() || current.teslaRefreshToken,
    teslaRegion: body.teslaRegion,
    pollIntervalSeconds: body.pollIntervalSeconds,
    distanceUnit: body.distanceUnit,
    tempUnit: body.tempUnit,
    electricityRateUsd: body.electricityRateUsd,
    homeLabel: body.homeLabel.trim() || "Home",
    homeLat: body.homeLat,
    homeLng: body.homeLng,
    homeRadiusM: body.homeRadiusM,
    workLabel: body.workLabel.trim() || "Work",
    workLat: body.workLat,
    workLng: body.workLng,
    workRadiusM: body.workRadiusM,
    workRateUsd: body.workRateUsd,
    paperlessTag:
      body.paperlessTag === undefined ? current.paperlessTag : normalizePaperlessTag(body.paperlessTag),
    paperlessToken: body.clearPaperlessToken ? "" : body.paperlessToken?.trim() || current.paperlessToken,
  };
  if (body.paperlessUrl !== undefined) {
    const url = cleanPaperlessUrl(body.paperlessUrl);
    if (typeof url !== "string") {
      return NextResponse.json({ error: url.error }, { status: 400 });
    }
    next.paperlessUrl = url;
  }
  await saveSettings(next);
  clearDashboardCache();
  return NextResponse.json(await publish(next));
}
