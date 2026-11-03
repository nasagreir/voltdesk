import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { saveVehicleName } from "@/lib/appearance";
import { clearDashboardCache } from "@/lib/vehicle-service";

const bodySchema = z.object({
  name: z.string().max(40).nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name up to 40 characters." }, { status: 400 });
  }
  try {
    await saveVehicleName(decodeURIComponent(id), parsed.data.name);
    await clearDashboardCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the name" },
      { status: 400 },
    );
  }
}
