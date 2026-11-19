# Sable

#### Video Demo: <URL HERE>

#### Description:

Sable is a turn-based ASCII roguelike dungeon crawler that was developed with TypeScript, React, and HTML5 Canvas as a CS50 final project. The role of an Engineer (`@`) is assumed as eight procedural floors of a failing circuit board, known as the Noise Floor, are descended. The objective is for the descent to be survived, tools and salvage to be collected, and The Kernel Panic (`K`) to be defeated on Floor 8.

Classic roguelike rules are followed throughout the game. One turn is consumed by every action, permanent death is enforced, and every floor is generated fresh from a deterministic seed so that any run can be replayed with the exact same layout and rolls.

## Gameplay and Controls

Arrow keys, WASD, vi keys (`hjkl` plus `yubn` for diagonals), and mouse clicks on the grid are all supported by Sable. A melee attack is performed whenever an enemy is bumped into.

- Move / Attack: Arrow keys, `WASD`, or `hjkl` (`yubn` for diagonals)
- Pick up item underfoot: `g`
- Open inventory: `i` (followed by `u` to use, `e` to equip, or `d` to drop)
- Fire Surge beam (4 Energy consumed): `f` followed by a direction
- Descend stairs (`>`): `>`
- Wait one turn: `.` or `Space`
- Save current run: `Shift+S` or `Ctrl+S`
- Quit with confirmation: `q`
- Open controls and bestiary: `?`

Enemy behavior is governed by entity type and a five-state machine (`IDLE`, `WANDER`, `CHASE`, `FLEE`, `ATTACK`). Erratic drifting is exhibited by Glitches (`g`) 30% of the time. Noise Gremlins (`n`) are spawned in packs and are programmed to hunt by sight. Low health is assigned to Short Circuits (`s`), though two actions per turn are granted to them. Movement is performed every other turn by Capacitor Slimes (`c`), and a 3x3 blast is triggered when they are defeated. Distance is maintained by Rogue Relays (`r`) through BFS kiting and short-range teleports. Floors 4 and 6 are guarded by Overload Golems (`O`) as mini-bosses, while phase transitions are triggered by The Kernel Panic (`K`) at 66% and 33% health on Floor 8.

Eleven distinct pickups are distributed across the board: Soldering Iron, Wire Cutters, Resistor Shield, Heat Sink Helm, Capacitor Potion, Battery, Oscilloscope (by which the full floor is revealed), Multimeter (by which enemy HP bars for the current floor are displayed), Fuse (a passive single-use auto-revive triggered upon fatal damage), Scroll of Short Circuit (by which all visible enemies are damaged), and Gold traces that are tallied toward the final score.

## Architecture and File Overview

The game engine was separated cleanly from the browser interface so that every algorithm can be tested headlessly without a DOM.

- `src/engine/types.ts`: Shared enums, named constants, entity shapes, and static catalogs for all enemies and items are defined here.
- `src/engine/rng.ts`: A custom `Xorshift32` deterministic pseudo-random number generator with exportable state is implemented for exact save/load reproducibility.
- `src/engine/structures.ts`: Custom implementations of a growable `DynamicArray`, a fixed-capacity `RingBuffer` for the scrolling event log, and a binary `MinHeap` priority queue are provided.
- `src/engine/fov.ts`: Eight-octant recursive shadowcasting field of view with explored-tile memory is handled here, alongside Bresenham line-of-sight and beam ray tracing for Surge.
- `src/engine/pathfinding.ts`: A* shortest-path search powered by `MinHeap`, BFS flood-fill connectivity checking, and BFS distance maps for enemy kiting are contained in this module.
- `src/engine/dungeon.ts`: A procedural room and corridor generator is implemented, by which 100% walkability connectivity is validated via BFS flood fill and generation is retried automatically if any room is found to be isolated.
- `src/engine/combat.ts`: Attack and defense damage calculations with variance and critical hits, XP leveling, Fuse revives, Capacitor Slime death blasts, Surge beams, and Scroll casting are managed here.
- `src/engine/ai.ts`: A five-state enemy AI controller is implemented, by which all seven enemy behaviors and Kernel Panic phase transitions are governed.
- `src/engine/game.ts`: Turn management and pure state transitions are coordinated here, with structured events emitted for visual flashes and audio cues.
- `src/engine/binarySave.ts`: A compact little-endian binary serializer is provided, featuring a 16-byte `SABL` header, format version, payload length, IEEE CRC32 checksum, and permadeath save purging.
- `src/engine/scores.ts`: A top 10 local leaderboard is maintained using a transparent score formula based on depth, kills, gold, turns, and victory.
- `src/engine/testsAndBot.ts` and `src/engine/runTests.ts`: A headless unit test suite (including a 1,000-seed connectivity test and a four-vector save corruption check) and an autonomous bot simulator for balance testing are housed here.
- `src/audio/sfx.ts`: A Web Audio API chiptune sound synthesizer with mute persistence is implemented in this file.
- `src/components/`: A high-DPI Canvas ASCII renderer (`AsciiViewport.tsx`), HUD rail (`HudRail.tsx`), event log (`MessageLog.tsx`), title screen (`TitleScreen.tsx`), inventory, help, high scores, end-game modals, and developer diagnostic panels are contained in this directory.

## Key Design Decisions

First, recursive shadowcasting was selected over naive raycasting for field of view because each visible cell is visited once per octant without visual blind spots being left on angled corridors. Second, the binary min-heap and A* pathfinder were written from scratch so that enemy chasing scales smoothly even on crowded floors, while BFS distance fields are utilized for Rogue Relay kiting and dungeon flood-fill checks.

Third, a custom binary save format was implemented instead of plain JSON storage. Truncated or tampered save files are caught cleanly without crashing through the use of a 16-byte header (`SABL` magic bytes, version, payload size, and CRC32 checksum). Upon player death, the saved run is deleted immediately so that permadeath is strictly enforced.

Fourth, all developer diagnostics were hidden behind a `?dev=1` query parameter. Only the clean game interface is presented to standard players, whereas the unit test runner, bot simulator, binary hex fuzzer, and live A*/FOV overlays are exposed for grading and demonstrations when `?dev=1` is appended to the URL.

## Running Locally and Deploying

Dependencies can be installed and the development server can be started with the following commands:

```bash
npm install
npm run dev
