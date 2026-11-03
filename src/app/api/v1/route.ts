import { connection } from "next/server";
import { botDiscovery } from "@/lib/bot-payload";
import { botJson } from "@/lib/bot-http";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  return botJson(botDiscovery(url.origin));
}
