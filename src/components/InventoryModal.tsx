import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  GameState,
  INVENTORY_CAPACITY,
  ITEM_CATALOG,
  ItemCategory,
} from '../engine/types';

interface InventoryModalProps {
  state: GameState;
  onUse: (index: number) => void;
  onEquip: (index: number) => void;
  onDrop: (index: number) => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  state,
  onUse,
  onEquip,
  onDrop,
  onClose,
}) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const items = state.player.inventory;

  useEffect(() => {
    if (selectedIdx >= items.length && items.length > 0) {
      setSelectedIdx(items.length - 1);
    }
  }, [items.length, selectedIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'i') {
        e.preventDefault();
        onClose();
        return;
      }
      if (items.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 's') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % items.length);
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'w') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + items.length) % items.length);
      } else if (e.key === 'u' || e.key === 'Enter') {
        e.preventDefault();
        onUse(selectedIdx);
      } else if (e.key === 'e') {
        e.preventDefault();
        onEquip(selectedIdx);
      } else if (e.key === 'd') {
        e.preventDefault();
        onDrop(selectedIdx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, selectedIdx, onClose, onUse, onEquip, onDrop]);

  const selectedItem = items[selectedIdx] ?? null;
  const selectedTmpl = selectedItem ? ITEM_CATALOG[selectedItem.type] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inventory"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#232B3A]">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Engineer Inventory</h2>
            <p className="text-xs font-mono text-[#768399] mt-0.5">
              {items.length}/{INVENTORY_CAPACITY} slots · Keys: ↑/↓ select · u use · e equip · d drop · Esc close
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inventory"
            className="p-1.5 rounded-md text-[#768399] hover:text-[#E6EDF3] hover:bg-[#171E2B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Equipped Gear Summary */}
        <div className="grid grid-cols-2 gap-4 px-5 py-3 bg-[#0E131C] border-b border-[#232B3A] text-xs font-mono">
          <div>
            <span className="text-[#768399]">Weapon: </span>
            <span className="text-[#E6EDF3]">
              {state.player.equippedWeapon
                ? `${ITEM_CATALOG[state.player.equippedWeapon.type].name} (+${state.player.equippedWeapon.value} ATK)`
                : 'None'}
            </span>
          </div>
          <div>
            <span className="text-[#768399]">Armor: </span>
            <span className="text-[#E6EDF3]">
              {state.player.equippedArmor
                ? `${ITEM_CATALOG[state.player.equippedArmor.type].name} (+${state.player.equippedArmor.value} DEF)`
                : 'None'}
            </span>
          </div>
        </div>

        {/* Item List */}
        <div className="max-h-72 overflow-y-auto divide-y divide-[#232B3A]/60">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[#768399]">
              Your pack is empty. Step onto items and press <kbd className="font-mono text-[#E6EDF3]">g</kbd> to pick them up.
            </div>
          ) : (
            items.map((item, idx) => {
              const tmpl = ITEM_CATALOG[item.type];
              const isSelected = idx === selectedIdx;
              const isGear =
                tmpl.category === ItemCategory.WEAPON || tmpl.category === ItemCategory.ARMOR;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedIdx(idx)}
                  className={`flex items-center justify-between gap-4 px-5 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#171E2B]' : 'hover:bg-[#141B27]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="font-mono font-bold text-base w-5 text-center shrink-0"
                      style={{ color: tmpl.color }}
                    >
                      {tmpl.glyph}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#E6EDF3] truncate">
                        {tmpl.name}
                        {isGear && (
                          <span className="ml-2 font-mono text-xs text-[#38BDF8]">
                            +{item.value} {tmpl.category === ItemCategory.WEAPON ? 'ATK' : 'DEF'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#768399] truncate">{tmpl.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isGear ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEquip(idx);
                        }}
                        className="px-3 py-1.5 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] whitespace-nowrap"
                      >
                        Equip [e]
                      </button>
                    ) : tmpl.category === ItemCategory.CONSUMABLE ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUse(idx);
                        }}
                        className="px-3 py-1.5 rounded-md bg-[#34D399] text-[#07090D] text-xs font-semibold hover:bg-[#6EE7B7] whitespace-nowrap"
                      >
                        Use [u]
                      </button>
                    ) : (
                      <span className="font-mono text-xs text-[#FDE047] px-2">Passive</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDrop(idx);
                      }}
                      className="px-2.5 py-1.5 rounded-md bg-[#0B0E14] border border-[#232B3A] text-xs text-[#A3B0C2] hover:text-[#F87171] whitespace-nowrap"
                    >
                      Drop [d]
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer detail bar */}
        {selectedTmpl && (
          <div className="px-5 py-3 border-t border-[#232B3A] bg-[#0B0E14] text-xs text-[#A3B0C2]">
            <span className="font-semibold text-[#E6EDF3]">{selectedTmpl.name}: </span>
            {selectedTmpl.description}
          </div>
        )}
      </div>
    </div>
  );
};
