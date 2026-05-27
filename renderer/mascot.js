'use strict';

const petEl = document.getElementById('pet');
const jetEl = document.getElementById('jet');
const bikeEl = document.getElementById('bike');
const bubble = document.getElementById('bubble');
const stage = document.getElementById('stage');
const zzzEl = document.getElementById('zzz');
const thoughtEl = document.getElementById('thought');
const foodEl = document.getElementById('food');
const petmoodEl = document.getElementById('petmood');

// sprite.png: 10 frames of 132px (0-3 walk,4 idle,5 blink,6 jump,7 sit,8 sleep,9 eat).
const FW = 132;
const WALK = [0, 1, 2, 3];
const F_IDLE = 4, F_BLINK = 5, F_JUMP = 6, F_SIT = 7, F_SLEEP = 8, F_EAT = 9;
const RUN = [10, 11];

let open = false;
let running = false; // zoomies (run frames + faster cycle)
let baseMode = 'idle'; // 'idle' | 'walk' (driven by main)
let sitting = false;
let face = 1;
let scale = 0.45;
let wf = 0;
let jumpUntil = 0;
let eatUntil = 0;
let jetMode = false;
let bikeMode = false;
let petInfo = { state: 'active', hunger: 10, energy: 90 }; // from main

function setFrame(i) { petEl.style.backgroundPositionX = -i * FW + 'px'; }
function applyTransform() {
  petEl.style.transform = `scaleX(${face * scale}) scaleY(${scale})`;
  // tell the bubble how tall the mascot actually is, so it sits right above it
  document.documentElement.style.setProperty('--pet-vis', Math.round(114 * scale) + 'px');
}

let petScalePref = 'auto'; // 'auto' | 'small' | 'large' (from settings)
function scaleForToday(today) {
  if (petScalePref === 'small') return 0.34;
  if (petScalePref === 'large') return 0.7;
  // auto: smaller overall so the pet doesn't block the screen; grows with usage
  const l = Math.log10(Math.max(today, 1));
  return Math.max(0.3, Math.min(0.62, 0.32 + ((l - 4) / 4) * 0.3));
}

// ---------------- animation ticker ----------------
let tick = 0;
setInterval(() => {
  tick++;
  if (jetMode) { jetEl.style.backgroundPositionX = (tick % 2 ? -264 : 0) + 'px'; return; }
  if (bikeMode) { bikeEl.style.backgroundPositionX = (tick % 2 ? -252 : 0) + 'px'; return; }
  if (running) { setFrame(RUN[tick % 2]); return; } // zoomies
  if (Date.now() < eatUntil) { setFrame(F_EAT); return; }      // munching
  if (petInfo.state === 'sleeping') { setFrame(tick % 6 < 3 ? F_SLEEP : F_SIT); return; } // breathe
  if (Date.now() < jumpUntil) { setFrame(F_JUMP); return; }
  if (baseMode === 'walk') {
    if (tick % 2 === 0) wf = (wf + 1) % WALK.length;
    setFrame(WALK[wf]);
    return;
  }
  if (petInfo.state === 'hungry' || sitting) { setFrame(F_SIT); return; } // hungry sits & sulks
  setFrame(tick % 40 < 2 ? F_BLINK : F_IDLE); // blink every ~3.6s
}, 90);

// ---------------- spontaneous moods (only while resting) ----------------
function heartsBurst(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const h = document.createElement('div');
      h.className = 'heart';
      h.style.left = 150 - 9 + (Math.random() * 34 - 17) + 'px';
      h.style.top = 360 + (Math.random() * 16 - 8) + 'px';
      stage.appendChild(h);
      setTimeout(() => h.remove(), 1550);
    }, i * 140);
  }
}
setInterval(() => {
  if (open || jetMode || dragging || baseMode === 'walk' || Date.now() < jumpUntil) return;
  if (petInfo.state !== 'active' || Date.now() < eatUntil) return; // only play when happy & fed
  const r = Math.random();
  if (r < 0.16) { jumpUntil = Date.now() + 460; heartsBurst(2); }
  else if (r < 0.30) { sitting = true; setTimeout(() => (sitting = false), 2500 + Math.random() * 2500); }
  else if (r < 0.42) { heartsBurst(3); }
}, 2600);

