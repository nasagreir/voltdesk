/** Build a Date for a wall-clock time in America/Chicago. */
export function chicagoDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(guess).map((part) => [part.type, part.value]),
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess.getTime() + (desired - asUTC));
}

export function chicagoYMD(date: Date): {
  y: number;
  m: number;
  d: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
  };
}

export function addCalendarDays(
  y: number,
  m: number,
  d: number,
  delta: number,
): { y: number; m: number; d: number } {
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return {
    y: utc.getUTCFullYear(),
    m: utc.getUTCMonth() + 1,
    d: utc.getUTCDate(),
  };
}

export function dayIndex(y: number, m: number, d: number): number {
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(2024, 0, 1)) / 86_400_000,
  );
}

export function formatChicago(date: Date, range: "24h" | "7d" | "14d"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: range === "24h" ? undefined : "short",
    day: range === "24h" ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function chicagoParts(date: Date): {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  key: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  return {
    y,
    m,
    d,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

export function formatYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Inclusive Chicago calendar range ending today. `days` of 1 is today only. */
export function presetRange(days: number, now = new Date()): { from: string; to: string } {
  const today = chicagoParts(now);
  const span = Math.max(1, Math.round(days));
  const start = new Date(Date.UTC(today.y, today.m - 1, today.d - (span - 1)));
  return {
    from: formatYMD(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
    to: formatYMD(today.y, today.m, today.d),
  };
}

export function formatChicagoStamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
