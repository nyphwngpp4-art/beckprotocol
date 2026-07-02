# M6-T2 QA Checklist — Accessibility & Mobile

Manual verification pass for M6-T2, run against the M6 branch after the
text-speed option, touch D-pad audit, and colorblind marker pass. Each item
below was checked by hand against `tools/screens/` captures from
`node tools/smoke.mjs` and/or direct play in a browser.

## Text-speed option (pause → OPTIONS)

- [x] Pause → OPTIONS shows a third row, `TEXT SPEED: NORMAL`, between MUTE
      and RESTART CHAPTER. See `tools/screens/15-pause-options-tab.png`.
- [x] Pressing `[Z]` on that row cycles `NORMAL → FAST → INSTANT → NORMAL`
      (`cycleTextSpeed()`), each press also playing the `confirm` sfx.
- [x] `NORMAL` types at 2 frames/char (unchanged from pre-M6 behavior).
- [x] `FAST` types at 1 frame/char — visibly quicker in the dialogue box,
      still a typewriter (not instant).
- [x] `INSTANT` reveals the full line immediately on first advance, no
      per-character reveal, and still plays a `text` blip so it doesn't feel
      silent/broken.
- [x] The setting persists in `beck_save_v1` (`textSpeed` field) and is
      restored on page load, the same way `muted` already is — verified by
      setting FAST, reloading the page, and confirming the pause OPTIONS row
      still reads `TEXT SPEED: FAST`.
- [x] Choice-line text (which doesn't use the typewriter) is unaffected —
      only regular dialogue lines respect the setting.

## Touch D-pad coverage

- [x] `setupTouch()` renders 7 buttons: `↑ ← Z → ↓ X II`. Confirmed
      programmatically (`document.querySelectorAll('button').length === 7`)
      and visually in `tools/screens/36-touch-dpad-pause.png`.
- [x] Movement: holding the `↓` touch button (pointerdown → wait → pointerup,
      not a quick click) moves Beck — automated in `tools/smoke.mjs`
      (M6-T2 phase), asserts `pl.x`/`pl.y` changed.
- [x] Interact/confirm: the `Z` touch button starts a new game from the
      title and advances the intro slides — automated in the same phase.
- [x] Pause (Enter-equivalent): the `II` touch button toggles `PAUSED` on
      and off — automated, asserts `game.state` before/after each tap.
      Screenshot: `tools/screens/36-touch-dpad-pause.png`.
- [x] `X` (skip/cancel) is wired to the same `KeyX` handling already
      exercised by the keyboard-driven parts of the smoke test; no separate
      touch-only code path exists for it, so no additional touch-specific
      risk beyond what's already covered.
- Note: the touch context is Chromium's `hasTouch: true` emulation, not a
  real device. Real-device touch latency/hit-testing (button size, spacing)
  was not re-verified this pass — the 44×44px buttons with 2px gaps were
  already sized for touch in the pre-M6 implementation and are unchanged.

## Colorblind check

- [x] Vision cones were already shape-distinct (translucent yellow
      **triangles** radiating from each guard, not a color-only halo) —
      no change needed, confirmed by re-reading `drawGuardCone`.
- [x] Evidence `!` markers now carry a pulsing corner outline (4 white
      corner dots stepping between 1px and 3px offset) independent of the
      amber fill, so the marker reads as "something here, look closer" via
      motion + shape, not hue alone. See the amber markers with white
      corner pips in `tools/screens/21-dock-arrival.png`.
- [x] Guard `?`/`!` state icons (SUSPICIOUS/ALERT) already differ by glyph
      shape (`?` vs `!`) in addition to color (yellow vs red) — no change
      needed.
- [x] Hearts (HUD) are a fixed pixel-heart shape at a fixed position, not a
      color-coded bar — already shape/position based, not color-only.
- Note: this was a visual/code read-through against the three specific
  cases called out in the plan (evidence markers, vision cones), not a
  full simulated-colorblindness render pass across every screen. No other
  color-only signal was found during this pass.

## Summary

All boxes ticked. No regressions found; `node tools/smoke.mjs` stayed green
across all changes (see M6-T1 for the 3-run log).
