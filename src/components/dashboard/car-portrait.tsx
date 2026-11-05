"use client";

import { useEffect, useState } from "react";
import { CarStage } from "@/components/dashboard/car-stage";
import { Button } from "@/components/ui/button";
import type { AppearanceFile } from "@/lib/appearance";
import {
  CAR_MODELS,
  carPhotoSrc,
  colorsFor,
  matchColor,
  modelById,
  paintById,
  resolvePaint,
  type ColorId,
  type ModelId,
} from "@/lib/car-photos";

const EMPTY: AppearanceFile = { colors: {}, models: {}, names: {}, scene: "photo" };

export function CarPortrait({
  vehicleId,
  model,
  trim,
  reportedColor,
}: {
  vehicleId: string;
  model: string;
  trim: string;
  reportedColor: string;
}) {
  const [file, setFile] = useState<AppearanceFile>(EMPTY);
  const [ready, setReady] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/appearance", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as AppearanceFile & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Could not load paint choices");
          setFile({
            colors: body.colors ?? {},
            models: body.models ?? {},
            names: body.names ?? {},
            scene: body.scene === "model" ? "model" : "photo",
          });
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Could not load paint choices");
        })
        .finally(() => setReady(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const resolved = resolvePaint({
    modelText: `${model} ${trim}`,
    reportedColor,
    savedModel: file.models[vehicleId],
    savedColor: file.colors[vehicleId],
  });
  const paints = resolved.modelId ? colorsFor(resolved.modelId) : [];
  const paint = resolved.colorId ? paintById(resolved.colorId) : null;
  const paintNote =
    resolved.modelId === "cybertruck" && paint && paint.id !== "stainless"
      ? "Wrap"
      : paint?.note;
  const modelName = resolved.modelId ? modelById(resolved.modelId).name : model || "This car";
  const src = resolved.modelId && resolved.colorId ? carPhotoSrc(resolved.modelId, resolved.colorId) : null;
  const showModels = modelOpen || resolved.modelId == null;

  async function choose(modelId: ModelId, colorId: ColorId) {
    const previous = file;
    setFile({
      models: { ...file.models, [vehicleId]: modelId },
      colors: { ...file.colors, [vehicleId]: colorId },
      names: file.names,
      scene: file.scene,
    });
    setError(null);
    try {
      const response = await fetch("/api/appearance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vehicleId, modelId, colorId }),
      });
      const body = (await response.json()) as AppearanceFile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save that paint");
      setFile({
        colors: body.colors ?? {},
        models: body.models ?? {},
        names: body.names ?? {},
        scene: body.scene === "model" ? "model" : "photo",
      });
      setColorOpen(false);
    } catch (err) {
      setFile(previous);
      setError(err instanceof Error ? err.message : "Could not save that paint");
    }
  }

  function chooseModel(modelId: ModelId) {
    setModelOpen(false);
    void choose(modelId, matchColor(reportedColor, modelId));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#09090b]">
      <div className="relative h-52 short:h-28 min-[900px]:h-72">
        {file.scene === "model" && resolved.modelId && paint ? (
          <CarStage modelId={resolved.modelId} color={paint.hex} name={modelName} />
        ) : src && brokenSrc !== src ? (
          // Studio photos are static files already sized for this frame.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${modelName} in ${paint?.name ?? "the selected paint"}`}
            className="h-full w-full object-contain"
            onError={() => setBrokenSrc(src)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {resolved.modelId ? "That photo is not in this build." : "Pick the model to show a photo."}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#09090b] to-transparent short:h-6" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-3 py-3 short:py-2">
        <div className="min-w-0">
          <p className="text-sm text-white">{paint?.name ?? "Paint"}</p>
          <p className="text-xs text-muted-foreground">
            {modelName}
            {paintNote ? ` · ${paintNote}` : ""}
            {file.scene === "model" ? " · drag to turn" : ""}
            {reportedColor ? ` · car reports ${reportedColor}` : ""}
          </p>
        </div>
        {resolved.modelId && paints.length > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            aria-expanded={colorOpen}
            onClick={() => setColorOpen((open) => !open)}
          >
            {colorOpen ? "Hide colors" : "Change color"}
          </button>
        )}
        {resolved.modelId && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setModelOpen((open) => !open)}
          >
            {modelOpen ? "Hide models" : "Different model"}
          </button>
        )}
      </div>
      {showModels && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {CAR_MODELS.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={item.id === resolved.modelId ? "default" : "outline"}
              onClick={() => chooseModel(item.id)}
            >
              {item.name}
            </Button>
          ))}
        </div>
      )}
      {colorOpen && paints.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-3" role="group" aria-label={`${modelName} paint`}>
          {paints.map((item) => {
            const selected = item.id === resolved.colorId;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.name}
                aria-pressed={selected}
                title={item.name}
                disabled={!ready || !resolved.modelId}
                onClick={() => resolved.modelId && void choose(resolved.modelId, item.id)}
                className={`size-7 rounded-full border border-white/40 short:size-6 ${
                  selected ? "ring-2 ring-white ring-offset-2 ring-offset-[#09090b]" : ""
                }`}
                style={{ backgroundColor: item.hex }}
              />
            );
          })}
        </div>
      )}
      {error && <p className="px-3 pb-3 text-sm text-red-300">{error}</p>}
    </section>
  );
}
