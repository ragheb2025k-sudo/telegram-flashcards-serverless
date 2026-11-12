// endpoints/answerCard.js — grade a card in a review session.
// input: { cardId, correct: boolean }
// Applies the SRS engine (lib/srs.js) with the user's fail behavior,
// updates the daily study streak, and returns the new state for the UI.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { cards, users } from '../schema.js';
import { requireAccount, ownCard, cardView } from '../lib/api-helpers.js';
import { nextDueSeconds, nextStreak } from '../lib/srs.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const card = await ownCard(user.tgId, input?.cardId);
  const correct = Boolean(input?.correct);
  const nowSec = Math.floor(Date.now() / 1000);

  const result = nextDueSeconds(card, correct, user.failBehavior, nowSec);
  const [row] = await db.update(cards).set({
    house: result.house,
    ease: result.ease,
    due: new Date(result.due * 1000),
    lastResult: correct ? 1 : 0,
    lastReview: new Date(nowSec * 1000),
    reps: card.reps + (correct ? 1 : 0),
    lapses: card.lapses + (correct ? 0 : 1),
  }).where(eq(cards.id, card.id)).returning().run();

  // streak bookkeeping (independent of the card state)
  const streakInfo = nextStreak(user.streak, user.lastStudyDate, nowSec);
  if (streakInfo.changed) {
    await db.update(users).set({
      streak: streakInfo.streak,
      lastStudyDate: streakInfo.lastDate,
    }).where(eq(users.tgId, user.tgId)).run();
  }

  return {
    card: cardView(row),
    moved: result.moved,          // 'up' | 'down' | 'stayed'
    requeue: result.requeue,      // missed → client should push it back into the session
    nextDue: result.due,
    relearnInMin: correct ? null : 10,
    streak: streakInfo.streak,
  };
}
