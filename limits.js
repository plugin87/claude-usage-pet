'use strict';

// Fetches the REAL plan usage limits the same way `/usage` does: it reads the
// Claude Code OAuth token from the macOS Keychain and calls the oauth usage
// endpoint. Everything stays local — the token is only used to read your own
// usage and is never logged or sent anywhere else.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const PROFILE = 'https://api.anthropic.com/api/oauth/profile';

// Friendly plan label from the profile, e.g. "Max 5x", "Pro", "Team".
function planNameFrom(p) {
  if (!p) return null;
  const org = p.organization || {};
  const acc = p.account || {};
  const tier = String(org.rate_limit_tier || '');
  const mult = (tier.match(/(\d+)x/) || [])[1];
  let base = null;
  if (/max/i.test(tier) || org.organization_type === 'claude_max' || acc.has_claude_max) base = 'Max';
  else if (/pro/i.test(tier) || org.organization_type === 'claude_pro' || acc.has_claude_pro) base = 'Pro';
  else if (/team/i.test(tier) || org.organization_type === 'claude_team') base = 'Team';
  else if (/enterprise/i.test(tier) || org.organization_type === 'claude_enterprise') base = 'Enterprise';
  if (base === 'Max' && mult) return `Max ${mult}x`;
  return base;
}

function tokenFrom(text) {
  try {
    const j = JSON.parse(text);
    const o = j.claudeAiOauth || j;
    return o.accessToken || null;
  } catch {
    return null;
  }
}

// Windows / Linux (and sometimes macOS) keep the OAuth creds in a JSON file.
function readTokenFile() {
  for (const p of [
    path.join(os.homedir(), '.claude', '.credentials.json'),
    path.join(os.homedir(), '.claude', 'credentials.json'),
  ]) {
    try {
      return tokenFrom(fs.readFileSync(p, 'utf8'));
    } catch {
      /* next */
    }
  }
  return null;
}

// macOS keeps them in the login Keychain.
function readTokenKeychain() {
  return new Promise((resolve) => {
    execFile(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 8000 },
      (err, stdout) => resolve(err ? null : tokenFrom(stdout))
    );
  });
}

async function readToken() {
  const fromFile = readTokenFile();
  if (fromFile) return fromFile;
  if (process.platform === 'darwin') return readTokenKeychain();
  return null;
}

// Returns { ok, plan } or { ok:false, error }.
async function fetchLimits() {
  const token = await readToken();
  if (!token) return { ok: false, error: 'no-token' };
  const headers = {
    Authorization: 'Bearer ' + token,
    'anthropic-beta': 'oauth-2025-04-20',
    'Content-Type': 'application/json',
  };
  const get = (url) => fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  try {
    // usage = the limits; profile = the plan name (run together)
    const [res, profRes] = await Promise.all([get(ENDPOINT), get(PROFILE).catch(() => null)]);
    if (!res.ok) return { ok: false, error: 'http-' + res.status };
    const j = await res.json();
    const pick = (o) =>
      o && typeof o.utilization === 'number'
        ? { util: o.utilization, resetsAt: o.resets_at || null }
        : null;

    let planName = null;
    let account = null;
    if (profRes && profRes.ok) {
      try {
        const pj = await profRes.json();
        planName = planNameFrom(pj);
        const a = pj.account || {};
        const o = pj.organization || {};
        account = {
          name: a.display_name || a.full_name || null,
          email: a.email || null,
          since: o.subscription_created_at || a.created_at || null,
          status: o.subscription_status || null,
        };
      } catch {
        /* ignore */
      }
    }

    const eu = j.extra_usage;
    const extra =
      eu && eu.is_enabled
        ? {
            util: typeof eu.utilization === 'number' ? eu.utilization : null,
            used: eu.used_credits,
            limit: eu.monthly_limit,
            currency: eu.currency || '',
          }
        : null;

    return {
      ok: true,
      plan: {
        session: pick(j.five_hour), // current 5-hour session
        week: pick(j.seven_day), // weekly, all models
        weekSonnet: pick(j.seven_day_sonnet),
        weekOpus: pick(j.seven_day_opus),
        extra, // monthly overage spend, only when enabled
        planName, // e.g. "Max 5x"
        account, // { name, email, since, status }
        fetchedAt: Date.now(),
      },
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { fetchLimits };
