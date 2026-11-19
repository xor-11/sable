import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import {
  decodeGameStateBinary,
  encodeGameStateBinary,
  formatHexDump,
  fuzzCorruptMagic,
  fuzzCorruptVersion,
  fuzzFlipPayloadBit,
  fuzzTruncatePayload,
  inspectBinarySaveHeader,
  readRawSaveFromStorage,
  SAVE_MAGIC,
  SAVE_VERSION,
} from '../engine/binarySave';
import { GameState } from '../engine/types';

interface SaveInspectorModalProps {
  activeState: GameState | null;
  onImportValidState: (state: GameState) => void;
  onClose: () => void;
}

interface FuzzLog {
  label: string;
  rejectedSafely: boolean;
  message: string;
}

export const SaveInspectorModal: React.FC<SaveInspectorModalProps> = ({
  activeState,
  onImportValidState,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [fuzzLogs, setFuzzLogs] = useState<FuzzLog[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currentBytes = useMemo(() => {
    if (activeState) return encodeGameStateBinary(activeState);
    return readRawSaveFromStorage();
  }, [activeState]);

  const header = useMemo(() => {
    if (!currentBytes) return null;
    return inspectBinarySaveHeader(currentBytes);
  }, [currentBytes]);

  const hexDump = useMemo(() => {
    if (!currentBytes) return '';
    return formatHexDump(currentBytes, 112);
  }, [currentBytes]);

  const handleDownload = () => {
    if (!currentBytes) return;
    const copy = new Uint8Array(currentBytes.length);
    copy.set(currentBytes);
    const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sable_seed_${activeState?.seed ?? 'save'}.sable`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`Exported ${currentBytes.length} binary bytes to .sable file.`);
    setStatusError(null);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoded = decodeGameStateBinary(bytes);

    if (decoded.ok && decoded.state) {
      setStatusMessage(`Validated and loaded "${file.name}" (${bytes.length} bytes, CRC32 ok).`);
      setStatusError(null);
      onImportValidState(decoded.state);
    } else {
      setStatusError(`Safely rejected "${file.name}": ${decoded.error}`);
      setStatusMessage(null);
    }
    e.target.value = '';
  };

  const runFuzzCase = (label: string, mutator: (raw: Uint8Array) => Uint8Array) => {
    if (!currentBytes) return;
    const mutated = mutator(currentBytes);
    const result = decodeGameStateBinary(mutated);
    setFuzzLogs((prev) => [
      {
        label,
        rejectedSafely: !result.ok,
        message: result.ok
          ? 'UNEXPECTED PASS'
          : result.error || 'Rejected by binary validator',
      },
      ...prev.slice(0, 7),
    ]);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Binary Save Inspector"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232B3A]">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">
              Binary Save Inspector &amp; Corruption Fuzzer
            </h2>
            <p className="text-xs text-[#768399] mt-0.5">
              Inspect the 16-byte SABL binary header, export or import .sable files, and fuzz-test corruption resilience.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close save inspector"
            className="p-1.5 rounded-md text-[#768399] hover:text-[#E6EDF3] hover:bg-[#171E2B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-mono text-[#768399]">
              Format: Magic &quot;{SAVE_MAGIC}&quot; · Version v{SAVE_VERSION} · IEEE CRC32 Checksum
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!currentBytes}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export .sable
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                Import .sable
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sable,.vltc,application/octet-stream"
                onChange={handleUploadFile}
                className="hidden"
              />
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 rounded-md bg-[#0E241E] border border-[#34D399]/40 text-xs font-mono text-[#6EE7B7]">
              {statusMessage}
            </div>
          )}
          {statusError && (
            <div className="p-3 rounded-md bg-[#1B1318] border border-[#F87171]/40 text-xs font-mono text-[#FCA5A5]">
              {statusError}
            </div>
          )}

          {!currentBytes || !header ? (
            <div className="p-8 text-center border border-[#232B3A] rounded-md bg-[#0B0E14] text-sm text-[#768399]">
              Start a run or import an existing <code className="text-[#E6EDF3]">.sable</code> binary save file to inspect its header bytes and run corruption fuzz tests.
            </div>
          ) : (
            <>
              {/* Parsed Header Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                  <div className="text-[#768399]">Magic Bytes</div>
                  <div className="text-sm font-semibold text-[#34D399] mt-1">
                    {header.magic} (OK)
                  </div>
                </div>
                <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                  <div className="text-[#768399]">Format Version</div>
                  <div className="text-sm font-semibold text-[#E6EDF3] mt-1">
                    v{header.version}
                  </div>
                </div>
                <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                  <div className="text-[#768399]">CRC32 Checksum</div>
                  <div className="text-sm font-semibold text-[#38BDF8] mt-1">
                    0x{header.expectedChecksum.toString(16).padStart(8, '0').toUpperCase()}
                  </div>
                </div>
                <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                  <div className="text-[#768399]">Size</div>
                  <div className="text-sm font-semibold text-[#E6EDF3] mt-1">
                    {header.totalBytes} bytes
                  </div>
                </div>
              </div>

              {/* Hex Dump */}
              <div className="border border-[#232B3A] rounded-md overflow-hidden bg-[#0B0E14]">
                <div className="px-4 py-2 border-b border-[#232B3A] flex items-center justify-between text-xs font-mono text-[#768399]">
                  <span>Binary Header &amp; Payload Preview (first 112 bytes)</span>
                  <span>Little-Endian</span>
                </div>
                <pre className="p-4 text-xs font-mono text-[#A3B0C2] overflow-x-auto leading-relaxed">
                  {hexDump}
                </pre>
              </div>

              {/* Corruption Fuzzer */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#E6EDF3]">
                    One-Click Corruption Fuzzer
                  </h3>
                  <p className="text-xs text-[#768399] mt-0.5">
                    Inject real binary faults into a copy of your save buffer and verify the deserializer rejects every mutated payload safely without crashing.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runFuzzCase('Corrupt Magic Bytes (XXBL)', fuzzCorruptMagic)}
                    className="px-3.5 py-2 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] whitespace-nowrap"
                  >
                    Corrupt Magic Header
                  </button>
                  <button
                    type="button"
                    onClick={() => runFuzzCase('Flip Single Bit in Payload', fuzzFlipPayloadBit)}
                    className="px-3.5 py-2 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] whitespace-nowrap"
                  >
                    Flip Payload Bit (CRC Fail)
                  </button>
                  <button
                    type="button"
                    onClick={() => runFuzzCase('Unsupported Version v99', fuzzCorruptVersion)}
                    className="px-3.5 py-2 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] whitespace-nowrap"
                  >
                    Mismatch Version
                  </button>
                  <button
                    type="button"
                    onClick={() => runFuzzCase('Truncate 50% of Stream', fuzzTruncatePayload)}
                    className="px-3.5 py-2 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] whitespace-nowrap"
                  >
                    Truncate Payload
                  </button>
                </div>

                {fuzzLogs.length > 0 && (
                  <div className="border border-[#232B3A] rounded-md divide-y divide-[#232B3A] bg-[#0B0E14]">
                    {fuzzLogs.map((log, i) => (
                      <div key={i} className="px-4 py-2.5 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={
                              log.rejectedSafely
                                ? 'text-[#34D399] font-semibold'
                                : 'text-[#F87171] font-semibold'
                            }
                          >
                            {log.rejectedSafely ? 'SAFE REJECT' : 'BREACH'}
                          </span>
                          <span className="text-[#E6EDF3]">{log.label}</span>
                        </div>
                        <span className="text-[#768399]">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
