# Visual Unification Checklist

Use this checklist before adding or replacing UI/customer/story art.

Last updated: 2026-05-02.

## Style Contract

- Theme: Taiwanese night market sausage rhythm game.
- Material: glossy mobile-game UI, warm orange/gold lighting, bold dark outline.
- Motion tone: arcade impact for rhythm hits, restrained ambient glow for management pages.
- Avoid generic dashboard cards. UI frames should look like night-market props, signs, trays, grills, counters, or arcade panels.

## Global UI Rules

- Use generated art as the actual frame/container, not as a background sticker behind unrelated boxes.
- Keep text inside the intended empty area of the frame.
- Keep gameplay lanes clear: combo, popups, and stickers must not cover the note path for more than a short impact frame.
- Prefer one strong visual frame per panel over nested card stacks.
- Every primary button needs visible normal/hover/disabled states.
- Every new asset must be listed in `src/data/uiAssets.ts` if Phaser needs to preload it.

## Screen Priorities

1. Boot/mode selection: maintain the two card-frame mode choices.
2. Morning procurement: use frames as real item cells and detail panels.
3. Grill rhythm: protect the hit zone, note lane, grill slots, and warming boxes.
4. Summary: focus on rhythm mastery, grade, revenue, and next-day implications.
5. Shop/workers/marketing: make item icons consistent, with clear purchase state.
6. Black market/casino: visually distinct but still within night-market/neon material language.

## Customer Art Direction

- Customers need readable silhouettes at small size.
- Customer type must be visible through face/body language before text is read.
- Avoid mixing realistic photos with glossy illustrated UI.
- Customer patience/status UI should use the same orange/cyan neon frame style.

## Story Video Rules

- Story video uses a DOM `<video>` overlay.
- Default test path: `public/videos/r18-loop.mp4`.
- Use `loop`, `playsInline`, and muted autoplay by default.
- If audio is needed, require user/player interaction before playback.
- Story video should be a scene break or overlay, not a permanent gameplay HUD.

## QA For Visual Changes

- Capture desktop screenshot.
- Capture mobile/narrow screenshot if the screen is DOM-heavy.
- Verify no text overlaps its frame.
- Verify no UI blocks the rhythm note lane during normal play.
- Verify generated art is not stretched beyond recognition.
