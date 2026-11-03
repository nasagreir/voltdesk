import { randomBytes } from "node:crypto";
import { connection, NextResponse } from "next/server";
import { environmentApiToken, getSettings, saveSettings } from "@/lib/settings";

function access(fromFile: boolean, fromEnvironment: boolean) {
  return {
    configured: fromFile || fromEnvironment,
    fromFile,
    fromEnvironment,
  };
}

export async function POST(request: Request) {
  await connection();
  let revoke = false;
  try {
    const body = (await request.json()) as { revoke?: unknown };
    revoke = body?.revoke === true;
  } catch {
    revoke = false;
  }

  const current = await getSettings();
  const fromEnvironment = Boolean(await environmentApiToken());

  if (revoke) {
    await saveSettings({ ...current, apiToken: "" });
    return NextResponse.json({ revoked: true, ...access(false, fromEnvironment) });
  }

  const token = `vd_${randomBytes(32).toString("hex")}`;
  await saveSettings({ ...current, apiToken: token });
  return NextResponse.json({ token, ...access(true, fromEnvironment) });
}
