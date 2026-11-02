"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Geofence } from "@/lib/types";

const empty = {
  name: "",
  lat: "",
  lng: "",
  radiusM: "200",
  costPerKwh: "0.14",
  sessionFee: "0",
};

export function PlacesBoard() {
  const [fences, setFences] = useState<Geofence[]>([]);
  const [persisted, setPersisted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/geofences", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load places");
    setFences(body.fences ?? []);
    setPersisted(Boolean(body.persisted));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load places"))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save(next: Geofence[]) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/geofences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fences: next }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save places");
      setFences(body.fences);
      setPersisted(true);
      setNotice("Places saved. Charge cost uses the matching fence.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save places");
    } finally {
      setSaving(false);
    }
  }

  async function addPlace(event: FormEvent) {
    event.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const fence: Geofence = {
      id: `new-${crypto.randomUUID()}`,
      name: form.name.trim(),
      lat,
      lng,
      radiusM: Number(form.radiusM),
      costPerKwh: Number(form.costPerKwh),
      sessionFee: Number(form.sessionFee),
    };
    await save([...fences, fence]);
    setForm(empty);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading places…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Places</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Geofences name drives and set the price of a charge. Each place has its own dollars per kWh and an optional session fee.
          {persisted ? " These are saved on this server." : " These are the defaults until you save."}
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Places</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {fences.length === 0 ? (
        <p className="text-sm text-muted-foreground">No places yet. Add home so charges there get a cost.</p>
      ) : (
        <div className="grid gap-3">
          {fences.map((fence) => (
            <Card key={fence.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{fence.name}</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void save(fences.filter((item) => item.id !== fence.id))}
                >
                  Remove
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {fence.lat.toFixed(5)}, {fence.lng.toFixed(5)} · {Math.round(fence.radiusM)} m · ${fence.costPerKwh.toFixed(2)}/kWh
                {fence.sessionFee > 0 ? ` · $${fence.sessionFee.toFixed(2)} session` : ""}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Add a place</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void addPlace(event)}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="place-name">Name</Label>
              <Input id="place-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-lat">Latitude</Label>
              <Input id="place-lat" inputMode="decimal" value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-lng">Longitude</Label>
              <Input id="place-lng" inputMode="decimal" value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-radius">Radius (m)</Label>
              <Input id="place-radius" inputMode="decimal" value={form.radiusM} onChange={(event) => setForm({ ...form, radiusM: event.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-rate">$ / kWh</Label>
              <Input id="place-rate" inputMode="decimal" value={form.costPerKwh} onChange={(event) => setForm({ ...form, costPerKwh: event.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-fee">Session fee ($)</Label>
              <Input id="place-fee" inputMode="decimal" value={form.sessionFee} onChange={(event) => setForm({ ...form, sessionFee: event.target.value })} required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save place"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
