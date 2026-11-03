import { NextResponse } from "next/server";
import { authorizedBot } from "@/lib/bot-auth";

export function botJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function denyBot(request: Request) {
  if (await authorizedBot(request)) return null;
  return botJson(
    {
      error: "Unauthorized. Send Authorization: Bearer with a VoltDesk bot token from Connections.",
    },
    401,
  );
}
