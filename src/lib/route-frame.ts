export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapTile {
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

export interface RouteFrame {
  zoom: number;
  tiles: MapTile[];
  project: (point: LatLng) => { x: number; y: number };
}

const TILE = 256;
const MAX_TILES = 20;

export function usableRoute(points: LatLng[]): LatLng[] {
  return points.filter(
    (point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lat) <= 85 &&
      Math.abs(point.lng) <= 180,
  );
}

/** Web Mercator pixel at the top-left of the world for this zoom. */
export function mercator(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const world = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * world;
  const sine = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * world;
  return { x, y };
}

/**
 * Fits a drive into the card. Highest zoom that keeps the path inside the
 * padding and stays within a handful of map tiles. Null when there is no path.
 */
export function frameRoute(points: LatLng[], width: number, height: number): RouteFrame | null {
  const route = usableRoute(points);
  if (route.length < 2 || width < 64 || height < 64) return null;
  const padX = width * 0.14;
  const padY = height * 0.18;
  const roomX = width - padX * 2;
  const roomY = height - padY * 2;
  if (roomX < 32 || roomY < 32) return null;

  for (let zoom = 15; zoom >= 3; zoom -= 1) {
    const projected = route.map((point) => mercator(point.lat, point.lng, zoom));
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const minY = Math.min(...projected.map((point) => point.y));
    const maxY = Math.max(...projected.map((point) => point.y));
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    if (spanX > roomX || spanY > roomY) continue;
    const originX = (minX + maxX) / 2 - width / 2;
    const originY = (minY + maxY) / 2 - height / 2;
    const n = 2 ** zoom;
    const x0 = Math.floor(originX / TILE);
    const y0 = Math.floor(originY / TILE);
    const x1 = Math.floor((originX + width - 1) / TILE);
    const y1 = Math.floor((originY + height - 1) / TILE);
    const tiles: MapTile[] = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (y < 0 || y >= n) continue;
        const wrapped = ((x % n) + n) % n;
        tiles.push({
          z: zoom,
          x: wrapped,
          y,
          left: x * TILE - originX,
          top: y * TILE - originY,
        });
      }
    }
    if (tiles.length === 0 || tiles.length > MAX_TILES) continue;
    return {
      zoom,
      tiles,
      project(point: LatLng) {
        const pixel = mercator(point.lat, point.lng, zoom);
        return { x: pixel.x - originX, y: pixel.y - originY };
      },
    };
  }
  return null;
}
