'use strict';

// Pure gamification logic. State (coins/feeds/unlocked/quest) is persisted by
// main.js; here we just compute level, XP, achievements and quests from a
// context object built from real usage + that saved state.

function levelFromXp(xp) {
  let level = 1, need = 200, into = Math.max(0, xp);
  while (into >= need) { into -= need; level++; need = Math.round(need * 1.4); }
  return { level, into: Math.round(into), need };
}

// XP is driven mostly by real token usage, plus care + streak + unlocks.
function computeXp(c) {
  return Math.floor((c.grand || 0) / 1e6) // 1 XP per 1M tokens
    + (c.feeds || 0) * 40
    + (c.bestStreak || 0) * 120
    + (c.unlocked || 0) * 150;
}

const ACHIEVEMENTS = [
  { id: 'firstbite', name: 'First Bite', emoji: '🍪', test: (c) => c.feeds >= 1 },
  { id: 'caretaker', name: 'Caretaker', emoji: '💛', test: (c) => c.feeds >= 50 },
  { id: 'streak7', name: 'Week Warrior', emoji: '🔥', test: (c) => c.bestStreak >= 7 },
  { id: 'streak30', name: 'Unstoppable', emoji: '⚡', test: (c) => c.bestStreak >= 30 },
  { id: 'b1', name: 'Billionaire', emoji: '💎', test: (c) => c.grand >= 1e9 },
  { id: 'b5', name: 'Token Tycoon', emoji: '👑', test: (c) => c.grand >= 5e9 },
  { id: 'mixer', name: 'Model Mixer', emoji: '🎛️', test: (c) => c.models >= 2 },
  { id: 'century', name: 'Centurion', emoji: '💯', test: (c) => c.sessions >= 100 },
  { id: 'regular', name: 'Regular', emoji: '📅', test: (c) => c.activeDays >= 30 },
  { id: 'jet', name: 'Jet Setter', emoji: '✈️', test: (c) => c.rodeJet },
  { id: 'cyclist', name: 'Cyclist', emoji: '🚲', test: (c) => c.rodeBike },
  { id: 'lvl10', name: 'Level 10', emoji: '🌟', test: (c) => c.level >= 10 },
];

function evalAchievements(c) {
  return ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, unlocked: !!a.test(c) }));
}

// daily quest (rotates by day-of-year)
const QUESTS = [
  { id: 'feed', text: 'Feed Clawd today 🍪' },
  { id: 'code', text: 'Use Claude Code today 💻' },
  { id: 'play', text: 'Tap Clawd to play 🎮' },
];
function questForDay(dayKey) {
  let h = 0;
  for (const ch of dayKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return QUESTS[h % QUESTS.length];
}

// shop items: spend coins, restore the pet
const SHOP = [
  { id: 'treat', name: 'Treat', emoji: '🍪', cost: 20, hunger: -45, energy: 10 },
  { id: 'drink', name: 'Energy Drink', emoji: '⚡', cost: 30, hunger: 0, energy: 100 },
  { id: 'feast', name: 'Big Feast', emoji: '🍱', cost: 50, hunger: -100, energy: 100 },
];

module.exports = { levelFromXp, computeXp, evalAchievements, ACHIEVEMENTS, questForDay, SHOP };
