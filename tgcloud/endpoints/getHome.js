// endpoints/getHome.js — everything the Mini App home screen needs:
// user settings, per-deck stats (total/due/mastered/new) and global totals.
import { db } from 'sdk';
import { eq, lte, count, and, asc } from 'sdk/db';
import { decks, cards } from '../schema.js';
import { requireAccount } from '../lib/api-helpers.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const userId = user.tgId;
  const now = Math.floor(Date.now() / 1000);  // where-clause params use raw unix seconds

  const deckRows = await db.select().from(decks)
    .where(eq(decks.userId, userId)).orderBy(asc(decks.id)).all();

  const deckStats = [];
  for (const d of deckRows) {
    const [totalRow] = await db.select({ n: count() }).from(cards)
      .where(eq(cards.deckId, d.id)).all();
    const [dueRow] = await db.select({ n: count() }).from(cards)
      .where(and(eq(cards.deckId, d.id), lte(cards.due, now))).all();
    const [masteredRow] = await db.select({ n: count() }).from(cards)
      .where(and(eq(cards.deckId, d.id), eq(cards.house, 5))).all();
    const [newRow] = await db.select({ n: count() }).from(cards)
      .where(and(eq(cards.deckId, d.id), eq(cards.reps, 0), eq(cards.lapses, 0))).all();
    deckStats.push({
      id: d.id,
      name: d.name,
      emoji: d.emoji,
      cards: totalRow?.n ?? 0,
      due: dueRow?.n ?? 0,
      mastered: masteredRow?.n ?? 0,
      fresh: newRow?.n ?? 0,
    });
  }

  const totals = deckStats.reduce((acc, d) => ({
    cards: acc.cards + d.cards,
    due: acc.due + d.due,
    mastered: acc.mastered + d.mastered,
  }), { cards: 0, due: 0, mastered: 0 });

  // daily goal / streak state (dates are UTC 'YYYY-MM-DD')
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = user.todayDate === today ? (user.todayCount || 0) : 0;
  const goalLog = String(user.goalLog || '').split(',').filter(Boolean);

  return {
    user: {
      lang: user.lang,
      theme: user.theme,
      failBehavior: user.failBehavior,
      streak: user.streak,
      dailyGoal: user.dailyGoal ?? 20,
      uiFont: Number(user.uiFont) || 1,
      cardFont: Number(user.cardFont) || 1,
      onboarded: Boolean(user.onboarded),
      todayCount,
      todayDate: today,
      lastGoalDate: user.lastGoalDate || null,
      goalLog,
      firstName: ctx.initData.user.first_name || '',
    },
    totals: { decks: deckStats.length, ...totals },
    decks: deckStats,
  };
}
