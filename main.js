'use strict';

const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { collectUsage } = require('./usage');
const { fetchLimits } = require('./limits');
const game = require('./game');

// ---------------- user settings (persisted) ----------------
const settings = { menuBarMetric: 'weekly', notifications: true, jet: true, petScale: 'auto' };
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function loadSettings() {
  try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))); } catch {}
}
function saveSettings() {
  try { fs.writeFileSync(settingsPath(), JSON.stringify(settings)); } catch {}
}
function applySettings() {
  if (win && !win.isDestroyed()) win.webContents.send('settings', settings);
  refreshTray();
}
function setSetting(k, v) {
  settings[k] = v;
  saveSettings();
  applySettings();
}

// ---------------- virtual pet (Tamagotchi: hunger / energy / sleep) ----------------
const petPath = () => path.join(app.getPath('userData'), 'petstate.json');
const petStats = { hunger: 10, energy: 90, sleeping: false, last: Date.now() };
let petState = 'active'; // sleeping | hungry | lazy | active
let petSaveAt = 0;

function computePetState() {
  petState = petStats.sleeping ? 'sleeping'
    : petStats.hunger >= 70 ? 'hungry'
    : petStats.energy < 35 ? 'lazy' : 'active';
}
function advancePet() {
  const now = Date.now();
  let mins = (now - (petStats.last || now)) / 60000;
  petStats.last = now;
  if (mins < 0) mins = 0;
  if (mins > 720) mins = 720; // cap catch-up after being closed (12h)
  petStats.hunger = Math.min(100, petStats.hunger + mins * 0.33); // full→starving ~5h
  if (petStats.sleeping) {
    petStats.energy = Math.min(100, petStats.energy + mins * 1.2); // recovers while asleep
    if (petStats.energy >= 85) petStats.sleeping = false;
  } else {
    petStats.energy = Math.max(0, petStats.energy - mins * (0.45 + (petStats.hunger > 70 ? 0.3 : 0)));
    if (petStats.energy <= 18) petStats.sleeping = true; // gets sleepy
  }
  computePetState();
}
function loadPet() {
  try { Object.assign(petStats, JSON.parse(fs.readFileSync(petPath(), 'utf8'))); } catch {}
  advancePet();
}
function savePet() { try { fs.writeFileSync(petPath(), JSON.stringify(petStats)); } catch {} petSaveAt = Date.now(); }
function pushPet() {
  advancePet();
  if (win && !win.isDestroyed()) win.webContents.send('pet', { ...petStats, state: petState });
  if (Date.now() - petSaveAt > 120000) savePet(); // persist ~every 2 min
  if (tray) refreshTray();
}
function feedPet() {
  advancePet();
  petStats.hunger = Math.max(0, petStats.hunger - 55);
  petStats.energy = Math.min(100, petStats.energy + 12);
  petStats.sleeping = false;
  computePetState();
  savePet();
  if (win && !win.isDestroyed()) {
    win.webContents.send('eat'); // trigger the eating animation
    win.webContents.send('pet', { ...petStats, state: petState });
  }
  gameState.feeds = (gameState.feeds || 0) + 1;
  markQuest('feed');
  saveGame();
  pushGame();
  refreshTray();
}

