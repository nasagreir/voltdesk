import { connection, NextResponse } from "next/server";
import { getDashboard } from "@/lib/vehicle-service";

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await getDashboard());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dashboard failed" },
      { status: 500 },
    );
  }
}
