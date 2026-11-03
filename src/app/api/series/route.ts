import { connection, NextResponse } from "next/server";
import { isReadingMetric } from "@/lib/reading-series";
import { presetRange } from "@/lib/time";
import { parseTripRange } from "@/lib/trips";
import { getReadingSeries } from "@/lib/vehicle-service";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const metric = url.searchParams.get("metric");
  if (!isReadingMetric(metric)) {
    return NextResponse.json({ error: "Choose a reading to chart." }, { status: 400 });
  }
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if ((fromParam && !toParam) || (!fromParam && toParam)) {
    return NextResponse.json({ error: "Choose both a start and an end date." }, { status: 400 });
  }
  const fallback = presetRange(30);
  const fromDay = fromParam || fallback.from;
  const toDay = toParam || fallback.to;
  const parsed = parseTripRange(fromDay, toDay);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json(await getReadingSeries(metric, fromDay, toDay, url.searchParams.get("vehicle")));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load history" },
      { status: 500 },
    );
  }
}