// ---------------- formatting ----------------
function fmt(n) {
  if (n == null) return '–';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}
function shortModel(s) { return String(s).replace(/^claude-/, '').replace(/-\d{8}$/, ''); }
function usd(n) {
  n = n || 0;
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  if (n >= 100) return '$' + n.toFixed(0);
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toFixed(n >= 0.01 ? 3 : 4);
}
function monthYear(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return '';
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()] + ' ' + t.getFullYear();
}
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const $ = (id) => document.getElementById(id);

function colorFor(p) { return p >= 90 ? 'var(--bad)' : p >= 75 ? 'var(--warn)' : 'var(--ok)'; }

// Mascot reacts to how close you are to a limit: calm < 70, amber glow 70-90,
// worried red pulse > 90.
function setMood(level) {
  if (level > 90) {
    petEl.classList.add('worry');
  } else {
    petEl.classList.remove('worry');
    if (level >= 70) {
      petEl.style.setProperty('--glow', 'rgba(224,163,47,.85)');
      petEl.style.setProperty('--glow-blur', '11px');
    } else {
      petEl.style.setProperty('--glow', 'transparent');
      petEl.style.setProperty('--glow-blur', '0px');
    }
  }
}

// "at this rate, you'll hit the limit in ~X" — uses how far into the window we
// are (from resets_at) vs how much is already used.
function burnText(info, windowMs) {
  if (!info || !info.resetsAt) return '';
  const reset = new Date(info.resetsAt).getTime();
  const msLeft = reset - Date.now();
  if (msLeft <= 0 || msLeft >= windowMs) return '';
  const elapsed = windowMs - msLeft;
  const ratePerMs = info.util / elapsed; // % per ms
  if (ratePerMs <= 0) return 'on track ✓';
  const msTo100 = (100 - info.util) / ratePerMs;
  if (msTo100 >= msLeft) return 'on track ✓'; // resets before you'd hit it
  const h = msTo100 / 3600e3;
  return '⚠️ limit in ~' + (h < 24 ? Math.max(1, Math.round(h)) + 'h' : (h / 24).toFixed(h < 48 ? 1 : 0) + 'd');
}

function resetLabel(iso) {
  if (!iso) return '';
  const t = new Date(iso), diff = t - Date.now();
  if (diff <= 0) return 'resetting…';
  if (diff < 24 * 3600e3) {
    const h = Math.floor(diff / 3600e3), m = Math.floor((diff % 3600e3) / 60e3);
    return `resets in ${h}h ${m}m`;
  }
  const d = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let hr = t.getHours();
  const ap = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  const mm = t.getMinutes() ? ':' + String(t.getMinutes()).padStart(2, '0') : '';
  return `resets ${d[t.getDay()]} ${hr}${mm}${ap}`;
}

// real plan utilisation (0-100)
function planBar(n, label, info) {
  $('lbl' + n).textContent = label;
  const p = Math.max(0, Math.min(100, info.util));
  $('fill' + n).style.width = p + '%';
  $('fill' + n).style.background = colorFor(p);
  $('reset' + n).textContent = resetLabel(info.resetsAt);
  if ($('sub' + n)) $('sub' + n).innerHTML = `${p.toFixed(0)}% used · <b>${(100 - p).toFixed(0)}% left</b>`;
}
// local fallback: tokens vs your own peak
function localBar(n, label, used, peak) {
  $('lbl' + n).textContent = label;
  const p = peak > 0 ? Math.min(100, (used / peak) * 100) : 0;
  $('fill' + n).style.width = p + '%';
  $('fill' + n).style.background = 'var(--coral)';
  $('reset' + n).textContent = fmt(used);
  $('sub' + n).innerHTML = `${Math.round(p)}% of your peak · peak <b>${fmt(peak)}</b>`;
}

let lastUsage = null, lastPlan = null, planErr = null;

