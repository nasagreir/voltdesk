import { connection } from "next/server";
import { botSummary } from "@/lib/bot-payload";
import { runBot } from "@/lib/bot-http";

export async function GET(request: Request) {
  await connection();
  return runBot(request, () => botSummary());
}
