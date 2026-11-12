// ---------------------------------------------------------------------------
// handlers/callback_query.js — inline button presses (language selection).
// ---------------------------------------------------------------------------
import { api } from 'sdk';
import { ensureUser, saveUserSettings } from '../lib/users.js';
import { t, openKeyboard } from '../lib/i18n.js';

export default async function (callbackQuery) {
  const data = callbackQuery.data || '';
  const from = callbackQuery.from;
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  if (!data.startsWith('lang:')) return;

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
}
