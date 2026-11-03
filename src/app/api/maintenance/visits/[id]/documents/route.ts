import { connection, NextResponse } from "next/server";
import { maintenancePayload, openMaintenance, persistMaintenance } from "@/lib/maintenance-context";
import { PaperlessError } from "@/lib/paperless";
import { attachDocument } from "@/lib/visit-actions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a PDF or image to upload." }, { status: 400 });
  }
  try {
    const ctx = await openMaintenance(new URL(request.url).searchParams.get("vehicle"));
    const attached = await attachDocument(
      ctx.state,
      id,
      { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
      ctx.paperless,
      ctx.now,
    );
    if ("error" in attached) return NextResponse.json({ error: attached.error }, { status: 400 });
    await persistMaintenance(attached.state);
    return NextResponse.json(maintenancePayload(attached.state, true, ctx), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof PaperlessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not store that document";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
