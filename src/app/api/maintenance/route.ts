import { connection, NextResponse } from "next/server";
import { z } from "zod";
import {
  isServiceId,
  parseOdometer,
  parseServiceDate,
  presentMaintenance,
  resolveMaintenance,
  type MaintenanceState,
} from "@/lib/maintenance";
import { readMaintenanceFile, writeMaintenanceFile } from "@/lib/maintenance-store";
import { getDashboard } from "@/lib/vehicle-service";

const bodySchema = z
  .object({
    saltedRoads: z.boolean().optional(),
    mark: z
      .object({
        id: z.string().max(40),
        at: z.string().max(40).optional(),
        odometerMi: z.number().nullable().optional(),
      })
      .optional(),
  })
  .refine((body) => body.saltedRoads !== undefined || body.mark !== undefined, {
    message: "Nothing to save.",
  });

async function context(vehicleId: string | null) {
  const dash = await getDashboard();
  const vehicle =
    dash.vehicles.find((item) => item.id === vehicleId) ?? dash.vehicles[0] ?? null;
  const now = new Date();
  const saved = await readMaintenanceFile();
  const odometerMi = vehicle?.odometerMi ?? 0;
  return { dash, vehicle, now, saved, odometerMi };
}

function present(
  state: MaintenanceState,
  persisted: boolean,
  ctx: Awaited<ReturnType<typeof context>>,
) {
  return presentMaintenance({
    state,
    persisted,
    now: ctx.now,
    odometerMi: ctx.odometerMi,
    model: ctx.vehicle?.model ?? "",
    vehicleName: ctx.vehicle?.name ?? null,
    distanceUnit: ctx.dash.units.distance,
  });
}

export async function GET(request: Request) {
  await connection();
  try {
    const vehicleId = new URL(request.url).searchParams.get("vehicle");
    const ctx = await context(vehicleId);
    const state = resolveMaintenance(ctx.saved, ctx.dash.mode, ctx.now, ctx.odometerMi);
    return NextResponse.json(present(state, ctx.saved != null, ctx), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Maintenance failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the service form." }, { status: 400 });
  }
  try {
    const vehicleId = new URL(request.url).searchParams.get("vehicle");
    const ctx = await context(vehicleId);
    let state = resolveMaintenance(ctx.saved, ctx.dash.mode, ctx.now, ctx.odometerMi);
    const body = parsed.data;
    if (body.saltedRoads !== undefined) state = { ...state, saltedRoads: body.saltedRoads };
    if (body.mark) {
      if (!isServiceId(body.mark.id)) {
        return NextResponse.json({ error: "That service item is not on the list." }, { status: 400 });
      }
      const dated = body.mark.at ? parseServiceDate(body.mark.at, ctx.now) : { at: ctx.now.toISOString() };
      if ("error" in dated) return NextResponse.json({ error: dated.error }, { status: 400 });
      let odometerMi = ctx.vehicle?.odometerMi ?? null;
      if (typeof body.mark.odometerMi === "number") {
        const miles = parseOdometer(body.mark.odometerMi);
        if ("error" in miles) return NextResponse.json({ error: miles.error }, { status: 400 });
        odometerMi = miles.odometerMi;
      }
      state = {
        ...state,
        records: { ...state.records, [body.mark.id]: { at: dated.at, odometerMi } },
      };
    }
    await writeMaintenanceFile(state);
    return NextResponse.json(present(state, true, ctx), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save maintenance" },
      { status: 500 },
    );
  }
}
