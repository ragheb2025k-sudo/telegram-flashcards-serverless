// ---------------------------------------------------------------------------
// handlers/message.js — reacts to every incoming message:
//   • bot commands: /start /open /new /help /backup /stats /lang
//   • document uploads: flashcard imports (CSV/TSV/TXT/JSON) and backups
//     (ZIP / JSON restore)
//   • any other text: a short hint pointing to the Mini App
// ---------------------------------------------------------------------------
import { api, BotApiError, InputFile } from 'sdk';
import { ensureUser, saveUserSettings, userStats } from '../lib/users.js';
import { t, esc, openKeyboard, langKeyboard, supportKeyboard, deleteConfirmKeyboard } from '../lib/i18n.js';
import { parseImportFile } from '../lib/parse.js';
import { loadAccount, buildBackupZip, restoreFromBytes } from '../lib/backup.js';
import { allow } from '../lib/ratelimit.js';
import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { decks, cards } from '../schema.js';

const OPEN_RE = /^\/(start|open)(@\w+)?$/i;

async function sendOpenScreen(chatId, lang) {
  await api.sendMessage({
    chat_id: chatId,
    text: t(lang, 'welcome'),
    parse_mode: 'HTML',
    reply_markup: openKeyboard(lang),
  });
}

async function importDocument(user, msg, doc) {
  const chatId = msg.chat.id;
  const lang = user.lang;
  const name = doc.file_name || 'file';
  await api.sendMessage({ chat_id: chatId, text: t(lang, 'fileReceived', { name: esc(name) }), parse_mode: 'HTML' });

  const bytes = await api.getFileContent(doc.file_id);
  const isBackup = /\.zip$|\.json$/i.test(name) && doc.file_size < 512 * 1024
    && !/\.(csv|tsv|txt|md)$/i.test(name);

  if (isBackup) {
    // restore path — but only if the payload really is our backup format
    try {
      const result = await restoreFromBytes(user.tgId, bytes, name);
      if (result.decksCreated === 0 && result.cardsAdded === 0) {
        await api.sendMessage({ chat_id: chatId, text: t(lang, 'restoreFail'), parse_mode: 'HTML' });
        return;
      }
      await api.sendMessage({
        chat_id: chatId,
        text: t(lang, 'restoreDone', { decks: result.decksCreated, cards: result.cardsAdded }),
        parse_mode: 'HTML',
        reply_markup: openKeyboard(lang),
      });
    } catch (e) {
      if (String(e?.message || e).startsWith('NOT_BACKUP')) {
        // A .json that is actually a card list? Try the import path instead.
        await tryImport(user, chatId, bytes, name, msg);
        return;
      }
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'restoreFail'), parse_mode: 'HTML' });
    }
    return;
  }
  await tryImport(user, chatId, bytes, name, msg);
}

async function tryImport(user, chatId, bytes, name, msg) {
  const lang = user.lang;
  try {
    const { cards: parsed } = parseImportFile(bytes, name);
    if (!parsed.length) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'importNone'), parse_mode: 'HTML' });
      return;
    }
    const deckName = (msg.caption || '').trim()
      || name.replace(/\.[a-z0-9]+$/i, '').trim()
      || (lang === 'fa' ? 'دستهٔ جدید' : 'New deck');

    // If a deck with this name already exists, append to it; otherwise create it.
    let deck = await db.select().from(decks)
      .where(and(eq(decks.userId, user.tgId), eq(decks.name, deckName))).get();
    if (deck) {
      await db.insert(cards).values(parsed.map((c) => ({
        deckId: deck.id, userId: user.tgId, front: c.front, back: c.back,
      }))).run();
      await api.sendMessage({
        chat_id: chatId,
        text: t(lang, 'importAdded', { deck: esc(deck.name), count: parsed.length }),
        parse_mode: 'HTML',
        reply_markup: openKeyboard(lang),
      });
    } else {
      [deck] = await db.insert(decks)
        .values({ userId: user.tgId, name: deckName.slice(0, 100), emoji: guessEmoji(name) })
        .returning().run();
      await db.insert(cards).values(parsed.map((c) => ({
        deckId: deck.id, userId: user.tgId, front: c.front, back: c.back,
      }))).run();
      await api.sendMessage({
        chat_id: chatId,
        text: t(lang, 'importDone', { deck: esc(deck.name), count: parsed.length }),
        parse_mode: 'HTML',
        reply_markup: openKeyboard(lang),
      });
    }
  } catch (e) {
    const reason = String(e?.message || e);
    if (reason === 'TOO_BIG') {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'importTooBig'), parse_mode: 'HTML' });
    } else if (reason === 'BAD_FORMAT') {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'badFile'), parse_mode: 'HTML' });
    } else {
      await api.sendMessage({
        chat_id: chatId,
        text: t(lang, 'parseError', { reason: esc(reason.slice(0, 120)) }),
        parse_mode: 'HTML',
      });
    }
  }
}

function guessEmoji(name) {
  const n = name.toLowerCase();
  if (/lang|vocab|word|واژ|لغت|کلمه/.test(n)) return '🗣';
  if (/bio|med|anat|زیست|پزشک|آناتوم/.test(n)) return '🧬';
  if (/math|ریاض/.test(n)) return '📐';
  if (/hist|تاریخ/.test(n)) return '🏛';
  return '📚';
}

