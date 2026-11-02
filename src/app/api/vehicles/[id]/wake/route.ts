import { connection, NextResponse } from "next/server";
import { wakeVehicle } from "@/lib/vehicle-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  try {
    return NextResponse.json(await wakeVehicle(decodeURIComponent(id)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wake failed" },
      { status: 400 },
    );
  }
}
