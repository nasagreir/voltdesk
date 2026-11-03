import { connection } from "next/server";
import { botCharges, clampDays } from "@/lib/bot-payload";
import { runBot } from "@/lib/bot-http";

export async function GET(request: Request) {
  await connection();
  const days = clampDays(new URL(request.url).searchParams.get("days"));
  return runBot(request, () => botCharges(days), "Could not read charges.");
}
