import * as Phaser from 'phaser';

// A normalized coordinate system over a square play area. The Island helper
// draws the visuals and converts between unit (0..1) and screen pixel coords
// so the game logic never has to think about viewport size.

export const ISLAND_VIRTUAL_SIZE = 800;

export type IslandLayout = {
  originX: number; // top-left of play square on screen
  originY: number;
  size: number; // side length of square on screen
};

export const computeIslandLayout = (
  viewportWidth: number,
  viewportHeight: number,
  bottomReserveRatio = 0.22
): IslandLayout => {
  // Reserve some space at the bottom for the HUD on portrait phones.
  const availableHeight = viewportHeight * (1 - bottomReserveRatio);
  const size = Math.min(viewportWidth, availableHeight) * 0.96;
  const originX = (viewportWidth - size) / 2;
  const originY = Math.max(8, (availableHeight - size) / 2);
  return { originX, originY, size };
};

export const unitToScreen = (
  layout: IslandLayout,
  ux: number,
  uy: number
): { x: number; y: number } => ({
  x: layout.originX + ux * layout.size,
  y: layout.originY + uy * layout.size,
});

export const screenToUnit = (
  layout: IslandLayout,
  sx: number,
  sy: number
): { x: number; y: number } => ({
  x: (sx - layout.originX) / layout.size,
  y: (sy - layout.originY) / layout.size,
});

export const isInsideIsland = (
  layout: IslandLayout,
  sx: number,
  sy: number
): boolean =>
  sx >= layout.originX &&
  sx <= layout.originX + layout.size &&
  sy >= layout.originY &&
  sy <= layout.originY + layout.size;

// Deterministic palm + grass placements so the island looks the same every
// render. Coordinates are unit (0..1) within the play area.
const PALMS: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 0.28, y: 0.34, s: 1.0 },
  { x: 0.62, y: 0.28, s: 0.85 },
  { x: 0.42, y: 0.62, s: 1.1 },
  { x: 0.72, y: 0.58, s: 0.9 },
  { x: 0.36, y: 0.76, s: 0.8 },
  { x: 0.78, y: 0.42, s: 0.7 },
];

const GRASS_PATCHES: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 0.50, y: 0.42, r: 0.14 },
  { x: 0.34, y: 0.50, r: 0.08 },
  { x: 0.65, y: 0.66, r: 0.10 },
];

export const drawIsland = (
  g: Phaser.GameObjects.Graphics,
  layout: IslandLayout
): void => {
  g.clear();
  const { originX: x0, originY: y0, size } = layout;
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;

  // Ocean square (the play area). Slight gradient feel via two stacked rects.
  g.fillStyle(0x0e4f73, 1);
  g.fillRect(x0, y0, size, size);
  g.fillStyle(0x126a99, 0.55);
  g.fillRect(x0, y0, size, size * 0.55);

  // Subtle wave rings around the island.
  g.lineStyle(2, 0xffffff, 0.08);
  for (let i = 0; i < 3; i++) {
    g.strokeCircle(cx, cy, size * (0.36 + i * 0.045));
  }

  // Sand shoreline (slightly larger, paler ellipse).
  g.fillStyle(0xe9d49a, 1);
  g.fillEllipse(cx, cy, size * 0.74, size * 0.7);

  // Inner beach (warmer sand).
  g.fillStyle(0xefc97a, 1);
  g.fillEllipse(cx, cy, size * 0.68, size * 0.64);

  // Grass patches.
  g.fillStyle(0x6fa84a, 1);
  for (const p of GRASS_PATCHES) {
    g.fillEllipse(
      x0 + p.x * size,
      y0 + p.y * size,
      size * p.r * 2,
      size * p.r * 1.6
    );
  }

  // Darker grass shadow.
  g.fillStyle(0x57903a, 0.55);
  for (const p of GRASS_PATCHES) {
    g.fillEllipse(
      x0 + p.x * size + 4,
      y0 + p.y * size + 4,
      size * p.r * 1.7,
      size * p.r * 1.3
    );
  }

  // Palms (trunk + canopy).
  for (const palm of PALMS) {
    const px = x0 + palm.x * size;
    const py = y0 + palm.y * size;
    const s = palm.s * (size / ISLAND_VIRTUAL_SIZE);
    // Trunk.
    g.fillStyle(0x6b4423, 1);
    g.fillRect(px - 3 * s, py - 4 * s, 6 * s, 22 * s);
    // Canopy (three overlapping circles).
    g.fillStyle(0x2f7a36, 1);
    g.fillCircle(px - 10 * s, py - 6 * s, 11 * s);
    g.fillCircle(px + 10 * s, py - 6 * s, 11 * s);
    g.fillCircle(px, py - 14 * s, 12 * s);
    g.fillStyle(0x3aa248, 1);
    g.fillCircle(px, py - 10 * s, 7 * s);
  }

  // Compass rose in the top-left of the ocean area.
  const compR = Math.min(28, size * 0.05);
  const ccx = x0 + compR + 12;
  const ccy = y0 + compR + 12;
  g.lineStyle(2, 0xffffff, 0.45);
  g.strokeCircle(ccx, ccy, compR);
  g.lineBetween(ccx, ccy - compR, ccx, ccy + compR);
  g.lineBetween(ccx - compR, ccy, ccx + compR, ccy);
};
