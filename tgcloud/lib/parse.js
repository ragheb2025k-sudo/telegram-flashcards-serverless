// ---------------------------------------------------------------------------
// lib/parse.js — parse flashcard import files: CSV / TSV / TXT / JSON.
//
// Supported layouts (documented in /help, the Mini App import dialog, README):
//   CSV  .csv — one row per card: front,back — delimiter auto-detected
//               (comma, semicolon or TAB); quoted fields supported ("a,b");
//               an optional header row (front/back/question/…/سؤال/جواب) is skipped.
//   TSV  .tsv — one row per card: front<TAB>back, optional header.
//   TXT  .txt — per line: front<TAB>back  |  front - back  |  blank-line blocks
//               (first line = front, remaining lines = back).
//   JSON .json — [{"front":"...","back":"..."}] (aliases: question/answer,
//               word/meaning, جلو/عقب) or [["front","back"], ...].
// ---------------------------------------------------------------------------
import { parseCsv } from './csv.js';

export const LIMITS = { maxBytes: 2 * 1024 * 1024, maxCards: 5000, maxFront: 1000, maxBack: 4000 };

const HEADER_WORDS = new Set([
  'front', 'back', 'question', 'answer', 'q', 'a', 'word', 'meaning', 'term', 'definition',
  'side1', 'side2', 'card', 'front side', 'back side',
  'سؤال', 'سوال', 'جواب', 'پاسخ', 'رو', 'پشت', 'واژه', 'معنی', 'متن', 'ترجمه', 'کارت', 'جلو', 'عقب',
]);

function decode(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
}

function looksLikeHeader(cells) {
  if (!cells.length) return false;
  return cells.every((c) => HEADER_WORDS.has(c.trim().toLowerCase()));
}

function cleanCard(front, back) {
  const f = String(front ?? '').trim();
  const b = String(back ?? '').trim();
  if (!f || !b) return null;
  if (f.length > LIMITS.maxFront || b.length > LIMITS.maxBack) return null;
  return { front: f, back: b };
}

function pairsFromRows(rows) {
  const out = [];
  if (!rows.length) return out;
  let start = 0;
  if (looksLikeHeader(rows[0])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 2) continue;
    const card = cleanCard(r[0], r.slice(1).join(' '));
    if (card) out.push(card);
  }
  return out;
}

function parseDelimited(text) {
  const firstLines = text.split(/\r?\n/).slice(0, 12).filter((l) => l.trim());
  const count = (ch) => firstLines.reduce((n, l) => n + (l.split(ch).length - 1), 0);
  const counts = [[',', count(',')], [';', count(';')], ['\t', count('\t')]];
  counts.sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ',';
  return pairsFromRows(parseCsv(text, delim));
}

function parseTxt(text) {
  const lines = text.split(/\r?\n/);
  // Layout A: TAB separated lines
  const tabbed = lines.filter((l) => l.includes('\t') && l.trim());
  if (tabbed.length >= Math.max(1, lines.filter((l) => l.trim()).length * 0.6)) {
    return pairsFromRows(lines.filter((l) => l.trim()).map((l) => l.split('\t')));
  }
  // Layout B: blocks separated by a blank line — first line = front, rest = back
  const blocks = text.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length >= 2) {
    const out = [];
    for (const block of blocks) {
      const ls = block.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (ls.length >= 2) {
        const card = cleanCard(ls[0], ls.slice(1).join('\n'));
        if (card) out.push(card);
      }
    }
    if (out.length) return out;
  }
  // Layout C: "front - back" per line (first occurrence of " - ")
  const out = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const idx = l.indexOf(' - ');
    if (idx > 0) {
      const card = cleanCard(l.slice(0, idx), l.slice(idx + 3));
      if (card) out.push(card);
    }
  }
  if (out.length) return out;
  // Layout D: comma/semicolon rows (e.g. AI-generated CSV saved as .txt)
  if (/[,;]/.test(text)) return parseDelimited(text);
  return out;
}

function parseJsonText(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('invalid JSON'); }
  const out = [];
  const pick = (o) => {
    const keys = ['front', 'question', 'word', 'term', 'q', 'جلو', 'سؤال', 'سوال'];
    const bkeys = ['back', 'answer', 'meaning', 'definition', 'a', 'عقب', 'جواب', 'پاسخ', 'معنی'];
    const f = keys.map((k) => o[k]).find((v) => v != null);
    const b = bkeys.map((k) => o[k]).find((v) => v != null);
    return [f, b];
  };
  if (Array.isArray(data)) {
    for (const item of data) {
      if (Array.isArray(item) && item.length >= 2) {
        const card = cleanCard(item[0], item[1]);
        if (card) out.push(card);
      } else if (item && typeof item === 'object') {
        const [f, b] = pick(item);
        const card = cleanCard(f, b);
        if (card) out.push(card);
      }
    }
  } else if (data && typeof data === 'object') {
    // allow { "cards": [...] } / { "deck": [...] }
    const arr = data.cards || data.deck || data.items || data.flashcards;
    if (Array.isArray(arr)) return parseJsonText(JSON.stringify(arr));
  }
  return out;
}

// bytes: Uint8Array; name: original file name (used for extension sniffing)
// returns { cards: [{front, back}], format: 'csv'|'tsv'|'txt'|'json' }
export function parseImportFile(bytes, name = '') {
  if (bytes.length > LIMITS.maxBytes) throw new Error('TOO_BIG');
  const text = decode(bytes);
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

  let cards = [];
  let format = ext;
  if (ext === 'json') {
    format = 'json';
    cards = parseJsonText(text);
  } else if (ext === 'tsv') {
    format = 'tsv';
    cards = pairsFromRows(text.split(/\r?\n/).map((l) => l.split('\t')));
  } else if (ext === 'csv') {
    format = 'csv';
    cards = parseDelimited(text);
  } else if (ext === 'txt' || ext === 'md' || ext === '') {
    format = 'txt';
    cards = parseTxt(text);
    if (!cards.length && text.trim().startsWith('[')) { cards = parseJsonText(text); format = 'json'; }
  } else {
    throw new Error('BAD_FORMAT');
  }

  if (cards.length > LIMITS.maxCards) cards = cards.slice(0, LIMITS.maxCards);
  return { cards, format };
}

// Parse a backup JSON (restore). Returns { settings?, decks: [{name, emoji, cards}] }.
export function parseBackupJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('invalid JSON'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.decks)) throw new Error('not a backup');
  const decks = [];
  for (const d of data.decks) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.cards)) continue;
    const name = String(d.name || '').trim();
    if (!name) continue;
    const cards = [];
    for (const c of d.cards) {
      if (!c || typeof c !== 'object') continue;
      const card = cleanCard(c.front, c.back);
      if (!card) continue;
      const house = Math.min(5, Math.max(1, parseInt(c.house, 10) || 1));
      const ease = Math.min(1.45, Math.max(0.6, Number(c.ease) || 1));
      cards.push({
        ...card,
        house,
        ease,
        reps: Math.max(0, parseInt(c.reps, 10) || 0),
        lapses: Math.max(0, parseInt(c.lapses, 10) || 0),
        due: Number.isFinite(c.due) ? Math.floor(c.due) : Math.floor(Date.now() / 1000),
        lastResult: c.lastResult === 1 ? 1 : c.lastResult === 0 ? 0 : null,
      });
    }
    decks.push({ name: name.slice(0, 100), emoji: String(d.emoji || '📚').slice(0, 8), cards });
  }
  return {
    settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
    decks,
  };
}
