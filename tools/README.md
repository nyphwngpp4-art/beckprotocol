# Smoke test

`smoke.mjs` is a Playwright bot that drives `beck_hawthorne_8bit.html` through
title → intro → chapter card → EXPLORE, walks Beck in all four directions,
opens the bedroom computer puzzle, and screenshots each stage to
`tools/screens/`. It fails (exit 1) on any browser console error or a failed
state assertion.

## Setup (once)

```
npm install
```

## Run

```
node tools/smoke.mjs
```

or

```
npm run smoke
```

Exits 0 and writes the stage screenshots to `tools/screens/` on success.

In this dev container, the script auto-detects the pre-installed Chromium at
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`. Elsewhere it falls back to
Playwright's normal managed-browser launch (run `npx playwright install
chromium` first if you don't already have one).
