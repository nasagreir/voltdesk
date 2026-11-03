"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presetRange } from "@/lib/time";

export function DateRangeBar({
  from,
  to,
  onChange,
  presets,
  fromId,
  toId,
  activeDays,
  tone = "dialog",
  prefix,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  presets: readonly { label: string; days: number }[];
  fromId: string;
  toId: string;
  /** When set, only this rolling preset is highlighted, not a matching calendar range. */
  activeDays?: number | null;
  tone?: "dialog" | "page";
  prefix?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {prefix}
        {presets.map((preset) => {
          const range = presetRange(preset.days);
          const active = activeDays === preset.days || (activeDays == null && range.from === from && range.to === to);
          return (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={active ? (tone === "page" ? "default" : "secondary") : tone === "page" ? "outline" : "ghost"}
              onClick={() => onChange(range.from, range.to)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="grid min-w-0 gap-1.5 text-sm">
          <Label htmlFor={fromId}>From</Label>
          <Input id={fromId} type="date" value={from} onChange={(event) => onChange(event.target.value, to)} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm">
          <Label htmlFor={toId}>To</Label>
          <Input id={toId} type="date" value={to} onChange={(event) => onChange(from, event.target.value)} />
        </label>
      </div>
    </div>
  );
}
