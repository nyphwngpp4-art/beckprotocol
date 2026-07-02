#!/usr/bin/env node
// ============================================================
// SMOKE TEST — beck_hawthorne_8bit.html
// Drives the game with Playwright: title -> intro -> chapter
// card -> EXPLORE, walks all four directions, opens and solves
// the bedroom computer puzzle, verifies save/reload/CONTINUE,
// and captures the bedroom -> dock stepped-fade transition.
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

  console.log('Walking each direction for 30 frames...');
  await holdDirection(page, 'ArrowDown', 30);
  await shot(page, 'walk-down');
  await holdDirection(page, 'ArrowUp', 30);
  await shot(page, 'walk-up');
  await holdDirection(page, 'ArrowLeft', 30);
  await shot(page, 'walk-left');
  await holdDirection(page, 'ArrowRight', 30);
  await shot(page, 'walk-right');

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
  await waitFrames(page, 5);

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