async function sendBackup(user, chatId) {
  const lang = user.lang;
  const account = await loadAccount(user.tgId);
  if (!account.cardCount) {
    await api.sendMessage({ chat_id: chatId, text: t(lang, 'backupEmpty') });
    return;
  }
  try {
    const { bytes, filename } = buildBackupZip(account);
    await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(bytes, filename, { type: 'application/zip' }),
      caption: t(lang, 'backupDone'),
      parse_mode: 'HTML',
      reply_markup: openKeyboard(lang),
    });
  } catch (e) {
    console.error('backup failed', e);
    await api.sendMessage({ chat_id: chatId, text: t(lang, 'backupFail') });
  }
}

async function sendStats(user, chatId) {
  const s = await userStats(user.tgId);
  await api.sendMessage({
    chat_id: chatId,
    text: t(user.lang, 'stats', s),
    parse_mode: 'HTML',
    reply_markup: openKeyboard(user.lang),
  });
}

export default async function (message) {
  const from = message.from;
  if (!from || from.is_bot) return;
  const user = await ensureUser(from);
  const lang = user.lang;
  const chatId = message.chat.id;
  const text = message.text || '';

  // --- anti-flood: per-user throttle (30 msgs/min; documents are heavier → 6/min)
  const heavy = Boolean(message.document);
  if (!allow(from.id, heavy ? 6 : 30, 60_000)) {
    try { await api.sendMessage({ chat_id: chatId, text: t(lang, 'rateLimited') }); } catch { /* ignore */ }
    return;
  }

  try {
    // ----- commands -------------------------------------------------------
    if (OPEN_RE.test(text.trim())) {
      if (text.trim().toLowerCase().startsWith('/start') && !user.lastStudyDate && !message.web_app_data) {
        // brand-new user → ask the language first
        await api.sendMessage({
          chat_id: chatId,
          text: t(lang, 'chooseLang'),
          reply_markup: langKeyboard(),
        });
        return;
      }
      await sendOpenScreen(chatId, lang);
      return;
    }
    if (/^\/new(@\w+)?$/i.test(text)) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'newGuide'), parse_mode: 'HTML', reply_markup: openKeyboard(lang) });
      return;
    }
    if (/^\/help(@\w+)?$/i.test(text)) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'help'), parse_mode: 'HTML', reply_markup: openKeyboard(lang) });
      return;
    }
    if (/^\/backup(@\w+)?$/i.test(text)) {
      // personal data file → private chats only (Gate 2.2.3)
      if (message.chat.type !== 'private') {
        await api.sendMessage({ chat_id: chatId, text: t(lang, 'privateOnly') });
        return;
      }
      await sendBackup(user, chatId);
      return;
    }
    if (/^\/stats(@\w+)?$/i.test(text)) {
      // personal data → private chats only (Gate 2.2.3)
      if (message.chat.type !== 'private') {
        await api.sendMessage({ chat_id: chatId, text: t(lang, 'privateOnly') });
        return;
      }
      await sendStats(user, chatId);
      return;
    }
    if (/^\/lang(@\w+)?$/i.test(text)) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'chooseLang'), reply_markup: langKeyboard() });
      return;
    }

    // ----- Telegram-mandated compliance commands (Gate 5) -------------------
    if (/^\/privacy(@\w+)?$/i.test(text)) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'privacy'), parse_mode: 'HTML' });
      return;
    }
    if (/^\/terms(@\w+)?$/i.test(text)) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'terms'), parse_mode: 'HTML' });
      return;
    }
    if (/^\/support(@\w+)?$/i.test(text)) {
      await api.sendMessage({
        chat_id: chatId,
        text: t(lang, 'support'),
        parse_mode: 'HTML',
        reply_markup: supportKeyboard(lang),
      });
      return;
    }
    if (/^\/paysupport(@\w+)?$/i.test(text)) {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'paySupport'), parse_mode: 'HTML' });
      return;
    }
    if (/^\/delete_my_data(@\w+)?$/i.test(text)) {
      await api.sendMessage({
        chat_id: chatId,
        text: t(lang, 'deleteConfirm'),
        parse_mode: 'HTML',
        reply_markup: deleteConfirmKeyboard(lang),
      });
      return;
    }

    // ----- documents ------------------------------------------------------
    if (message.document) {
      if ((message.document.file_size || 0) > 20 * 1024 * 1024) {
        await api.sendMessage({ chat_id: chatId, text: t(lang, 'importTooBig'), parse_mode: 'HTML' });
        return;
      }
      await importDocument(user, message, message.document);
      return;
    }

    // ----- anything else ----------------------------------------------------
    await api.sendMessage({ chat_id: chatId, text: t(lang, 'fallback'), parse_mode: 'HTML', reply_markup: openKeyboard(lang) });
  } catch (e) {
    if (e instanceof BotApiError) {
      console.warn(`BotApiError ${e.code} in message handler: ${e.description}`);
      if (e.code === 403) return; // blocked bot — nothing to do
    } else {
      console.error(e);
    }
    try {
      await api.sendMessage({ chat_id: chatId, text: t(lang, 'errGeneric') });
    } catch { /* chat unavailable */ }
  }
}
