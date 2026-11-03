import { connection } from "next/server";
import { botDrives, clampDays } from "@/lib/bot-payload";
import { botJson, denyBot } from "@/lib/bot-http";

export async function GET(request: Request) {
  await connection();
  const denied = await denyBot(request);
  if (denied) return denied;
  const days = clampDays(new URL(request.url).searchParams.get("days"));
  try {
    return botJson(await botDrives(days));
  } catch (error) {
    return botJson(
      { error: error instanceof Error ? error.message : "Could not read drives." },
      500,
    );
  }
}
