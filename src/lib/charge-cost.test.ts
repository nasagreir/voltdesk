import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatChargeCost, summarizeCharges } from "./charge-cost";
import { applyChargePrices } from "./charge-prices";
import { formatDoneBy, money } from "./format";
import { applyHomeSettings, applySavedPlaces } from "./places";
import { deriveCharges } from "./sessions";
import { chicagoDate } from "./time";
import type { AppSettings, Geofence, VehicleSample } from "./types";

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

  it("keeps the guess until an actual amount replaces it", () => {
    const charges = deriveCharges(
      [
        sample({ at: "2026-11-02T06:00:00.000Z", batteryPercent: 40, energyAddedKwh: 0.2 }),
        sample({ at: "2026-11-02T08:00:00.000Z", chargingState: "Complete", batteryPercent: 80, energyAddedKwh: 10, chargerPowerKw: 0 }),
      ],
      0.14,
      fences,
    );
    const home = charges[0];
    assert.ok(home);
    const untouched = applyChargePrices([home], {});
    assert.equal(untouched[0]?.costSource, "guess");
    assert.equal(untouched[0]?.actualUsd, null);
    assert.equal(formatChargeCost(untouched[0]!), `est. ${money(home.costUsd)}`);
    const priced = applyChargePrices([home], { [home.id]: 7.5 });
    assert.equal(priced[0]?.costUsd, 7.5);
    assert.equal(priced[0]?.actualUsd, 7.5);
    assert.equal(priced[0]?.guessUsd, home.costUsd);
    assert.equal(priced[0]?.costSource, "actual");
    assert.equal(priced[0]?.free, false);
    assert.equal(formatChargeCost(priced[0]!), "$7.50");
    const free = applyChargePrices([home], { [home.id]: 0 });
    assert.equal(free[0]?.costSource, "actual");
    assert.equal(free[0]?.free, true);
    assert.equal(formatChargeCost(free[0]!), "Free");
    const summary = summarizeCharges(priced, NOW);
    assert.equal(summary.lines[0]?.source, "actual");
    assert.equal(summary.totalUsd, 7.5);
  });
});

describe("home charging settings", () => {
  it("replaces the home circle and rate and leaves other places alone", () => {
    const saved: Geofence[] = [
      { id: "home", name: "Old", lat: 1, lng: 2, radiusM: 50, costPerKwh: 0.2, sessionFee: 1.25 },
      { id: "work", name: "Work", lat: 41.8858, lng: -87.6324, radiusM: 200, costPerKwh: 0, sessionFee: 0 },
    ];
    const unchanged = applyHomeSettings(saved, { homeLat: null, homeLng: -87 } as AppSettings);
    assert.equal(unchanged[0]?.lat, 1);
    const next = applyHomeSettings(saved, {
      homeLat: 41.95,
      homeLng: -87.67,
      homeLabel: "House",
      homeRadiusM: 180,
      electricityRateUsd: 0.11,
    } as AppSettings);
    const home = next.find((fence) => fence.id === "home");
    assert.equal(home?.name, "House");
    assert.equal(home?.lat, 41.95);
    assert.equal(home?.costPerKwh, 0.11);
    assert.equal(home?.radiusM, 180);
    assert.equal(home?.sessionFee, 1.25);
    assert.equal(next.find((fence) => fence.id === "work")?.name, "Work");
  });

  it("tags a charge inside the work circle and leaves that circle alone until it is set", () => {
    const saved: Geofence[] = [
      { id: "home", name: "Home", lat: 41.9482, lng: -87.6684, radiusM: 250, costPerKwh: 0.14, sessionFee: 0 },
      { id: "work", name: "Work", lat: 41.8858, lng: -87.6324, radiusM: 200, costPerKwh: 0, sessionFee: 1.5 },
    ];
    const untouched = applySavedPlaces(saved, { workLat: null, workLng: null } as AppSettings);
    assert.equal(untouched.find((fence) => fence.id === "work")?.lat, 41.8858);
    const placed = applySavedPlaces(saved, {
      workLat: 41.829,
      workLng: -87.633,
      workLabel: "Office",
      workRadiusM: 180,
      workRateUsd: 0,
    } as AppSettings);
    const office = placed.find((fence) => fence.id === "work");
    assert.equal(office?.name, "Office");
    assert.equal(office?.sessionFee, 1.5);
    assert.equal(placed.find((fence) => fence.id === "home")?.name, "Home");
    const charges = deriveCharges(
      [
        sample({ at: "2026-11-01T22:00:00.000Z", lat: 41.829, lng: -87.633, batteryPercent: 20, energyAddedKwh: 1, chargerPowerKw: 150, fastCharger: true }),
        sample({ at: "2026-11-01T22:20:00.000Z", lat: 41.829, lng: -87.633, chargingState: "Complete", batteryPercent: 60, energyAddedKwh: 30, chargerPowerKw: 0, fastCharger: true }),
      ],
      0.14,
      placed,
    );
    assert.equal(charges[0]?.billing, "work");
    assert.equal(charges[0]?.placeLabel, "Office");
    assert.equal(charges[0]?.free, false);
    assert.equal(charges[0]?.costUsd, 1.5);
  });
});
