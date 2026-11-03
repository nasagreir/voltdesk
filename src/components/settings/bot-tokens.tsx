"use client";

import { FormEvent, useEffect, useState } from "react";
import { GrokKeyCard } from "@/components/settings/grok-key-card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PublicBotToken } from "@/lib/types";

type TokenStatus = {
  configured: boolean;
  fromFile: boolean;
  fromEnvironment: boolean;
  tokens: PublicBotToken[];
  error?: string;
  token?: string;
};

function stamp(value: string) {
  if (!value) return "Saved earlier";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved earlier";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${formatted} CT`;
}

export function BotTokens() {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [name, setName] = useState("Grok bot");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "revoke" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const body = (await response.json()) as TokenStatus & {
        botApiConfigured?: boolean;
        botApiFromFile?: boolean;
        botApiFromEnvironment?: boolean;
        botTokens?: PublicBotToken[];
      };
      if (!response.ok) {
        setError(body.error ?? "Could not load tokens");
        setStatus({ configured: false, fromFile: false, fromEnvironment: false, tokens: [] });
        return;
      }
      setStatus({
        configured: Boolean(body.botApiConfigured),
        fromFile: Boolean(body.botApiFromFile),
        fromEnvironment: Boolean(body.botApiFromEnvironment),
        tokens: body.botTokens ?? [],
      });
    })();
  }, []);

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
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        setCopied(label);
        setError(null);
        return;
      }
    } catch {
      // Fall through. The LXC is often plain HTTP, where the clipboard API is blocked.
    }
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "0";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) {
        setCopied(label);
        setError(null);
        return;
      }
    } catch {
      // The token stays selected in the field.
    }
    setError("Could not copy. Select the token and copy it yourself.");
  }

  function apply(body: TokenStatus) {
    setStatus({
      configured: Boolean(body.configured),
      fromFile: Boolean(body.fromFile),
      fromEnvironment: Boolean(body.fromEnvironment),
      tokens: body.tokens ?? [],
    });
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy("generate");
    setError(null);
    setRevokeId(null);
    const response = await fetch("/api/bot/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = (await response.json()) as TokenStatus;
    setBusy(null);
    if (!response.ok || !body.token) {
      setError(body.error ?? "Could not generate a token.");
      return;
    }
    setFreshToken(body.token);
    setCopied(null);
    apply(body);
  }

  async function revoke(id: string) {
    setBusy("revoke");
    setError(null);
    const response = await fetch("/api/bot/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revoke: true, id }),
    });
    const body = (await response.json()) as TokenStatus;
    setBusy(null);
    setRevokeId(null);
    if (!response.ok) {
      setError(body.error ?? "Could not revoke the token.");
      return;
    }
    apply(body);
  }

  return (
    <div className="space-y-4">
      <SettingsNav />
      <div>
        <h1 className="font-heading text-2xl tracking-tight short:text-xl">Grok bot</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Generate a token, copy it, and paste it into the bot. Each token can read the car, a short brief, recent drives, and recent charges. It cannot wake, unlock, or start the car. The secret is shown only once.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!status && <p className="text-sm text-muted-foreground">Loading tokens…</p>}
      {status && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>New token</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={generate} className="grid gap-3">
                <label className="grid gap-1.5 text-sm">
                  <Label htmlFor="bot-token-name">Name</Label>
                  <Input
                    id="bot-token-name"
                    value={name}
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Grok bot"
                  />
                </label>
                <div>
                  <Button type="submit" disabled={busy !== null || status.tokens.length >= 12}>
                    {busy === "generate" ? "Generating…" : "Generate token"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {freshToken && (
            <Card>
              <CardHeader>
                <CardTitle>Copy this token</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-sm">
                  This is the only time VoltDesk shows the secret. Copy it into the bot before you leave this page.
                </p>
                <div className="flex flex-col gap-2 min-[420px]:flex-row">
                  <Input
                    readOnly
                    value={freshToken}
                    className="font-mono text-xs"
                    aria-label="New API token"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button type="button" className="shrink-0" onClick={() => void copy("token", freshToken)}>
                    {copied === "token" ? "Copied" : "Copy token"}
                  </Button>
                </div>
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium">Example</p>
                  <pre className="overflow-x-auto rounded-lg bg-muted px-2.5 py-2 font-mono text-xs break-all whitespace-pre-wrap">
                    {curl}
                  </pre>
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
          )}

          <Card>
            <CardHeader>
              <CardTitle>Saved tokens</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {status.tokens.length === 0 && (
                <p className="text-sm text-muted-foreground">No saved tokens yet.</p>
              )}
              {status.tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">{token.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {token.hint} · {stamp(token.createdAt)}
                    </p>
                  </div>
                  {revokeId === token.id ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void revoke(token.id)}
                      >
                        {busy === "revoke" ? "Revoking…" : "Revoke now"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setRevokeId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRevokeId(token.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
              {status.fromEnvironment && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-xs">VOLTDESK_API_TOKEN</span> in the environment is also accepted. Revoke does not remove that value.
                </p>
              )}
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Base URL</p>
                <p className="mt-1 font-mono text-xs break-all">{base}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>GET /api/v1/summary — one brief, plus the last 7 days</li>
                  <li>GET /api/v1/vehicle — current state</li>
                  <li>GET /api/v1/drives?days=14 — recent drives</li>
                  <li>GET /api/v1/charges?days=14 — recent charges</li>
                </ul>
              </div>
            </CardContent>
          </Card>
          <GrokKeyCard />
        </>
      )}
    </div>
  );
}
