import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTripRange, presentTripRange } from "./trip-range";

const NOW = new Date("2026-11-03T13:00:00.000Z");

function drive(distanceMi: number, wh: number, endedAt: string, inProgress = false) {
  return { distanceMi, efficiencyWhPerMi: wh, endedAt, inProgress };
}

describe("trip range", () => {
  it("weights recent trips and projects the current charge and the limit", () => {
    const estimate = estimateTripRange(
      {
        drives: [
          drive(10, 400, "2026-11-02T18:00:00.000Z"),
          drive(40, 250, "2026-11-01T18:00:00.000Z"),
          drive(5, 900, "2026-09-01T18:00:00.000Z"),
          drive(20, 100, "2026-11-03T12:00:00.000Z", true),
        ],
        batteryPercent: 50,
        chargeLimitPercent: 80,
        packKwh: 80,
      },
      NOW,
    );
    assert.equal(estimate.trips, 2);
    assert.equal(estimate.distanceMi, 50);
    assert.equal(estimate.whPerMi, 280);
    assert.equal(Math.round(estimate.rangeMi ?? 0), 143);
    assert.equal(Math.round(estimate.atLimitMi ?? 0), 229);
  });

  it("stays empty until there are enough miles", () => {
    const estimate = estimateTripRange(
      {
        drives: [drive(4, 280, "2026-11-02T18:00:00.000Z")],
        batteryPercent: 70,
        chargeLimitPercent: 80,
        packKwh: 78,
      },
      NOW,
    );
    assert.equal(estimate.rangeMi, null);
    const shown = presentTripRange(estimate, "mi");
    assert.equal(shown.range, "—");
    assert.equal(shown.consumption, "—");
  });

  it("shows consumption in the selected distance unit", () => {
    const shown = presentTripRange(
      {
        rangeMi: 200,
        atLimitMi: 220,
        whPerMi: 280,
        trips: 4,
        distanceMi: 90,
      },
      "km",
    );
    assert.equal(shown.consumption, "174 Wh/km");
    assert.match(shown.range, /km$/);
  });
});
