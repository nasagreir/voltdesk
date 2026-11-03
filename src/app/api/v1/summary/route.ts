import { connection } from "next/server";
import { botSummary } from "@/lib/bot-payload";
import { botJson, denyBot } from "@/lib/bot-http";

export async function GET(request: Request) {
  await connection();
  const denied = await denyBot(request);
  if (denied) return denied;
  try {
    return botJson(await botSummary());
  } catch (error) {
    return botJson(
      { error: error instanceof Error ? error.message : "Could not read the car." },
      500,
    );
  }
}
