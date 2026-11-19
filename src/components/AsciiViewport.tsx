import React, { useEffect, useMemo, useRef, useState } from 'react';
import { computeFovBoundaryRays, tileIndex, traceBeam } from '../engine/fov';
import {
  AI_STATE_NAMES,
  AIState,
  ENEMY_CATALOG,
  GameEvent,
  GameState,
  ITEM_CATALOG,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_FOV_RADIUS,
  Point,
  SURGE_RANGE,
  TileType,
} from '../engine/types';

interface FlashEffect {
  cells: Point[];
  color: string;
  expiresAt: number;
}

interface AsciiViewportProps {
  state: GameState;
  turnTick: number;
  lastEvents: GameEvent[];
  eventSeq: number;
  monochrome: boolean;
  showPathOverlay: boolean;
  showFovOverlay: boolean;
  targetingSurge: boolean;
  onTileClick: (x: number, y: number) => void;
}

const CELL_W = 15;
const CELL_H = 22;
const CANVAS_W = MAP_WIDTH * CELL_W;
const CANVAS_H = MAP_HEIGHT * CELL_H;

export const AsciiViewport: React.FC<AsciiViewportProps> = ({
  state,
  turnTick,
  lastEvents,
  eventSeq,
  monochrome,
  showPathOverlay,
  showFovOverlay,
  targetingSurge,
  onTileClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCell, setHoverCell] = useState<Point | null>(null);
  const [flashEffects, setFlashEffects] = useState<FlashEffect[]>([]);

  // Trigger brief visual effects from turn events (respecting prefers-reduced-motion)
  useEffect(() => {
    if (eventSeq === 0 || lastEvents.length === 0) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const now = performance.now();
    const added: FlashEffect[] = [];

    for (const ev of lastEvents) {
      if (ev.type === 'SURGE' && ev.cells) {
        added.push({ cells: ev.cells, color: '#38BDF8', expiresAt: now + 180 });
      } else if (ev.type === 'EXPLOSION' && ev.cells) {
        added.push({ cells: ev.cells, color: '#F59E0B', expiresAt: now + 200 });
      } else if (ev.type === 'SCROLL' && ev.cells && ev.cells.length > 0) {
        added.push({ cells: ev.cells, color: '#F472B6', expiresAt: now + 190 });
      } else if ((ev.type === 'HIT' || ev.type === 'CRIT') && ev.x !== undefined && ev.y !== undefined) {
        added.push({
          cells: [{ x: ev.x, y: ev.y }],
          color: ev.type === 'CRIT' ? '#F59E0B' : '#F87171',
          expiresAt: now + 140,
        });
      } else if (ev.type === 'PLAYER_HIT' && ev.x !== undefined && ev.y !== undefined) {
        added.push({
          cells: [{ x: ev.x, y: ev.y }],
          color: '#EF4444',
          expiresAt: now + 160,
        });
      }
    }

    if (added.length > 0) {
      setFlashEffects(added);
      const timer = window.setTimeout(() => {
        setFlashEffects([]);
      }, 210);
      return () => window.clearTimeout(timer);
    }
  }, [eventSeq, lastEvents]);

  // Compute surge preview beam when targeting
  const surgePreviewCells = useMemo(() => {
    if (!targetingSurge) return [];
    let dx = state.player.lastDirX;
    let dy = state.player.lastDirY;
    if (hoverCell && (hoverCell.x !== state.player.x || hoverCell.y !== state.player.y)) {
      dx = Math.sign(hoverCell.x - state.player.x);
      dy = Math.sign(hoverCell.y - state.player.y);
    }
    if (dx === 0 && dy === 0) dx = 1;
    return traceBeam(state.map, state.player.x, state.player.y, dx, dy, SURGE_RANGE);
  }, [targetingSurge, hoverCell, state.map, state.player.x, state.player.y, state.player.lastDirX, state.player.lastDirY, turnTick]);

  // Render ASCII grid + overlays onto crisp DPR-scaled canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_W * dpr || canvas.height !== CANVAS_H * dpr) {
      canvas.width = CANVAS_W * dpr;
      canvas.height = CANVAS_H * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear viewport background
    ctx.fillStyle = '#07090D';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const { map, player, enemies, groundItems } = state;

    // 1. Optional Shadowcasting FOV boundary rays & sight radius backdrop
    if (showFovOverlay) {
      const originPxX = player.x * CELL_W + CELL_W / 2;
      const originPxY = player.y * CELL_H + CELL_H / 2;
      const rays = computeFovBoundaryRays(map, player.x, player.y, PLAYER_FOV_RADIUS);

      ctx.save();
      ctx.strokeStyle = monochrome ? 'rgba(226, 232, 240, 0.22)' : 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1;
      for (const hit of rays) {
        ctx.beginPath();
        ctx.moveTo(originPxX, originPxY);
        ctx.lineTo(hit.x * CELL_W + CELL_W / 2, hit.y * CELL_H + CELL_H / 2);
        ctx.stroke();
      }

      // Sight radius ellipse matching cell aspect ratio
      ctx.strokeStyle = monochrome ? 'rgba(226, 232, 240, 0.4)' : 'rgba(56, 189, 248, 0.45)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(
        originPxX,
        originPxY,
        PLAYER_FOV_RADIUS * CELL_W,
        PLAYER_FOV_RADIUS * CELL_H,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render map tiles (visible lit vs explored dimmed)
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const idx = tileIndex(map, x, y);
        const isVis = map.visible[idx] === 1;
        const isExp = map.explored[idx] === 1;
        if (!isVis && !isExp) continue;

        const tile = map.tiles[idx];
        const px = x * CELL_W;
        const py = y * CELL_H;

        // Subtle lit floor tint for currently visible walkable tiles
        if (isVis && tile !== TileType.WALL) {
          ctx.fillStyle = monochrome ? 'rgba(226, 232, 240, 0.045)' : 'rgba(56, 189, 248, 0.045)';
          ctx.fillRect(px, py, CELL_W, CELL_H);
        }

        let glyph = ' ';
        let color = '#475569';

        switch (tile) {
          case TileType.WALL:
            glyph = '#';
            if (monochrome) {
              color = isVis ? '#A8B3C5' : '#303949';
            } else {
              color = isVis ? '#586780' : '#252E3F';
            }
            break;
          case TileType.FLOOR:
            glyph = '·';
            if (monochrome) {
              color = isVis ? '#94A3B8' : '#2A3342';
            } else {
              color = isVis ? '#4D617A' : '#202938';
            }
            break;
          case TileType.CORRIDOR:
            glyph = '.';
            if (monochrome) {
              color = isVis ? '#7D8A9E' : '#262F3D';
            } else {
              color = isVis ? '#3E546E' : '#1E2736';
            }
            break;
          case TileType.STAIRS_DOWN:
            glyph = '>';
            if (monochrome) {
              color = isVis ? '#F8FAFC' : '#7C8798';
            } else {
              color = isVis ? '#38BDF8' : '#1D5E7A';
            }
            break;
        }

        ctx.fillStyle = color;
        ctx.fillText(glyph, px + CELL_W / 2, py + CELL_H / 2 + 1);
      }
    }

    // 3. Surge targeting preview cells
    if (targetingSurge && surgePreviewCells.length > 0) {
      ctx.fillStyle = monochrome ? 'rgba(248, 250, 252, 0.2)' : 'rgba(56, 189, 248, 0.22)';
      for (const cell of surgePreviewCells) {
        ctx.fillRect(cell.x * CELL_W + 1, cell.y * CELL_H + 1, CELL_W - 2, CELL_H - 2);
      }
    }

    // 4. Ground items (visible, or explored if Oscilloscope revealed)
    for (const item of groundItems) {
      const idx = tileIndex(map, item.x, item.y);
      const isVis = map.visible[idx] === 1;
      if (!isVis && !(player.oscilloscopeActive && map.explored[idx] === 1)) continue;
      const tmpl = ITEM_CATALOG[item.type];
      ctx.fillStyle = monochrome
        ? isVis
          ? '#E2E8F0'
          : '#64748B'
        : isVis
        ? tmpl.color
        : '#4B5563';
      ctx.fillText(tmpl.glyph, item.x * CELL_W + CELL_W / 2, item.y * CELL_H + CELL_H / 2 + 1);
    }

    // 5. Optional Live A* Pathfinding & AI State Overlay
    if (showPathOverlay) {
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.debugPath.length === 0) continue;
        const isVis = map.visible[tileIndex(map, enemy.x, enemy.y)] === 1;
        if (!isVis && !player.oscilloscopeActive) continue;

        const isFlee = enemy.aiState === AIState.FLEE;
        const strokeColor = monochrome
          ? 'rgba(226, 232, 240, 0.65)'
          : isFlee
          ? 'rgba(56, 189, 248, 0.78)'
          : 'rgba(248, 113, 113, 0.72)';

        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(enemy.x * CELL_W + CELL_W / 2, enemy.y * CELL_H + CELL_H / 2);
        for (const step of enemy.debugPath) {
          ctx.lineTo(step.x * CELL_W + CELL_W / 2, step.y * CELL_H + CELL_H / 2);
        }
        ctx.stroke();

        // Draw step nodes along computed A* path
        ctx.fillStyle = strokeColor;
        for (const step of enemy.debugPath) {
          ctx.fillRect(step.x * CELL_W + CELL_W / 2 - 2, step.y * CELL_H + CELL_H / 2 - 2, 4, 4);
        }
        ctx.restore();
      }
    }

    // 6. Visible enemies (+ Multimeter HP bars & AI state tags if enabled)
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const idx = tileIndex(map, enemy.x, enemy.y);
      if (map.visible[idx] !== 1) continue;

      const tmpl = ENEMY_CATALOG[enemy.type];
      const px = enemy.x * CELL_W;
      const py = enemy.y * CELL_H;

      // Clear background under enemy glyph so grid dot doesn't clutter it
      ctx.fillStyle = '#07090D';
      ctx.fillRect(px + 1, py + 1, CELL_W - 2, CELL_H - 2);

      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillStyle = monochrome ? '#F8FAFC' : tmpl.color;
      ctx.fillText(tmpl.glyph, px + CELL_W / 2, py + CELL_H / 2 + 1);

      // Multimeter active OR boss: render clean crisp HP bar at bottom of enemy cell
      if (player.multimeterActive || enemy.type === 5 || enemy.type === 6) {
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(px + 1, py + CELL_H - 3, CELL_W - 2, 2);
        ctx.fillStyle = monochrome ? '#E2E8F0' : ratio > 0.5 ? '#34D399' : ratio > 0.25 ? '#F59E0B' : '#F87171';
        ctx.fillRect(px + 1, py + CELL_H - 3, Math.max(1, Math.round((CELL_W - 2) * ratio)), 2);
      }

      // AI state letter badge when A* overlay is enabled
      if (showPathOverlay) {
        const code = AI_STATE_NAMES[enemy.aiState][0];
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillStyle = monochrome ? '#CBD5E1' : '#FACC15';
        ctx.fillText(code, px + CELL_W - 3, py + 5);
        ctx.font = '600 15px "JetBrains Mono", monospace';
      }
    }

    // 7. Player '@'
    {
      const px = player.x * CELL_W;
      const py = player.y * CELL_H;
      ctx.fillStyle = '#07090D';
      ctx.fillRect(px + 1, py + 1, CELL_W - 2, CELL_H - 2);
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.fillStyle = monochrome ? '#FFFFFF' : '#38BDF8';
      ctx.fillText('@', px + CELL_W / 2, py + CELL_H / 2 + 1);
    }

    // 8. Combat & ability flash effects
    for (const fx of flashEffects) {
      ctx.fillStyle = monochrome ? 'rgba(255, 255, 255, 0.35)' : `${fx.color}55`;
      for (const c of fx.cells) {
        ctx.fillRect(c.x * CELL_W, c.y * CELL_H, CELL_W, CELL_H);
      }
    }

    // 9. Hover cursor outline
    if (hoverCell) {
      ctx.strokeStyle = targetingSurge ? '#38BDF8' : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        hoverCell.x * CELL_W + 0.5,
        hoverCell.y * CELL_H + 0.5,
        CELL_W - 1,
        CELL_H - 1
      );
    }

    ctx.restore();
  }, [state, turnTick, monochrome, showPathOverlay, showFovOverlay, targetingSurge, surgePreviewCells, hoverCell, flashEffects]);

  const toGridCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const gx = Math.floor(((e.clientX - rect.left) * scaleX) / CELL_W);
    const gy = Math.floor(((e.clientY - rect.top) * scaleY) / CELL_H);
    if (gx < 0 || gy < 0 || gx >= MAP_WIDTH || gy >= MAP_HEIGHT) return null;
    return { x: gx, y: gy };
  };

  // Build hover inspection summary
  const inspectSummary = useMemo(() => {
    if (targetingSurge) {
      return 'Surge targeting active — press any movement key or click a direction to fire (Esc to cancel)';
    }
    if (!hoverCell) {
      return 'Move: Arrows / WASD / hjkl+yubn · Click adjacent tile to step or attack · Hover any tile to inspect';
    }
    const { x, y } = hoverCell;
    const idx = tileIndex(state.map, x, y);
    const isVis = state.map.visible[idx] === 1;
    const isExp = state.map.explored[idx] === 1;

    if (!isVis && !isExp) return `(${x}, ${y}) · Unexplored void`;
    if (x === state.player.x && y === state.player.y) {
      return `(${x}, ${y}) · @ Engineer · HP ${state.player.hp}/${state.player.maxHp} · Energy ${state.player.energy}/${state.player.maxEnergy}`;
    }

    if (isVis) {
      const enemy = state.enemies.find((e) => e.alive && e.x === x && e.y === y);
      if (enemy) {
        const tmpl = ENEMY_CATALOG[enemy.type];
        const hpLabel =
          state.player.multimeterActive || enemy.type >= 5
            ? `HP ${enemy.hp}/${enemy.maxHp}`
            : enemy.hp === enemy.maxHp
            ? 'Healthy'
            : enemy.hp > enemy.maxHp * 0.45
            ? 'Damaged'
            : 'Critical';
        const phaseNote =
          enemy.type === 6 ? ` · Phase ${enemy.bossPhase}/3` : '';
        return `(${x}, ${y}) · ${tmpl.glyph} ${tmpl.name} · ${hpLabel} · AI ${AI_STATE_NAMES[enemy.aiState]}${phaseNote} — ${tmpl.description}`;
      }

      const item = state.groundItems.find((it) => it.x === x && it.y === y);
      if (item) {
        const tmpl = ITEM_CATALOG[item.type];
        return `(${x}, ${y}) · ${tmpl.glyph} ${tmpl.name} — ${tmpl.description}`;
      }
    }

    const tile = state.map.tiles[idx];
    const tileLabel =
      tile === TileType.WALL
        ? 'Insulated Wall (#)'
        : tile === TileType.STAIRS_DOWN
        ? 'Descent Port (>) — Press > while standing here to descend'
        : tile === TileType.CORRIDOR
        ? 'Bus Corridor (.)'
        : 'Circuit Floor (·)';
    return `(${x}, ${y}) · ${tileLabel}${isVis ? '' : ' · Explored memory'}`;
  }, [hoverCell, state, turnTick, targetingSurge]);

  return (
    <div className="flex flex-col border border-[#232B3A] bg-[#07090D] rounded-lg overflow-hidden">
      <div className="relative flex items-center justify-center p-2 bg-[#07090D]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', maxWidth: `${CANVAS_W}px`, aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
          className="block cursor-crosshair select-none"
          onMouseMove={(e) => setHoverCell(toGridCoords(e))}
          onMouseLeave={() => setHoverCell(null)}
          onClick={(e) => {
            const pt = toGridCoords(e);
            if (pt) onTileClick(pt.x, pt.y);
          }}
        />
      </div>
      <div className="px-3 py-2 border-t border-[#232B3A] bg-[#0E131C] text-xs font-mono text-[#9FB0C7] truncate">
        {inspectSummary}
      </div>
    </div>
  );
};
