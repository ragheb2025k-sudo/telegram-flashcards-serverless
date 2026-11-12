// endpoints/importDeck.js — create a deck from cards parsed client-side
// (file import via the Mini App: CSV/TSV/TXT/JSON read with FileReader).
// If a deck with the same name exists, cards are appended to it.
import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { decks, cards } from '../schema.js';
import { requireAccount, validateDeckName, validateEmoji } from '../lib/api-helpers.js';
import { LIMITS } from '../lib/parse.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const name = validateDeckName(input?.name);
  const emoji = validateEmoji(input?.emoji);
  const list = Array.isArray(input?.cards) ? input.cards : [];
  if (!list.length) return { deck: null, added: 0, skipped: 0 };
  if (list.length > LIMITS.maxCards) throw new Error('Too many cards (max 5000)');

  let deck = await db.select().from(decks)
    .where(and(eq(decks.userId, user.tgId), eq(decks.name, name))).get();
  if (!deck) {
    [deck] = await db.insert(decks)
      .values({ userId: user.tgId, name, emoji }).returning().run();
  }

  const existing = await db.select({ front: cards.front, back: cards.back })
    .from(cards).where(eq(cards.deckId, deck.id)).all();
  const known = new Set(existing.map((c) => `${c.front}\u0000${c.back}`));

  const rows = [];
  for (const item of list) {
    const front = String(item?.front ?? '').trim().slice(0, 1000);
    const back = String(item?.back ?? '').trim().slice(0, 4000);
    if (!front || !back) continue;
    const key = `${front}\u0000${back}`;
    if (known.has(key)) continue;
    known.add(key);
    rows.push({ deckId: deck.id, userId: user.tgId, front, back });
  }
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(cards).values(rows.slice(i, i + 200)).run();
  }
  return { deck: { id: deck.id, name: deck.name, emoji: deck.emoji }, added: rows.length, skipped: list.length - rows.length };
}