function draw() {
  const d = lastUsage;
  if (lastPlan && lastPlan.session && lastPlan.week) {
    $('b1-title').textContent = 'Plan Usage Limits';
    $('status').textContent = lastPlan.planName || 'live'; // e.g. "Max 5x"
    planBar(1, 'Session (5h)', lastPlan.session);
    planBar(2, 'Weekly · all models', lastPlan.week);

    // burn-rate projection on each bar + mascot mood from the worst window
    const b1 = burnText(lastPlan.session, 5 * 3600e3);
    const b2 = burnText(lastPlan.week, 7 * 24 * 3600e3);
    if (b1) $('sub1').innerHTML += ' · ' + b1;
    if (b2) $('sub2').innerHTML += ' · ' + b2;
    setMood(Math.max(lastPlan.session.util, lastPlan.week.util));

    // One optional 3rd row, by priority: extra spend > Sonnet > Opus weekly.
    const ex = lastPlan.extra;
    const so = lastPlan.weekSonnet;
    const op = lastPlan.weekOpus;
    if (ex) {
      $('blk3').style.display = '';
      $('lbl3').textContent = 'Extra usage';
      const p = typeof ex.util === 'number' ? Math.min(100, ex.util) : 0;
      $('fill3').style.width = p + '%';
      $('fill3').style.background = colorFor(p);
      $('reset3').textContent =
        ex.used != null && ex.limit != null ? `${ex.currency}${ex.used} / ${ex.currency}${ex.limit}` : p + '% used';
    } else if (so && (so.util > 0 || so.resetsAt)) {
      $('blk3').style.display = '';
      $('lbl3').textContent = 'Weekly · Sonnet';
      $('fill3').style.width = Math.min(100, so.util) + '%';
      $('fill3').style.background = colorFor(so.util);
      $('reset3').textContent = resetLabel(so.resetsAt);
    } else if (op && (op.util > 0 || op.resetsAt)) {
      $('blk3').style.display = '';
      $('lbl3').textContent = 'Weekly · Opus';
      $('fill3').style.width = Math.min(100, op.util) + '%';
      $('fill3').style.background = colorFor(op.util);
      $('reset3').textContent = resetLabel(op.resetsAt);
    } else $('blk3').style.display = 'none';
  } else if (d) {
    $('b1-title').textContent = 'Usage · local';
    $('status').textContent = planErr === 'no-token' ? 'login not found'
      : /429/.test(planErr || '') ? 'rate-limited · retrying'
      : planErr ? 'sync error' : '';
    localBar(1, 'Today', d.todayGrand, d.peakDay);
    localBar(2, 'This week', d.weekTotal, d.peakWeek);
    $('blk3').style.display = 'none';
    setMood(0); // no real limit data -> calm
  }

  if (!d) return;

  // ---- COST tab ----
  const c = d.cost || { total: 0, today: 0, week: 0, last30: 0 };
  $('cost-total').innerHTML = usd(c.total) + '<span class="unit">≈ API value</span>';
  $('c-today').textContent = usd(c.today);
  $('c-week').textContent = usd(c.week);
  $('c-30').textContent = usd(c.last30);
  $('cost-models').innerHTML = (d.models || [])
    .slice(0, 3)
    .map((x) => `<div class="m"><span>${shortModel(x.name)}</span><span class="mv">${usd(x.cost || 0)}</span></div>`)
    .join('');

  // ---- ACTIVITY tab ----
  drawChart(d);
  const s = d.stats || {};
  $('a-tokens').textContent = fmt(d.grand);
  $('a-msgs').textContent = (s.messages || 0).toLocaleString('en-US');
  $('a-sessions').textContent = String(s.sessions || d.fileCount || 0);
  $('a-project').textContent = s.topProject ? s.topProject.name : '–';

  // ---- account footer ----
  const acc = lastPlan && lastPlan.account;
  if (acc && (acc.name || acc.email)) {
    const since = acc.since ? ' · since ' + monthYear(acc.since) : '';
    $('foot').innerHTML = `${acc.name || ''}${acc.email ? ' · ' + acc.email : ''}${since}`;
  } else {
    $('foot').innerHTML = `<b>${fmt(d.grand)}</b> tokens total · ${d.fileCount} sessions`;
  }

  scale = scaleForToday(d.todayGrand);
  applyTransform();
}

