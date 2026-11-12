// endpoints/createDeck.js
import { db } from 'sdk';
import { decks } from '../schema.js';
import { requireAccount, validateDeckName, validateEmoji, deckView } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const name = validateDeckName(input?.name);
  const emoji = validateEmoji(input?.emoji);
  const [deck] = await db.insert(decks)
    .values({ userId: user.tgId, name, emoji }).returning().run();
  return { deck: deckView(deck) };
}
