import { connection, NextResponse } from "next/server";

const TILE = /^[0-9]{1,7}$/;

/** Street tiles for a share card. Same-origin so the canvas can export a PNG. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  await connection();
  const { z, x, y } = await context.params;
  if (!TILE.test(z) || !TILE.test(x) || !TILE.test(y)) {
    return new NextResponse(null, { status: 400 });
  }
  const zoom = Number(z);
  const column = Number(x);
  const row = Number(y);
  if (zoom > 19) return new NextResponse(null, { status: 400 });
  const world = 2 ** zoom;
  if (column >= world || row >= world) return new NextResponse(null, { status: 400 });
  try {
    const upstream = await fetch(`https://tile.openstreetmap.org/${zoom}/${column}/${row}.png`, {
      headers: {
        accept: "image/png",
        "user-agent": "VoltDesk/0.1 (self-hosted; +https://github.com/nasagreir/voltdesk)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return new NextResponse(null, { status: 502 });
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
