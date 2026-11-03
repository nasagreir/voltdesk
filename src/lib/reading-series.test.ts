import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyReadings } from "./reading-series";
import { chicagoDate } from "./time";
import type { VehicleSample } from "./types";

function sample(day: number, hour: number, patch: Partial<VehicleSample>): VehicleSample {
  return {
    at: chicagoDate(2026, 11, day, hour, 0).toISOString(),
    vehicleId: "car",
    name: "Roadrunner",
    batteryPercent: 70,
    ratedRangeMi: 200,
    odometerMi: 100,
    chargingState: "Disconnected",
    chargerPowerKw: 0,
    energyAddedKwh: 0,
    shiftState: "P",
    speedMph: 0,
    lat: null,
    lng: null,
    insideTempC: null,
    outsideTempC: null,
    packKwh: 78,
    ...patch,
  };
}

const units = { distance: "mi" as const, temp: "F" as const };

describe("daily readings", () => {
  it("charts the highest speed each day and keeps a quiet day at zero", () => {
    const series = dailyReadings(
      [sample(1, 8, { speedMph: 10, shiftState: "D" }), sample(1, 9, { speedMph: 40, shiftState: "D" }), sample(3, 9, { speedMph: 55, shiftState: "D" })],
      "speed",
      "2026-11-01",
      "2026-11-03",
      units,
    );
    assert.ok(!("error" in series));
    if ("error" in series) return;
    assert.deepEqual(
      series.points.map((point) => point.value),
      [40, 0, 55],
    );
    assert.equal(series.high, 55);
    assert.equal(series.unitLabel, "mph");
  });

  it("averages cabin temperature in the selected unit", () => {
    const series = dailyReadings(
      [sample(1, 8, { insideTempC: 20 }), sample(1, 18, { insideTempC: 22 })],
      "inside",
      "2026-11-01",
      "2026-11-01",
      units,
    );
    assert.ok(!("error" in series));
    if ("error" in series) return;
    assert.equal(series.points[0]?.value, 70);
  });

  it("treats a parked sample with no lock field as locked", () => {
    const series = dailyReadings([sample(1, 8, { shiftState: "P", speedMph: 0 })], "locked", "2026-11-01", "2026-11-01", units);
    assert.ok(!("error" in series));
    if ("error" in series) return;
    assert.equal(series.points[0]?.value, 100);
  });
});
