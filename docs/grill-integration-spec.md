# Grill Integration Spec

This document defines how upstream systems connect to `GrillScene`.
Use it as the current implementation contract for future gameplay changes.

Last synchronized with implementation: 2026-05-02.

## Core Data Flow

1. `MorningPanel` writes `gameState.inventory` and `gameState.purchaseQuantities`.
2. `GrillScene.startRhythmGame()` injects service combo notes, then calls `redistributeNoteSausages()`.
3. Normal rhythm notes keep the chart intact so the music pattern does not disappear mid-song.
4. `purchaseQuantities` controls the sausage type mix for the night.
5. Actual inventory is enforced when placing/selling sausages, not by deleting notes from the chart.
6. Service combo notes are separate bonus/service pressure notes and do not consume morning stock.
7. After note allocation, `generateCustomerPool()` must run again so customer demand follows the final chart note count.
8. A correctly hit note first tries to place a sausage on an empty grill slot.
9. If the grill is full, the note remains a valid rhythm hit: keep the judgement, combo, hit stats, and service-combo tracking, then convert the hit into heat input via `boostGrillFromRhythm(...)`.
10. Full-grill heat input speeds up sausages already on the grill and then calls `autoServeReady()` so completed sausages can move to warming and free slots.
11. Morning inventory is consumed while placing rhythm sausages from `inventoryCopy`; end-of-session sync writes `inventoryCopy` back to `gameState.inventory`.
12. Selling uses warming-zone sausages and records sales/quality; do not delete music notes to enforce stock.

## Pause Contract

`GrillScene.isGloballyPaused()` is the single master pause gate.

Paused states:

- tutorial/manual pause
- browser tab hidden
- browser window blur
- grill event overlay
- condiment station
- player away activity
- combat panel

When paused, all rhythm spawn/miss logic, timers, worker AI, auto-serve, and BGM progression must stop together. Do not pause only audio.

## Rhythm And Grill Semantics

The rhythm lane represents "production rhythm": either placing a sausage or accelerating sausages already on a full grill.

- `PERFECT/GREAT/GOOD` with an empty grill slot: place a sausage on the grill when stock exists.
- `PERFECT/GREAT/GOOD` with a full grill: count as a rhythm hit, keep combo, show `HEAT UP`, and heat existing grill sausages.
- `MISS`: the frontmost eligible note passes the good window without being hit.
- Wrong key: do not score a later same-color note through the frontmost note. This prevents simultaneous `PERFECT` and `MISS`.
- The top-right HUD displays rhythm judgement stats, not grill doneness stats.
- Grill doneness remains a separate sale-quality system calculated after the sausage exists on the grill.

Current hit zone placement:

- `GrillScene.setupRhythmTrack()` sets `noteHitX = width / 2`.
- `noteTrackY = height * 0.42`.
- Future layout changes should preserve the hit zone as the primary visual focus and keep combo/judgement art from blocking the note lane.

## Shop Upgrade Hooks

Current hooks:

- `grill-expand`: increases grill slots from 8 to 12.
- `auto-grill`: changes auto-pack interval/burst through `getAutoServeConfig()`.
- `neon-sign`: adds `+0.15` customer traffic in `generateCustomerPool()`.

Rules for future fixes:

- `grill-expand` data says `effect.grillSlots: 2`, but `GrillScene` currently grants 4 extra slots. Pick one rule and keep data/code aligned.
- `seating` has `effect.spendBonus: 0.2` but no confirmed grill-sale hook. It should apply in the sale price calculation, not customer generation.
- `mini-fridge` has `effect.spoilReduction: 0.1` but no confirmed overnight/warming decay hook. It should reduce overnight quality decay, not rhythm timing.
- Upgrade effects should be read from data where practical instead of hardcoded duplicate numbers.

## Marketing Hooks

Current hooks:

- `flyer`: writes `dailyTrafficBonus`; `GrillScene.generateCustomerPool()` consumes it and resets it.
- `free-sample`: immediately changes reputation.
- `discount-sign`: stored in `marketingPurchases`; intended for customer buy-rate/order conversion.
- `sausagebox`: stored in `marketingPurchases`; opens lucky draw via `SausageBoxPanel`.

Rules:

- Marketing items that affect today's customer count must apply before `generateCustomerPool()`.
- One-day bonuses must be consumed once and reset after customer generation.
- Persistent purchase counters must be decremented only by the system that consumes them.

## Worker Hooks

Current hooks:

- `adi`: grants +1 grill slot and has a timed chance to overcook a grill sausage.
- `mei`: auto-serves warming-zone sausages.
- `wangcai`: can scare away arriving customers and can block nuisance/thug events.
- `dad`: activates warming-zone quality behavior through `workerDadActive`.

Rules:

- Workers may automate grill/warming/customer actions, but must use the same inventory, slot, and sale APIs as player actions.
- Worker side effects must be visible as feedback text or HUD state.
- Worker actions must obey global pause.

## Black Market Hooks

Current hooks:

- Buying black market items adds `blackMarketStock`, underground reputation, and chaos.
- `GrillScene` auto-consumes black market stock in sale calculation through `useBlackMarketItem()`.
- Each consumed item adds `qualityBonus` to the sale-quality path.

Rules:

- Black market items should modify sale outcome, customer risk, or event risk, not note allocation.
- Auto-consume should be predictable. If manual selection is added later, remove blind "consume first available item" behavior.
- Inspector/caught effects must route through the event/overlay system and obey global pause.

## Casino Hooks

Current hooks:

- Casino changes money, reputation, underground reputation, and chaos.
- There is no direct grill-loop modifier today.

Recommended future hooks:

- `traffic-guess` win: add a one-day `dailyTrafficBonus` or customer-quality bonus.
- `dice` win streak: temporary morale bonus, e.g. wider judgement window for one day.
- `all-in` win: one-day high-value customer chance.
- Loss streak: one-day impatient-customer or chaos-event increase.

Rules:

- Casino effects should write explicit state fields before grill starts.
- Do not hide casino effects inside `GrillScene` random branches.
- Summary screen should show which casino effects affected the day.

## QA Checklist

Before pushing gameplay changes:

1. `npm run build` must pass.
2. Start a day with zero inventory: normal notes should not spawn grillable sausages.
3. Buy a small fixed inventory count: note pattern should stay intact, but placement/sales still respect stock.
4. Fill the grill and hit a note: existing sausages heat faster, no simultaneous `PERFECT` and `MISS`.
5. Switch browser tab/window during grilling: BGM, notes, timers, workers, and customers all freeze.
6. Right HUD stats match rhythm judgements.
7. There is no "dismiss first customer" button in the queue UI.
