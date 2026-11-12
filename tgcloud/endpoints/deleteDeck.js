// endpoints/deleteDeck.js — removes the deck and all of its cards.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { decks, cards } from '../schema.js';
import { requireAccount, ownDeck } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const deck = await ownDeck(user.tgId, input?.deckId);
  await db.delete(cards).where(eq(cards.deckId, deck.id)).run();  // children first (no FKs)
  await db.delete(decks).where(eq(decks.id, deck.id)).run();
  return { ok: true };
}
