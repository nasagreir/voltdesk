import { addCalendarDays, chicagoParts, dayIndex, formatYMD } from "./time";
import { parseTripRange } from "./trips";

export interface DailyDistancePoint {
  day: string;
  label: string;
  distanceMi: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(year: number, month: number, day: number, showYear: boolean): string {
  const base = `${MONTHS[month - 1] ?? ""} ${day}`;
  return showYear ? `${base}, ${year}` : base;
}

/**
 * Miles the odometer moved on each Chicago day in an inclusive range.
 * A quiet day stays at zero. Miles seen on the next reading land on that day.
 * The first day of the range does not absorb miles from before it.
 */
export function dailyDistance(
  samples: readonly { at: string; vehicleId?: string; odometerMi: number }[],
  fromDay: string,
  toDay: string,
  vehicleId?: string | null,
): { points: DailyDistancePoint[] } | { error: string } {
  const parsed = parseTripRange(fromDay, toDay);
  if ("error" in parsed) return parsed;
  const start = chicagoParts(parsed.from);
  const end = chicagoParts(parsed.to);
  const startKey = start.key;
  const endKey = end.key;
  const showYear = start.y !== end.y;
  const count = dayIndex(end.y, end.m, end.d) - dayIndex(start.y, start.m, start.d) + 1;

  const byDay = new Map<string, { min: number; max: number }>();
  for (const sample of samples) {
    if (vehicleId && sample.vehicleId !== vehicleId) continue;
    if (!Number.isFinite(sample.odometerMi)) continue;
    const parts = chicagoParts(new Date(sample.at));
    if (parts.key < startKey || parts.key > endKey) continue;
    const slot = byDay.get(parts.key);
    if (!slot) byDay.set(parts.key, { min: sample.odometerMi, max: sample.odometerMi });
    else {
      slot.min = Math.min(slot.min, sample.odometerMi);
      slot.max = Math.max(slot.max, sample.odometerMi);
    }
  }

  const points: DailyDistancePoint[] = [];
  let cursor = { y: start.y, m: start.m, d: start.d };
  let previous: number | null = null;
  for (let index = 0; index < count; index += 1) {
    const key = formatYMD(cursor.y, cursor.m, cursor.d);
    const slot = byDay.get(key);
    let distanceMi = 0;
    if (slot) {
      const continuous = previous != null && slot.min + 0.05 >= previous;
      distanceMi = Math.max(0, continuous ? slot.max - previous! : slot.max - slot.min);
      previous = slot.max;
    }
    points.push({
      day: key,
      label: labelFor(cursor.y, cursor.m, cursor.d, showYear),
      distanceMi,
    });
    cursor = addCalendarDays(cursor.y, cursor.m, cursor.d, 1);
  }
  return { points };
}
