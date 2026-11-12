// ---------------------------------------------------------------------------
// FlashCards bot — database schema (SQLite-backed, Drizzle-like DSL)
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
  streak: integer('streak').notNull().default(0),         // consecutive study days
  lastStudyDate: text('last_study_date'),                 // 'YYYY-MM-DD' (UTC) of last answered card
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
// house: 1..5 (Leitner boxes) — 5 = mastered
// ease:  adaptive multiplier (0.6 .. 1.45), SM-2 inspired
// due:   unix seconds when the card should be reviewed next
export const cards = table('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckId: integer('deck_id').notNull(),
  userId: integer('user_id').notNull(),                   // = users.tgId (denormalized for fast queries)
  front: text('front').notNull(),
  back: text('back').notNull(),
  house: integer('house').notNull().default(1),
  ease: real('ease').notNull().default(1),
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
