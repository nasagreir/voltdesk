import { connection, NextResponse } from "next/server";
import { maintenancePayload, openMaintenance, persistMaintenance } from "@/lib/maintenance-context";
import { PaperlessError } from "@/lib/paperless";
import { syncPaperlessVisits } from "@/lib/visit-actions";

export async function POST() {
  await connection();
  try {
    const ctx = await openMaintenance(null);
    if (!ctx.paperless) {
      return NextResponse.json(
        { error: "Add a Paperless URL and token on Connections before refreshing tags." },
        { status: 400 },
      );
    }
    const state = await syncPaperlessVisits(ctx.state, ctx.paperless, ctx.now);
    await persistMaintenance(state);
    return NextResponse.json(maintenancePayload(state, true, ctx), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof PaperlessError ? error.message : "Could not refresh documents from Paperless.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
