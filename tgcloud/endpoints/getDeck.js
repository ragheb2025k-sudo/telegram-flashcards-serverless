// endpoints/getDeck.js — a single deck with all of its cards (management view).
import { db } from 'sdk';
import { eq, asc } from 'sdk/db';
import { cards } from '../schema.js';
import { requireAccount, ownDeck, cardView } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const deck = await ownDeck(user.tgId, input?.deckId);
  const rows = await db.select().from(cards)
    .where(eq(cards.deckId, deck.id)).orderBy(asc(cards.id)).all();
  return {
    deck: { id: deck.id, name: deck.name, emoji: deck.emoji },
    cards: rows.map(cardView),
  };
}
