// endpoints/getReview.js — the study queue.
// input: { deckId?: number|null, ahead?: boolean, limit?: number }
//   deckId null/undefined → review across ALL decks
//   ahead=false → only cards due now; ahead=true → study ahead when nothing is due
// ordering: lower house first, then oldest due first — new cards mix in early,
// which matches the "short first interval" findings of spacing research.
import { db } from 'sdk';
import { eq, lte, and, asc } from 'sdk/db';
import { decks, cards } from '../schema.js';
import { requireAccount, cardView } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const userId = user.tgId;
  const now = Math.floor(Date.now() / 1000);  // where-clause params use raw unix seconds
  const limit = Math.min(200, Math.max(1, parseInt(input?.limit, 10) || 20));
  const ahead = Boolean(input?.ahead);

  let deckId = null;
  if (input?.deckId != null && input.deckId !== 'all') {
    const deck = await db.select().from(decks)
      .where(and(eq(decks.id, Number(input.deckId)), eq(decks.userId, userId))).get();
    if (!deck) return { cards: [], remaining: 0, deckId: null };
    deckId = deck.id;
  }

  const conds = [eq(cards.userId, userId)];
  if (deckId) conds.push(eq(cards.deckId, deckId));
  if (!ahead) conds.push(lte(cards.due, now));

  const rows = await db.select().from(cards)
    .where(and(...conds))
    .orderBy(asc(cards.house), asc(cards.due), asc(cards.id))
    .limit(limit)
    .all();

  const remaining = await db.$count(cards, and(...conds, lte(cards.due, now)));

  return {
    cards: rows.map(cardView),
    remaining,
    deckId,
  };
}
