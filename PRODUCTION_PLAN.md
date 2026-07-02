# BECK HAWTHORNE: ORIGIN — Production Plan v1

**Author:** Fable (planning + final review)
**Executors:** Sonnet-class models, one milestone at a time
**Target file:** `beck_hawthorne_8bit.html` (the ONLY active game file; `beck_hawthorne_origin.html` is legacy — do not touch it)
**Branch:** `claude/beck-hawthorne-game-l6ai7a`

---

## 1. Vision & Design Pillars

A top-down, NES-Zelda-style spy adventure about Beck Hawthorne, 15, who out-thinks
everyone in the room. The game should feel like a lost NES cartridge: crunchy pixel
art, chiptune audio, tight scenes, zero filler.

**Pillars — every task must serve at least one:**

1. **Brains over brawn.** Beck never fights. She observes, deduces, sneaks, and runs.
   Puzzles and stealth are the verbs. No weapons for the player, ever.
2. **NES authenticity.** 256×240 logical resolution, 16px tiles, fillRect pixel art,
   limited palette (`P`), monospace bitmap-style text, chiptune square/triangle audio.
   If the NES couldn't plausibly do it, we don't do it.
3. **The story is the reward.** Dialogue choices matter and echo later. Tone:
   smart, dry, warm. PG. Danger is real but never graphic.
4. **Zero friction.** One HTML file, no dependencies, no build step, works by
   double-clicking the file. Loads instantly. Playable with arrows + Z + X only.

**Hard constraints (violating any of these fails review):**

- Single self-contained HTML file. No external assets, no CDN, no libraries.
- All art is `fillRect` pixel art in game-space coordinates (see `drawBeck` for the
  house style). No `arc`, `ellipse`, `quadraticCurveTo`, no gradients, no shadowBlur.
- All colors come from palette `P` or are defined as named consts near their sprite.
- Game logic operates in 256×240 space; `SCALE` is applied only via the single
  `ctx.setTransform(SCALE,0,0,SCALE,0,0)` in `loop()`.
- Keep `'use strict'` and the existing section-banner comment style.
- Content stays age-appropriate: peril yes, gore no, profanity no.

---

## 2. Current State (audit)

What exists and works (commit `4955438`):

- Scenes: title → 4 intro slides → chapter card → bedroom → Pattern Lock minigame
  (2 geo puzzles + anomaly hunt) → dock evidence hunt (4 items) → dock chase
  (1 homing smuggler) → school (Indy dialogue) → cafeteria (recruitment scene,
  3-branch choices) → ending screen with choice-dependent text.
- Systems: tile maps with per-tile detail rendering, camera clamp, 4-dir player with
  2-frame walk, dialogue engine with typewriter/choices/labels/jumps, hearts +
  invincibility, HUD (hearts, evidence counter, scene-name flash), touch D-pad.
- Beck sprite: 14×28 four-direction pixel art with distinct profiles. NPC sprites
  share a parameterized drawer.

Known gaps (these define the plan):

| Gap | Severity |
|---|---|
| No audio at all | Blocker for "production" |
| No save/continue — closing the tab loses everything | Blocker |
| Scene changes are hard cuts, no transitions | High |
| Dock "stealth" is one homing enemy; no spy fantasy | High |
| No pause, no objective reminder — players get lost after a break | High |
| School/cafeteria are empty boxes; world feels dead | Medium |
| Title screen is text-only | Medium |
| Dialogue has no portraits; speakers blur together | Medium |
| No game-over flow polish, no ending → restart ceremony | Medium |
| Dead code: `puzzle.round`, `isCopy`, `nextScene` fields, `hh` const | Low |

---

## 3. Milestones

Execute **in order**, one milestone per session/PR-sized commit. Each task has an ID
(`M2-T3`), a spec, and a **Definition of Done (DoD)**. Do not start a milestone
until the previous one's smoke test passes. Do not do work from a later milestone
"while you're in there."

### M0 — Foundations & Safety Net

> Goal: make the file safe to iterate on. No visible gameplay changes except saves.

**M0-T1: Commit a smoke-test script.**
Create `tools/smoke.mjs`: a Playwright script (Chromium at
`/opt/pw-browsers/chromium-*/chrome-linux/chrome` when run in the dev container;
fall back to default launch elsewhere) that: loads the file, asserts no console
errors, presses Z through title/intro/chapter card, asserts `game.state === 'EXPLORE'`
via `page.evaluate`, walks each direction for 30 frames, opens the computer puzzle,
and screenshots each stage to `tools/screens/`. Add `tools/README.md` with the run
command. *DoD: `node tools/smoke.mjs` exits 0 and writes ≥6 screenshots.*

