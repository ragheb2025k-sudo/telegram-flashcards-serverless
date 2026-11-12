// endpoints/resetDeckProgress.js — back to square one: every card returns to
// house 1 with default ease and is due immediately.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { cards } from '../schema.js';
import { requireAccount, ownDeck } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const deck = await ownDeck(user.tgId, input?.deckId);
  await db.update(cards).set({
    house: 1, ease: 1, reps: 0, lapses: 0, lastResult: null,
    due: new Date(), lastReview: null,
  }).where(eq(cards.deckId, deck.id)).run();
  return { ok: true };
}
