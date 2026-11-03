import { addCalendarDays, chicagoParts, formatYMD } from "./time";

export interface DailyDistancePoint {
  day: string;
  label: string;
  distanceMi: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(month: number, day: number): string {
  return `${MONTHS[month - 1] ?? ""} ${day}`;
}

/**
 * Miles the odometer moved on each Chicago day, ending today.
 * A quiet day stays at zero. Miles seen on the next reading land on that day.
 */
export function dailyDistance(
  samples: readonly { at: string; vehicleId?: string; odometerMi: number }[],
  now: Date,
  days: number,
  vehicleId?: string | null,
): DailyDistancePoint[] {
  const count = Math.min(400, Math.max(1, Math.floor(days)));
  const today = chicagoParts(now);
  const start = addCalendarDays(today.y, today.m, today.d, -(count - 1));
  const startKey = formatYMD(start.y, start.m, start.d);
  const endKey = today.key;

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
  let cursor = start;
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
    points.push({ day: key, label: labelFor(cursor.m, cursor.d), distanceMi });
    cursor = addCalendarDays(cursor.y, cursor.m, cursor.d, 1);
  }
  return points;
}
