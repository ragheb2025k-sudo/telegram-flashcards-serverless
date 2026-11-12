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
      '/help — راهنمای کامل\n' +
      '/privacy — سیاست حفظ حریم خصوصی\n' +
      '/terms — شرایط استفاده\n' +
      '/support — پشتیبانی\n' +
      '/delete_my_data — حذف کامل داده‌ها',
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
      '<b>نکته: با هوش مصنوعی کارت بساز</b>\n' +
      'در مینی‌اپ، داخل «ایمپورت کارت‌ها» یک پرامپت آماده برای تبدیل هر متنی به فایل فلش‌کارت وجود دارد؛ آن را کپی کنید و همراه متن خودت به ChatGPT یا Gemini بده، خروجی CSV را ایمپورت کن.\n\n' +
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
    rateLimited: '⏳ کمی آرام‌تر! چند لحظه بعد دوباره تلاش کنید.',
    privateOnly: '🔒 این فرمان فقط در چت خصوصی با بات کار می‌کند. لطفاً همین‌جا در پیوی بفرستید.',
    privacy:
      '🔐 <b>سیاست حفظ حریم خصوصی</b>\n\n' +
      'چه داده‌هایی ذخیره می‌شود:\n' +
      '• شناسهٔ عددی تلگرام، نام کوچک، کد زبان\n' +
      '• محتوای فلش‌کارت‌های شما: دسته‌ها، کارت‌ها، پیشرفت مرور، هدف روزانه و زنجیره\n\n' +
      'داده‌ها فقط برای ارائهٔ خدمت ربات استفاده می‌شود؛ به شخص ثالث فروخته یا واگذار نمی‌شود. فایل‌های پشتیبان (ZIP) فقط در چت خودتان ساخته می‌شوند.\n\n' +
      '<b>حذف همهٔ داده‌ها:</b> فرمان /delete_my_data را بفرستید یا در تنظیمات مینی‌اپ گزینهٔ «حذف کامل داده‌ها» را بزنید.\n\n' +
      'سازنده: Botmaker Telegram (@Botmaker_Telegram)\nایمیل: ragheb2025k@gmail.com',
    terms:
      '📜 <b>شرایط استفاده</b>\n\n' +
      '۱. این ربات برای یادگیری شخصی با فلش‌کارت است؛ استفادهٔ منصفانه و بدون سوءاستفاده (اسپم، تلاش برای نفوذ یا بارگذاری محتوای غیرقانونی) الزامی است.\n' +
      '۲. مسئولیت محتوای کارت‌ها بر عهدهٔ خود شماست؛ محتوای خلاف قوانین را بارگذاری نکنید.\n' +
      '۳. خدمت «همان‌طور که هست» ارائه می‌شود؛ برای محافظت از داده‌ها به‌طور دوره‌ای با /backup پشتیبان بگیرید.\n' +
      '۴. در حال حاضر هیچ پرداختی در این ربات انجام نمی‌شود؛ اگر در آینده اضافه شود، پیش از هر پرداخت شرایط دقیق اعلام خواهد شد.\n\n' +
      'سازنده: Botmaker Telegram (@Botmaker_Telegram)\nایمیل: ragheb2025k@gmail.com',
    support:
      '💬 <b>پشتیبانی</b>\n\n' +
      'برای گزارش مشکل، پیشنهاد یا هر سؤالی با ما در تماس باشید:\n\n' +
      '• کانال پشتیبانی: @Botmaker_Telegram\n' +
      '• ایمیل: ragheb2025k@gmail.com\n\n' +
      'معمولاً در کمتر از ۲۴ ساعت پاسخ می‌دهیم.',
    paySupport:
      '💳 <b>پشتیبانی پرداخت</b>\n\n' +
      'این ربات در حال حاضر هیچ پرداخت، اشتراک یا خریدی ندارد؛ از شما هیچ درخواست پرداختی نمی‌شود.\n\n' +
      'اگر پیامی از طرف این بات درخواست پرداخت کرد، آن را به عنوان سوءاستفاده گزارش دهید و با پشتیبانی در میان بگذارید:\n' +
      '• @Botmaker_Telegram\n' +
      '• ragheb2025k@gmail.com',
    deleteConfirm:
      '🗑️ <b>حذف کامل داده‌ها</b>\n\n' +
      'همهٔ دسته‌ها، کارت‌ها، پیشرفت مرور و تنظیمات شما برای همیشه حذف می‌شود و قابل بازیابی نیست. مطمئنید؟',
    deleteYes: 'بله، همه حذف شود',
    deleteNo: 'انصراف',
    deleteDone: '✅ همهٔ داده‌های شما حذف شد. برای شروع دوباره /start بفرستید.',
    deleteCancelled: 'باشه — داده‌های شما دست‌نخورده ماند.',
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
      '/help — full guide\n' +
      '/privacy — privacy policy\n' +
      '/terms — terms of service\n' +
      '/support — support\n' +
      '/delete_my_data — delete all my data',
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
      '<b>Tip: build cards with AI</b>\n' +
      'Inside the Mini App’s “Import cards” dialog you get a ready-made prompt that turns any text into a flashcard file — copy it, give it to ChatGPT or Gemini together with your text, then import the CSV output.\n\n' +
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
    rateLimited: '⏳ Easy there! Please wait a moment and try again.',
    privateOnly: '🔒 This command only works in a private chat with the bot. Please send it here in DM.',
    privacy:
      '🔐 <b>Privacy Policy</b>\n\n' +
      'What we store:\n' +
      '• Your numeric Telegram id, first name, language code\n' +
      '• Your flashcard content: decks, cards, review progress, daily goal & streak\n\n' +
      'Data is used solely to provide the service; it is never sold or shared with third parties. Backups (ZIP) are built only into your own chat.\n\n' +
      '<b>Delete everything:</b> send /delete_my_data, or use “Delete all my data” in the Mini App settings.\n\n' +
      'Creator: Botmaker Telegram (@Botmaker_Telegram)\nEmail: ragheb2025k@gmail.com',
    terms:
      '📜 <b>Terms of Service</b>\n\n' +
      '1. This bot is for personal learning with flashcards; fair use is required — no spam, abuse, or unlawful uploads.\n' +
      '2. You are responsible for your card content; do not upload anything illegal.\n' +
      '3. The service is provided “as is”; protect yourself by running /backup regularly.\n' +
      '4. No payments exist in this bot today; if that ever changes, exact terms will be shown before any purchase.\n\n' +
      'Creator: Botmaker Telegram (@Botmaker_Telegram)\nEmail: ragheb2025k@gmail.com',
    support:
      '💬 <b>Support</b>\n\n' +
      'For bugs, ideas or any question, reach us here:\n\n' +
      '• Support channel: @Botmaker_Telegram\n' +
      '• Email: ragheb2025k@gmail.com\n\n' +
      'We usually reply within 24 hours.',
    paySupport:
      '💳 <b>Payment support</b>\n\n' +
      'This bot currently has no payments, subscriptions or purchases — you will never be asked to pay here.\n\n' +
      'If anything ever asks you for money “on behalf of” this bot, report it as abuse and contact support:\n' +
      '• @Botmaker_Telegram\n' +
      '• ragheb2025k@gmail.com',
    deleteConfirm:
      '🗑️ <b>Delete all my data</b>\n\n' +
      'All your decks, cards, review progress and settings will be erased permanently. This cannot be undone. Are you sure?',
    deleteYes: 'Yes, delete everything',
    deleteNo: 'Cancel',
    deleteDone: '✅ All your data has been deleted. Send /start to begin again.',
    deleteCancelled: 'Okay — your data was kept untouched.',
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

// Inline keyboard for /support — one-tap link to the support channel.
export function supportKeyboard(lang) {
  return {
    inline_keyboard: [[
      { text: `💬 ${lang === 'fa' ? 'کانال پشتیبانی' : 'Support channel'}`, url: 'https://t.me/Botmaker_Telegram' },
    ]],
  };
}

// Inline keyboard for the /delete_my_data confirmation (Gate 5.1.5).
export function deleteConfirmKeyboard(lang) {
  return {
    inline_keyboard: [[
      { text: `🗑️ ${t(lang, 'deleteYes')}`, callback_data: 'del:yes' },
      { text: t(lang, 'deleteNo'), callback_data: 'del:no' },
    ]],
  };
}
