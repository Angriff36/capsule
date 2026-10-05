import { describe, expect, it } from "vitest";
import {
  tilesAround,
  worldPixel,
} from "../src/lib/eventPacket/venueMapPicture";

describe("venue map picture tiles", () => {
  it("places a point where OpenStreetMap's tile grid puts it", () => {
    // Null Island sits at the centre of the world map.
    expect(worldPixel(0, 0, 1)).toEqual({ x: 256, y: 256 });
    // Boise, ID at zoom 16 falls in tile 11614 / 23927 (the standard
    // slippy-map formula: x = (lon+180)/360 * 2^z, y from ln(tan + sec)).
    const p = worldPixel(43.615, -116.2023, 16);
    expect(Math.floor(p.x / 256)).toBe(11614);
    expect(Math.floor(p.y / 256)).toBe(23927);
  });

  it("covers the whole picture with the venue in the middle", () => {
    const tiles = tilesAround(43.615, -116.2023);
    const lefts = tiles.map((t) => t.dx);
    const tops = tiles.map((t) => t.dy);
    expect(Math.min(...lefts)).toBeLessThanOrEqual(0);
    expect(Math.max(...lefts) + 256).toBeGreaterThanOrEqual(1024);
    expect(Math.min(...tops)).toBeLessThanOrEqual(0);
    expect(Math.max(...tops) + 256).toBeGreaterThanOrEqual(768);
    expect(tiles.length).toBeLessThanOrEqual(5 * 4);
  });
});
