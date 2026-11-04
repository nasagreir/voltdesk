import { SHARE_CARD_MAX, SHARE_CARD_WIDTH, type ShareStat } from "./share-card";

export interface ShareCardPaint {
  title: string;
  subtitle: string;
  stats: ShareStat[];
  footnote: string;
}

function headingFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-heading").trim();
  return raw || "sans-serif";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Breaks on spaces, then on characters, and always advances. */
export function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      return;
    }
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (chunk && ctx.measureText(next).width > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    line = chunk;
  };
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
      continue;
    }
    if (line) lines.push(line);
    pushWord(word);
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  family: string,
  start: number,
  min: number,
  weight: number,
): number {
  let size = start;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return min;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, spacing: string) {
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
}

export function paintShareCard(canvas: HTMLCanvasElement, card: ShareCardPaint): void {
  const stats = card.stats.slice(0, SHARE_CARD_MAX);
  const width = SHARE_CARD_WIDTH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not build the PNG.");
  const family = headingFamily();
  const pad = 72;
  const titleWidth = width - pad * 2;
  const rows = Math.max(1, Math.ceil(stats.length / 2));
  const cols = stats.length === 1 ? 1 : 2;
  const gap = 20;
  const cellH = rows === 1 ? 280 : 230;

  canvas.width = width;
  canvas.height = 32;
  const titleSize = fitSize(ctx, card.title, titleWidth, family, 64, 36, 600);
  ctx.font = `600 ${titleSize}px ${family}`;
  const titleLines = wrapCanvasText(ctx, card.title, titleWidth).slice(0, 3);
  ctx.font = `400 30px ${family}`;
  const subtitleLines = wrapCanvasText(ctx, card.subtitle, titleWidth).slice(0, 2);
  const measured = 112 + titleLines.length * Math.round(titleSize * 1.12) + 18 + subtitleLines.length * 40;
  const gridTop = rows === 1 ? Math.max(measured + 40, 380) : measured + 36;
  const stack = rows * cellH + Math.max(0, rows - 1) * gap;
  const height = rows === 1 ? SHARE_CARD_WIDTH : gridTop + stack + 120;

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e31937";
  ctx.fillRect(0, 0, width, 12);
  roundRect(ctx, pad, 52, 22, 22, 5);
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#a1a1aa";
  ctx.font = `600 26px ${family}`;
  setLetterSpacing(ctx, "5px");
  ctx.fillText("VOLTDESK", pad + 38, 63);
  setLetterSpacing(ctx, "0px");

  ctx.textBaseline = "top";
  ctx.font = `600 ${titleSize}px ${family}`;
  let y = 112;
  for (const line of titleLines) {
    ctx.fillStyle = "#fafafa";
    ctx.fillText(line, pad, y);
    y += Math.round(titleSize * 1.12);
  }
  y += 18;
  ctx.fillStyle = "#a1a1aa";
  ctx.font = `400 30px ${family}`;
  for (const line of subtitleLines) {
    ctx.fillText(line, pad, y);
    y += 40;
  }

  const footnoteY = height - pad;
  const inner = width - pad * 2;
  const cellW = cols === 1 ? inner : (inner - gap) / 2;

  stats.forEach((stat, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const lastFull = cols === 2 && stats.length % 2 === 1 && index === stats.length - 1;
    const x = pad + (lastFull ? 0 : col * (cellW + gap));
    const w = lastFull ? inner : cellW;
    const cy = gridTop + row * (cellH + gap);
    ctx.fillStyle = "#141416";
    roundRect(ctx, x, cy, w, cellH, 28);
    ctx.fill();
    ctx.fillStyle = "#71717a";
    ctx.font = `600 22px ${family}`;
    setLetterSpacing(ctx, "2px");
    ctx.fillText(stat.label.toUpperCase(), x + 32, cy + 28);
    setLetterSpacing(ctx, "0px");
    const valueSize = fitSize(ctx, stat.value, w - 64, family, 56, 28, 600);
    ctx.font = `600 ${valueSize}px ${family}`;
    ctx.fillStyle = "#fafafa";
    ctx.fillText(stat.value, x + 32, cy + 72);
  });

  ctx.fillStyle = "#71717a";
  ctx.font = `400 24px ${family}`;
  ctx.fillText(card.footnote, pad, footnoteY);
}
