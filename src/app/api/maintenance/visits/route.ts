import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { maintenancePayload, openMaintenance, persistMaintenance } from "@/lib/maintenance-context";
import { createServiceVisit } from "@/lib/visit-actions";

const bodySchema = z.object({
  at: z.string().max(40).optional(),
  odometerMi: z.number().nullable().optional(),
  itemIds: z.array(z.string().max(40)).max(12).default([]),
  note: z.string().max(400).optional(),
});

export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the visit and try again." }, { status: 400 });
  }
  try {
    const ctx = await openMaintenance(new URL(request.url).searchParams.get("vehicle"));
    const created = createServiceVisit(
      ctx.state,
      {
        at: parsed.data.at,
        odometerMi: parsed.data.odometerMi,
        itemIds: parsed.data.itemIds,
        note: parsed.data.note ?? "",
      },
      ctx.now,
      ctx.vehicle?.odometerMi ?? null,
    );
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
    await persistMaintenance(created.state);
    return NextResponse.json(maintenancePayload(created.state, true, ctx), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the visit" },
      { status: 500 },
    );
  }
}
