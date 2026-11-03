import { connection, NextResponse } from "next/server";
import { parseTripRange } from "@/lib/trips";
import { getReports } from "@/lib/vehicle-service";

const WINDOWS = [7, 14, 30, 90, 365, 0];

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
      return NextResponse.json(await getReports(0, vehicle, parsed));
    }
    const days = Number(url.searchParams.get("days") ?? "30");
    const selected = WINDOWS.includes(days) ? days : 30;
    return NextResponse.json(await getReports(selected, vehicle));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reports failed" },
      { status: 500 },
    );
  }
}
