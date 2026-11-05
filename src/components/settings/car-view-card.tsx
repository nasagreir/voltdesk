"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AppearanceFile, CarScene } from "@/lib/appearance";

export function CarViewCard() {
  const [scene, setScene] = useState<CarScene>("photo");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/appearance", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as AppearanceFile & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Could not load the car view");
          setScene(body.scene === "model" ? "model" : "photo");
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Could not load the car view");
        })
        .finally(() => setReady(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function choose(next: CarScene) {
    const previous = scene;
    setScene(next);
    setError(null);
    try {
      const response = await fetch("/api/appearance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scene: next }),
      });
      const body = (await response.json()) as AppearanceFile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save the car view");
      setScene(body.scene === "model" ? "model" : "photo");
    } catch (err) {
      setScene(previous);
      setError(err instanceof Error ? err.message : "Could not save the car view");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Car</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm">3D model</p>
            <p className="text-sm text-muted-foreground">
              The garage shows a detailed model of that Tesla. Drag it to turn it. Paint still follows the color on the garage. Off keeps the studio photo.
            </p>
          </div>
          <Switch
            checked={scene === "model"}
            disabled={!ready}
            aria-label="Show the car as a 3D model"
            onCheckedChange={(checked) => void choose(checked ? "model" : "photo")}
          />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
