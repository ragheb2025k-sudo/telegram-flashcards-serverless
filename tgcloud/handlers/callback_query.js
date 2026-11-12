// ---------------------------------------------------------------------------
// handlers/callback_query.js — inline button presses:
//   • lang:fa | lang:en  → language selection
//   • del:yes | del:no   → /delete_my_data confirmation (Gate 5.1.5)
// Ownership: the confirm keyboard is only ever sent into the user's own
// private chat; every action re-derives the account from callbackQuery.from,
// never from payload ids, so one user cannot act on another user's buttons.
// ---------------------------------------------------------------------------
import { api } from 'sdk';
import { eq } from 'sdk/db';
import { db } from 'sdk';
import { users, decks, cards } from '../schema.js';
import { ensureUser, saveUserSettings } from '../lib/users.js';
import { t, openKeyboard } from '../lib/i18n.js';
import { allow } from '../lib/ratelimit.js';

export default async function (callbackQuery) {
  const data = callbackQuery.data || '';
  const from = callbackQuery.from;
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  // anti-flood: inline buttons are the cheapest spam vector
  if (!allow(from.id, 30, 60_000)) {
    await api.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: t('en', 'rateLimited'),
      show_alert: false,
    });
    return;
  }

  // ----- language selection -------------------------------------------------
  if (data.startsWith('lang:')) {
    const lang = data.slice(5) === 'fa' ? 'fa' : 'en';
    await ensureUser(from);
    await saveUserSettings(from.id, { lang });

    try {
      if (chatId && messageId) {
        await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text: t(lang, 'welcome'),
          parse_mode: 'HTML',
          reply_markup: openKeyboard(lang),
        });
      }
    } catch (e) {
      // message may be unchanged/uneditable — ignore but still answer the callback
      console.warn('editMessageText failed:', e?.description);
    }

    await api.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: t(lang, 'langChanged', { lang: lang === 'fa' ? 'فارسی' : 'English' }),
    });
    return;
  }

  // ----- data deletion confirmation ----------------------------------------
  if (data === 'del:yes' || data === 'del:no') {
    const lang = (await ensureUser(from))?.lang || 'en';

    // safety: the delete confirm button only works in a private chat
    if (callbackQuery.message?.chat?.type !== 'private') {
      await api.answerCallbackQuery({ callback_query_id: callbackQuery.id, text: t(lang, 'privateOnly'), show_alert: true });
      return;
    }

    if (data === 'del:no') {
      try {
        if (chatId && messageId) {
          await api.editMessageText({
            chat_id: chatId,
            message_id: messageId,
            text: t(lang, 'deleteCancelled'),
          });
        }
      } catch { /* ignore */ }
      await api.answerCallbackQuery({ callback_query_id: callbackQuery.id, text: t(lang, 'deleteCancelled') });
      return;
    }

    // del:yes — wipe everything that belongs to THIS user (from.id, verified)
    const uid = from.id;
    const c = await db.delete(cards).where(eq(cards.userId, uid)).run();
    const d = await db.delete(decks).where(eq(decks.userId, uid)).run();
    await db.delete(users).where(eq(users.tgId, uid)).run();
    console.log(`data deletion for ${uid}: cards=${c?.changes ?? 0} decks=${d?.changes ?? 0}`);

    try {
      if (chatId && messageId) {
        await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text: t(lang, 'deleteDone'),
        });
      }
    } catch { /* ignore */ }
    await api.answerCallbackQuery({ callback_query_id: callbackQuery.id, text: t(lang, 'deleteDone') });
    return;
  }
}
