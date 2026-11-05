import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeAppearance } from "./appearance";
import { carPhotoSrc, colorsFor, matchColor, matchModel, resolvePaint } from "./car-photos";

describe("car photos", () => {
  it("matches the longer model name before a shorter one", () => {
    assert.equal(matchModel("Model S Plaid"), "model-s");
    assert.equal(matchModel("2024 Model X"), "model-x");
    assert.equal(matchModel("Model Y Long Range"), "model-y");
    assert.equal(matchModel("Model 3"), "model-3");
    assert.equal(matchModel("Cybertruck Foundation"), "cybertruck");
    assert.equal(matchModel("Model something"), null);
  });

  it("maps the paint the car reports onto the colors that model offers", () => {
    assert.equal(matchColor("Pearl White", "model-y"), "pearl-white");
    assert.equal(matchColor("Deep Blue Metallic", "model-y"), "marine-blue");
    assert.equal(matchColor("Silver", "model-s"), "lunar-silver");
    assert.equal(matchColor("Silver", "model-y"), "quicksilver");
    assert.equal(matchColor("Garnet Red", "model-x"), "ultra-red");
    assert.equal(matchColor("Ultra Red", "cybertruck"), "stainless");
    assert.equal(matchColor("Pearl White", "cybertruck"), "satin-white");
    assert.equal(matchColor("", "model-3"), "pearl-white");
  });

  it("keeps a saved color for that car and drops a paint the model does not offer", () => {
    const saved = resolvePaint({
      modelText: "Model Y",
      reportedColor: "Pearl White",
      savedModel: "model-y",
      savedColor: "ultra-red",
    });
    assert.deepEqual(saved, { modelId: "model-y", colorId: "ultra-red" });

    const dropped = resolvePaint({
      modelText: "Model Y",
      reportedColor: "Pearl White",
      savedModel: "model-y",
      savedColor: "stainless",
    });
    assert.equal(dropped.colorId, "pearl-white");
    assert.equal(carPhotoSrc("model-y", "pearl-white"), "/cars/model-y/pearl-white.jpg");
    assert.equal(colorsFor("cybertruck").length, 3);
  });

  it("ignores paint choices that are not a known color for that vehicle", () => {
    const clean = sanitizeAppearance({
      models: { "demo-roadrunner": "model-y", "../etc": "model-3", other: "not-a-model" },
      colors: {
        "demo-roadrunner": "ultra-red",
        "demo-roadrunner-2": "nope",
        truck: "ultra-red",
      },
    });
    assert.deepEqual(clean, {
      models: { "demo-roadrunner": "model-y" },
      colors: { "demo-roadrunner": "ultra-red", truck: "ultra-red" },
      names: {},
      scene: "photo",
    });
  });

  it("keeps a typed name for that car and drops a blank or unsafe id", () => {
    const clean = sanitizeAppearance({
      names: {
        "demo-roadrunner": "  Daily driver  ",
        "../etc": "Nope",
        empty: "   ",
        long: "x".repeat(50),
      },
    });
    assert.equal(clean.names["demo-roadrunner"], "Daily driver");
    assert.equal(clean.names.long?.length, 40);
    assert.equal(clean.names.empty, undefined);
    assert.equal(clean.names["../etc"], undefined);
    assert.equal(clean.scene, "photo");
  });

  it("keeps a 3D scene and ignores anything else", () => {
    assert.equal(sanitizeAppearance({ scene: "model" }).scene, "model");
    assert.equal(sanitizeAppearance({ scene: "hologram" }).scene, "photo");
    assert.equal(sanitizeAppearance({ scene: "model", models: { car: "model-y" } }).models.car, "model-y");
  });
});
