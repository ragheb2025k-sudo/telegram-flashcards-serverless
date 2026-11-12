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
  return out;
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
