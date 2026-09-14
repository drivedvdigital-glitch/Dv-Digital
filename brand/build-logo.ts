/**
 * Generates the D&VFly mark as SVG.
 *
 * The mark is not a drawing — it is a rule: a 5x5 grid rotated 45 degrees,
 * where each tile grows as it moves away from the top vertex. Describing it as
 * geometry rather than shipping a bitmap means it is a few hundred bytes, scales
 * to any size without blurring, and recolours by changing one constant.
 *
 * That is the same argument the product makes about pages, applied to its own
 * logo, which felt like the right way to build it.
 *
 * Usage: node --experimental-strip-types brand/build-logo.ts
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Brand green.
 *
 * ⚠️ Estimated by eye from the supplied PNGs — the originals reached this
 * session as images in the conversation, not as files, so the pixel could not
 * be sampled. Replace with the exact value from the source artwork; it is the
 * only place the colour appears.
 */
export const BRAND_GREEN = '#0BE05C';

/** Grid is 5x5; rotating it 45 degrees yields rows of 1,2,3,4,5,4,3,2,1. */
const GRID = 5;

/**
 * Below roughly 32px the 25-tile mark collapses into a smudge — the fine tiles
 * near the top vertex land on less than a pixel each. A 3x3 grid keeps the same
 * idea (a diamond of diamonds, growing downward) with tiles big enough to
 * survive. Verified by rasterising at 16px, which is where favicons live.
 */
const GRID_SMALL = 3;

/** Tile size at the top vertex and at the bottom vertex. */
const TILE_MIN = 0.34;
const TILE_MAX = 0.88;

interface MarkOptions {
  /** Canvas edge, in SVG user units. */
  size?: number;
  color?: string;
  /** Painted behind the mark. Omit for a transparent background. */
  background?: string;
  /** Fraction of the canvas left empty around the mark, per side. */
  padding?: number;
  /** Tiles per side. Use GRID_SMALL for icons rendered below ~32px. */
  grid?: number;
}

/**
 * Tiles are laid out on the unrotated grid and the whole group is rotated, so
 * the spacing stays even and only one transform is needed.
 */
export function markSvg(options: MarkOptions = {}): string {
  const {
    size = 512,
    color = BRAND_GREEN,
    background,
    padding = 0.08,
    grid = GRID,
  } = options;

  // Cell pitch in grid space. The rotated grid's diagonal spans grid * pitch
  // * sqrt(2), which is what has to fit inside the padded canvas.
  const usable = 1 - padding * 2;
  const pitch = usable / (grid * Math.SQRT2);
  const origin = 0.5 - (grid * pitch) / 2;

  const tiles: string[] = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      // Distance from the top vertex, 0 at (0,0) and 1 at (grid-1, grid-1).
      const t = (row + col) / (2 * (grid - 1));
      const tile = pitch * (TILE_MIN + (TILE_MAX - TILE_MIN) * t);

      const cx = origin + (col + 0.5) * pitch;
      const cy = origin + (row + 0.5) * pitch;

      tiles.push(
        `<rect x="${fmt((cx - tile / 2) * size)}" y="${fmt((cy - tile / 2) * size)}" ` +
          `width="${fmt(tile * size)}" height="${fmt(tile * size)}"/>`,
      );
    }
  }

  const half = size / 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="D&amp;VFly">`,
  ];
  if (background) parts.push(`<rect width="${size}" height="${size}" fill="${background}"/>`);
  parts.push(
    `<g fill="${color}" transform="rotate(45 ${fmt(half)} ${fmt(half)})">`,
    ...tiles,
    '</g>',
    '</svg>',
  );
  return parts.join('');
}

/** Trims float noise so the output stays small and diffs stay readable. */
function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Rounded-square plate behind the mark. Shopify shows app icons on white and
 * light grey, where a bare green mark washes out, so the icon variant carries
 * its own dark ground.
 */
export function appIconSvg(size = 1200, ground = '#0B1410'): string {
  const radius = Math.round(size * 0.22);
  const inner = markSvg({ size, padding: 0.19 })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="D&amp;VFly">` +
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${ground}"/>` +
    inner +
    '</svg>'
  );
}

const outputs: Array<[string, string]> = [
  ['mark.svg', markSvg({ size: 512 })],
  ['mark-on-dark.svg', markSvg({ size: 512, background: '#000000' })],
  // The small-size variant. Fewer, larger tiles and tighter padding, because a
  // favicon has 16 pixels to work with and the full mark needs more.
  ['favicon.svg', markSvg({ size: 64, padding: 0.05, grid: GRID_SMALL })],
  ['app-icon.svg', appIconSvg()],
];

for (const [name, svg] of outputs) {
  const path = join(HERE, name);
  writeFileSync(path, svg + '\n');
  console.log(`  ${name.padEnd(20)} ${String(Buffer.byteLength(svg)).padStart(5)} bytes`);
}
