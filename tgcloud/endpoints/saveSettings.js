// endpoints/saveSettings.js — language, theme, fail behavior.
import { db } from 'sdk';
import { requireAccount, bad } from '../lib/api-helpers.js';
import { saveUserSettings } from '../lib/users.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const row = await saveUserSettings(user.tgId, input || {});
  if (!row) bad('Nothing to save (no valid settings keys)', { code: 'NO_PATCH' });
  return {
    user: {
      lang: row.lang,
      theme: row.theme,
      failBehavior: row.failBehavior,
      streak: row.streak,
    },
  };
}