// 7-day chart in token or cost mode
let chartMode = 'tok';
function drawChart(d) {
  const vals = d.last7.map((x) => (chartMode === 'cost' ? x.cost || 0 : x.total));
  const maxV = Math.max(1e-9, ...vals);
  $('chart').innerHTML = d.last7
    .map((x, i) => {
      const v = vals[i];
      const h = Math.max(2, Math.round((v / maxV) * 36));
      const today = i === d.last7.length - 1;
      const label = chartMode === 'cost' ? usd(v) : fmt(v);
      return `<div class="col${today ? ' today' : ''}" title="${x.day}: ${label}"><div class="cbar" style="height:${h}px"></div><div class="dow">${DOW[x.dow]}</div></div>`;
    })
    .join('');
}

window.pet.onUsage((d) => { lastUsage = d; draw(); });
window.pet.onPlan((r) => {
  if (r && r.ok) { lastPlan = r.plan; planErr = null; }
  // On a transient failure (e.g. 429), KEEP the last good plan so the live view
  // doesn't flicker back to local; only note the error for the fallback case.
  else { planErr = (r && r.error) || 'error'; }
  draw();
});

// ---------------- main -> renderer events ----------------
window.pet.onWalk((dir) => {
  if (open) return;
  if (dir === 0) { baseMode = 'idle'; return; }
  baseMode = 'walk';
  sitting = false;
  const nf = dir < 0 ? -1 : 1;
  if (nf !== face) { face = nf; applyTransform(); }
});
window.pet.onPlace((side) => bubble.classList.toggle('below', side === 'below'));
window.pet.onSettings((s) => {
  petScalePref = s.petScale || 'auto';
  if (lastUsage) { scale = scaleForToday(lastUsage.todayGrand); applyTransform(); }
});

// ---------------- virtual-pet state + feeding ----------------
const MOOD_EMOJI = { sleeping: '😴', hungry: '🤤', lazy: '😪', active: '😊' };
function updatePetEffects() {
  const st = petInfo.state;
  const eating = Date.now() < eatUntil;
  zzzEl.style.display = !eating && st === 'sleeping' ? 'block' : 'none';
  thoughtEl.style.display = !eating && st === 'hungry' ? 'block' : 'none';
  const full = Math.round(100 - (petInfo.hunger || 0));
  petmoodEl.textContent = `${MOOD_EMOJI[st] || '🐾'} Clawd · 🍗${full}% ⚡${Math.round(petInfo.energy || 0)}%`;
}
window.pet.onPet((p) => { petInfo = p; updatePetEffects(); });
window.pet.onEat(() => {
  eatUntil = Date.now() + 2600;
  zzzEl.style.display = thoughtEl.style.display = 'none';
  foodEl.style.display = 'block';
  foodEl.classList.remove('munch'); void foodEl.offsetWidth; foodEl.classList.add('munch');
  heartsBurst(3);
  setTimeout(() => { foodEl.style.display = 'none'; updatePetEffects(); }, 2600);
});
document.getElementById('feedbtn').addEventListener('click', (e) => {
  e.stopPropagation();
  window.pet.feed();
});
window.pet.onJetStart((dir) => {
  jetMode = true;
  jetEl.style.transform = `scaleX(${dir})`;
  jetEl.style.display = 'block';
  petEl.style.display = 'none';
});
window.pet.onJetEnd(() => {
  jetMode = false;
  jetEl.style.display = 'none';
  petEl.style.display = '';
});
window.pet.onBikeStart((dir) => {
  bikeMode = true;
  bikeEl.style.transform = `scaleX(${dir})`;
  bikeEl.style.display = 'block';
  petEl.style.display = 'none';
});
window.pet.onBikeEnd(() => {
  bikeMode = false;
  bikeEl.style.display = 'none';
  petEl.style.display = '';
});
window.pet.onRunStart((dir) => {
  running = true;
  face = dir < 0 ? -1 : 1;
  applyTransform();
});
window.pet.onRunEnd(() => { running = false; });

