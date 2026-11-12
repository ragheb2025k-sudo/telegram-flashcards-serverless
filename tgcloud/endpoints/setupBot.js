// endpoints/setupBot.js — one-time (idempotent) bot configuration:
//   • command lists in English + Persian
//   • chat menu button = "Open Card Flow" Mini App button (always visible
//     above the input field — no need to hunt for the chat to open the app)
//   • bot description / short description in both languages
// Run once after deploy:  npx tgcloud run endpoints/setupBot '{}'
//   --ctx '{ initData: { user: { id: 1 } } }'
import { api } from 'sdk';
import { APP_URL } from '../lib/i18n.js';

const EN_COMMANDS = [
  { command: 'open', description: 'Open the Card Flow Mini App' },
  { command: 'new', description: 'How to create a new deck' },
  { command: 'backup', description: 'Send me a ZIP backup of all decks' },
  { command: 'stats', description: 'Show your learning stats' },
  { command: 'lang', description: 'Change language (English / فارسی)' },
  { command: 'help', description: 'Full guide & file formats' },
  { command: 'privacy', description: 'Privacy policy — what data is stored' },
  { command: 'terms', description: 'Terms of service' },
  { command: 'support', description: 'Contact support' },
  { command: 'paysupport', description: 'Payment support (no payments today)' },
  { command: 'delete_my_data', description: 'Delete all my data permanently' },
];
const FA_COMMANDS = [
  { command: 'open', description: 'باز کردن مینی‌اپ کارت‌فلو' },
  { command: 'new', description: 'راهنمای ساخت دستهٔ جدید' },
  { command: 'backup', description: 'دریافت فایل پشتیبان ZIP' },
  { command: 'stats', description: 'نمایش آمار یادگیری' },
  { command: 'lang', description: 'تغییر زبان (فارسی / English)' },
  { command: 'help', description: 'راهنمای کامل و فرمت فایل‌ها' },
  { command: 'privacy', description: 'سیاست حفظ حریم خصوصی' },
  { command: 'terms', description: 'شرایط استفاده' },
  { command: 'support', description: 'تماس با پشتیبانی' },
  { command: 'paysupport', description: 'پشتیبانی پرداخت (در حال حاضر پرداختی وجود ندارد)' },
  { command: 'delete_my_data', description: 'حذف کامل داده‌های من' },
];

export default async function () {
  const results = {};
  results.commandsEn = await api.setMyCommands({ commands: EN_COMMANDS });
  results.commandsFa = await api.setMyCommands({ commands: FA_COMMANDS, language_code: 'fa' });
  results.menuButton = await api.setChatMenuButton({
    menu_button: { type: 'web_app', text: '🌀 کارت‌فلو | Card Flow', web_app: { url: APP_URL } },
  });
  results.descEn = await api.setMyDescription({
    description: 'Spaced-repetition flashcards — build decks, import files, study right in Telegram. FSRS-6 scheduling, daily goals & streaks.',
  });
  results.descFa = await api.setMyDescription({
    description: 'کارت‌فلو با مرور فاصله‌دار — ساخت دسته، ایمپورت فایل و مرور هوشمند بر پایهٔ الگوریتم FSRS، به‌همراه هدف روزانه و زنجیرهٔ مطالعه.',
    language_code: 'fa',
  });
  results.shortEn = await api.setMyShortDescription({
    short_description: 'Spaced-repetition flashcards Mini App — study anything, remember it forever.',
  });
  results.shortFa = await api.setMyShortDescription({
    short_description: 'کارت‌فلو: مرور فاصله‌دار هوشمند — هر چیزی را برای همیشه یاد بگیر.',
    language_code: 'fa',
  });
  return { ok: true, results };
}
