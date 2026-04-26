# Grill Integration Spec

This document defines how upstream systems must connect to `GrillScene`.
Use it as the implementation contract for future gameplay changes.

## Core Data Flow

1. `MorningPanel` writes `gameState.inventory` and `gameState.purchaseQuantities`.
2. `GrillScene.startRhythmGame()` injects service combo notes, then calls `redistributeNoteSausages()`.
3. Normal rhythm notes are allocated from real `gameState.inventory`.
4. `purchaseQuantities` controls the sausage type mix for the night.
5. Actual inventory is the hard cap. If the player bought 12 sausages, only 12 normal notes may become grillable sausages.
6. Service combo notes are separate bonus/service pressure notes and do not consume morning stock.
7. After note allocation, `generateCustomerPool()` must run again so customer demand follows the final chart note count.
8. A hit note may spawn a sausage only when inventory exists and a grill slot is empty.
9. If the grill is full, the note is blocked with `BLOCKED`; do not count `PERFECT/GREAT/GOOD` and then also count `MISS`.
10. Selling a sausage is the only place that deducts real `gameState.inventory`.

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

The rhythm lane represents "putting one sausage onto the grill".

- `PERFECT/GREAT/GOOD`: the player successfully placed a sausage on an empty grill slot.
- `MISS`: the player failed or had no stock for that note.
- `BLOCKED`: the player pressed correctly, but the grill was full. This is feedback, not a rhythm hit and not a normal miss.
- The top-right HUD displays rhythm judgement stats, not grill doneness stats.
- Grill doneness remains a separate sale-quality system calculated after the sausage exists on the grill.

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
3. Buy a small fixed inventory count: normal grillable notes should not exceed that count.
4. Fill the grill and hit a note: show `BLOCKED`, no simultaneous `PERFECT` and `MISS`.
5. Switch browser tab/window during grilling: BGM, notes, timers, workers, and customers all freeze.
6. Right HUD stats match rhythm judgements.
7. There is no "dismiss first customer" button in the queue UI.
