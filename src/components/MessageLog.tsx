import React, { useEffect, useRef } from 'react';
import { LogEntry, LogSeverity } from '../engine/types';

interface MessageLogProps {
  entries: LogEntry[];
  monochrome: boolean;
}

function severityStyle(sev: LogSeverity, monochrome: boolean): { color: string; prefix: string } {
  if (monochrome) {
    switch (sev) {
      case LogSeverity.DANGER:
      case LogSeverity.BOSS:
        return { color: 'text-[#F8FAFC] font-semibold', prefix: '[!]' };
      case LogSeverity.LOOT:
        return { color: 'text-[#E2E8F0]', prefix: '[+]' };
      case LogSeverity.SYSTEM:
        return { color: 'text-[#CBD5E1]', prefix: '[*]' };
      default:
        return { color: 'text-[#94A3B8]', prefix: ' - ' };
    }
  }

  switch (sev) {
    case LogSeverity.COMBAT:
      return { color: 'text-[#E6EDF3]', prefix: '[x]' };
    case LogSeverity.DANGER:
      return { color: 'text-[#F87171]', prefix: '[!]' };
    case LogSeverity.LOOT:
      return { color: 'text-[#34D399]', prefix: '[+]' };
    case LogSeverity.SYSTEM:
      return { color: 'text-[#38BDF8]', prefix: '[*]' };
    case LogSeverity.BOSS:
      return { color: 'text-[#F59E0B] font-semibold', prefix: '[!]' };
    default:
      return { color: 'text-[#94A3B8]', prefix: ' - ' };
  }
}

export const MessageLog: React.FC<MessageLogProps> = ({ entries, monochrome }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  const recent = entries.slice(-24);

  return (
    <section
      aria-label="Event log"
      className="border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#232B3A] text-xs">
        <span className="font-medium text-[#A3B0C2]">Event Log</span>
        <span className="font-mono text-[#768399]">Ring Buffer · {entries.length}/64</span>
      </div>
      <div
        ref={scrollRef}
        className="h-32 overflow-y-auto px-3.5 py-2 space-y-1 font-mono text-xs leading-relaxed bg-[#0B0E14]"
      >
        {recent.length === 0 ? (
          <div className="text-[#768399]">Awaiting Engineer input...</div>
        ) : (
          recent.map((entry, idx) => {
            const { color, prefix } = severityStyle(entry.severity, monochrome);
            return (
              <div key={`${entry.turn}-${idx}`} className="flex gap-2.5">
                <span className="text-[#546178] shrink-0 w-10 text-right">
                  T{String(entry.turn).padStart(3, '0')}
                </span>
                <span className={`${color} shrink-0`}>{prefix}</span>
                <span className={color}>{entry.text}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
