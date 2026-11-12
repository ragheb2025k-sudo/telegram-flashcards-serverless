// endpoints/setupBot.js — one-time (idempotent) bot configuration:
//   • command lists in English + Persian
//   • chat menu button = "Open FlashCards" Mini App button (always visible
//     above the input field — no need to hunt for the chat to open the app)
//   • bot description / short description in both languages
// Run once after deploy:  npx tgcloud run endpoints/setupBot '{}'
//   --ctx '{ initData: { user: { id: 1 } } }'
import { api } from 'sdk';
import { APP_URL } from '../lib/i18n.js';

const EN_COMMANDS = [
  { command: 'open', description: 'Open the FlashCards Mini App' },
  { command: 'new', description: 'How to create a new deck' },
  { command: 'backup', description: 'Send me a ZIP backup of all decks' },
  { command: 'stats', description: 'Show your learning stats' },
  { command: 'lang', description: 'Change language (English / فارسی)' },
  { command: 'help', description: 'Full guide & file formats' },
];
const FA_COMMANDS = [
  { command: 'open', description: 'باز کردن مینی‌اپ فلش‌کارت' },
  { command: 'new', description: 'راهنمای ساخت دستهٔ جدید' },
  { command: 'backup', description: 'دریافت فایل پشتیبان ZIP' },
  { command: 'stats', description: 'نمایش آمار یادگیری' },
  { command: 'lang', description: 'تغییر زبان (فارسی / English)' },
  { command: 'help', description: 'راهنمای کامل و فرمت فایل‌ها' },
];

export default async function () {
  const results = {};
  results.commandsEn = await api.setMyCommands({ commands: EN_COMMANDS });
  results.commandsFa = await api.setMyCommands({ commands: FA_COMMANDS, language_code: 'fa' });
  results.menuButton = await api.setChatMenuButton({
    menu_button: { type: 'web_app', text: '🃏 FlashCards', web_app: { url: APP_URL } },
  });
  results.descEn = await api.setMyDescription({
    description: 'Spaced-repetition flashcards — build decks, import files, study right in Telegram. Leitner boxes + adaptive intervals.',
  });
  results.descFa = await api.setMyDescription({
    description: 'فلش‌کارت با مرور فاصله‌دار — ساخت دسته، ایمپورت فایل و مرور هوشمند بر پایهٔ جعبهٔ لایتنر و فاصله‌های تطبیقی.',
    language_code: 'fa',
  });
  results.shortEn = await api.setMyShortDescription({
    short_description: 'Spaced-repetition flashcards Mini App — study anything, remember it forever.',
  });
  results.shortFa = await api.setMyShortDescription({
    short_description: 'فلش‌کارت با مرور فاصله‌دار — هر چیزی را برای همیشه یاد بگیر.',
    language_code: 'fa',
  });
  return { ok: true, results };
}
