# ROYAL BATTLE: Full 3D Destruction Chess

A cinematic, high-performance 3D chess game running in WebGL with authentic 3D sculpted piece geometry, rich obsidian-gold citadel atmosphere, realistic turn-by-turn chess mechanics via chess.js, and physical mesh fragmentation on piece capture.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The architectural direction incorporates the user's confirmed choices from Phase 1:
> - **Gameplay Modes**: Local Two-Player (Pass & Play) and Single-Player with local heuristic chess bot (multiple difficulty settings: Apprentice, Tactician, Grandmaster).
> - **Destruction Effect Style**: Physics-driven Shatter with high-energy geometric fragments and tumbling gravity, with customizable FX presets (Shatter, Energy Burst, Dissolve) and performance controls in the settings drawer.
> - **Visual Environment**: Royal Obsidian Citadel with dark polished stone floor, gold-inlaid tile borders, warm directional key lighting, cool fill light, and specular rim highlights.

---

### 1. Overview & Core Concept

**Royal Battle** delivers a console-grade 3D desktop and mobile chess experience right in the browser. Unlike flat 2D boards or pseudo-3D sprites, every square, pedestal, and piece is a genuine 3D model with physical materials (PBR obsidian, graphite, polished ivory, and brushed gold). 

When a piece makes a legal capture, the target piece doesn't just fade away or disappear: it fractures into distinct 3D fragments inheriting the piece's materials and geometry that blast outward, tumble with gravity, bounce on the board, and dissipate in a cloud of physical debris before yielding the square to the victor.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **Title Arena Screen**:
   - Immersive 3D scene previewing the royal battlefield with orbiting camera, volumetric pedestal lighting, and game mode selection ("Pass & Play" or "Play vs AI Bot").
   - Instant transition to active match with smooth camera glide into gameplay perspective.
2. **Gameplay Flow**:
   - Player clicks or touches their piece: selected square glows with subtle gold boundary, legal move destination markers appear with soft target indicators.
   - Player clicks valid destination: piece lifts slightly, glides along an animated arc with natural acceleration and deceleration, and lands firmly.
   - Check and checkmate states are visually highlighted with royal crimson accents on the threatened king and bold status notices.
   - On capture: cinematic impact delay triggers the 3D shatter system, blasting the captured piece into physical shards that collide, tumble, and fade away.
   - Pawn promotion dialog opens smoothly when a pawn reaches the 8th/1st rank, offering Queen, Rook, Bishop, or Knight with 3D model previews.
3. **Control & Camera Ergonomics**:
   - Mouse/touch drag allows 360° orbiting and zoom around the board.
   - Quick camera reset button restores standard isometric perspective immediately.
   - Turn flip toggle option allows auto-rotating the board 180° for local two-player games.

#### B. Visual Identity & Atmosphere
- **Color Palette**:
  - Dominant Neutral (60%): Deep obsidian slate (`#0B0F17`), graphite pedestal (`#161E2E`), charcoal squares (`#1E293B`).
  - Structural Surfaces (30%): Warm ivory squares (`#E2D9C8`), polished pearl pieces (`#F1EFEA`), dark metallic pieces (`#1A1D24`).
  - Accent Budget (10%): Royal gold trim (`#D4AF37`, `#F59E0B`), crimson check indicator (`#EF4444`), emerald legal move markers (`#10B981`).
- **Typography**: Clean display sans (`Plus Jakarta Sans` / `Outfit`) for HUD headers and royal badges, paired with tabular figures (`font-mono tabular-nums`) for move notation, timers, and capture tallies.
- **HUD & Control Dock**:
  - Unobstructed 3D viewport following the zero-viewport-occlusion directive.
  - Floating top status strip with active turn badge, captured piece graveyard counters, and match timer.
  - Collapsible bottom control dock with Undo, Restart, Camera Reset, Move History drawer, and Settings modal (Graphics tier, Destruction FX style, Bot difficulty, Sound toggle).

