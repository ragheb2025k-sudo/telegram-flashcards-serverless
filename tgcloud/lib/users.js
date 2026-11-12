// ---------------------------------------------------------------------------
// lib/users.js — user account helpers shared by handlers and endpoints.
// ---------------------------------------------------------------------------
import { db } from 'sdk';
import { eq, and, lte, count } from 'sdk/db';
import { users, decks, cards } from '../schema.js';
import { detectLang } from './i18n.js';

export const LANGS = ['fa', 'en'];
export const THEMES = ['light', 'dark', 'auto'];
export const FAIL_BEHAVIORS = ['house1', 'previous'];
export const GOAL_MIN = 1;
export const GOAL_MAX = 500;
export const DEFAULT_GOAL = 20;
export const FONT_MIN = 0.8;
export const FONT_MAX = 1.8;
export const FONT_DEFAULT = 1;

// Fetch (or lazily create) the account row for a Telegram user.
export async function ensureUser(from) {
  const tgId = from.id;
  const existing = await db.select().from(users).where(eq(users.tgId, tgId)).get();
  if (existing) return existing;
  const [created] = await db.insert(users)
    .values({ tgId, lang: detectLang(from) })
    .onConflictDoNothing()
    .returning()
    .run();
  if (created) return created;
  return db.select().from(users).where(eq(users.tgId, tgId)).get();
}

export function normalizeSettings(patch = {}) {
  const out = {};
  if (LANGS.includes(patch.lang)) out.lang = patch.lang;
  if (THEMES.includes(patch.theme)) out.theme = patch.theme;
  if (FAIL_BEHAVIORS.includes(patch.failBehavior)) out.failBehavior = patch.failBehavior;
  if (patch.dailyGoal != null && patch.dailyGoal !== '') {
    const n = Number(patch.dailyGoal);
    if (Number.isFinite(n)) out.dailyGoal = Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(n)));
  }
  for (const k of ['uiFont', 'cardFont']) {
    if (patch[k] != null && patch[k] !== '') {
      const n = Number(patch[k]);
      if (Number.isFinite(n)) out[k] = Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, n)) * 100) / 100;
    }
  }
  if (patch.onboarded != null) out.onboarded = patch.onboarded ? 1 : 0;
  return out;
}

export function settingsView(row) {
  return {
    lang: row.lang,
    theme: row.theme,
    failBehavior: row.failBehavior,
    dailyGoal: row.dailyGoal ?? DEFAULT_GOAL,
    uiFont: Number(row.uiFont) || FONT_DEFAULT,
    cardFont: Number(row.cardFont) || FONT_DEFAULT,
    onboarded: Boolean(row.onboarded),
    streak: row.streak,
    todayCount: row.todayCount ?? 0,
    goalJustMet: false,
  };
}

export async function saveUserSettings(tgId, patch) {
  const clean = normalizeSettings(patch);
  if (!Object.keys(clean).length) return null;
  const [row] = await db.update(users).set(clean).where(eq(users.tgId, tgId))
    .returning().run();
  return row;
}

// Aggregate stats for a user (used by the Mini App home screen and /stats).
export async function userStats(tgId) {
  const deckRows = await db.select().from(decks).where(eq(decks.userId, tgId)).all();
  const now = Math.floor(Date.now() / 1000);  // where-clause params use raw unix seconds
  const [totals] = await db.select({ total: count() })
    .from(cards).where(eq(cards.userId, tgId)).all();
  const [dueRow] = await db.select({ due: count() })
    .from(cards).where(and(eq(cards.userId, tgId), lte(cards.due, now))).all();
  const [masteredRow] = await db.select({ mastered: count() })
    .from(cards).where(and(eq(cards.userId, tgId), eq(cards.house, 5))).all();

  return {
    decks: deckRows.length,
    cards: totals?.total ?? 0,
    due: dueRow?.due ?? 0,
    mastered: masteredRow?.mastered ?? 0,
  };
}
