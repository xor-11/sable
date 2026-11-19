import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ENEMY_CATALOG, ITEM_CATALOG, SURGE_ENERGY_COST } from '../engine/types';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const enemies = Object.values(ENEMY_CATALOG);
  const items = Object.values(ITEM_CATALOG);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Controls and Field Manual"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232B3A]">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Controls &amp; Field Manual</h2>
            <p className="text-xs text-[#768399] mt-0.5">
              Key bindings, hostile anomalies, and circuit salvage across the 8 Noise Floors.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="p-1.5 rounded-md text-[#768399] hover:text-[#E6EDF3] hover:bg-[#171E2B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Controls */}
          <section>
            <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Keyboard &amp; Mouse Controls</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs font-mono bg-[#0B0E14] border border-[#232B3A] rounded-md p-4">
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">Arrows / WASD / hjkl</span>
                <span className="text-[#A3B0C2] text-right">Move or bump-attack</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">y / u / b / n</span>
                <span className="text-[#A3B0C2] text-right">Diagonal movement (vi keys)</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">f + direction</span>
                <span className="text-[#A3B0C2] text-right">Surge beam ({SURGE_ENERGY_COST} Energy)</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">g</span>
                <span className="text-[#A3B0C2] text-right">Pick up item underfoot</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">i (then u / e / d)</span>
                <span className="text-[#A3B0C2] text-right">Inventory: use, equip, drop</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">&gt; (Shift + .)</span>
                <span className="text-[#A3B0C2] text-right">Descend Descent Port</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">. or Space</span>
                <span className="text-[#A3B0C2] text-right">Wait 1 turn</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#38BDF8]">Shift+S / q / ?</span>
                <span className="text-[#A3B0C2] text-right">Save / Quit / Help</span>
              </div>
            </div>
          </section>

          {/* Bestiary */}
          <section>
            <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Hostile Anomalies (7 Types)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {enemies.map((e) => (
                <div
                  key={e.type}
                  className="flex items-start gap-3 p-3 rounded-md bg-[#0B0E14] border border-[#232B3A]"
                >
                  <span
                    className="font-mono text-lg font-bold w-6 text-center shrink-0"
                    style={{ color: e.color }}
                  >
                    {e.glyph}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E6EDF3]">
                      {e.name}{' '}
                      <span className="font-mono font-normal text-[#768399]">
                        · HP {e.baseHp} · ATK {e.baseAtk} · DEF {e.baseDef}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">{e.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Items */}
          <section>
            <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Gear, Utilities &amp; Salvage</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((it) => (
                <div
                  key={it.type}
                  className="flex items-start gap-3 p-3 rounded-md bg-[#0B0E14] border border-[#232B3A]"
                >
                  <span
                    className="font-mono text-lg font-bold w-6 text-center shrink-0"
                    style={{ color: it.color }}
                  >
                    {it.glyph}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E6EDF3]">{it.name}</div>
                    <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">{it.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
