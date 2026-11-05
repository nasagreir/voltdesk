import { frameRoute, type LatLng } from "./route-frame";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Stitches dark map tiles for a drive. Null when the tiles do not come back. */
export async function routeBackdrop(
  points: LatLng[],
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  const frame = frameRoute(points, width, height);
  if (!frame || typeof document === "undefined") return null;
  const images = await Promise.all(
    frame.tiles.map(async (tile) => ({
      tile,
      image: await loadImage(`/api/map/${tile.z}/${tile.x}/${tile.y}?v=osm`),
    })),
  );
  const ready = images.filter((item) => item.image);
  if (ready.length < Math.ceil(frame.tiles.length / 2)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);
  ctx.filter = "invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.95)";
  for (const item of ready) {
    if (!item.image) continue;
    ctx.drawImage(item.image, item.tile.left, item.tile.top);
  }
  ctx.filter = "none";
  return canvas;
}