---

### 3. Key Product Decisions & Trade-Offs

- **Procedural 3D Piece Models vs External GLTF Assets**:
  - *Chosen Approach*: Build procedural composite 3D geometries in Three.js (`LatheGeometry`, `ExtrudeGeometry`, `CylinderGeometry`, bevelled shapes) with dedicated silhouettes for King, Queen, Rook, Bishop, Knight, and Pawn.
  - *Why*: Eliminates 404 network failures, slow external asset downloads, and cross-origin texture issues. Guarantees 100% reliable offline startup, rapid initialization, and complete control over piece fragment generation.
- **Destruction Engine Architecture**:
  - *Chosen Approach*: Procedural voronoi/convex-like 3D mesh fragmentation. On capture, the target model's geometry bounds and sub-parts are divided into 16–28 physical shard meshes with randomized impulse vectors, angular velocity, gravity, and board ground plane collision before progressive scale/opacity dissipation.
  - *Why*: Provides high visual punch with strict polygon budgets, zero garbage collection stutter, and instant disposal upon effect completion.
- **Rules Engine & Synchronization**:
  - *Chosen Approach*: `chess.js` (standard npm package) serves as the immutable single source of truth.
  - *Why*: Handles all edge cases (en passant, castling, promotion, three-fold repetition, 50-move rule, check/checkmate detection) with zero rule bugs.
- **Local AI Bot**:
  - *Chosen Approach*: Alpha-beta pruned minimax search with piece-square evaluation tables and capture-first ordering, running asynchronously with configurable depth (1–3 plies) for responsive, zero-lag browser moves.
  - *Why*: Completely local, requires no external server or API keys, and delivers quick, engaging offline single-player gameplay.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React Application (App.tsx)                   │
├────────────────────────────────────────────────────────────────────────┤
│  Top Status Bar (Turn, Graveyard, Clock, Check Alert)                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                    Three.js WebGL Scene (Canvas Container)              │
│  ┌───────────────────────┐  ┌───────────────────┐  ┌────────────────┐  │
│  │   Scene & Lighting    │  │   Board Manager   │  │ Piece Manager  │  │
│  │ - Key / Fill / Rim    │  │ - 64 3D Squares   │  │ - 32 3D Meshes │  │
│  │ - RoomEnvironment     │  │ - Obsidian Citadel│  │ - PBR Materials│  │
│  │ - Soft PCF Shadows    │  │ - Coordinate Grid │  │ - Arc Motion   │  │
│  └───────────────────────┘  └───────────────────┘  └────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                 Destruction & Particle Subsystem                 │  │
│  │ - Mesh Fragmentation (Shatter / Burst / Dissolve)                │  │
│  │ - Gravity, Bounce, Rotation Dynamics                             │  │
│  │ - Particle Debris Pooling & Auto-Disposal                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  Collapsible Bottom Dock (History, Undo, Restart, Camera, Settings)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │   Chess Rules Engine   │      │    Local AI Engine     │
       │     (chess.js)         │◄────►│ - Minimax Evaluation   │
       │ - Move validation      │      │ - Piece-Square Tables  │
       │ - Game state & FEN     │      │ - Move Ordering        │
       └────────────────────────┘      └────────────────────────┘
```

#### Interactive State & Event Mapping
- `selectedSquare`: Tracks current highlighted square; triggers visual ring and legal destination discs.
- `animatingPiece`: Locks user input during piece movement and capture destruction sequences.
- `destructionQueue`: Active fragment objects updated via `clock.getDelta()` in the animation loop.
- `gameMode`: `'pass_and_play' | 'vs_ai'`. In `'vs_ai'`, after White's turn, an asynchronous evaluation worker schedules Black's move.
- `settings`: Graphics preset (`High` / `Balanced` / `Performance`), FX style (`Shatter` / `Burst` / `Dissolve`), Sound enabled, Auto-flip board toggle.