// ---------------- gamification (level / XP / streak / achievements / coins) ----------------
const gamePath = () => path.join(app.getPath('userData'), 'gamestate.json');
const gameState = { coins: 0, feeds: 0, unlocked: [], questDay: '', questDone: false, rodeJet: false, rodeBike: false };
let lastUsageData = null;
function loadGame() { try { Object.assign(gameState, JSON.parse(fs.readFileSync(gamePath(), 'utf8'))); } catch {} }
function saveGame() { try { fs.writeFileSync(gamePath(), JSON.stringify(gameState)); } catch {} }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function markQuest(kind) {
  const q = game.questForDay(todayKey());
  if (gameState.questDay === todayKey() && gameState.questDone) return;
  if (gameState.questDay !== todayKey()) { gameState.questDay = todayKey(); gameState.questDone = false; }
  // 'code' auto-completes from usage; feed/play from events
  if (q.id === kind || (q.id === 'code' && kind === 'usage')) {
    if (!gameState.questDone) { gameState.questDone = true; gameState.coins += 30; notify('🎯 Quest complete!', '+30 coins'); }
  }
}
function buildGameCtx() {
  const u = lastUsageData || {};
  const xpBase = {
    grand: u.grand || 0,
    feeds: gameState.feeds,
    bestStreak: (u.streak && u.streak.best) || 0,
    unlocked: gameState.unlocked.length,
  };
  const xp = game.computeXp(xpBase);
  const lv = game.levelFromXp(xp);
  const ctx = {
    grand: u.grand || 0, feeds: gameState.feeds,
    bestStreak: (u.streak && u.streak.best) || 0,
    models: (u.models || []).length, sessions: (u.stats && u.stats.sessions) || 0,
    activeDays: (u.stats && u.stats.activeDays) || 0,
    level: lv.level, rodeJet: gameState.rodeJet, rodeBike: gameState.rodeBike,
  };
  return { xp, lv, ctx };
}
let lastLevel = 0;
function pushGame() {
  const { xp, lv, ctx } = buildGameCtx();
  // newly unlocked achievements -> coins + notify
  const achs = game.evalAchievements(ctx);
  for (const a of achs) {
    if (a.unlocked && !gameState.unlocked.includes(a.id)) {
      gameState.unlocked.push(a.id);
      gameState.coins += 25;
      notify(`${a.emoji} Achievement: ${a.name}`, '+25 coins');
    }
  }
  // level-up -> coins
  if (lastLevel && lv.level > lastLevel) { gameState.coins += 50 * (lv.level - lastLevel); notify('⭐ Level up!', `Clawd reached Lv.${lv.level} · +${50 * (lv.level - lastLevel)} coins`); }
  lastLevel = lv.level;
  // daily 'code' quest from real usage
  if (lastUsageData && lastUsageData.todayGrand > 0) markQuest('usage');
  saveGame();
  const q = game.questForDay(todayKey());
  if (win && !win.isDestroyed()) {
    win.webContents.send('game', {
      level: lv.level, into: lv.into, need: lv.need, xp,
      coins: gameState.coins,
      streak: lastUsageData ? lastUsageData.streak : { current: 0, best: 0 },
      achievements: achs,
      quest: { text: q.text, done: gameState.questDay === todayKey() && gameState.questDone },
      shop: game.SHOP,
    });
  }
}
function buyItem(id) {
  const item = game.SHOP.find((s) => s.id === id);
  if (!item || gameState.coins < item.cost) return;
  gameState.coins -= item.cost;
  advancePet();
  petStats.hunger = Math.max(0, Math.min(100, petStats.hunger + item.hunger));
  petStats.energy = Math.max(0, Math.min(100, petStats.energy + item.energy));
  petStats.sleeping = false;
  computePetState();
  savePet(); saveGame();
  if (win && !win.isDestroyed()) { win.webContents.send('eat'); win.webContents.send('pet', { ...petStats, state: petState }); }
  pushGame(); refreshTray();
}

