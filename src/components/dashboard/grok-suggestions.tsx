"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SuggestionItem, SuggestionsPayload } from "@/lib/types";

function Note({ payload, text }: { payload: SuggestionsPayload; text: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {text}{" "}
      {!payload.grokConfigured && (
        <Link href="/settings/bot" className="text-foreground underline underline-offset-2">
          Grok bot
        </Link>
      )}
    </p>
  );
}

function WarningList({ items }: { items: SuggestionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing stands out on this car.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.title} className="border-l-2 border-amber-500/80 pl-3">
          <p className="font-medium">{item.title}</p>
          <p className="text-sm text-muted-foreground">{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function GrokSuggestions() {
  const [payload, setPayload] = useState<SuggestionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/suggestions", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load suggestions");
      setPayload(body as SuggestionsPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load suggestions");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const title = payload?.source === "grok" ? "From Grok" : "Suggestions";
  const warningTitle = payload?.warningSource === "grok" ? "Grok warnings" : "Warnings";
  const warnings = payload?.warnings ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{payload ? warningTitle : "Warnings"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!payload && !error && <p className="text-sm text-muted-foreground">Reading the car…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {payload && (
            <>
              <WarningList items={warnings} />
              {payload.warningNote && <Note payload={payload} text={payload.warningNote} />}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!payload && !error && <p className="text-sm text-muted-foreground">Reading suggestions…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {payload && (
            <>
              <ul className="space-y-3">
                {payload.items.map((item) => (
                  <li key={item.title}>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </li>
                ))}
              </ul>
              {payload.note && <Note payload={payload} text={payload.note} />}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
