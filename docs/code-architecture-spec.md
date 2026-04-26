# Code Architecture Specification

This document is the required architecture contract for future changes. Coding agents should read this before modifying gameplay code.

## Project Shape

- `src/scenes/`: Phaser scene orchestration only. Scenes may create Phaser objects, wire inputs, call systems, and transition to other scenes.
- `src/systems/`: pure or mostly pure gameplay logic. Systems should calculate outcomes and return values; they should not create Phaser objects or DOM nodes.
- `src/data/`: static content tables. Data files should not mutate `gameState`, emit events, create UI, or depend on Phaser scenes.
- `src/config/`: balance formulas and tuning knobs. Progression pressure, pacing, caps, intervals, and difficulty scaling belong here.
- `src/objects/`: reusable Phaser objects and visual entities.
- `src/ui/`: HTML overlay panels and UI manager code. Panels may emit UI events but should not own Phaser scene state.
- `src/state/GameState.ts`: single global runtime state store and state update helpers.
- `src/utils/EventBus.ts`: bridge between Phaser scenes and HTML UI. EventBus is not a state store.

## Hard Rules

1. Do not add new magic balance numbers directly inside large scenes.
   - Put formulas in `src/config/*`.
   - Scenes should call named helpers such as `getInitialArrivalInterval(...)` or `getAutoServeConfig(...)`.

2. Do not use broad EventBus cleanup.
   - Forbidden: `EventBus.off('event-name')`.
   - Required: keep the exact handler reference and remove only that handler.
   - Pattern:
     ```ts
     this.someHandler = () => { /* ... */ };
     EventBus.once('some-event', this.someHandler);
     EventBus.off('some-event', this.someHandler);
     this.someHandler = null;
     ```

3. Do not use `@ts-ignore` to bypass unused fields or type uncertainty.
   - Delete unused fields.
   - Add a real type.
   - Split code until TypeScript can express the contract.

4. Do not let UI panels directly mutate unrelated global state.
   - Panels should emit intent events or call narrow system APIs.
   - State changes should remain traceable through `GameState` helpers or clearly named systems.

5. Do not let `GrillScene` become the place for every new rule.
   - New progression tuning goes to `src/config/grillBalance.ts`.
   - New order scoring goes to `OrderEngine`.
   - New cooking math goes to `GrillEngine`.
   - New customer generation or patience logic goes to `CustomerEngine` / `CustomerQueue`.
   - New reusable visual behavior goes to `src/objects/`.

## GrillScene Contract

`GrillScene` is allowed to:

- Create and position Phaser objects.
- Subscribe to keyboard, pointer, scene, and EventBus events.
- Maintain per-session UI/runtime fields such as current timers, currently visible overlays, and live Phaser objects.
- Call systems to compute cooking, selling, orders, workers, activities, loyalty, and special effects.
- Read balance values from `src/config/grillBalance.ts`.
- Write end-of-day snapshots into `gameState`.

`GrillScene` should not:

- Contain new long-form balance formulas.
- Own static content tables.
- Contain DOM panel implementation details except attaching/detaching a panel element.
- Clear global EventBus listeners it does not own.
- Add new persistent game state fields unless `GameState.ts` is updated intentionally.

## Balance Rules

All grill-session pressure should be derived from explicit inputs:

- `day`: campaign progression.
- `tier`: player territory / map progression.
- `difficulty`: casual vs hardcore pacing.
- upgrades and prep choices: modifiers, not hidden rewrites.

Current balance owner:

- `src/config/grillBalance.ts`

Current balance responsibilities:

- session duration
- initial customer arrival interval
- chart-band customer arrival interval
- customer batch range
- service combo group density
- auto-serve cadence and burst size
- max session event count

When changing gameplay pressure, update the config helper and leave a short comment explaining the intent.

## EventBus Rules

Use EventBus only for cross-boundary communication:

- Phaser scene to HTML panel
- HTML panel to Phaser scene
- scene-ready/debug lifecycle signals

Every EventBus listener registered by a scene must have one of these cleanup paths:

- `once(...)` with no external cleanup needed because it always fires before scene shutdown.
- stored handler reference plus cleanup in scene shutdown.
- stored handler reference plus cleanup when replacing the active panel/overlay.

If an event might not fire before scene shutdown, it must use stored handler cleanup.

## State Rules

- `gameState` is the source of truth for campaign state.
- A scene may keep a temporary session copy only when it is necessary for live play, such as `inventoryCopy`.
- End-of-session values must be written back through `updateGameState(...)`.
- Do not store Phaser objects, DOM elements, AudioNodes, or timers in `gameState`.

## File Size Rules

Use these thresholds as refactor triggers:

- Scene over 1,500 lines: do not add a new subsystem directly. Extract first or add to an existing system/object.
- Function over 120 lines: split orchestration from calculation.
- Repeated balance formula in two places: move to `src/config/`.
- Repeated Phaser visual pattern in two places: move to `src/objects/` or a scene helper.

## Safe Change Workflow For Coding Agents

1. Identify which layer owns the change.
2. Modify the owning layer first.
3. Keep scene edits to wiring and orchestration.
4. Run `npm run build`.
5. Smoke test the game start screen.
6. If touching `GrillScene`, search for these before finishing:
   - `<<<<<<<`
   - `@ts-ignore`
   - `EventBus.off('`
   - hardcoded new balance constants

## Current Known Debt

- `GrillScene.ts` is still too large and should eventually be split by responsibility.
- Several comments and older planning documents contain mojibake from prior encoding damage.
- Phaser bundle size is above Vite's default warning threshold because Phaser is bundled into the main chunk.
