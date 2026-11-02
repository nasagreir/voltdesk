import { connection, NextResponse } from "next/server";
import { getDrive } from "@/lib/vehicle-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const drive = await getDrive(decodeURIComponent(id));
  if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  return NextResponse.json(drive);
}
