import { randomBytes } from "node:crypto";
import {
  isServiceId,
  parseOdometer,
  parseServiceDate,
  withVisit,
  withoutVisit,
  type MaintenanceState,
} from "@/lib/maintenance";
import {
  documentsForTag,
  taskDocumentId,
  uploadServiceDocument,
  type PaperlessConfig,
} from "@/lib/paperless";
import {
  contentTypeFor,
  documentExtension,
  isDocumentId,
  isVisitId,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_VISIT,
  MAX_VISITS,
  mergeTaggedDocuments,
  removeLocalDocument,
  safeDocumentName,
  visitTag,
  writeLocalDocument,
  type ServiceVisit,
  type StoredDocument,
} from "@/lib/service-docs";
import { chicagoYMD } from "@/lib/time";

export function findDocument(state: MaintenanceState, documentId: string) {
  for (const visit of state.visits) {
    const document = visit.documents.find((item) => item.id === documentId);
    if (document) return { visit, document };
  }
  return null;
}

function replaceVisit(state: MaintenanceState, visit: ServiceVisit): MaintenanceState {
  return { ...state, visits: state.visits.map((item) => (item.id === visit.id ? visit : item)) };
}

export function createServiceVisit(
  state: MaintenanceState,
  input: { at?: string; odometerMi?: number | null; itemIds: string[]; note: string },
  now: Date,
  currentOdometer: number | null,
): { state: MaintenanceState } | { error: string } {
  if (state.visits.length >= MAX_VISITS) return { error: "The visit list is full. Remove an older visit first." };
  const dated = input.at ? parseServiceDate(input.at, now) : { at: now.toISOString() };
  if ("error" in dated) return dated;
  let odometerMi = currentOdometer;
  if (typeof input.odometerMi === "number") {
    const miles = parseOdometer(input.odometerMi);
    if ("error" in miles) return miles;
    odometerMi = miles.odometerMi;
  }
  const itemIds = [...new Set(input.itemIds.filter(isServiceId))];
  const id = randomBytes(4).toString("hex");
  const visit: ServiceVisit = {
    id,
    at: dated.at,
    odometerMi,
    itemIds,
    note: input.note.trim().slice(0, 400),
    documents: [],
  };
  return { state: withVisit(state, visit) };
}

export async function removeServiceVisit(state: MaintenanceState, visitId: string) {
  const visit = state.visits.find((item) => item.id === visitId);
  if (!visit) return null;
  for (const document of visit.documents) {
    if (document.source === "local") await removeLocalDocument(document.id, document.ext).catch(() => undefined);
  }
  return withoutVisit(state, visitId);
}

export async function attachDocument(
  state: MaintenanceState,
  visitId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  paperless: PaperlessConfig | null,
  now: Date,
): Promise<{ state: MaintenanceState } | { error: string }> {
  if (!isVisitId(visitId)) return { error: "That visit is not on the list." };
  const visit = state.visits.find((item) => item.id === visitId);
  if (!visit) return { error: "That visit is not on the list." };
  if (visit.documents.length >= MAX_DOCUMENTS_PER_VISIT) {
    return { error: "This visit already has 8 documents." };
  }
  if (file.bytes.byteLength === 0) return { error: "That file is empty." };
  if (file.bytes.byteLength > MAX_DOCUMENT_BYTES) return { error: "Keep each file under 15 MB." };
  const ext = documentExtension(file.name, file.type);
  if (!ext) return { error: "Use a PDF, PNG, JPEG, or WebP." };
  const name = safeDocumentName(file.name, ext);
  const id = randomBytes(6).toString("hex");
  const day = chicagoYMD(now);
  const created = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
  let document: StoredDocument;
  if (paperless) {
    const uploaded = await uploadServiceDocument(paperless, {
      visitId,
      filename: name,
      bytes: file.bytes,
      ext,
      title: name,
      created,
    });
    document = {
      id,
      name,
      bytes: file.bytes.byteLength,
      ext,
      addedAt: now.toISOString(),
      source: "paperless",
      paperlessId: uploaded.paperlessId,
      taskId: uploaded.paperlessId == null ? uploaded.taskId : null,
      status: uploaded.paperlessId == null ? "filing" : "ready",
    };
  } else {
    await writeLocalDocument(id, ext, file.bytes);
    document = {
      id,
      name,
      bytes: file.bytes.byteLength,
      ext,
      addedAt: now.toISOString(),
      source: "local",
      paperlessId: null,
      taskId: null,
      status: "ready",
    };
  }
  return { state: replaceVisit(state, { ...visit, documents: [...visit.documents, document] }) };
}

export async function detachDocument(state: MaintenanceState, documentId: string) {
  const found = findDocument(state, documentId);
  if (!found) return null;
  if (found.document.source === "local") {
    await removeLocalDocument(found.document.id, found.document.ext).catch(() => undefined);
  }
  const visit = {
    ...found.visit,
    documents: found.visit.documents.filter((item) => item.id !== documentId),
  };
  return replaceVisit(state, visit);
}

export async function syncPaperlessVisits(
  state: MaintenanceState,
  paperless: PaperlessConfig | null,
  now: Date,
): Promise<MaintenanceState> {
  if (!paperless) return state;
  let visits = state.visits;
  for (const visit of state.visits) {
    const remote = await documentsForTag(paperless, visitTag(visit.id));
    let documents = mergeTaggedDocuments(visit.documents, remote, now);
    documents = await Promise.all(
      documents.map(async (document) => {
        if (document.status !== "filing" || !document.taskId) return document;
        const paperlessId = await taskDocumentId(paperless, document.taskId);
        if (paperlessId == null) return document;
        return { ...document, paperlessId, taskId: null, status: "ready" as const };
      }),
    );
    visits = visits.map((item) => (item.id === visit.id ? { ...item, documents } : item));
  }
  return { ...state, visits };
}

export function documentContentType(document: StoredDocument) {
  return contentTypeFor(document.ext);
}

export function assertDocumentId(value: string) {
  if (!isDocumentId(value)) throw new Error("Bad document id");
}