**M0-T2: Dead code sweep.**
Remove `puzzle.round`, `isCopy`, unused `nextScene` map fields, the orphan `hh`
const, and any other unreferenced symbols found by inspection. *DoD: smoke test
passes; `grep` finds no references to removed names.*

**M0-T3: Save system.**
- `saveGame()` → localStorage key `beck_save_v1`, JSON
  `{v:1, mapId, evidenceFound, choices, hearts}`. Call it in `loadScene()` and after
  every dialogue that sets a `choices` key.
- Title screen: if a save exists, show `CONTINUE` above `NEW GAME` (arrow keys +
  Z to pick). Continue restores map + state via `loadScene(save.mapId)`.
  New Game clears the key after a "start over?" confirm if a save exists.
- Wrap all localStorage access in try/catch (file:// contexts can throw).
*DoD: smoke test extended — start, reach bedroom, reload page, CONTINUE returns to
bedroom with state intact.*

**M0-T4: Scene transition system.**
`transition.start(kind, midFn)` — 'fade' (24 frames out, run `midFn`, 24 in) drawn
as a full-screen black overlay with stepped alpha (8 discrete levels — NES has no
smooth alpha). Route `loadScene` and puzzle-exit through it. Input is ignored while
transitioning. *DoD: bedroom→dock cut is a visible stepped fade in screenshots
(capture mid-transition frame).*

### M1 — Audio (chiptune engine + score)

> Goal: the single biggest production jump. Everything is synthesized in WebAudio —
> no audio files.

**M1-T1: Engine.**
One `AudioContext`, created lazily on first keydown (autoplay policy). Module
`AU` with:
- `sfx(name)` — short envelope'd notes from square/triangle/noise (noise = buffer of
  random samples). Needed names: `text` (dialogue blip), `confirm`, `cancel`,
  `pickup` (evidence), `hurt`, `alert`, `success`, `door`, `heart`.
- `music(name)` / `stopMusic()` — a 2-channel sequencer (pulse lead + triangle bass)
  stepping a note table at a set BPM via `setInterval`-free scheduling
  (lookahead with `ctx.currentTime`). Loops.
- Master mute on `KeyM`, persisted in the save. HUD shows a tiny `♪`/`♪̶` glyph.
*DoD: pressing M toggles; no console errors; sfx audible on evidence pickup.*

**M1-T2: Score.** Compose in note tables (arrays of `[midiNote, sixteenths]`):
- `title` — slow, mysterious minor key.
- `bedroom` — quiet, curious.
- `dock` — tense, sparse bass.
- `chase` — fast variant of dock (same key, +40 BPM).
- `school` — light, daytime.
- `ending` — resolved, hopeful.
Wire: title screen, each `loadScene`, chase trigger swaps dock→chase, ending screen.
Keep each loop 8–16 bars. *DoD: every scene has music; chase audibly shifts;
loops have no gap or click (schedule next loop before current ends).*

### M2 — UI & Game Feel

**M2-T1: Pause + Evidence Journal.**
`Enter` (and touch button) toggles `PAUSED` state: dark overlay, three tabs
(arrow keys): **OBJECTIVE** (current goal, one sentence — data-drive with a
`game.objective` string updated at each story beat), **EVIDENCE** (list of found
evidence with 1-line summaries, grayed placeholders for unfound), **OPTIONS**
(mute toggle, restart chapter). *DoD: pause works in every EXPLORE/CHASE state and
never during dialogue mid-line corruption; screenshots of all three tabs.*

**M2-T2: Objective ticker.**
When `game.objective` changes, slide a one-line banner down from the top for ~3s:
`★ NEW OBJECTIVE: …`. Also show current objective on the pause screen.
*DoD: banner appears after computer puzzle ("Get to the East Dock") and after 4th
evidence ("Get out — reach the EXIT").*

**M2-T3: Dialogue portraits.**
16×16 pixel portrait (head only) at the left of the dialogue box per speaker:
BECK, INDY, STERLING, KANE (reuse head-drawing pieces of the character sprites —
extract shared helpers rather than copy-pasting). Box text shifts right by 24px.
Speaker with no portrait (narrator '') renders as now. Play `AU.sfx('text')` every
2nd typed character. *DoD: screenshots of each portrait during their scene.*

