# Current Project Memory

This is the short operational memory for `sausage-conquest`.
Coding agents should read this together with `docs/code-architecture-spec.md`, `docs/grill-integration-spec.md`, and `docs/ui-asset-integration.md` before making gameplay or UI changes.

Last updated: 2026-05-02.

## Current QA Links

- Normal QA: https://lialialialia1211-debug.github.io/sausage-conquest/
- Test tools: https://lialialialia1211-debug.github.io/sausage-conquest/?test=1

GitHub Pages can cache old builds briefly. Use a version query such as `?v=<commit>` when checking a fresh push.

## Confirmed Current State

- The title/mode screen uses generated art cards for `指烤火拼` and `小烤怡情`.
- The rhythm hit zone is already centered horizontally in `GrillScene` (`noteHitX = width / 2`).
- Full grill behavior is already implemented: a valid hit on a full grill becomes `HEAT UP`, keeps rhythm judgement/combo, and accelerates existing grill sausages.
- Browser/tab focus pause is implemented through `externalPagePaused` and `isGloballyPaused()`. Audio-only pause is not acceptable; notes/timers/workers/customers must pause together.
- Morning purchases write `gameState.inventory` and `gameState.purchaseQuantities`.
- Rhythm note sausage distribution should follow morning purchase mix without deleting the chart pattern.
- The warming zone is intended to be visually consolidated around large warming-box art, not many tiny independent boxes.
- Test tools exist behind `?test=1`.

## Important Design Decisions

- The game is a Taiwanese night-market sausage rhythm/management game.
- Morning purchase choices should matter during grilling, not only as cost/revenue math.
- The music lane must remain intact even when stock is low. Stock affects placement and selling, not note existence.
- Grill-full pressure should be a positive skill moment, not a failure state.
- UI art should be used as real layout frames. Avoid placing generated art as decorative stickers behind unrelated boxes.
- The visual style is glossy mobile-game night-market UI: warm orange/gold lighting, bold dark outline, sausage/rhythm motifs.
- NSFW direction should remain non-explicit and stylized if used; no nudity or explicit sexual content.

## Current Architecture Risk

- `GrillScene.ts` is still too large and owns too many responsibilities.
- Some older data/comment strings contain mojibake from previous encoding damage.
- Some docs and implementation can drift. When behavior changes, update docs in the same commit.
- `grill-expand` data and implementation should be checked for alignment before future balance work.

## Next Architecture Target

The next refactor should not rewrite gameplay. It should extract named rule helpers around current behavior:

- Rhythm judgement and combo session rules.
- Grill production rules for empty-slot placement vs full-grill heat input.
- Customer flow and service-combo rules.
- Item effect rules for sausages, workers, shop, black market, and casino.
- Summary output rules.

Keep `GrillScene` as Phaser orchestration: visuals, input, timers, scene transitions, and calls into systems.

## Discussion Backlog

- Stronger hit effects around the centered hit zone.
- More consistent UI layout across morning, shop, casino, black market, summary, and grill.
- Better Obsidian/repo memory sync to reduce long-chat drift.
- More test tool presets: full grill, short song, all shop effects, casino/black market day, summary grade cases.
- Direct grill-loop hooks for casino results.
- Clearer player-facing explanation of how each sausage type affects rhythm production.
