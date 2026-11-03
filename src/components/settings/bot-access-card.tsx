"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { PublicSettings } from "@/lib/types";

type TokenBody = {
  token?: string;
  revoked?: boolean;
  configured?: boolean;
  fromFile?: boolean;
  fromEnvironment?: boolean;
  error?: string;
};

export function BotAccessCard({
  settings,
  onChange,
}: {
  settings: PublicSettings;
  onChange: (next: PublicSettings) => void;
}) {
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const base = origin ? `${origin}/api/v1` : "/api/v1";
  const shownToken = freshToken ?? "<token>";
  const curl = `curl -s -H "Authorization: Bearer ${shownToken}" ${base}/summary`;
  const tool = JSON.stringify(
    {
      name: "voltdesk_car",
      description:
        "Read the Tesla tracked by VoltDesk. Call summary for a short answer, or vehicle, drives, and charges for detail. Read-only: do not wake, unlock, or start the car.",
      base_url: base,
      authorization: `Bearer ${shownToken}`,
      requests: {
        summary: `GET ${base}/summary`,
        vehicle: `GET ${base}/vehicle`,
        drives: `GET ${base}/drives?days=14`,
        charges: `GET ${base}/charges?days=14`,
      },
    },
    null,
    2,
  );

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("Could not copy. Select the text and copy it yourself.");
    }
  }

  function apply(body: TokenBody) {
    onChange({
      ...settings,
      botApiConfigured: Boolean(body.configured),
      botApiFromFile: Boolean(body.fromFile),
      botApiFromEnvironment: Boolean(body.fromEnvironment),
    });
  }

  async function generate() {
    setBusy("generate");
    setError(null);
    setConfirmRevoke(false);
    const response = await fetch("/api/bot/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = (await response.json()) as TokenBody;
    setBusy(null);
    if (!response.ok || !body.token) {
      setError(body.error ?? "Could not generate a token.");
      return;
    }
    setFreshToken(body.token);
    apply(body);
  }

  async function revoke() {
    setBusy("revoke");
    setError(null);
    const response = await fetch("/api/bot/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revoke: true }),
    });
    const body = (await response.json()) as TokenBody;
    setBusy(null);
    setConfirmRevoke(false);
    if (!response.ok) {
      setError(body.error ?? "Could not revoke the token.");
      return;
    }
    setFreshToken(null);
    apply(body);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grok bot</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          A bearer token lets a Grok bot read this car: current state, a short brief, recent drives, and recent charges. The bot cannot wake, unlock, or start the car, and the token does not reveal Tesla or Home Assistant secrets.
        </p>
        {settings.botApiFromFile && !freshToken && (
          <p className="text-sm">
            A token is saved on this machine. It is not shown again. Generate a new one if you no longer have it. Generating replaces the saved token.
          </p>
        )}
        {settings.botApiFromEnvironment && (
          <p className="text-sm">
            <span className="font-mono text-xs">VOLTDESK_API_TOKEN</span> in the environment is also accepted. Revoke does not remove that value.
          </p>
        )}
        {!settings.botApiConfigured && (
          <p className="text-sm">No bot token yet. Generate one, then paste it into the bot as a bearer token.</p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void generate()} disabled={busy !== null}>
            {busy === "generate" ? "Generating…" : settings.botApiFromFile ? "Generate a new token" : "Generate token"}
          </Button>
          {settings.botApiFromFile && !confirmRevoke && (
            <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)} disabled={busy !== null}>
              Revoke saved token
            </Button>
          )}
          {confirmRevoke && (
            <>
              <Button type="button" variant="destructive" onClick={() => void revoke()} disabled={busy !== null}>
                {busy === "revoke" ? "Revoking…" : "Revoke now"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmRevoke(false)} disabled={busy !== null}>
                Cancel
              </Button>
            </>
          )}
        </div>
        {freshToken && (
          <div className="grid gap-1.5">
            <p className="text-sm">Copy this token now. VoltDesk will not show it again after you leave this page.</p>
            <p className="rounded-lg bg-muted px-2.5 py-2 font-mono text-xs break-all">{freshToken}</p>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy("token", freshToken)}>
                {copied === "token" ? "Copied" : "Copy token"}
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-1.5 text-sm">
          <p className="font-medium">Base URL</p>
          <p className="font-mono text-xs break-all">{base}</p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>GET /api/v1 — what the bot can call</li>
            <li>GET /api/v1/summary — one brief, plus the last 7 days</li>
            <li>GET /api/v1/vehicle — current state</li>
            <li>GET /api/v1/drives?days=14 — recent drives</li>
            <li>GET /api/v1/charges?days=14 — recent charges</li>
          </ul>
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Example</p>
          <pre className="overflow-x-auto rounded-lg bg-muted px-2.5 py-2 font-mono text-xs break-all whitespace-pre-wrap">{curl}</pre>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy("curl", curl)}>
              {copied === "curl" ? "Copied" : "Copy curl"}
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Tool description</p>
          <Textarea readOnly value={tool} className="min-h-40 font-mono text-xs" />
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy("tool", tool)}>
              {copied === "tool" ? "Copied" : "Copy tool description"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
