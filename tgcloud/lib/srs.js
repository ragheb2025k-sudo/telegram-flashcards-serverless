// ---------------------------------------------------------------------------
// lib/srs.js — spaced repetition engine: FSRS-6 (Free Spaced Repetition
// Scheduler, version 6). This is the current state of the art in review
// scheduling — the same algorithm family that ships in Anki 25.x. It is
// derived from the DSR three-component memory model (Difficulty, Stability,
// Retrievability) validated on hundreds of millions of real review logs:
//
//   • Difficulty D ∈ [1,10]  — how hard the card is for this learner.
//   • Stability S (days)     — interval at which recall probability ≈ 90%.
//   • Retrievability R       — power forgetting curve  R(t) = (1+F·t/S)^DECAY.
//
// Intervals are computed at a 90% target retention (the default and the
// value recommended by the FSRS authors). Formulas below are a faithful
// port of the official reference implementations (open-spaced-repetition
// py-fsrs / ts-fsrs v5.2.1, DEFAULT_PARAMETERS w0..w20).
//
// The Leitner-style "houses" remain as a display layer: the house is now
// derived from stability (house 5 = interval ≥ 21 days = mastered), and the
// per-user "missed card → house 1 / previous house" setting maps onto how
// harshly a lapse resets memory: strict = full reset to S₀(Again), gentle =
// the FSRS post-lapse stability estimate.
// ---------------------------------------------------------------------------
export const HOUSES = 5;

export const FSRS_W = [
  0.212,   // w0  S0(Again)
  1.2931,  // w1  S0(Hard)
  2.3065,  // w2  S0(Good)
  8.2956,  // w3  S0(Easy)
  6.4133,  // w4  D0 base
  0.8334,  // w5  D0 spread
  3.0194,  // w6  D update delta
  0.001,   // w7  D mean-reversion weight
  1.8722,  // w8  recall stability coefficient
  0.1666,  // w9  recall stability S exponent
  0.796,   // w10 recall stability R coefficient
  1.4835,  // w11 post-lapse stability base
  0.0614,  // w12 post-lapse D exponent
  0.2629,  // w13 post-lapse S exponent
  1.6483,  // w14 post-lapse R coefficient
  0.6014,  // w15 hard penalty
  1.8729,  // w16 easy bonus
  0.5425,  // w17 short-term / post-lapse clamp
  0.0912,  // w18 short-term offset
  0.0658,  // w19 short-term S exponent
  0.1542,  // w20 decay
];

export const RETENTION = 0.9;          // target recall probability
export const DECAY = -FSRS_W[20];
export const FACTOR = Math.pow(RETENTION, 1 / DECAY) - 1;   // ≈ 0.9805
export const S_MIN = 0.001;
export const S_MAX = 36500;
export const D_MIN = 1;
export const D_MAX = 10;
export const MAX_INTERVAL_DAYS = 36500;

export const RELEARN_MIN = 10;         // a missed card comes back after 10 minutes

// Ratings (Anki-style). The UI is binary: wrong → AGAIN, right → GOOD.
export const R_AGAIN = 1;
export const R_HARD = 2;
export const R_GOOD = 3;
export const R_EASY = 4;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// --- memory model primitives (official FSRS-6 formulas) --------------------

export function initialStability(g) {
  return Math.max(FSRS_W[g - 1], S_MIN);
}

export function initialDifficulty(g) {
  return clamp(FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1, D_MIN, D_MAX);
}

// R(t, S) — probability of recall after t days with stability S.
export function retrievability(elapsedDays, s) {
  return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
}

export function nextDifficulty(d, g) {
  const delta = -FSRS_W[6] * (g - 3);
  const damped = d + ((10 - d) * delta) / 9;              // linear damping
  const reverted = FSRS_W[7] * initialDifficulty(R_EASY) + (1 - FSRS_W[7]) * damped;
  return clamp(reverted, D_MIN, D_MAX);
}

export function nextRecallStability(d, s, r, g) {
  const hardPenalty = g === R_HARD ? FSRS_W[15] : 1;
  const easyBonus = g === R_EASY ? FSRS_W[16] : 1;
  const inc =
    Math.exp(FSRS_W[8]) *
    (11 - d) *
    Math.pow(s, -FSRS_W[9]) *
    (Math.exp((1 - r) * FSRS_W[10]) - 1) *
    hardPenalty *
    easyBonus;
  return clamp(s * (1 + inc), S_MIN, S_MAX);
}

export function nextForgetStability(d, s, r) {
  const longTerm =
    FSRS_W[11] *
    Math.pow(d, -FSRS_W[12]) *
    (Math.pow(s + 1, FSRS_W[13]) - 1) *
    Math.exp((1 - r) * FSRS_W[14]);
  const shortTermCap = s / Math.exp(FSRS_W[17] * FSRS_W[18]); // lapses must lower S
  return clamp(Math.min(longTerm, shortTermCap), S_MIN, S_MAX);
}

// Same-day (short-term) stability — used when a card is re-reviewed < 1 day later.
export function shortTermStability(s, g) {
  let inc = Math.exp(FSRS_W[17] * (g - 3 + FSRS_W[18])) * Math.pow(s, -FSRS_W[19]);
  if (g >= R_GOOD) inc = Math.max(inc, 1);   // success can only hold or grow S
  return clamp(s * inc, S_MIN, S_MAX);
}

