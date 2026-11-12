# 🃏 FlashCards — Telegram Serverless Bot + Mini App

<p align="center">
  <b>English</b> · <a href="#فارسی">فارسی</a>
</p>

A complete **spaced-repetition flashcard bot** built on [Telegram Serverless](https://core.telegram.org/bots/serverless) — no servers, no containers, no hosting bills. The bot's backend runs as plain JavaScript modules on Telegram's own infrastructure, and the Mini App is hosted right next to it at `https://app<app_id>.tgcloud.ai/`.

---

## Features

### Bot (chat side)
- `/start` — welcome + language picker (Persian / English)
- `/open` — a message with an inline **Open Mini App** button
- **Menu button** — the 🃏 *Open FlashCards* button sits permanently above the chat input (set via `setChatMenuButton`), so the app is one tap away without scrolling the chat
- `/new` — how to create a deck
- `/help` — full guide incl. all supported file formats
- `/stats` — decks, cards, due count, mastered count, study streak
- `/lang` — switch language
- `/backup` — receive a **ZIP backup** of everything in the same chat
- **Send a file** (CSV / TSV / TXT / JSON) → a deck is created automatically (deck name = file name or message caption; if a deck with that name exists, cards are appended)
- **Send your backup ZIP / JSON back** → everything is restored
- All bot texts exist in **Persian and English**; the language is detected from the user's Telegram locale and remembered

### Mini App (the actual study app)
- Modern, warm-neutral UI, mobile-first, RTL-aware (Vazirmatn for Persian)
- **Deck management** — create / rename / delete decks with emoji
- **Manual card creation** — "save & next" for fast bulk entry
- **File import in-app** — pick a file or paste text, with a live format guide and a parsed-cards preview
- **Review session** — big 3D flip card; green ✓ / red ✗ circle buttons with the flip button between them; progress bar; house indicator; re-queue of missed cards; haptic feedback; keyboard shortcuts (Space = flip, 1 = wrong, 2 = correct)
- **Session summary** — correct/wrong counts, what's left
- **House filters** — every card lives in one of 5 houses (Leitner boxes)
- **Settings**
  - Language: فارسی / English
  - Theme: Light / Dark / Auto (follows Telegram theme)
  - **Missed-card behavior**: *return to first house* (strict) or *return to previous house* (gentle)
  - Backup: builds the ZIP and sends it to the chat
- Demo mode: opening the app outside Telegram runs it against `localStorage`, so the UI is fully explorable in a normal browser

### The scheduling (learning science)
Cards travel through **5 houses** with expanding intervals based on spacing-effect research (Ebbinghaus; Cepeda et al. 2006; SM-2 heritage):

| House | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Interval | 1 day | 3 days | 7 days | 16 days | 35 days |

- Correct answer → promote one house, due = interval × the card's **ease** factor
- Missed card → short **relearning step** (10 minutes, like Anki/FSRS) and a house drop according to the user's setting
- Every card carries an adaptive **ease** multiplier (0.6–1.45, SM-2 style) that grows with each success and shrinks on lapses, so hard cards come back sooner and easy cards later
- Daily **streak** counter for motivation

### Backup format (ZIP)
```
flashcards-backup-YYYY-MM-DD.zip
├─ flashcards.json      ← full data: settings + decks + complete SRS state
├─ decks/<name>.csv     ← human-readable front,back per deck
└─ README.txt
```
The ZIP is written by a tiny dependency-free STORE-mode ZIP writer (`tgcloud/lib/zip.js`) and is a standard archive — any unzip tool can open it. Restore = send the ZIP (or the `flashcards.json`) to the bot chat. Existing decks are kept; cards are matched by front+back and merged with their SRS state.

## Supported import formats

| Format | Extension | Layout |
|---|---|---|
| CSV | `.csv` | one row per card: `front,back` — comma / semicolon / TAB **auto-detected**, quoted fields supported, optional header row is skipped |
| TSV | `.tsv` | one row per card: `front<TAB>back` |
| TXT | `.txt` | per line `front<TAB>back` **or** `front - back`, **or** blocks separated by a blank line (first line = front, remaining lines = back) |
| JSON | `.json` | `[{"front":"...","back":"..."}]` (aliases: `question/answer`, `word/meaning`, `سؤال/جواب`, …) or `[["front","back"],...]` |
| Backup | `.zip` / `.json` | this bot's own backup → restore |

Limits: 2 MB and 5000 cards per file. Encoding: UTF-8.

## Project structure

```
flashcards-telegram-serverless/
├─ tgcloud/                 # everything the platform runs
│  ├─ handlers/
│  │  ├─ message.js         # commands, file import, backup/restore
│  │  └─ callback_query.js  # language picker buttons
│  ├─ endpoints/            # called by the Mini App (initData-verified)
│  │  ├─ getHome.js  getDeck.js  getReview.js  answerCard.js
│  │  ├─ createDeck.js  updateDeck.js  deleteDeck.js
│  │  ├─ addCards.js  importDeck.js  updateCard.js  deleteCard.js
│  │  ├─ resetDeckProgress.js  saveSettings.js
│  │  ├─ createBackup.js    # builds ZIP + sends to chat
│  │  └─ setupBot.js        # one-shot: commands, menu button, descriptions
│  ├─ lib/
│  │  ├─ srs.js             # scheduling engine (houses + ease + streak)
│  │  ├─ parse.js           # CSV/TSV/TXT/JSON + backup-JSON parsers
│  │  ├─ csv.js             # RFC-4180-style CSV reader/writer
│  │  ├─ zip.js             # pure-JS ZIP writer/reader (STORE mode)
│  │  ├─ backup.js          # build ZIP / restore from ZIP or JSON
│  │  ├─ users.js           # accounts, settings, stats
│  │  ├─ api-helpers.js     # auth + ownership guards + serializers
│  │  └─ i18n.js            # all bot texts (fa/en)
│  └─ schema.js             # users / decks / cards tables
├─ app/                     # Mini App front-end (plain HTML/CSS/JS, no build)
│  ├─ index.html
│  ├─ css/style.css
│  └─ js/{app.js, i18n.js}
├─ tgcloud.jsonc            # static hosting config (source: app/, spa: true)
├─ package.json
└─ .gitignore
```

## Deploy your own

1. Turn **Serverless** on for your bot: [@BotFather](https://t.me/BotFather) → your bot → **Serverless**, and copy the **CLI access token** (`app<id>:<secret>`).
2. Clone this repo and install the CLI:

   ```bash
   npm install
   ```
3. Link the project (only `TGCLOUD_TOKEN` is needed — never your bot token):

   ```bash
   export TGCLOUD_TOKEN="app<id>:<secret>"
   npx tgcloud status
   ```
4. Deploy code + Mini App, then create the tables:

   ```bash
   npx tgcloud push
   npx tgcloud migrate --yes
   ```
5. Set commands + menu button (once):

   ```bash
   npx tgcloud run endpoints/setupBot '{}' --ctx '{ initData: { user: { id: 1 } } }'
   ```
6. Test a handler without deploying:

   ```bash
   npx tgcloud run handlers/message '{ chat: { id: 1 }, text: "/help" }'
   ```

The Mini App is served at `https://app<app_id>.tgcloud.ai/` (printed by `push`). If you rename the app/bot, update `APP_URL` in `tgcloud/lib/i18n.js`.

> **Database notes** — the runtime runs with `PRAGMA foreign_keys` OFF, so integrity (deck↔card ownership) is enforced in `lib/api-helpers.js` and cascade deletes are done manually. Query-builder **where-parameters take raw values** (unix seconds for timestamp columns); `Date` objects are only for insert/update values.

## Security notes
- Only the `TGCLOUD_TOKEN` CLI token is ever needed locally; it is read from the environment (`.tgcloud/` is git-ignored and never committed).
- The bot's API token lives solely inside the platform SDK (`api.*`) — it never appears in the code.
- Every endpoint verifies the caller's Telegram **initData** automatically before running; user data is scoped by Telegram user id and every deck/card access is ownership-checked.

---

<a id="فارسی"></a>
## فارسی

بات کامل **فلش‌کارت با مرور فاصله‌دار** بر پایه‌ی [Telegram Serverless](https://core.telegram.org/bots/serverless) — بدون سرور، بدون کانتینر، بدون هزینه‌ی هاست. بک‌اند بات به‌شکل ماژول‌های ساده‌ی جاوااسکریپت روی زیرساخت خود تلگرام اجرا می‌شود و مینی‌اپ هم کنارش روی `https://app<app_id>.tgcloud.ai/` هاست می‌شود.

### امکانات بات
- `/start` — خوش‌آمد و انتخاب زبان (فارسی/انگلیسی)
- دکمه‌ی منوی چت: 🃏 **Open FlashCards** همیشه بالای فیلد تایپ است — بدون نیاز به باز کردن چت، مینی‌اپ یک لمس فاصله دارد
- ارسال فایل (CSV / TSV / TXT / JSON) → ساخت خودکار دسته (نام دسته = نام فایل یا کپشن؛ اگر دسته‌ی همنام باشد کارت‌ها به همان اضافه می‌شوند)
- ارسال فایل پشتیبان ZIP/JSON → بازیابی کامل
- `/backup` — ساخت و ارسال **فایل پشتیبان ZIP** در خود چت
- `/stats` — آمار، `/lang` — تغییر زبان، `/help` — راهنمای کامل، `/new` — راهنمای ساخت دسته
- همه‌ی متن‌ها **فارسی و انگلیسی**

### امکانات مینی‌اپ
- مدیریت دسته‌ها با ایموجی، ساخت کارت دستی («ذخیره و بعدی» برای ورود سریع)
- ایمپورت فایل یا چسباندن متن با راهنمای فرمت و پیش‌نمایش تعداد کارت‌های شناسایی‌شده
- **جلسه‌ی مرور**: کارت سه‌بعدی قابل فلپ، دایره‌ی سبز ✓ و دایره‌ی قرمز ✗ با دکمه‌ی برگرداندن بین آن‌ها، نوار پیشرفت، نشانگر خانه، صف دوباره‌ی کارت‌های ناپاس، هپتیک و میان‌برهای کیبورد
- خلاصه‌ی جلسه، فیلتر بر اساس خانه‌ها، شمارنده‌ی روزهای پیاپی 🔥
- **تنظیمات**: زبان، پوسته (روشن/تاریک/خودکار)، **رفتار کارت ناپاس: برگشت به خانه‌ی اول یا خانه‌ی قبلی**، پشتیبان‌گیری ZIP
- حالت دمو خارج از تلگرام با localStorage

### برنامه‌ی مرور
کارت‌ها در **۵ خانه** با فواصل فزاینده حرکت می‌کنند: **۱ → ۳ → ۷ → ۱۶ → ۳۵ روز** (پژوهش‌های اثر فاصله‌گذاری: ابینگهاوس و Cepeda et al. 2006). پاسخ درست = یک خانه بالاتر × ضریب سختی تطبیقی کارت (سبک SM-2: از ۰٫۶ تا ۱٫۴۵). کارت ناپاس = گام بازآموزی ۱۰ دقیقه‌ای + برگشت به خانه‌ی اول یا خانه‌ی قبلی (طبق تنظیم کاربر).

### فرمت فایل‌های پشتیبانی‌شده

| فرمت | پسوند | چینش |
|---|---|---|
| CSV | `.csv` | هر خط `سؤال,جواب` — جداکننده‌ی `,` `;` یا TAB خودکار، فیلد با `"..."`، سرستون اختیاری |
| TSV | `.tsv` | هر خط `سؤال<TAB>جواب` |
| TXT | `.txt` | `سؤال - جواب` یا `سؤال<TAB>جواب` در هر خط، یا بلوک با خط خالی (خط اول سؤال، بقیه جواب) |
| JSON | `.json` | `[{"front":"...","back":"..."}]` یا `[["سؤال","جواب"],...]` |
| پشتیبان | `.zip` / `.json` | فرمت خود بات → بازیابی |

محدودیت هر فایل: ۲ مگابایت و ۵۰۰۰ کارت، انکدینگ UTF-8.

### ساخت پشتیبان ZIP
```
flashcards-backup-YYYY-MM-DD.zip
├─ flashcards.json      ← همه‌ی داده‌ها + وضعیت کامل مرور هر کارت
├─ decks/<name>.csv     ← خروجی خوانا برای انسان
└─ README.txt
```
ZIP با نویسنده‌ی بدون‌وابستگی (`tgcloud/lib/zip.js`) ساخته می‌شود و یک آرشیو استاندارد است؛ برای بازیابی همان فایل را به چت بات بفرستید.

### دیپلوی
راهنمای کامل در بخش انگلیسی بالا؛ خلاصه:

```bash
npm install
export TGCLOUD_TOKEN="app<id>:<secret>"
npx tgcloud push && npx tgcloud migrate --yes
npx tgcloud run endpoints/setupBot '{}' --ctx '{ initData: { user: { id: 1 } } }'
```

## License
MIT
