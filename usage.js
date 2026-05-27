'use strict';

// Scans ~/.claude/projects/**/*.jsonl and aggregates token usage from every
// assistant message. Parsing is incremental: each file's contribution is cached
// keyed by mtime+size, so a refresh only re-reads files that actually changed.

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// cache: filePath -> { sig, totals, models, daily, ids:Set }
const fileCache = new Map();

function emptyTotals() {
  return {
    input: 0,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
    messages: 0,
    cost: 0, // estimated USD at public API rates
  };
}

// Public Anthropic API prices (USD per million tokens). Used to estimate the
// "equivalent API cost" — on a subscription you don't actually pay this, it just
// shows how much value you'd have spent on the API.
const PRICING = {
  opus: { in: 15, out: 75, cw: 18.75, cr: 1.5 },
  sonnet: { in: 3, out: 15, cw: 3.75, cr: 0.3 },
  haiku: { in: 1, out: 5, cw: 1.25, cr: 0.1 },
  default: { in: 3, out: 15, cw: 3.75, cr: 0.3 },
};
function rateFor(model) {
  const m = String(model);
  if (/opus/.test(m)) return PRICING.opus;
  if (/sonnet/.test(m)) return PRICING.sonnet;
  if (/haiku/.test(m)) return PRICING.haiku;
  return PRICING.default;
}
function msgCost(model, inp, out, cc, cr) {
  const r = rateFor(model);
  return (inp * r.in + out * r.out + cc * r.cw + cr * r.cr) / 1e6;
}

function listJsonlFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonlFiles(full));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

function parseFile(filePath) {
  const totals = emptyTotals();
  const models = Object.create(null); // model -> totals
  const daily = Object.create(null); // YYYY-MM-DD -> totals
  const ids = new Set(); // message ids seen in this file (dedupe)
  let cwd = null; // working dir of this session (for per-project stats)

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { totals, models, daily, ids, cwd };
  }

  for (const line of content.split('\n')) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = obj && obj.message;
    if (!msg || typeof msg !== 'object') continue;
    const u = msg.usage;
    if (!u || typeof u !== 'object') continue;

    // Dedupe repeated streaming records of the same message within this file.
    const id = msg.id;
    if (id) {
      if (ids.has(id)) continue;
      ids.add(id);
    }

    if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;

    const inp = u.input_tokens || 0;
    const out = u.output_tokens || 0;
    const cc = u.cache_creation_input_tokens || 0;
    const cr = u.cache_read_input_tokens || 0;
    const model = msg.model || 'unknown';
    const cost = msgCost(model, inp, out, cc, cr);

    totals.input += inp;
    totals.output += out;
    totals.cacheCreate += cc;
    totals.cacheRead += cr;
    totals.cost += cost;
    totals.messages += 1;

    if (!models[model]) models[model] = emptyTotals();
    models[model].input += inp;
    models[model].output += out;
    models[model].cacheCreate += cc;
    models[model].cacheRead += cr;
    models[model].cost += cost;
    models[model].messages += 1;

    const ts = obj.timestamp;
    if (ts) {
      const day = localDay(new Date(ts)); // bucket by the user's local day
      if (!daily[day]) daily[day] = emptyTotals();
      daily[day].input += inp;
      daily[day].output += out;
      daily[day].cacheCreate += cc;
      daily[day].cacheRead += cr;
      daily[day].cost += cost;
      daily[day].messages += 1;
    }
  }
  return { totals, models, daily, ids, cwd };
}

function mergeTotals(dst, src) {
  dst.cost += src.cost || 0;
  dst.input += src.input;
  dst.output += src.output;
  dst.cacheCreate += src.cacheCreate;
  dst.cacheRead += src.cacheRead;
  dst.messages += src.messages;
}

