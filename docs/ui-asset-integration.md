# UI Asset Integration Notes

Generated UI assets live in `public/ui/`. The source of truth for code-facing keys and paths is `src/data/uiAssets.ts`.

## Asset Groups

### Grill HUD

Use these in `BootScene.preload()` and `GrillScene`:

- `ui-note-don.png`: D / DON note sprite.
- `ui-note-ka.png`: F / KA note sprite.
- `ui-hit-zone.png`: judgement target marker.
- `ui-heat-up.png`: full grill / accelerated cooking feedback.
- `ui-combo-badge.png`: center combo badge base.
- `ui-service-combo.png`: batch service combo feedback.
- `ui-warming-slot.png`: warming slot frame.
- `ui-grill-slot.png`: grill slot frame.
- `ui-fire-meter.png`: fire / heat meter frame.
- `ui-pause-overlay-icon.png`: pause overlay visual when the page loses focus.

### Judgement Popups

Use these for rhythm hit feedback instead of text-only popups:

- `judge-perfect.png`
- `judge-great.png`
- `judge-good.png`
- `judge-miss.png`
- `judge-full-combo.png`

Rules:

- Spawn judgement art near the center hit zone, not at the screen edge.
- Keep lifetime short, around 350-550 ms.
- Scale by viewport height, not by raw pixel size.
- Do not stack more than one judgement popup per lane; replace or fade the previous one.

### Shop Icons

Use these as replacements for current shop image fields:

- `grill-expand` -> `ui/upgrade-rhythm-grill.png`
- `mini-fridge` -> `ui/upgrade-fresh-box.png`
- `neon-sign` -> `ui/upgrade-neon-sign-rhythm.png`
- `seating` -> `ui/upgrade-seat-buffer.png`
- `auto-grill` -> `ui/upgrade-auto-pack.png`
- `flyer` -> `ui/marketing-rhythm-flyer.png`
- `discount-sign` -> `ui/marketing-discount-beat.png`
- `free-sample` -> `ui/marketing-free-sample-hot.png`
- `sausagebox` -> `ui/marketing-sausage-box.png`

Rules:

- DOM panels should reference the `public` path directly: `ui/<file>.png`.
- Phaser scenes should preload with the texture key from `UI_ASSETS`, then render by key.
- Keep shop icons square and use `object-fit: contain`.

### Stickers

Use these for temporary reactions and event flavor:

- `sticker-sausage-energy.png`: high combo, boost, or power-up.
- `sticker-too-hot.png`: overheat, spicy, or burn warning.
- `sticker-censored-sausage.png`: cheeky warning or black-market flavor.
- `sticker-customer-blush.png`: customer reaction.

Rules:

- Stickers are decorative feedback, not core state indicators.
- Keep them outside the note lane and grill slots.
- Avoid explicit sexual content; use innuendo only.

## Preload Rule

For Phaser, load all `category !== 'shop'` assets in `BootScene.preload()` unless a shop icon will also be used inside a Phaser scene. DOM shop icons do not need Phaser preload.

## Verification

After wiring assets:

1. Run `npm run build`.
2. Start the Vite dev server.
3. Smoke test title -> morning -> grill -> summary -> shop.
4. In grill, verify D/F notes, hit zone, judgement popups, combo, pause overlay, heat-up, and service combo.
5. In shop, verify all cart upgrade and marketing icons load without broken image placeholders.
