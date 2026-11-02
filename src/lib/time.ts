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

export function formatChicagoStamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
