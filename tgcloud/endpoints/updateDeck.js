// endpoints/updateDeck.js — rename a deck / change its emoji.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { decks } from '../schema.js';
import { requireAccount, ownDeck, validateDeckName, validateEmoji } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const deck = await ownDeck(user.tgId, input?.deckId);
  const patch = {};
  if (input?.name != null) patch.name = validateDeckName(input.name);
  if (input?.emoji != null) patch.emoji = validateEmoji(input.emoji, deck.emoji);
  if (!Object.keys(patch).length) return { deck: { id: deck.id, name: deck.name, emoji: deck.emoji } };
  const [row] = await db.update(decks).set(patch).where(eq(decks.id, deck.id))
    .returning().run();
  return { deck: { id: row.id, name: row.name, emoji: row.emoji } };
}
