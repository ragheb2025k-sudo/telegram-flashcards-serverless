// ---------------------------------------------------------------------------
// lib/api-helpers.js — shared plumbing for Mini App endpoints:
//   • requireUser(ctx)  — verified Telegram user from platform init data
//   • ownDeck / ownCard — ownership checks (no FKs in the runtime → enforce here)
//   • serializers for decks/cards sent to the front-end
// ---------------------------------------------------------------------------
import { EndpointError } from 'sdk';
import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { users, decks, cards } from '../schema.js';
import { ensureUser } from './users.js';

export function requireUser(ctx) {
  const user = ctx?.initData?.user;
  if (!user || !user.id) {
    throw new EndpointError('Not authenticated', { code: 'UNAUTHORIZED' });
  }
  return user;
}

export async function requireAccount(ctx) {
  const tgUser = requireUser(ctx);
  const row = await ensureUser(tgUser);
  if (!row) throw new EndpointError('Account error', { code: 'NO_ACCOUNT' });
  return row;
}

export function bad(message, params = {}) {
  throw new EndpointError(message, params);
}

export async function ownDeck(userId, deckId) {
  const id = Number(deckId);
  if (!Number.isInteger(id)) bad('Invalid deck', { code: 'BAD_DECK' });
  const deck = await db.select().from(decks)
    .where(and(eq(decks.id, id), eq(decks.userId, userId))).get();
  if (!deck) bad('Deck not found', { code: 'NO_DECK' });
  return deck;
}

export async function ownCard(userId, cardId) {
  const id = Number(cardId);
  if (!Number.isInteger(id)) bad('Invalid card', { code: 'BAD_CARD' });
  const card = await db.select().from(cards)
    .where(and(eq(cards.id, id), eq(cards.userId, userId))).get();
  if (!card) bad('Card not found', { code: 'NO_CARD' });
  return card;
}

export function cardView(c) {
  return {
    id: c.id,
    deckId: c.deckId,
    front: c.front,
    back: c.back,
    house: c.house,
    ease: c.ease,
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    due: c.due instanceof Date ? Math.floor(c.due.getTime() / 1000) : c.due,
    lastResult: c.lastResult,
    isNew: c.reps === 0 && c.lapses === 0,
  };
}

export function deckView(d) {
  return { id: d.id, name: d.name, emoji: d.emoji, createdAt: d.createdAt };
}

export function validateCardText(front, back) {
  const f = String(front ?? '').trim();
  const b = String(back ?? '').trim();
  if (!f) bad('Front text is required', { code: 'NO_FRONT' });
  if (!b) bad('Back text is required', { code: 'NO_BACK' });
  if (f.length > 1000) bad('Front text too long (max 1000)', { code: 'FRONT_TOO_LONG' });
  if (b.length > 4000) bad('Back text too long (max 4000)', { code: 'BACK_TOO_LONG' });
  return { front: f, back: b };
}

export function validateDeckName(name) {
  const n = String(name ?? '').trim();
  if (!n) bad('Deck name is required', { code: 'NO_NAME' });
  if (n.length > 100) bad('Deck name too long (max 100)', { code: 'NAME_TOO_LONG' });
  return n;
}

export function validateEmoji(emoji, fallback = '📚') {
  const e = String(emoji ?? '').trim();
  return (e && [...e].length <= 4) ? e : fallback;
}
