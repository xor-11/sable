import React from 'react';
import { getPlayerAttack, getPlayerDefense } from '../engine/combat';
import { tileIndex } from '../engine/fov';
import {
  ENEMY_CATALOG,
  GameState,
  INVENTORY_CAPACITY,
  ITEM_CATALOG,
  ItemType,
  MAX_FLOORS,
  SURGE_ENERGY_COST,
  TileType,
} from '../engine/types';

interface HudRailProps {
  state: GameState;
  targetingSurge: boolean;
  onOpenInventory: () => void;
  onPickup: () => void;
  onDescend: () => void;
  onToggleSurge: () => void;
  onWait: () => void;
  onSave: () => void;
  onRequestQuit: () => void;
}

export const HudRail: React.FC<HudRailProps> = ({
  state,
  targetingSurge,
  onOpenInventory,
  onPickup,
  onDescend,
  onToggleSurge,
  onWait,
  onSave,
  onRequestQuit,
}) => {
  const { player, map } = state;
  const totalAtk = getPlayerAttack(state);
  const totalDef = getPlayerDefense(state);
  const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
  const enPct = Math.max(0, Math.min(100, (player.energy / player.maxEnergy) * 100));
  const xpPct = Math.max(0, Math.min(100, (player.xp / player.nextLevelXp) * 100));

  const hpStatus = hpPct > 55 ? 'Stable' : hpPct > 25 ? 'Caution' : 'Critical';
  const hpBarColor = hpPct > 55 ? 'bg-[#34D399]' : hpPct > 25 ? 'bg-[#F59E0B]' : 'bg-[#F87171]';
  const hpTextColor = hpPct > 55 ? 'text-[#34D399]' : hpPct > 25 ? 'text-[#F59E0B]' : 'text-[#F87171]';

  const hasFuse = player.inventory.some((i) => i.type === ItemType.FUSE);
  const onStairs = map.tiles[tileIndex(map, player.x, player.y)] === TileType.STAIRS_DOWN;
  const itemUnderfoot = state.groundItems.find((i) => i.x === player.x && i.y === player.y);

  // Check if a boss or mini-boss is currently visible
  const visibleBoss = state.enemies.find(
    (e) =>
      e.alive &&
      (e.type === 5 || e.type === 6) &&
      map.visible[tileIndex(map, e.x, e.y)] === 1
  );

  return (
    <aside className="w-full xl:w-[320px] shrink-0 flex flex-col gap-4 border border-[#232B3A] bg-[#121721] rounded-lg p-4">
      {/* Header Metadata (Unboxed, zero-pill) */}
      <div className="flex items-baseline justify-between border-b border-[#232B3A] pb-3">
        <div>
          <h2 className="text-base font-semibold text-[#E6EDF3] tracking-tight">Engineer</h2>
          <p className="text-xs font-mono text-[#768399] mt-0.5">
            Floor {state.floor}/{MAX_FLOORS} · Turn {state.turn}
          </p>
        </div>
        <div className="text-right font-mono text-xs text-[#768399]">
          <div>Seed {state.seed}</div>
          <div className="text-[#F59E0B] mt-0.5">{player.gold} Gold</div>
        </div>
      </div>

      {/* Vital Bars */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-[#A3B0C2]">Integrity (HP)</span>
            <span className={hpTextColor}>
              {player.hp}/{player.maxHp} · {hpStatus}
            </span>
          </div>
          <div className="h-2 w-full bg-[#0B0E14] rounded-sm overflow-hidden border border-[#232B3A]">
            <div
              className={`h-full transition-all duration-150 ${hpBarColor}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-[#A3B0C2]">Energy (Surge)</span>
            <span className="text-[#38BDF8]">
              {player.energy}/{player.maxEnergy}
            </span>
          </div>
          <div className="h-2 w-full bg-[#0B0E14] rounded-sm overflow-hidden border border-[#232B3A]">
            <div
              className="h-full bg-[#38BDF8] transition-all duration-150"
              style={{ width: `${enPct}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="text-[#768399]">Level {player.level}</span>
            <span className="text-[#A3B0C2]">
              XP {player.xp}/{player.nextLevelXp}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#0B0E14] rounded-sm overflow-hidden">
            <div
              className="h-full bg-[#A78BFA] transition-all duration-150"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Visible Boss Telemetry */}
      {visibleBoss && (
        <div className="p-3 rounded-md bg-[#1B1318] border border-[#7F1D1D]/70 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-semibold text-[#F87171]">
              {ENEMY_CATALOG[visibleBoss.type].name}
            </span>
            <span className="text-[#FCA5A5]">
              {visibleBoss.hp}/{visibleBoss.maxHp} HP
              {visibleBoss.type === 6 ? ` · P${visibleBoss.bossPhase}` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#0B0E14] rounded-sm overflow-hidden">
            <div
              className="h-full bg-[#F87171] transition-all duration-150"
              style={{ width: `${Math.max(0, (visibleBoss.hp / visibleBoss.maxHp) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Combat Stats & Gear */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 border-y border-[#232B3A] text-xs font-mono">
        <div className="flex justify-between">
          <span className="text-[#768399]">Attack</span>
          <span className="text-[#E6EDF3] font-semibold">{totalAtk}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#768399]">Defense</span>
          <span className="text-[#E6EDF3] font-semibold">{totalDef}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#768399]">Kills</span>
          <span className="text-[#E6EDF3]">{state.stats.kills}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#768399]">Pack</span>
          <span className="text-[#E6EDF3]">
            {player.inventory.length}/{INVENTORY_CAPACITY}
          </span>
        </div>
      </div>

      {/* Equipped Items & Active Floor Sensors */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-[#768399] shrink-0">Weapon</span>
          <span className="font-mono text-[#E6EDF3] truncate">
            {player.equippedWeapon
              ? `${ITEM_CATALOG[player.equippedWeapon.type].name} (+${player.equippedWeapon.value})`
              : 'Bare Hands'}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[#768399] shrink-0">Armor</span>
          <span className="font-mono text-[#E6EDF3] truncate">
            {player.equippedArmor
              ? `${ITEM_CATALOG[player.equippedArmor.type].name} (+${player.equippedArmor.value})`
              : 'Lab Coat'}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[#768399] shrink-0">Sensors</span>
          <span className="font-mono text-[#A3B0C2] truncate">
            {[
              hasFuse ? 'Fuse' : null,
              player.oscilloscopeActive ? 'Scope' : null,
              player.multimeterActive ? 'Meter' : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'None active'}
          </span>
        </div>
      </div>

      {/* Action Controls (single-line, high contrast, keyboard-hinted) */}
      <div className="pt-2 border-t border-[#232B3A] grid grid-cols-2 gap-2 mt-auto">
        <button
          type="button"
          onClick={onToggleSurge}
          disabled={player.energy < SURGE_ENERGY_COST && !targetingSurge}
          className={`px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
            targetingSurge
              ? 'bg-[#38BDF8] text-[#07090D] font-semibold'
              : player.energy >= SURGE_ENERGY_COST
              ? 'bg-[#171E2B] text-[#38BDF8] border border-[#38BDF8]/40 hover:bg-[#1E293B]'
              : 'bg-[#0E131C] text-[#4B5563] border border-[#232B3A] cursor-not-allowed'
          }`}
        >
          {targetingSurge ? 'Cancel Surge' : `Surge [f] (${SURGE_ENERGY_COST}E)`}
        </button>

        <button
          type="button"
          onClick={onOpenInventory}
          className="px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap bg-[#171E2B] text-[#E6EDF3] border border-[#232B3A] hover:bg-[#1F293B] transition-colors"
        >
          Inventory [i]
        </button>

        <button
          type="button"
          onClick={onPickup}
          disabled={!itemUnderfoot}
          className={`px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
            itemUnderfoot
              ? 'bg-[#171E2B] text-[#34D399] border border-[#34D399]/40 hover:bg-[#1F293B]'
              : 'bg-[#0E131C] text-[#4B5563] border border-[#232B3A] cursor-not-allowed'
          }`}
        >
          Pick Up [g]
        </button>

        <button
          type="button"
          onClick={onDescend}
          disabled={!onStairs}
          className={`px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
            onStairs
              ? 'bg-[#38BDF8] text-[#07090D] font-semibold hover:bg-[#7DD3FC]'
              : 'bg-[#0E131C] text-[#4B5563] border border-[#232B3A] cursor-not-allowed'
          }`}
        >
          Descend [&gt;]
        </button>

        <button
          type="button"
          onClick={onWait}
          className="px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap bg-[#171E2B] text-[#A3B0C2] border border-[#232B3A] hover:text-[#E6EDF3] hover:bg-[#1F293B] transition-colors"
        >
          Wait [.]
        </button>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 px-2 py-2 rounded-md text-xs font-medium whitespace-nowrap bg-[#171E2B] text-[#A3B0C2] border border-[#232B3A] hover:text-[#E6EDF3] hover:bg-[#1F293B] transition-colors"
          >
            Save [S]
          </button>
          <button
            type="button"
            onClick={onRequestQuit}
            className="px-2.5 py-2 rounded-md text-xs font-medium whitespace-nowrap bg-[#171E2B] text-[#F87171] border border-[#232B3A] hover:bg-[#2A171C] transition-colors"
          >
            Quit [q]
          </button>
        </div>
      </div>
    </aside>
  );
};
