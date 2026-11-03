import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyDistance } from "./daily-distance";
import { chicagoDate } from "./time";

function at(day: number, hour: number, odometerMi: number, vehicleId = "car") {
  return { at: chicagoDate(2026, 11, day, hour, 0).toISOString(), vehicleId, odometerMi };
}

describe("daily distance", () => {
  it("counts the miles each Chicago day and keeps a quiet day at zero", () => {
    const points = dailyDistance(
      [at(1, 8, 100), at(1, 18, 112), at(3, 9, 130)],
      chicagoDate(2026, 11, 3, 12, 0),
      3,
    );
    assert.deepEqual(
      points.map((point) => [point.label, point.distanceMi]),
      [
        ["Nov 1", 12],
        ["Nov 2", 0],
        ["Nov 3", 18],
      ],
    );
  });

  it("ignores another car", () => {
    const points = dailyDistance(
      [at(1, 8, 100, "other"), at(1, 18, 140, "other"), at(1, 9, 10), at(1, 10, 14)],
      chicagoDate(2026, 11, 1, 12, 0),
      1,
      "car",
    );
    assert.equal(points.length, 1);
    assert.equal(points[0]?.distanceMi, 4);
  });
});
