import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  demoRecords,
  demoVisits,
  evaluateMaintenance,
  parseOdometer,
  parseServiceDate,
  resolveMaintenance,
  withVisit,
  type MaintenanceState,
  type ServiceVisit,
} from "./maintenance";

const NOW = new Date("2026-11-03T01:00:00.000Z");
const ODO = 40_691;

function evaluate(
  state: Omit<MaintenanceState, "visits"> & { visits?: MaintenanceState["visits"] },
  model = "Model Y Long Range AWD",
  unit: "mi" | "km" = "mi",
) {
  return evaluateMaintenance({
    now: NOW,
    odometerMi: ODO,
    model,
    state: { visits: [], ...state },
    distanceUnit: unit,
  });
}

describe("maintenance schedule", () => {
  it("seeds the demo car with due, soon, and ok items", () => {
    const items = evaluate({ saltedRoads: true, records: demoRecords(NOW, ODO) });
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    assert.equal(byId.tires?.status, "soon");
    assert.equal(byId.tires?.remaining, "350 mi left");
    assert.equal(byId["cabin-filter"]?.status, "soon");
    assert.equal(byId["cabin-filter"]?.remaining, "30 days left");
    assert.equal(byId["brake-fluid"]?.status, "ok");
    assert.equal(byId.wipers?.status, "soon");
    assert.equal(byId["brake-calipers"]?.status, "due");
    assert.equal(byId["brake-calipers"]?.remaining, "500 mi overdue");
  });

  it("uses a 3 year cabin filter on Model S", () => {
    const state: MaintenanceState = {
      saltedRoads: false,
      visits: [],
      records: { "cabin-filter": { at: new Date(NOW.getTime() - 700 * 86_400_000).toISOString(), odometerMi: null } },
    };
    const modelY = evaluate(state, "Model Y");
    const modelS = evaluate(state, "Model S Plaid");
    assert.equal(modelY.find((item) => item.id === "cabin-filter")?.status, "soon");
    assert.equal(modelS.find((item) => item.id === "cabin-filter")?.status, "ok");
    assert.equal(modelS.find((item) => item.id === "cabin-filter")?.interval, "Every 3 years");
    assert.equal(modelS.some((item) => item.id === "brake-calipers"), false);
  });

  it("marks tires due at the interval and converts the gap to kilometers", () => {
    const state: MaintenanceState = {
      saltedRoads: false,
      visits: [],
      records: { tires: { at: NOW.toISOString(), odometerMi: ODO - 6250 } },
    };
    assert.equal(evaluate(state)[0]?.status, "due");
    assert.equal(evaluate(state)[0]?.remaining, "0 mi left");
    const km = evaluate(
      { saltedRoads: false, records: { tires: { at: NOW.toISOString(), odometerMi: ODO - 5900 } } },
      "Model Y",
      "km",
    );
    assert.equal(km[0]?.remaining, "563 km left");
  });

  it("leaves a missing record unset and rejects a bad date or odometer", () => {
    const items = evaluate({ saltedRoads: true, records: {} });
    assert.equal(items.find((item) => item.id === "wipers")?.status, "unset");
    assert.equal("error" in parseServiceDate("2026-02-31", NOW), true);
    assert.equal("error" in parseServiceDate("2007-01-01", NOW), true);
    assert.equal("error" in parseServiceDate("2026-11-04", NOW), true);
    assert.equal("at" in parseServiceDate("2026-11-02", NOW), true);
    assert.equal("error" in parseOdometer(-1), true);
    assert.equal("error" in parseOdometer(2_000_001), true);
    assert.deepEqual(parseOdometer(12000), { odometerMi: 12000 });
  });

  it("keeps an older visit from moving a newer service record backward", () => {
    const older: ServiceVisit = {
      id: "abcdef12",
      at: new Date(NOW.getTime() - 800 * 86_400_000).toISOString(),
      odometerMi: 1000,
      itemIds: ["wipers"],
      note: "",
      documents: [],
    };
    const state: MaintenanceState = {
      saltedRoads: true,
      records: { wipers: { at: NOW.toISOString(), odometerMi: ODO } },
      visits: [],
    };
    const next = withVisit(state, older);
    assert.equal(next.records.wipers?.odometerMi, ODO);
    assert.equal(next.visits[0]?.id, "abcdef12");
    const demo = resolveMaintenance(null, "demo", NOW, ODO);
    assert.equal(demo.visits[0]?.id, demoVisits(NOW, ODO)[0]?.id);
    assert.deepEqual(demo.visits[0]?.itemIds, ["brake-calipers"]);
  });
});
