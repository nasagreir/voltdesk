"use client";

import { FormEvent, useEffect, useState } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSettings, SourcePreference, TeslaRegion } from "@/lib/types";

export function SettingsForm() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [homeAssistantToken, setHomeAssistantToken] = useState("");
  const [teslaRefreshToken, setTeslaRefreshToken] = useState("");
  const [clearHomeAssistantToken, setClearHomeAssistantToken] = useState(false);
  const [clearTeslaRefreshToken, setClearTeslaRefreshToken] = useState(false);
  const [paperlessToken, setPaperlessToken] = useState("");
  const [clearPaperlessToken, setClearPaperlessToken] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Could not load settings");
        return;
      }
      setSettings(body as PublicSettings);
    })();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaved(false);
    setError(null);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...settings,
        homeAssistantToken,
        teslaRefreshToken,
        clearHomeAssistantToken,
        clearTeslaRefreshToken,
        paperlessToken,
        clearPaperlessToken,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Could not save");
      return;
    }
    setSettings(body as PublicSettings);
    setHomeAssistantToken("");
    setTeslaRefreshToken("");
    setClearHomeAssistantToken(false);
    setClearTeslaRefreshToken(false);
    setPaperlessToken("");
    setClearPaperlessToken(false);
    setSaved(true);
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        <SettingsNav />
        <p className="text-sm text-muted-foreground">{error ?? "Loading connections…"}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SettingsNav />
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Connections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Home Assistant is the same path OrbitDesk uses. A Tesla Fleet refresh token is optional and stays on this machine. Leave a token box blank to keep the one already saved.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <AlertDescription>Saved. The garage will use this on the next poll.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Preference">
            <select
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={settings.source}
              onChange={(event) =>
                setSettings({ ...settings, source: event.target.value as SourcePreference })
              }
            >
              <option value="auto">Auto — Tesla, then Home Assistant, then demo</option>
              <option value="tesla">Tesla Fleet API</option>
              <option value="home-assistant">Home Assistant</option>
              <option value="demo">Demo Model Y</option>
            </select>
          </Field>
          <Field label="Poll interval (seconds)">
            <Input
              type="number"
              min={15}
              max={3600}
              value={settings.pollIntervalSeconds}
              onChange={(event) =>
                setSettings({ ...settings, pollIntervalSeconds: Number(event.target.value) })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tesla Fleet API {settings.teslaConfigured ? "· saved" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Client id">
            <Input
              value={settings.teslaClientId}
              autoComplete="off"
              onChange={(event) => setSettings({ ...settings, teslaClientId: event.target.value })}
            />
          </Field>
          <Field label="Region">
            <select
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={settings.teslaRegion}
              onChange={(event) =>
                setSettings({ ...settings, teslaRegion: event.target.value as TeslaRegion })
              }
            >
              <option value="na">North America</option>
              <option value="eu">Europe</option>
              <option value="cn">China</option>
            </select>
          </Field>
          <Field label="Refresh token">
            <Input
              type="password"
              value={teslaRefreshToken}
              autoComplete="off"
              placeholder={settings.teslaConfigured ? "Saved — paste to replace" : "Paste refresh token"}
              onChange={(event) => setTeslaRefreshToken(event.target.value)}
            />
          </Field>
          <label className="flex items-end gap-2 pb-1 text-sm">
            <input
              type="checkbox"
              checked={clearTeslaRefreshToken}
              onChange={(event) => setClearTeslaRefreshToken(event.target.checked)}
            />
            Remove saved Tesla token
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Home Assistant {settings.homeAssistantConfigured ? "· saved" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field label="URL">
            <Input
              value={settings.homeAssistantUrl}
              placeholder="http://homeassistant.local:8123"
              onChange={(event) =>
                setSettings({ ...settings, homeAssistantUrl: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Long-lived token">
              <Input
                type="password"
                value={homeAssistantToken}
                autoComplete="off"
                placeholder={settings.homeAssistantConfigured ? "Saved — paste to replace" : "Token"}
                onChange={(event) => setHomeAssistantToken(event.target.value)}
              />
            </Field>
            <Field label="Entity prefix">
              <Input
                value={settings.teslaEntityPrefix}
                placeholder="model_y"
                onChange={(event) =>
                  setSettings({ ...settings, teslaEntityPrefix: event.target.value })
                }
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Prefix is the part before the metric. <span className="font-mono">sensor.model_y_battery</span> uses <span className="font-mono">model_y</span>. Leave it blank to discover Tesla battery entities.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearHomeAssistantToken}
              onChange={(event) => setClearHomeAssistantToken(event.target.checked)}
            />
            Remove saved Home Assistant token
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paperless {settings.paperlessConfigured ? "· connected" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Service invoices are uploaded here and tagged so VoltDesk can list them by visit. The token stays on this server.
          </p>
          <Field label="URL">
            <Input
              value={settings.paperlessUrl}
              placeholder="http://paperless.local:8000"
              autoComplete="off"
              onChange={(event) => setSettings({ ...settings, paperlessUrl: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="API token">
              <Input
                type="password"
                value={paperlessToken}
                autoComplete="off"
                placeholder={settings.paperlessFromFile ? "Saved — paste to replace" : "Token"}
                onChange={(event) => setPaperlessToken(event.target.value)}
              />
            </Field>
            <Field label="Tag">
              <Input
                value={settings.paperlessTag}
                maxLength={50}
                onChange={(event) => setSettings({ ...settings, paperlessTag: event.target.value })}
              />
            </Field>
          </div>
          {settings.paperlessFromEnvironment && (
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">PAPERLESS_TOKEN</span> in the environment is also used. Clearing the saved token leaves that value in place.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearPaperlessToken}
              onChange={(event) => setClearPaperlessToken(event.target.checked)}
            />
            Remove saved Paperless token
          </label>
        </CardContent>
      </Card>

      <Card id="home-charging" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Home charging</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Charges inside this circle use this electricity cost until you enter a real amount on that charge.
          </p>
          <Field label="Electricity rate (USD / kWh)">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={settings.electricityRateUsd}
              onChange={(event) =>
                setSettings({ ...settings, electricityRateUsd: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Home name">
            <Input
              value={settings.homeLabel}
              onChange={(event) => setSettings({ ...settings, homeLabel: event.target.value })}
            />
          </Field>
          <Field label="Home latitude">
            <Input
              value={settings.homeLat ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  homeLat: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Home longitude">
            <Input
              value={settings.homeLng ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  homeLng: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Home radius (meters)">
            <Input
              type="number"
              min={20}
              value={settings.homeRadiusM}
              onChange={(event) =>
                setSettings({ ...settings, homeRadiusM: Number(event.target.value) })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Distance">
            <select
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={settings.distanceUnit}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  distanceUnit: event.target.value as PublicSettings["distanceUnit"],
                })
              }
            >
              <option value="mi">Miles</option>
              <option value="km">Kilometers</option>
            </select>
          </Field>
          <Field label="Temperature">
            <select
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={settings.tempUnit}
              onChange={(event) =>
                setSettings({ ...settings, tempUnit: event.target.value as PublicSettings["tempUnit"] })
              }
            >
              <option value="F">Fahrenheit</option>
              <option value="C">Celsius</option>
            </select>
          </Field>
        </CardContent>
      </Card>

      <Button type="submit">Save connections</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
