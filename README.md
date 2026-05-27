# 🟧 Claude Usage Pet

> A coral pixel mascot named **Clawd** who lives on your screen and shows your **real Claude Code usage** — plan limits, cost, streaks — and grows as a little **Tamagotchi** you feed and play with.

No more typing `/usage`. Just glance at Clawd. 🐾

![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555)
![electron](https://img.shields.io/badge/built%20with-Electron-47848F)
![license](https://img.shields.io/badge/license-MIT-green)

---

## Install

```bash
npx claude-usage-pet           # run instantly, no install
# or
npm install -g claude-usage-pet
claude-usage-pet               # alias: clawd
```

Runs on **macOS, Windows, and Linux** (anything with Node 18+). Because it runs
from your locally-installed package, there's **no macOS "damaged" Gatekeeper
prompt** like prebuilt `.dmg`/`.exe` files get. Quit anytime via the mascot's
right-click menu → **Quit**.

> First install pulls in Electron (a few hundred MB).

---

## What you get

### 🐾 A living desktop pet
Clawd walks, rests, sits, blinks, jumps, sends little hearts, and every so often
takes off on a **jet ✈️**, a **bike ride 🚲**, or does a quick **run 🏃** across
your screen. **Drag** him anywhere; **click** to open his panel; **right-click**
for the menu.

### 📊 Real usage at a glance — click Clawd
A tabbed panel powered by your actual Claude Code data:

| Tab | Shows |
|-----|-------|
| **Limits** | Real **Session (5h)** + **Weekly** utilisation, **% left**, reset times, and a burn-rate estimate ("on track ✓" / "⚠️ limit in ~2d"). |
| **Cost** | Estimated **USD value** at API rates — today / week / 30-day, per model. |
| **Activity** | 7-day chart (tokens or $), total tokens, messages, sessions, top project. |
| **🏆 Awards** | Level + XP, 🔥 streak, 🪙 coins, achievements, daily quest, and a treat shop. |

The plan limits are the **same numbers `/usage` shows** — Clawd reads your Claude
Code OAuth token locally and calls the same endpoint. Your menu-bar icon also
shows the live % at a glance.

### 🎮 Tamagotchi + gamification
- **Hunger & energy** that change over real time — Clawd gets hungry (🍪 thought
  bubble), lazy, and eventually **sleeps** (Zzz). **Feed** him to perk him up.
- **Level up** from your token usage, **🔥 daily streaks** from real activity,
  **achievements**, **daily quests**, and **🪙 coins** to spend on treats.
- Clawd's mood reacts to your limits — a calm glow when you're fine, a worried
  red pulse when you're near a cap.

### 🔔 Stay informed
Desktop notifications at **80% / 90%** usage and when a limit **resets**, so you
never get cut off mid-flow.

---

## How it works

Everything is local and private:

- **Usage & cost** are parsed from your session logs in
  `~/.claude/projects/**/*.jsonl` (incremental — only changed files are re-read).
- **Plan limits** come from the same OAuth endpoint `/usage` uses. The token is
  read from your macOS Keychain (`Claude Code-credentials`) or
  `~/.claude/.credentials.json` on Windows/Linux. **It never leaves your machine
  and is never logged.**
- If you're not logged into Claude Code, the panel falls back to showing usage
  vs. your own busiest day/week.

---

## Settings & controls

Right-click the mascot (or the menu-bar icon):

- **Feed Clawd 🍪**, take a **jet flight ✈️** / **bike ride 🚲**
- **Settings** → menu-bar metric (weekly/session), pet size, notifications on/off, jet on/off
- **Refresh**, **Reset position**, **Open at login**, **Quit**

---

## Build native apps (optional)

```bash
npm run pack        # quick unpacked build
npm run dist:mac    # universal .dmg + .zip (sign/notarize: see NOTARIZE.md)
npm run dist:win    # Windows installer + portable
```

---

## Disclaimer

Unofficial, community-made, and not affiliated with or endorsed by Anthropic.
"Claude" is a trademark of Anthropic. Cost figures are **estimates** of
equivalent API pricing — on a subscription you don't actually pay per token.

MIT © [plugin87](https://github.com/plugin87)
