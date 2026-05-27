---
name: claude-usage-pet
description: >
  Build, run, debug, restyle, or distribute the "Claude Usage Pet" — an Electron
  desktop-pet widget (a coral pixel mascot that roams the screen and shows real
  Claude plan usage) living at ~/Development/claude-usage. Use this whenever the
  user wants to add a feature to, fix, rebuild, repackage, change the
  sprites/animations/size/colors, adjust the usage bars/limits, or ship the
  Claude Usage Pet / "token usage mascot" / desktop pet widget — even if they
  don't name specific files. Covers the macOS Keychain + /api/oauth/usage trick,
  the cross-platform build, and the gotchas (icon cache, CSP, build.files).
---

# Claude Usage Pet

A frameless, transparent, always-on-top Electron window with a hand-drawn coral
pixel mascot that walks the bottom of the screen. Click it → stats bubble; drag →
move; right-click → control menu (Quit lives here, since the menu-bar tray hides
behind the notch). It reads **real** plan usage and local token totals.

## Architecture (read these first)

| File | Role |
|------|------|
| `main.js` | Main process: the window, roaming/jet movement, drag-follow, tray, IPC, click-through. |
| `usage.js` | Parses `~/.claude/projects/**/*.jsonl` → today/week/peak tokens, 7-day series, **estimated USD cost** (PRICING table × tokens, per model/day/range), message count, per-project totals (from each session's `cwd`), 30-day totals. |
| `limits.js` | Fetches the REAL plan limits (session/weekly %) — see below. |
| `preload.js` | `contextBridge` bridge; every renderer↔main channel is declared here. |
| `renderer/index.html` | Bubble layout + CSS (sizes via CSS vars `--bubble-space`, `--pet-box`). Bubble is **tabbed**: Limits · Cost · Activity, + account footer. |
| `renderer/mascot.js` | Frame driver, moods (jump/sit/hearts), drag/tap, tab switching, chart tok/$ toggle, plan+cost+activity+account rendering, virtual-pet visuals (sleep+Zzz / hungry+🍪 / eat) + Feed button. |

**Gamification:** `game.js` (pure: levelFromXp, computeXp, ACHIEVEMENTS, questForDay, SHOP). `main.js` persists `gamestate.json` {coins,feeds,unlocked,quest,rodeJet,rodeBike}; `pushGame()` builds ctx from `lastUsageData`+gamestate, computes level/XP (XP = tokens/1M + feeds + streak + unlocks), detects new achievements/level-ups (+coins+notify), sends `game` to renderer (4th "🏆" tab). Streak is real (consecutive days in `usage.js` → `streak{current,best}`). Coins earned from levels/achievements/daily-quest; spent in shop (`buy` ipc → restores pet). Stunts: `crossScreen('jet'|'bike'|'run')` + `scheduleStunt()` (jet flies high, bike/run on the ground; bike uses `#bike` element + `bike.png`, run uses pet frames 10-11). Sprite is now **12 frames** (added 10-11 run). **Note:** the Awards pane is tall → `--bubble-space` was raised to 410 (CSS) and `BUBBLE_SPACE=410` (main) MUST stay in sync, else the bubble top (tabs/title) gets cropped.

**Virtual pet (Tamagotchi):** `main.js` owns persisted stats `{hunger,energy,sleeping}` in `userData/petstate.json`, advanced by real elapsed time (hunger ↑ ~5h to full, energy ↓ while awake, recovers while sleeping); `petState` = sleeping/hungry/lazy/active drives roaming (sleep=stay, lazy/hungry=slower) and is sent to the renderer. Feeding (tray "🍪 Feed Clawd" or the bubble's Feed button → ipc `feed` → `feedPet`) drops hunger −55, energy +12, plays the eat frame (9). Sprite frames 8=sleep, 9=eat; `food.png` = cookie. Stats also shown in the bubble's `#petbar` and the tray header.
| `genmascot.py` | Draws ALL pixel sprites from rectangles → `renderer/assets/`. |
| `build/` | `icon.icns` / `icon.ico` (+ `icon-master.png`, `icon.iconset`). |

The window is much larger than the painted mascot; it reserves bubble room above
AND below the pet so the bubble can flip to stay on-screen. The window is
click-through (`setIgnoreMouseEvents(true,{forward:true})`); `mascot.js` toggles
interactivity on hover. **The constants in `main.js` (`WIN_W`, `BUBBLE_SPACE`,
`PET_BOX`) must match the CSS vars in `index.html`** — change both together.

## Run & debug

```bash
npm install        # first time
npm start          # run it
PET_DEBUG=1 npm start   # holds the pet still + auto-opens the bubble for inspection
```

To verify visually, take a screenshot (computer-use). The mascot is small; if you
can't find it, it's likely roaming at a screen edge — that's normal, not a bug.
Kill stray dev instances with `pkill -9 -f "claude-usage/node_modules/electron"`.

## Common changes

- **Sprite art / new poses / colors:** edit `genmascot.py`, run `python3 genmascot.py`.
  It writes `sprite.png` (8 frames of 132×114: 0-3 walk, 4 idle, 5 blink, 6 jump,
  7 sit), `jet.png` (2 flame frames), `heart.png`, `tray.png`. After regenerating,
  if you add/remove frames, update the frame indices and `background-size` in
  `mascot.js` + `index.html`.
- **Mascot size:** `scaleForToday()` in `mascot.js` (currently maps log10(today
  tokens) → 0.30–0.62). Smaller range = smaller pet.
- **Roam speed / jet frequency:** `SPEED` in `startRoaming()` and the `setTimeout`
  in `scheduleJet()` in `main.js`.
- **Bubble content:** `draw()` in `mascot.js` + markup/CSS in `index.html`.

## Real plan limits — the key trick

Plan rate limits are NOT in the local logs; only `/usage` knows them. `limits.js`
replicates `/usage`: it reads the OAuth token, then calls
`https://api.anthropic.com/api/oauth/usage` with headers
`Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20`.
The response gives `five_hour` / `seven_day` / `seven_day_sonnet`, each
`{utilization, resets_at}`. Token source is platform-specific:
- **macOS:** Keychain — `security find-generic-password -s "Claude Code-credentials" -w`, then JSON `.claudeAiOauth.accessToken`.
- **Windows/Linux:** file `~/.claude/.credentials.json`.

`limits.js` also calls `https://api.anthropic.com/api/oauth/profile` (same auth)
for the **plan name**: `organization.rate_limit_tier` (e.g. `default_claude_max_5x`
→ "Max 5x"), with `has_claude_max`/`has_claude_pro` + `organization_type` as
fallbacks. The usage endpoint's `extra_usage` (`{is_enabled, utilization,
used_credits, monthly_limit, currency}`) is shown as a 3rd bar only when enabled;
`seven_day_opus`/`seven_day_sonnet` shown when >0 (priority extra > Sonnet > Opus).

If no token, `mascot.js` falls back to showing local usage vs the user's own peak.
A transient API failure (e.g. **HTTP 429** from polling too often) keeps the last
good plan view rather than flipping to local. The token stays local and is only
used to read the user's own usage — never log it. (This mirrors CodexBar's
"preferred" OAuth path: docs/claude.md in github.com/steipete/CodexBar.)

## Build & distribute

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac   # universal dmg + zip
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win   # nsis installer + portable
```

electron-builder auto-downloads Wine when building Windows on macOS — no manual
setup. Artifacts land in `dist/`.

**CRITICAL — ad-hoc sign the mac app or it shows "damaged" when downloaded.**
electron-builder does NOT sign the bundle coherently (`codesign -v` reports "not
signed at all"), so a downloaded+quarantined copy is rejected as *"damaged and
can't be opened"* on Apple Silicon. After the mac build, always:
```bash
codesign --force --deep --sign - "dist/mac-universal/Claude Usage Pet.app"
codesign -v --strict "dist/mac-universal/Claude Usage Pet.app"   # must pass
ditto -c -k --keepParent "dist/mac-universal/Claude Usage Pet.app" "dist/Claude-Usage-Pet-mac-universal.zip"
```
Ad-hoc signing (no Apple Developer ID needed) is NOT enough on macOS Sequoia —
a downloaded (quarantined) ad-hoc app is still `spctl`-rejected and shows the
"malware / move to trash" block. The only zero-warning fix is **notarization**.
The pipeline is already wired (`package.json` mac: `hardenedRuntime`,
`entitlements: build/entitlements.mac.plist`, `notarize: true`). Build with a
Developer ID cert in Keychain + `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
`APPLE_TEAM_ID` env, via `npm run dist:mac` (do NOT pass
`CSC_IDENTITY_AUTO_DISCOVERY=false` — that disables Developer ID signing). Full
runbook in `NOTARIZE.md`. Until the user enrolls ($99/yr Apple Developer), the
free workaround for shared copies is `xattr -cr "<app>"` or System Settings →
Privacy & Security → "Open Anyway". Windows build stays unsigned
(`npm run dist:win`) → recipients click "More info → Run anyway".

To install the user's own copy: copy `dist/mac-*/Claude Usage Pet.app` to
`/Applications`, clear quarantine, `open` it.

## Gotchas (these have bitten us — check them)

- **`build.files` in package.json must list every top-level JS file.** A missing
  entry (e.g. `limits.js`) means `require('./limits')` throws in the packaged app
  and it silently shows the blank Electron welcome window. Verify with
  `npx asar list "<app>/Contents/Resources/app.asar" | grep limits.js`.
- **CSP** in `index.html` must allow `script-src 'self'` and `img-src 'self' data:`
  or `mascot.js`/sprites won't load (and the whole UI silently breaks).
- **macOS icon cache is stubborn** after rebuilding the same appId. If the icon
  still shows the old/Electron one: quit the app, then
  `lsregister -f "<app>"` (full path:
  `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister`),
  delete `$(getconf DARWIN_USER_CACHE_DIR)/com.apple.iconservices*`,
  `killall Dock Finder` — or just reboot.
- **Cross-platform guards:** `screen-saver` always-on-top level,
  `setVisibleOnAllWorkspaces`, `app.dock`, and `tray.setTitle` text are
  macOS-only — keep them behind `process.platform` checks (already done).
- The Windows build is produced but has **never been tested on real Windows** —
  verify transparency, click-through, and the credential file there before
  claiming it works.
