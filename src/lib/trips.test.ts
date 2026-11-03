import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chicagoDate } from "./time";
import { parseTripRange, tripSummary, tripsOverlapping } from "./trips";
import type { DriveSession } from "./types";

function drive(partial: Partial<DriveSession> & { startedAt: string; endedAt: string }): DriveSession {
  return {
    id: partial.startedAt,
    vehicleId: "car",
    inProgress: false,
    distanceMi: 10,
    durationMin: 30,
    startBattery: 80,
    endBattery: 70,
    efficiencyWhPerMi: 250,
    fromLabel: "Home",
    toLabel: "Work",
    energyNetKwh: 2.5,
    grossWhPerMi: 260,
    avgSpeedMph: 20,
    maxSpeedMph: 40,
    maxPowerKw: 40,
    minPowerKw: -10,
    outsideTempC: 10,
    elevationGainM: 5,
    startRatedRangeMi: 200,
    endRatedRangeMi: 180,
    startIdealRangeMi: null,
    endIdealRangeMi: null,
    path: [
      { lat: 41.95, lng: -87.67 },
      { lat: 41.89, lng: -87.63 },
    ],
    ...partial,
  };
}

describe("trip date range", () => {
  it("treats the dates as Chicago days, inclusive", () => {
    const parsed = parseTripRange("2026-11-02", "2026-11-02");
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.from.toISOString(), chicagoDate(2026, 11, 2, 0, 0).toISOString());
    assert.ok(parsed.to.getTime() > chicagoDate(2026, 11, 2, 23, 59).getTime());
  });

  it("rejects a reversed range and a span past the sample history", () => {
    assert.equal("error" in parseTripRange("2026-11-03", "2026-11-02"), true);
    assert.equal("error" in parseTripRange("2024-01-01", "2026-11-02"), true);
    assert.equal("error" in parseTripRange("nope", "2026-11-02"), true);
  });
});

describe("trips in a range", () => {
  const drives = [
    drive({ startedAt: "2026-11-01T14:00:00.000Z", endedAt: "2026-11-01T15:00:00.000Z", distanceMi: 11 }),
    drive({ startedAt: "2026-11-02T13:00:00.000Z", endedAt: "2026-11-02T14:00:00.000Z", distanceMi: 12 }),
    drive({ startedAt: "2026-10-01T13:00:00.000Z", endedAt: "2026-10-01T14:00:00.000Z", distanceMi: 8 }),
  ];

  it("keeps a trip that overlaps the window and orders the newest first", () => {
    const parsed = parseTripRange("2026-11-02", "2026-11-02");
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    const trips = tripsOverlapping(drives, parsed.from.getTime(), parsed.to.getTime());
    assert.deepEqual(trips.map((trip) => trip.distanceMi), [12]);
    const summary = tripSummary(trips);
    assert.equal(summary.count, 1);
    assert.equal(summary.distanceMi, 12);
    assert.equal(summary.avgWhPerMi, 250);
  });

  it("includes a trip that starts before the window and ends inside it", () => {
    const crossing = drive({
      startedAt: "2026-11-01T23:30:00.000Z",
      endedAt: "2026-11-02T12:30:00.000Z",
    });
    const parsed = parseTripRange("2026-11-02", "2026-11-02");
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    const trips = tripsOverlapping([crossing], parsed.from.getTime(), parsed.to.getTime());
    assert.equal(trips.length, 1);
  });
});
