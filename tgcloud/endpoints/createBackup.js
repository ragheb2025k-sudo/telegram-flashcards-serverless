// endpoints/createBackup.js — builds the ZIP backup and sends it as a
// document to the user's chat with the bot. Returns just a confirmation to
// the Mini App (the file itself lives in Telegram's chat UI, as requested).
import { api, BotApiError, InputFile } from 'sdk';
import { requireAccount } from '../lib/api-helpers.js';
import { loadAccount, buildBackupZip } from '../lib/backup.js';
import { t } from '../lib/i18n.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const account = await loadAccount(user.tgId);
  if (!account.cardCount) {
    return { ok: false, empty: true, message: 'No cards yet' };
  }
  const { bytes, filename } = buildBackupZip(account);
  try {
    await api.sendDocument({
      chat_id: user.tgId,
      document: new InputFile(bytes, filename, { type: 'application/zip' }),
      caption: t(user.lang, 'backupDone'),
      parse_mode: 'HTML',
    });
  } catch (e) {
    if (e instanceof BotApiError) {
      console.warn('backup send failed:', e.description);
      return { ok: false, message: e.description };
    }
    throw e;
  }
  return { ok: true, filename, cards: account.cardCount, decks: account.decks.length };
}
