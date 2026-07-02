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

  // Advance through the remaining intro slides into the chapter card.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('KeyZ');
    await waitFrames(page, 6);
  }
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
