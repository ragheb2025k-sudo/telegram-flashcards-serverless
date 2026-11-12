// ---------------------------------------------------------------------------
// Card Flow (کارت‌فلو) bot — database schema (SQLite-backed, Drizzle-like DSL)
// NOTE: the runtime has PRAGMA foreign_keys OFF — integrity is enforced in
// application code (see lib/users.js and endpoints), never via FKs.
// ---------------------------------------------------------------------------
import { table, integer, text, real, index, sql } from 'sdk/db';

// One row per Telegram user who ever interacted with the bot / Mini App.
export const users = table('users', {
  tgId: integer('tg_id').primaryKey(),                    // Telegram user id
  lang: text('lang').notNull().default('en'),             // 'fa' | 'en'
  theme: text('theme').notNull().default('auto'),         // 'light' | 'dark' | 'auto'
  failBehavior: text('fail_behavior').notNull().default('house1'), // 'house1' | 'previous'
  dailyGoal: integer('daily_goal').notNull().default(20), // cards/day that ticks the daily chain
  uiFont: real('ui_font').notNull().default(1),           // UI/menu font scale (0.8 .. 1.6, 1 = default)
  cardFont: real('card_font').notNull().default(1),       // flashcard text font scale (0.8 .. 1.8, 1 = default)
  onboarded: integer('onboarded').notNull().default(0),   // 1 = first-run guide has been shown
  streak: integer('streak').notNull().default(0),         // consecutive days the DAILY GOAL was met
  lastStudyDate: text('last_study_date'),                 // 'YYYY-MM-DD' (UTC) of last answered card
  lastGoalDate: text('last_goal_date'),                   // 'YYYY-MM-DD' (UTC) of last goal-hit day
  todayDate: text('today_date'),                          // 'YYYY-MM-DD' (UTC) — day of todayCount
  todayCount: integer('today_count').notNull().default(0),// cards answered today (UTC)
  goalLog: text('goal_log'),                              // comma-sep 'YYYY-MM-DD' goal-hit days (last 60)
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  createdIdx: index('idx_users_created').on(t.createdAt),
}));

// A deck = a collection of cards with a display name + emoji.
export const decks = table('decks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),                   // = users.tgId
  name: text('name').notNull(),
  emoji: text('emoji').notNull().default('📚'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('idx_decks_user').on(t.userId),
}));

// A single flashcard with its spaced-repetition state.
// stability:  FSRS-6 memory stability S (days at which recall probability ≈ 90%)
// difficulty: FSRS-6 memory difficulty D (1 = easy .. 10 = hard)
// house:      1..5, derived from stability (Leitner-style display; 5 = mastered)
// ease:       legacy SM-2 multiplier (kept for old rows/backups; unused by FSRS)
// due:        unix seconds when the card should be reviewed next
export const cards = table('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckId: integer('deck_id').notNull(),
  userId: integer('user_id').notNull(),                   // = users.tgId (denormalized for fast queries)
  front: text('front').notNull(),
  back: text('back').notNull(),
  house: integer('house').notNull().default(1),
  ease: real('ease').notNull().default(1),
  stability: real('stability'),                           // FSRS-6 S in days; NULL = never studied with FSRS
  difficulty: real('difficulty'),                         // FSRS-6 D in [1,10]
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  due: integer('due', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastResult: integer('last_result'),                     // 1 = correct, 0 = wrong, NULL = never studied
  lastReview: integer('last_review', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  dueIdx: index('idx_cards_user_due').on(t.userId, t.due),
  deckIdx: index('idx_cards_deck').on(t.deckId),
}));
