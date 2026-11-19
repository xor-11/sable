import { useCallback, useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sfx } from './audio/sfx';
import { AsciiViewport } from './components/AsciiViewport';
import { EndGameModal, QuitConfirmModal } from './components/EndGameModal';
import { EngineeringLabModal } from './components/EngineeringLabModal';
import { HelpModal } from './components/HelpModal';
import { HighScoresModal } from './components/HighScoresModal';
import { HudRail } from './components/HudRail';
import { InventoryModal } from './components/InventoryModal';
import { MessageLog } from './components/MessageLog';
import { SaveInspectorModal } from './components/SaveInspectorModal';
import { TitleScreen } from './components/TitleScreen';
import {
  deleteSaveFromStorage,
  loadGameFromStorage,
  saveGameToStorage,
} from './engine/binarySave';
import { pushLog } from './engine/combat';
import {
  createNewGame,
  descendStairs,
  dropInventoryItem,
  equipInventoryItem,
  fireSurge,
  moveOrAttack,
  pickupItem,
  TurnResult,
  useInventoryItem,
  waitTurn,
} from './engine/game';
import { generateRandomSeed } from './engine/rng';
import {
  clearHighScores,
  HighScoreEntry,
  loadHighScores,
  recordHighScore,
} from './engine/scores';
import {
  GameEvent,
  GamePhase,
  GameState,
  LogSeverity,
  SURGE_ENERGY_COST,
} from './engine/types';

type ActiveModal =
  | 'NONE'
  | 'INVENTORY'
  | 'LAB'
  | 'SAVE_INSPECTOR'
  | 'HIGH_SCORES'
  | 'HELP'
  | 'QUIT_CONFIRM';

