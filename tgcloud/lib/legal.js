// ---------------------------------------------------------------------------
// lib/legal.config.js — single source of truth for owner identity & legal
// texts (Telegram compliance: /privacy /terms /support /paysupport).
// Injected into every legal command, the Mini App legal screens and footers.
// ---------------------------------------------------------------------------
export const BRAND_NAME = 'Botmaker Telegram';
export const SUPPORT_HANDLE = '@Botmaker_Telegram';
export const SUPPORT_CHANNEL_URL = 'https://t.me/Botmaker_Telegram';
export const CONTACT_EMAIL = 'ragheb2025k@gmail.com';
export const LEGAL_UPDATED = '2025-11-12';

// What data this bot stores (shared by /privacy and the Mini App privacy page)
export const DATA_COLLECTED = [
  'Telegram user id (numeric)',
  'First name (display only)',
  'Language code (to pick fa/en)',
  'Your flashcards: decks, cards, review progress, daily goal & streak',
];
