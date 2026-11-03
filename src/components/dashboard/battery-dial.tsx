"use client";

import { Zap } from "lucide-react";

export function BatteryDial({
  percent,
  limit,
  charging,
  label,
  range,
  rangeNote,
  power,
}: {
  percent: number;
  limit: number;
  charging?: boolean;
  label: string;
  range: string;
  rangeNote?: string;
  power?: string | null;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const limitClamped = Math.max(0, Math.min(100, limit));
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = charging ? "#3dd68c" : clamped <= 20 ? "#e31937" : clamped <= 50 ? "#f5b942" : "#3dd68c";
  const tick = (limitClamped / 100) * Math.PI * 2;
  const tickInner = radius + 1;
  const tickOuter = radius + 12;
  const status = charging ? `charging${power ? ` at ${power}` : ""}` : label;
  return (
    <div className="relative mx-auto size-36 min-[420px]:size-44 short:size-28">
      <svg
        viewBox="0 0 144 144"
        className="size-full -rotate-90"
        role="img"
        aria-label={`${Math.round(clamped)} percent, ${status}, ${range}${rangeNote ? ` ${rangeNote}` : ""}, charge limit ${Math.round(limitClamped)}`}
      >
        <circle cx="72" cy="72" r={radius} fill="none" stroke="rgb(255 255 255 / 8%)" strokeWidth="10" />
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={charging ? "charge-arc" : undefined}
        />
        <line
          x1={72 + tickInner * Math.cos(tick)}
          y1={72 + tickInner * Math.sin(tick)}
          x2={72 + tickOuter * Math.cos(tick)}
          y2={72 + tickOuter * Math.sin(tick)}
          stroke="#f4f4f5"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <span className="font-heading text-4xl tracking-tight short:text-2xl">{Math.round(clamped)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground short:text-[10px]">
          {charging && <Zap className="size-3 text-emerald-300" aria-hidden />}
          {charging ? "Charging" : label}
        </span>
        <span className="mt-1 text-sm leading-none short:text-xs">{range}</span>
        {rangeNote && <span className="mt-0.5 text-[10px] text-muted-foreground">{rangeNote}</span>}
      </div>
    </div>
  );
}
