# Sable

#### Video Demo: <URL HERE>

#### Description:

Sable is a turn-based ASCII roguelike dungeon crawler built with TypeScript, React, and HTML5 Canvas for my CS50 final project. You play as an Engineer (`@`) descending through eight procedural floors of a failing circuit board called the Noise Floor. Your goal is to survive the descent, gather tools and salvage, and defeat The Kernel Panic (`K`) on Floor 8.

The game follows classic roguelike rules. Every action takes one turn, death is permanent, and every floor is generated fresh from a deterministic seed so any run can be replayed with the exact same layout and rolls.

## Gameplay and Controls

Sable supports arrow keys, WASD, vi keys (`hjkl` plus `yubn` for diagonals), and mouse clicks on the grid. Bumping into an enemy performs a melee attack.

- Move / Attack: Arrow keys, `WASD`, or `hjkl` (`yubn` for diagonals)
- Pick up item underfoot: `g`
- Open inventory: `i` (then `u` to use, `e` to equip, `d` to drop)
- Fire Surge beam (costs 4 Energy): `f` followed by a direction
- Descend stairs (`>`): `>`
- Wait one turn: `.` or `Space`
- Save current run: `Shift+S` or `Ctrl+S`
- Quit with confirmation: `q`
- Open controls and bestiary: `?`

Enemies behave differently based on their type and a five-state machine (`IDLE`, `WANDER`, `CHASE`, `FLEE`, `ATTACK`). Glitches (`g`) drift erratically 30% of the time. Noise Gremlins (`n`) spawn in packs and hunt by sight. Short Circuits (`s`) have low health but take two actions per turn. Capacitor Slimes (`c`) move every other turn and explode in a 3x3 blast when killed. Rogue Relays (`r`) keep their distance using BFS kiting and short-range teleports. Overload Golems (`O`) guard Floors 4 and 6 as mini-bosses, and The Kernel Panic (`K`) shifts phases at 66% and 33% health on Floor 8.

Eleven pickups appear across the board: Soldering Iron, Wire Cutters, Resistor Shield, Heat Sink Helm, Capacitor Potion, Battery, Oscilloscope (reveals the full floor), Multimeter (shows enemy HP bars for the current floor), Fuse (passive single-use auto-revive on fatal damage), Scroll of Short Circuit (damages all visible enemies), and Gold traces for your final score.

## Architecture and File Overview

I separated the game engine cleanly from the browser interface so every algorithm can be tested headlessly without a DOM.

- `src/engine/types.ts`: Shared enums, named constants, entity shapes, and static catalogs for all enemies and items.
- `src/engine/rng.ts`: Hand-written `Xorshift32` deterministic pseudo-random number generator with exportable state for exact save/load reproducibility.
- `src/engine/structures.ts`: Custom implementations of a growable `DynamicArray`, a fixed-capacity `RingBuffer` for the scrolling event log, and a binary `MinHeap` priority queue.
- `src/engine/fov.ts`: Eight-octant recursive shadowcasting field of view with explored-tile memory, plus Bresenham line-of-sight and beam ray tracing for Surge.
- `src/engine/pathfinding.ts`: A* shortest-path search powered by `MinHeap`, BFS flood-fill connectivity checking, and BFS distance maps for enemy kiting.
- `src/engine/dungeon.ts`: Procedural room and corridor generator that validates 100% walkability connectivity with BFS flood fill and retries automatically if any room is isolated.
- `src/engine/combat.ts`: Attack and defense damage math with variance and critical hits, XP leveling, Fuse revives, Capacitor Slime death blasts, Surge beams, and Scroll casting.
- `src/engine/ai.ts`: Five-state enemy AI controller covering all seven enemy behaviors and Kernel Panic phase transitions.
- `src/engine/game.ts`: Turn manager and pure state transitions that emit structured events for visual flashes and audio cues.
- `src/engine/binarySave.ts`: Compact little-endian binary serializer with a 16-byte `SABL` header, format version, payload length, IEEE CRC32 checksum, and permadeath save purging.
- `src/engine/scores.ts`: Top 10 local leaderboard using a transparent score formula based on depth, kills, gold, turns, and victory.
- `src/engine/testsAndBot.ts` and `src/engine/runTests.ts`: Headless unit test suite (including a 1,000-seed connectivity test and four-vector save corruption check) and an autonomous bot simulator for balance testing.
- `src/audio/sfx.ts`: Web Audio API chiptune sound synthesizer with mute persistence.
- `src/components/`: High-DPI Canvas ASCII renderer (`AsciiViewport.tsx`), HUD rail (`HudRail.tsx`), event log (`MessageLog.tsx`), title screen (`TitleScreen.tsx`), inventory, help, high scores, end-game modals, and developer diagnostic panels.

## Key Design Decisions

First, I chose recursive shadowcasting over naive raycasting for field of view because shadowcasting visits each visible cell once per octant without leaving visual blind spots on angled corridors. Second, I wrote the binary min-heap and A* pathfinder from scratch so enemy chasing scales smoothly even on crowded floors, while using BFS distance fields for Rogue Relay kiting and dungeon flood-fill checks.

Third, I implemented a custom binary save format instead of storing plain JSON. A 16-byte header (`SABL` magic bytes, version, payload size, and CRC32 checksum) lets the loader catch truncated or tampered save files cleanly without crashing. On player death, the saved run is deleted immediately to enforce permadeath.

Fourth, I hid all developer diagnostics behind a `?dev=1` query parameter. Normal players only see the clean game interface, while appending `?dev=1` to the URL exposes the unit test runner, bot simulator, binary hex fuzzer, and live A*/FOV overlays for grading and demonstrations.

## Running Locally and Deploying

Install dependencies and start the development server:

```bash
npm install
npm run dev
```
