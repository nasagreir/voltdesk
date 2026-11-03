"use client";

export function BatteryDial({
  percent,
  limit,
  label,
  range,
}: {
  percent: number;
  limit: number;
  label: string;
  range: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = clamped <= 20 ? "#e31937" : clamped <= 50 ? "#f5b942" : "#3dd68c";
  return (
    <div className="relative mx-auto size-36 min-[420px]:size-44 short:size-28">
      <svg
        viewBox="0 0 144 144"
        className="size-full -rotate-90"
        role="img"
        aria-label={`${Math.round(clamped)} percent battery, charge limit ${Math.round(limit)}`}
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
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-heading text-4xl tracking-tight">{Math.round(clamped)}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="mt-1 text-sm">{range}</span>
      </div>
    </div>
  );
}