// ---------------- gamification (Awards tab) ----------------
window.pet.onGame((g) => {
  $('g-level').textContent = 'Lv.' + g.level;
  $('g-coins').innerHTML = '<i class="coin"></i> ' + g.coins;
  $('g-xp').style.width = Math.min(100, (g.into / g.need) * 100) + '%';
  $('g-xpsub').textContent = `${g.into} / ${g.need} XP to next · ${(g.xp).toLocaleString('en-US')} total`;
  $('g-streak').textContent = (g.streak && g.streak.current) || 0;
  $('g-best').textContent = (g.streak && g.streak.best) || 0;
  const q = $('g-quest');
  q.innerHTML = '🎯 ' + (g.quest ? g.quest.text : '');
  q.classList.toggle('done', !!(g.quest && g.quest.done));
  $('g-badges').innerHTML = (g.achievements || [])
    .map((a) => `<div class="badge${a.unlocked ? ' on' : ''}" title="${a.name}">${a.emoji}</div>`)
    .join('');
  $('g-shop').innerHTML = (g.shop || [])
    .map((s) => `<div class="item" data-buy="${s.id}"><span class="ico">${s.emoji}</span><span class="nm">${s.name}</span><span class="c"><i class="coin"></i>${s.cost}</span></div>`)
    .join('');
  $('g-shop').querySelectorAll('.item').forEach((el) =>
    el.addEventListener('click', (e) => { e.stopPropagation(); window.pet.buy(el.dataset.buy); })
  );
});

// ---- tab switching ----
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    const which = tab.dataset.tab;
    ['limits', 'cost', 'activity', 'awards'].forEach((p) => {
      $('pane-' + p).hidden = p !== which;
    });
  });
});
// ---- chart token/$ toggle ----
function setChartMode(m) {
  chartMode = m;
  $('tg-tok').classList.toggle('on', m === 'tok');
  $('tg-cost').classList.toggle('on', m === 'cost');
  if (lastUsage) drawChart(lastUsage);
}
$('tg-tok').addEventListener('click', (e) => { e.stopPropagation(); setChartMode('tok'); });
$('tg-cost').addEventListener('click', (e) => { e.stopPropagation(); setChartMode('cost'); });

function setOpen(next) {
  open = next;
  bubble.classList.toggle('show', open);
  if (open) { baseMode = 'idle'; sitting = false; }
  window.pet.setPaused(open);
  if (open) window.pet.requestUsage();
}
window.pet.onDebugOpen(() => setOpen(true));
if (location.search.includes('debug')) {
  window.addEventListener('DOMContentLoaded', () => setOpen(true));
  setOpen(true);
}

// ---------------- drag + tap ----------------
// Press-and-move drags the window (main follows the cursor); a press that
// barely moves is reported back as a 'tap' by main, which toggles the bubble.
let dragging = false;
let down = false;

petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  down = true; dragging = true;
  petEl.classList.add('dragging');
  try { petEl.setPointerCapture(e.pointerId); } catch {}
  window.pet.setInteractive(true);
  window.pet.dragStart();
});
window.addEventListener('pointerup', () => {
  if (!down) return;
  down = false; dragging = false;
  petEl.classList.remove('dragging');
  window.pet.dragEnd();
});

window.pet.onTap(() => {
  jumpUntil = Date.now() + 460; // happy hop
  heartsBurst(3);
  window.pet.played(); // counts toward the daily 'play' quest
  setOpen(!open);
});

// Right-click the mascot or bubble -> control menu (Quit, Hide, etc.)
function showMenu(e) {
  e.preventDefault();
  window.pet.menu();
}
petEl.addEventListener('contextmenu', showMenu);
bubble.addEventListener('contextmenu', showMenu);

// ---------------- click-through hover ----------------
let hover = 0;
function enter() { hover++; window.pet.setInteractive(true); }
function leave() {
  if (down) return; // keep interactive while dragging
  hover = Math.max(0, hover - 1);
  if (hover === 0) window.pet.setInteractive(false);
}
petEl.addEventListener('mouseenter', enter);
petEl.addEventListener('mouseleave', leave);
bubble.addEventListener('mouseenter', enter);
bubble.addEventListener('mouseleave', leave);

applyTransform();
setFrame(F_IDLE);
