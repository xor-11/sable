import { inBounds, isWalkable, tileIndex } from './fov';
import { MinHeap } from './structures';
import { DungeonMap, Point } from './types';

/**
 * Hand-written Pathfinding Suite:
 * - A* shortest-path search powered by our binary MinHeap priority queue.
 * - BFS flood-fill connectivity validator used by dungeon generation.
 * - BFS distance map for Rogue Relay kiting/fleeing and headless bot exploration.
 */

const CARDINAL_AND_DIAGONAL_DIRS: ReadonlyArray<[number, number, number]> = [
  [0, -1, 10],
  [0, 1, 10],
  [-1, 0, 10],
  [1, 0, 10],
  [-1, -1, 14],
  [1, -1, 14],
  [-1, 1, 14],
  [1, 1, 14],
];

const CARDINAL_DIRS: ReadonlyArray<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Octile heuristic scaled by 10/14 for admissible 8-directional A*. */
function octileHeuristic(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const minD = Math.min(dx, dy);
  const maxD = Math.max(dx, dy);
  return minD * 14 + (maxD - minD) * 10;
}

/**
 * Find the shortest walkable path from start to goal using A* with our hand-written MinHeap.
 * Returns the sequence of steps EXCLUDING start and INCLUDING goal, or [] if unreachable.
 */
export function findPathAStar(
  map: DungeonMap,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  isBlocked?: (x: number, y: number) => boolean,
  allowDiagonals = true,
  maxExpanded = 1500
): Point[] {
  if (startX === goalX && startY === goalY) return [];
  if (!inBounds(map, startX, startY) || !inBounds(map, goalX, goalY)) return [];
  if (!isWalkable(map, goalX, goalY)) return [];

  const totalCells = map.width * map.height;
  const gScore = new Int32Array(totalCells);
  gScore.fill(0x3fffffff);
  const cameFrom = new Int32Array(totalCells);
  cameFrom.fill(-1);
  const closed = new Uint8Array(totalCells);

  const startIdx = tileIndex(map, startX, startY);
  const goalIdx = tileIndex(map, goalX, goalY);
  gScore[startIdx] = 0;

  const openHeap = new MinHeap<number>();
  openHeap.push(startIdx, octileHeuristic(startX, startY, goalX, goalY));

  let expanded = 0;

  while (!openHeap.isEmpty() && expanded < maxExpanded) {
    const currentIdx = openHeap.pop()!;
    if (closed[currentIdx]) continue;
    closed[currentIdx] = 1;
    expanded++;

    if (currentIdx === goalIdx) {
      const path: Point[] = [];
      let cursor = goalIdx;
      while (cursor !== startIdx && cursor !== -1) {
        path.push({
          x: cursor % map.width,
          y: Math.floor(cursor / map.width),
        });
        cursor = cameFrom[cursor];
      }
      path.reverse();
      return path;
    }

    const cx = currentIdx % map.width;
    const cy = Math.floor(currentIdx / map.width);
    const currentG = gScore[currentIdx];

    const dirs = allowDiagonals ? CARDINAL_AND_DIAGONAL_DIRS : CARDINAL_AND_DIAGONAL_DIRS.slice(0, 4);

    for (const [dx, dy, moveCost] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(map, nx, ny)) continue;

      // Prevent squeezing diagonally between two solid walls
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(map, cx + dx, cy) || !isWalkable(map, cx, cy + dy)) {
          continue;
        }
      }

      const nIdx = tileIndex(map, nx, ny);
      if (closed[nIdx]) continue;

      // Allow stepping into the goal tile even if occupied by the target entity (e.g., player)
      if (nIdx !== goalIdx && isBlocked && isBlocked(nx, ny)) {
        continue;
      }

      const tentativeG = currentG + moveCost;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = currentIdx;
        gScore[nIdx] = tentativeG;
        const fScore = tentativeG + octileHeuristic(nx, ny, goalX, goalY);
        openHeap.push(nIdx, fScore);
      }
    }
  }

  return [];
}

/**
 * BFS Flood Fill connectivity check.
 * Verifies that every single walkable tile on the dungeon floor is reachable from one seed tile.
 */
export function verifyMapConnectivityBFS(map: DungeonMap): {
  connected: boolean;
  totalWalkable: number;
  reachedWalkable: number;
} {
  let startX = -1;
  let startY = -1;
  let totalWalkable = 0;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkable(map, x, y)) {
        totalWalkable++;
        if (startX === -1) {
          startX = x;
          startY = y;
        }
      }
    }
  }

  if (totalWalkable === 0) {
    return { connected: false, totalWalkable: 0, reachedWalkable: 0 };
  }

  const visited = new Uint8Array(map.width * map.height);
  const queue = new Int32Array(map.width * map.height);
  let head = 0;
  let tail = 0;

  const startIdx = tileIndex(map, startX, startY);
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++];
    const cx = idx % map.width;
    const cy = Math.floor(idx / map.width);

    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const nIdx = tileIndex(map, nx, ny);
      if (!visited[nIdx]) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  return {
    connected: tail === totalWalkable,
    totalWalkable,
    reachedWalkable: tail,
  };
}

/**
 * Compute BFS shortest-step distance grid from a source point across walkable tiles.
 * Unreachable tiles receive -1. Used by FLEE AI (kiting away from player) and bot exploration.
 */
export function computeBFSDistanceMap(
  map: DungeonMap,
  originX: number,
  originY: number,
  maxRadius = 40
): Int16Array {
  const dist = new Int16Array(map.width * map.height);
  dist.fill(-1);

  if (!inBounds(map, originX, originY)) return dist;

  const queue = new Int32Array(map.width * map.height);
  let head = 0;
  let tail = 0;

  const startIdx = tileIndex(map, originX, originY);
  dist[startIdx] = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++];
    const d = dist[idx];
    if (d >= maxRadius) continue;

    const cx = idx % map.width;
    const cy = Math.floor(idx / map.width);

    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const nIdx = tileIndex(map, nx, ny);
      if (dist[nIdx] === -1) {
        dist[nIdx] = d + 1;
        queue[tail++] = nIdx;
      }
    }
  }

  return dist;
}

/**
 * Pick an adjacent walkable step that maximizes BFS distance away from a threat (FLEE AI).
 */
export function findBestFleeStepBFS(
  map: DungeonMap,
  fromX: number,
  fromY: number,
  threatX: number,
  threatY: number,
  isBlocked: (x: number, y: number) => boolean
): Point | null {
  const distMap = computeBFSDistanceMap(map, threatX, threatY, 24);
  let bestPoint: Point | null = null;
  let bestDist = distMap[tileIndex(map, fromX, fromY)];

  for (const [dx, dy] of CARDINAL_AND_DIAGONAL_DIRS) {
    const nx = fromX + dx;
    const ny = fromY + dy;
    if (!isWalkable(map, nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (!isWalkable(map, fromX + dx, fromY) || !isWalkable(map, fromX, fromY + dy)) {
        continue;
      }
    }
    if (isBlocked(nx, ny)) continue;
    const d = distMap[tileIndex(map, nx, ny)];
    if (d > bestDist) {
      bestDist = d;
      bestPoint = { x: nx, y: ny };
    }
  }

  return bestPoint;
}
