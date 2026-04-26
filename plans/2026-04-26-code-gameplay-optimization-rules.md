# Code and Gameplay Optimization Rules

## Goals

This pass keeps the current Phaser scene flow intact while making future balance changes safer. The main rule is: gameplay pressure values must live in a small balance module, not as scattered magic numbers inside `GrillScene`.

## Code Rules

1. Do not call `EventBus.off('event-name')` without a handler reference.
   - Store the exact callback assigned by the scene.
   - Remove only that callback during cleanup.
   - This prevents one scene or panel from deleting unrelated listeners registered by another system.

2. Do not add `@ts-ignore` for unused fields.
   - If the field is only reserved for future use, delete it.
   - Reintroduce it when a real read/write path exists.

3. Keep balance formulas outside large scenes.
   - Put day, tier, difficulty, interval, burst, and cap formulas in `src/config/grillBalance.ts`.
   - `GrillScene` should ask the config module for values, then apply them.

4. Avoid frame-rate-like upgrades.
   - Upgrades should feel strong but still run on a readable cadence.
   - Example: auto-grill serves 3 sausages every 0.75s instead of serving every update tick.

5. Avoid debug logs in production gameplay loops.
   - Use `console.debug` only for explicit diagnostics.
   - Remove logs inside per-chart or per-note setup unless they are guarded by a dev flag.

## Gameplay Rules

1. Pressure should scale from three inputs:
   - Day: later days increase customer pressure.
   - Tier: higher territory increases pressure and service-combo density.
   - Difficulty: casual widens spacing; hardcore tightens spacing and allows more events.

2. Service combo groups should remain compact, but their density should vary.
   - Casual: fewer notes, longer interval.
   - Normal: current middle-ground pressure.
   - Hardcore or high tier: more notes, shorter interval.

3. Customer arrivals should use chart pressure as the base, not only elapsed day.
   - Difficulty bands in the rhythm chart are allowed to push arrival intervals up or down.
   - Clamp intervals so the game never becomes impossible through accidental near-zero spacing.

4. Customer batch size should scale predictably.
   - Early game: smaller batches.
   - Mid game: larger batches.
   - Late game or high tier: peak batches.
   - Casual trims the peak; hardcore raises it.

5. Session event caps should scale gently.
   - Early sessions should have fewer interruptions.
   - Later or higher-tier sessions can have more events.
   - Hardcore may add one extra event.

## First Implemented Pass

- Added `src/config/grillBalance.ts`.
- Moved session duration, initial arrival interval, band arrival interval, customer batch range, service combo config, auto-serve config, and max session events into the balance module.
- Changed combat and black-market event cleanup to remove only scene-owned handlers.
- Removed an unused background image field and its `@ts-ignore`.
- Removed service-combo setup logging from the gameplay path.
