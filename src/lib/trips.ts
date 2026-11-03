import { chicagoDate, chicagoParts } from "@/lib/time";
import type { DriveSession } from "@/lib/types";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_SPAN_MS = 400 * 24 * 60 * 60 * 1000;

function calendarDay(ymd: string): { y: number; m: number; d: number } | null {
  const match = DAY.exec(ymd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const start = chicagoDate(y, m, d, 0, 0);
  const parts = chicagoParts(start);
  if (parts.y !== y || parts.m !== m || parts.d !== d) return null;
  return { y, m, d };
}

export function parseTripRange(
  fromDay: string,
  toDay: string,
): { from: Date; to: Date } | { error: string } {
  const fromParts = calendarDay(fromDay);
  const toParts = calendarDay(toDay);
  if (!fromParts || !toParts) return { error: "Use dates as YYYY-MM-DD." };
  const from = chicagoDate(fromParts.y, fromParts.m, fromParts.d, 0, 0);
  const to = new Date(chicagoDate(toParts.y, toParts.m, toParts.d, 23, 59).getTime() + 59_999);
  if (from.getTime() > to.getTime()) return { error: "The start date is after the end date." };
  if (to.getTime() - from.getTime() > MAX_SPAN_MS) {
    return { error: "Pick a range of 400 days or less. Older samples are not kept." };
  }
  return { from, to };
}

export function tripsOverlapping(drives: DriveSession[], fromMs: number, toMs: number): DriveSession[] {
  return drives
    .filter((drive) => {
      const start = new Date(drive.startedAt).getTime();
      const end = new Date(drive.endedAt).getTime();
      return end >= fromMs && start <= toMs;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function tripSummary(drives: DriveSession[]): {
  count: number;
  distanceMi: number;
  durationMin: number;
  avgWhPerMi: number | null;
} {
  let weighted = 0;
  let miles = 0;
  for (const drive of drives) {
    if (drive.efficiencyWhPerMi == null || drive.distanceMi <= 0) continue;
    weighted += drive.efficiencyWhPerMi * drive.distanceMi;
    miles += drive.distanceMi;
  }
  return {
    count: drives.length,
    distanceMi: drives.reduce((sum, drive) => sum + drive.distanceMi, 0),
    durationMin: drives.reduce((sum, drive) => sum + drive.durationMin, 0),
    avgWhPerMi: miles > 0 ? weighted / miles : null,
  };
}
