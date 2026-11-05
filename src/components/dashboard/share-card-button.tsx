"use client";

import { Share2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { routeBackdrop } from "@/lib/route-backdrop";
import { paintShareCard, SHARE_MAP_HEIGHT, SHARE_MAP_WIDTH } from "@/lib/share-card-paint";
import type { LatLng } from "@/lib/route-frame";
import {
  initialShareSelection,
  pickShareStats,
  SHARE_CARD_MAX,
  shareFilename,
  usableShareStats,
  type SharePreset,
  type ShareStat,
} from "@/lib/share-card";
import { cn } from "@/lib/utils";

export function ShareCardButton({
  kind,
  title,
  subtitle,
  footnote,
  options,
  defaults,
  presets = [],
  route,
  label = "Share card",
  size = "sm",
  variant = "outline",
}: {
  kind: "car" | "trip" | "trips";
  title: string;
  subtitle: string;
  footnote: string;
  options: ShareStat[];
  defaults: string[];
  presets?: SharePreset[];
  /** Drawn behind a single trip. Other cards stay plain. */
  route?: LatLng[];
  label?: string;
  size?: "xs" | "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const choices = usableShareStats(options);
  const stats = pickShareStats(choices, selected);
  const optionKey = choices.map((stat) => `${stat.id}:${stat.value}`).join("|");
  const tripRoute = kind === "trip" ? route : undefined;
  const routeKey = (tripRoute ?? []).map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join(";");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const card = {
        title,
        subtitle,
        footnote,
        stats: pickShareStats(choices, selected),
        route: tripRoute,
      };
      backdropRef.current = null;
      paintShareCard(canvas, card);
      if (!tripRoute || tripRoute.length < 2) return;
      void routeBackdrop(tripRoute, SHARE_MAP_WIDTH, SHARE_MAP_HEIGHT).then((backdrop) => {
        if (cancelled || !backdrop || !canvasRef.current) return;
        backdropRef.current = backdrop;
        paintShareCard(canvasRef.current, { ...card, backdrop, mapped: true });
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, title, subtitle, footnote, optionKey, selected, choices, tripRoute, routeKey]);

  function openDialog() {
    setSelected(initialShareSelection(choices, defaults));
    setNote(null);
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= SHARE_CARD_MAX) return current;
      return [...current, id];
    });
    setNote(null);
  }

  function applyPreset(ids: string[]) {
    setSelected(pickShareStats(choices, ids).map((stat) => stat.id));
    setNote(null);
  }

  async function fileFromCanvas(): Promise<File> {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Could not build the PNG.");
    paintShareCard(canvas, {
      title,
      subtitle,
      footnote,
      stats,
      route: tripRoute,
      backdrop: backdropRef.current,
      mapped: Boolean(backdropRef.current),
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not build the PNG.");
    return new File([blob], shareFilename(kind, title), { type: "image/png" });
  }

  function saveFile(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function download() {
    try {
      saveFile(await fileFromCanvas());
      setNote(null);
    } catch {
      setNote("Could not build the PNG.");
    }
  }

  async function share() {
    try {
      const file = await fileFromCanvas();
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title });
        setNote(null);
        return;
      }
      saveFile(file);
      setNote("This browser saved the PNG.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNote("Could not build the PNG.");
    }
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={openDialog}>
        <Share2Icon />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>Share card</DialogTitle>
                <DialogDescription>
                  {tripRoute && tripRoute.length >= 2
                    ? "Pick up to six stats. The PNG leaves out the VIN. The background is this drive on a map."
                    : "Pick up to six stats. The PNG leaves out the VIN and the car's location."}
                </DialogDescription>
              </div>
              <DialogClose />
            </div>
            {presets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Button key={preset.id} type="button" size="xs" variant="outline" onClick={() => applyPreset(preset.ids)}>
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {choices.map((stat) => {
                const on = selected.includes(stat.id);
                const blocked = !on && selected.length >= SHARE_CARD_MAX;
                return (
                  <button
                    key={stat.id}
                    type="button"
                    aria-pressed={on}
                    disabled={blocked}
                    onClick={() => toggle(stat.id)}
                    className={cn(
                      "flex min-w-0 items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left",
                      on ? "border-[#e31937] bg-white/5" : "border-white/10",
                      blocked && "opacity-40",
                    )}
                  >
                    <span className="text-xs tracking-wide text-muted-foreground uppercase">{stat.label}</span>
                    <span className="truncate font-heading text-sm">{stat.value}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void download()} disabled={stats.length === 0}>
                Download PNG
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void share()} disabled={stats.length === 0}>
                Share
              </Button>
            </div>
            {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
            <canvas ref={canvasRef} aria-label="Share card preview" className="mt-3 h-auto w-full rounded-lg" />
            <p className="mt-2 text-xs text-muted-foreground">
              {tripRoute && tripRoute.length >= 2
                ? "1080 px wide. No VIN. The route is the background."
                : "1080 px wide. No VIN or location."}
            </p>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </>
  );
}