// ---------------- threshold notifications ----------------
const notifyState = { session: {}, week: {} };
function notify(title, body) {
  try { new Notification({ title, body }).show(); } catch {}
}
function checkNotify(plan) {
  if (!settings.notifications || !plan) return;
  for (const [key, label] of [['session', 'Session'], ['week', 'Weekly']]) {
    const info = plan[key];
    if (!info) continue;
    const st = notifyState[key];
    if (info.resetsAt && st.lastReset && info.resetsAt !== st.lastReset) {
      st.at80 = st.at90 = false;
      notify(`✓ ${label} limit reset`, 'Fresh 100% available 🎉');
    }
    st.lastReset = info.resetsAt;
    const u = info.util;
    if (u < 70) { st.at80 = st.at90 = false; } // rearm after it drops
    else if (u >= 90 && !st.at90) { st.at90 = true; notify(`⚠️ ${label} ${Math.round(u)}% used`, `Only ${Math.round(100 - u)}% left — slow down!`); }
    else if (u >= 80 && !st.at80) { st.at80 = true; notify(`${label} 80% used`, `${Math.round(100 - u)}% left this ${key === 'session' ? 'session' : 'week'}`); }
  }
}

// The window reserves bubble room above AND below the mascot so the bubble can
// flip to whichever side stays on screen. These must match the CSS variables.
const WIN_W = 300;
const BUBBLE_SPACE = 410; // tall enough for the Awards tab (must match CSS --bubble-space)
const PET_BOX = 132; // >= sprite frame height (114); the mascot is scaled smaller via CSS
const WIN_H = BUBBLE_SPACE + PET_BOX + BUBBLE_SPACE; // 772
const PET_FEET = BUBBLE_SPACE + PET_BOX; // mascot's feet, measured from window top
const REFRESH_MS = 60 * 1000;

let win = null;
let tray = null;
let paused = false; // stats bubble open
let dragging = false; // user is dragging the pet
let jetMode = false; // jet fly-across in progress
let groundTop = 0; // window-top the pet roams along (updated when dropped)
let jetTimer = null;

function floorTop(area) {
  return area.y + area.height - PET_FEET;
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const debug = !!process.env.PET_DEBUG;
  if (debug) {
    win.webContents.on('console-message', (_e, _l, m) => console.log('[renderer]', m));
  }

  // 'screen-saver' level is macOS-specific; plain alwaysOnTop elsewhere.
  if (process.platform === 'darwin') win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(true);
  if (process.platform !== 'win32') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    search: debug ? 'debug=1' : '',
  });

  const area = screen.getPrimaryDisplay().workArea;
  groundTop = floorTop(area);

  if (debug) {
    win.setBounds({ x: area.x + 420, y: area.y + 40, width: WIN_W, height: WIN_H });
    paused = true;
    win.webContents.once('did-finish-load', () => {
      pushUsage();
      sendPlacement();
    });
    return;
  }

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setBounds({ x: area.x + 60, y: groundTop, width: WIN_W, height: WIN_H });
  win.webContents.once('did-finish-load', () => sendPlacement());

  startRoaming();
  pushUsage();
  scheduleStunt();
}

// Should the bubble open above or below the pet, given the window's position?
function placement() {
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const petTopScreen = b.y + BUBBLE_SPACE;
  return petTopScreen - area.y < BUBBLE_SPACE - 20 ? 'below' : 'above';
}
function sendPlacement() {
  if (win && !win.isDestroyed()) win.webContents.send('place', placement());
}

function startRoaming() {
  let dir = 1;
  let mode = 'walk';
  let timer = 0;
  const SPEED = 0.9;

  function reschedule() {
    const slow = petState === 'lazy' || petState === 'hungry';
    timer =
      mode === 'walk'
        ? Math.round((90 + Math.random() * 160) * (slow ? 0.5 : 1))
        : Math.round((60 + Math.random() * 110) * (slow ? 2 : 1));
  }
  reschedule();

  setInterval(() => {
    if (!win || win.isDestroyed() || paused || dragging || jetMode) return;
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const minX = area.x;
    const maxX = area.x + area.width - WIN_W;
    const b = win.getBounds();

    // asleep -> stay curled up on the ground
    if (petState === 'sleeping') {
      win.webContents.send('walk', 0);
      if (b.y !== groundTop) win.setBounds({ x: b.x, y: groundTop, width: WIN_W, height: WIN_H });
      return;
    }
    const slow = petState === 'lazy' || petState === 'hungry';

    if (mode === 'rest') {
      win.webContents.send('walk', 0);
      if (b.y !== groundTop) win.setBounds({ x: b.x, y: groundTop, width: WIN_W, height: WIN_H });
      if (--timer <= 0) {
        mode = 'walk';
        if (Math.random() < 0.5) dir = -dir;
        reschedule();
      }
      return;
    }

    let nx = b.x + dir * SPEED * (slow ? 0.5 : 1);
    if (nx <= minX) { nx = minX; dir = 1; }
    else if (nx >= maxX) { nx = maxX; dir = -1; }
    win.setBounds({ x: Math.round(nx), y: groundTop, width: WIN_W, height: WIN_H });
    win.webContents.send('walk', dir);
    if (--timer <= 0) { mode = 'rest'; reschedule(); }
  }, 30);
}

