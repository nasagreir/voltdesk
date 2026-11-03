"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KeyStatus = {
  grokConfigured: boolean;
  grokFromFile: boolean;
  grokFromEnvironment: boolean;
};

export function GrokKeyCard() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "Could not load the xAI key status");
          return;
        }
        setStatus({
          grokConfigured: Boolean(body.grokConfigured),
          grokFromFile: Boolean(body.grokFromFile),
          grokFromEnvironment: Boolean(body.grokFromEnvironment),
        });
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setSaved(null);
    const response = await fetch("/api/grok/key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const body = await response.json();
    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "Could not save the key");
      return;
    }
    setApiKey("");
    setStatus(body as KeyStatus);
    setSaved("Saved. The garage can ask Grok for suggestions.");
  }

  async function clear() {
    setBusy("clear");
    setError(null);
    setSaved(null);
    const response = await fetch("/api/grok/key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    const body = await response.json();
    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "Could not clear the key");
      return;
    }
    setStatus(body as KeyStatus);
    setSaved(body.grokFromEnvironment ? "Cleared the saved key. The environment key is still in use." : "Cleared the saved key.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>xAI key</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          This key lets VoltDesk ask Grok for a few suggestions. It is not the bot token above. The key stays on this
          server and is never sent to the browser again.
        </p>
        {!status && <p className="text-sm text-muted-foreground">Checking for a saved key…</p>}
        {status?.grokFromFile && <p className="text-sm">A key is saved on this VoltDesk.</p>}
        {status?.grokFromEnvironment && (
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">XAI_API_KEY</span> or{" "}
            <span className="font-mono text-xs">GROK_API_KEY</span> in the environment is also used. Clearing the saved
            key leaves that value in place.
          </p>
        )}
        {status && !status.grokConfigured && (
          <p className="text-sm text-muted-foreground">No key yet. Suggestions on the garage come from the car.</p>
        )}
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <Label htmlFor="xai-key">xAI API key</Label>
            <Input
              id="xai-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              maxLength={200}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="xai-…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy !== null || apiKey.trim().length < 20}>
              {busy === "save" ? "Saving…" : "Save key"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null || !status?.grokFromFile}
              onClick={() => void clear()}
            >
              {busy === "clear" ? "Clearing…" : "Clear saved key"}
            </Button>
          </div>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
      </CardContent>
    </Card>
  );
}
