import { connection, NextResponse } from "next/server";
import { presetRange } from "@/lib/time";
import { getDailyDistance } from "@/lib/vehicle-service";

const WINDOWS = [7, 30, 90];

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if ((fromParam && !toParam) || (!fromParam && toParam)) {
    return NextResponse.json({ error: "Choose both a start and an end date." }, { status: 400 });
  }
  let fromDay = fromParam ?? "";
  let toDay = toParam ?? "";
  if (!fromDay || !toDay) {
    const days = Number(url.searchParams.get("days") ?? "30");
    const selected = WINDOWS.includes(days) ? days : 30;
    const range = presetRange(selected);
    fromDay = range.from;
    toDay = range.to;
  }
  try {
    const body = await getDailyDistance(fromDay, toDay, url.searchParams.get("vehicle"));
    if ("error" in body) return NextResponse.json(body, { status: 400 });
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load daily driving" },
      { status: 500 },
    );
  }
}