// ---------------- drag: window follows the cursor ----------------
let dragOffset = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0 };
let dragInterval = null;

function startDrag() {
  if (jetMode) return;
  dragging = true;
  const c = screen.getCursorScreenPoint();
  const b = win.getBounds();
  dragStartPos = { x: b.x, y: b.y };
  dragOffset = { x: c.x - b.x, y: c.y - b.y };
  dragInterval = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    win.setBounds({ x: p.x - dragOffset.x, y: p.y - dragOffset.y, width: WIN_W, height: WIN_H });
  }, 12);
}
function endDrag() {
  dragging = false;
  if (dragInterval) clearInterval(dragInterval);
  dragInterval = null;
  const b = win.getBounds();
  const moved = Math.abs(b.x - dragStartPos.x) + Math.abs(b.y - dragStartPos.y);
  groundTop = b.y; // roam along wherever it was dropped
  sendPlacement();
  // A press that barely moved is a tap -> toggle the bubble (decided here in
  // main from the real window movement, which is more reliable than DOM deltas).
  if (moved < 6) win.webContents.send('tap');
}

// ---------------- cross-screen stunts: jet ✈️ / bike 🚲 / run 🏃 ----------------
function scheduleStunt() {
  if (jetTimer) clearTimeout(jetTimer);
  jetTimer = setTimeout(() => {
    const opts = ['bike', 'run'];
    if (settings.jet) opts.push('jet');
    crossScreen(opts[Math.floor(Math.random() * opts.length)]);
  }, 75000 + Math.random() * 90000); // every ~1.25–2.75 min
}
function crossScreen(kind) {
  if (!win || win.isDestroyed() || paused || dragging || jetMode) return scheduleStunt();
  if (kind === 'jet' && !settings.jet) return scheduleStunt();
  jetMode = true; // pauses roaming during any stunt
  if (kind === 'jet') gameState.rodeJet = true;
  if (kind === 'bike') gameState.rodeBike = true;
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const topY = kind === 'jet' ? area.y - 280 : groundTop; // jet flies up high; bike/run on the ground
  const off = WIN_W + 40;
  let x = dir === 1 ? area.x - off : area.x + area.width + off - WIN_W;
  const endX = dir === 1 ? area.x + area.width + off - WIN_W : area.x - off;
  const steps = kind === 'run' ? 75 : kind === 'bike' ? 120 : 110;
  const dx = (endX - x) / steps;

  win.setBounds({ x: Math.round(x), y: topY, width: WIN_W, height: WIN_H });
  win.webContents.send(kind + '-start', dir);

  let i = 0;
  const fly = setInterval(() => {
    i++;
    x += dx;
    win.setBounds({ x: Math.round(x), y: topY, width: WIN_W, height: WIN_H });
    if (i >= steps) {
      clearInterval(fly);
      jetMode = false;
      const a = screen.getDisplayMatching(win.getBounds()).workArea;
      const cx = Math.min(Math.max(area.x + area.width / 2 - WIN_W / 2, a.x), a.x + a.width - WIN_W);
      groundTop = floorTop(a);
      win.setBounds({ x: Math.round(cx), y: groundTop, width: WIN_W, height: WIN_H });
      win.webContents.send(kind + '-end');
      sendPlacement();
      pushGame(); // rode-jet/bike may unlock achievements
      scheduleStunt();
    }
  }, 15);
}

