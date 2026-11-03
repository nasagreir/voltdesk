"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MaintenancePayload } from "@/lib/types";

export function ServiceVisits({
  payload,
  onPayload,
}: {
  payload: MaintenancePayload;
  onPayload: (next: MaintenancePayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [miles, setMiles] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmVisit, setConfirmVisit] = useState<string | null>(null);
  const synced = useRef(false);

  useEffect(() => {
    if (!payload.paperless.configured || synced.current) return;
    synced.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/maintenance/sync", { method: "POST" });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "Could not refresh documents from Paperless.");
          return;
        }
        onPayload(body as MaintenancePayload);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onPayload, payload.paperless.configured]);

  async function send(url: string, init: RequestInit, busyId: string) {
    setBusy(busyId);
    setError(null);
    try {
      const response = await fetch(url, init);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save");
      onPayload(body as MaintenancePayload);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    await send("/api/maintenance/sync", { method: "POST" }, "sync");
  }

  async function createVisit() {
    const body: { at?: string; odometerMi?: number; itemIds: string[]; note: string } = {
      itemIds: items,
      note,
    };
    if (when.trim()) body.at = when.trim();
    if (miles.trim()) {
      const value = Number(miles);
      if (!Number.isFinite(value)) {
        setError("Odometer has to be a number of miles.");
        return;
      }
      body.odometerMi = value;
    }
    const saved = await send(
      "/api/maintenance/visits",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      "create",
    );
    if (!saved) return;
    setOpen(false);
    setWhen("");
    setMiles("");
    setNote("");
    setItems([]);
  }

  async function upload(visitId: string, list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    await send(`/api/maintenance/visits/${visitId}/documents`, { method: "POST", body: data }, visitId);
  }

  const storage = payload.paperless.configured
    ? `New files go to Paperless with the ${payload.paperless.tag} tag and a visit tag, vd-visit- plus the visit id. VoltDesk reads that visit tag back from Paperless.`
    : "Files stay on this VoltDesk until you add a Paperless URL and token on Connections. After that, new uploads are filed under your tag.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl tracking-tight">Service visits</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{storage}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {payload.paperless.configured && (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void refresh()}>
              {busy === "sync" ? "Checking…" : "Refresh from Paperless"}
            </Button>
          )}
          <Button type="button" variant={open ? "outline" : "default"} onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Log a visit"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {open && (
        <Card>
          <CardHeader>
            <CardTitle>New visit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid w-full gap-1.5 text-sm min-[560px]:w-44">
                <Label htmlFor="visit-date">Date</Label>
                <Input id="visit-date" type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
              </label>
              <label className="grid w-full gap-1.5 text-sm min-[560px]:w-44">
                <Label htmlFor="visit-miles">Miles</Label>
                <Input
                  id="visit-miles"
                  inputMode="decimal"
                  value={miles}
                  placeholder="Current odometer"
                  onChange={(event) => setMiles(event.target.value)}
                />
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Work done</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {payload.items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={items.includes(item.id)}
                      onChange={(event) =>
                        setItems((current) =>
                          event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.title}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1.5 text-sm">
              <Label htmlFor="visit-note">Note</Label>
              <Textarea
                id="visit-note"
                value={note}
                maxLength={400}
                placeholder="Shop, invoice number, what they found"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Leave the date and miles blank to use today and the current odometer. Checked items are marked done when
              this visit is the newest record for them.
            </p>
            <Button type="button" disabled={busy !== null} onClick={() => void createVisit()}>
              {busy === "create" ? "Saving…" : "Save visit"}
            </Button>
          </CardContent>
        </Card>
      )}

      {payload.visits.length === 0 && <p className="text-sm text-muted-foreground">No visits yet.</p>}

      {payload.visits.map((visit) => (
        <Card key={visit.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{visit.dateLabel}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {visit.odometerLabel}
                {visit.items.length > 0 ? ` · ${visit.items.join(", ")}` : ""}
              </p>
            </div>
            {confirmVisit === visit.id ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() => void send(`/api/maintenance/visits/${visit.id}`, { method: "DELETE" }, visit.id)}
                >
                  Remove
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmVisit(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmVisit(visit.id)}>
                Remove visit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {visit.note && <p className="text-sm">{visit.note}</p>}
            <p className="text-xs text-muted-foreground">
              Visit tag <span className="font-mono">{visit.tag}</span>
              {payload.paperless.configured ? ` · also tagged ${payload.paperless.tag}` : ""}
            </p>
            {visit.documents.length === 0 && (
              <p className="text-sm text-muted-foreground">No documents on this visit yet.</p>
            )}
            <ul className="space-y-2">
              {visit.documents.map((document) => (
                <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{document.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {document.status === "filing"
                        ? "Paperless is still filing this."
                        : document.status === "missing"
                          ? "No longer under this visit tag in Paperless."
                          : document.source === "paperless"
                            ? "In Paperless"
                            : "On this VoltDesk"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {document.status === "ready" && (
                      <a
                        className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-sm"
                        href={document.viewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    )}
                    {document.paperlessUrl && (
                      <a
                        className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-sm"
                        href={document.paperlessUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Paperless
                      </a>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void send(`/api/maintenance/documents/${document.id}`, { method: "DELETE" }, document.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="grid gap-1.5 text-sm">
              <Label htmlFor={`upload-${visit.id}`}>Add a PDF or image</Label>
              <Input
                id={`upload-${visit.id}`}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
                disabled={busy !== null}
                onChange={(event) => {
                  void upload(visit.id, event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
