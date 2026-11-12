// endpoints/deleteMyData.js — GDPR-style "delete everything about me".
// Wipes ALL rows belonging to the authenticated user: cards, decks, account.
// The Mini App must confirm with the user before calling this endpoint.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users, decks, cards } from '../schema.js';
import { requireAccount } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const userId = user.tgId;

  const delCards = await db.delete(cards).where(eq(cards.userId, userId)).run();
  const delDecks = await db.delete(decks).where(eq(decks.userId, userId)).run();
  await db.delete(users).where(eq(users.tgId, userId)).run();

  return {
    ok: true,
    cardsDeleted: delCards?.changes ?? 0,
    decksDeleted: delDecks?.changes ?? 0,
  };
}
