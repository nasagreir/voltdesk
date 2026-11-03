import { connection, NextResponse } from "next/server";
import { getDailyDistance } from "@/lib/vehicle-service";

const WINDOWS = [7, 30, 90];

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "30");
  const selected = WINDOWS.includes(days) ? days : 30;
  try {
    return NextResponse.json(await getDailyDistance(selected, url.searchParams.get("vehicle")));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load daily driving" },
      { status: 500 },
    );
  }
}
