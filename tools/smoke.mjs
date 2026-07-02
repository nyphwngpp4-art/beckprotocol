#!/usr/bin/env node
// ============================================================
// SMOKE TEST — beck_hawthorne_8bit.html
// Drives the game with Playwright: title -> intro -> chapter
// card -> EXPLORE, walks all four directions, opens and solves
// the bedroom computer puzzle, verifies save/reload/CONTINUE,
// captures the bedroom -> dock stepped-fade transition, and
// checks the M1 audio engine (lazy AudioContext creation,
// per-scene music tracks, pickup sfx, KeyM mute toggle).
// Also covers M2: footstep dust, the pause menu's three tabs
// (OBJECTIVE/EVIDENCE/OPTIONS) and its mute toggle, the
// objective-ticker banner after the computer puzzle and after
// the 4th evidence, and a dialogue portrait.
// Also covers M4: the dressed school hallway (wandering student
// flavor line) and the cafeteria (lunch counter + seated students),
// confirming the new dressing tiles don't block the walkway.
// Also covers M5: each intro slide's pixel-art vignette, the Indy/Kane
// choice echoes (both "full" and "deflect" branches, driven through the
// real dialogue choice UI), and the 3-stage ending ceremony (ENDING ->
// ENDING_REPORT mission card -> ENDING_TEASER -> TITLE with the save
// cleared, a regression check on restartGame()).
// Also covers M6: a mid-game save/reload/CONTINUE resuming at the dock
// with evidence retained, 600 frames of frame-pacing measurement on the
// dock (p99 < 20ms), and a touch-emulated context exercising the mobile
// D-pad's movement, interact, and pause (Enter-equivalent) mechanics.
// This is intended as the M6-T1 full-game bot run — run 3x per the DoD.
// Fails (exit 1) on any console error or a failed assertion.
// Screenshots each stage to tools/screens/.
// ============================================================
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const GAME_FILE  = path.join(REPO_ROOT, 'beck_hawthorne_8bit.html');
const SCREEN_DIR = path.join(__dirname, 'screens');

fs.mkdirSync(SCREEN_DIR, { recursive: true });

// Find the pre-installed Chromium in the dev container; fall back to
// Playwright's normal managed browser lookup elsewhere.
function findContainerChromium() {
  const base = '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  const dir = fs.readdirSync(base).find(d => d.startsWith('chromium-'));
  if (!dir) return null;
  const exe = path.join(base, dir, 'chrome-linux', 'chrome');
  return fs.existsSync(exe) ? exe : null;
}

