import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyDistance } from "./daily-distance";
import { chicagoDate } from "./time";

function at(day: number, hour: number, odometerMi: number, vehicleId = "car") {
  return { at: chicagoDate(2026, 11, day, hour, 0).toISOString(), vehicleId, odometerMi };
}

describe("daily distance", () => {
  it("counts the miles each Chicago day and keeps a quiet day at zero", () => {
    const result = dailyDistance(
      [at(1, 8, 100), at(1, 18, 112), at(3, 9, 130)],
      "2026-11-01",
      "2026-11-03",
    );
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.deepEqual(
      result.points.map((point) => [point.label, point.distanceMi]),
      [
        ["Nov 1", 12],
        ["Nov 2", 0],
        ["Nov 3", 18],
      ],
    );
  });

  it("ignores another car", () => {
    const result = dailyDistance(
      [at(1, 8, 100, "other"), at(1, 18, 140, "other"), at(1, 9, 10), at(1, 10, 14)],
      "2026-11-01",
      "2026-11-01",
      "car",
    );
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0]?.distanceMi, 4);
  });

  it("fills quiet days before the first reading when the range is longer than 90 days", () => {
    const result = dailyDistance([at(1, 8, 100), at(1, 18, 112)], "2026-07-01", "2026-11-03");
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.ok(result.points.length > 90);
    assert.equal(result.points[0]?.day, "2026-07-01");
    assert.equal(result.points[0]?.distanceMi, 0);
    const nov1 = result.points.find((point) => point.day === "2026-11-01");
    assert.equal(nov1?.distanceMi, 12);
    assert.equal(result.points.at(-1)?.day, "2026-11-03");
    assert.equal(result.points.at(-1)?.distanceMi, 0);
  });

  it("names the year when the range crosses January", () => {
    const result = dailyDistance([], "2025-12-31", "2026-01-01");
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.deepEqual(
      result.points.map((point) => point.label),
      ["Dec 31, 2025", "Jan 1, 2026"],
    );
  });

  it("rejects a reversed range and a span longer than 400 days", () => {
    assert.deepEqual(dailyDistance([], "2026-11-03", "2026-11-01"), {
      error: "The start date is after the end date.",
    });
    assert.deepEqual(dailyDistance([], "2025-01-01", "2026-03-01"), {
      error: "Pick a range of 400 days or less. Older samples are not kept.",
    });
  });
});
