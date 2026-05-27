'use strict';

const petEl = document.getElementById('pet');
const jetEl = document.getElementById('jet');
const bubble = document.getElementById('bubble');
const stage = document.getElementById('stage');

// sprite.png: 8 frames of 132px (0-3 walk, 4 idle, 5 blink, 6 jump, 7 sit).
const FW = 132;
const WALK = [0, 1, 2, 3];
const F_IDLE = 4, F_BLINK = 5, F_JUMP = 6, F_SIT = 7;

let open = false;
let baseMode = 'idle'; // 'idle' | 'walk' (driven by main)
let sitting = false;
let face = 1;
let scale = 0.45;
let wf = 0;
let jumpUntil = 0;
let jetMode = false;

function setFrame(i) { petEl.style.backgroundPositionX = -i * FW + 'px'; }
function applyTransform() { petEl.style.transform = `scaleX(${face * scale}) scaleY(${scale})`; }

function scaleForToday(today) {
  // smaller overall so the pet doesn't block the screen; still grows with usage
  const l = Math.log10(Math.max(today, 1));
  return Math.max(0.3, Math.min(0.62, 0.32 + ((l - 4) / 4) * 0.3));
}

// ---------------- animation ticker ----------------
let tick = 0;
setInterval(() => {
  tick++;
  if (jetMode) { jetEl.style.backgroundPositionX = (tick % 2 ? -264 : 0) + 'px'; return; }
  if (Date.now() < jumpUntil) { setFrame(F_JUMP); return; }
  if (baseMode === 'walk') {
    if (tick % 2 === 0) wf = (wf + 1) % WALK.length;
    setFrame(WALK[wf]);
    return;
  }
  if (sitting) { setFrame(F_SIT); return; }
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
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const $ = (id) => document.getElementById(id);

function colorFor(p) { return p >= 90 ? 'var(--bad)' : p >= 75 ? 'var(--warn)' : 'var(--ok)'; }

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
    $('status').textContent = 'live';
    planBar(1, 'Session (5h)', lastPlan.session);
    planBar(2, 'Weekly · all models', lastPlan.week);
    const so = lastPlan.weekSonnet;
    if (so && (so.util > 0 || so.resetsAt)) {
      $('blk3').style.display = '';
      $('lbl3').textContent = 'Weekly · Sonnet';
      $('fill3').style.width = Math.min(100, so.util) + '%';
      $('fill3').style.background = colorFor(so.util);
      $('reset3').textContent = resetLabel(so.resetsAt);
    } else $('blk3').style.display = 'none';
  } else if (d) {
    $('b1-title').textContent = 'Usage · local';
    $('status').textContent = planErr === 'no-token' ? 'login not found' : planErr ? 'plan API n/a' : '';
    localBar(1, 'Today', d.todayGrand, d.peakDay);
    localBar(2, 'This week', d.weekTotal, d.peakWeek);
    $('blk3').style.display = 'none';
  }

  if (!d) return;
  const maxV = Math.max(1, ...d.last7.map((x) => x.total));
  $('chart').innerHTML = d.last7
    .map((x, i) => {
      const h = Math.max(2, Math.round((x.total / maxV) * 36));
      const today = i === d.last7.length - 1;
      return `<div class="col${today ? ' today' : ''}" title="${x.day}: ${fmt(x.total)}"><div class="cbar" style="height:${h}px"></div><div class="dow">${DOW[x.dow]}</div></div>`;
    })
    .join('');
  $('foot').innerHTML = `<b>${fmt(d.grand)}</b> total · today <b>${fmt(d.todayGrand)}</b> · ${d.fileCount} sessions`;
  $('models').innerHTML = (d.models || [])
    .slice(0, 2)
    .map((x) => `<div class="m"><span>${shortModel(x.name)}</span><span class="mv">${fmt(x.total)}</span></div>`)
    .join('');

  scale = scaleForToday(d.todayGrand);
  applyTransform();
}

window.pet.onUsage((d) => { lastUsage = d; draw(); });
window.pet.onPlan((r) => {
  if (r && r.ok) { lastPlan = r.plan; planErr = null; }
  else { lastPlan = null; planErr = (r && r.error) || 'error'; }
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
  setOpen(!open);
});

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