export default function App() {
  const [isDevMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('dev') === '1';
  });

  const [screen, setScreen] = useState<'TITLE' | 'PLAYING'>('TITLE');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [versionTick, setVersionTick] = useState(0);

  // Saved run preview for Title screen
  const [savedPreview, setSavedPreview] = useState<GameState | null>(null);
  const [saveLoadError, setSaveLoadError] = useState<string | null>(null);

  // Visual & audio companion toggles
  const [monochrome, setMonochrome] = useState(false);
  const [showPathOverlay, setShowPathOverlay] = useState(false);
  const [showFovOverlay, setShowFovOverlay] = useState(false);
  const [muted, setMuted] = useState(() => sfx.isMuted());

  // Interaction & modal state
  const [targetingSurge, setTargetingSurge] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([]);
  const [eventSeq, setEventSeq] = useState(0);
  const [endGameRank, setEndGameRank] = useState<number | null>(null);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(() => loadHighScores());
  const [toast, setToast] = useState<string | null>(null);

  // Viewport size check (honoring minimum comfortable ASCII terminal layout)
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [dismissSmallWarning, setDismissSmallWarning] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Monitor viewport dimensions for graceful terminal resize advisory
  useEffect(() => {
    const checkSize = () => {
      setIsSmallViewport(window.innerWidth < 720 || window.innerHeight < 520);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Inspect saved binary run on mount
  const refreshSavedPreview = useCallback(() => {
    const res = loadGameFromStorage();
    if (res.ok && res.state && res.state.phase === GamePhase.PLAYING) {
      setSavedPreview(res.state);
      setSaveLoadError(null);
    } else {
      setSavedPreview(null);
      setSaveLoadError(res.error && res.error !== 'No saved run found.' ? res.error : null);
    }
  }, []);

  useEffect(() => {
    refreshSavedPreview();
  }, [refreshSavedPreview]);

  // Commit a headless turn result to React state, trigger audio, and enforce permadeath/victory hooks
  const commitTurnResult = useCallback((result: TurnResult) => {
    const { state, events } = result;
    setGameState(state);
    setVersionTick((v) => v + 1);

    if (events.length > 0) {
      setLastEvents(events);
      setEventSeq((s) => s + 1);
      sfx.playEvents(events);
    }

    if (state.phase === GamePhase.DEAD || state.phase === GamePhase.VICTORY) {
      // Permadeath: purge saved run on end-game and record score
      deleteSaveFromStorage();
      setSavedPreview(null);
      setTargetingSurge(false);
      const { rank, allScores } = recordHighScore(state);
      setEndGameRank(rank);
      setHighScores(allScores);
    }
  }, []);

  const handleStartNewGame = useCallback(
    (seed: number) => {
      const fresh = createNewGame(seed);
      setGameState(fresh);
      setScreen('PLAYING');
      setTargetingSurge(false);
      setActiveModal('NONE');
      setEndGameRank(null);
      setLastEvents([]);
      setVersionTick((v) => v + 1);
      showToast(`Started Floor 1 · Seed ${fresh.seed}`);
    },
    [showToast]
  );

  const handleContinueGame = useCallback(() => {
    const res = loadGameFromStorage();
    if (res.ok && res.state) {
      setGameState(res.state);
      setScreen('PLAYING');
      setTargetingSurge(false);
      setActiveModal('NONE');
      setEndGameRank(null);
      setVersionTick((v) => v + 1);
      showToast(`Loaded Floor ${res.state.floor} · Turn ${res.state.turn}`);
    } else {
      setSaveLoadError(res.error ?? 'Failed to load binary save.');
    }
  }, [showToast]);

  const handleSaveGame = useCallback(() => {
    if (!gameState || gameState.phase !== GamePhase.PLAYING) return;
    const bytes = saveGameToStorage(gameState);
    pushLog(gameState, LogSeverity.SYSTEM, `Saved binary snapshot (${bytes.length} bytes, CRC32 verified).`);
    setVersionTick((v) => v + 1);
    refreshSavedPreview();
    showToast(`Saved run (${bytes.length} bytes)`);
  }, [gameState, refreshSavedPreview, showToast]);

  const handleToggleSurge = useCallback(() => {
    if (!gameState || gameState.phase !== GamePhase.PLAYING) return;
    if (targetingSurge) {
      setTargetingSurge(false);
      return;
    }
    if (gameState.player.energy < SURGE_ENERGY_COST) {
      pushLog(
        gameState,
        LogSeverity.INFO,
        `Need ${SURGE_ENERGY_COST} Energy for Surge (have ${gameState.player.energy}).`
      );
      setVersionTick((v) => v + 1);
      return;
    }
    setTargetingSurge(true);
  }, [gameState, targetingSurge]);

  const handleDirectionInput = useCallback(
    (dx: number, dy: number) => {
      if (!gameState || gameState.phase !== GamePhase.PLAYING) return;
      if (targetingSurge) {
        setTargetingSurge(false);
        commitTurnResult(fireSurge(gameState, dx, dy));
      } else {
        commitTurnResult(moveOrAttack(gameState, dx, dy));
      }
    },
    [gameState, targetingSurge, commitTurnResult]
  );

  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (!gameState || gameState.phase !== GamePhase.PLAYING) return;
      const dx = x - gameState.player.x;
      const dy = y - gameState.player.y;

      if (targetingSurge) {
        if (dx === 0 && dy === 0) {
          setTargetingSurge(false);
          return;
        }
        setTargetingSurge(false);
        commitTurnResult(fireSurge(gameState, Math.sign(dx), Math.sign(dy)));
        return;
      }

      if (dx === 0 && dy === 0) {
        commitTurnResult(waitTurn(gameState));
        return;
      }
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        commitTurnResult(moveOrAttack(gameState, dx, dy));
      } else {
        // Step 1 tile toward clicked coordinate for convenient mouse traversal
        commitTurnResult(moveOrAttack(gameState, Math.sign(dx), Math.sign(dy)));
      }
    },
    [gameState, targetingSurge, commitTurnResult]
  );

  // Full Roguelike Keyboard Handler (Arrows, WASD, vi keys hjkl+yubn, commands)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not hijack keys while typing in an input or inside an open modal
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (screen !== 'PLAYING' || !gameState || activeModal !== 'NONE') {
        return;
      }
      if (gameState.phase !== GamePhase.PLAYING) {
        return;
      }

      const key = e.key;

      // Cancel Surge targeting with Escape
      if (key === 'Escape' && targetingSurge) {
        e.preventDefault();
        setTargetingSurge(false);
        return;
      }

      // Movement & Bump-to-Attack (Arrows, WASD, vi keys hjkl + diagonals yubn)
      const dirMap: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        W: [0, -1],
        a: [-1, 0],
        A: [-1, 0],
        h: [-1, 0],
        j: [0, 1],
        k: [0, -1],
        l: [1, 0],
        y: [-1, -1],
        u: [1, -1],
        b: [-1, 1],
        n: [1, 1],
      };

      // Handle 's' and 'd' carefully:
      // 's' = move south if WASD OR save if Shift+S? Wait: prompt lists:
      // Move: arrow keys, WASD, or vi keys (hjkl, yubn for diagonals)
      // s save, d drop (in inventory), u use (in inventory), e equip (in inventory)
      // Let's map 's' -> move south when Shift isn't held? Wait: user specifically listed:
      // "Move: arrow keys, WASD, or vi keys (hjkl, yubn for diagonals)" AND "s save".
      // If we map lowercase 's' to Move South (so WASD feels 100% natural!) and Ctrl+S / Shift+S to Save — OR check if user presses 'd' for East!
      // Wait: WASD requires 'w', 'a', 's', 'd'! In roguelikes with both WASD and inventory actions, 'u', 'e', 'd' work inside the Inventory screen (`i`), and Shift+S (or clicking Save) saves, OR wait: what if someone tests pressing 's' expecting save or south?
      // Let's make WASD work intuitively: w/a/s/d move North/West/South/East, while Ctrl+S or Shift+S saves immediately (and the Save button shows `Save [S]`)! And inside the Inventory modal (`i`), `u`, `e`, `d` use, equip, and drop cleanly without ever conflicting with `d` East or `u` North-East!
      if (key === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleDirectionInput(0, 1);
        return;
      }
      if (key === 'd' || key === 'D') {
        e.preventDefault();
        handleDirectionInput(1, 0);
        return;
      }
      if ((key === 'S' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 's')) {
        e.preventDefault();
        handleSaveGame();
        return;
      }

      if (dirMap[key]) {
        e.preventDefault();
        const [dx, dy] = dirMap[key];
        handleDirectionInput(dx, dy);
        return;
      }

      // Non-movement commands
      if (key === '.' || key === ' ') {
        e.preventDefault();
        setTargetingSurge(false);
        commitTurnResult(waitTurn(gameState));
      } else if (key === 'g' || key === 'G') {
        e.preventDefault();
        setTargetingSurge(false);
        commitTurnResult(pickupItem(gameState));
      } else if (key === '>') {
        e.preventDefault();
        setTargetingSurge(false);
        commitTurnResult(descendStairs(gameState));
      } else if (key === 'i' || key === 'I') {
        e.preventDefault();
        setTargetingSurge(false);
        setActiveModal('INVENTORY');
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        handleToggleSurge();
      } else if (key === 'q' || key === 'Q') {
        e.preventDefault();
        setTargetingSurge(false);
        setActiveModal('QUIT_CONFIRM');
      } else if (key === '?') {
        e.preventDefault();
        setTargetingSurge(false);
        setActiveModal('HELP');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screen,
    gameState,
    activeModal,
    targetingSurge,
    handleDirectionInput,
    handleSaveGame,
    handleToggleSurge,
    commitTurnResult,
  ]);

  const handleToggleMute = () => {
    const nextMuted = sfx.toggleMute();
    setMuted(nextMuted);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-[#E6EDF3]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="border-b border-[#232B3A] bg-[#0E131C]">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <button
            type="button"
            onClick={() => {
              if (screen === 'PLAYING' && gameState?.phase === GamePhase.PLAYING) {
                setActiveModal('QUIT_CONFIRM');
              } else {
                setScreen('TITLE');
              }
            }}
            className="text-lg font-bold tracking-tight font-display text-[#E6EDF3] hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
          >
            Sable
          </button>

          {/* Zone 2: Clean single-line text nav links (dev links hidden unless ?dev=1) */}
          <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-[#A3B0C2] overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setActiveModal('NONE');
                if (gameState) setScreen('PLAYING');
                else setScreen('TITLE');
              }}
              className={`hover:text-[#E6EDF3] transition-colors whitespace-nowrap shrink-0 ${
                activeModal === 'NONE' ? 'text-[#E6EDF3]' : ''
              }`}
            >
              Play
            </button>
            {isDevMode && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveModal('LAB')}
                  className={`hover:text-[#E6EDF3] transition-colors whitespace-nowrap shrink-0 ${
                    activeModal === 'LAB' ? 'text-[#38BDF8]' : ''
                  }`}
                >
                  Lab
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('SAVE_INSPECTOR')}
                  className={`hover:text-[#E6EDF3] transition-colors whitespace-nowrap shrink-0 ${
                    activeModal === 'SAVE_INSPECTOR' ? 'text-[#38BDF8]' : ''
                  }`}
                >
                  Save Inspector
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setActiveModal('HIGH_SCORES')}
              className={`hover:text-[#E6EDF3] transition-colors whitespace-nowrap shrink-0 ${
                activeModal === 'HIGH_SCORES' ? 'text-[#38BDF8]' : ''
              }`}
            >
              High Scores
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('HELP')}
              className={`hover:text-[#E6EDF3] transition-colors whitespace-nowrap shrink-0 ${
                activeModal === 'HELP' ? 'text-[#38BDF8]' : ''
              }`}
            >
              Help
            </button>
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleStartNewGame(generateRandomSeed())}
              className="px-4 py-2 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] transition-colors whitespace-nowrap shrink-0"
            >
              New Run
            </button>
          </div>
        </div>
      </header>

      {/* Small Terminal Advisory (graceful resize handling) */}
      {isSmallViewport && !dismissSmallWarning && screen === 'PLAYING' && (
        <div className="bg-[#1B1711] border-b border-[#78350F] px-4 py-2.5 text-xs text-[#FCD34D] flex items-center justify-between gap-4">
          <span className="font-mono">
            Viewport below recommended 80×24 terminal size. Widen your browser window for optimal ASCII legibility.
          </span>
          <button
            type="button"
            onClick={() => setDismissSmallWarning(true)}
            className="text-[#E6EDF3] hover:underline whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {screen === 'TITLE' || !gameState ? (
        <TitleScreen
          isDevMode={isDevMode}
          savedRunPreview={savedPreview}
          saveError={saveLoadError}
          monochrome={monochrome}
          onToggleMonochrome={() => setMonochrome((m) => !m)}
          onStartNewGame={handleStartNewGame}
          onContinueGame={handleContinueGame}
          onOpenLab={() => setActiveModal('LAB')}
          onOpenSaveInspector={() => setActiveModal('SAVE_INSPECTOR')}
          onOpenHighScores={() => setActiveModal('HIGH_SCORES')}
          onOpenHelp={() => setActiveModal('HELP')}
        />
      ) : (
        <main
          key={versionTick ? 'active-board' : 'active-board'}
          className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4"
        >
          {/* Compact Workspace Toolbar (dev overlays hidden unless ?dev=1) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {isDevMode && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPathOverlay((v) => !v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                      showPathOverlay
                        ? 'bg-[#171E2B] text-[#38BDF8] border-[#38BDF8]/60'
                        : 'bg-[#121721] text-[#A3B0C2] border-[#232B3A] hover:text-[#E6EDF3]'
                    }`}
                  >
                    A* &amp; AI Overlay: {showPathOverlay ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFovOverlay((v) => !v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                      showFovOverlay
                        ? 'bg-[#171E2B] text-[#38BDF8] border-[#38BDF8]/60'
                        : 'bg-[#121721] text-[#A3B0C2] border-[#232B3A] hover:text-[#E6EDF3]'
                    }`}
                  >
                    Shadowcast FOV: {showFovOverlay ? 'On' : 'Off'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setMonochrome((v) => !v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                  monochrome
                    ? 'bg-[#171E2B] text-[#E6EDF3] border-[#64748B]'
                    : 'bg-[#121721] text-[#A3B0C2] border-[#232B3A] hover:text-[#E6EDF3]'
                }`}
              >
                Color: {monochrome ? 'Mono' : 'ANSI'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              {toast && <span className="font-mono text-[#34D399]">{toast}</span>}
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#121721] border border-[#232B3A] text-[#A3B0C2] hover:text-[#E6EDF3] transition-colors whitespace-nowrap"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-[#38BDF8]" />}
                <span>{muted ? 'SFX Muted' : 'SFX On'}</span>
              </button>
            </div>
          </div>

          {/* Primary Play Split: ASCII Map + Right HUD Rail */}
          <div className="flex flex-col xl:flex-row gap-4 items-stretch">
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <AsciiViewport
                state={gameState}
                turnTick={versionTick}
                lastEvents={lastEvents}
                eventSeq={eventSeq}
                monochrome={monochrome}
                showPathOverlay={isDevMode && showPathOverlay}
                showFovOverlay={isDevMode && showFovOverlay}
                targetingSurge={targetingSurge}
                onTileClick={handleTileClick}
              />
              <MessageLog entries={gameState.logEntries} monochrome={monochrome} />
            </div>

            <HudRail
              state={gameState}
              targetingSurge={targetingSurge}
              onOpenInventory={() => setActiveModal('INVENTORY')}
              onPickup={() => commitTurnResult(pickupItem(gameState))}
              onDescend={() => commitTurnResult(descendStairs(gameState))}
              onToggleSurge={handleToggleSurge}
              onWait={() => commitTurnResult(waitTurn(gameState))}
              onSave={handleSaveGame}
              onRequestQuit={() => setActiveModal('QUIT_CONFIRM')}
            />
          </div>
        </main>
      )}

      {/* Modals */}
      {activeModal === 'INVENTORY' && gameState && (
        <InventoryModal
          state={gameState}
          onUse={(idx) => {
            const res = useInventoryItem(gameState, idx);
            commitTurnResult(res);
            if (res.turnConsumed) setActiveModal('NONE');
          }}
          onEquip={(idx) => {
            const res = equipInventoryItem(gameState, idx);
            commitTurnResult(res);
          }}
          onDrop={(idx) => {
            const res = dropInventoryItem(gameState, idx);
            commitTurnResult(res);
          }}
          onClose={() => setActiveModal('NONE')}
        />
      )}

      {isDevMode && activeModal === 'LAB' && (
        <EngineeringLabModal
          onClose={() => setActiveModal('NONE')}
          onPlaySeed={(seed) => {
            setActiveModal('NONE');
            handleStartNewGame(seed);
          }}
        />
      )}

      {isDevMode && activeModal === 'SAVE_INSPECTOR' && (
        <SaveInspectorModal
          activeState={gameState}
          onImportValidState={(loadedState) => {
            saveGameToStorage(loadedState);
            refreshSavedPreview();
            setGameState(loadedState);
            setScreen('PLAYING');
            setActiveModal('NONE');
            setVersionTick((v) => v + 1);
            showToast(`Loaded Floor ${loadedState.floor} from .sable file`);
          }}
          onClose={() => setActiveModal('NONE')}
        />
      )}

      {activeModal === 'HIGH_SCORES' && (
        <HighScoresModal
          scores={highScores}
          onClear={() => {
            clearHighScores();
            setHighScores([]);
          }}
          onPlaySeed={(seed) => {
            setActiveModal('NONE');
            handleStartNewGame(seed);
          }}
          onClose={() => setActiveModal('NONE')}
        />
      )}

      {activeModal === 'HELP' && <HelpModal onClose={() => setActiveModal('NONE')} />}

      {activeModal === 'QUIT_CONFIRM' && (
        <QuitConfirmModal
          onSaveAndQuit={() => {
            handleSaveGame();
            setActiveModal('NONE');
            setScreen('TITLE');
          }}
          onQuitWithoutSaving={() => {
            setActiveModal('NONE');
            setScreen('TITLE');
          }}
          onCancel={() => setActiveModal('NONE')}
        />
      )}

      {screen === 'PLAYING' &&
        gameState &&
        (gameState.phase === GamePhase.DEAD || gameState.phase === GamePhase.VICTORY) && (
          <EndGameModal
            state={gameState}
            rank={endGameRank}
            onPlayAgain={() => handleStartNewGame(generateRandomSeed())}
            onRetrySameSeed={() => handleStartNewGame(gameState.seed)}
            onReturnToTitle={() => {
              setScreen('TITLE');
              setGameState(null);
            }}
          />
        )}
    </div>
  );
}
