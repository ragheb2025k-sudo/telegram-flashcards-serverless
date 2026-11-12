/* ============================================================
   FlashCards Mini App — application logic
   Vanilla JS. Talks to the bot's serverless endpoints via
   Telegram.WebApp.Serverless.call; falls back to a full local
   demo mode (localStorage) outside Telegram.
   ============================================================ */
(() => {
  'use strict';

  // ---------------- tiny helpers ----------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
  const nowSec = () => Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // ---------------- Telegram wrapper ----------------
  // Real Telegram context = a non-empty initData string (the platform signs
  // it). Outside Telegram the SDK still exposes Serverless + initDataUnsafe
  // ({}), so we must not rely on their presence.
  const TG = window.Telegram?.WebApp;
  const IN_TG = !!(TG
    && typeof TG.initData === 'string'
    && TG.initData.length > 0
    && TG.Serverless);
  const tg = IN_TG ? TG : null;

  const Haptic = {
    ok() { try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {} },
    no() { try { tg?.HapticFeedback?.notificationOccurred('error'); } catch {} },
    tap() { try { tg?.HapticFeedback?.impactOccurred('light'); } catch {} },
  };

  // ---------------- i18n ----------------
  const state = {
    lang: 'fa',
    theme: 'auto',
    failBehavior: 'house1',
    dailyGoal: 20,
    uiFont: 1,
    cardFont: 1,
    onboarded: false,
    streak: 0,
    todayCount: 0,
    goalLog: [],
    lastGoalDate: null,
    firstName: '',
    decks: [],
    totals: { decks: 0, cards: 0, due: 0, mastered: 0 },
    screen: 'home',
    currentDeck: null,      // {id, name, emoji}
    deckCards: [],
    houseFilter: 0,         // 0 = all
    session: null,
    summary: null,
  };

  const T = (key, params) => fmt(window.I18N[state.lang]?.[key] ?? window.I18N.en[key] ?? key, params);

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'fa' ? 'rtl' : 'ltr';
    $('#app-title').textContent = T('appName');
    $('#boot-text').textContent = T('loading');
    // static translations
    $$('[data-t]').forEach((el) => { el.textContent = T(el.dataset.t); });
  }

  // ---------------- theme ----------------
  function applyTheme() {
    let dark = false;
    const inline = document.documentElement.style;
    if (state.theme === 'auto') {
      const tp = tg?.themeParams;
      if (tp && tp.bg_color) {
        // trust Telegram's theme and mirror its background
        dark = isDarkColor(tp.bg_color);
        inline.setProperty('--bg', tp.bg_color);
        inline.setProperty('--text', tp.text_color || '');
      } else {
        dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        inline.removeProperty('--bg');
        inline.removeProperty('--text');
      }
    } else {
      // explicit light/dark → clear any inline vars injected by Telegram's
      // auto theme, otherwise they would override the palette below
      dark = state.theme === 'dark';
      inline.removeProperty('--bg');
      inline.removeProperty('--text');
    }
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { tg?.setHeaderColor?.(dark ? '#141210' : '#f4f1ec'); tg?.setBackgroundColor?.(dark ? '#141210' : '#f4f1ec'); } catch {}
  }
  function isDarkColor(hex) {
    const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 120;
  }

  // ---------------- font scaling (Settings > Font size) ----------------
  function applyFonts() {
    const s = document.documentElement.style;
    s.setProperty('--fs-ui', String(Math.min(1.35, Math.max(0.85, Number(state.uiFont) || 1))));
    s.setProperty('--fs-card', String(Math.min(1.8, Math.max(0.8, Number(state.cardFont) || 1))));
  }

  // ---------------- API layer ----------------
  function serverlessCall(name, input) {
    return new Promise((resolve, reject) => {
      try {
        tg.Serverless.call(name, input || {}, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      } catch (e) { reject(e); }
    });
  }

  // ---- demo backend (localStorage) — mirrors the server endpoints ----
  const Demo = {
    KEY: 'flashcards-demo-v1',
    load() {
      try { return JSON.parse(localStorage.getItem(this.KEY)) || this.seed(); }
      catch { return this.seed(); }
    },
    save(db) { localStorage.setItem(this.KEY, JSON.stringify(db)); },
    seed() {
      const db = {
        seq: 1,
        user: {
          lang: state.lang, theme: state.theme, failBehavior: state.failBehavior,
          dailyGoal: 20, uiFont: 1, cardFont: 1, onboarded: 0,
          streak: 0, lastStudyDate: null,
          lastGoalDate: null, todayDate: null, todayCount: 0, goalLog: [],
        },
        decks: [],
      };
      localStorage.setItem(this.KEY, JSON.stringify(db));
      return db;
    },
    // FSRS-6 compact mirror of tgcloud/lib/srs.js (official default weights)
    W: [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542],
    DECAY: -0.1542,
    FACTOR: Math.pow(0.9, 1 / -0.1542) - 1,
    clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); },
    intervalDays(s) {
      const ivl = (s / this.FACTOR) * (Math.pow(0.9, 1 / this.DECAY) - 1);
      return this.clamp(Math.round(ivl), 1, 36500);
    },
    houseOf(s) { return s >= 21 ? 5 : s >= 7 ? 4 : s >= 3 ? 3 : s >= 1 ? 2 : 1; },
    schedule(card, correct, failBehavior) {
      const t = nowSec();
      const g = correct ? 3 : 1;
      const W = this.W;
      let S = card.stability ?? null;
      let D = card.difficulty ?? null;
      const studied = card.reps > 0 || card.lapses > 0;
      if (studied && (S == null || D == null)) {
        S = [0, 1, 3, 7, 16, 35][Math.min(5, card.house || 1)] || 1;
        D = this.clamp(7 - 0.6 * (card.house || 1), 1, 10);
      }
      if (!studied || S == null || D == null) {
        S = Math.max(W[g - 1], 0.001);
        D = this.clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
      } else {
        const elapsed = card.lastReview ? Math.max(0, t - card.lastReview) : 0;
        if (elapsed < 86400) {
          // same-day short-term path
          let inc = Math.exp(W[17] * (g - 3 + W[18])) * Math.pow(S, -W[19]);
          if (g >= 3) inc = Math.max(inc, 1);
          S = this.clamp(S * inc, 0.001, 36500);
        } else {
          const r = Math.pow(1 + this.FACTOR * elapsed / 86400 / S, this.DECAY);
          if (g === 1) {
            S = Math.min(
              W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]),
              S / Math.exp(W[17] * W[18])
            );
            if (failBehavior === 'house1') S = Math.max(W[0], 0.001);
          } else {
            S = S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp((1 - r) * W[10]) - 1));
          }
          S = this.clamp(S, 0.001, 36500);
        }
        // difficulty update: linear damping + mean reversion
        const dInit = this.clamp(W[4] - Math.exp(W[5] * 3) + 1, 1, 10);
        const damped = D + ((10 - D) * (-W[6] * (g - 3))) / 9;
        D = this.clamp(W[7] * dInit + (1 - W[7]) * damped, 1, 10);
      }
      const oldHouse = card.house || 1;
      card.stability = S;
      card.difficulty = D;
      card.house = this.houseOf(S);
      card.due = correct ? t + this.intervalDays(S) * 86400 : t + 600;
      card.lastReview = t;
      if (correct) card.reps++; else card.lapses++;
      card.lastResult = correct ? 1 : 0;
      return card.house > oldHouse ? 'up' : card.house < oldHouse ? 'down' : 'stayed';
    },
    goalPatch(db, res) {
      const today = new Date().toISOString().slice(0, 10);
      if (db.user.todayDate !== today) { db.user.todayDate = today; db.user.todayCount = 0; }
      db.user.todayCount = (db.user.todayCount || 0) + 1;
      const goal = Math.max(1, db.user.dailyGoal || 20);
      if (db.user.todayCount >= goal && db.user.lastGoalDate !== today) {
        const y = new Date(Date.now() - DAY * 1000).toISOString().slice(0, 10);
        db.user.streak = db.user.lastGoalDate === y ? (db.user.streak || 0) + 1 : 1;
        db.user.lastGoalDate = today;
        db.user.goalLog = [...(db.user.goalLog || []), today].slice(-60);
        if (res) res.goalJustMet = true;
      }
      if (res) { res.todayCount = db.user.todayCount; res.dailyGoal = goal; }
    },
    handle(name, input = {}) {
      const db = this.load();
      let res = {};
      switch (name) {
        case 'getHome': {
          const today = new Date().toISOString().slice(0, 10);
          const tc = db.user.todayDate === today ? (db.user.todayCount || 0) : 0;
          const decks = db.decks.map((d) => ({
            id: d.id, name: d.name, emoji: d.emoji,
            cards: d.cards.length,
            due: d.cards.filter((c) => c.due <= nowSec()).length,
            mastered: d.cards.filter((c) => c.house === 5).length,
            fresh: d.cards.filter((c) => c.reps === 0 && c.lapses === 0).length,
          }));
          res = {
            user: { ...db.user, goalLog: db.user.goalLog || [], todayCount: tc, todayDate: today, firstName: '', onboarded: !!db.user.onboarded },
            totals: {
              decks: decks.length,
              cards: decks.reduce((a, d) => a + d.cards, 0),
              due: decks.reduce((a, d) => a + d.due, 0),
              mastered: decks.reduce((a, d) => a + d.mastered, 0),
            },
            decks,
          };
          break;
        }
        case 'getDeck': {
          const d = db.decks.find((x) => x.id === input.deckId);
          if (!d) throw new Error('NO_DECK');
          res = { deck: { id: d.id, name: d.name, emoji: d.emoji }, cards: d.cards.map((c) => ({ ...c, isNew: c.reps === 0 && c.lapses === 0 })) };
          break;
        }
        case 'createDeck': {
          const deck = { id: db.seq++, name: input.name, emoji: input.emoji || '📚', cards: [] };
          db.decks.push(deck);
          res = { deck: { id: deck.id, name: deck.name, emoji: deck.emoji } };
          break;
        }
        case 'updateDeck': {
          const d = db.decks.find((x) => x.id === input.deckId);
          if (d && input.name) d.name = input.name;
          if (d && input.emoji) d.emoji = input.emoji;
          res = { deck: d && { id: d.id, name: d.name, emoji: d.emoji } };
          break;
        }
        case 'deleteDeck': {
          db.decks = db.decks.filter((x) => x.id !== input.deckId);
          res = { ok: true };
          break;
        }
        case 'addCards': case 'importDeck': {
          let deck;
          if (name === 'addCards') {
            deck = db.decks.find((x) => x.id === input.deckId);
            if (!deck) throw new Error('NO_DECK');
          } else {
            deck = db.decks.find((x) => x.name === input.name);
            if (!deck) { deck = { id: db.seq++, name: input.name, emoji: input.emoji || '📚', cards: [] }; db.decks.push(deck); }
          }
          const known = new Set(deck.cards.map((c) => c.front + '\u0000' + c.back));
          let added = 0, skipped = 0;
          for (const item of (input.cards || [])) {
            const f = String(item.front || '').trim(), b = String(item.back || '').trim();
            if (!f || !b) continue;
            const key = f + '\u0000' + b;
            if (known.has(key)) { skipped++; continue; }
            known.add(key);
            deck.cards.push({ id: db.seq++, deckId: deck.id, front: f, back: b, house: 1, ease: 1, reps: 0, lapses: 0, due: nowSec(), lastResult: null, isNew: true });
            added++;
          }
          res = { deck: { id: deck.id, name: deck.name, emoji: deck.emoji }, added, skipped };
          break;
        }
        case 'updateCard': {
          for (const d of db.decks) {
            const c = d.cards.find((x) => x.id === input.cardId);
            if (c) { if (input.front != null) c.front = input.front; if (input.back != null) c.back = input.back; res = { card: c }; break; }
          }
          break;
        }
        case 'deleteCard': {
          for (const d of db.decks) d.cards = d.cards.filter((x) => x.id !== input.cardId);
          res = { ok: true };
          break;
        }
        case 'resetDeckProgress': {
          const d = db.decks.find((x) => x.id === input.deckId);
          if (d) d.cards.forEach((c) => { c.house = 1; c.ease = 1; c.stability = null; c.difficulty = null; c.reps = 0; c.lapses = 0; c.lastResult = null; c.lastReview = null; c.due = nowSec(); c.isNew = true; });
          res = { ok: true };
          break;
        }
        case 'getReview': {
          let pool = [];
          if (input.deckId != null && input.deckId !== 'all') {
            const d = db.decks.find((x) => x.id === input.deckId);
            pool = d ? d.cards : [];
          } else {
            pool = db.decks.flatMap((d) => d.cards);
          }
          const due = pool.filter((c) => c.due <= nowSec())
            .sort((a, b) => a.house - b.house || a.due - b.due);
          res = { cards: due.slice(0, input.limit || 20).map((c) => ({ ...c })), remaining: due.length, deckId: input.deckId ?? null };
          break;
        }
        case 'answerCard': {
          for (const d of db.decks) {
            const c = d.cards.find((x) => x.id === input.cardId);
            if (c) {
              const moved = this.schedule(c, !!input.correct, db.user.failBehavior);
              res = { card: { ...c, isNew: false }, moved, requeue: !input.correct, nextDue: c.due, streak: db.user.streak || 0 };
              this.goalPatch(db, res);
              res.streak = db.user.streak || 0;
              break;
          }
          }
          break;
        }
        case 'saveSettings': {
          if (input.lang) db.user.lang = input.lang;
          if (input.theme) db.user.theme = input.theme;
          if (input.failBehavior) db.user.failBehavior = input.failBehavior;
          if (input.dailyGoal != null && input.dailyGoal !== '') {
            const n = Number(input.dailyGoal);
            if (Number.isFinite(n)) db.user.dailyGoal = Math.min(500, Math.max(1, Math.round(n)));
          }
          for (const k of ['uiFont', 'cardFont']) {
            if (input[k] != null && input[k] !== '') {
              const n = Number(input[k]);
              if (Number.isFinite(n)) db.user[k] = Math.round(Math.min(1.8, Math.max(0.8, n)) * 100) / 100;
            }
          }
          if (input.onboarded != null) db.user.onboarded = input.onboarded ? 1 : 0;
          res = { user: { ...db.user, goalLog: db.user.goalLog || [], onboarded: !!db.user.onboarded } };
          break;
        }
        case 'deleteMyData': {
          localStorage.removeItem(this.KEY);
          return { ok: true, cardsDeleted: 0, decksDeleted: 0 }; // skip this.save(db)
        }
        case 'createBackup': {
          const n = db.decks.reduce((a, d) => a + d.cards.length, 0);
          if (!n) res = { ok: false, empty: true };
          else res = { ok: true, filename: 'flashcards-backup-demo.zip' };
          break;
        }
      }
      this.save(db);
      return res;
    },
  };

  async function api(name, input) {
    if (IN_TG && tg.Serverless) {
      return serverlessCall(name, input);
    }
    await new Promise((r) => setTimeout(r, 120)); // simulate latency
    return Demo.handle(name, input);
  }

  // ---------------- toasts & dialogs ----------------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function confirmDialog(text) {
    return new Promise((resolve) => {
      if (tg?.showConfirm) {
        tg.showConfirm(text, (ok) => resolve(ok));
        return;
      }
      openModal(`
        <h3>${esc(T('confirm'))}</h3>
        <p style="font-size:14px;line-height:1.9;color:var(--text-dim)">${esc(text)}</p>
        <div class="row">
          <button class="btn btn-secondary" data-x="no">${esc(T('cancel'))}</button>
          <button class="btn btn-primary" data-x="yes">${esc(T('yes'))}</button>
        </div>`, (root) => {
        root.querySelector('[data-x="no"]').onclick = () => { closeModal(); resolve(false); };
        root.querySelector('[data-x="yes"]').onclick = () => { closeModal(); resolve(true); };
      });
    });
  }

  function copyText(text) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    };
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(fallback);
    }
    return Promise.resolve(fallback());
  }

  // ---------------- modal engine ----------------
  function openModal(html, setup) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    $('#modal-root').appendChild(backdrop);
    if (setup) setup(backdrop.querySelector('.modal'), backdrop);
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
  }

  // ---------------- navigation ----------------
  const SCREENS = ['home', 'deck', 'review', 'summary', 'settings'];
  function show(screen) {
    state.screen = screen;
    SCREENS.forEach((s) => $('#screen-' + s).classList.toggle('hidden', s !== screen));
    $('#fab').classList.toggle('hidden', screen !== 'home');
    $('#btn-settings').classList.toggle('hidden', screen !== 'home');
    $('#btn-theme').classList.toggle('hidden', screen !== 'home');
    const canBack = ['deck', 'settings', 'summary'].includes(screen);
    $('#btn-back').classList.toggle('hidden', !canBack);
    try {
      if (canBack || screen === 'review') tg?.BackButton?.show(); else tg?.BackButton?.hide();
    } catch {}
    if (screen !== 'review') state.session = null;
    window.scrollTo({ top: 0 });
  }

  // ================= HOME =================
  async function loadHome() {
    try {
      const data = await api('getHome');
      state.lang = data.user.lang || state.lang;
      state.theme = data.user.theme || state.theme;
      state.failBehavior = data.user.failBehavior || state.failBehavior;
      state.streak = data.user.streak || 0;
      state.dailyGoal = data.user.dailyGoal || 20;
      state.uiFont = Number(data.user.uiFont) || 1;
      state.cardFont = Number(data.user.cardFont) || 1;
      state.onboarded = Boolean(data.user.onboarded);
      state.todayCount = data.user.todayCount || 0;
      state.goalLog = Array.isArray(data.user.goalLog) ? data.user.goalLog : [];
      state.lastGoalDate = data.user.lastGoalDate || null;
      state.firstName = data.user.firstName || '';
      state.decks = data.decks || [];
      state.totals = data.totals || { decks: 0, cards: 0, due: 0, mastered: 0 };
      applyLang();
      applyTheme();
      applyFonts();
      renderHome();
      show('home');
      // first-ever visit → walk the user through the guide (configurable in Settings)
      if (!state.onboarded) showGuide(true);
    } catch (e) {
      console.error(e);
      $('#boot').classList.add('done');
      toast(T('errOffline'));
    }
  }

  function renderHome() {
    const g = state.firstName ? `${T('hello')} ${esc(state.firstName)} 👋` : `${T('hello')} 👋`;
    $('#home-greeting').textContent = g;
    $('#home-sub').textContent = T('heroSub');

    const chip = $('#streak-chip');
    chip.hidden = false;
    $('#streak-val').textContent = state.streak || 0;

    // review-all button — shows how many cards today's session holds,
    // based on the daily goal: min(due, goal − already-done-today).
    // After an early exit it naturally shows the remaining count (e.g. 12 of 20).
    const btnAll = $('#btn-review-all');
    const goal = Math.max(1, state.dailyGoal || 20);
    const leftToGoal = Math.max(0, goal - (state.todayCount || 0));
    const due = state.totals.due;
    if (due > 0) {
      btnAll.disabled = false;
      if (leftToGoal > 0) {
        // session size = today's remaining goal, capped by what is actually due
        $('#review-all-label').textContent = T('reviewAll', { n: Math.min(due, leftToGoal) });
      } else {
        // goal already ticked today → whatever is due is extra practice
        $('#review-all-label').textContent = T('reviewExtra', { n: due });
      }
    } else {
      btnAll.disabled = true;
      $('#review-all-label').textContent = T('reviewAllNone');
    }

    // stats
    $('#stats-row').innerHTML = `
      <div class="stat-box"><b>${state.totals.cards}</b><span>${T('statCards')}</span></div>
      <div class="stat-box hot"><b>${state.totals.due}</b><span>${T('statDue')}</span></div>
      <div class="stat-box"><b>${state.totals.mastered}</b><span>${T('statMastered')}</span></div>`;

    renderGoal();

    // decks
    const list = $('#deck-list');
    list.innerHTML = state.decks.map((d) => `
      <button class="deck-item" data-deck="${d.id}">
        <span class="deck-emoji">${esc(d.emoji)}</span>
        <span class="deck-info">
          <h4>${esc(d.name)}</h4>
          <p>${T('deckCardsCount', { n: d.cards })}${d.due ? ' · ' + T('deckDueCount', { n: d.due }) : ''}</p>
        </span>
        ${d.due ? `<span class="deck-badge">${d.due}</span>` : `<span class="deck-badge done">✓</span>`}
      </button>`).join('');
    $$('#deck-list [data-deck]').forEach((el) => {
      el.onclick = () => openDeck(Number(el.dataset.deck));
    });

    $('#home-empty').hidden = state.decks.length > 0;
    if (!state.decks.length) $('#home-empty-text').textContent = T('emptyHome');
    $('#boot').classList.add('done');
  }

  // ---------- daily goal / streak chain ----------
  const WD_FA = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];  // JS getDay: 0=Sun … 6=Sat
  const WD_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const RING_C = 113.1;  // circumference of r=18 circle

  function renderGoal() {
    const goal = Math.max(1, state.dailyGoal || 20);
    const done = Math.min(state.todayCount || 0, goal);
    const pct = Math.round((done / goal) * 100);
    $('#ring-fill').style.strokeDashoffset = String(RING_C - (RING_C * done) / goal);
    $('#ring-text').textContent = `${pct}%`;
    document.querySelector('.goal-ring').classList.toggle('done', done >= goal);
    $('#goal-streak').textContent = state.streak || 0;
    const status = $('#goal-status');
    if (done >= goal) status.textContent = T('goalDone');
    else if (done > 0) status.textContent = T('goalLeft', { n: goal - done });
    else status.textContent = T('goalToday', { done: 0, goal });

    // last 7 days chain — ✓ for days the goal was met
    const logSet = new Set(state.goalLog || []);
    const wd = state.lang === 'fa' ? WD_FA : WD_EN;
    const today = new Date().toISOString().slice(0, 10);
    let out = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY * 1000);
      const ds = d.toISOString().slice(0, 10);
      const isToday = ds === today;
      const isDone = logSet.has(ds) || (isToday && done >= goal);
      const label = isToday ? T('weekToday') : wd[d.getUTCDay()];
      let dot = '·';
      if (isDone) dot = '✓';
      else if (isToday && (state.todayCount || 0) > 0) dot = String(state.todayCount);
      out += `<div class="week-day${isToday ? ' today' : ''}${isDone ? ' done' : ''}"><span class="dot">${dot}</span><small>${esc(label)}</small></div>`;
    }
    $('#week-row').innerHTML = out;
  }

  // ================= DECK =================
  async function openDeck(deckId) {
    Haptic.tap();
    try {
      const data = await api('getDeck', { deckId });
      state.currentDeck = data.deck;
      state.deckCards = data.cards;
      state.houseFilter = 0;
      renderDeck();
      show('deck');
    } catch (e) { toast(T('errGeneric')); }
  }

  function dueLabel(c) {
    if (c.house === 5 && c.reps > 0) return { cls: 'mastered', text: T('mastered') };
    if (c.reps === 0 && c.lapses === 0) return { cls: '', text: T('dueNew') };
    const diff = c.due - nowSec();
    if (diff <= 0) return { cls: 'due', text: T('dueOverdue') };
    if (diff < DAY) return { cls: 'soon', text: T('dueToday') };
    const d = Math.ceil(diff / DAY);
    return { cls: '', text: T(d <= 7 ? 'dueSoon' : 'dueLater', { d }) };
  }

  function houseDots(house) {
    let out = '';
    for (let i = 1; i <= 5; i++) {
      out += `<i class="${i <= house ? (house === 5 ? 'master on' : 'on') : ''}"></i>`;
    }
    return `<span class="house-dots">${out}</span>`;
  }

  function renderDeck() {
    const d = state.currentDeck;
    $('#deck-emoji').textContent = d.emoji;
    $('#deck-name').textContent = d.name;
    const due = state.deckCards.filter((c) => c.due <= nowSec()).length;
    const mastered = state.deckCards.filter((c) => c.house === 5).length;
    $('#deck-meta').textContent = T('deckMeta', { cards: state.deckCards.length, mastered, due });

    $('#btn-deck-review').innerHTML = due
      ? `▶ ${T('reviewDeck', { n: due })}`
      : `▶ ${T('reviewDeckNone')}`;

    // legend
    $('#house-legend').innerHTML =
      `<button class="house-pill ${state.houseFilter === 0 ? 'active' : ''}" data-hf="0">${T('filterAll')} (${state.deckCards.length})</button>` +
      [1, 2, 3, 4, 5].map((h) => {
        const n = state.deckCards.filter((c) => c.house === h).length;
        return `<button class="house-pill ${state.houseFilter === h ? 'active' : ''}" data-hf="${h}">${T('house', { n: h })} (${n})</button>`;
      }).join('');
    $$('#house-legend [data-hf]').forEach((el) => {
      el.onclick = () => { state.houseFilter = Number(el.dataset.hf); renderDeck(); };
    });

    // cards
    const cards = state.houseFilter ? state.deckCards.filter((c) => c.house === state.houseFilter) : state.deckCards;
    const list = $('#card-list');
    list.innerHTML = cards.map((c) => {
      const dl = dueLabel(c);
      return `
      <div class="card-row" data-card="${c.id}" role="button" tabindex="0">
        <div class="card-row-main">
          <div class="front" dir="auto">${esc(c.front)}</div>
          <div class="back" dir="auto">${esc(c.back)}</div>
        </div>
        <div class="card-row-side">
          ${houseDots(c.house)}
          <span class="due-chip ${dl.cls}">${dl.text}</span>
        </div>
      </div>`;
    }).join('');
    $$('#card-list [data-card]').forEach((el) => {
      el.onclick = () => editCardModal(Number(el.dataset.card));
    });

    $('#deck-empty').hidden = cards.length > 0;
    if (!cards.length) $('#deck-empty-text').textContent = T('emptyDeck');
  }

  // ---- deck menu actions ----
  function deckMenu() {
    const d = state.currentDeck;
    $('#menu-rename').onclick = () => { $('#deck-menu').classList.add('hidden'); deckFormModal(d); };
    $('#menu-reset').onclick = async () => {
      $('#deck-menu').classList.add('hidden');
      if (await confirmDialog(T('resetQ'))) {
        await api('resetDeckProgress', { deckId: d.id });
        toast(T('saved'));
        refreshDeckAndHome();
      }
    };
    $('#menu-delete').onclick = async () => {
      $('#deck-menu').classList.add('hidden');
      if (await confirmDialog(T('deleteDeckQ', { name: d.name }))) {
        await api('deleteDeck', { deckId: d.id });
        toast(T('deleted'));
        await loadHome();
      }
    };
  }

  async function refreshDeckAndHome() {
    if (state.currentDeck) {
      const data = await api('getDeck', { deckId: state.currentDeck.id });
      state.currentDeck = data.deck;
      state.deckCards = data.cards;
      renderDeck();
    }
  }

  // ---- deck create/rename modal ----
  const EMOJIS = ['📚', '🃏', '🗣', '🌍', '🧬', '📐', '🏛', '⚗️', '🧠', '💻', '🎼', '⚖️', '🕌', '📖', '✈️', '🍳', '⚽', '🎬', '💊', '🌿'];

  function deckFormModal(deck = null) {
    let emoji = deck?.emoji || '📚';
    openModal(`
      <h3>${esc(deck ? T('renameDeckTitle') : T('createDeckTitle'))}</h3>
      <div class="field">
        <label>${esc(T('deckNameLabel'))}</label>
        <input type="text" id="mf-name" maxlength="100" value="${esc(deck?.name || '')}" placeholder="${esc(deck ? '' : (state.lang === 'fa' ? 'مثلاً: واژگان انگلیسی' : 'e.g. English vocabulary'))}">
      </div>
      <div class="field">
        <label>${esc(T('deckEmojiLabel'))}</label>
        <div class="emoji-picker">${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
      </div>
      <div class="row">
        <button class="btn btn-secondary" data-x="cancel">${esc(T('cancel'))}</button>
        <button class="btn btn-primary" data-x="save">${esc(T('save'))}</button>
      </div>`, (root) => {
      root.querySelectorAll('[data-e]').forEach((b) => {
        b.onclick = () => {
          emoji = b.dataset.e;
          root.querySelectorAll('[data-e]').forEach((x) => x.classList.toggle('active', x === b));
        };
      });
      root.querySelector('[data-x="cancel"]').onclick = closeModal;
      root.querySelector('[data-x="save"]').onclick = async () => {
        const name = root.querySelector('#mf-name').value.trim();
        if (!name) { root.querySelector('#mf-name').focus(); return; }
        try {
          if (deck) await api('updateDeck', { deckId: deck.id, name, emoji });
          else {
            const res = await api('createDeck', { name, emoji });
            state.currentDeck = res.deck;
          }
          closeModal();
          toast(T('saved'));
          if (deck) await refreshDeckAndHome(); else await openDeck(state.currentDeck.id);
          loadHomeSilently();
        } catch (e) { toast(T('errGeneric')); }
      };
      setTimeout(() => root.querySelector('#mf-name').focus(), 60);
    });
  }

  async function loadHomeSilently() {
    try {
      const data = await api('getHome');
      state.decks = data.decks;
      state.totals = data.totals;
      state.streak = data.user.streak || state.streak;
      state.dailyGoal = data.user.dailyGoal || state.dailyGoal;
      state.todayCount = data.user.todayCount || 0;
      state.goalLog = Array.isArray(data.user.goalLog) ? data.user.goalLog : state.goalLog;
      state.lastGoalDate = data.user.lastGoalDate || state.lastGoalDate;
      state.uiFont = Number(data.user.uiFont) || state.uiFont;
      state.cardFont = Number(data.user.cardFont) || state.cardFont;
      applyFonts();
      renderGoal();
      renderHome();
    } catch {}
  }

  // ---- card add/edit modal ----
  function cardModal(existing = null) {
    openModal(`
      <h3>${esc(existing ? T('cardTitleEdit') : T('cardTitleNew'))}</h3>
      <div class="field">
        <label>${esc(T('frontLabel'))}</label>
        <textarea id="mc-front" maxlength="1000" dir="auto">${esc(existing?.front || '')}</textarea>
        <span class="count" id="mc-front-count"></span>
      </div>
      <div class="field">
        <label>${esc(T('backLabel'))}</label>
        <textarea id="mc-back" maxlength="4000" dir="auto">${esc(existing?.back || '')}</textarea>
        <span class="count" id="mc-back-count"></span>
      </div>
      ${existing ? `
      <button class="btn btn-secondary" data-x="del" style="color:var(--bad)">🗑️ ${esc(T('menuDelete'))}</button>` : ''}
      <div class="row">
        <button class="btn btn-secondary" data-x="cancel">${esc(T('cancel'))}</button>
        ${existing ? '' : `<button class="btn btn-secondary" data-x="next">${esc(T('addAnother'))}</button>`}
        <button class="btn btn-primary" data-x="save">${esc(existing ? T('save') : T('addCardBtn'))}</button>
      </div>`, (root) => {
      const front = root.querySelector('#mc-front');
      const back = root.querySelector('#mc-back');
      const upd = () => {
        root.querySelector('#mc-front-count').textContent = `${front.value.length}/1000`;
        root.querySelector('#mc-back-count').textContent = `${back.value.length}/4000`;
      };
      front.oninput = upd; back.oninput = upd; upd();
      front.focus();

      const save = async (another) => {
        const f = front.value.trim(), b = back.value.trim();
        if (!f || !b) { (f ? back : front).focus(); return; }
        try {
          if (existing) {
            await api('updateCard', { cardId: existing.id, front: f, back: b });
            closeModal();
            toast(T('saved'));
            refreshDeckAndHome();
          } else {
            const res = await api('addCards', { deckId: state.currentDeck.id, cards: [{ front: f, back: b }] });
            Haptic.ok();
            if (res.skipped) toast(T('duplicateSkipped', { n: res.skipped }));
            if (another) {
              front.value = ''; back.value = ''; upd(); front.focus();
              refreshDeckAndHome();
            } else {
              closeModal();
              toast(T('added', { n: res.added }));
              refreshDeckAndHome();
            }
          }
        } catch (e) { toast(T('errGeneric')); }
      };
      root.querySelector('[data-x="cancel"]').onclick = closeModal;
      const nextBtn = root.querySelector('[data-x="next"]');
      if (nextBtn) nextBtn.onclick = () => save(true);
      root.querySelector('[data-x="save"]').onclick = () => save(false);
      const delBtn = root.querySelector('[data-x="del"]');
      if (delBtn) delBtn.onclick = async () => {
        if (await confirmDialog(T('deleteCardQ'))) {
          await api('deleteCard', { cardId: existing.id });
          closeModal();
          toast(T('deleted'));
          refreshDeckAndHome();
        }
      };
    });
  }
  function editCardModal(cardId) {
    Haptic.tap();
    const c = state.deckCards.find((x) => x.id === cardId);
    if (c) cardModal(c);
  }

  // ================= IMPORT =================
  // client-side parsers — mirror of tgcloud/lib/parse.js
  function parseCsvText(text, delim) {
    const rows = []; let row = []; let cell = ''; let q = false; let i = 0;
    const push = () => { row.push(cell); cell = ''; };
    const endRow = () => { push(); rows.push(row); row = []; };
    while (i < text.length) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === '') { q = true; i++; continue; }
      if (ch === delim) { push(); i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { endRow(); i++; continue; }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) endRow();
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  const HEADER_WORDS = new Set(['front', 'back', 'question', 'answer', 'q', 'a', 'word', 'meaning', 'term', 'definition', 'side1', 'side2', 'سؤال', 'سوال', 'جواب', 'پاسخ', 'رو', 'پشت', 'واژه', 'معنی', 'متن', 'ترجمه', 'کارت', 'جلو', 'عقب']);

  function rowsToCards(rows) {
    const out = [];
    if (!rows.length) return out;
    let start = 0;
    if (rows[0].every((c) => HEADER_WORDS.has(c.trim().toLowerCase()))) start = 1;
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) continue;
      const f = String(r[0] || '').trim(), b = String(r.slice(1).join(' ') || '').trim();
      if (f && b && f.length <= 1000 && b.length <= 4000) out.push({ front: f, back: b });
    }
    return out;
  }

  function parsePasteText(text) {
    const lines = text.split(/\r?\n/);
    const tabbed = lines.filter((l) => l.includes('\t') && l.trim());
    if (tabbed.length >= Math.max(1, lines.filter((l) => l.trim()).length * 0.6)) {
      return rowsToCards(lines.filter((l) => l.trim()).map((l) => l.split('\t')));
    }
    const blocks = text.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
    if (blocks.length >= 2) {
      const out = [];
      for (const block of blocks) {
        const ls = block.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (ls.length >= 2) {
          const f = ls[0], b = ls.slice(1).join('\n');
          if (f && b) out.push({ front: f, back: b });
        }
      }
      if (out.length) return out;
    }
    // try JSON
    if (text.trim().startsWith('[')) return parseJsonText(text);
    // layout "front - back"
    const out = [];
    for (const line of lines) {
      const l = line.trim(); if (!l) continue;
      const idx = l.indexOf(' - ');
      if (idx > 0) { const f = l.slice(0, idx).trim(), b = l.slice(idx + 3).trim(); if (f && b) out.push({ front: f, back: b }); }
    }
    if (out.length) return out;
    // comma / semicolon CSV (e.g. AI-generated flashcard exports pasted as text)
    const nonEmpty = lines.filter((l) => l.trim());
    if (nonEmpty.length >= 2) {
      const count = (ch) => nonEmpty.reduce((n, l) => n + (l.split(ch).length - 1), 0);
      const pairs = [[',', count(',')], [';', count(';')], ['\t', count('\t')]].sort((a, b) => b[1] - a[1]);
      if (pairs[0][1] >= nonEmpty.length * 0.6) {
        return rowsToCards(parseCsvText(text, pairs[0][0]));
      }
    }
    return out;
  }

  function parseJsonText(text) {
    let data;
    try { data = JSON.parse(text); } catch { return []; }
    const out = [];
    const FK = ['front', 'question', 'word', 'term', 'q', 'جلو', 'سؤال', 'سوال'];
    const BK = ['back', 'answer', 'meaning', 'definition', 'a', 'عقب', 'جواب', 'پاسخ', 'معنی'];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (Array.isArray(item) && item.length >= 2) {
          const f = String(item[0] || '').trim(), b = String(item[1] || '').trim();
          if (f && b) out.push({ front: f, back: b });
        } else if (item && typeof item === 'object') {
          const f = FK.map((k) => item[k]).find((v) => v != null);
          const b = BK.map((k) => item[k]).find((v) => v != null);
          const fs = String(f || '').trim(), bs = String(b || '').trim();
          if (fs && bs) out.push({ front: fs, back: bs });
        }
      }
    }
    return out;
  }

  function parseFileText(text, filename) {
    const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (ext === 'json') return parseJsonText(text);
    if (ext === 'tsv') return rowsToCards(text.split(/\r?\n/).map((l) => l.split('\t')));
    if (ext === 'csv') {
      const firstLines = text.split(/\r?\n/).slice(0, 12).filter((l) => l.trim());
      const count = (ch) => firstLines.reduce((n, l) => n + (l.split(ch).length - 1), 0);
      const pairs = [[',', count(',')], [';', count(';')], ['\t', count('\t')]];
      pairs.sort((a, b) => b[1] - a[1]);
      return rowsToCards(parseCsvText(text, pairs[0][1] > 0 ? pairs[0][0] : ','));
    }
    return parsePasteText(text); // txt & fallback
  }

  function importModal() {
    let parsed = [];
    let targetDeckId = 'new';

    const deckOptions = state.decks.map((d) =>
      `<option value="${d.id}">${esc(d.emoji)} ${esc(d.name)}</option>`).join('');

    const FMT_DESC = { csv: 'fmtCsv', tsv: 'fmtTsv', txt: 'fmtTxt', json: 'fmtJson' };
    const FMT_EX = { csv: 'exCsv', tsv: 'exTsv', txt: 'exTxt', json: 'exJson' };

    openModal(`
      <h3>${esc(T('importTitle'))}</h3>
      <div class="import-tabs">
        <button class="active" data-tab="file">${esc(T('tabFile'))}</button>
        <button data-tab="paste">${esc(T('tabPaste'))}</button>
      </div>
      <div data-pane="file">
        <label class="file-drop" id="file-drop">
          <span class="fd-icon" id="fd-icon">📂</span>
          <span class="fd-text">
            <span class="fd-main">${T('dropHint')}</span>
            <small id="fd-sub">${esc(T('fileTypes'))}</small>
          </span>
          <input type="file" id="file-input" accept=".csv,.tsv,.txt,.json,.md" hidden>
        </label>
      </div>
      <div data-pane="paste" class="hidden">
        <div class="field">
          <textarea id="paste-area" dir="auto" placeholder="${esc(T('pasteHint'))}"></textarea>
        </div>
        <button class="btn btn-secondary btn-wide" data-x="parse">${esc(T('parseBtn'))}</button>
      </div>
      <div class="fmt-guide">
        <div class="fmt-head">${esc(T('fmtGuideTitle'))}</div>
        <div class="fmt-chips">
          <button type="button" class="active" data-fmt="csv">CSV</button>
          <button type="button" data-fmt="tsv">TSV</button>
          <button type="button" data-fmt="txt">TXT</button>
          <button type="button" data-fmt="json">JSON</button>
        </div>
        <div class="fmt-desc" id="fmt-desc"></div>
        <pre class="fmt-example" id="fmt-example" dir="ltr"></pre>
        <div class="fmt-note">${esc(T('fmtFrontBack'))} · ${esc(T('fmtLegend'))}</div>
      </div>
      <div class="ai-card">
        <div class="ai-row">
          <span class="ai-icon">✨</span>
          <div class="ai-body">
            <b>${esc(T('aiTitle'))}</b>
            <small>${esc(T('aiDesc'))}</small>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm ai-toggle" data-x="ai-toggle">${esc(T('aiBtn'))}</button>
        <div class="ai-prompt" id="ai-prompt">
          <textarea readonly id="ai-prompt-text" dir="auto"></textarea>
          <p class="ai-hint">${esc(T('aiPromptHint'))}</p>
          <button class="btn btn-primary btn-sm ai-copy" data-x="ai-copy">${esc(T('aiCopy'))}</button>
        </div>
      </div>
      <div class="import-preview hidden" id="import-preview"></div>
      <div class="field">
        <label>${esc(T('targetDeck'))}</label>
        <select id="import-target">
          <option value="new">${esc(T('newDeckOption'))}</option>
          ${deckOptions}
        </select>
      </div>
      <div class="field hidden" id="new-deck-name-wrap">
        <input type="text" id="new-deck-name" maxlength="100" placeholder="${esc(T('deckNameLabel'))}">
      </div>
      <div class="row">
        <button class="btn btn-secondary" data-x="cancel">${esc(T('cancel'))}</button>
        <button class="btn btn-primary" data-x="import" disabled>${esc(T('importBtn', { n: 0 }))}</button>
      </div>`, (root) => {
      const preview = root.querySelector('#import-preview');
      const importBtn = root.querySelector('[data-x="import"]');

      const updPreview = () => {
        preview.classList.remove('hidden', 'warn');
        if (parsed.length) {
          preview.textContent = T('parsedOk', { n: parsed.length });
          importBtn.disabled = false;
          importBtn.textContent = T('importBtn', { n: parsed.length });
        } else {
          preview.classList.add('warn');
          preview.textContent = T('parsedEmpty');
          importBtn.disabled = true;
          importBtn.textContent = T('importBtn', { n: 0 });
        }
      };

      // tabs
      root.querySelectorAll('[data-tab]').forEach((tab) => {
        tab.onclick = () => {
          root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === tab));
          root.querySelector('[data-pane="file"]').classList.toggle('hidden', tab.dataset.tab !== 'file');
          root.querySelector('[data-pane="paste"]').classList.toggle('hidden', tab.dataset.tab !== 'paste');
        };
      });

      // format guide chips
      const setFmt = (f) => {
        root.querySelectorAll('[data-fmt]').forEach((b) => b.classList.toggle('active', b.dataset.fmt === f));
        root.querySelector('#fmt-desc').innerHTML = T(FMT_DESC[f]);
        root.querySelector('#fmt-example').textContent = T(FMT_EX[f]);
      };
      root.querySelectorAll('[data-fmt]').forEach((b) => {
        b.onclick = () => { Haptic.tap(); setFmt(b.dataset.fmt); };
      });
      setFmt('csv');

      // AI prompt
      const aiWrap = root.querySelector('#ai-prompt');
      const aiToggle = root.querySelector('[data-x="ai-toggle"]');
      root.querySelector('#ai-prompt-text').value = T('promptAi');
      aiToggle.onclick = () => {
        Haptic.tap();
        const open = aiWrap.classList.toggle('open');
        aiToggle.textContent = open ? T('aiBtnHide') : T('aiBtn');
      };
      root.querySelector('[data-x="ai-copy"]').onclick = async () => {
        const ok = await copyText(root.querySelector('#ai-prompt-text').value);
        toast(ok ? T('aiCopied') : T('errGeneric'));
      };

      // file input
      const fileInput = root.querySelector('#file-input');
      const drop = root.querySelector('#file-drop');
      drop.onclick = () => fileInput.click();
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
      drop.ondragleave = () => drop.classList.remove('drag');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
      fileInput.onchange = () => { if (fileInput.files[0]) readFile(fileInput.files[0]); };

      function readFile(file) {
        if (file.size > 2 * 1024 * 1024) {
          parsed = [];
          updPreview();
          preview.textContent = T('errTooBig');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          parsed = parseFileText(String(reader.result || ''), file.name).slice(0, 5000);
          root.querySelector('#fd-icon').textContent = '📄';
          root.querySelector('.fd-main').textContent = file.name;
          updPreview();
        };
        reader.readAsText(file);
      }

      // paste
      root.querySelector('[data-x="parse"]').onclick = () => {
        parsed = parsePasteText(root.querySelector('#paste-area').value).slice(0, 5000);
        updPreview();
      };

      // target
      const sel = root.querySelector('#import-target');
      sel.onchange = () => {
        targetDeckId = sel.value;
        root.querySelector('#new-deck-name-wrap').classList.toggle('hidden', targetDeckId !== 'new');
      };

      root.querySelector('[data-x="cancel"]').onclick = closeModal;
      importBtn.onclick = async () => {
        if (!parsed.length) return;
        importBtn.disabled = true;
        let res;
        try {
          if (targetDeckId === 'new') {
            const name = root.querySelector('#new-deck-name').value.trim()
              || (state.lang === 'fa' ? 'دستهٔ وارداتی' : 'Imported deck');
            res = await api('importDeck', { name, emoji: '📥', cards: parsed });
            closeModal();
            toast(T('imported', { n: res.added, deck: res.deck.name }));
            await loadHome();
            openDeck(res.deck.id);
          } else {
            res = await api('addCards', { deckId: Number(targetDeckId), cards: parsed });
            closeModal();
            const d = state.decks.find((x) => x.id === Number(targetDeckId));
            toast(T('imported', { n: res.added, deck: d ? d.name : '' }));
            if (state.currentDeck && state.currentDeck.id === Number(targetDeckId)) {
              await refreshDeckAndHome();
            } else {
              await loadHome();
            }
          }
          if (res && res.skipped) toast(T('duplicateSkipped', { n: res.skipped }));
        } catch (e) {
          importBtn.disabled = false;
          toast(T('errGeneric'));
        }
      };
    });
  }

  // ================= REVIEW =================
  async function startReview(deckId) {
    Haptic.tap();
    try {
      // session size follows the daily goal (e.g. 20); the server caps it at 200
      const limit = Math.max(1, Math.min(200, Math.round(state.dailyGoal) || 20));
      const data = await api('getReview', { deckId: deckId ?? null, limit });
      if (!data.cards.length) {
        toast(T('reviewAllNone'));
        return;
      }
      state.session = {
        deckId: deckId ?? null,
        queue: data.cards.slice(),
        total: data.cards.length,
        done: 0, correct: 0, wrong: 0,
        remaining: data.remaining,
        current: null, flipped: false, awaiting: false,
      };
      show('review');
      nextCard();
    } catch (e) {
      toast(T('errGeneric'));
    }
  }

  function nextCard() {
    const s = state.session;
    if (!s) return;
    if (!s.queue.length) { endSession(); return; }
    s.current = s.queue.shift();
    s.flipped = false;
    s.awaiting = false;
    renderReviewCard();
  }

  function renderReviewCard() {
    const s = state.session;
    const c = s.current;
    const fc = $('#flashcard');
    fc.classList.remove('flipped', 'pulse-ok', 'pulse-no', 'dragging', 'snap-back', 'fly-off');
    fc.style.transform = '';
    $('#badge-right').style.opacity = 0;
    $('#badge-left').style.opacity = 0;
    $('#card-front').textContent = c.front;
    $('#card-back').textContent = c.back;
    $('#label-front').textContent = T('question');
    $('#label-back').textContent = T('answer');
    $('#hint-tap').textContent = T('tapToFlip');
    const done = s.done;
    $('#review-count').textContent = T('progress', { done, total: s.total + (s.extra || 0) });
    $('#review-progress').style.width = `${s.total + (s.extra || 0) ? (done / (s.total + (s.extra || 0))) * 100 : 0}%`;
    $('#review-house').textContent = T('house', { n: c.house });
  }

  function flipCard() {
    const s = state.session;
    if (!s || !s.current || s.awaiting) return;
    s.flipped = !s.flipped;
    $('#flashcard').classList.toggle('flipped', s.flipped);
    Haptic.tap();
  }

  async function grade(correct) {
    const s = state.session;
    if (!s || !s.current || s.awaiting) return;
    s.awaiting = true;
    const card = s.current;
    const fc = $('#flashcard');
    fc.classList.remove('dragging', 'snap-back');
    fc.style.transform = '';
    fc.classList.add(correct ? 'pulse-ok' : 'pulse-no');
    correct ? Haptic.ok() : Haptic.no();

    try {
      const res = await api('answerCard', { cardId: card.id, correct });
      s.done++;
      correct ? s.correct++ : s.wrong++;
      if (res.streak != null) state.streak = res.streak;
      if (res.todayCount != null) state.todayCount = res.todayCount;
      if (res.dailyGoal != null) state.dailyGoal = res.dailyGoal;
      const justMetGoal = Boolean(res.goalJustMet);

      // house movement indicator
      const movedKey = res.moved === 'up' ? 'houseMovedUp' : res.moved === 'down' ? 'houseMovedDown' : 'houseStayed';
      $('#review-house').textContent = T(movedKey, { n: res.card.house });
      if (res.moved === 'down') toast(T('relearnSoon'));

      // requeue missed cards at the end of the queue
      if (res.requeue) { s.queue.push({ ...res.card }); s.extra = (s.extra || 0) + 1; }

      setTimeout(() => {
        s.awaiting = false;
        if (justMetGoal) {
          // pause here — the celebration modal (Continue / Exit) decides what's next
          Haptic.ok();
          showGoalReachedModal();
          return;
        }
        if (!s.queue.length) endSession();
        else nextCard();
      }, 380);
    } catch (e) {
      s.awaiting = false;
      toast(T('errOffline'));
    }
  }

  // daily goal reached → announce it with two options: continue or exit
  function showGoalReachedModal() {
    const s = state.session;
    const goal = Math.max(1, state.dailyGoal || 20);
    openModal(`
      <div class="goal-modal">
        <div class="gm-emoji">🎉</div>
        <h3>${esc(T('goalReachedTitle'))}</h3>
        <p class="gm-sub">${esc(T('goalReachedMsg', { n: Math.min(goal, state.todayCount || goal) }))}</p>
        <div class="gm-badges">
          <span class="gm-badge">🔥 ${esc(T('goalReachedStreak', { n: state.streak || 1 }))}</span>
          <span class="gm-badge">✓ ${esc(T('sumRight'))} ${s ? s.correct : 0}</span>
        </div>
        <div class="row">
          <button class="btn btn-secondary" data-x="exit">${esc(T('goalExit'))}</button>
          <button class="btn btn-primary" data-x="continue">${esc(T('goalContinue'))}</button>
        </div>
      </div>`, (root) => {
      root.querySelector('[data-x="continue"]').onclick = () => {
        Haptic.tap();
        closeModal();
        const ses = state.session;
        if (!ses) { loadHome(); return; }
        ses.awaiting = false;
        if (!ses.queue.length) endSession();
        else nextCard();
      };
      root.querySelector('[data-x="exit"]').onclick = () => {
        Haptic.tap();
        closeModal();
        endSession();
      };
    });
  }

  async function endSession() {
    const s = state.session;
    if (!s) return;
    state.summary = s;
    // fetch what's still due for the "next" hint
    let stillDue = 0;
    try {
      const data = await api('getReview', { deckId: s.deckId, limit: 1 });
      stillDue = data.remaining || 0;
    } catch {}

    $('#summary-emoji').textContent = s.wrong === 0 ? '🏆' : '🎉';
    $('#summary-title').textContent = T('sessionDone');
    $('#summary-sub').textContent = T('sessionSub', { total: s.done });
    $('#sum-right').textContent = s.correct;
    $('#sum-wrong').textContent = s.wrong;
    $('#sum-right-label').textContent = T('sumRight');
    $('#sum-wrong-label').textContent = T('sumWrong');

    const contBtn = $('#btn-summary-continue');
    if (stillDue > 0 && !s.deckId) {
      contBtn.hidden = false;
      contBtn.textContent = T('continueBtn', { n: stillDue });
    } else {
      contBtn.hidden = true;
    }
    $('#summary-next').textContent = stillDue > 0 ? T('nextDueInfo', { n: stillDue }) : T('allCaughtUp');
    $('#btn-summary-home').textContent = T('backHome');
    show('summary');
    loadHomeSilently();
  }

  // ================= ONBOARDING GUIDE =================
  // Shown automatically on the very first visit; re-openable from Settings.
  const GUIDE_STEPS = [
    { e: '🃏', t: 'g1t', d: 'g1d' },
    { e: '✍️', t: 'g2t', d: 'g2d' },
    { e: '⚡', t: 'g3t', d: 'g3d' },
    { e: '🔥', t: 'g4t', d: 'g4d' },
    { e: '🔐', t: 'g5t', d: 'g5d' },
  ];

  function showGuide(firstRun = false) {
    let step = 0;

    const render = (root) => {
      const s = GUIDE_STEPS[step];
      root.querySelector('.guide-emoji').textContent = s.e;
      root.querySelector('#guide-title').textContent = T(s.t);
      root.querySelector('#guide-text').textContent = T(s.d);
      root.querySelector('#guide-dots').innerHTML =
        GUIDE_STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
      const next = root.querySelector('#guide-next');
      const skip = root.querySelector('#guide-skip');
      next.textContent = step === GUIDE_STEPS.length - 1 ? T('guideStart') : T('guideNext');
      skip.textContent = step === GUIDE_STEPS.length - 1 ? '' : T('guideSkip');
      skip.hidden = step === GUIDE_STEPS.length - 1;
      next.onclick = () => {
        Haptic.tap();
        if (step < GUIDE_STEPS.length - 1) { step++; render(root); return; }
        finish();
      };
    };

    const finish = () => {
      closeModal();
      if (firstRun && !state.onboarded) {
        state.onboarded = true;
        saveSettings({ onboarded: 1 });
      }
    };

    openModal(`
      <div class="guide-modal">
        <div class="guide-emoji">🃏</div>
        <div class="guide-step">
          <h4 id="guide-title"></h4>
          <p id="guide-text"></p>
        </div>
        <div class="guide-dots" id="guide-dots"></div>
        <div class="row">
          <button class="btn btn-secondary" id="guide-skip"></button>
          <button class="btn btn-primary" id="guide-next"></button>
        </div>
      </div>`, (root) => {
      root.querySelector('#guide-skip').onclick = () => { Haptic.tap(); finish(); };
      render(root);
    });
  }

  // ================= LEGAL MODALS =================
  function legalModal(kind) {
    const key = kind === 'privacy' ? 'legalPrivacyText' : kind === 'terms' ? 'legalTermsText' : 'legalSupportText';
    const title = kind === 'privacy' ? T('legalPrivacyBtn') : kind === 'terms' ? T('legalTermsBtn') : T('legalSupportBtn');
    openModal(`
      <h3>${esc(title)}</h3>
      <div class="legal-modal-text" dir="auto">${esc(T(key))}</div>
      ${kind === 'support' ? `
      <button class="btn btn-primary btn-wide" id="legal-open-support">💬 ${esc(T('legalSupportOpen'))}</button>` : ''}
      <div class="row">
        <button class="btn btn-secondary" data-x="close">${esc(T('cancel'))}</button>
      </div>`, (root) => {
      const openBtn = root.querySelector('#legal-open-support');
      if (openBtn) {
        openBtn.onclick = () => {
          try { tg?.openTelegramLink?.('https://t.me/Botmaker_Telegram'); } catch { window.open('https://t.me/Botmaker_Telegram', '_blank'); }
        };
      }
      root.querySelector('[data-x="close"]').onclick = closeModal;
    });
  }

  async function deleteMyDataFlow() {
    if (!(await confirmDialog(T('deleteDataQ')))) return;
    try {
      await api('deleteMyData');
      toast(T('legalDeleted'));
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast(T('errGeneric'));
    }
  }

  // ================= SETTINGS =================
  function renderSettings() {
    $$('#seg-lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
    $$('#seg-theme button').forEach((b) => b.classList.toggle('active', b.dataset.theme === state.theme));
    $$('#seg-goal button').forEach((b) => b.classList.toggle('active', Number(b.dataset.goal) === Number(state.dailyGoal)));
    // font sliders
    const uiR = $('#rng-ui-font'), cardR = $('#rng-card-font');
    if (uiR) uiR.value = String(state.uiFont || 1);
    if (cardR) cardR.value = String(state.cardFont || 1);
    $('#fs-ui-val').textContent = `${Math.round((Number(state.uiFont) || 1) * 100)}%`;
    $('#fs-card-val').textContent = `${Math.round((Number(state.cardFont) || 1) * 100)}%`;
    $('#opt-house1').classList.toggle('selected', state.failBehavior === 'house1');
    $('#opt-house1').querySelector('input').checked = state.failBehavior === 'house1';
    $('#opt-previous').classList.toggle('selected', state.failBehavior === 'previous');
    $('#opt-previous').querySelector('input').checked = state.failBehavior === 'previous';
  }

  async function saveSettings(patch) {
    try {
      const res = await api('saveSettings', patch);
      if (res.user) {
        state.lang = res.user.lang || state.lang;
        state.theme = res.user.theme || state.theme;
        state.failBehavior = res.user.failBehavior || state.failBehavior;
        if (res.user.dailyGoal != null) state.dailyGoal = res.user.dailyGoal;
        if (res.user.uiFont != null) state.uiFont = Number(res.user.uiFont) || 1;
        if (res.user.cardFont != null) state.cardFont = Number(res.user.cardFont) || 1;
        if (res.user.onboarded != null) state.onboarded = Boolean(res.user.onboarded);
      }
      applyLang();
      applyTheme();
      applyFonts();
      renderSettings();
      return true;
    } catch (e) {
      toast(T('errGeneric'));
      return false;
    }
  }

  async function doBackup() {
    try {
      const res = await api('createBackup');
      if (res.ok) toast(T('backupSent'));
      else if (res.empty) toast(T('backupEmpty'));
      else toast(T('demoNoBackup'));
    } catch (e) {
      toast(T('errGeneric'));
    }
  }

  // ================= events =================
  function bindEvents() {
    $('#btn-settings').onclick = () => { Haptic.tap(); renderSettings(); show('settings'); };
    $('#btn-back').onclick = () => {
      Haptic.tap();
      if (state.screen === 'deck') { loadHome(); }
      else if (state.screen === 'settings') { loadHome(); }
      else if (state.screen === 'summary') { loadHome(); }
    };
    $('#btn-theme').onclick = async () => {
      // quick cycle: auto → light → dark → auto
      const order = ['auto', 'light', 'dark'];
      const next = order[(order.indexOf(state.theme) + 1) % 3];
      state.theme = next;
      applyTheme();
      renderSettings();
      saveSettings({ theme: next });
    };
    $('#btn-new-deck').onclick = () => deckFormModal(null);
    $('#fab').onclick = () => deckFormModal(null);
    $('#btn-review-all').onclick = () => startReview(null);

    // deck screen
    $('#btn-deck-menu').onclick = (e) => {
      e.stopPropagation();
      $('#deck-menu').classList.toggle('hidden');
      deckMenu();
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-wrap')) $('#deck-menu')?.classList.add('hidden');
    });
    $('#btn-add-card').onclick = () => cardModal(null);
    $('#btn-import').onclick = () => importModal();
    $('#btn-deck-review').onclick = () => startReview(state.currentDeck.id);

    // review screen
    $('#btn-review-home').onclick = () => { Haptic.tap(); loadHome(); };

    // --- Tinder-style swipe on the flashcard ---
    const fc = $('#flashcard');
    const badgeR = $('#badge-right');
    const badgeL = $('#badge-left');
    let drag = null;
    let suppressClickUntil = 0;

    fc.addEventListener('pointerdown', (e) => {
      if (state.screen !== 'review' || !state.session || state.session.awaiting) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, moved: false, t: Date.now() };
      try { fc.setPointerCapture(e.pointerId); } catch {}
    });
    fc.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x;
      if (Math.abs(drag.dx) > 8 || Math.abs(e.clientY - drag.y) > 12) drag.moved = true;
      if (!drag.moved || !state.session || state.session.awaiting) return;
      fc.classList.remove('snap-back');
      fc.classList.add('dragging');
      fc.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 16}deg)`;
      const op = Math.min(1, Math.abs(drag.dx) / 80);
      badgeR.style.opacity = drag.dx > 0 ? op : 0;
      badgeL.style.opacity = drag.dx < 0 ? op : 0;
    });
    const endDrag = (e) => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      const d = drag;
      drag = null;
      fc.classList.remove('dragging');
      badgeR.style.opacity = 0;
      badgeL.style.opacity = 0;
      const s = state.session;
      if (d.moved && Math.abs(d.dx) > 6) suppressClickUntil = Date.now() + 320;
      const vx = d.dx / Math.max(1, Date.now() - d.t);
      if (d.moved && s && s.current && !s.awaiting && (Math.abs(d.dx) > 90 || Math.abs(vx) > 0.55)) {
        const dir = d.dx > 0 ? 1 : -1;
        fc.classList.add('fly-off');
        fc.style.transform = `translateX(${dir * (window.innerWidth * 0.75 + 90)}px) rotate(${dir * 22}deg)`;
        grade(dir > 0);
        setTimeout(() => { fc.classList.remove('fly-off'); }, 300);
        return;
      }
      if (d.moved && Math.abs(d.dx) > 6) {
        fc.classList.add('snap-back');
        fc.style.transform = '';
        setTimeout(() => fc.classList.remove('snap-back'), 300);
      }
    };
    fc.addEventListener('pointerup', endDrag);
    fc.addEventListener('pointercancel', endDrag);
    fc.addEventListener('lostpointercapture', () => { if (drag) endDrag({}); });

    // tap = flip (but not right after a swipe)
    fc.onclick = () => {
      if (Date.now() < suppressClickUntil) return;
      flipCard();
    };
    fc.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); } };
    $('#btn-flip').onclick = flipCard;
    $('#btn-wrong').onclick = () => grade(false);
    $('#btn-right').onclick = () => grade(true);
    document.addEventListener('keydown', (e) => {
      if (state.screen !== 'review' || !state.session) return;
      if (e.key === '1') grade(false);
      if (e.key === '2') grade(true);
      if (e.key === 'ArrowRight') grade(true);   // swipe-right equivalent
      if (e.key === 'ArrowLeft') grade(false);   // swipe-left equivalent
    });

    // summary
    $('#btn-summary-home').onclick = () => loadHome();
    $('#btn-summary-continue').onclick = () => startReview(null);

    // settings
    $$('#seg-lang button').forEach((b) => {
      b.onclick = async () => {
        state.lang = b.dataset.lang;
        applyLang();
        renderSettings();
        await saveSettings({ lang: b.dataset.lang });
        toast(T('langSaved'));
        loadHomeSilently();
      };
    });
    $$('#seg-theme button').forEach((b) => {
      b.onclick = async () => {
        state.theme = b.dataset.theme;
        applyTheme();
        renderSettings();
        await saveSettings({ theme: b.dataset.theme });
        toast(T('themeSaved'));
      };
    });
    $$('#seg-goal button').forEach((b) => {
      b.onclick = async () => {
        state.dailyGoal = Number(b.dataset.goal);
        renderSettings();
        await saveSettings({ dailyGoal: state.dailyGoal });
        toast(T('goalSaved'));
        loadHomeSilently();
      };
    });
    ['house1', 'previous'].forEach((v) => {
      $(v === 'house1' ? '#opt-house1' : '#opt-previous').onclick = async () => {
        state.failBehavior = v;
        renderSettings();
        await saveSettings({ failBehavior: v });
        toast(T('failSaved'));
      };
    });

    // --- font size sliders (live preview, saved on release) ---
    const uiR = $('#rng-ui-font'), cardR = $('#rng-card-font');
    if (uiR) {
      uiR.addEventListener('input', () => {
        state.uiFont = Number(uiR.value);
        $('#fs-ui-val').textContent = `${Math.round(state.uiFont * 100)}%`;
        applyFonts();
      });
      uiR.addEventListener('change', async () => {
        await saveSettings({ uiFont: state.uiFont });
        toast(T('fontSaved'));
      });
    }
    if (cardR) {
      cardR.addEventListener('input', () => {
        state.cardFont = Number(cardR.value);
        $('#fs-card-val').textContent = `${Math.round(state.cardFont * 100)}%`;
        applyFonts();
      });
      cardR.addEventListener('change', async () => {
        await saveSettings({ cardFont: state.cardFont });
        toast(T('fontSaved'));
      });
    }

    // --- guide + legal ---
    $('#btn-guide').onclick = () => { Haptic.tap(); showGuide(false); };
    $('#btn-legal-privacy').onclick = () => { Haptic.tap(); legalModal('privacy'); };
    $('#btn-legal-terms').onclick = () => { Haptic.tap(); legalModal('terms'); };
    $('#btn-legal-support').onclick = () => { Haptic.tap(); legalModal('support'); };
    $('#btn-delete-data').onclick = () => { Haptic.tap(); deleteMyDataFlow(); };

    $('#btn-backup').onclick = doBackup;

    // telegram back button
    try {
      tg?.BackButton?.onClick(() => {
        if (state.screen === 'deck' || state.screen === 'settings' || state.screen === 'summary'
          || state.screen === 'review') loadHome();
      });
    } catch {}

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.theme === 'auto') applyTheme();
    });
  }

  // ---------------- boot ----------------
  function boot() {
    bindEvents();
    if (tg) {
      try { tg.ready(); tg.expand(); tg.enableClosingConfirmation?.(); } catch {}
    }
    if (!IN_TG) {
      // demo banner outside Telegram
      const banner = document.createElement('div');
      banner.className = 'demo-banner';
      banner.textContent = T('demoBanner');
      $('#screen-home').prepend(banner);
    }
    applyTheme();
    loadHome();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot)
    : boot();
})();