// Interval in days at RETENTION probability of recall.
export function intervalDays(s) {
  const ivl = (s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, MAX_INTERVAL_DAYS);
}

// --- Leitner-style display layer -------------------------------------------

// Stability (days) → house 1..5. House 5 ("mastered") = scheduled ≥ 21 days out,
// the classic consolidation criterion from spacing research.
export function houseFromStability(s) {
  if (s >= 21) return 5;
  if (s >= 7) return 4;
  if (s >= 3) return 3;
  if (s >= 1) return 2;
  return 1;
}

// One-time backfill for cards created under the old Leitner/SM-2 engine:
// map their current house onto an equivalent FSRS memory state.
const LEGACY_S = [0, 1, 3, 7, 16, 35];   // index = house

function legacyState(card) {
  const house = clamp(card.house || 1, 1, HOUSES);
  return {
    stability: LEGACY_S[house],
    difficulty: clamp(7 - 0.6 * house, D_MIN, D_MAX),
  };
}

// --- main entry point (same signature as the previous engine) ---------------
// card: { stability?, difficulty?, house, ease, reps, lapses, lastReview? }
// correct: boolean   failBehavior: 'house1' (strict) | 'previous' (gentle)
export function nextDueSeconds(card, correct, failBehavior, nowSec = Math.floor(Date.now() / 1000)) {
  const rating = correct ? R_GOOD : R_AGAIN;
  const lastReviewSec = card.lastReview instanceof Date
    ? Math.floor(card.lastReview.getTime() / 1000)
    : (card.lastReview ?? null);

  let s = card.stability ?? null;
  let d = card.difficulty ?? null;
  const everStudied = (card.reps > 0 || card.lapses > 0) || (s != null && d != null);

  if (everStudied && (s == null || d == null)) {
    // legacy row without FSRS state → backfill from its house
    const legacy = legacyState(card);
    s = legacy.stability;
    d = legacy.difficulty;
  }

  if (!everStudied || s == null || d == null) {
    s = initialStability(rating);
    d = initialDifficulty(rating);
  } else {
    const elapsedDays = lastReviewSec == null ? 0 : Math.max(0, (nowSec - lastReviewSec) / 86400);
    if (elapsedDays < 1) {
      // same-day re-review (e.g. in-session relearning) → short-term path
      s = shortTermStability(s, rating);
      d = nextDifficulty(d, rating);
    } else {
      const r = retrievability(elapsedDays, s);
      if (rating === R_AGAIN) {
        s = nextForgetStability(d, s, r);
        if (failBehavior === 'house1') {
          // strict mode: a miss resets memory to a fresh first-sight state
          s = initialStability(R_AGAIN);
        }
      } else {
        s = nextRecallStability(d, s, r, rating);
      }
      d = nextDifficulty(d, rating);
    }
  }

  const house = houseFromStability(s);
  const oldHouse = clamp(card.house || 1, 1, HOUSES);
  const moved = house > oldHouse ? 'up' : house < oldHouse ? 'down' : 'stayed';

  let due;
  if (!correct) {
    due = nowSec + RELEARN_MIN * 60;           // relearning step (10 min)
  } else {
    due = nowSec + intervalDays(s) * 86400;    // graduate at 90% retention
  }

  return { house, stability: s, difficulty: d, due, moved, requeue: !correct };
}

export function intervalLabel(seconds, lang) {
  const min = Math.round(seconds / 60);
  if (min < 60) return lang === 'fa' ? `${min} دقیقه` : `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'fa' ? `${h} ساعت` : `${h}h`;
  const d = Math.round(h / 24);
  return lang === 'fa' ? `${d} روز` : `${d}d`;
}

// --- daily goal & streak (Duolingo-style chain) -----------------------------

export function utcDateStr(sec = Math.floor(Date.now() / 1000)) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

// The streak counts CONSECUTIVE DAYS ON WHICH THE DAILY GOAL WAS MET.
export function nextStreak(prevStreak, lastGoalDate, nowSec = Math.floor(Date.now() / 1000)) {
  const today = utcDateStr(nowSec);
  if (lastGoalDate === today) return { streak: prevStreak || 1, lastDate: today, changed: false };
  const yesterday = utcDateStr(nowSec - 86400);
  const streak = lastGoalDate === yesterday ? (prevStreak || 0) + 1 : 1;
  return { streak, lastDate: today, changed: true };
}

// Call after every answered card. Returns the full progress patch to persist.
export function bumpDailyProgress(user, nowSec = Math.floor(Date.now() / 1000)) {
  const today = utcDateStr(nowSec);
  const todayCount = user.todayDate === today ? (user.todayCount || 0) + 1 : 1;

  let streak = user.streak || 0;
  let lastGoalDate = user.lastGoalDate || null;
  let goalLog = String(user.goalLog || '').split(',').filter(Boolean);
  let goalJustMet = false;

  const goal = Math.max(1, user.dailyGoal || 20);
  if (todayCount >= goal && lastGoalDate !== today) {
    const st = nextStreak(streak, lastGoalDate, nowSec);
    streak = st.streak;
    lastGoalDate = today;
    goalJustMet = true;
    goalLog.push(today);
    if (goalLog.length > 60) goalLog = goalLog.slice(-60);
  }

  return {
    todayDate: today,
    todayCount,
    streak,
    lastGoalDate,
    goalLog: goalLog.join(','),
    goalJustMet,
  };
}
