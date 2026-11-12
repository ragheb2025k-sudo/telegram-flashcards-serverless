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
    streak: 0,
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
    if (state.theme === 'auto') {
      const tp = tg?.themeParams;
      if (tp && tp.bg_color) {
        // trust Telegram's theme
        dark = isDarkColor(tp.bg_color);
        document.documentElement.style.setProperty('--bg', tp.bg_color);
        document.documentElement.style.setProperty('--text', tp.text_color || '');
      } else {
        dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } else {
      dark = state.theme === 'dark';
    }
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { tg?.setHeaderColor?.(dark ? '#171411' : '#f4f1ec'); tg?.setBackgroundColor?.(dark ? '#171411' : '#f4f1ec'); } catch {}
  }
  function isDarkColor(hex) {
    const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 120;
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
        user: { lang: state.lang, theme: state.theme, failBehavior: state.failBehavior, streak: 0, lastStudyDate: null },
        decks: [],
      };
      localStorage.setItem(this.KEY, JSON.stringify(db));
      return db;
    },
    intervals: [0, 1440, 4320, 10080, 23040, 50400],
    schedule(card, correct, failBehavior) {
      const t = nowSec();
      if (correct) {
        card.house = Math.min(5, card.house + 1);
        card.ease = Math.min(1.45, card.ease + 0.06);
        card.due = t + Math.round(this.intervals[card.house] * 60 * card.ease);
        card.reps++; card.lastResult = 1;
        return 'up';
      }
      card.house = failBehavior === 'previous' ? Math.max(1, card.house - 1) : 1;
      card.ease = Math.max(0.6, card.ease - 0.2);
      card.due = t + 600;
      card.lapses++; card.lastResult = 0;
      return 'down';
    },
    handle(name, input = {}) {
      const db = this.load();
      let res = {};
      switch (name) {
        case 'getHome': {
          const decks = db.decks.map((d) => ({
            id: d.id, name: d.name, emoji: d.emoji,
            cards: d.cards.length,
            due: d.cards.filter((c) => c.due <= nowSec()).length,
            mastered: d.cards.filter((c) => c.house === 5).length,
            fresh: d.cards.filter((c) => c.reps === 0 && c.lapses === 0).length,
          }));
          res = {
            user: { ...db.user, firstName: '' },
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
          if (d) d.cards.forEach((c) => { c.house = 1; c.ease = 1; c.reps = 0; c.lapses = 0; c.lastResult = null; c.due = nowSec(); c.isNew = true; });
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
              const today = new Date().toISOString().slice(0, 10);
              if (db.user.lastStudyDate !== today) {
                const y = new Date(Date.now() - DAY * 1000).toISOString().slice(0, 10);
                db.user.streak = db.user.lastStudyDate === y ? (db.user.streak || 0) + 1 : 1;
                db.user.lastStudyDate = today;
              }
              res = { card: { ...c, isNew: false }, moved, requeue: !input.correct, nextDue: c.due, streak: db.user.streak };
              break;
          }
          }
          break;
        }
        case 'saveSettings': {
          if (input.lang) db.user.lang = input.lang;
          if (input.theme) db.user.theme = input.theme;
          if (input.failBehavior) db.user.failBehavior = input.failBehavior;
          res = { user: { ...db.user } };
          break;
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
      if (canBack) tg?.BackButton?.show(); else tg?.BackButton?.hide();
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
      state.firstName = data.user.firstName || '';
      state.decks = data.decks || [];
      state.totals = data.totals || { decks: 0, cards: 0, due: 0, mastered: 0 };
      applyLang();
      applyTheme();
      renderHome();
      show('home');
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
    chip.hidden = !state.streak;
    $('#streak-val').textContent = state.streak;

    // review-all button
    const btnAll = $('#btn-review-all');
    if (state.totals.due > 0) {
      btnAll.disabled = false;
      $('#review-all-label').textContent = T('reviewAll', { n: state.totals.due });
    } else {
      btnAll.disabled = true;
      $('#review-all-label').textContent = T('reviewAllNone');
    }

    // stats
    $('#stats-row').innerHTML = `
      <div class="stat-box"><b>${state.totals.cards}</b><span>${T('statCards')}</span></div>
      <div class="stat-box hot"><b>${state.totals.due}</b><span>${T('statDue')}</span></div>
      <div class="stat-box"><b>${state.totals.mastered}</b><span>${T('statMastered')}</span></div>`;

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
    const out = [];
    for (const line of lines) {
      const l = line.trim(); if (!l) continue;
      const idx = l.indexOf(' - ');
      if (idx > 0) { const f = l.slice(0, idx).trim(), b = l.slice(idx + 3).trim(); if (f && b) out.push({ front: f, back: b }); }
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

    openModal(`
      <h3>${esc(T('importTitle'))}</h3>
      <div class="import-tabs">
        <button class="active" data-tab="file">${esc(T('tabFile'))}</button>
        <button data-tab="paste">${esc(T('tabPaste'))}</button>
      </div>
      <div data-pane="file">
        <label class="file-drop" id="file-drop">
          <span class="fd-icon">📂</span>
          ${T('dropHint')}<br><small>${esc(T('fileTypes'))}</small>
          <input type="file" id="file-input" accept=".csv,.tsv,.txt,.json,.md" hidden>
        </label>
      </div>
      <div data-pane="paste" class="hidden">
        <div class="field">
          <textarea id="paste-area" dir="auto" placeholder="${esc(T('pasteHint'))}"></textarea>
        </div>
        <button class="btn btn-secondary" data-x="parse">${esc(T('save'))}</button>
      </div>
      <div class="fmt-guide">
        <details>
          <summary>${esc(state.lang === 'fa' ? 'فرمت‌های پشتیبانی‌شده' : 'Supported formats')}</summary>
          <div>${T('fmtCsv')}</div>
          <div>${T('fmtTsv')}</div>
          <div>${T('fmtTxt')}</div>
          <div>${T('fmtJson')}</div>
        </details>
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

      // file input
      const fileInput = root.querySelector('#file-input');
      const drop = root.querySelector('#file-drop');
      drop.onclick = () => fileInput.click();
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
      drop.ondragleave = () => drop.classList.remove('drag');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
      fileInput.onchange = () => { if (fileInput.files[0]) readFile(fileInput.files[0]); };

      function readFile(file) {
        if (file.size > 2 * 1024 * 1024) { preview.classList.add('warn'); preview.textContent = T('parsedEmpty'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          parsed = parseFileText(String(reader.result || ''), file.name).slice(0, 5000);
          if (parsed.length && targetDeckId === 'new') {
            const w = root.querySelector('#new-deck-name');
            if (!w.value) w.value = file.name.replace(/\.[a-z0-9]+$/i, '');
          }
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
        try {
          if (targetDeckId === 'new') {
            const name = root.querySelector('#new-deck-name').value.trim()
              || (state.lang === 'fa' ? 'دستهٔ وارداتی' : 'Imported deck');
            const res = await api('importDeck', { name, emoji: '📥', cards: parsed });
            closeModal();
            toast(T('imported', { n: res.added, deck: res.deck.name }));
            await loadHome();
            openDeck(res.deck.id);
          } else {
            const res = await api('addCards', { deckId: Number(targetDeckId), cards: parsed });
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
      const data = await api('getReview', { deckId: deckId ?? null, limit: 20 });
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
    fc.classList.remove('flipped', 'pulse-ok', 'pulse-no');
    $('#card-front').textContent = c.front;
    $('#card-back').textContent = c.back;
    $('#label-front').textContent = T('question');
    $('#label-back').textContent = T('answer');
    $('#hint-tap').textContent = T('tapToFlip');
    const done = s.done;
    $('#review-count').textContent = T('progress', { done, total: s.total + s.done });
    $('#review-progress').style.width = `${s.total + s.done ? (done / (s.total + s.done)) * 100 : 0}%`;
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
    fc.classList.add(correct ? 'pulse-ok' : 'pulse-no');
    correct ? Haptic.ok() : Haptic.no();

    try {
      const res = await api('answerCard', { cardId: card.id, correct });
      s.done++;
      correct ? s.correct++ : s.wrong++;
      if (res.streak) state.streak = res.streak;

      // house movement indicator
      const movedKey = res.moved === 'up' ? 'houseMovedUp' : res.moved === 'down' ? 'houseMovedDown' : 'houseStayed';
      $('#review-house').textContent = T(movedKey, { n: res.card.house });
      if (res.moved === 'down') toast(T('relearnSoon'));

      // requeue missed cards at the end of the queue
      if (res.requeue) s.queue.push({ ...res.card });

      setTimeout(() => {
        s.awaiting = false;
        if (!s.queue.length) endSession();
        else nextCard();
      }, 380);
    } catch (e) {
      s.awaiting = false;
      toast(T('errOffline'));
    }
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

  // ================= SETTINGS =================
  function renderSettings() {
    $$('#seg-lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
    $$('#seg-theme button').forEach((b) => b.classList.toggle('active', b.dataset.theme === state.theme));
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
      }
      applyLang();
      applyTheme();
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
    $('#flashcard').onclick = flipCard;
    $('#flashcard').onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); } };
    $('#btn-flip').onclick = flipCard;
    $('#btn-wrong').onclick = () => grade(false);
    $('#btn-right').onclick = () => grade(true);
    document.addEventListener('keydown', (e) => {
      if (state.screen !== 'review' || !state.session) return;
      if (e.key === '1') grade(false);
      if (e.key === '2') grade(true);
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
    ['house1', 'previous'].forEach((v) => {
      $(v === 'house1' ? '#opt-house1' : '#opt-previous').onclick = async () => {
        state.failBehavior = v;
        renderSettings();
        await saveSettings({ failBehavior: v });
        toast(T('failSaved'));
      };
    });
    $('#btn-backup').onclick = doBackup;

    // telegram back button
    try {
      tg?.BackButton?.onClick(() => {
        if (state.screen === 'deck' || state.screen === 'settings' || state.screen === 'summary') loadHome();
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
