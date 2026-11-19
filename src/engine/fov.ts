import { DungeonMap, Point, TileType } from './types';

/**
 * 8-Octant Recursive Shadowcasting Field of View.
 * Computes exact visible tiles in O(R^2) without ray-skipping artifacts,
 * updates explored-tile memory, and exposes helper line-of-sight utilities.
 */

const OCTANT_MULTIPLIERS: ReadonlyArray<[number, number, number, number]> = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

export function inBounds(map: DungeonMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileIndex(map: DungeonMap, x: number, y: number): number {
  return y * map.width + x;
}

export function isOpaque(map: DungeonMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  return map.tiles[tileIndex(map, x, y)] === TileType.WALL;
}

export function isWalkable(map: DungeonMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  return map.tiles[tileIndex(map, x, y)] !== TileType.WALL;
}

/**
 * Recompute map.visible using 8-octant recursive shadowcasting and mark newly seen tiles explored.
 */
export function computeShadowcastFOV(
  map: DungeonMap,
  originX: number,
  originY: number,
  radius: number
): void {
  map.visible.fill(0);

  if (!inBounds(map, originX, originY)) return;

  const originIdx = tileIndex(map, originX, originY);
  map.visible[originIdx] = 1;
  map.explored[originIdx] = 1;

  const radiusSq = radius * radius;

  const castLight = (
    row: number,
    startSlope: number,
    endSlope: number,
    xx: number,
    xy: number,
    yx: number,
    yy: number
  ): void => {
    if (startSlope < endSlope) return;
    let nextStartSlope = startSlope;

    for (let distance = row; distance <= radius; distance++) {
      let blocked = false;
      const dy = -distance;

      for (let dx = -distance; dx <= 0; dx++) {
        const leftSlope = (dx - 0.5) / (dy + 0.5);
        const rightSlope = (dx + 0.5) / (dy - 0.5);

        if (rightSlope > nextStartSlope) continue;
        if (leftSlope < endSlope) break;

        const mapX = originX + dx * xx + dy * xy;
        const mapY = originY + dx * yx + dy * yy;

        if (dx * dx + dy * dy <= radiusSq && inBounds(map, mapX, mapY)) {
          const idx = tileIndex(map, mapX, mapY);
          map.visible[idx] = 1;
          map.explored[idx] = 1;
        }

        const wallHere = isOpaque(map, mapX, mapY);
        if (blocked) {
          if (wallHere) {
            nextStartSlope = rightSlope;
          } else {
            blocked = false;
            startSlope = nextStartSlope;
          }
        } else if (wallHere && distance < radius) {
          blocked = true;
          castLight(distance + 1, startSlope, leftSlope, xx, xy, yx, yy);
          nextStartSlope = rightSlope;
        }
      }

      if (blocked) break;
    }
  };

  for (const [xx, xy, yx, yy] of OCTANT_MULTIPLIERS) {
    castLight(1, 1.0, 0.0, xx, xy, yx, yy);
  }
}

/**
 * Reveal all tiles on the floor (Oscilloscope effect).
 */
export function revealEntireMap(map: DungeonMap): void {
  map.explored.fill(1);
}

/**
 * Bresenham line-of-sight check between two coordinates within an optional max distance.
 * Used for enemy vision checks and Surge beam ray tracing.
 */
export function hasLineOfSight(
  map: DungeonMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  maxDistance: number
): boolean {
  const dxDist = x1 - x0;
  const dyDist = y1 - y0;
  if (dxDist * dxDist + dyDist * dyDist > maxDistance * maxDistance) {
    return false;
  }

  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x === x1 && y === y1) return true;
    if ((x !== x0 || y !== y0) && isOpaque(map, x, y)) {
      return false;
    }
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Compute straight-line beam cells from origin along direction (dx, dy) up to maxRange, stopping at walls.
 */
export function traceBeam(
  map: DungeonMap,
  originX: number,
  originY: number,
  dx: number,
  dy: number,
  maxRange: number
): Point[] {
  const cells: Point[] = [];
  if (dx === 0 && dy === 0) return cells;

  let cx = originX;
  let cy = originY;
  for (let step = 0; step < maxRange; step++) {
    cx += dx;
    cy += dy;
    if (!inBounds(map, cx, cy) || isOpaque(map, cx, cy)) {
      break;
    }
    cells.push({ x: cx, y: cy });
  }
  return cells;
}

/**
 * Compute visible perimeter wall endpoints for the live Shadowcasting FOV visualization overlay.
 */
export function computeFovBoundaryRays(
  map: DungeonMap,
  originX: number,
  originY: number,
  radius: number
): Point[] {
  const hits: Point[] = [];
  const rayCount = 32;
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let lastX = originX;
    let lastY = originY;
    for (let step = 1; step <= radius; step++) {
      const rx = Math.round(originX + cos * step);
      const ry = Math.round(originY + sin * step);
      if (!inBounds(map, rx, ry)) break;
      lastX = rx;
      lastY = ry;
      if (isOpaque(map, rx, ry)) break;
    }
    hits.push({ x: lastX, y: lastY });
  }
  return hits;
}
