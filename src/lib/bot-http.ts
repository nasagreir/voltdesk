import { NextResponse } from "next/server";
import { runAsUser } from "@/lib/auth/actor";
import { bearerToken, userForBotToken } from "@/lib/bot-auth";

export function botJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function denied() {
  return botJson(
    {
      error: "Unauthorized. Send Authorization: Bearer with a VoltDesk bot token from Connections.",
    },
    401,
  );
}

export async function denyBot(request: Request) {
  const presented = bearerToken(request);
  if (!presented || !(await userForBotToken(presented))) return denied();
  return null;
}

export async function runBot<T>(request: Request, fn: () => Promise<T>, fallback = "Could not read the car.") {
  const presented = bearerToken(request);
  const username = presented ? await userForBotToken(presented) : null;
  if (!username) return denied();
  try {
    const body = username === "*" ? await fn() : await runAsUser(username, fn);
    return botJson(body);
  } catch (error) {
    return botJson({ error: error instanceof Error ? error.message : fallback }, 500);
  }
}
