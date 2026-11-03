import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { parseDocumentId, parseTaskId, uploadServiceDocument } from "./paperless";
import {
  cleanPaperlessUrl,
  mergeTaggedDocuments,
  normalizePaperlessTag,
  visitTag,
  type StoredDocument,
} from "./service-docs";

describe("paperless tags", () => {
  it("keeps a readable tag and builds a visit tag", () => {
    assert.equal(normalizePaperlessTag("  Tesla service  "), "Tesla service");
    assert.equal(normalizePaperlessTag("bad/tag"), "VoltDesk");
    assert.equal(normalizePaperlessTag(""), "VoltDesk");
    assert.equal(visitTag("demo0001"), "vd-visit-demo0001");
    assert.equal(cleanPaperlessUrl("http://paperless.local:8000/"), "http://paperless.local:8000");
    assert.equal("error" in (cleanPaperlessUrl("http://user:pw@paperless.local") as { error: string }), true);
  });

  it("adds documents that Paperless already tagged for the visit", () => {
    const existing: StoredDocument = {
      id: "aaaaaaaaaaaa",
      name: "invoice.pdf",
      bytes: 10,
      ext: "pdf",
      addedAt: "2026-11-01T00:00:00.000Z",
      source: "paperless",
      paperlessId: 7,
      taskId: null,
      status: "ready",
    };
    const merged = mergeTaggedDocuments(
      existing ? [existing] : [],
      [
        { id: 7, title: "Brake invoice" },
        { id: 8, title: "Alignment.pdf" },
      ],
      new Date("2026-11-02T00:00:00.000Z"),
    );
    assert.equal(merged.find((doc) => doc.paperlessId === 7)?.name, "Brake invoice");
    assert.equal(merged.some((doc) => doc.paperlessId === 8), true);
    const missing = mergeTaggedDocuments(merged, [{ id: 8, title: "Alignment.pdf" }], new Date());
    assert.equal(missing.find((doc) => doc.paperlessId === 7)?.status, "missing");
  });
});

describe("paperless upload", () => {
  it("reads a task id and the document id Paperless reports later", () => {
    assert.equal(parseTaskId("6f0b6b6e-1c2a-4e3a-9d11-0c0ffee00001"), "6f0b6b6e-1c2a-4e3a-9d11-0c0ffee00001");
    assert.equal(parseDocumentId({ status: "SUCCESS", result: "Success. New document id 42 created" }), 42);
    assert.equal(parseDocumentId({ related_document: "18" }), 18);
  });

  it("posts the file with the base tag and the visit tag", async () => {
    const seen: { authorization: string; body: string } = { authorization: "", body: "" };
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(chunk as Buffer));
      request.on("end", () => {
        const url = request.url ?? "";
        if (url.startsWith("/api/tags/") && request.method === "GET") {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ results: [] }));
          return;
        }
        if (url === "/api/tags/" && request.method === "POST") {
          const name = JSON.parse(Buffer.concat(chunks).toString()).name as string;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ id: name === "VoltDesk" ? 3 : 9 }));
          return;
        }
        if (url === "/api/documents/post_document/" && request.method === "POST") {
          seen.authorization = request.headers.authorization ?? "";
          seen.body = Buffer.concat(chunks).toString("latin1");
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify("6f0b6b6e-1c2a-4e3a-9d11-0c0ffee00001"));
          return;
        }
        if (url.startsWith("/api/tasks/")) {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ results: [{ status: "SUCCESS", related_document: 15 }] }));
          return;
        }
        response.statusCode = 404;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const result = await uploadServiceDocument(
        { url: `http://127.0.0.1:${address.port}`, token: "secret-token", tag: "VoltDesk" },
        {
          visitId: "demo0001",
          filename: "invoice.pdf",
          bytes: new Uint8Array([1, 2, 3]),
          ext: "pdf",
          title: "invoice.pdf",
          created: "2026-11-02",
        },
      );
      assert.equal(seen.authorization, "Token secret-token");
      assert.match(seen.body, /name="tags"\r\n\r\n3/);
      assert.match(seen.body, /name="tags"\r\n\r\n9/);
      assert.match(seen.body, /invoice\.pdf/);
      assert.equal(result.paperlessId, 15);
      assert.equal(seen.body.includes("secret-token"), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});