// ---------------------------------------------------------------------------
// lib/srs.js — spaced repetition engine.
//
// Model: Leitner boxes ("houses") 1..5 with expanding intervals, plus an
// SM-2-inspired per-card ease multiplier that adapts to how hard the card is
// for this user. Wrong answers trigger a short "relearning" step (10 min),
// mirroring modern implementations (Anki/FSRS relearning), and the card
// returns either to house 1 or to the previous house — a per-user setting.
//
// Interval bases (days) follow classic expanding-spacing research
// (Ebbinghaus; Cepeda et al. 2006): ~1, 3, 7, 16, 35 days.
// ---------------------------------------------------------------------------
export const HOUSES = 5;

// index = house (1-based) → base interval in minutes
export const HOUSE_INTERVALS_MIN = [0, 1440, 4320, 10080, 23040, 50400]; // 1d, 3d, 7d, 16d, 35d

export const RELEARN_MIN = 10;        // a missed card comes back after 10 minutes
export const EASE_MAX = 1.45;
export const EASE_MIN = 0.6;
export const EASE_STEP_UP = 0.06;     // gained per correct answer
export const EASE_STEP_DOWN = 0.2;    // lost per lapse

export function nextDueSeconds(card, correct, failBehavior, nowSec = Math.floor(Date.now() / 1000)) {
  let house, ease, due, moved;
  if (correct) {
    house = Math.min(HOUSES, (card.house || 1) + 1);
    ease = Math.min(EASE_MAX, (card.ease ?? 1) + EASE_STEP_UP);
    due = nowSec + Math.round(HOUSE_INTERVALS_MIN[house] * 60 * ease);
    moved = house === (card.house || 1) ? 'stayed' : 'up';
  } else {
    if (failBehavior === 'previous') house = Math.max(1, (card.house || 1) - 1);
    else house = 1;
    ease = Math.max(EASE_MIN, (card.ease ?? 1) - EASE_STEP_DOWN);
    due = nowSec + RELEARN_MIN * 60;
    moved = house === (card.house || 1) ? 'stayed' : 'down';
  }
  return { house, ease, due, moved, requeue: !correct };
}

export function intervalLabel(seconds, lang) {
  const min = Math.round(seconds / 60);
  if (min < 60) return lang === 'fa' ? `${min} دقیقه` : `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'fa' ? `${h} ساعت` : `${h}h`;
  const d = Math.round(h / 24);
  return lang === 'fa' ? `${d} روز` : `${d}d`;
}

// Streak bookkeeping (UTC day granularity).
function utcDateStr(sec = Math.floor(Date.now() / 1000)) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export function nextStreak(prevStreak, lastDate, nowSec = Math.floor(Date.now() / 1000)) {
  const today = utcDateStr(nowSec);
  if (lastDate === today) return { streak: prevStreak || 1, lastDate: today, changed: false };
  const yesterday = utcDateStr(nowSec - 86400);
  const streak = lastDate === yesterday ? (prevStreak || 0) + 1 : 1;
  return { streak, lastDate: today, changed: true };
}