function collectUsage() {
  const files = listJsonlFiles(PROJECTS_DIR);
  const seen = new Set(files);

  // Drop cache entries for files that no longer exist.
  for (const key of [...fileCache.keys()]) {
    if (!seen.has(key)) fileCache.delete(key);
  }

  for (const fp of files) {
    let stat;
    try {
      stat = fs.statSync(fp);
    } catch {
      continue;
    }
    const sig = `${stat.mtimeMs}:${stat.size}`;
    const cached = fileCache.get(fp);
    if (cached && cached.sig === sig) continue;
    const parsed = parseFile(fp);
    fileCache.set(fp, { sig, ...parsed });
  }

  // Aggregate across all cached files.
  const totals = emptyTotals();
  const models = Object.create(null);
  const daily = Object.create(null);

  const projects = Object.create(null); // cwd -> { tokens, cost }
  for (const { totals: t, models: m, daily: d, cwd } of fileCache.values()) {
    mergeTotals(totals, t);
    for (const [model, mt] of Object.entries(m)) {
      if (!models[model]) models[model] = emptyTotals();
      mergeTotals(models[model], mt);
    }
    for (const [day, dt] of Object.entries(d)) {
      if (!daily[day]) daily[day] = emptyTotals();
      mergeTotals(daily[day], dt);
    }
    if (cwd) {
      if (!projects[cwd]) projects[cwd] = { tokens: 0, cost: 0 };
      projects[cwd].tokens += t.input + t.output + t.cacheCreate + t.cacheRead;
      projects[cwd].cost += t.cost || 0;
    }
  }

  const grand =
    totals.input + totals.output + totals.cacheCreate + totals.cacheRead;

  // Grand total + cost per local day.
  const dayGrand = Object.create(null);
  const dayCost = Object.create(null);
  for (const [day, t] of Object.entries(daily)) {
    dayGrand[day] = t.input + t.output + t.cacheCreate + t.cacheRead;
    dayCost[day] = t.cost || 0;
  }

  const now = new Date();
  const todayKey = localDay(now);
  const todayGrand = dayGrand[todayKey] || 0;

  // Last 7 local days (oldest -> newest), for the bar chart + weekly totals.
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = localDay(d);
    last7.push({ day: k, dow: d.getDay(), total: dayGrand[k] || 0, cost: dayCost[k] || 0 });
  }
  const weekTotal = last7.reduce((s, x) => s + x.total, 0);

  // Cost over ranges (sum the daily cost buckets).
  let weekCost = 0, cost30 = 0, tok30 = 0, msg30 = 0;
  for (let i = 0; i < 30; i++) {
    const k = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    cost30 += dayCost[k] || 0;
    tok30 += dayGrand[k] || 0;
    if (daily[k]) msg30 += daily[k].messages;
    if (i < 7) weekCost += dayCost[k] || 0;
  }

  // ---- streak: consecutive days with any usage (real, from logs) ----
  const used = (k) => (dayGrand[k] || 0) > 0;
  const dayKeyBack = (i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
  let curStreak = 0;
  for (let i = used(todayKey) ? 0 : 1; ; i++) {
    if (used(dayKeyBack(i))) curStreak++;
    else break;
  }
  // best streak across all recorded days
  const allDays = Object.keys(dayGrand).filter((k) => dayGrand[k] > 0).sort();
  let bestStreak = 0, run = 0, prev = null;
  for (const k of allDays) {
    const t = new Date(k + 'T00:00:00').getTime();
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = t;
  }

  // Top project by tokens.
  let topProject = null;
  for (const [cwd, p] of Object.entries(projects)) {
    if (!topProject || p.tokens > topProject.tokens) {
      topProject = { name: cwd.split('/').filter(Boolean).pop() || cwd, tokens: p.tokens, cost: p.cost };
    }
  }

  // Real reference points from the user's own history (no invented quota):
  // busiest single day in the last 30 days, busiest rolling 7-day window in 9 weeks.
  const series = [];
  for (let i = 0; i < 66; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    series.push(dayGrand[localDay(d)] || 0); // index 0 = today, increasing = older
  }
  const peakDay = Math.max(0, ...series.slice(0, 30));
  let peakWeek = 0;
  for (let i = 0; i + 7 <= series.length; i++) {
    let s = 0;
    for (let j = 0; j < 7; j++) s += series[i + j];
    if (s > peakWeek) peakWeek = s;
  }

  // Top models by grand total tokens.
  const modelList = Object.entries(models)
    .map(([name, t]) => ({
      name,
      total: t.input + t.output + t.cacheCreate + t.cacheRead,
      ...t,
    }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  const todayTotals = daily[todayKey] || emptyTotals();

  return {
    grand,
    totals,
    todayGrand,
    today: todayTotals,
    last7,
    weekTotal,
    peakDay,
    peakWeek,
    limits: readLimits(), // real, user-provided plan limits (or nulls)
    models: modelList,
    fileCount: files.length,
    // --- cost (estimated USD at API rates) ---
    cost: {
      total: totals.cost,
      today: todayTotals.cost || 0,
      week: weekCost,
      last30: cost30,
    },
    // --- activity stats ---
    stats: {
      messages: totals.messages,
      sessions: files.length,
      topProject, // { name, tokens, cost } or null
      tokens30: tok30,
      messages30: msg30,
      activeDays: allDays.length,
    },
    streak: { current: curStreak, best: bestStreak },
    updatedAt: Date.now(),
  };
}

// Local YYYY-MM-DD for the machine's timezone.
function localDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Optional real plan limits the user copies from `/usage` into a config file.
// Nothing is invented — if the file/keys are absent, limits stay null.
const CONFIG_PATH = path.join(os.homedir(), '.config', 'claude-usage-pet.json');
function readLimits() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const num = (v) => (typeof v === 'number' && v > 0 ? v : null);
    return { daily: num(cfg.dailyLimit), weekly: num(cfg.weeklyLimit) };
  } catch {
    return { daily: null, weekly: null };
  }
}

module.exports = { collectUsage, PROJECTS_DIR, CONFIG_PATH };
