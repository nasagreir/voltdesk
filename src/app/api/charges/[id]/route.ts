import { connection, NextResponse } from "next/server";
import { getCharge } from "@/lib/vehicle-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const charge = await getCharge(decodeURIComponent(id));
  if (!charge) return NextResponse.json({ error: "Charge not found" }, { status: 404 });
  return NextResponse.json(charge);
}
