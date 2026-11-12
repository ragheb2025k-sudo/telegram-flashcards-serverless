// endpoints/deleteCard.js
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { cards } from '../schema.js';
import { requireAccount, ownCard } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const card = await ownCard(user.tgId, input?.cardId);
  await db.delete(cards).where(eq(cards.id, card.id)).run();
  return { ok: true };
}
