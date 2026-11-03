import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemo, DEMO_FENCES } from "./demo";
import { buildReports } from "./reports";
import { chicagoDate } from "./time";

describe("teslamate-style reports", () => {
  it("builds drives, charges, drain, health, and a software update from the demo car", () => {
    const now = chicagoDate(2026, 11, 2, 16, 29);
    const demo = buildDemo(now);
    const reports = buildReports({
      samples: demo.samples,
      now,
      days: 30,
      vehicleId: demo.vehicle.id,
      rateUsdPerKwh: 0.16,
      places: DEMO_FENCES,
      units: { distance: "mi", temp: "F" },
      mode: "demo",
      source: "demo",
      message: "demo",
    });

    assert.ok(reports.statistics.driveCount >= 20);
    assert.ok(reports.statistics.chargeCount >= 10);
    assert.ok((reports.statistics.avgWhPerMi ?? 0) > 100);
    assert.ok((reports.statistics.avgGrossWhPerMi ?? 0) > 0);
    assert.notEqual(reports.statistics.avgWhPerMi, reports.statistics.avgGrossWhPerMi);
    assert.ok((reports.driveStats.maxSpeedMph ?? 0) > 40);
    assert.ok(reports.drives[0]?.path.length >= 2);
    assert.equal(reports.drives.some((drive) => drive.fromLabel === "Home" && drive.toLabel === "Work"), true);

    assert.ok(reports.chargingStats.ac.count >= 10);
    assert.ok(reports.chargingStats.dc.count >= 1);
    assert.ok(reports.charges.some((charge) => charge.billing === "work" && charge.free));
    assert.ok(reports.charges.some((charge) => charge.billing === "supercharger" && charge.costUsd == null));
    assert.equal(reports.chargingStats.byPlace[0]?.place, "Home");
    assert.ok((reports.chargingStats.byPlace[0]?.costUsd ?? 0) > 1);

    const health = reports.batteryHealth.points;
    assert.ok(health.length >= 10);
    assert.ok(health[0].fullRatedMi - health[health.length - 1].fullRatedMi > 2);
    assert.ok((reports.batteryHealth.degradationPct ?? 0) > 0);

    assert.ok(reports.vampire.events.length >= 1);
    assert.ok(reports.vampire.totalSocDrop > 1);
    assert.ok(reports.states.totals.driving > 0);
    assert.ok(reports.states.totals.charging > 0);
    assert.ok(reports.states.totals.asleep > 0);

    const versions = new Set(reports.updates.map((update) => update.version));
    assert.equal(versions.has("2026.20.7"), true);
    assert.equal(versions.has("2026.32.6"), true);
    assert.ok(reports.mileage.totalMi > 100);
    assert.ok(reports.timeline.length > 10);
    assert.ok(reports.visited.length > 10);
    assert.ok(reports.locations.some((place) => place.name === "Work"));
  });
});
