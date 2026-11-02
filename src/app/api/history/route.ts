import { connection, NextResponse } from "next/server";
import { getHistory } from "@/lib/vehicle-service";
import type { HistoryRange } from "@/lib/types";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const range = url.searchParams.get("range");
  const allowed: HistoryRange[] = ["24h", "7d", "14d"];
  const selected = allowed.includes(range as HistoryRange) ? (range as HistoryRange) : "7d";
  try {
    return NextResponse.json(
      await getHistory(selected, url.searchParams.get("vehicle")),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History failed" },
      { status: 500 },
    );
  }
}
