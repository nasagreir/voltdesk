import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { clearSuggestionCache } from "@/lib/suggestions";
import {
  environmentApiToken,
  environmentApplies,
  environmentGrokKey,
  getSettings,
  saveGrokApiKey,
  toPublicSettings,
} from "@/lib/settings";

const bodySchema = z.union([
  z.object({ clear: z.literal(true) }),
  z.object({
    apiKey: z
      .string()
      .trim()
      .min(20, "That key looks too short.")
      .max(200, "That key is too long.")
      .refine((value) => !/\s/.test(value), "The key cannot contain spaces."),
  }),
]);

export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the xAI key and try again." },
      { status: 400 },
    );
  }
  const apiKey = "clear" in parsed.data ? "" : parsed.data.apiKey.trim();
  await saveGrokApiKey(apiKey);
  clearSuggestionCache();
  const applyEnv = await environmentApplies();
  const [settings, fromEnvironment, grokKey] = await Promise.all([
    getSettings(),
    applyEnv ? environmentApiToken() : Promise.resolve(""),
    applyEnv ? environmentGrokKey() : Promise.resolve(""),
  ]);
  const publicSettings = toPublicSettings(settings, {
    fromEnvironment: Boolean(fromEnvironment),
    grokFromEnvironment: Boolean(grokKey),
  });
  return NextResponse.json({
    grokConfigured: publicSettings.grokConfigured,
    grokFromFile: publicSettings.grokFromFile,
    grokFromEnvironment: publicSettings.grokFromEnvironment,
  });
}
