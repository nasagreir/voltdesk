import { promises as fs } from "node:fs";
import path from "node:path";
import { withActor } from "@/lib/auth/actor";
import { activeDataDir } from "@/lib/auth/scope";
import type { ServiceId } from "@/lib/maintenance";

export const DEFAULT_PAPERLESS_TAG = "VoltDesk";
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_VISIT = 8;
export const MAX_VISITS = 40;

export type DocumentExt = "pdf" | "png" | "jpg" | "webp";
export type DocumentStatus = "ready" | "filing" | "missing";

export interface StoredDocument {
  id: string;
  name: string;
  bytes: number;
  ext: DocumentExt;
  addedAt: string;
  source: "paperless" | "local";
  paperlessId: number | null;
  taskId: string | null;
  status: DocumentStatus;
}

export interface ServiceVisit {
  id: string;
  at: string;
  odometerMi: number | null;
  itemIds: ServiceId[];
  note: string;
  documents: StoredDocument[];
}

const VISIT_ID = /^[a-z0-9]{8}$/;
const DOC_ID = /^[a-f0-9]{12}$/;

export function isVisitId(value: string): boolean {
  return VISIT_ID.test(value);
}

export function isDocumentId(value: string): boolean {
  return DOC_ID.test(value);
}

export function normalizePaperlessTag(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 50);
  if (!cleaned || /[\\/<>]/.test(cleaned)) return DEFAULT_PAPERLESS_TAG;
  return cleaned;
}

export function visitTag(visitId: string): string {
  return `vd-visit-${visitId}`;
}

export function cleanPaperlessUrl(value: string): string | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: "Paperless URL is not valid." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Paperless URL has to start with http:// or https://." };
  }
  if (url.username || url.password) {
    return { error: "Put the API token in the token field, not in the URL." };
  }
  const pathname = url.pathname.replace(/\/$/, "");
  return `${url.origin}${pathname}`;
}

export function documentExtension(filename: string, mime: string): DocumentExt | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (lower.endsWith(".png") || mime === "image/png") return "png";
  if (lower.endsWith(".webp") || mime === "image/webp") return "webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mime === "image/jpeg") return "jpg";
  return null;
}

export function contentTypeFor(ext: DocumentExt): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export function safeDocumentName(filename: string, ext: DocumentExt): string {
  const base = path.basename(filename).replace(/[\r\n"]/g, "").trim().slice(0, 80);
  if (!base || base === "." || base === "..") return `service-document.${ext}`;
  return base;
}

export function localDocumentPath(id: string, ext: DocumentExt): string {
  if (!isDocumentId(id)) throw new Error("Bad document id");
  return path.join(activeDataDir(), "service-files", `${id}.${ext}`);
}

export async function writeLocalDocument(id: string, ext: DocumentExt, bytes: Uint8Array) {
  return withActor(() => writeLocalDocumentNow(id, ext, bytes));
}

async function writeLocalDocumentNow(id: string, ext: DocumentExt, bytes: Uint8Array) {
  const file = localDocumentPath(id, ext);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, bytes, { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function readLocalDocument(id: string, ext: DocumentExt): Promise<Uint8Array> {
  return withActor(async () => new Uint8Array(await fs.readFile(localDocumentPath(id, ext))));
}

export async function removeLocalDocument(id: string, ext: DocumentExt) {
  await withActor(() => fs.rm(localDocumentPath(id, ext), { force: true }));
}

export interface RemotePaperlessDocument {
  id: number;
  title: string;
}

/** Fold Paperless documents that carry this visit's tag into the stored list. */
export function mergeTaggedDocuments(documents: StoredDocument[], remote: RemotePaperlessDocument[], now: Date): StoredDocument[] {
  const byPaperless = new Map(
    documents.filter((doc) => doc.paperlessId != null).map((doc) => [doc.paperlessId as number, doc]),
  );
  const seen = new Set<number>();
  const next = documents.map((doc) => ({ ...doc }));
  for (const item of remote) {
    seen.add(item.id);
    const existing = byPaperless.get(item.id);
    if (existing) {
      const slot = next.find((doc) => doc.paperlessId === item.id);
      if (!slot) continue;
      slot.name = item.title.slice(0, 80) || slot.name;
      slot.status = "ready";
      slot.taskId = null;
      continue;
    }
    const title = item.title.trim().slice(0, 80) || `Paperless ${item.id}`;
    next.push({
      id: item.id.toString(16).padStart(12, "0").slice(-12),
      name: title,
      bytes: 0,
      ext: documentExtension(title, "") ?? "pdf",
      addedAt: now.toISOString(),
      source: "paperless",
      paperlessId: item.id,
      taskId: null,
      status: "ready",
    });
  }
  return next.map((doc) => {
    if (doc.source === "paperless" && doc.paperlessId != null && !seen.has(doc.paperlessId) && doc.status !== "filing") {
      return { ...doc, status: "missing" as const };
    }
    return doc;
  });
}
