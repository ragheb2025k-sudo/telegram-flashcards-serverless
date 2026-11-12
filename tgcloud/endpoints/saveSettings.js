// endpoints/saveSettings.js — language, theme, fail behavior, daily goal.
import { db } from 'sdk';
import { requireAccount, bad } from '../lib/api-helpers.js';
import { saveUserSettings, settingsView } from '../lib/users.js';

export default async function (input, ctx) {
  const user = await requireAccount(ctx);
  const row = await saveUserSettings(user.tgId, input || {});
  if (!row) bad('Nothing to save (no valid settings keys)', { code: 'NO_PATCH' });
  return { user: settingsView(row) };
}
