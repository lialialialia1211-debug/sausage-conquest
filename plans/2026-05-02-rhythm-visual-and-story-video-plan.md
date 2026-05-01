# 2026-05-02 Rhythm Visual And Story Video Optimization Plan

This temporary plan tracks the current optimization pass. Check each item only after implementation and verification.

## Scope

- Add a reusable looping story-video overlay for future adult story segments.
- Prioritize the grill rhythm-note experience.
- Start formalizing visual-unification rules for the whole project.

## Checklist

- [x] Step 1: Add this temporary plan and use it as the implementation tracker.
- [x] Step 2: Add a reusable DOM story-video panel that can loop a 5-second video and close back to the game flow.
- [x] Step 3: Add a test-tool entry for opening the story-video overlay without wiring it into the main story yet.
- [x] Step 4: Improve the grill rhythm lane readability around the centered hit zone.
- [x] Step 5: Strengthen hit feedback and full-grill `HEAT UP` feedback without covering the note lane.
- [x] Step 6: Add a project visual-unification checklist for future UI/customer/art passes.
- [x] Step 7: Run build verification.

## Notes

- Do not wire unknown R18 content directly into the main progression yet.
- Use a DOM `<video>` overlay for narrative video. It is more reliable than putting video frames into Phaser when the content is a story cut-in.
- Autoplay must be muted for browser compatibility. If sound is required, start playback after a player click.
- Keep the rhythm hit zone centered; it is already implemented at `noteHitX = width / 2`.
- Full grill hits already convert into heat input. This pass should improve communication and feel, not change the core rule.
