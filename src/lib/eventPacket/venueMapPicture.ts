import { geocodeDestination } from "../../features/logistics/routePlanner";
import type { AttachedPrintFile } from "./appendAttachedFiles";

const TILE = 256;
const ZOOM = 16;
const WIDTH = 1024;
const HEIGHT = 768;

/** World pixel position of a point at a zoom level (Web Mercator, as OSM tiles use). */
export function worldPixel(lat: number, lon: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** The tiles that cover a WIDTH x HEIGHT picture centred on the point. */
export function tilesAround(lat: number, lon: number, zoom = ZOOM) {
  const centre = worldPixel(lat, lon, zoom);
  const left = centre.x - WIDTH / 2;
  const top = centre.y - HEIGHT / 2;
  const tiles: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let x = Math.floor(left / TILE); x * TILE < left + WIDTH; x++)
    for (let y = Math.floor(top / TILE); y * TILE < top + HEIGHT; y++)
      tiles.push({ x, y, dx: x * TILE - left, dy: y * TILE - top });
  return tiles;
}

async function tileImage(x: number, y: number) {
  const response = await fetch(
    `https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`,
  );
  if (!response.ok) throw new Error(`map tile ${response.status}`);
  return createImageBitmap(await response.blob());
}

/**
 * Spec §14.1 part 8: the route part needs a map, not only a link a driver
 * cannot tap on paper. The venue address is found on OpenStreetMap (the same
 * keyless lookup the event map card and route planner use) and the street map
 * around it is drawn with a pin, as a picture that prints at the back of the
 * packet. No address, no match, or no network -> no picture; the packet still
 * prints with the map link.
 */
export async function venueMapPicture(
  address: string | null | undefined,
): Promise<AttachedPrintFile | null> {
  if (!address?.trim()) return null;
  try {
    const point = await geocodeDestination(address);
    if (!point) return null;
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const draw = canvas.getContext("2d");
    if (!draw) return null;
    const tiles = tilesAround(point.lat, point.lon);
    const images = await Promise.all(tiles.map((t) => tileImage(t.x, t.y)));
    tiles.forEach((t, i) => draw.drawImage(images[i], t.dx, t.dy));
    // Pin at the venue.
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    draw.fillStyle = "#b04f18";
    draw.strokeStyle = "#ffffff";
    draw.lineWidth = 4;
    draw.beginPath();
    draw.moveTo(cx, cy);
    draw.arc(cx, cy - 34, 18, Math.PI * 0.8, Math.PI * 0.2);
    draw.closePath();
    draw.fill();
    draw.stroke();
    draw.fillStyle = "#ffffff";
    draw.beginPath();
    draw.arc(cx, cy - 34, 7, 0, Math.PI * 2);
    draw.fill();
    // OpenStreetMap asks for this credit on every map picture.
    const credit = "© OpenStreetMap contributors";
    draw.font = "16px sans-serif";
    const w = draw.measureText(credit).width + 16;
    draw.fillStyle = "rgba(255,255,255,0.85)";
    draw.fillRect(WIDTH - w, HEIGHT - 26, w, 26);
    draw.fillStyle = "#222222";
    draw.fillText(credit, WIDTH - w + 8, HEIGHT - 8);
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, "image/jpeg", 0.85),
    );
    if (!blob) return null;
    return {
      name: `Venue map - ${address}`,
      contentType: "image/jpeg",
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  } catch {
    return null;
  }
}
