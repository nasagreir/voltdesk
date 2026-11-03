import { connection, NextResponse } from "next/server";
import { parseTripRange } from "@/lib/trips";
import { getHistory } from "@/lib/vehicle-service";
import type { HistoryRange } from "@/lib/types";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const vehicle = url.searchParams.get("vehicle");
  if ((fromParam && !toParam) || (!fromParam && toParam)) {
    return NextResponse.json({ error: "Choose both a start and an end date." }, { status: 400 });
  }
  try {
    if (fromParam && toParam) {
      const parsed = parseTripRange(fromParam, toParam);
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      return NextResponse.json(await getHistory("custom", vehicle, parsed));
    }
    const range = url.searchParams.get("range");
    const allowed: HistoryRange[] = ["24h", "7d", "14d"];
    const selected = allowed.includes(range as HistoryRange) ? (range as HistoryRange) : "7d";
    return NextResponse.json(await getHistory(selected, vehicle));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History failed" },
      { status: 500 },
    );
  }
}
