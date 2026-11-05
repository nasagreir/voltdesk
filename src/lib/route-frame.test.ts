import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameRoute, usableRoute } from "./route-frame";

const drive = [
  { lat: 41.9482, lng: -87.6684 },
  { lat: 41.955, lng: -87.66 },
  { lat: 41.97, lng: -87.64 },
  { lat: 41.99, lng: -87.63 },
];

describe("trip map frame", () => {
  it("drops a point that is not a coordinate", () => {
    assert.deepEqual(usableRoute([{ lat: 41, lng: -87 }, { lat: Number.NaN, lng: 0 }, { lat: 91, lng: 0 }]), [
      { lat: 41, lng: -87 },
    ]);
  });

  it("fits a drive inside the card and stays off the edges", () => {
    const frame = frameRoute(drive, 1080, 878);
    assert.ok(frame);
    assert.ok(frame.zoom >= 3 && frame.zoom <= 15);
    assert.ok(frame.tiles.length > 0);
    assert.ok(frame.tiles.length <= 20);
    for (const point of drive) {
      const pixel = frame.project(point);
      assert.ok(pixel.x > 80 && pixel.x < 1000, `x ${pixel.x}`);
      assert.ok(pixel.y > 80 && pixel.y < 798, `y ${pixel.y}`);
    }
    const start = frame.project(drive[0]);
    const end = frame.project(drive[3]);
    assert.ok(Math.hypot(end.x - start.x, end.y - start.y) > 40);
  });

  it("returns nothing for a single point", () => {
    assert.equal(frameRoute([{ lat: 41.95, lng: -87.66 }], 1080, 878), null);
  });
});
