// endpoints/answerCard.js — grade a card in a review session.
// input: { cardId, correct: boolean }
// Applies the FSRS-6 engine (lib/srs.js), updates the daily goal progress and
// the Duolingo-style streak, and returns the new state for the UI.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { cards, users } from '../schema.js';
import { requireAccount, ownCard, cardView } from '../lib/api-helpers.js';
import { nextDueSeconds, bumpDailyProgress } from '../lib/srs.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const card = await ownCard(user.tgId, input?.cardId);
  const correct = Boolean(input?.correct);
  const nowSec = Math.floor(Date.now() / 1000);

  const result = nextDueSeconds(card, correct, user.failBehavior, nowSec);
  const [row] = await db.update(cards).set({
    house: result.house,
    ease: card.ease ?? 1,                    // legacy column, frozen going forward
    stability: result.stability,
    difficulty: result.difficulty,
    due: new Date(result.due * 1000),
    lastResult: correct ? 1 : 0,
    lastReview: new Date(nowSec * 1000),
    reps: card.reps + (correct ? 1 : 0),
    lapses: card.lapses + (correct ? 0 : 1),
  }).where(eq(cards.id, card.id)).returning().run();

  // daily goal + streak bookkeeping (independent of the card state)
  const progress = bumpDailyProgress(user, nowSec);
  if (progress.todayDate !== user.todayDate || progress.todayCount !== user.todayCount
    || progress.streak !== user.streak || progress.lastGoalDate !== user.lastGoalDate
    || progress.goalLog !== (user.goalLog || '')) {
    await db.update(users).set({
      todayDate: progress.todayDate,
      todayCount: progress.todayCount,
      streak: progress.streak,
      lastGoalDate: progress.lastGoalDate,
      goalLog: progress.goalLog,
    }).where(eq(users.tgId, user.tgId)).run();
  }

  return {
    card: cardView(row),
    moved: result.moved,          // 'up' | 'down' | 'stayed'
    requeue: result.requeue,      // missed → client should push it back into the session
    nextDue: result.due,
    relearnInMin: correct ? null : 10,
    streak: progress.streak,
    todayCount: progress.todayCount,
    dailyGoal: user.dailyGoal ?? 20,
    goalJustMet: progress.goalJustMet,
  };
}