**M2-T4: Title screen art.**
Replace text-only title with: night skyline strip (simple rect silhouettes), a
large 24×40 Beck sprite (scaled-up variant, drawn once — not the in-game sprite
stretched), animated star field, and the existing menu (CONTINUE/NEW GAME from
M0-T3). Keep title text layout. *DoD: screenshot review; no ctx paths used.*

**M2-T5: Feel pass.**
- Footstep dust: 2px particles behind Beck every 8 walked frames.
- Damage: 4-frame camera shake (±2px offsets on `cam` at draw time only).
- Evidence pickup: item flashes white, `!` marker pops with 6-frame scale-in,
  `AU.sfx('pickup')`.
- Heart restore on scene load: brief green `+` above Beck.
*DoD: each effect visible in a captured frame; game still 60fps (no per-frame
allocations in hot loops — reuse arrays).*

### M3 — Dock Stealth Overhaul (the spy fantasy)

> Goal: replace "one homing smuggler after the fact" with real light stealth
> while collecting evidence. Kid-friendly difficulty: generous cones, slow guards.

**M3-T1: Patrol guards.**
Add 3 guards to the dock map, each with a waypoint loop (`[{tx,ty},…]`, walk
speed 0.6). They use the existing NPC drawer (dark clothes, flashlight-yellow
trim). Guards are active from dock scene start.

**M3-T2: Vision cones.**
Guard state machine: `CALM` → (player inside cone) → `SUSPICIOUS` (0.75s, `?` above
head, guard stops and stares) → if player still visible → `ALERT` (`!`, `AU.sfx('alert')`,
music swaps to `chase`, guard pursues at 0.95 speed) → 3s without line-of-sight →
back to `CALM`, returns to nearest waypoint, music returns.
- Cone: facing direction, range 56px, half-angle 35°. Render as a translucent
  stepped-alpha yellow triangle of small rects (no ctx paths).
- Line-of-sight: step along the guard→player line every 4px; any solid tile blocks.
- Player touching an ALERT guard: existing damage/knockback/invincibility flow.
  0 hearts keeps the current forgiving reset (evidence retained).
*DoD: smoke-test bot walks into a cone and `guard.state === 'ALERT'` is asserted;
walks behind a crate and guard returns to CALM.*

**M3-T3: Hide spots.**
Standing on a shadow tile (`SH`, id 17) makes Beck invisible to cones (sprite dims
to 60%). Teach it: first time entering shadow, one-line toast "Shadows hide you."
*DoD: assertion — player in cone but on SH stays undetected.*

