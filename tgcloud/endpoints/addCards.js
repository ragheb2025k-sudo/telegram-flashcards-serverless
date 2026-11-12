// endpoints/addCards.js — append manually-created (or client-parsed) cards
// to an existing deck. Duplicate front+back within the deck are skipped.
import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { decks, cards } from '../schema.js';
import { requireAccount, ownDeck, validateCardText } from '../lib/api-helpers.js';
import { LIMITS } from '../lib/parse.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const deck = await ownDeck(user.tgId, input?.deckId);
  const list = Array.isArray(input?.cards) ? input.cards : [];
  if (!list.length) return { added: 0, skipped: 0 };
  if (list.length > LIMITS.maxCards) throw new Error('Too many cards');

  const existing = await db.select({ front: cards.front, back: cards.back })
    .from(cards).where(eq(cards.deckId, deck.id)).all();
  const known = new Set(existing.map((c) => `${c.front}\u0000${c.back}`));

  const rows = [];
  for (const item of list) {
    const { front, back } = validateCardText(item?.front, item?.back);
    const key = `${front}\u0000${back}`;
    if (known.has(key)) continue;
    known.add(key);
    rows.push({ deckId: deck.id, userId: user.tgId, front, back });
  }
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(cards).values(rows.slice(i, i + 200)).run();
  }
  return { added: rows.length, skipped: list.length - rows.length };
}
