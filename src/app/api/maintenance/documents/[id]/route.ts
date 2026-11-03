import { connection, NextResponse } from "next/server";
import { maintenancePayload, openMaintenance, persistMaintenance } from "@/lib/maintenance-context";
import { downloadPaperlessDocument, PaperlessError } from "@/lib/paperless";
import { isDocumentId, readLocalDocument } from "@/lib/service-docs";
import { detachDocument, documentContentType, findDocument } from "@/lib/visit-actions";

function fileName(name: string) {
  return name.replace(/[\r\n"]/g, "").slice(0, 80) || "document";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  if (!isDocumentId(id)) return NextResponse.json({ error: "That document is not on a visit." }, { status: 404 });
  try {
    const ctx = await openMaintenance(null);
    const found = findDocument(ctx.state, id);
    if (!found || found.document.status !== "ready") {
      return NextResponse.json({ error: "That document is not ready to open." }, { status: 404 });
    }
    const headers = {
      "content-type": documentContentType(found.document),
      "content-disposition": `inline; filename="${fileName(found.document.name)}"`,
      "cache-control": "private, no-store",
    };
    if (found.document.source === "local") {
      const bytes = await readLocalDocument(found.document.id, found.document.ext);
      return new NextResponse(Buffer.from(bytes), { headers });
    }
    if (!ctx.paperless || found.document.paperlessId == null) {
      return NextResponse.json({ error: "Paperless is not connected." }, { status: 404 });
    }
    const file = await downloadPaperlessDocument(ctx.paperless, found.document.paperlessId);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: { ...headers, "content-type": file.contentType || headers["content-type"] },
    });
  } catch (error) {
    const message = error instanceof PaperlessError ? error.message : "Could not open that document.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  if (!isDocumentId(id)) return NextResponse.json({ error: "That document is not on a visit." }, { status: 404 });
  try {
    const ctx = await openMaintenance(null);
    const state = await detachDocument(ctx.state, id);
    if (!state) return NextResponse.json({ error: "That document is not on a visit." }, { status: 404 });
    await persistMaintenance(state);
    return NextResponse.json(maintenancePayload(state, true, ctx), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the document" },
      { status: 500 },
    );
  }
}
