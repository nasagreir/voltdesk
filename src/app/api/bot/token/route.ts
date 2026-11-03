import { randomBytes } from "node:crypto";
import { connection, NextResponse } from "next/server";
import { z } from "zod";
import {
  BOT_TOKEN_LIMIT,
  environmentApiToken,
  getSettings,
  saveSettings,
  toPublicSettings,
} from "@/lib/settings";
import type { AppSettings } from "@/lib/types";

const bodySchema = z.object({
  revoke: z.boolean().optional(),
  id: z.string().max(40).optional(),
  name: z.string().max(40).optional(),
});

function status(settings: AppSettings, fromEnvironment: boolean) {
  const pub = toPublicSettings(settings, { fromEnvironment });
  return {
    configured: pub.botApiConfigured,
    fromFile: pub.botApiFromFile,
    fromEnvironment: pub.botApiFromEnvironment,
    tokens: pub.botTokens,
  };
}

export async function POST(request: Request) {
  await connection();
  let body: z.infer<typeof bodySchema> = {};
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the token name and try again." }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  const current = await getSettings();
  const fromEnvironment = Boolean(await environmentApiToken());

  if (body.revoke) {
    const apiTokens = body.id ? current.apiTokens.filter((item) => item.id !== body.id) : [];
    if (body.id && apiTokens.length === current.apiTokens.length) {
      return NextResponse.json({ error: "That token is already gone." }, { status: 404 });
    }
    const next = { ...current, apiToken: "", apiTokens };
    await saveSettings(next);
    return NextResponse.json({ revoked: true, ...status(next, fromEnvironment) });
  }

  if (current.apiTokens.length >= BOT_TOKEN_LIMIT) {
    return NextResponse.json(
      { error: `VoltDesk keeps up to ${BOT_TOKEN_LIMIT} bot tokens. Revoke one before generating another.` },
      { status: 400 },
    );
  }

  const name = body.name?.trim().slice(0, 40) || "Grok bot";
  const token = `vd_${randomBytes(32).toString("hex")}`;
  const record = {
    id: randomBytes(8).toString("hex"),
    name,
    token,
    createdAt: new Date().toISOString(),
  };
  const next = { ...current, apiToken: "", apiTokens: [record, ...current.apiTokens] };
  await saveSettings(next);
  return NextResponse.json({ token, ...status(next, fromEnvironment) });
}
