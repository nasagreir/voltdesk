import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemo } from "./demo";
import { buildHistory } from "./history";
import { deriveCharges, deriveDrives } from "./sessions";
import { chicagoDate } from "./time";
import type { VehicleSample } from "./types";

function sample(partial: Partial<VehicleSample> & { at: string }): VehicleSample {
  return {
    vehicleId: "car",
    name: "Car",
    batteryPercent: 70,
    ratedRangeMi: 210,
    odometerMi: 100,
    chargingState: "Disconnected",
    chargerPowerKw: 0,
    energyAddedKwh: 0,
    shiftState: "P",
    speedMph: 0,
    lat: 41.95,
    lng: -87.67,
    insideTempC: 20,
    outsideTempC: 8,
    packKwh: 78,
    ...partial,
  };
}

describe("chicago wall clock", () => {
  it("lands on the requested Chicago hour in November", () => {
    const date = chicagoDate(2026, 11, 2, 16, 29);
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date);
    assert.equal(hour, "16");
  });
});

describe("sessions", () => {
  it("closes one drive when the car parks", () => {
    const drives = deriveDrives([
      sample({ at: "2026-11-02T14:00:00.000Z", shiftState: "P", odometerMi: 100, batteryPercent: 80 }),
      sample({ at: "2026-11-02T14:05:00.000Z", shiftState: "D", speedMph: 30, odometerMi: 101, batteryPercent: 79, lat: 41.94 }),
      sample({ at: "2026-11-02T14:20:00.000Z", shiftState: "D", speedMph: 32, odometerMi: 112, batteryPercent: 75, lat: 41.9 }),
      sample({ at: "2026-11-02T14:22:00.000Z", shiftState: "P", speedMph: 0, odometerMi: 112.4, batteryPercent: 74, lat: 41.89 }),
    ]);
    assert.equal(drives.length, 1);
    assert.ok(drives[0].distanceMi > 11);
    assert.equal(drives[0].inProgress, false);
    assert.ok((drives[0].efficiencyWhPerMi ?? 0) > 100);
  });

  it("sums energy added across a charge", () => {
    const charges = deriveCharges(
      [
        sample({ at: "2026-11-02T06:00:00.000Z", chargingState: "Charging", batteryPercent: 40, energyAddedKwh: 0.2, chargerPowerKw: 11 }),
        sample({ at: "2026-11-02T07:00:00.000Z", chargingState: "Charging", batteryPercent: 60, energyAddedKwh: 8, chargerPowerKw: 11 }),
        sample({ at: "2026-11-02T08:00:00.000Z", chargingState: "Complete", batteryPercent: 80, energyAddedKwh: 16, chargerPowerKw: 0 }),
      ],
      0.14,
      null,
    );
    assert.equal(charges.length, 1);
    assert.ok(Math.abs(charges[0].energyKwh - 15.8) < 0.2);
    assert.ok((charges[0].costUsd ?? 0) > 2);
  });
});

describe("demo timeline", () => {
  it("builds a parked-or-charging Model Y with drives and charges", () => {
    const now = chicagoDate(2026, 11, 2, 16, 29);
    const demo = buildDemo(now);
    assert.equal(demo.vehicle.name, "Roadrunner");
    assert.equal(demo.vehicle.state, "parked");
    assert.ok(demo.vehicle.batteryPercent > 60 && demo.vehicle.batteryPercent < 80);
    assert.equal(demo.vehicle.sentry, true);
    const history = buildHistory({
      samples: demo.samples,
      range: "7d",
      now,
      vehicleId: demo.vehicle.id,
      rateUsdPerKwh: 0.14,
      home: { lat: 41.9482, lng: -87.6684, label: "Home", radiusM: 250 },
      mode: "demo",
      source: "demo",
      units: { distance: "mi", temp: "F" },
      message: "demo",
    });
    assert.ok(history.summary.driveCount >= 10);
    assert.ok(history.summary.chargeCount >= 5);
    assert.ok(history.series.length > 20);
  });
});
