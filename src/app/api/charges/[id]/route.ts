import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { setChargePrice } from "@/lib/charge-prices";
import { clearDashboardCache, getCharge } from "@/lib/vehicle-service";

const bodySchema = z.object({
  amount: z.number().min(0).max(5000).nullable(),
});

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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const decoded = decodeURIComponent(id);
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a dollar amount." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a dollar amount from 0 to 5000, or clear it." }, { status: 400 });
  }
  const existing = await getCharge(decoded);
  if (!existing) return NextResponse.json({ error: "Charge not found" }, { status: 404 });
  await setChargePrice(decoded, parsed.data.amount);
  await clearDashboardCache();
  const charge = await getCharge(decoded);
  if (!charge) return NextResponse.json({ error: "Charge not found" }, { status: 404 });
  return NextResponse.json(charge);
}