**M3-T4: Chase finale rebalance.**
After the 4th evidence, all guards go permanently ALERT (existing smuggler becomes
guard #4 nearest the sheds) and the EXIT gate flashes. Remove `triggerDockChase`'s
single-smuggler special case; `DOCK_CHASE` state merges into EXPLORE + alert flags.
Tune so a first-time player escapes with 1–2 hearts lost. *DoD: full dock
playthrough via bot: collect 4, escape, reach school; manual tune notes in commit.*

### M4 — Living World

**M4-T1: School hallway dressing.** Doors, bulletin boards, a trophy case
(new tiles), 3 wandering student NPCs (random-waypoint, non-interactive flavor or
one-liners: "Did you see the news about the dock?"). Indy keeps her position.

**M4-T2: Cafeteria dressing.** Lunch line counter, food trays on tables, 4 seated
student NPCs (drawn seated: no legs, chair-back rect), ambient chatter one-liners.
Sterling & Kane isolated at the far table — staging should make them feel wrong
in the room (empty tables around them).

**M4-T3: Bedroom detail.** Rug, posters (PATTERN LOCK poster above desk), clothes
pile, window shows animated rain instead of static stars. Inspecting bed/bookshelf/
window gives one flavor line each (reuse item system with `flavor:true` items that
don't add to evidence).

*M4 DoD: screenshots of all three rooms; every new tile obeys pillar 2; no walkway
is blocked (bot can still complete the game).*

### M5 — Story & Presentation Polish

**M5-T1: Choice echoes.** Track `choices.indy` in the recruitment scene: if Beck
told Indy everything (`full`), Kane references it ("You told a civilian, too.");
if `deflect`, Indy texts Beck during the ending ("you're still a bad liar. call me.").
Small — one inserted line per branch. *DoD: both branches verified via bot-driven
choice selection.*

**M5-T2: Ending ceremony.** After the ending text: stepped fade to black, show
mission-report card (evidence photos count, hearts remaining, choices summary as
"PSYCH PROFILE: [DIRECT / GUARDED / SILENT]"), then `CHAPTER TWO: TEAM — COMING
SOON`, then return to title (save cleared → NEW GAME +). *DoD: screenshot of report
card; restart returns to a working title state (regression check on `restartGame`).*

**M5-T3: Intro slide art.** Each intro slide gets one small pixel-art vignette
above the text (satellite dish / phone screen / crate silhouette / eye). ≤40×24px
each, fillRect only. *DoD: screenshots.*

### M6 — QA, Accessibility, Release

**M6-T1: Full-game bot run.** Extend `tools/smoke.mjs` to complete the entire game
(title → ending) asserting state at each beat; run it 3× including one run with
`CONTINUE` from a mid-game save. *DoD: 3 green runs.*

**M6-T2: Accessibility & mobile.**
- Text-speed option (pause → OPTIONS): NORMAL / FAST / INSTANT.
- Verify touch D-pad reaches every mechanic (pause button, Enter equivalent).
- Colorblind check: evidence `!` markers and vision cones must differ in shape,
  not only color (cones already triangles; add pulse outline to markers).
*DoD: manual checklist in `tools/QA.md`, all boxes ticked with notes.*

**M6-T3: Performance & cleanup.** No per-frame object/array allocation in
`drawMap`, cone rendering, or particles (preallocate pools). Verify steady 60fps
with `performance.now()` deltas logged for 600 frames in the smoke test (99th
percentile frame < 20ms). Final dead-code sweep. *DoD: logged numbers in commit
message.*

**M6-T4: Release.** Bump title-screen version string (`v1.0 — CHAPTER ONE`),
update `©` year to 2026, final commit `Chapter One v1.0`, push, and request Fable
review (§5).

---

## 4. Executor Rules (read before every session)

1. Work on branch `claude/beck-hawthorne-game-l6ai7a`. One milestone per commit
   (or per task for M3, which is risky). Commit messages: `M2-T3: dialogue portraits`.
2. Run `node tools/smoke.mjs` before AND after your change. If it was green before
   and red after, the regression is yours — fix it before committing.
3. Follow the file's existing section banners; add new systems in their own
   banner block. Match existing naming (`camelCase` fns, `UPPER` data tables).
4. Never introduce: external files, libraries, `ctx.arc/ellipse/curve*`, gradients,
   `setInterval` for game logic (rAF only; audio scheduling is the one exception
   and must use AudioContext lookahead), smooth alpha fades (step them).
5. If a spec here conflicts with what you find in the code, stop and leave a
   `// PLAN-CONFLICT(M#-T#): …` comment plus a note in the commit body rather
   than improvising a redesign.
6. Don't rewrite working systems to be "cleaner" unless a task says to.
   Diff size is a cost.
7. Playtest what you build: drive it with Playwright and LOOK at the screenshots
   before calling it done. A task without its DoD evidence is not done.

## 5. Fable Review Protocol (final gate)

When M6 completes, send to Fable for review with: the diff since `4955438`, all
DoD evidence (screenshots, bot logs, QA.md). Fable reviews against:

1. **Pillar compliance** — spot-check rendering for banned APIs, palette drift,
   resolution violations.
2. **Regression** — full-game bot run must pass on the reviewed commit.
3. **Correctness deep-dive** — save/restore edge cases (save mid-choices, save with
   0 evidence, corrupt JSON in localStorage), transition re-entrancy, audio context
   resume after tab blur, guard state machine stuck-states.
4. **Feel judgment** — screenshots + a played session: does the dock feel like
   stealth, does audio fit, is text readable at SCALE=2.
5. **Content pass** — tone/age-appropriateness of all new lines.

Findings come back as a ranked list; executors fix, then one final green bot run.

## 6. Risks

- **Single-file merges:** never run two executors in parallel on this file.
- **Audio is the most likely stall for smaller models:** M1-T1's API surface is
  deliberately tiny; if the sequencer proves hard, ship sfx-only and flag
  `PLAN-CONFLICT` rather than burning the session.
- **Stealth difficulty:** err forgiving. The player is 13-and-up, not a Metal Gear
  veteran. Cones generous to the player, guards slow, evidence never lost.
- **Scope creep:** Chapter Two content is explicitly out of scope for v1.0 beyond
  the teaser card.
