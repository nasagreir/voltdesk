import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presentVehicle } from "./format";
import {
  carShareOptions,
  driveShareOptions,
  formatShareDay,
  initialShareSelection,
  pickShareStats,
  rangeShareOptions,
  shareCardPixelSize,
  shareFilename,
  SHARE_CARD_WIDTH,
} from "./share-card";
import type { DriveSession, Vehicle } from "./types";

function vehicle(): Vehicle {
  return {
    id: "car-1",
    name: "Roadrunner",
    vin: "5YJYGDEE5MF000001",
    model: "Model Y",
    trim: "Long Range",
    color: "Ultra Red",
    packKwh: 75,
    state: "parked",
    softwareVersion: "2026.32.6",
    updateAvailable: null,
    odometerMi: 18420,
    batteryPercent: 72,
    chargeLimitPercent: 80,
    ratedRangeMi: 240,
    estRangeMi: 228,
    chargingState: "Disconnected",
    chargerPowerKw: 0,
    chargeRateMph: 0,
    minutesToFull: null,
    energyAddedKwh: 0,
    cable: "",
    chargePortOpen: false,
    insideTempC: 21,
    outsideTempC: 8,
    climateOn: false,
    setpointC: 21,
    locked: true,
    sentry: false,
    windowsOpen: false,
    frunkOpen: false,
    trunkOpen: false,
    doorOpen: false,
    tpmsPsi: { fl: 42, fr: 42, rl: 42, rr: 42 },
    lat: 41.9482,
    lng: -87.6684,
    heading: 12,
    speedMph: 0,
    shiftState: "P",
    atHome: true,
    homeDistanceMi: 0,
    lastUpdated: "2026-11-03T22:00:00.000Z",
    stale: false,
    alerts: [],
    powerKw: 0,
    elevationM: 180,
    idealRangeMi: 280,
  };
}

function drive(): DriveSession {
  return {
    id: "drive-1",
    vehicleId: "car-1",
    startedAt: "2026-11-03T15:00:00.000Z",
    endedAt: "2026-11-03T15:40:00.000Z",
    inProgress: false,
    distanceMi: 12.4,
    durationMin: 38,
    startBattery: 80,
    endBattery: 71,
    efficiencyWhPerMi: 260,
    fromLabel: "Garage",
    toLabel: "Work",
    energyNetKwh: 3.2,
    grossWhPerMi: 280,
    avgSpeedMph: 19,
    maxSpeedMph: 48,
    maxPowerKw: 90,
    minPowerKw: -40,
    outsideTempC: 7,
    elevationGainM: 40,
    startRatedRangeMi: 250,
    endRatedRangeMi: 220,
    startIdealRangeMi: 290,
    endIdealRangeMi: 260,
    path: [
      { lat: 41.9482, lng: -87.6684 },
      { lat: 41.96, lng: -87.65 },
    ],
  };
}

describe("share cards", () => {
  it("leaves the VIN and the car location off the car stats", () => {
    const view = presentVehicle(vehicle(), { distance: "mi", temp: "F" });
    view.tripRange = {
      rangeMi: 210,
      atLimitMi: 230,
      whPerMi: 250,
      trips: 4,
      distanceMi: 40,
      range: "210 mi",
      atLimit: "230 mi",
      consumption: "250 Wh/mi",
      distance: "40 mi",
    };
    const options = carShareOptions(view);
    const packed = JSON.stringify(options);
    assert.equal(packed.includes(view.vin), false);
    assert.equal(packed.includes("41.9482"), false);
    assert.equal(packed.includes("-87.6684"), false);
    assert.equal(packed.includes(view.display.coords), false);
    assert.ok(options.some((stat) => stat.id === "battery" && stat.value === "72%"));
    assert.ok(options.some((stat) => stat.id === "trips" && stat.value === "210 mi"));
    assert.equal(options.some((stat) => stat.id === "ideal" && stat.value === "—"), false);
  });

  it("drops blank stats and stops at six", () => {
    const options = [
      { id: "a", label: "A", value: "1" },
      { id: "b", label: "B", value: "—" },
      { id: "c", label: "C", value: "  " },
      { id: "d", label: "D", value: "2" },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `x${index}`,
        label: "X",
        value: String(index),
      })),
    ];
    const picked = pickShareStats(options, ["b", "a", "c", "d", "x0", "x1", "x2", "x3", "x4"]);
    assert.deepEqual(
      picked.map((stat) => stat.id),
      ["a", "d", "x0", "x1", "x2", "x3"],
    );
    assert.deepEqual(initialShareSelection([{ id: "only", label: "Only", value: "9" }], ["missing"]), ["only"]);
  });

  it("builds a short filename and grows the card after two stats", () => {
    assert.equal(shareFilename("car", "Roadrunner"), "voltdesk-car-roadrunner.png");
    assert.equal(shareFilename("trip", "Garage to Work!"), "voltdesk-trip-garage-to-work.png");
    const slug = shareFilename("trips", "word ".repeat(40)).replace(/^voltdesk-trips-|\.png$/g, "");
    assert.ok(slug.length <= 48);
    assert.equal(shareCardPixelSize(1).width, SHARE_CARD_WIDTH);
    assert.equal(shareCardPixelSize(2).height, SHARE_CARD_WIDTH);
    assert.equal(shareCardPixelSize(4).height, 300 + 2 * 230 + 20 + 120);
    assert.equal(shareCardPixelSize(6).height, 300 + 3 * 230 + 40 + 120);
    assert.ok(shareCardPixelSize(6).height > shareCardPixelSize(4).height);
    assert.equal(shareCardPixelSize(6).width, SHARE_CARD_WIDTH);
  });

  it("keeps a trip distance and a range summary, without the path", () => {
    const trip = drive();
    const options = driveShareOptions(trip, "mi", "F");
    assert.ok(options.some((stat) => stat.id === "distance" && stat.value === "12.4 mi"));
    const packed = JSON.stringify(options);
    assert.equal(packed.includes("41.9482"), false);
    assert.equal(packed.includes("-87.6684"), false);
    const range = rangeShareOptions({ count: 3, distanceMi: 40.2, durationMin: 95, avgWhPerMi: 250 }, "mi");
    assert.deepEqual(
      range.map((stat) => stat.label),
      ["Trips", "Distance", "Time driving", "Efficiency"],
    );
    assert.equal(formatShareDay("2026-11-03"), "Nov 3, 2026");
  });
});
