// ---------------------------------------------------------------------------
// lib/backup.js — build & restore full-account backups (ZIP or JSON).
// ZIP layout:
//   flashcards.json     — complete data: settings + decks + full SRS state
//   decks/<name>.csv    — human-readable front,back per deck
//   README.txt          — bilingual notes
// ---------------------------------------------------------------------------
import { zipCreate, zipFind } from './zip.js';
import { toCsv } from './csv.js';
import { parseBackupJson } from './parse.js';
import { db } from 'sdk';
import { eq, asc } from 'sdk/db';
import { users, decks, cards } from '../schema.js';

const enc = new TextEncoder();

export async function loadAccount(userId) {
  const user = await db.select().from(users).where(eq(users.tgId, userId)).get();
  const deckRows = await db.select().from(decks)
    .where(eq(decks.userId, userId)).orderBy(asc(decks.id)).all();
  const cardRows = await db.select().from(cards)
    .where(eq(cards.userId, userId)).orderBy(asc(cards.id)).all();

  const byDeck = new Map();
  for (const c of cardRows) {
    if (!byDeck.has(c.deckId)) byDeck.set(c.deckId, []);
    byDeck.get(c.deckId).push(c);
  }

  const deckList = deckRows.map((d) => ({
    name: d.name,
    emoji: d.emoji,
    cards: (byDeck.get(d.id) || []).map((c) => ({
      front: c.front, back: c.back, house: c.house, ease: c.ease,
      reps: c.reps, lapses: c.lapses, due: c.due, lastResult: c.lastResult,
    })),
  }));
  return {
    user,
    settings: user ? {
      lang: user.lang, theme: user.theme, failBehavior: user.failBehavior,
    } : null,
    decks: deckList,
    cardCount: cardRows.length,
  };
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 60) || 'deck';
}

export function buildBackupZip(account) {
  const json = JSON.stringify({
    app: 'flashcards-telegram-serverless',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: account.settings,
    decks: account.decks,
  }, null, 2);

  const files = [{ name: 'flashcards.json', data: enc.encode(json) }];
  const used = new Set();
  for (const d of account.decks) {
    let base = safeName(d.name);
    let n = 1;
    while (used.has(base + '.csv')) base = safeName(d.name) + '_' + (++n);
    used.add(base + '.csv');
    const rows = [['front', 'back'], ...d.cards.map((c) => [c.front, c.back])];
    files.push({ name: `decks/${base}.csv`, data: enc.encode(toCsv(rows)) });
  }
  files.push({ name: 'README.txt', data: enc.encode(
    'FlashCards backup (Telegram Serverless bot)\n' +
    'پشتیبان فلش‌کارت (بات تلگرام)\n\n' +
    'flashcards.json — full data (restore: send this ZIP or the JSON back to the bot)\n' +
    'فایل کامل داده‌ها (برای بازیابی همین ZIP یا فایل JSON را به بات بفرستید)\n' +
    'decks/*.csv — human-readable copies of each deck\n' +
    'رونوشت خوانا برای انسان از هر دسته\n'
  ) });

  const stamp = new Date().toISOString().slice(0, 10);
  return { bytes: zipCreate(files), filename: `flashcards-backup-${stamp}.zip`, json };
}

// Restore decks (and optionally settings) for a user from backup JSON text.
// Existing decks with the same name are kept; cards not already present
// (matched by front+back) are added with their stored SRS state.
export async function restoreFromJsonText(userId, text) {
  const backup = parseBackupJson(text);
  let cardsAdded = 0, decksCreated = 0;

  const existingDecks = await db.select().from(decks).where(eq(decks.userId, userId)).all();
  const existingCards = await db.select().from(cards).where(eq(cards.userId, userId)).all();
  const cardKey = (deckId, f, b) => `${deckId}\u0000${f}\u0000${b}`;
  const known = new Set(existingCards.map((c) => cardKey(c.deckId, c.front, c.back)));

  for (const deck of backup.decks) {
    let deckId = existingDecks.find((d) => d.name === deck.name)?.id;
    if (!deckId) {
      const [row] = await db.insert(decks)
        .values({ userId, name: deck.name, emoji: deck.emoji })
        .returning().run();
      deckId = row.id;
      decksCreated++;
    }
    const toAdd = [];
    for (const c of deck.cards) {
      const key = cardKey(deckId, c.front, c.back);
      if (known.has(key)) continue;
      known.add(key);
      toAdd.push({
        deckId, userId,
        front: c.front, back: c.back,
        house: c.house, ease: c.ease, reps: c.reps, lapses: c.lapses,
        due: new Date(c.due * 1000), lastResult: c.lastResult,
      });
    }
    if (toAdd.length) {
      // chunk inserts (SQLite variable limit: rows × columns)
      for (let i = 0; i < toAdd.length; i += 200) {
        await db.insert(cards).values(toAdd.slice(i, i + 200)).run();
      }
      cardsAdded += toAdd.length;
    }
  }
  return { decksCreated, cardsAdded, settings: backup.settings };
}

// Restore from uploaded bytes: accepts our ZIP (reads flashcards.json) or raw JSON.
export async function restoreFromBytes(userId, bytes, filename = '') {
  const lower = (filename || '').toLowerCase();
  let text = null;
  if (lower.endsWith('.zip')) {
    const entry = zipFind(bytes, 'flashcards.json');
    if (!entry) throw new Error('NOT_BACKUP');
    text = new TextDecoder().decode(entry.data);
  } else if (lower.endsWith('.json') || !lower) {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!text.trim().startsWith('{')) throw new Error('NOT_BACKUP');
  } else {
    throw new Error('NOT_BACKUP');
  }
  return restoreFromJsonText(userId, text);
}
