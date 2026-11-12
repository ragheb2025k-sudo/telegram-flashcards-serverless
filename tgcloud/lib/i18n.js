// ---------------------------------------------------------------------------
// lib/i18n.js — all bot-facing texts in Persian (fa) and English (en).
// ------------------------------------------------------------ -------------
export const LANGS = ['fa', 'en'];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const T = {
  fa: {
    chooseLang: '🇮🇷 فارسی یا 🇬🇧 English؟\n\nزبان رابط کاربری بات و مینی‌اپ را انتخاب کنید:',
    langSet: 'زبان روی فارسی تنظیم شد ✅',
    welcome:
      '🃏 <b>به فلش‌کارت خوش آمدید!</b>\n\n' +
      'با این بات مجموعه‌های فلش‌کارت بسازید و با روش <b>مرور فاصله‌دار</b> (بر پایهٔ جعبهٔ لایتنر و تحقیقات نوین یادگیری) آن‌ها را برای همیشه به خاطر بسپارید.\n\n' +
      '<b>دکمهٔ زیر را بزنید تا مینی‌اپ باز شود 👇</b>',
    openBtn: '🚀 باز کردن فلش‌کارت‌ها',
    whatNext: 'می‌توانید از همین‌جا شروع کنید:',
    fallback:
      'این بات از طریق <b>مینی‌اپ</b> کار می‌کند — ساخت و مرور کارت‌ها آنجاست.\n\n' +
      'فرمان‌ها:\n' +
      '/open — باز کردن مینی‌اپ\n' +
      '/new — راهنمای ساخت دستهٔ جدید\n' +
      '/backup — گرفتن فایل پشتیبان (ZIP)\n' +
      '/stats — آمار یادگیری\n' +
      '/lang — تغییر زبان\n' +
      '/help — راهنمای کامل',
    help:
      '📖 <b>راهنمای فلش‌کارت</b>\n\n' +
      '<b>ساخت کارت</b>\n' +
      '• در مینی‌اپ: دکمهٔ «دستهٔ جدید» یا «افزودن کارت»\n' +
      '• با فایل: همین‌جا در چت، فایل را بفرستید (CSV / TSV / TXT / JSON)\n\n' +
      '<b>فرمت فایل‌ها</b>\n' +
      '<code>CSV:</code> هر خط: سؤال,جواب — جداکنندهٔ , یا ; یا TAB خودکار تشخیص داده می‌شود؛ فیلد با "..." می‌توانید کوتیشن بدهید؛ ردیف سرستون اختیاری است.\n' +
      '<code>TSV:</code> هر خط: سؤال&lt;TAB&gt;جواب\n' +
      '<code>TXT:</code> هر خط <code>سؤال&lt;TAB&gt;جواب</code> یا <code>سؤال - جواب</code> یا بلوک‌های جداشده با خط خالی (خط اول سؤال، بقیه جواب).\n' +
      '<code>JSON:</code> [{"front":"سؤال","back":"جواب"}] یا [["سؤال","جواب"],...]\n\n' +
      '<b>مرور و زمان‌بندی</b>\n' +
      'هر کارت در یکی از ۵ خانه است. جواب درست = یک خانه بالاتر (فاصلهٔ مرور بلندتر)، جواب ناپاس = برگشت به خانهٔ اول یا خانهٔ قبلی (قابل تنظیم در مینی‌اپ). فاصله‌ها: ۱، ۳، ۷، ۱۶ و ۳۵ روز.\n\n' +
      '<b>پشتیبان‌گیری</b>\n' +
      '/backup — فایل ZIP شامل JSON کامل + CSV هر دسته می‌سازد. برای بازیابی، همان فایل ZIP یا JSON را دوباره به چت بفرستید.',
    newGuide:
      '🆕 <b>ساخت دستهٔ جدید</b>\n\n' +
      '۱. مینی‌اپ را باز کنید.\n' +
      '۲. «+ دستهٔ جدید» را بزنید و اسم بدهید.\n' +
      '۳. کارت‌ها را دستی وارد کنید یا از فایل CSV / TSV / TXT / JSON ایمپورت کنید.\n\n' +
      'می‌توانید همین‌جا در چت هم فایل بفرستید تا خودکار دسته ساخته شود؛ اسم دسته = عنوان فایل (یا کپشن پیام).',
    stats:
      '📊 <b>آمار شما</b>\n\n' +
      '🗂 دسته‌ها: {decks}\n' +
      '🃏 کل کارت‌ها: {cards}\n' +
      '⏰ منتظر مرور: {due}\n' +
      '🏆 تسلط‌یافته (خانهٔ ۵): {mastered}\n' +
      '🔥 روزهای پیاپی مطالعه: {streak}',
    backupDone: '💾 <b>پشتیبان آماده شد!</b>\nفایل ZIP در همین پیام است؛ آن را نگه دارید یا به جای دیگری فوروارد کنید. برای بازیابی، همان فایل را به چت بفرستید.',
    backupEmpty: 'هنوز کارتی ندارید — اول با /new چند کارت بسازید.',
    backupFail: '⚠️ خطا در ساخت پشتیبان. بعداً دوباره تلاش کنید.',
    fileReceived: '📥 فایل «{name}» دریافت شد، در حال پردازش…',
    importDone:
      '✅ <b>دستهٔ «{deck}» با {count} کارت ساخته شد.</b>\n\nبرای مرور، مینی‌اپ را باز کنید:',
    importAdded:
      '✅ <b>{count} کارت به دستهٔ «{deck}» اضافه شد.</b>\n\nبرای مرور، مینی‌اپ را باز کنید:',
    importNone: '⚠️ در فایل هیچ کارت معتبری پیدا نشد.',
    importTooBig: '⚠️ فایل بیش از حد بزرگ است (سقف ۲ مگابایت و ۵۰۰۰ کارت در هر فایل).',
    restoreDone:
      '♻️ <b>بازیابی کامل شد.</b>\n\nدسته‌های بازیابی‌شده: {decks}\nکارت‌های اضافه‌شده: {cards}',
    restoreFail: '⚠️ این فایل یک پشتیبان معتبر نیست. فایل ZIP ساخته‌شده توسط همین بات یا فایل JSON آن را بفرستید.',
    badFile: '⚠️ فرمت فایل پشتیبانی نمی‌شود.\n\nفرمت‌های مجاز: <code>CSV</code>، <code>TSV</code>، <code>TXT</code>، <code>JSON</code> و فایل پشتیبان <code>ZIP</code>.\nجزئیات: /help',
    parseError: '⚠️ خواندن فایل ممکن نشد: {reason}\n\nراهنمای فرمت: /help',
    chooseLangBtnFa: '🇮🇷 فارسی',
    chooseLangBtnEn: '🇬🇧 English',
    langChanged: '✅ زبان عوض شد. از حالا {lang} جواب می‌دهم.',
    openHint: '👇 مینی‌اپ را باز کنید:',
    errGeneric: '⚠️ خطایی رخ داد. دوباره تلاش کنید.',
  },
  en: {
    chooseLang: '🇬🇧 English or 🇮🇷 فارسی؟\n\nChoose the language of the bot and the Mini App:',
    langSet: 'Language set to English ✅',
    welcome:
      '🃏 <b>Welcome to FlashCards!</b>\n\n' +
      'Build flashcard decks and memorize them for good with <b>spaced repetition</b> (Leitner boxes, informed by modern learning science).\n\n' +
      '<b>Tap the button below to open the Mini App 👇</b>',
    openBtn: '🚀 Open FlashCards',
    whatNext: 'You can start right away:',
    fallback:
      'This bot works through its <b>Mini App</b> — that is where you create and study cards.\n\n' +
      'Commands:\n' +
      '/open — open the Mini App\n' +
      '/new — how to create a new deck\n' +
      '/backup — export a backup file (ZIP)\n' +
      '/stats — your learning stats\n' +
      '/lang — change language\n' +
      '/help — full guide',
    help:
      '📖 <b>FlashCards guide</b>\n\n' +
      '<b>Creating cards</b>\n' +
      '• In the Mini App: use “New deck” or “Add card”\n' +
      '• From a file: send it right here in the chat (CSV / TSV / TXT / JSON)\n\n' +
      '<b>File formats</b>\n' +
      '<code>CSV:</code> one row per card: front,back — the separator (comma, semicolon or TAB) is auto-detected; fields may be quoted with "..."; an optional header row is skipped.\n' +
      '<code>TSV:</code> one row per card: front&lt;TAB&gt;back\n' +
      '<code>TXT:</code> per line <code>front&lt;TAB&gt;back</code> or <code>front - back</code>, or blocks separated by a blank line (first line = front, the rest = back).\n' +
      '<code>JSON:</code> [{"front":"...","back":"..."}] or [["front","back"],...]\n\n' +
      '<b>Reviewing & scheduling</b>\n' +
      'Every card lives in one of 5 houses. A correct answer promotes it one house (longer interval); a miss sends it back to house 1 — or to the previous house (configurable in the Mini App). Intervals: 1, 3, 7, 16 and 35 days.\n\n' +
      '<b>Backup</b>\n' +
      '/backup — builds a ZIP with the full JSON + a CSV per deck. To restore, simply send the same ZIP (or its JSON) back to this chat.',
    newGuide:
      '🆕 <b>Creating a new deck</b>\n\n' +
      '1. Open the Mini App.\n' +
      '2. Tap “+ New deck” and give it a name.\n' +
      '3. Add cards manually or import them from a CSV / TSV / TXT / JSON file.\n\n' +
      'You can also send a file right here in the chat — a deck will be created automatically; the deck name is the file name (or the message caption).',
    stats:
      '📊 <b>Your stats</b>\n\n' +
      '🗂 Decks: {decks}\n' +
      '🃏 Cards: {cards}\n' +
      '⏰ Due for review: {due}\n' +
      '🏆 Mastered (house 5): {mastered}\n' +
      '🔥 Study streak: {streak} days',
    backupDone: '💾 <b>Backup ready!</b>\nThe ZIP file is in this message — keep it or forward it anywhere. To restore, just send the same file back to this chat.',
    backupEmpty: 'You have no cards yet — first create a few with /new.',
    backupFail: '⚠️ Could not build the backup. Please try again later.',
    fileReceived: '📥 Received file “{name}”, processing…',
    importDone:
      '✅ <b>Deck “{deck}” created with {count} cards.</b>\n\nOpen the Mini App to start reviewing:',
    importAdded:
      '✅ <b>{count} cards added to deck “{deck}”.</b>\n\nOpen the Mini App to start reviewing:',
    importNone: '⚠️ No valid cards were found in the file.',
    importTooBig: '⚠️ The file is too large (limits: 2 MB and 5000 cards per file).',
    restoreDone:
      '♻️ <b>Restore complete.</b>\n\nDecks restored: {decks}\nCards added: {cards}',
    restoreFail: '⚠️ This file is not a valid backup. Send the ZIP produced by this bot, or its JSON file.',
    badFile: '⚠️ Unsupported file format.\n\nAllowed: <code>CSV</code>, <code>TSV</code>, <code>TXT</code>, <code>JSON</code> and this bot\'s <code>ZIP</code> backups.\nSee /help for details.',
    parseError: '⚠️ Could not read the file: {reason}\n\nFormat guide: /help',
    chooseLangBtnFa: '🇮🇷 فارسی',
    chooseLangBtnEn: '🇬🇧 English',
    langChanged: '✅ Language changed. I will reply in {lang} from now on.',
    openHint: '👇 Open the Mini App:',
    errGeneric: '⚠️ Something went wrong. Please try again.',
  },
};

export function t(lang, key, params = {}) {
  const dict = T[lang] || T.en;
  let s = dict[key] ?? T.en[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export { esc };

// Detect a user's preferred language from the Telegram `from` object.
export function detectLang(from) {
  const code = (from?.language_code || '').toLowerCase();
  return code.startsWith('fa') ? 'fa' : 'en';
}

// Mini App URL — served by the platform at https://app<app_id>.tgcloud.ai/
export const APP_URL = 'https://app9237672191.tgcloud.ai/';

// Inline keyboard: main "Open Mini App" button (web_app type).
export function openKeyboard(lang) {
  return {
    inline_keyboard: [[
      { text: t(lang, 'openBtn'), web_app: { url: APP_URL } },
    ]],
  };
}

// Inline keyboard for the very first /start — language choice.
export function langKeyboard() {
  return {
    inline_keyboard: [[
      { text: t('fa', 'chooseLangBtnFa'), callback_data: 'lang:fa' },
      { text: t('en', 'chooseLangBtnEn'), callback_data: 'lang:en' },
    ]],
  };
}