let shotN = 0;
async function shot(page, name) {
  shotN++;
  const file = path.join(SCREEN_DIR, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  screenshot: ${path.basename(file)}`);
}

async function waitFrames(page, n) {
  const start = await page.evaluate(() => game.frame);
  await page.waitForFunction(
    (target) => game.frame >= target,
    start + n,
    { timeout: 10000 }
  );
}

async function holdDirection(page, code, frames) {
  await page.keyboard.down(code);
  await waitFrames(page, frames);
  await page.keyboard.up(code);
}

// Presses Z to advance dialogue (accepting whatever default choice is
// selected) until dlg.active goes false, or gives up after maxSteps.
async function drainDialogue(page, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i++) {
    const active = await page.evaluate(() => dlg.active);
    if (!active) return true;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }
  return false;
}

// Captures every string drawn via ctx.fillText from this point on into
// window.__fillTextCalls, so canvas-only text (no DOM) can be asserted on.
async function captureFillText(page) {
  await page.evaluate(() => {
    window.__fillTextCalls = [];
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__origFillText) proto.__origFillText = proto.fillText;
    proto.fillText = function (text, ...rest) {
      window.__fillTextCalls.push(text);
      return proto.__origFillText.call(this, text, ...rest);
    };
  });
}

async function fillTextSince(page) {
  return page.evaluate(() => window.__fillTextCalls.join(' | '));
}

// Presses Z (completing typewriter text, then advancing lines) until a
// choice prompt is showing, or gives up after maxSteps.
async function advanceToChoices(page, maxSteps = 20) {
  for (let i = 0; i < maxSteps; i++) {
    const hasChoices = await page.evaluate(() => !!dlg.choices);
    if (hasChoices) return true;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }
  return false;
}

async function main() {
  const errors = [];
  const execPath = findContainerChromium();
  const browser = await chromium.launch(
    execPath ? { executablePath: execPath } : {}
  );
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));

  console.log('Loading game file...');
  await page.goto('file://' + GAME_FILE);
  await waitFrames(page, 10);
  await shot(page, 'title');

  console.log('Title -> intro...');
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 10);
  await shot(page, 'intro-slide');

  console.log('Checking AudioContext was created lazily on first keydown...');
  const audioCreated = await page.evaluate(() => !!AU.ctx);
  if (!audioCreated) throw new Error('AU.ctx was not created after first keydown');

  // Advance through the remaining intro slides into the chapter card,
  // capturing each slide's M5-T3 vignette (dish/phone/crate/eye) as we go.
  // Slide 0 ("dish") was already captured just above as intro-slide.
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 6);
    await shot(page, `intro-slide-${i}`);
  }
  await page.keyboard.press('KeyZ'); // slide 3 -> CHAPTER_CARD
  await waitFrames(page, 6);
  const stateAtCard = await page.evaluate(() => game.state);
  if (stateAtCard !== 'CHAPTER_CARD') {
    throw new Error(`Expected CHAPTER_CARD, got ${stateAtCard}`);
  }
  await shot(page, 'chapter-card');

  console.log('Chapter card -> bedroom (EXPLORE) via fade transition...');
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => transition.active && transition.frame >= 10, null, { timeout: 5000 });
  await shot(page, 'transition-mid-fade');
  await page.waitForFunction(() => !transition.active, null, { timeout: 5000 });
  await waitFrames(page, 3);
  const state = await page.evaluate(() => game.state);
  if (state !== 'EXPLORE') {
    throw new Error(`Expected game.state === 'EXPLORE', got '${state}'`);
  }
  await shot(page, 'bedroom-explore');

  console.log('Checking bedroom music track is playing...');
  const bedroomMusic = await page.evaluate(() => AU.musicName);
  if (bedroomMusic !== 'bedroom') {
    throw new Error(`Expected AU.musicName === 'bedroom', got '${bedroomMusic}'`);
  }

  console.log('Walking each direction for 30 frames...');
  await holdDirection(page, 'ArrowDown', 30);
  await shot(page, 'walk-down');

  console.log('Checking footstep dust spawned while walking...');
  const dustActive = await page.evaluate(() => DUST.filter(d => d.active).length);
  if (dustActive < 1) throw new Error('Expected at least one active dust particle after walking');

  await holdDirection(page, 'ArrowUp', 30);
  await shot(page, 'walk-up');
  await holdDirection(page, 'ArrowLeft', 30);
  await shot(page, 'walk-left');
  await holdDirection(page, 'ArrowRight', 30);
  await shot(page, 'walk-right');

  console.log('Testing pause + evidence journal (Enter toggles PAUSED)...');
  await page.keyboard.press('Enter');
  await waitFrames(page, 3);
  const pausedState = await page.evaluate(() => game.state);
  if (pausedState !== 'PAUSED') throw new Error(`Expected PAUSED, got '${pausedState}'`);
  await shot(page, 'pause-objective-tab');

  await page.keyboard.press('ArrowRight');
  await waitFrames(page, 3);
  await shot(page, 'pause-evidence-tab');

  await page.keyboard.press('ArrowRight');
  await waitFrames(page, 3);
  await shot(page, 'pause-options-tab');

  console.log('Checking MUTE toggle on the pause OPTIONS tab...');
  const pauseMutedBefore = await page.evaluate(() => AU.muted);
  await page.keyboard.press('KeyZ'); // toggle mute (optIdx 0 is selected by default)
  await waitFrames(page, 2);
  const pauseMutedAfter = await page.evaluate(() => AU.muted);
  if (pauseMutedAfter === pauseMutedBefore) {
    throw new Error('Pause OPTIONS tab MUTE row did not toggle AU.muted');
  }
  await page.keyboard.press('KeyZ'); // toggle back off
  await waitFrames(page, 2);

  console.log('Unpausing with Enter...');
  await page.keyboard.press('Enter');
  await waitFrames(page, 3);
  const unpausedState = await page.evaluate(() => game.state);
  if (unpausedState !== 'EXPLORE') throw new Error(`Expected EXPLORE after unpause, got '${unpausedState}'`);

  console.log('Opening the computer puzzle...');
  // Place Beck next to the bedroom computer (tx:9, ty:6) so the
  // interact check registers, then interact.
  await page.evaluate(() => { pl.x = 140; pl.y = 92; });
  await waitFrames(page, 2);
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 6);
  const puzzleState = await page.evaluate(() => game.state);
  if (puzzleState !== 'MINIGAME_PUZZLE') {
    throw new Error(`Expected MINIGAME_PUZZLE, got '${puzzleState}'`);
  }
  await shot(page, 'puzzle');

  console.log('Testing save/continue: reloading page...');
  // The last saveGame() call happened when the chapter card transitioned
  // into the bedroom scene, so the save on disk should still point there.
  await page.reload();
  await waitFrames(page, 10);
  const reloadedState = await page.evaluate(() => game.state);
  if (reloadedState !== 'TITLE') {
    throw new Error(`Expected TITLE after reload, got '${reloadedState}'`);
  }
  await shot(page, 'title-with-save');

  // CONTINUE is the default (idx 0) selection when a save exists.
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 10);
  const continuedState = await page.evaluate(() => ({ state: game.state, mapId: game.mapId }));
  if (continuedState.state !== 'EXPLORE' || continuedState.mapId !== 'bedroom') {
    throw new Error(`CONTINUE did not restore bedroom EXPLORE state: ${JSON.stringify(continuedState)}`);
  }
  await shot(page, 'continue-bedroom');

  console.log('Completing Pattern Lock to trigger the bedroom -> dock scene cut...');
  await page.evaluate(() => { pl.x = 140; pl.y = 92; });
  await waitFrames(page, 2);
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 6);

  // Phase 0 & 1 location puzzles: any answer, then advance.
  for (let phase = 0; phase < 2; phase++) {
    await page.keyboard.press('KeyZ'); // answer
    await waitFrames(page, 5);
    await page.keyboard.press('KeyZ'); // advance to next phase
    await waitFrames(page, 5);
  }

  // Phase 2 anomaly hunt: mark all 4 clues.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
    if (i < 3) {
      await page.keyboard.press('ArrowDown');
      await waitFrames(page, 3);
    }
  }
  await waitFrames(page, 10);
  await page.keyboard.press('KeyZ'); // finish anomaly puzzle, starts closing dialogue
  await waitFrames(page, 2);

  console.log('Checking the objective ticker fires after the computer puzzle...');
  const objAfterPuzzle = await page.evaluate(() => ({
    objective: game.objective, bannerTimer: game.objectiveBannerTimer,
  }));
  if (objAfterPuzzle.objective !== 'Get to the East Dock.') {
    throw new Error(`Expected objective 'Get to the East Dock.', got '${objAfterPuzzle.objective}'`);
  }
  if (objAfterPuzzle.bannerTimer <= 0) {
    throw new Error('Expected objectiveBannerTimer > 0 right after the objective change');
  }
  await waitFrames(page, 14); // let the banner finish sliding in before the screenshot
  await shot(page, 'objective-banner-dock');

  // Drive the resulting dialogue to completion, always taking the
  // default (first) choice when one is offered.
  let dialogueDone = false;
  for (let i = 0; i < 60; i++) {
    const info = await page.evaluate(() => ({ active: dlg.active, hasChoices: !!dlg.choices }));
    if (!info.active) { dialogueDone = true; break; }
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }
  if (!dialogueDone) throw new Error('Puzzle-exit dialogue did not finish in time');

  console.log('Capturing the bedroom -> dock stepped fade...');
  await page.waitForFunction(() => transition.active && transition.frame >= 10, null, { timeout: 5000 });
  await shot(page, 'dock-transition-mid-fade');
  await page.waitForFunction(() => !transition.active, null, { timeout: 5000 });
  await waitFrames(page, 3);
  const dockState = await page.evaluate(() => ({ state: game.state, mapId: game.mapId }));
  if (dockState.mapId !== 'dock') {
    throw new Error(`Expected dock map after transition, got ${JSON.stringify(dockState)}`);
  }
  await shot(page, 'dock-arrival');

  console.log('Checking dock music track swapped in...');
  const dockMusic = await page.evaluate(() => AU.musicName);
  if (dockMusic !== 'dock') {
    throw new Error(`Expected AU.musicName === 'dock', got '${dockMusic}'`);
  }

  console.log('Checking evidence pickup plays a sfx...');
  await page.evaluate(() => {
    window.__sfxCalls = [];
    const orig = AU.sfx.bind(AU);
    AU.sfx = (name) => { window.__sfxCalls.push(name); orig(name); };
    // Teleport onto the manifest evidence tile (tx:3, ty:3).
    pl.x = 3 * TW + TW / 2 - pl.w / 2;
    pl.y = 3 * TH + TH / 2 - pl.h / 2;
  });
  await waitFrames(page, 2);
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 3);
  const sfxCalls = await page.evaluate(() => window.__sfxCalls);
  if (!sfxCalls.includes('pickup')) {
    throw new Error(`Expected 'pickup' sfx on evidence interact, got ${JSON.stringify(sfxCalls)}`);
  }

  console.log('Advancing to the BECK dialogue line to capture her portrait...');
  await page.keyboard.press('KeyZ'); // complete narrator line0 typing
  await waitFrames(page, 3);
  await page.keyboard.press('KeyZ'); // advance to line1 (BECK)
  await waitFrames(page, 30);        // let the portrait line finish typing
  await shot(page, 'dialogue-portrait-beck');

  // Drain the evidence dialogue so the game returns to EXPLORE.
  for (let i = 0; i < 20; i++) {
    const active = await page.evaluate(() => dlg.active);
    if (!active) break;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }

  console.log('M6-T1: mid-game save/reload/CONTINUE — resuming at the dock with evidence retained...');
  const beforeMidReload = await page.evaluate(() => ({
    mapId: game.mapId, evidenceFound: game.evidenceFound.slice(),
  }));
  if (beforeMidReload.mapId !== 'dock' || beforeMidReload.evidenceFound.length !== 1) {
    throw new Error(`Expected mid-game state at dock with 1 evidence before reload, got ${JSON.stringify(beforeMidReload)}`);
  }
  await page.reload();
  await waitFrames(page, 10);
  const midReloadTitleState = await page.evaluate(() => game.state);
  if (midReloadTitleState !== 'TITLE') {
    throw new Error(`Expected TITLE after mid-game reload, got '${midReloadTitleState}'`);
  }
  await page.keyboard.press('KeyZ'); // CONTINUE is idx 0 by default
  await waitFrames(page, 10);
  const afterMidContinue = await page.evaluate(() => ({
    state: game.state, mapId: game.mapId, evidenceFound: game.evidenceFound,
  }));
  if (afterMidContinue.state !== 'EXPLORE' || afterMidContinue.mapId !== 'dock' ||
      afterMidContinue.evidenceFound.length !== 1 || afterMidContinue.evidenceFound[0] !== 'evidence_manifest') {
    throw new Error(`Mid-game CONTINUE did not restore dock progress, got ${JSON.stringify(afterMidContinue)}`);
  }
  await shot(page, 'mid-game-continue-dock');

  console.log('Checking the objective ticker fires after the 4th evidence...');
  await page.evaluate(() => {
    // Fast-forward: the manifest was already found above; simulate the
    // other two mid-collection pieces so the next real pickup is the 4th.
    game.evidenceFound = ['evidence_manifest', 'evidence_crates', 'evidence_photos'];
    game.objectiveBannerTimer = 0;
    // Teleport onto the plates evidence tile (tx:3, ty:13).
    pl.x = 3 * TW + TW / 2 - pl.w / 2;
    pl.y = 13 * TH + TH / 2 - pl.h / 2;
  });
  await waitFrames(page, 2);
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 2);
  const objAfter4th = await page.evaluate(() => ({
    objective: game.objective, bannerTimer: game.objectiveBannerTimer,
  }));
  if (objAfter4th.objective !== 'Get out — reach the EXIT.') {
    throw new Error(`Expected objective 'Get out — reach the EXIT.', got '${objAfter4th.objective}'`);
  }
  if (objAfter4th.bannerTimer <= 0) {
    throw new Error('Expected objectiveBannerTimer > 0 right after the 4th-evidence objective change');
  }
  await waitFrames(page, 14); // let the banner finish sliding in before the screenshot
  await shot(page, 'objective-banner-exit');

  // Drain the resulting "all evidence found" dialogue, which fires
  // triggerDockFinale() on completion.
  for (let i = 0; i < 30; i++) {
    const active = await page.evaluate(() => dlg.active);
    if (!active) break;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }

  console.log('Checking the M3-T4 dock finale went live (every guard ALERT)...');
  const finaleState = await page.evaluate(() => ({
    dockChaseActive: game.dockChaseActive,
    guardStates: MAPS['dock'].npcs.filter(n => n.guard && n.active).map(n => n.state),
  }));
  if (!finaleState.dockChaseActive) {
    throw new Error('Expected game.dockChaseActive === true after the 4th evidence');
  }
  if (!finaleState.guardStates.length || finaleState.guardStates.some(s => s !== 'ALERT')) {
    throw new Error(`Expected every active guard ALERT at the finale, got ${JSON.stringify(finaleState.guardStates)}`);
  }

  console.log('M3-T4: full dock playthrough — escape through the guard gauntlet to school...');
  // A real player would be on an open floor tile near the crate they just
  // inspected, not centered on its solid hitbox (that placement above was
  // only for the interact-range check) — reposition onto the open center
  // corridor (cols 8-12) before driving movement.
  await page.evaluate(() => { pl.x = 8 * TW; pl.y = 13 * TH; updateCam(); });
  await waitFrames(page, 2);
  await holdDirection(page, 'ArrowUp', 260); // climb the center lane toward the EXIT
  await shot(page, 'dock-finale-escape');
  await holdDirection(page, 'ArrowUp', 260);

  let escaped = false;
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => ({ state: game.state, dockChaseActive: game.dockChaseActive }));
    if (!s.dockChaseActive) { escaped = true; break; }
    await holdDirection(page, 'ArrowUp', 60);
  }
  if (!escaped) throw new Error('Player did not reach the dock EXIT within the movement budget');

  const heartsAfterEscape = await page.evaluate(() => pl.hearts);
  console.log(`  hearts remaining after the escape: ${heartsAfterEscape}/3`);

  // Drain the "you hit the street" dialogue, then confirm the door-fade
  // into school completes.
  for (let i = 0; i < 20; i++) {
    const active = await page.evaluate(() => dlg.active);
    if (!active) break;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }
  await page.waitForFunction(() => transition.active, null, { timeout: 5000 });
  await page.waitForFunction(() => !transition.active, null, { timeout: 8000 });
  await waitFrames(page, 3);
  const postDockState = await page.evaluate(() => ({ state: game.state, mapId: game.mapId }));
  if (postDockState.mapId !== 'school' || postDockState.state !== 'EXPLORE') {
    throw new Error(`Expected school EXPLORE after the dock escape, got ${JSON.stringify(postDockState)}`);
  }
  await shot(page, 'dock-escape-to-school');

  console.log('M4-T1: letting the wandering students move, then capturing the dressed hallway...');
  await waitFrames(page, 90); // give random-waypoint students time to walk
  await shot(page, 'school-hallway-dressed');

  console.log('M4-T1: checking a wandering student NPC gives a flavor one-liner...');
  // Pin student1 well clear of Indy's fixed spot before interacting —
  // random-waypoint wandering can otherwise drift it into Indy's interact
  // radius, and checkInteract would resolve to Indy's (much longer)
  // branching dialogue instead of the flavor one-liner under test.
  const student1 = await page.evaluate(() => {
    const s = MAPS['school'].npcs.find(n => n.id === 'student1');
    s.x = 14 * TW; s.y = 3 * TH; s.wander = false;
    pl.x = s.x - 4; pl.y = s.y;
    return { x: s.x, y: s.y };
  });
  await waitFrames(page, 2);
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 6);
  const studentDlgActive = await page.evaluate(() => dlg.active);
  if (!studentDlgActive) throw new Error('Expected a dialogue line from interacting with student1');
  await shot(page, 'student-flavor-line');
  for (let i = 0; i < 15; i++) {
    const active = await page.evaluate(() => dlg.active);
    if (!active) break;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }

  console.log('M4-T1: walking the full width of the school hallway to the cafeteria arrow...');
  await page.evaluate(() => { pl.x = 2*TW; pl.y = 5*TH; updateCam(); });
  await waitFrames(page, 2);
  // Walk in short bursts and poll for the mapId flip — the fade transition
  // (~48 frames) can start and finish inside a single long holdDirection
  // call, so a one-shot waitForFunction(transition.active) can race past it.
  let reachedCafeteria = false;
  for (let i = 0; i < 6; i++) {
    await holdDirection(page, 'ArrowRight', 60);
    const mapId = await page.evaluate(() => game.mapId);
    if (mapId === 'cafeteria') { reachedCafeteria = true; break; }
  }
  if (!reachedCafeteria) throw new Error('Player did not reach the cafeteria within the movement budget');
  await page.waitForFunction(() => !transition.active, null, { timeout: 8000 });
  await waitFrames(page, 3);
  const cafeState = await page.evaluate(() => ({ state: game.state, mapId: game.mapId }));
  if (cafeState.mapId !== 'cafeteria' || cafeState.state !== 'EXPLORE') {
    throw new Error(`Expected cafeteria EXPLORE after crossing the hallway, got ${JSON.stringify(cafeState)}`);
  }
  await shot(page, 'cafeteria-dressed');

  console.log('M4-T2: checking a seated cafeteria student gives ambient chatter...');
  const cafe1 = await page.evaluate(() => {
    const s = MAPS['cafeteria'].npcs.find(n => n.id === 'cafe1');
    return { x: s.x, y: s.y };
  });
  await page.evaluate(({ x, y }) => { pl.x = x; pl.y = y + TH; }, cafe1);
  await waitFrames(page, 2);
  await page.keyboard.press('KeyZ');
  await waitFrames(page, 6);
  const cafeDlgActive = await page.evaluate(() => dlg.active);
  if (!cafeDlgActive) throw new Error('Expected a dialogue line from interacting with cafe1');
  await shot(page, 'cafe-flavor-line');
  for (let i = 0; i < 15; i++) {
    const active = await page.evaluate(() => dlg.active);
    if (!active) break;
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 3);
  }

  console.log('M5-T1: Indy choice echo — selecting "full" disclosure via the real choice UI...');
  await page.evaluate(() => startIndyDialogue());
  await waitFrames(page, 2);
  if (!(await advanceToChoices(page))) throw new Error('Indy dialogue never reached the choice prompt');
  await page.keyboard.press('ArrowDown');
  await waitFrames(page, 2);
  await page.keyboard.press('ArrowDown');
  await waitFrames(page, 2);
  const indyChoiceIdx = await page.evaluate(() => dlg.choiceIdx);
  if (indyChoiceIdx !== 2) throw new Error(`Expected Indy choiceIdx 2 ("full"), got ${indyChoiceIdx}`);
  await page.keyboard.press('KeyZ'); // confirm "full"
  await waitFrames(page, 2);
  if (!(await drainDialogue(page))) throw new Error('Indy "full" dialogue did not finish in time');
  const indyChoiceFull = await page.evaluate(() => game.choices.indy);
  if (indyChoiceFull !== 'full') throw new Error(`Expected game.choices.indy === 'full', got '${indyChoiceFull}'`);

  console.log('M5-T1: checking Kane echoes the "full" disclosure in the recruitment scene...');
  await page.evaluate(() => startRecruitmentDialogue());
  await waitFrames(page, 2);
  const kaneEchoPresent = await page.evaluate(() =>
    dlg.lines.some(l => l.speaker === 'KANE' && l.text && l.text.includes('civilian'))
  );
  if (!kaneEchoPresent) throw new Error('Expected Kane\'s "full"-disclosure echo line in the recruitment dialogue');

  console.log('Driving the recruitment scene to the ending (default choices -> "pushback"/DIRECT)...');
  if (!(await drainDialogue(page, 60))) throw new Error('Recruitment dialogue did not finish in time');
  const endingState = await page.evaluate(() => ({ state: game.state, final: game.choices.final }));
  if (endingState.state !== 'ENDING' || endingState.final !== 'pushback') {
    throw new Error(`Expected ENDING with final='pushback', got ${JSON.stringify(endingState)}`);
  }

  console.log('Verifying the "full"-branch ending screen does NOT show the "deflect" Indy text...');
  await captureFillText(page);
  await waitFrames(page, 2);
  const fullBranchTexts = await fillTextSince(page);
  if (fullBranchTexts.includes('bad liar')) {
    throw new Error('Did not expect the "deflect" Indy text echo on the "full"-branch ending');
  }
  await shot(page, 'ending-full-branch');

  console.log('M5-T2: advancing ENDING -> ENDING_REPORT (mission report card)...');
  await captureFillText(page);
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => transition.active, null, { timeout: 5000 });
  await page.waitForFunction(() => !transition.active, null, { timeout: 5000 });
  await waitFrames(page, 3);
  const reportState = await page.evaluate(() => game.state);
  if (reportState !== 'ENDING_REPORT') throw new Error(`Expected ENDING_REPORT, got '${reportState}'`);
  await waitFrames(page, 2);
  const reportTexts = await fillTextSince(page);
  if (!reportTexts.includes('DIRECT')) {
    throw new Error(`Expected PSYCH PROFILE 'DIRECT' rendered on the report card, got: ${reportTexts}`);
  }
  if (!reportTexts.includes('4/4')) {
    throw new Error(`Expected evidence count '4/4' on the report card, got: ${reportTexts}`);
  }
  await shot(page, 'ending-report-card');

  console.log('M5-T2: advancing ENDING_REPORT -> ENDING_TEASER (Chapter Two teaser)...');
  await captureFillText(page);
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => transition.active, null, { timeout: 5000 });
  await page.waitForFunction(() => !transition.active, null, { timeout: 5000 });
  await waitFrames(page, 3);
  const teaserState = await page.evaluate(() => game.state);
  if (teaserState !== 'ENDING_TEASER') throw new Error(`Expected ENDING_TEASER, got '${teaserState}'`);
  const teaserTexts = await fillTextSince(page);
  if (!teaserTexts.includes('CHAPTER TWO: TEAM') || !teaserTexts.includes('COMING SOON')) {
    throw new Error(`Expected Chapter Two teaser text, got: ${teaserTexts}`);
  }
  await shot(page, 'ending-teaser');

  console.log('M5-T2: advancing ENDING_TEASER -> TITLE, verifying the save was cleared (restartGame regression check)...');
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => transition.active, null, { timeout: 5000 });
  await page.waitForFunction(() => !transition.active, null, { timeout: 5000 });
  await waitFrames(page, 3);
  const afterFinish = await page.evaluate(() => ({
    state: game.state, mapId: game.mapId, evidenceFound: game.evidenceFound,
    choices: game.choices, hearts: pl.hearts, introSlide: intro.slide,
    saveCleared: localStorage.getItem('beck_save_v1') === null,
  }));
  if (afterFinish.state !== 'TITLE') throw new Error(`Expected TITLE after the ending ceremony, got '${afterFinish.state}'`);
  if (afterFinish.mapId !== 'bedroom' || afterFinish.evidenceFound.length !== 0 ||
      Object.keys(afterFinish.choices).length !== 0 || afterFinish.hearts !== 3 || afterFinish.introSlide !== 0) {
    throw new Error(`restartGame() regression: unexpected reset state ${JSON.stringify(afterFinish)}`);
  }
  if (!afterFinish.saveCleared) throw new Error('Expected the save to be cleared after completing the ending ceremony');
  await shot(page, 'title-after-ending');

  console.log('M5-T1: Indy choice echo — selecting "deflect" via the real choice UI...');
  await page.evaluate(() => { game.choices = {}; startIndyDialogue(); });
  await waitFrames(page, 2);
  if (!(await advanceToChoices(page))) throw new Error('Indy dialogue never reached the choice prompt');
  await page.keyboard.press('KeyZ'); // confirm default choiceIdx 0 ("deflect")
  await waitFrames(page, 2);
  if (!(await drainDialogue(page))) throw new Error('Indy "deflect" dialogue did not finish in time');
  const indyChoiceDeflect = await page.evaluate(() => game.choices.indy);
  if (indyChoiceDeflect !== 'deflect') throw new Error(`Expected game.choices.indy === 'deflect', got '${indyChoiceDeflect}'`);

  console.log('M5-T1: verifying Indy texts Beck during the ending on the "deflect" branch...');
  await captureFillText(page);
  await page.evaluate(() => { game.choices.final = 'silent'; game.state = 'ENDING'; });
  await waitFrames(page, 2);
  const deflectTexts = await fillTextSince(page);
  if (!deflectTexts.includes('bad liar')) {
    throw new Error(`Expected Indy's "deflect" text echo on the ending screen, got: ${deflectTexts}`);
  }
  await shot(page, 'ending-deflect-branch');

  console.log('Checking KeyM toggles mute...');
  const mutedBefore = await page.evaluate(() => AU.muted);
  await page.keyboard.press('KeyM');
  await waitFrames(page, 2);
  const mutedAfter = await page.evaluate(() => ({ muted: AU.muted, gain: AU.masterGain.gain.value }));
  if (mutedAfter.muted !== !mutedBefore || mutedAfter.gain !== (mutedAfter.muted ? 0 : 1)) {
    throw new Error(`KeyM did not toggle mute correctly: ${JSON.stringify(mutedAfter)}`);
  }
  await page.keyboard.press('KeyM'); // restore
  await waitFrames(page, 2);

  console.log('M6-T3: measuring 600 frames of real gameplay for steady 60fps (p99 < 20ms)...');
  const perfContext = await browser.newContext();
  const perfPage = await perfContext.newPage();
  const perfErrors = [];
  perfPage.on('console', msg => { if (msg.type() === 'error') perfErrors.push(msg.text()); });
  perfPage.on('pageerror', err => perfErrors.push(String(err)));
  await perfPage.goto('file://' + GAME_FILE);
  await waitFrames(perfPage, 10);
  // Jump straight to the dock — the heaviest scene (patrol guards + a
  // per-frame vision-cone render for each) — rather than replaying the
  // intro and bedroom puzzle just to measure frame pacing.
  await perfPage.evaluate(() => { loadScene('dock'); pl.x = 8 * TW; pl.y = 8 * TH; updateCam(); });
  await waitFrames(perfPage, 5);
  await perfPage.evaluate(() => {
    window.__frameTimes = [];
    let last = performance.now();
    (function sample() {
      const now = performance.now();
      window.__frameTimes.push(now - last);
      last = now;
      if (window.__frameTimes.length < 600) requestAnimationFrame(sample);
    })();
  });
  // Walk in circles for the whole measurement window so guards, vision
  // cones, and footstep dust are all actively rendering, not an idle frame.
  const perfDirs = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  for (let i = 0; i < 40; i++) {
    const len = await perfPage.evaluate(() => window.__frameTimes.length);
    if (len >= 600) break;
    await holdDirection(perfPage, perfDirs[i % perfDirs.length], 15);
  }
  await perfPage.waitForFunction(() => window.__frameTimes.length >= 600, null, { timeout: 30000 });
  const frameTimes = await perfPage.evaluate(() => window.__frameTimes.slice(0, 600));
  const sortedTimes = [...frameTimes].sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.50)];
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
  const maxFrame = sortedTimes[sortedTimes.length - 1];
  console.log(`  frame time over 600 frames (ms): p50=${p50.toFixed(2)} p99=${p99.toFixed(2)} max=${maxFrame.toFixed(2)}`);
  if (p99 >= 20) throw new Error(`p99 frame time ${p99.toFixed(2)}ms exceeds the 20ms budget`);
  await perfContext.close();
  if (perfErrors.length) errors.push(...perfErrors);

  console.log('M6-T2: verifying the touch D-pad reaches every mechanic (movement, interact, pause)...');
  const touchContext = await browser.newContext({ hasTouch: true });
  const touchPage = await touchContext.newPage();
  touchPage.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  touchPage.on('pageerror', err => errors.push(String(err)));
  await touchPage.goto('file://' + GAME_FILE);
  await waitFrames(touchPage, 10);

  const hasTouchStart = await touchPage.evaluate(() => 'ontouchstart' in window);
  if (!hasTouchStart) throw new Error('Expected ontouchstart in window under a touch-emulated context');
  const padButtonCount = await touchPage.evaluate(() => document.querySelectorAll('button').length);
  if (padButtonCount !== 7) throw new Error(`Expected 7 D-pad buttons (4 arrows, Z, X, II), found ${padButtonCount}`);

  // Tap Z to start a new game from the title (no save exists in this fresh context).
  await touchPage.click('button:text-is("Z")');
  await waitFrames(touchPage, 10);
  const touchIntroState = await touchPage.evaluate(() => game.state);
  if (touchIntroState !== 'INTRO') throw new Error(`Expected INTRO after tapping the touch Z button, got '${touchIntroState}'`);

  // Skip through the intro/chapter card into EXPLORE by tapping Z.
  for (let i = 0; i < 5; i++) {
    await touchPage.click('button:text-is("Z")');
    await waitFrames(touchPage, 6);
  }
  await touchPage.waitForFunction(() => !transition.active, null, { timeout: 8000 });
  await waitFrames(touchPage, 3);
  const touchExploreState = await touchPage.evaluate(() => game.state);
  if (touchExploreState !== 'EXPLORE') throw new Error(`Expected EXPLORE via the touch UI, got '${touchExploreState}'`);

  // Hold the down-arrow touch button (pointerdown/pointerup, not a quick
  // click) and confirm Beck actually moves — reaches the movement mechanic.
  const beforeTouchMove = await touchPage.evaluate(() => ({ x: pl.x, y: pl.y }));
  const downBtn = touchPage.locator('button:text-is("↓")');
  await downBtn.dispatchEvent('pointerdown');
  await waitFrames(touchPage, 20);
  await downBtn.dispatchEvent('pointerup');
  const afterTouchMove = await touchPage.evaluate(() => ({ x: pl.x, y: pl.y }));
  if (afterTouchMove.x === beforeTouchMove.x && afterTouchMove.y === beforeTouchMove.y) {
    throw new Error('Beck did not move after holding the touch D-pad down button');
  }

  // Tap the "II" (Enter-equivalent) button — reaches the pause mechanic.
  await touchPage.click('button:text-is("II")');
  await waitFrames(touchPage, 3);
  const touchPausedState = await touchPage.evaluate(() => game.state);
  if (touchPausedState !== 'PAUSED') throw new Error(`Expected PAUSED after tapping the touch pause button, got '${touchPausedState}'`);
  await shot(touchPage, 'touch-dpad-pause');
  await touchPage.click('button:text-is("II")');
  await waitFrames(touchPage, 3);
  const touchUnpausedState = await touchPage.evaluate(() => game.state);
  if (touchUnpausedState !== 'EXPLORE') throw new Error(`Expected EXPLORE after tapping the touch pause button again, got '${touchUnpausedState}'`);

  await touchContext.close();

  await browser.close();

  if (errors.length) {
    console.error('Console errors detected:');
    errors.forEach(e => console.error('  ' + e));
    process.exit(1);
  }

  if (shotN < 6) {
    throw new Error(`Only captured ${shotN} screenshots, expected >= 6`);
  }

  console.log(`\nOK — ${shotN} screenshots written to tools/screens/, no console errors.`);
  process.exit(0);
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
