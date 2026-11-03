import { connection, NextResponse } from "next/server";
import { maintenancePayload, openMaintenance, persistMaintenance } from "@/lib/maintenance-context";
import { isVisitId } from "@/lib/service-docs";
import { removeServiceVisit } from "@/lib/visit-actions";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  if (!isVisitId(id)) return NextResponse.json({ error: "That visit is not on the list." }, { status: 404 });
  try {
    const ctx = await openMaintenance(new URL(request.url).searchParams.get("vehicle"));
    const state = await removeServiceVisit(ctx.state, id);
    if (!state) return NextResponse.json({ error: "That visit is not on the list." }, { status: 404 });
    await persistMaintenance(state);
    return NextResponse.json(maintenancePayload(state, true, ctx), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the visit" },
      { status: 500 },
    );
  }
}
