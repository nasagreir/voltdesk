import { connection, NextResponse } from "next/server";
import { getReports } from "@/lib/vehicle-service";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "30");
  const allowed = [7, 14, 30, 90, 365, 0];
  const selected = allowed.includes(days) ? days : 30;
  try {
    return NextResponse.json(await getReports(selected, url.searchParams.get("vehicle")));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reports failed" },
      { status: 500 },
    );
  }
}
