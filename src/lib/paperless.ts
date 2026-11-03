import { visitTag, type DocumentExt } from "@/lib/service-docs";

export interface PaperlessConfig {
  url: string;
  token: string;
  tag: string;
}

export class PaperlessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperlessError";
  }
}

function api(config: PaperlessConfig, pathname: string) {
  return `${config.url.replace(/\/$/, "")}/api${pathname}`;
}

async function paperlessFetch(config: PaperlessConfig, pathname: string, init: RequestInit = {}, timeoutMs = 8000) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Token ${config.token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(api(config, pathname), { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PaperlessError("Paperless took too long to answer.");
    }
    throw new PaperlessError("Could not reach Paperless. Check the URL on Connections.");
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 180);
  if (response.status === 401 || response.status === 403) return "Paperless refused the token. Check it on Connections.";
  return clean || `Paperless responded ${response.status}.`;
}

export function parseTaskId(body: unknown): string | null {
  if (typeof body === "string" && /^[0-9a-f-]{16,80}$/i.test(body.trim())) return body.trim();
  if (body && typeof body === "object") {
    const taskId = (body as { task_id?: unknown }).task_id;
    if (typeof taskId === "string" && taskId.trim()) return taskId.trim();
  }
  return null;
}

export function parseDocumentId(task: unknown): number | null {
  if (!task || typeof task !== "object") return null;
  const related = (task as { related_document?: unknown }).related_document;
  if (typeof related === "number" && Number.isFinite(related)) return related;
  if (typeof related === "string" && /^\d+$/.test(related)) return Number(related);
  const result = (task as { result?: unknown }).result;
  if (typeof result === "string") {
    const match = /document id (\d+)/i.exec(result);
    if (match) return Number(match[1]);
  }
  return null;
}

interface TagRecord {
  id: number;
  name: string;
}

async function ensureTag(config: PaperlessConfig, name: string, parent?: number): Promise<number> {
  const listed = await paperlessFetch(
    config,
    `/tags/?name__iexact=${encodeURIComponent(name)}&page_size=20`,
  );
  if (!listed.ok) throw new PaperlessError(await readError(listed));
  const body = (await listed.json()) as { results?: TagRecord[] };
  const found = (body.results ?? []).find((tag) => tag.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = await paperlessFetch(config, "/tags/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      color: parent == null ? "#e31937" : "#5c6b7a",
      matching_algorithm: 0,
      is_inbox_tag: false,
      ...(parent == null ? {} : { parent }),
    }),
  });
  if (!created.ok) throw new PaperlessError(await readError(created));
  const tag = (await created.json()) as { id?: number };
  if (typeof tag.id !== "number") throw new PaperlessError("Paperless did not return a tag id.");
  return tag.id;
}

export async function uploadServiceDocument(
  config: PaperlessConfig,
  input: { visitId: string; filename: string; bytes: Uint8Array; ext: DocumentExt; title: string; created: string },
): Promise<{ taskId: string | null; paperlessId: number | null }> {
  const baseTag = await ensureTag(config, config.tag);
  const specific = await ensureTag(config, visitTag(input.visitId), baseTag);
  const form = new FormData();
  form.set("title", input.title);
  form.set("created", input.created);
  form.append("tags", String(baseTag));
  form.append("tags", String(specific));
  form.set("document", new Blob([Buffer.from(input.bytes)], { type: input.ext === "pdf" ? "application/pdf" : `image/${input.ext === "jpg" ? "jpeg" : input.ext}` }), input.filename);
  const posted = await paperlessFetch(config, "/documents/post_document/", { method: "POST", body: form }, 20000);
  if (!posted.ok) throw new PaperlessError(await readError(posted));
  const payload = await posted.json().catch(() => null);
  const taskId = parseTaskId(payload);
  if (!taskId) return { taskId: null, paperlessId: null };
  const paperlessId = await waitForDocument(config, taskId);
  return { taskId, paperlessId };
}

export async function taskDocumentId(config: PaperlessConfig, taskId: string): Promise<number | null> {
  const response = await paperlessFetch(config, `/tasks/?task_id=${encodeURIComponent(taskId)}&page_size=5`);
  if (!response.ok) return null;
  const body = (await response.json()) as { results?: Array<{ status?: string; result?: string; related_document?: unknown }> };
  const task = body.results?.[0];
  if (!task) return null;
  if (task.status === "FAILURE") {
    const detail = typeof task.result === "string" ? task.result.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    throw new PaperlessError(detail || "Paperless could not file that document.");
  }
  return parseDocumentId(task);
}

export async function waitForDocument(config: PaperlessConfig, taskId: string): Promise<number | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    const id = await taskDocumentId(config, taskId);
    if (id != null) return id;
  }
  return null;
}

export async function documentsForTag(config: PaperlessConfig, tag: string): Promise<Array<{ id: number; title: string }>> {
  const response = await paperlessFetch(
    config,
    `/documents/?tags__name__iexact=${encodeURIComponent(tag)}&page_size=50`,
  );
  if (!response.ok) throw new PaperlessError(await readError(response));
  const body = (await response.json()) as { results?: Array<{ id?: number; title?: string }> };
  return (body.results ?? [])
    .filter((doc) => typeof doc.id === "number")
    .map((doc) => ({ id: doc.id as number, title: typeof doc.title === "string" ? doc.title : `Document ${doc.id}` }));
}

export async function downloadPaperlessDocument(
  config: PaperlessConfig,
  id: number,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await paperlessFetch(config, `/documents/${id}/download/`, {}, 20000);
  if (response.status === 404) throw new PaperlessError("That document is no longer in Paperless.");
  if (!response.ok) throw new PaperlessError(await readError(response));
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  return { bytes, contentType };
}
