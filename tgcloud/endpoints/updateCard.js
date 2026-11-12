// endpoints/updateCard.js — edit a card's front/back.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { cards } from '../schema.js';
import { requireAccount, ownCard, validateCardText, cardView } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const card = await ownCard(user.tgId, input?.cardId);
  const { front, back } = validateCardText(
    input?.front != null ? input.front : card.front,
    input?.back != null ? input.back : card.back,
  );
  const [row] = await db.update(cards).set({ front, back })
    .where(eq(cards.id, card.id)).returning().run();
  return { card: cardView(row) };
}