// ---------------- usage + menu bar ----------------
function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n || 0);
}
function pushUsage() {
  try {
    const data = collectUsage();
    lastUsageData = data;
    if (win && !win.isDestroyed()) win.webContents.send('usage', data);
    trayToday = data.todayGrand;
    refreshTray();
    pushGame();
  } catch (e) {
    console.error('usage scan failed:', e);
  }
}

// Real plan limits from the oauth usage endpoint (session % + weekly %).
let limitsTimer = null;
let limitsBackoff = 0; // minutes, grows on 429 so we don't hammer the endpoint
async function pushLimits() {
  let r;
  try {
    r = await fetchLimits();
    if (win && !win.isDestroyed()) win.webContents.send('plan', r);
    if (r && r.ok) { trayPlan = r.plan; checkNotify(trayPlan); limitsBackoff = 0; } // keep last good plan
    else if (r && /429/.test(r.error || '')) { limitsBackoff = Math.min(limitsBackoff ? limitsBackoff * 2 : 5, 30); }
    refreshTray();
  } catch (e) {
    console.error('limits fetch failed:', e);
  }
  return r;
}
// Self-scheduling poll: ~3 min normally, exponential backoff (up to 30 min) on 429.
function scheduleLimits() {
  if (limitsTimer) clearTimeout(limitsTimer);
  pushLimits().then((r) => {
    const mins = r && r.ok ? 3 : (limitsBackoff || 5);
    limitsTimer = setTimeout(scheduleLimits, mins * 60000);
  });
}

// ---- menu-bar meter (CodexBar-style: live % + detailed dropdown) ----
let trayPlan = null;
let trayToday = 0;
const pct = (p) => Math.round(p) + '%';

