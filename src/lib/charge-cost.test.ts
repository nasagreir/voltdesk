import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeCharges } from "./charge-cost";
import { formatDoneBy } from "./format";
import { deriveCharges } from "./sessions";
import { chicagoDate } from "./time";
import type { Geofence, VehicleSample } from "./types";

const NOW = new Date("2026-11-03T18:00:00.000Z");

function sample(partial: Partial<VehicleSample> & { at: string }): VehicleSample {
  return {
    vehicleId: "car",
    name: "Car",
    batteryPercent: 50,
    ratedRangeMi: 160,
    odometerMi: 100,
    chargingState: "Charging",
    chargerPowerKw: 11,
    energyAddedKwh: 0,
    shiftState: "P",
    speedMph: 0,
    lat: 41.9482,
    lng: -87.6684,
    insideTempC: 20,
    outsideTempC: 8,
    packKwh: 78,
    ...partial,
  };
}

const fences: Geofence[] = [
  { id: "home", name: "Home", lat: 41.9482, lng: -87.6684, radiusM: 250, costPerKwh: 0.14, sessionFee: 0 },
  { id: "work", name: "Work", lat: 41.8858, lng: -87.6324, radiusM: 200, costPerKwh: 0, sessionFee: 0 },
];

describe("charge billing", () => {
  it("prices home, leaves work free, and does not invent a Supercharger price", () => {
    const charges = deriveCharges(
      [
        sample({ at: "2026-11-02T06:00:00.000Z", batteryPercent: 40, energyAddedKwh: 0.2 }),
        sample({ at: "2026-11-02T08:00:00.000Z", chargingState: "Complete", batteryPercent: 80, energyAddedKwh: 10, chargerPowerKw: 0 }),
        sample({ at: "2026-11-02T18:00:00.000Z", lat: 41.8858, lng: -87.6324, batteryPercent: 40, energyAddedKwh: 0.1, chargerPowerKw: 6 }),
        sample({ at: "2026-11-02T19:00:00.000Z", lat: 41.8858, lng: -87.6324, chargingState: "Complete", batteryPercent: 55, energyAddedKwh: 4, chargerPowerKw: 0 }),
        sample({ at: "2026-11-01T22:00:00.000Z", lat: 41.8, lng: -87.7, batteryPercent: 20, energyAddedKwh: 1, chargerPowerKw: 150, fastCharger: true }),
        sample({ at: "2026-11-01T22:20:00.000Z", lat: 41.8, lng: -87.7, chargingState: "Complete", batteryPercent: 60, energyAddedKwh: 30, chargerPowerKw: 0, fastCharger: true }),
      ],
      0.14,
      fences,
    );
    const home = charges.find((charge) => charge.billing === "home");
    const work = charges.find((charge) => charge.billing === "work");
    const dc = charges.find((charge) => charge.billing === "supercharger");
    assert.ok(home);
    assert.ok((home?.costUsd ?? 0) > 1);
    assert.equal(home?.free, false);
    assert.equal(work?.free, true);
    assert.equal(work?.costUsd, 0);
    assert.equal(dc?.costUsd, null);
    const summary = summarizeCharges(charges, NOW);
    assert.equal(summary.unpriced, 1);
    assert.ok(summary.lines.some((line) => line.label === "Work · free" && line.cost === "Free"));
    assert.ok(summary.totalUsd > 1);
    assert.ok(summary.totalUsd < (home?.costUsd ?? 0) + 1);
  });

  it("says when a charge in progress will finish", () => {
    const updated = chicagoDate(2026, 11, 3, 7, 12);
    assert.equal(formatDoneBy(updated.toISOString(), 48, true), "8:00 AM");
    assert.equal(formatDoneBy(updated.toISOString(), 48, false), "—");
    assert.equal(formatDoneBy(updated.toISOString(), 0, true), "Now");
  });
});
