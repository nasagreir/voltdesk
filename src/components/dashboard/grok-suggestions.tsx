"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SuggestionsPayload } from "@/lib/types";

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

  return (
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
            {payload.note && (
              <p className="text-sm text-muted-foreground">
                {payload.note}{" "}
                {!payload.grokConfigured && (
                  <Link href="/settings/bot" className="text-foreground underline underline-offset-2">
                    Grok bot
                  </Link>
                )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