function resetShort(iso) {
  if (!iso) return '';
  const t = new Date(iso), diff = t - Date.now();
  if (diff <= 0) return 'resetting';
  if (diff < 24 * 3600e3) {
    const h = Math.floor(diff / 3600e3), m = Math.floor((diff % 3600e3) / 60e3);
    return h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`;
  }
  const d = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let hr = t.getHours();
  const ap = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return `resets ${d[t.getDay()]} ${hr}${ap}`;
}

function refreshTray() {
  if (!tray) return;
  const p = trayPlan;
  const metric = p && (settings.menuBarMetric === 'session' ? p.session : p.week);
  // Title: chosen plan % (settings), falling back to today's tokens.
  if (process.platform === 'darwin') {
    tray.setTitle(metric ? ' ' + pct(metric.util) : ' ' + fmtTokens(trayToday));
  }
  tray.setToolTip(
    p && p.session && p.week
      ? `Claude · Session ${pct(p.session.util)} · Weekly ${pct(p.week.util)}` +
          (p.planName ? ` · ${p.planName}` : '')
      : 'Claude Usage Pet · ' + fmtTokens(trayToday) + ' today'
  );
  tray.setContextMenu(buildTrayMenu());
}

function buildTrayMenu() {
  const p = trayPlan;
  const head = [];
  if (p && p.session && p.week) {
    if (p.planName) head.push({ label: `Plan · ${p.planName}`, enabled: false });
    head.push({ label: `Session   ${pct(p.session.util)} used · ${resetShort(p.session.resetsAt)}`, enabled: false });
    head.push({ label: `Weekly    ${pct(p.week.util)} used · ${resetShort(p.week.resetsAt)}`, enabled: false });
    if (p.extra) head.push({ label: `Extra     ${pct(p.extra.util || 0)} used`, enabled: false });
    head.push({ type: 'separator' });
  }
  const petEmoji = { sleeping: '😴', hungry: '🤤', lazy: '😪', active: '😊' }[petState] || '😊';
  return Menu.buildFromTemplate([
    ...head,
    { label: `🐾 Clawd ${petEmoji}  ·  🍗 ${Math.round(100 - petStats.hunger)}%  ⚡ ${Math.round(petStats.energy)}%`, enabled: false },
    { label: '🍪 Feed Clawd', click: () => feedPet() },
    { type: 'separator' },
    { label: 'Refresh now', click: () => { pushUsage(); pushLimits(); } },
    { label: 'Take a jet flight ✈️', click: () => crossScreen('jet') },
    { label: 'Go for a bike ride 🚲', click: () => crossScreen('bike') },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Menu-bar shows',
          submenu: [
            { label: 'Weekly %', type: 'radio', checked: settings.menuBarMetric === 'weekly', click: () => setSetting('menuBarMetric', 'weekly') },
            { label: 'Session %', type: 'radio', checked: settings.menuBarMetric === 'session', click: () => setSetting('menuBarMetric', 'session') },
          ],
        },
        {
          label: 'Pet size',
          submenu: [
            { label: 'Auto (by usage)', type: 'radio', checked: settings.petScale === 'auto', click: () => setSetting('petScale', 'auto') },
            { label: 'Small', type: 'radio', checked: settings.petScale === 'small', click: () => setSetting('petScale', 'small') },
            { label: 'Large', type: 'radio', checked: settings.petScale === 'large', click: () => setSetting('petScale', 'large') },
          ],
        },
        { label: 'Notifications', type: 'checkbox', checked: settings.notifications, click: (i) => setSetting('notifications', i.checked) },
        { label: 'Jet flights ✈️', type: 'checkbox', checked: settings.jet, click: (i) => setSetting('jet', i.checked) },
      ],
    },
    {
      label: 'Reset position',
      click: () => {
        const a = screen.getPrimaryDisplay().workArea;
        groundTop = floorTop(a);
        win.setBounds({ x: a.x + 60, y: groundTop, width: WIN_W, height: WIN_H });
        sendPlacement();
      },
    },
    { label: 'Show / hide pet', click: () => (win.isVisible() ? win.hide() : win.show()) },
    {
      label: 'Open at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}
function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'assets', 'tray.png');
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  else img = img.resize({ height: 18 });
  tray = new Tray(img);
  if (img.isEmpty()) tray.setTitle('🟫');
  tray.setToolTip('Claude Usage Pet');
  tray.setContextMenu(buildTrayMenu());
}

ipcMain.on('set-paused', (_e, v) => { paused = !!v; });
ipcMain.on('request-usage', () => pushUsage());
ipcMain.on('set-interactive', (_e, v) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!v, { forward: true });
});
ipcMain.on('drag-start', startDrag);
ipcMain.on('drag-end', endDrag);
ipcMain.on('feed', () => feedPet());
ipcMain.on('buy', (_e, id) => buyItem(id));
ipcMain.on('played', () => { markQuest('play'); pushGame(); });
// Right-click the mascot -> same menu as the tray (so the app is controllable
// even when the menu-bar icon is hidden behind the notch).
ipcMain.on('context-menu', () => {
  if (win && !win.isDestroyed()) buildTrayMenu().popup({ window: win });
});

app.whenReady().then(() => {
  loadSettings();
  loadPet();
  loadGame();
  createWindow();
  createTray();
  win.webContents.once('did-finish-load', () => { applySettings(); pushPet(); pushGame(); });
  pushUsage();
  setInterval(pushUsage, REFRESH_MS);
  scheduleLimits(); // self-schedules with 429 backoff (no fixed interval)
  setInterval(pushPet, 20000); // tick the pet every 20s
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', (e) => e.preventDefault());
app.dock && app.dock.hide();
