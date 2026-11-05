/* ============================================================
   Морской бой — интерфейс и игровой процесс
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  /* Бот замирает, пока платформа показывает рекламу или вкладка скрыта. */
  async function waitWhilePaused() {
    while (state.paused) await sleep(200);
  }
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const STORE_KEY = 'seabattle.profile.v2';
  let memoryStore = null;

  /* Платформа Яндекс Игр. В обычной сборке js/yandex.js не подключён,
     поэтому YG остаётся null и все хуки платформы пропускаются. */
  const YG = window.YandexGame || null;

  /* Версия кэша PWA. Должна совпадать с VERSION в sw.js: адрес `sw.js?v=…`
     не даёт CDN GitHub Pages отдать старый service worker (кэш 10 минут). */
  const SW_VERSION = 'sb-v28';

  const state = {
    profile: null,
    screen: 'menu',
    placement: null,
    playerBoard: null,
    enemyBoard: null,
    bot: null,
    botName: '',
    botRating: 1000,
    botAvatar: '🤖',
    mode: 'bot',            // 'bot' | 'online'
    net: null,              // { code, you, foeShips, fleetSent }
    playerTurn: false,
    locked: true,
    paused: false,          // платформа попросила паузу (реклама, чужая вкладка)
    gameOver: false,
    matchSeq: 0,
    ghost: [],
    hover: null,           // последняя клетка под курсором при расстановке
    matchStats: { shots: 0, hits: 0, firstShot: true, firstShotSunk: false },
    size: 10,              // размер текущей доски
    config: { size: 10, fleet: 'classic', tactics: false },
    loadout: ['airstrike', 'smoke'],
    abilities: null,       // заряды способностей в текущем бою
    botAbilities: null,    // заряды способностей бота
    pendingAbility: null,  // выбранная способность в режиме прицела
    prepGo: null,          // что запустить после экрана подготовки
    cup: null,             // «Испытание дня»: { round, wins }
    cupMatch: false        // текущий бой идёт в зачёт испытания
  };

  let netShotTimer = null;

  const boards = {
    place: $('#board-place'),
    enemy: $('#board-enemy'),
    own: $('#board-own')
  };

  /* ---------------- Профиль ---------------- */
  function defaultProfile() {
    return {
      name: Engine.randomName(),
      rating: 1000,
      games: 0,
      wins: 0,
      losses: 0,
      best: 1000,
      streak: 0,
      history: [],
      muted: false,
      volume: 0.7,          // 0…1, громкость эффектов
      music: true,          // фоновая музыка
      musicVolume: 0.5,     // 0…1, громкость музыки
      musicTrack: 'pirate', // 'pirate' | 'ambient' | 'tavern'
      motion: 'on',         // 'on' | 'off' — анимации
      bubbles: true,        // пузыри в фоне (на телефоне их можно выключить)
      theme: 'dark',        // 'dark' | 'light' | 'amoled'
      difficulty: 'normal', // 'easy' | 'normal' | 'hard'
      fleet: 'classic',     // 'classic' | 'admiral' — старый ключ, читается как фолбэк
      botConfig: { size: 10, fleet: 'classic', tactics: false },
      lobby: { size: 10, fleet: 'classic', tactics: false },
      loadout: ['airstrike', 'smoke'],
      daily: { date: '', streak: 0 },   // последний день с победой и серия
      achievements: {},     // id → когда получено
      stats: { shots: 0, hits: 0 },
      onlineWins: 0,        // победы в онлайн-матчах — только на этом устройстве
      onlineGames: 0,       // сколько онлайн-матчей сыграно
      cup: null,            // активный «Кубок моря»
      adMatches: 0,         // боёв с последней межстраничной рекламы (Яндекс Игры)
      lastAdAt: 0,          // когда последний раз показывали рекламу
      adBonusDate: ''       // день, когда уже брали награду за rewarded-видео
    };
  }

  function normalizeConfig(raw, fallbackFleet) {
    const n = Number(raw && raw.size);
    const size = Engine.CONFIG.sizes.indexOf(n) >= 0 ? n : 10;
    const fleets = Engine.fleetsFor(size);
    let fleet = raw && raw.fleet;
    if (!fleets[fleet]) fleet = (fallbackFleet && fleets[fallbackFleet]) ? fallbackFleet : 'classic';
    return { size: size, fleet: fleet, tactics: !!(raw && raw.tactics) };
  }

  function normalizeLoadout(raw) {
    const list = Array.isArray(raw) ? raw.filter((id) => Engine.ABILITIES[id]) : [];
    const out = list.filter((id, i) => list.indexOf(id) === i).slice(0, 2);
    for (const id of ['airstrike', 'smoke']) {
      if (out.length < 2 && out.indexOf(id) < 0) out.push(id);
    }
    return out.slice(0, 2);
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const prof = Object.assign(defaultProfile(), p, {
          rating: Number(p.rating) || 1000,
          history: Array.isArray(p.history) ? p.history.slice(0, 8) : []
        });
        // вложенные объекты нормализуем отдельно: старые профили их не знают
        prof.daily = Object.assign({ date: '', streak: 0 }, p.daily || {});
        prof.stats = Object.assign({ shots: 0, hits: 0 }, p.stats || {});
        prof.achievements = (p.achievements && typeof p.achievements === 'object')
          ? p.achievements : {};
        const cup = p.cup;
        prof.cup = (cup && cup.date === dayKey() && cup.round >= 1 && cup.round <= 3 && !cup.finished)
          ? cup : null;
        prof.botConfig = normalizeConfig(
          Object.assign({ fleet: prof.fleet }, p.botConfig || {}),
          prof.fleet
        );
        prof.lobby = normalizeConfig(p.lobby, prof.botConfig.fleet);
        prof.loadout = normalizeLoadout(p.loadout);
        return prof;
      }
    } catch (e) { /* ignore */ }
    return defaultProfile();
  }

  function saveProfile() {
    const raw = JSON.stringify(state.profile);
    try {
      localStorage.setItem(STORE_KEY, raw);
    } catch (e) {
      memoryStore = raw;
    }
  }

  /* ---------------- Звук ---------------- */
  const Sfx = {
    ctx: null,
    noiseCache: {},
    vol() {
      const p = state.profile;
      const v = p && typeof p.volume === 'number' ? p.volume : 0.7;
      return clamp(v, 0, 1);
    },
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    /* Пауза от платформы (реклама, чужая вкладка) — глушим весь звук. */
    suspend() {
      if (this.ctx && this.ctx.state === 'running') {
        try { this.ctx.suspend(); } catch (e) { /* не критично */ }
      }
    },
    tone(freq, dur, type, gain, to, delay) {
      const ctx = this.ctx;
      if (!ctx) return;
      const vol = this.vol();
      if (vol <= 0) return;
      const t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (gain || 0.05) * vol), t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    noise(dur, gain, freq, delay) {
      const ctx = this.ctx;
      if (!ctx) return;
      const vol = this.vol();
      if (vol <= 0) return;
      const t = ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      // буфер шума не пересоздаём на каждый выстрел — экономим CPU и батарею
      let buf = this.noiseCache[len];
      if (!buf) {
        buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        this.noiseCache[len] = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 900;
      const g = ctx.createGain();
      g.gain.value = (gain || 0.07) * vol;
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    },
    play(name) {
      if (state.profile && state.profile.muted) return;
      if (state.paused) return;
      this.init();
      this.resume();
      if (!this.ctx) return;
      switch (name) {
        case 'click': this.tone(520, 0.07, 'triangle', 0.045); break;
        case 'place': this.tone(170, 0.13, 'sine', 0.075); this.tone(340, 0.1, 'triangle', 0.03, null, 0.05); break;
        case 'splash': this.noise(0.26, 0.055, 1400); break;
        case 'boom': this.noise(0.3, 0.11, 520); this.tone(95, 0.28, 'sine', 0.09, 42); break;
        case 'sunk': this.noise(0.5, 0.12, 320); this.tone(150, 0.5, 'sawtooth', 0.055, 38); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.06, null, i * 0.12)); break;
        case 'lose': [392, 330, 262].forEach((f, i) => this.tone(f, 0.36, 'sine', 0.065, null, i * 0.14)); break;
        case 'turn': this.tone(660, 0.09, 'sine', 0.045); this.tone(880, 0.12, 'sine', 0.045, null, 0.09); break;
        case 'error': this.tone(150, 0.16, 'square', 0.045); break;
        case 'start': [392, 523, 659].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.055, null, i * 0.09)); break;
        default: break;
      }
    }
  };

  /* Android 15+ рисует приложение под системными полосами, а WebView не
     всегда отдаёт env(safe-area-inset-top). Подстраховываемся в нативной сборке. */
  function applyNativeInsets() {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
    document.documentElement.classList.add('is-native');
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const inset = probe.getBoundingClientRect().height;
    probe.remove();
    if (!inset || inset < 8) {
      document.documentElement.style.setProperty('--safe-top', '28px');
      document.documentElement.style.setProperty('--safe-bottom', '14px');
    }
  }

  /* ---------------- Настройки ---------------- */
  const DIFFICULTY = {
    easy: { name: 'Легко', boost: -140 },
    normal: { name: 'Обычно', boost: 0 },
    hard: { name: 'Сложно', boost: 160 }
  };

  // адмиральский флот крупнее и плотнее — соперник чуть сильнее
  const FLEET_BOOST = { classic: 0, admiral: 80 };

  const ACHIEVEMENTS = [
    { id: 'first_win', icon: '🥇', name: 'Первая победа', desc: 'Выиграй свой первый бой' },
    { id: 'win5', icon: '🔥', name: 'Пять подряд', desc: 'Выиграй 5 боёв подряд' },
    { id: 'perfect', icon: '🎯', name: 'Снайпер', desc: 'Победи без единого промаха' },
    { id: 'first_blood', icon: '💥', name: 'С первого выстрела', desc: 'Потопи линкор первым выстрелом' },
    { id: 'win10', icon: '⚓', name: 'Десятка', desc: 'Одержи 10 побед' },
    { id: 'win50', icon: '👑', name: 'Ветеран', desc: 'Одержи 50 побед' },
    { id: 'rank1500', icon: '🗺️', name: 'Капитан', desc: 'Подними рейтинг до 1500' },
    { id: 'online', icon: '🌐', name: 'Морской волк', desc: 'Сыграй онлайн с другом' },
    { id: 'daily3', icon: '📅', name: 'Три дня в море', desc: '3 дня подряд с победой' },
    { id: 'admiral', icon: '🛳️', name: 'Адмирал', desc: 'Победи в адмиральском флоте' },
    { id: 'cup', icon: '🏆', name: 'Обладатель кубка', desc: 'Пройди кубок моря без поражений' }
  ];

  /* Локальная дата в виде YYYY-MM-DD: серия считается по календарю телефона. */
  function dayKey(ts) {
    const d = ts === undefined ? new Date() : new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function achievementById(id) {
    return ACHIEVEMENTS.find((a) => a.id === id) || null;
  }

  function unlockAchievement(id, delay) {
    const p = state.profile;
    if (!p.achievements) p.achievements = {};
    if (p.achievements[id]) return false;
    p.achievements[id] = Date.now();
    saveProfile();
    const a = achievementById(id);
    if (a) {
      setTimeout(() => toast(a.icon + ' Достижение: ' + a.name, 'turn'), delay || 0);
    }
    return true;
  }

  function difficultyOf() {
    const d = state.profile && state.profile.difficulty;
    return DIFFICULTY[d] ? d : 'normal';
  }

  function configFor(kind) {
    const raw = kind === 'online'
      ? (state.net && state.net.config) || (state.profile && state.profile.lobby)
      : (state.profile && state.profile.botConfig);
    return normalizeConfig(raw, 'classic');
  }

  function isClassicConfig(config) {
    const c = config || state.config;
    return !!(c && Number(c.size) === 10 && c.fleet === 'classic' && !c.tactics);
  }

  function configLabel(config) {
    const c = config || state.config;
    const fleet = c.fleet === 'admiral' ? 'Адмиральский' : 'Классика';
    return 'Поле ' + c.size + '×' + c.size + ' · ' + fleet + ' · ' +
      (c.tactics ? 'Тактика' : 'Без тактики');
  }

  function isRatedBattle() {
    return Engine.isRatedBattle('bot', state.config);
  }

  function fleetKey() {
    const key = state.config && state.config.fleet;
    return Engine.fleetFor(state.size, key) ? key : 'classic';
  }

  function fleetSizes() {
    return Engine.fleetFor(state.size, fleetKey()) || Engine.FLEET;
  }

  function applyMotion() {
    const off = !!state.profile && state.profile.motion === 'off';
    document.documentElement.classList.toggle('reduce-motion', off);
  }

  function applyBubbles() {
    const on = !state.profile || state.profile.bubbles !== false;
    document.documentElement.classList.toggle('no-bubbles', !on);
  }

  function applyTheme() {
    const theme = state.profile ? state.profile.theme : 'dark';
    const light = theme === 'light';
    const amoled = theme === 'amoled';
    document.documentElement.classList.toggle('theme-light', light);
    document.documentElement.classList.toggle('theme-amoled', amoled);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', amoled ? '#000000' : light ? '#cfe9f8' : '#04101f');
  }

  function syncSettings() {
    const p = state.profile;
    if (!p) return;
    const vol = Math.round(clamp(typeof p.volume === 'number' ? p.volume : 0.7, 0, 1) * 100);
    const range = $('#set-volume');
    if (range) range.value = vol;
    const volVal = $('#set-volume-val');
    if (volVal) volVal.textContent = vol + '%';

    const sfx = $('#set-sfx');
    if (sfx) {
      const on = !p.muted;
      sfx.classList.toggle('is-on', on);
      sfx.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    const music = $('#set-music');
    if (music) {
      const on = p.music !== false;
      music.classList.toggle('is-on', on);
      music.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    const mv = Math.round(clamp(typeof p.musicVolume === 'number' ? p.musicVolume : 0.5, 0, 1) * 100);
    const mrange = $('#set-music-volume');
    if (mrange) mrange.value = mv;
    const mval = $('#set-music-volume-val');
    if (mval) mval.textContent = mv + '%';

    const motion = $('#set-motion');
    if (motion) {
      const on = p.motion !== 'off';
      motion.classList.toggle('is-on', on);
      motion.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    const bubbles = $('#set-bubbles');
    if (bubbles) {
      const on = p.bubbles !== false;
      bubbles.classList.toggle('is-on', on);
      bubbles.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    const theme = p.theme === 'light' || p.theme === 'amoled' ? p.theme : 'dark';
    $$('#set-theme button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.theme === theme);
    });

    const musicTrack = p.musicTrack === 'ambient' || p.musicTrack === 'tavern'
      ? p.musicTrack : 'pirate';
    $$('#set-music-track button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.track === musicTrack);
    });

    const bot = (p && p.botConfig) || { size: 10, fleet: 'classic', tactics: false };
    $$('#set-size button').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.size) === bot.size);
    });
    const fleet = Engine.fleetFor(bot.size, bot.fleet) ? bot.fleet : 'classic';
    $$('#set-fleet button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.fleet === fleet);
      if (b.dataset.fleet === 'admiral') b.disabled = !Engine.fleetFor(bot.size, 'admiral');
    });
    const tacticsOn = !!bot.tactics;
    $$('#set-tactics button').forEach((b) => {
      b.classList.toggle('is-active', (b.dataset.tactics === 'on') === tacticsOn);
    });
    const d = difficultyOf();
    $$('#set-difficulty button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.level === d);
    });
  }

  /* ---------------- Музыка ---------------- */
  function applyMusicSettings() {
    if (!window.Music) return;
    const p = state.profile;
    Music.setTrack(p.musicTrack === 'ambient' || p.musicTrack === 'tavern' ? p.musicTrack : 'pirate');
    Music.setEnabled(p.music !== false);
    Music.setVolume(clamp(typeof p.musicVolume === 'number' ? p.musicVolume : 0.5, 0, 1));
  }

  function ensureMusicStarted() {
    if (!window.Music || state.profile.music === false) return;
    if (!Music.init()) return;
    applyMusicSettings();
    Music.start();
  }

  /* ---------------- Меню ---------------- */
  function updateMenu() {
    const p = state.profile;
    const rank = Engine.rankFor(p.rating);
    const next = Engine.nextRank(p.rating);

    $('#nickname').value = p.name;
    $('#rating-value').textContent = Math.round(p.rating);
    $('#avatar').textContent = rank.icon;
    $('#rank-icon').textContent = rank.icon;
    $('#rank-name').textContent = rank.name;
    $('#rank-name').style.color = rank.color;
    $('#rank-icon').style.color = rank.color;

    const progress = next
      ? clamp((p.rating - rank.min) / (next.min - rank.min), 0, 1)
      : 1;
    $('#rank-progress').style.width = (progress * 100).toFixed(1) + '%';
    $('#rank-next').textContent = next
      ? 'до ранга «' + next.name + '» — ' + Math.max(0, next.min - Math.round(p.rating)) + ' очков'
      : 'максимальный ранг — ты легенда флота';

    const games = p.games || 0;
    const wr = games ? Math.round((p.wins / games) * 100) : 0;
    $('#stat-games').textContent = games;
    $('#stat-wr').textContent = wr + '%';
    $('#stat-streak').textContent = (p.streak > 0 ? '+' : '') + (p.streak || 0);
    $('#stat-streak').style.color = p.streak > 0 ? '#5ff0b8' : p.streak < 0 ? '#ff8b80' : '';
    $('#stat-best').textContent = Math.round(p.best);
    const st = p.stats || { shots: 0, hits: 0 };
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    $('#accuracy-line').textContent = '🎯 Точность ' + acc + '% · ' + st.shots + ' выстрелов';
    $('#btn-sound').textContent = (!p.muted || p.music !== false) ? '🔊' : '🔇';
    syncSettings();
    updateDailyCard();
    updateSideCards();
    renderHistory();
  }

  /* Серия дней: если победа была вчера — она продолжится, иначе начнётся заново. */
  function nextDailyStreak() {
    const p = state.profile;
    const d = p.daily || {};
    if (d.date === dayKey()) return d.streak || 1;
    if (d.date === dayKey(Date.now() - 86400000)) return (d.streak || 0) + 1;
    return 1;
  }

  function dailyBonusFor(streak) {
    return Math.min(15 + (Math.max(1, streak) - 1) * 5, 40);
  }

  function updateDailyCard() {
    const card = $('#daily-card');
    if (!card) return;
    const p = state.profile;
    const done = p.daily && p.daily.date === dayKey();
    const streak = (p.daily && p.daily.streak) || 0;
    if (done) {
      card.classList.add('is-done');
      $('#daily-icon').textContent = '✅';
      $('#daily-title').textContent = 'Бонус дня получен';
      $('#daily-sub').textContent = 'Серия: ' + streak + ' дн. · возвращайся завтра';
    } else {
      card.classList.remove('is-done');
      const bonus = dailyBonusFor(nextDailyStreak());
      $('#daily-icon').textContent = '🎁';
      $('#daily-title').textContent = 'Ежедневный бонус';
      $('#daily-sub').textContent = 'Победи сегодня — +' + bonus + ' к рейтингу' +
        (streak ? ' · серия ' + streak : '');
    }
  }

  function updateSideCards() {
    const p = state.profile;
    const count = $('#ach-count');
    if (count) {
      const got = Object.keys(p.achievements || {}).length;
      count.textContent = got + ' / ' + ACHIEVEMENTS.length;
    }
    const cup = $('#cup-status');
    if (cup) {
      cup.textContent = (state.cup && !state.cup.finished)
        ? 'Раунд ' + state.cup.round + ' из 3 — продолжить'
        : '3 боя подряд без поражений';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderHistory() {
    const list = $('#history-list');
    const panel = $('#history-panel');
    const hist = state.profile.history || [];
    if (!hist.length) {
      panel.hidden = true;
      list.innerHTML = '';
      return;
    }
    panel.hidden = false;
    list.innerHTML = hist.slice(0, 4).map((h) => {
      const delta = Number(h.delta) || 0;
      return '<div class="history-row">' +
        '<span class="h-dot ' + (h.win ? 'win' : 'lose') + '"></span>' +
        '<span class="h-name">' + escapeHtml(h.name) + '</span>' +
        '<span class="h-res">' + (h.win ? 'победа' : 'поражение') + '</span>' +
        '<span class="h-delta ' + (delta >= 0 ? 'plus' : 'minus') + '">' + (delta >= 0 ? '+' : '') + delta + '</span>' +
      '</div>';
    }).join('');
  }

  function renderAchievements() {
    const grid = $('#ach-grid');
    if (!grid) return;
    const got = state.profile.achievements || {};
    grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const done = !!got[a.id];
      return '<div class="ach-item' + (done ? ' is-done' : '') + '">' +
        '<span class="ach-icon">' + (done ? a.icon : '🔒') + '</span>' +
        '<span class="ach-text"><b>' + escapeHtml(a.name) + '</b>' +
        '<small>' + escapeHtml(a.desc) + '</small></span>' +
        '</div>';
    }).join('');
  }

  function showScreen(name) {
    Object.keys({ menu: 1, online: 1, place: 1, prepare: 1, battle: 1 }).forEach((key) => {
      const screen = $('#screen-' + key);
      if (screen) screen.classList.toggle('is-active', key === name);
    });
    state.screen = name;
    if (name === 'online') {
      // ссылка-приглашение имеет смысл только в браузере (не file://)
      const share = $('#btn-share-room');
      if (share) share.hidden = location.protocol === 'file:';
      renderOnlineMine();
      loadLeaderboard();
    }
    window.scrollTo(0, 0);
    if (name === 'place') positionEditorPanel();
    else closeShipEditor(false);
  }

  function toast(text, kind) {
    const layer = $('#toast-layer');
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = text;
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1500);
    while (layer.children.length > 3) layer.firstElementChild.remove();
  }

  /* ---------------- Доска ---------------- */
  function buildBoard(el, size) {
    const n = size || state.size;
    el.innerHTML = '';
    el.style.setProperty('--n', n);
    const frag = document.createDocumentFragment();
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell';
        b.dataset.x = x;
        b.dataset.y = y;
        b.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1));
        frag.appendChild(b);
      }
    }
    el.appendChild(frag);
  }

  function applyShipLook(cellEl, ship, x, y) {
    cellEl.classList.add('ship');
    const horiz = ship.size === 1 ? true : ship.horizontal;
    cellEl.classList.add(horiz ? 'h' : 'v');
    const idx = ship.cells.findIndex((c) => c.x === x && c.y === y);
    if (idx === 0) cellEl.classList.add('s-first');
    if (idx === ship.size - 1) cellEl.classList.add('s-last');
    if (ship.size === 1) cellEl.classList.add('s-single');
  }

  function paintBoard(el, board, reveal) {
    const n = (board && board.size) || state.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cell = el.children[y * n + x];
        cell.className = 'cell';
        cell.style.removeProperty('--sd');
        const id = board.grid[y][x];
        const ship = id >= 0 ? board.ships[id] : null;
        if (reveal && ship) applyShipLook(cell, ship, x, y);
        const shot = board.shots[y][x];
        if (shot === 'miss') cell.classList.add('miss');
        if (shot === 'hit') cell.classList.add('hit');
        if (ship && ship.sunk) cell.classList.add('sunk');
        cell.dataset.result = (ship && ship.sunk) ? 'sunk' : (shot || '');
        const stateText = shot === 'miss' ? 'мимо'
          : shot === 'hit' ? 'попадание'
          : (ship && ship.sunk ? 'корабль потоплен' : '');
        cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) +
          (stateText ? ': ' + stateText : ''));
      }
    }
  }

  /* ---------------- Матч / расстановка ---------------- */
  function startMatch() {
    state.matchSeq += 1;
    state.mode = 'bot';
    state.config = configFor('bot');
    state.size = state.config.size;
    // Завершённый/просроченный кубок не тянется в обычный бой:
    // чистим и состояние, и сохранение (loadProfile мог его отбросить).
    if (!state.cup) {
      state.profile.cup = null;
      saveProfile();
    } else if (state.cup.finished) {
      state.cup = null;
      state.profile.cup = null;
      saveProfile();
    }
    const level = difficultyOf();
    const boost = DIFFICULTY[level].boost +
      (FLEET_BOOST[fleetKey()] || 0) +
      (state.cupMatch && state.cup ? Math.max(0, state.cup.round - 1) * 90 : 0);
    state.botLevel = level;
    state.botName = Engine.randomName();
    state.botRating = clamp(Math.round(state.profile.rating + randInt(-130, 130) + boost), 250, 2600);
    state.botAvatar = ['🤖', '👾', '🦈', '🐙', '🦑', '🐡', '🦀'][randInt(0, 6)];
    state.bot = new Engine.Bot(level);
    state.enemyBoard = null;
    state.playerBoard = Engine.createBoard(state.size);
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = false;
    state.matchStats = { shots: 0, hits: 0, firstShot: true, firstShotSunk: false };
    setupPlacement();
    showScreen('place');
    Sfx.play('start');
  }

  /* ---------------- Кубок моря ---------------- */
  function startCup() {
    state.mode = 'bot';
    state.cupMatch = true;
    state.cup = { round: 1, wins: 0, date: dayKey() };
    state.profile.cup = state.cup;
    saveProfile();
    startMatch();
    setTimeout(() => toast('🏆 Кубок моря: 3 боя без поражения', 'turn'), 320);
  }

  /* ---------------- Расстановка ---------------- */
  function setupPlacement() {
    closeShipEditor(false);
    setPlacementLocked(false);
    const remaining = remainingFromFleet();
    state.placement = {
      size: biggestLeft(remaining),
      dir: 'right',      // куда «растёт» корабль от клетки под курсором
      erase: false,
      remaining: remaining,
      editor: null
    };
    state.ghost = [];
    state.hover = null;
    buildBoard(boards.place);
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateRotateLabel();
    setErase(false);
    const oppRank = Engine.rankFor(state.botRating);
    const fleetName = fleetKey() === 'admiral' ? ' · адмиральский флот' : '';
    $('#place-opp').textContent = 'Противник: ' + state.botName + ' · ' + state.botRating +
      ' (' + oppRank.name + ') · ' + DIFFICULTY[difficultyOf()].name + fleetName;
    const cfgEl = $('#place-config');
    if (cfgEl) cfgEl.textContent = configLabel(state.config);
    updateReady();
  }

  function remainingFromFleet() {
    const rem = {};
    fleetSizes().forEach((s) => { rem[s] = (rem[s] || 0) + 1; });
    return rem;
  }

  function biggestLeft(rem) {
    const sizes = Object.keys(rem).map(Number).filter((s) => rem[s] > 0).sort((a, b) => b - a);
    return sizes[0] || null;
  }

  function totalLeft() {
    const r = state.placement.remaining;
    return Object.keys(r).reduce((sum, k) => sum + (r[k] || 0), 0);
  }

  function renderDock() {
    const dock = $('#dock-ships');
    const rem = state.placement.remaining;
    const sizes = Object.keys(rem).map(Number).sort((a, b) => b - a);
    dock.innerHTML = '';
    sizes.forEach((size) => {
      const left = rem[size];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ship-chip' +
        (state.placement.size === size ? ' is-selected' : '') +
        (left <= 0 ? ' is-done' : '') +
        (!isHorizontal(state.placement.dir) && size > 1 ? ' is-vertical' : '');
      chip.disabled = left <= 0;
      chip.innerHTML =
        '<span class="ship-blocks">' + new Array(size).fill('<i></i>').join('') + '</span>' +
        '<span class="ship-meta"><b>' + Engine.SHIP_LABEL[size] + '</b><small>' +
        (left > 0 ? 'осталось ' + left : 'готово') + '</small></span>';
      chip.addEventListener('click', () => {
        state.placement.size = size;
        state.placement.erase = false;
        setErase(false);
        renderDock();
        Sfx.play('click');
      });
      dock.appendChild(chip);
    });
  }

  function selectNextSize() {
    state.placement.size = biggestLeft(state.placement.remaining);
  }

  function updateReady() {
    const left = totalLeft();
    $('#btn-ready').disabled = left > 0;
    $('#place-hint').textContent = left
      ? 'Осталось расставить: ' + left
      : 'Флот готов — в бой!';
  }

  /* Направления роста корабля от клетки под курсором.
     right/left — горизонталь, down/up — вертикаль. */
  const DIR_ARROW = { right: '→', left: '←', down: '↓', up: '↑' };
  const DIR_NAME = { right: 'Вправо', left: 'Влево', down: 'Вниз', up: 'Вверх' };
  const DIR_ORDER = ['right', 'down', 'left', 'up'];

  function isHorizontal(dir) {
    return dir !== 'down' && dir !== 'up';
  }

  function oppositeDir(dir) {
    return { right: 'left', left: 'right', down: 'up', up: 'down' }[dir] || 'right';
  }

  /* Верхний левый угол корабля, который растёт из (x,y) в направлении dir. */
  function anchorFor(x, y, size, dir) {
    if (dir === 'left') return { x: x - (size - 1), y: y };
    if (dir === 'up') return { x: x, y: y - (size - 1) };
    return { x: x, y: y };
  }

  /* Пробует основное направление, затем противоположное — так корабль
     сам разворачивается у края поля. Возвращает и клетку-якорь, и флаг. */
  function resolvePlacement(x, y, size, dir) {
    const primary = dir || 'right';
    const horizontal = isHorizontal(primary);
    const tries = [primary, oppositeDir(primary)];
    for (let i = 0; i < tries.length; i++) {
      const base = anchorFor(x, y, size, tries[i]);
      if (Engine.canPlace(state.playerBoard, base.x, base.y, size, horizontal)) {
        return { dir: tries[i], x: base.x, y: base.y, horizontal: horizontal, ok: true };
      }
    }
    const base = anchorFor(x, y, size, primary);
    return { dir: primary, x: base.x, y: base.y, horizontal: horizontal, ok: false };
  }

  function updateRotateLabel() {
    const dir = (state.placement && state.placement.dir) || 'right';
    const btn = $('#btn-rotate');
    btn.textContent = DIR_ARROW[dir] + ' ' + DIR_NAME[dir];
    btn.title = 'Направление: ' + DIR_NAME[dir].toLowerCase() +
      '. Нажми, чтобы повернуть (R), Shift — в другую сторону';
    btn.setAttribute('aria-label', 'Направление корабля: ' + DIR_NAME[dir] +
      '. Нажми, чтобы повернуть');
  }

  function setErase(on) {
    if (!state.placement) return;
    state.placement.erase = on;
    const btn = $('#btn-erase');
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function clearGhost() {
    state.ghost.forEach((c) => c.classList.remove('ghost-ok', 'ghost-bad', 'ghost-flip'));
    state.ghost = [];
  }

  function showGhost(x, y, animate) {
    clearGhost();
    if (!state.placement || !state.placement.size) return;
    const size = state.placement.size;
    // направление не меняем: у края призрак просто развернётся,
    // а выбранный режим останется прежним
    const p = resolvePlacement(x, y, size, state.placement.dir);
    for (let i = 0; i < size; i++) {
      const gx = p.x + (p.horizontal ? i : 0);
      const gy = p.y + (p.horizontal ? 0 : i);
      if (gx < 0 || gy < 0 || gx >= state.size || gy >= state.size) continue;
      const cell = boards.place.children[gy * state.size + gx];
      cell.classList.add(p.ok ? 'ghost-ok' : 'ghost-bad');
      if (animate) cell.classList.add('ghost-flip');
      state.ghost.push(cell);
    }
    if (animate) {
      const cells = state.ghost.slice();
      setTimeout(() => cells.forEach((c) => c.classList.remove('ghost-flip')), 280);
    }
  }

  function placeAt(x, y) {
    if (placementLocked()) return;
    if (state.placement.editor) {
      const picked = Engine.shipAt(state.playerBoard, x, y);
      if (picked) openShipEditor(picked);
      else closeShipEditor();
      return;
    }
    const existing = Engine.shipAt(state.playerBoard, x, y);
    if (existing && !state.placement.erase) {
      openShipEditor(existing);
      return;
    }
    if (state.placement.erase) {
      const ship = Engine.removeShipAt(state.playerBoard, x, y);
      if (ship) {
        state.placement.remaining[ship.size] = (state.placement.remaining[ship.size] || 0) + 1;
        if (!state.placement.size) state.placement.size = ship.size;
        paintBoard(boards.place, state.playerBoard, true);
        renderDock();
        updateReady();
        Sfx.play('place');
      }
      return;
    }
    const size = state.placement.size;
    if (!size) return;
    const p = resolvePlacement(x, y, size, state.placement.dir);
    if (!p.ok) {
      toast('Тут не помещается 😅', 'error');
      Sfx.play('error');
      return;
    }
    if (p.dir !== state.placement.dir) {
      state.placement.dir = p.dir;
      updateRotateLabel();
    }
    Engine.placeShip(state.playerBoard, p.x, p.y, size, p.horizontal);
    state.placement.remaining[size] -= 1;
    selectNextSize();
    clearGhost();
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    // призрак следующего корабля остаётся под курсором — не «пропадает» после клика
    if (state.hover) showGhost(state.hover.x, state.hover.y, false);
    Sfx.play('place');
  }

  /* ---------------- Редактор корабля ---------------- */
  function shipEditorEl() { return $('#ship-editor'); }
  function shipEditorPanel() { return $('#ship-editor .ship-editor-panel'); }

  function placementLocked() {
    return state.mode === 'online' && !!(state.net && state.net.fleetSent);
  }

  function setPlacementLocked(locked) {
    const screen = $('#screen-place');
    if (screen) screen.classList.toggle('is-fleet-sent', !!locked);
    ['#btn-random', '#btn-clear', '#btn-rotate', '#btn-erase'].forEach((sel) => {
      const btn = $(sel);
      if (btn) btn.disabled = !!locked;
    });
    if (locked) closeShipEditor(false);
  }

  function refreshEditorSelection() {
    $$('#board-place .cell').forEach((cell) => cell.classList.remove('ship-selected'));
    const ed = state.placement && state.placement.editor;
    if (!ed) return null;
    const ship = state.playerBoard.ships[ed.shipId];
    if (!ship) return null;
    ship.cells.forEach((c) => {
      const cell = boards.place.children[c.y * state.size + c.x];
      if (cell) {
        cell.classList.add('ship-selected');
        cell.setAttribute('aria-label', 'Клетка ' + (c.x + 1) + ', ' + (c.y + 1) +
          ': корабль, ' + ship.size + ' палуб. Выбран');
      }
    });
    return ship;
  }

  function positionEditorPanel() {
    const panel = shipEditorPanel();
    const ship = refreshEditorSelection();
    if (!panel || !ship) return;
    panel.classList.toggle('is-sheet', window.innerWidth < 640);
    panel.style.left = '';
    panel.style.top = '';
    if (panel.classList.contains('is-sheet')) return;

    const rects = ship.cells.map((c) => {
      const cell = boards.place.children[c.y * state.size + c.x];
      return cell ? cell.getBoundingClientRect() : null;
    }).filter(Boolean);
    if (!rects.length) return;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let py = top - ph - 12;
    if (py < 8) py = bottom + 12;
    py = Math.min(py, window.innerHeight - ph - 8);
    const px = clamp(left + (right - left) / 2 - pw / 2, 8, window.innerWidth - pw - 8);
    panel.style.left = px + 'px';
    panel.style.top = py + 'px';
  }

  function openShipEditor(ship) {
    if (!state.placement || placementLocked()) return;
    state.placement.editor = { shipId: ship.id };
    const editor = shipEditorEl();
    if (editor) editor.hidden = false;
    $('#screen-place').classList.add('is-ship-edit');
    boards.place.classList.add('is-editing');
    const panel = shipEditorPanel();
    if (panel) {
      panel.querySelector('[data-act="left"]').disabled = ship.size <= 1;
      panel.querySelector('[data-act="right"]').disabled = ship.size <= 1;
    }
    positionEditorPanel();
    if (panel) {
      const first = panel.querySelector('button:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
    Sfx.play('click');
  }

  function closeShipEditor(restoreFocus) {
    const editor = shipEditorEl();
    if (editor) editor.hidden = true;
    const screen = $('#screen-place');
    if (screen) screen.classList.remove('is-ship-edit');
    if (boards.place) boards.place.classList.remove('is-editing');
    $$('#board-place .cell').forEach((cell, i) => {
      if (!cell.classList.contains('ship-selected')) return;
      cell.classList.remove('ship-selected');
      const x = i % state.size;
      const y = Math.floor(i / state.size);
      const ship = state.playerBoard ? Engine.shipAt(state.playerBoard, x, y) : null;
      cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + (ship ? ': корабль' : ''));
    });
    if (state.placement) state.placement.editor = null;
    if (restoreFocus !== false) {
      try { boards.place.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function rotateSelectedShip(dir) {
    const ed = state.placement && state.placement.editor;
    if (!ed) return;
    const r = Engine.rotateShip(state.playerBoard, ed.shipId, dir);
    if (!r.ok) {
      const panel = shipEditorPanel();
      if (panel) {
        panel.classList.add('is-shake');
        setTimeout(() => panel.classList.remove('is-shake'), 320);
      }
      const live = $('#ship-editor-live');
      if (live) live.textContent = 'Здесь не помещается. Поверни иначе или удали корабль.';
      toast('Здесь не помещается 😅', 'error');
      Sfx.play('error');
      return;
    }
    paintBoard(boards.place, state.playerBoard, true);
    positionEditorPanel();
    const live = $('#ship-editor-live');
    if (live) live.textContent = 'Корабль повёрнут';
    Sfx.play('place');
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ }
  }

  function deleteSelectedShip() {
    const ed = state.placement && state.placement.editor;
    if (!ed) return;
    const ship = state.playerBoard.ships[ed.shipId];
    if (!ship) { closeShipEditor(); return; }
    const size = ship.size;
    const first = ship.cells[0];
    Engine.removeShipAt(state.playerBoard, first.x, first.y);
    state.placement.remaining[size] = (state.placement.remaining[size] || 0) + 1;
    if (!state.placement.size) state.placement.size = size;
    closeShipEditor(false);
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    Sfx.play('place');
  }

  function randomPlacement() {
    if (placementLocked()) return;
    closeShipEditor(false);
    setPlacementLocked(false);
    state.playerBoard = Engine.randomBoard(fleetSizes());
    state.placement.remaining = remainingFromFleet();
    Object.keys(state.placement.remaining).forEach((k) => { state.placement.remaining[k] = 0; });
    state.placement.size = null;
    clearGhost();
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    Sfx.play('place');
  }

  function clearPlacement() {
    if (placementLocked()) return;
    closeShipEditor(false);
    setPlacementLocked(false);
    state.playerBoard = Engine.createBoard();
    state.placement.remaining = remainingFromFleet();
    state.placement.size = biggestLeft(state.placement.remaining);
    setErase(false);
    clearGhost();
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    Sfx.play('click');
  }

  /* ---------------- Подготовка: две способности ---------------- */
  function prepSelection() {
    const out = [];
    for (const id of (state.loadout || [])) {
      if (Engine.ABILITIES[id] && out.indexOf(id) < 0) out.push(id);
    }
    return out.slice(0, 2);
  }

  function renderPrep() {
    const wrap = $('#prep-cards');
    if (!wrap) return;
    const chosen = prepSelection();
    state.loadout = chosen;
    wrap.innerHTML = '';
    Object.keys(Engine.ABILITIES).forEach((id) => {
      const ability = Engine.ABILITIES[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prep-card';
      btn.dataset.ability = id;
      const on = chosen.indexOf(id) >= 0;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.innerHTML =
        '<span class="prep-icon" aria-hidden="true">' + ability.icon + '</span>' +
        '<span class="prep-name">' + ability.name + '</span>' +
        '<span class="prep-desc">' + ability.desc + '</span>';
      if (on) btn.classList.add('is-on');
      else if (chosen.length >= 2) btn.classList.add('is-dim');
      wrap.appendChild(btn);
    });
    const go = $('#btn-prep-go');
    if (go) go.disabled = chosen.length !== 2;
    const cfg = $('#prep-config');
    if (cfg) cfg.textContent = configLabel(state.config);
    const hint = $('#prep-hint');
    if (hint) {
      hint.textContent = chosen.length === 2
        ? 'Готово: ' + chosen.map((id) => Engine.ABILITIES[id].name).join(' + ')
        : 'Выбери ещё ' + (2 - chosen.length);
    }
  }

  function togglePrepAbility(id) {
    if (!Engine.ABILITIES[id]) return false;
    const chosen = prepSelection();
    const at = chosen.indexOf(id);
    if (at >= 0) {
      chosen.splice(at, 1);
    } else if (chosen.length < 2) {
      chosen.push(id);
    } else {
      toast('Можно выбрать только две способности', 'miss');
      return false;
    }
    state.loadout = chosen.slice(0, 2);
    renderPrep();
    Sfx.play('click');
    return true;
  }

  function showPrepare(onGo) {
    state.loadout = prepSelection();
    state.prepGo = typeof onGo === 'function' ? onGo : null;
    renderPrep();
    showScreen('prepare');
  }

  function confirmLoadout() {
    if (prepSelection().length !== 2) return;
    state.profile.loadout = state.loadout.slice();
    saveProfile();
    const go = state.prepGo;
    state.prepGo = null;
    if (go) go(state.loadout.slice());
  }

  function botLoadout() {
    const ids = Object.keys(Engine.ABILITIES);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      const t = ids[i];
      ids[i] = ids[j];
      ids[j] = t;
    }
    return ids.slice(0, 2);
  }

  function renderAbilityBar() {
    const bar = $('#ability-bar');
    if (!bar) return;
    const tactics = !!(state.config && state.config.tactics) && state.mode !== 'online';
    bar.hidden = !tactics;
    bar.innerHTML = '';
    if (!tactics || !state.abilities) return;
    for (const id of state.loadout) {
      const ability = Engine.ABILITIES[id];
      if (!ability) continue;
      const left = state.abilities[id] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ability-btn';
      btn.dataset.ability = id;
      btn.disabled = left <= 0;
      const armed = state.pendingAbility === id;
      if (armed) btn.classList.add('is-armed');
      btn.setAttribute('aria-pressed', armed ? 'true' : 'false');
      btn.innerHTML =
        '<span aria-hidden="true">' + ability.icon + '</span>' +
        '<span>' + ability.name + '</span>' +
        '<span class="ability-charge">' + left + '</span>';
      bar.appendChild(btn);
    }
  }

  function clearAim() {
    $$('.cell.aim').forEach((c) => c.classList.remove('aim'));
  }

  function paintAim(targetEl, x, y) {
    clearAim();
    if (!targetEl || !state.pendingAbility) return;
    const cells = Engine.areaCells(state.size, Engine.abilitySide(state.size), x, y);
    for (const c of cells) {
      const cell = targetEl.children[c.y * state.size + c.x];
      if (cell) cell.classList.add('aim');
    }
  }

  function armAbility(id) {
    if (!state.abilities || !state.abilities[id] || state.abilities[id] <= 0) return;
    if (state.mode === 'online') return;
    state.pendingAbility = state.pendingAbility === id ? null : id;
    clearAim();
    renderAbilityBar();
    if (state.pendingAbility === 'smoke') {
      toast('💨 Тапни по своему полю — поставим дым', 'turn');
    } else if (state.pendingAbility === 'airstrike') {
      toast('✈️ Тапни по полю противника — удар по площади', 'turn');
      Sfx.play('click');
    }
  }

  function paintSmoke(targetEl, board) {
    if (!targetEl || !board) return;
    $$('.cell.smoke', targetEl).forEach((c) => c.classList.remove('smoke'));
    for (const c of Engine.smokeCells(board)) {
      const cell = targetEl.children[c.y * state.size + c.x];
      if (cell) cell.classList.add('smoke');
    }
  }

  async function useAirstrike(x, y) {
    if (!state.enemyBoard || !state.abilities || state.abilities.airstrike <= 0) return;
    const cells = Engine.areaCells(state.size, Engine.abilitySide(state.size), x, y);
    if (!cells.length) {
      toast('Слишком близко к краю — выбери клетку дальше', 'miss');
      return;
    }
    const seq = state.matchSeq;
    state.locked = true;
    state.pendingAbility = null;
    const res = Engine.airstrike(state.enemyBoard, x, y);
    if (!res.ok) {
      state.locked = false;
      renderAbilityBar();
      toast('Здесь уже всё обстреляно', 'miss');
      return;
    }
    state.abilities.airstrike -= 1;
    renderAbilityBar();

    for (const hit of res.cells) {
      const cell = boards.enemy.children[hit.y * state.size + hit.x];
      if (!cell) continue;
      cell.classList.add('strike');
      markShot(boards.enemy, cell, hit.result);
      if (hit.result === 'miss') {
        cell.classList.add('miss');
        cell.dataset.result = 'miss';
      } else {
        cell.classList.add('hit');
        cell.dataset.result = hit.result === 'sunk' ? 'sunk' : 'hit';
        if (hit.result === 'sunk') revealSunk(boards.enemy, hit.ship);
      }
      setTimeout(() => cell.classList.remove('strike'), 520);
    }
    Sfx.play('boom');
    shake(true);

    if (state.matchStats) {
      state.matchStats.shots += res.cells.length;
      state.matchStats.hits += res.cells.filter((c) => c.result !== 'miss').length;
    }
    updateFleet();
    toast('✈️ Авиаудар: ' + res.cells.length + ' клеток', 'hit');

    if (Engine.allSunk(state.enemyBoard)) {
      endGame(true);
      return;
    }

    state.playerTurn = false;
    setTurn(false);
    await sleep(520);
    if (seq !== state.matchSeq || state.gameOver) return;
    endPlayerTurn();
    botTurn(seq);
  }

  function useSmoke(x, y) {
    if (!state.playerBoard || !state.abilities || state.abilities.smoke <= 0) return;
    if (!state.playerTurn || state.locked || state.gameOver) return;
    const res = Engine.placeSmoke(state.playerBoard, x, y);
    if (!res.ok) {
      toast('Здесь нельзя поставить дым', 'miss');
      return;
    }
    state.abilities.smoke -= 1;
    state.pendingAbility = null;
    renderAbilityBar();
    paintSmoke(boards.own, state.playerBoard);
    toast('💨 Дым на 3 хода соперника', 'turn');
    Sfx.play('click');
    endPlayerTurn();
    botTurn(state.matchSeq);
  }

  // Конец хода игрока: дым соперника на его поле тикает.
  function endPlayerTurn() {
    if (state.enemyBoard && state.enemyBoard.smoke && state.enemyBoard.smoke.length) {
      Engine.tickSmoke(state.enemyBoard);
      paintSmoke(boards.enemy, state.enemyBoard);
    }
  }

  // Конец хода бота: тикает дым игрока на своём поле.
  function endBotTurn() {
    if (state.playerBoard && state.playerBoard.smoke && state.playerBoard.smoke.length) {
      Engine.tickSmoke(state.playerBoard);
      paintSmoke(boards.own, state.playerBoard);
    }
  }

  /* ---------------- Бой ---------------- */
  function beginBattle() {
    closeShipEditor(false);
    setPlacementLocked(false);
    state.enemyBoard = Engine.randomBoard(fleetSizes(), state.size);
    state.bot = new Engine.Bot(difficultyOf());
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = true;
    state.pendingAbility = null;
    state.abilities = state.config.tactics ? Engine.newAbilityState(state.loadout) : null;
    state.botAbilities = state.config.tactics ? Engine.newAbilityState(botLoadout()) : null;

    buildBoard(boards.enemy);
    buildBoard(boards.own);
    paintBoard(boards.enemy, state.enemyBoard, false);
    paintBoard(boards.own, state.playerBoard, true);
    paintSmoke(boards.enemy, state.enemyBoard);
    paintSmoke(boards.own, state.playerBoard);
    clearAim();
    renderAbilityBar();

    const pRank = Engine.rankFor(state.profile.rating);
    $('#b-you-name').textContent = state.profile.name;
    $('#b-you-rate').textContent = Math.round(state.profile.rating) + ' · ' + pRank.name;
    $('#b-foe-name').textContent = state.botName;
    $('#b-foe-rate').textContent = state.botRating + ' · ' + Engine.rankFor(state.botRating).name;
    $('#b-you-avatar').textContent = pRank.icon;
    $('#b-foe-avatar').textContent = state.botAvatar;

    updateFleet();
    showScreen('battle');
    if (YG) YG.gameplayStart();
    setTurn(true);
    state.locked = false;
    Sfx.play('start');
    setTimeout(() => toast('🎯 Тапни по полю противника', 'turn'), 500);
  }

  /* ---------------- Онлайн: комната и бой ---------------- */

  function setOnlineStatus(text, isError) {
    const el = $('#online-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  }

  /* Личный счёт онлайн-побед: считается на устройстве и никуда не уходит. */
  function renderOnlineMine() {
    const el = $('#online-mine');
    if (!el) return;
    const p = state.profile || {};
    const wins = p.onlineWins || 0;
    const games = p.onlineGames || 0;
    el.textContent = games
      ? '🏆 Твои победы в онлайне: ' + wins + ' из ' + games
      : '🏆 Побед в онлайне пока нет — сыграй с другом';
  }

  function startOnlineMatch(foe, config) {
    state.matchSeq += 1;
    state.mode = 'online';
    state.net = state.net || {};
    if (config) state.net.config = config;
    state.config = state.net.config
      ? normalizeConfig(state.net.config)
      : configFor('online');
    state.size = state.config.size;
    state.net.foeShips = fleetSizes().length;
    state.net.foeTotal = fleetSizes().length;
    state.net.fleetSent = false;
    state.botName = (foe && foe.name) || 'Соперник';
    state.botRating = (foe && foe.rating) || 1000;
    state.botAvatar = '🌐';
    state.bot = null;
    state.enemyBoard = null;
    state.playerBoard = Engine.createBoard(state.size);
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = false;
    setupPlacement();
    showScreen('place');
    Sfx.play('start');
    toast('🌐 Игра с ' + state.botName, 'turn');
  }

  function sendFleetOnline() {
    if (!state.net || state.net.fleetSent) return;
    const ships = state.playerBoard.ships.filter(Boolean).map((s) => ({
      size: s.size,
      cells: s.cells.map((c) => [c.x, c.y])
    }));
    Online.fleet(ships);
    state.net.fleetSent = true;
    setPlacementLocked(true);
    $('#btn-ready').disabled = true;
    $('#place-hint').textContent = 'Ждём соперника…';
    $('#place-opp').textContent = 'Противник: ' + state.botName + ' · расставляется';
    toast('⏳ Ждём соперника', 'turn');
  }

  function beginOnlineBattle(first) {
    closeShipEditor(false);
    setPlacementLocked(false);
    state.enemyBoard = Engine.createBoard(state.size);
    state.net.foeShips = fleetSizes().length;
    state.net.foeTotal = fleetSizes().length;
    state.gameOver = false;
    state.locked = !first;
    state.playerTurn = !!first;
    state.matchStats = { shots: 0, hits: 0, firstShot: true, firstShotSunk: false };

    buildBoard(boards.enemy);
    buildBoard(boards.own);
    paintBoard(boards.enemy, state.enemyBoard, false);
    paintBoard(boards.own, state.playerBoard, true);

    const pRank = Engine.rankFor(state.profile.rating);
    const fRank = Engine.rankFor(state.botRating);
    $('#b-you-name').textContent = state.profile.name;
    $('#b-you-rate').textContent = Math.round(state.profile.rating) + ' · ' + pRank.name;
    $('#b-foe-name').textContent = state.botName;
    $('#b-foe-rate').textContent = Math.round(state.botRating) + ' · ' + fRank.name;
    $('#b-you-avatar').textContent = pRank.icon;
    $('#b-foe-avatar').textContent = '🌐';

    updateFleet();
    showScreen('battle');
    setTurn(state.playerTurn);
    state.locked = !state.playerTurn;
    Sfx.play('start');
    toast(state.playerTurn ? '🎯 Твой ход — стреляй!' : '⏳ Первый ход у соперника', 'turn');
  }

  function revealNetShip(targetEl, cells) {
    const list = cells.map((c) => ({ x: c[0], y: c[1] }));
    const horizontal = list.length === 1 ? true : list.every((c) => c.y === list[0].y);
    const ship = { size: list.length, cells: list, horizontal: horizontal };
    list.forEach((c, i) => {
      const cell = targetEl.children[c.y * state.size + c.x];
      if (!cell) return;
      cell.style.setProperty('--sd', (i * 70) + 'ms');
      applyShipLook(cell, ship, c.x, c.y);
      cell.classList.add('sunk', 'ship-reveal');
      cell.dataset.result = 'sunk';
      cell.setAttribute('aria-label', 'Клетка ' + (c.x + 1) + ', ' + (c.y + 1) + ': корабль потоплен');
    });
  }

  /* Яркая метка последнего выстрела: подсветка клетки, лёгкое затемнение
     остального поля и всплывающий значок — сразу видно, куда прилетело. */
  function markShot(targetEl, cell, result) {
    if (!targetEl || !cell) return;
    const miss = result === 'miss';
    cell.classList.add(miss ? 'is-last-miss' : 'is-last-hit');
    targetEl.classList.add('is-spotlight');
    const flag = document.createElement('span');
    flag.className = 'shot-flag ' + (miss ? 'is-miss' : 'is-hit');
    flag.textContent = miss ? '🌊' : '💥';
    flag.style.left = (cell.offsetLeft + cell.offsetWidth / 2) + 'px';
    flag.style.top = (cell.offsetTop + cell.offsetHeight / 2) + 'px';
    targetEl.appendChild(flag);
    setTimeout(() => targetEl.classList.remove('is-spotlight'), 700);
    setTimeout(() => {
      cell.classList.remove('is-last-miss', 'is-last-hit');
      flag.remove();
    }, 1100);
  }

  function applyShotVisual(targetEl, x, y, result, shipCells) {
    const cell = targetEl.children[y * state.size + x];
    if (!cell) return;
    cell.classList.remove('incoming');
    markShot(targetEl, cell, result);
    if (result === 'miss') {
      cell.classList.add('miss');
      cell.dataset.result = 'miss';
      cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': мимо');
      Sfx.play('splash');
      return;
    }
    cell.classList.add('hit');
    cell.dataset.result = result === 'sunk' ? 'sunk' : 'hit';
    cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': ' +
      (result === 'sunk' ? 'корабль потоплен' : 'попадание'));
    if (result === 'sunk' && Array.isArray(shipCells)) {
      revealNetShip(targetEl, shipCells);
      Sfx.play('sunk');
      shake(true);
    } else {
      Sfx.play('boom');
      shake(false);
    }
  }

  /* Если сервер не ответил на выстрел, доска не должна залипнуть навсегда. */
  function clearNetShotTimeout() {
    if (netShotTimer) {
      clearTimeout(netShotTimer);
      netShotTimer = null;
    }
  }

  function armNetShotTimeout() {
    clearNetShotTimeout();
    netShotTimer = setTimeout(() => {
      netShotTimer = null;
      if (state.mode !== 'online' || state.gameOver) return;
      state.locked = false;
      setTurn(!!state.playerTurn);
      toast('Сервер не ответил. Попробуй ещё раз', 'error');
      Sfx.play('error');
    }, 6000);
  }

  function showReconnect(on) {
    const btn = $('#btn-reconnect');
    if (btn) btn.hidden = !on;
  }

  function onNetShot(msg) {
    if (state.mode !== 'online' || state.gameOver || !state.enemyBoard || !state.playerBoard) return;
    clearNetShotTimeout();
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;

    if (msg.mine) {
      state.enemyBoard.shots[y][x] = msg.result === 'miss' ? 'miss' : 'hit';
      // Потопленный корабль раскрывается целиком — помечаем все его клетки,
      // иначе клик по раскрытой клетке уходил на сервер и бой зависал.
      if (msg.result === 'sunk' && Array.isArray(msg.ship)) {
        msg.ship.forEach((c) => {
          const cx = Number(c[0]);
          const cy = Number(c[1]);
          if (cx >= 0 && cy >= 0 && cx < state.size && cy < state.size) {
            state.enemyBoard.shots[cy][cx] = 'hit';
          }
        });
      }
      applyShotVisual(boards.enemy, x, y, msg.result, msg.ship);
      if (state.matchStats) {
        state.matchStats.shots += 1;
        if (msg.result !== 'miss') state.matchStats.hits += 1;
      }
      if (msg.result === 'sunk') state.net.foeShips -= 1;
      updateFleet();
      if (msg.result === 'miss') {
        toast('🌊 Мимо', 'miss');
      } else if (msg.result === 'sunk') {
        toast('☠️ Корабль потоплен!', 'sunk');
        state.locked = false;
      } else {
        toast('💥 Попадание!', 'hit');
        state.locked = false;
      }
      return;
    }

    // Свой флот считаем тем же движком: он ставит hits/sunk, поэтому
    // счётчик «твой флот» уменьшается так же, как у соперника.
    const own = Engine.fire(state.playerBoard, x, y);
    if (!own) state.playerBoard.shots[y][x] = msg.result === 'miss' ? 'miss' : 'hit';
    applyShotVisual(boards.own, x, y, msg.result, msg.ship);
    updateFleet();
    if (msg.result === 'miss') toast('🌊 Соперник промахнулся', 'miss');
    else toast('💢 Соперник попал', 'miss');
  }

  function onNetTurn(msg) {
    if (state.mode !== 'online') return;
    clearNetShotTimeout();
    state.playerTurn = !!msg.you;
    state.locked = !msg.you;
    setTurn(state.playerTurn);
    if (msg.you) {
      Sfx.play('turn');
      toast('🎯 Твой ход', 'turn');
    }
  }

  function leaveOnline(silent) {
    clearNetShotTimeout();
    showReconnect(false);
    closeShipEditor(false);
    setPlacementLocked(false);
    // Выходим и из лобби: иначе комната остаётся на сервере «призраком»,
    // а новый create на том же сокете сервер игнорирует.
    const inRoom = !!(state.net && state.net.code) || state.mode === 'online';
    if (inRoom || (Online.isOpen && Online.isOpen())) {
      try { Online.leave(); } catch (e) { /* ignore */ }
    }
    state.mode = 'bot';
    state.net = null;
    if (!silent) setOnlineStatus('');
  }

  function resetOnlineRoom() {
    const wait = $('#online-wait');
    if (wait) wait.hidden = true;
    const code = $('#online-code');
    if (code) code.textContent = '0000';
    const input = $('#room-code');
    if (input) input.value = '';
    setOnlineStatus('');
  }

  /* Ссылка-приглашение: друг открывает её и сразу попадает в комнату. */
  function shareRoom() {
    const code = state.net && state.net.code;
    if (!code || location.protocol === 'file:') {
      toast('Ссылка работает в браузере', 'miss');
      return;
    }
    const url = location.origin + location.pathname + '?room=' + code;
    const done = (ok) => toast(ok ? '🔗 Ссылка скопирована' : url, ok ? 'turn' : 'miss');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true)).catch(fallback);
    } else {
      fallback();
    }
  }

  function inviteCode() {
    try {
      const v = new URLSearchParams(location.search).get('room');
      return v && /^\d{4}$/.test(v) ? v : null;
    } catch (e) { return null; }
  }

  function joinInvite(code) {
    $('#room-code').value = code;
    showScreen('online');
    setOnlineStatus('Тебя пригласили в комнату ' + code + ' — подключаемся…');
    Online.connect()
      .then(() => {
        setOnlineStatus('Заходим в комнату ' + code + '…');
        Online.join(code, state.profile.name, Math.round(state.profile.rating));
      })
      .catch((err) => setOnlineStatus((err && err.message) || 'Сервер недоступен', true));
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* не критично */ }
  }

  /* Топ игроков онлайн-режима: сервер считает победы сам, клиент только рисует. */
  function loadLeaderboard() {
    const list = $('#lb-list');
    if (!list) return;
    const url = Online.httpUrl('/api/leaderboard');
    if (!url) {
      list.innerHTML = '<li class="lb-empty">Сервер не настроен</li>';
      return;
    }
    list.innerHTML = '<li class="lb-empty">Загрузка…</li>';
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => {
        const rows = (data && data.top) || [];
        if (!rows.length) {
          list.innerHTML = '<li class="lb-empty">Пока нет сыгранных матчей</li>';
          return;
        }
        list.innerHTML = rows.slice(0, 8).map((row, i) => (
          '<li class="lb-row">' +
            '<span class="lb-place">' + (i + 1) + '</span>' +
            '<span class="lb-name">' + escapeHtml(row.name) + '</span>' +
            '<span class="lb-wins">' + (Number(row.wins) || 0) + ' 🏆</span>' +
          '</li>'
        )).join('');
      })
      .catch(() => {
        list.innerHTML = '<li class="lb-empty">Рейтинг недоступен</li>';
      });
  }

  function wireOnlineEvents() {
    Online.on('room', (msg) => {
      state.net = state.net || {};
      state.net.code = msg.code;
      state.net.you = msg.you;
      $('#online-wait').hidden = false;
      $('#online-code').textContent = msg.code;
      $('#online-hint').textContent = 'Скинь код другу — ждём второго игрока…';
      setOnlineStatus('');
      showReconnect(false);
    });

    Online.on('wait', () => {
      setOnlineStatus('Комната создана. Ждём друга…');
    });

    Online.on('start', (msg) => {
      // «start» из брошенной комнаты не должен телепортировать игрока в бой.
      if (state.mode === 'online' || state.screen !== 'online') return;
      startOnlineMatch(msg.foe);
    });

    Online.on('begin', (msg) => {
      if (state.screen !== 'place') return;
      beginOnlineBattle(!!msg.first);
    });

    Online.on('shot', onNetShot);
    Online.on('turn', onNetTurn);

    Online.on('end', (msg) => {
      clearNetShotTimeout();
      if (state.mode !== 'online' || state.gameOver) return;
      endGame(!!msg.win, msg.reason || 'online');
    });

    Online.on('foeLeft', () => {
      toast('👋 Соперник вышел', 'miss');
      if (state.mode === 'online' && !state.gameOver) {
        state.gameOver = true;
        state.locked = true;
        setTimeout(() => {
          leaveOnline(true);
          updateMenu();
          showScreen('menu');
        }, 1200);
      }
    });

    Online.on('error', (msg) => {
      const text = (msg && msg.msg) || 'Ошибка соединения';
      clearNetShotTimeout();
      toast('⚠️ ' + text, 'miss');
      if (state.screen === 'online') setOnlineStatus(text, true);
      // Бой: отклонённый выстрел не должен навсегда блокировать доску.
      if (state.mode === 'online' && state.screen === 'battle' &&
          !state.gameOver && state.playerTurn) {
        state.locked = false;
        setTurn(true);
      }
      // Сервер не принял флот (например, расстановка неполная) —
      // разблокируем «В бой», чтобы можно было отправить заново.
      if (state.mode === 'online' && state.screen === 'place' &&
          state.net && state.net.fleetSent && !state.gameOver) {
        state.net.fleetSent = false;
        setPlacementLocked(false);
        const ready = $('#btn-ready');
        if (ready) ready.disabled = false;
        const hint = $('#place-hint');
        if (hint) hint.textContent = 'Флот не принят — проверь расстановку';
      }
    });

    Online.on('closed', () => {
      clearNetShotTimeout();
      if (state.mode !== 'online' || state.gameOver) return;
      toast('📡 Связь с сервером потеряна', 'miss');
      state.gameOver = true;
      state.locked = true;
      state.net = null;
      state.mode = 'bot';
      setTimeout(() => {
        showScreen('online');
        setOnlineStatus('Связь с сервером потеряна. Подключись заново.', true);
        showReconnect(true);
      }, 1300);
    });
  }


  function updateFleet() {
    if (!state.enemyBoard || !state.playerBoard) return;
    const online = state.mode === 'online' && !!state.net;
    const foeLeft = online ? state.net.foeShips : Engine.shipsLeft(state.enemyBoard);
    const foeTotal = online ? (state.net.foeTotal || fleetSizes().length) : Engine.totalShips(state.enemyBoard);
    $('#foe-fleet').textContent = foeLeft + ' / ' + foeTotal;
    $('#you-fleet').textContent = Engine.shipsLeft(state.playerBoard) + ' / ' + Engine.totalShips(state.playerBoard);
  }

  function setTurn(mine) {
    const pill = $('#turn-pill');
    pill.classList.remove('is-mine', 'is-bot');
    boards.enemy.classList.toggle('is-yours', mine === true);
    if (mine === null) {
      pill.textContent = 'БОЙ';
      return;
    }
    pill.classList.add(mine ? 'is-mine' : 'is-bot');
    pill.textContent = mine ? 'ТВОЙ ХОД' : (state.mode === 'online' ? 'ХОД СОПЕРНИКА' : 'ХОД БОТА');
    boards.enemy.classList.toggle('is-locked', !mine);
  }

  function motionOn() {
    return state.profile.motion !== 'off' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* На телефоне поля не помещаются на экран: перед выстрелом бота
     прокручиваем к твоему флоту, перед твоим ходом — к чужому. */
  function ensureVisible(el, smooth) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top >= 8 && r.bottom <= vh - 8) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    } catch (e) {
      el.scrollIntoView();
    }
    return true;
  }

  function shake(big) {
    const grid = $('#battle-grid');
    grid.classList.remove('is-shaking', 'is-shaking-soft');
    void grid.offsetWidth;
    grid.classList.add(big ? 'is-shaking' : 'is-shaking-soft');
    setTimeout(() => grid.classList.remove('is-shaking', 'is-shaking-soft'), 430);
  }

  function revealSunk(targetEl, ship) {
    ship.cells.forEach((c, i) => {
      const cell = targetEl.children[c.y * state.size + c.x];
      cell.style.setProperty('--sd', (i * 70) + 'ms');
      applyShipLook(cell, ship, c.x, c.y);
      cell.classList.add('sunk', 'ship-reveal');
      cell.dataset.result = 'sunk';
      cell.setAttribute('aria-label', 'Клетка ' + (c.x + 1) + ', ' + (c.y + 1) + ': корабль потоплен');
    });
  }

  async function doShot(targetEl, board, x, y, slow) {
    const cell = targetEl.children[y * state.size + x];
    if (!cell) return null;
    cell.classList.add('incoming');
    await sleep(slow ? 400 : 230);
    cell.classList.remove('incoming');
    const shot = Engine.fire(board, x, y);
    if (!shot) return null;
    markShot(targetEl, cell, shot.result);

    if (shot.result === 'miss') {
      cell.classList.add('miss');
      cell.dataset.result = 'miss';
      cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': мимо');
      Sfx.play('splash');
    } else {
      cell.classList.add('hit');
      cell.dataset.result = shot.result === 'sunk' ? 'sunk' : 'hit';
      cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': ' +
        (shot.result === 'sunk' ? 'корабль потоплен' : 'попадание'));
      if (shot.result === 'sunk') {
        revealSunk(targetEl, shot.ship);
        Sfx.play('sunk');
        shake(true);
      } else {
        Sfx.play('boom');
        shake(false);
      }
    }
    return shot;
  }

  async function playerShoot(x, y) {
    if (state.paused) return;
    if (state.locked || !state.playerTurn || state.gameOver || !state.enemyBoard) return;
    if (state.pendingAbility === 'airstrike') {
      await useAirstrike(x, y);
      return;
    }
    if (Engine.smokeBlocks(state.enemyBoard, x, y)) {
      toast('💨 Сюда нельзя: дым соперника', 'miss');
      return;
    }
    if (state.enemyBoard.shots[y][x]) return;

    if (state.mode === 'online') {
      state.locked = true;
      Online.shot(x, y);
      armNetShotTimeout();
      return;
    }

    const seq = state.matchSeq;
    state.locked = true;
    const shot = await doShot(boards.enemy, state.enemyBoard, x, y);
    if (seq !== state.matchSeq || state.gameOver) return;
    if (!shot) {
      state.locked = false;
      return;
    }
    if (state.matchStats) {
      state.matchStats.shots += 1;
      if (shot.result !== 'miss') state.matchStats.hits += 1;
      if (state.matchStats.firstShot) {
        state.matchStats.firstShot = false;
        if (shot.result === 'sunk' && shot.ship && shot.ship.size >= 4) {
          state.matchStats.firstShotSunk = true;
        }
      }
    }
    updateFleet();

    if (Engine.allSunk(state.enemyBoard)) {
      endGame(true);
      return;
    }

    // Бот может прикрыть повреждённый корабль дымом.
    if (state.config.tactics && state.botAbilities && state.botAbilities.smoke > 0 &&
        shot.result !== 'miss' && shot.ship && Math.random() < 0.35) {
      const anchor = shot.ship.cells[0];
      if (Engine.placeSmoke(state.enemyBoard, anchor.x, anchor.y).ok) {
        state.botAbilities.smoke -= 1;
        paintSmoke(boards.enemy, state.enemyBoard);
        toast('💨 Бот поставил дым', 'turn');
      }
    }

    if (shot.result === 'miss') {
      toast('🌊 Мимо', 'miss');
      state.playerTurn = false;
      setTurn(false);
      endPlayerTurn();
      await sleep(430);
      if (seq !== state.matchSeq) return;
      botTurn(seq);
    } else {
      if (shot.result === 'sunk') toast('☠️ ' + Engine.SHIP_LABEL[shot.ship.size] + ' потоплен!', 'sunk');
      else toast('💥 Попадание!', 'hit');
      state.locked = false;
    }
  }

  async function botTurn(seq) {
    if (seq !== state.matchSeq || state.gameOver) return;
    state.playerTurn = false;
    state.locked = true;
    setTurn(false);

    while (!state.gameOver) {
      await sleep(randInt(480, 820));
      if (seq !== state.matchSeq || state.gameOver) return;
      await waitWhilePaused();
      if (seq !== state.matchSeq || state.gameOver) return;
      if (ensureVisible(boards.own, motionOn())) await sleep(280);
      await waitWhilePaused();
      if (seq !== state.matchSeq || state.gameOver) return;

      let move = state.bot.choose(state.playerBoard);
      if (!move) break;

      // Дым игрока: бот не стреляет в задымлённые клетки.
      let guard = 0;
      while (Engine.smokeBlocks(state.playerBoard, move.x, move.y) && guard++ < 300) {
        state.bot.report(move.x, move.y, { result: 'miss' });
        const next = state.bot.choose(state.playerBoard);
        if (!next) break;
        move = next;
      }
      if (Engine.smokeBlocks(state.playerBoard, move.x, move.y)) break;

      const shot = await doShot(boards.own, state.playerBoard, move.x, move.y, true);
      if (seq !== state.matchSeq || state.gameOver) return;
      if (!shot) continue;

      state.bot.report(move.x, move.y, shot);
      updateFleet();

      if (Engine.allSunk(state.playerBoard)) {
        endGame(false);
        return;
      }

      // Тактика бота: авиаудар по области последнего попадания.
      if (state.config.tactics && state.botAbilities && state.botAbilities.airstrike > 0 &&
          shot.result !== 'miss' && Math.random() < 0.5) {
        const res = Engine.airstrike(state.playerBoard, move.x, move.y);
        if (res.ok) {
          state.botAbilities.airstrike -= 1;
          for (const hit of res.cells) {
            const cell = boards.own.children[hit.y * state.size + hit.x];
            if (!cell) continue;
            cell.classList.add('strike');
            setTimeout(() => cell.classList.remove('strike'), 520);
            if (hit.result === 'miss') {
              cell.classList.add('miss');
              cell.dataset.result = 'miss';
            } else {
              cell.classList.add('hit');
              cell.dataset.result = hit.result === 'sunk' ? 'sunk' : 'hit';
              if (hit.result === 'sunk') revealSunk(boards.own, hit.ship);
            }
          }
          Sfx.play('boom');
          shake(true);
          updateFleet();
          toast('✈️ Бот нанёс авиаудар', 'sunk');
          if (Engine.allSunk(state.playerBoard)) {
            endGame(false);
            return;
          }
          await sleep(420);
        }
      }

      if (shot.result === 'miss') {
        toast('🌊 Бот промахнулся', 'miss');
        await sleep(360);
        break;
      }

      if (shot.result === 'sunk') toast('💀 Бот потопил ' + Engine.SHIP_LABEL[shot.ship.size].toLowerCase(), 'sunk');
      else toast('🔥 Бот попал', 'hit');
      await sleep(420);
    }

    if (seq !== state.matchSeq || state.gameOver) return;
    endBotTurn();
    state.playerTurn = true;
    state.locked = false;
    setTurn(true);
    toast('🎯 Твой ход', 'turn');
    Sfx.play('turn');
    ensureVisible(boards.enemy, motionOn());
  }

  /* ---------------- Конец боя ---------------- */
  async function endGame(playerWon, reason) {
    if (state.gameOver) return;
    const seq = state.matchSeq;
    state.gameOver = true;
    state.locked = true;
    state.playerTurn = false;
    if (YG) YG.gameplayStop();

    const pill = $('#turn-pill');
    pill.classList.remove('is-mine', 'is-bot');
    pill.classList.add(playerWon ? 'is-mine' : 'is-bot');
    pill.textContent = playerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    boards.enemy.classList.add('is-locked');

    if (state.mode !== 'online') paintBoard(boards.enemy, state.enemyBoard, true);
    updateFleet();
    Sfx.play(playerWon ? 'win' : 'lose');

    await sleep(800);
    if (seq !== state.matchSeq) return;
    if (state.screen !== 'battle') return;

    const ms = state.matchStats || { shots: 0, hits: 0, firstShot: true, firstShotSunk: false };
    const p = state.profile;

    if (state.mode === 'online') {
      const same = Math.round(p.rating);
      p.stats = p.stats || { shots: 0, hits: 0 };
      p.stats.shots += ms.shots;
      p.stats.hits += ms.hits;
      // Личный счёт онлайна — на этом устройстве, сервер его не хранит.
      p.onlineGames = (p.onlineGames || 0) + 1;
      if (playerWon) p.onlineWins = (p.onlineWins || 0) + 1;
      unlockAchievement('online', 700);
      saveProfile();
      updateMenu();
      showResult(playerWon, same, same, 0, reason, null);
      return;
    }

    const oldRating = Math.round(p.rating);
    const delta = Engine.eloDelta(oldRating, Math.round(state.botRating), playerWon ? 1 : 0);

    // Ежедневный бонус: первая победа за календарный день.
    let dailyGain = 0;
    if (playerWon && (!p.daily || p.daily.date !== dayKey())) {
      const streak = nextDailyStreak();
      p.daily = { date: dayKey(), streak: streak };
      dailyGain = dailyBonusFor(streak);
    }

    // «Кубок моря»: три боя подряд без поражения.
    // В зачёт идут только бои, начатые из карточки кубка, —
    // обычное «В бой» кубок не двигает и не сбрасывает.
    let cupInfo = null;
    if (state.cupMatch && state.cup && !state.cup.finished) {
      if (playerWon) {
        state.cup.wins = (state.cup.wins || 0) + 1;
        if (state.cup.round >= 3) {
          state.cup.finished = true;
          cupInfo = { done: true, won: true, gain: 60 };
        } else {
          state.cup.round += 1;
          state.cup.date = dayKey();
          cupInfo = { done: false, round: state.cup.round };
        }
      } else {
        cupInfo = { done: true, won: false };
        state.cup = null;
      }
    }
    p.cup = state.cup;

    const cupGain = cupInfo && cupInfo.done && cupInfo.won ? cupInfo.gain : 0;
    const newRating = Math.max(0, oldRating + delta + dailyGain + cupGain);

    p.rating = newRating;
    p.games = (p.games || 0) + 1;
    if (playerWon) {
      p.wins = (p.wins || 0) + 1;
      p.streak = p.streak > 0 ? p.streak + 1 : 1;
    } else {
      p.losses = (p.losses || 0) + 1;
      p.streak = p.streak < 0 ? p.streak - 1 : -1;
    }
    p.best = Math.max(p.best || 0, newRating);
    p.stats = p.stats || { shots: 0, hits: 0 };
    p.stats.shots += ms.shots;
    p.stats.hits += ms.hits;
    p.history = [{
      name: state.botName,
      rating: Math.round(state.botRating),
      delta: newRating - oldRating,
      win: !!playerWon,
      ts: Date.now()
    }].concat(p.history || []).slice(0, 8);

    // достижения — проверяем после обновления статистики
    let achOrder = 0;
    const unlock = (id) => { unlockAchievement(id, 900 + (achOrder++) * 450); };
    if (playerWon) unlock('first_win');
    if (playerWon && ms.shots > 0 && ms.hits === ms.shots) unlock('perfect');
    if (ms.firstShotSunk) unlock('first_blood');
    if (p.streak >= 5) unlock('win5');
    if ((p.wins || 0) >= 10) unlock('win10');
    if ((p.wins || 0) >= 50) unlock('win50');
    if (newRating >= 1500) unlock('rank1500');
    if (p.daily && p.daily.streak >= 3) unlock('daily3');
    if (playerWon && fleetKey() === 'admiral') unlock('admiral');
    if (cupInfo && cupInfo.done && cupInfo.won) unlock('cup');

    // Яндекс Игры: считаем бои для показа рекламы между матчами
    if (YG) p.adMatches = (p.adMatches || 0) + 1;

    saveProfile();
    updateMenu();

    showResult(playerWon, oldRating, newRating, delta + dailyGain + cupGain, reason,
      { dailyGain: dailyGain, cupInfo: cupInfo });
  }

  function animateNumber(el, from, to, duration) {
    const started = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function showResult(win, oldRating, newRating, delta, reason, extras) {
    const overlay = $('#overlay');
    overlay.classList.toggle('is-lose', !win);
    overlay.hidden = false;
    overlay.classList.remove('is-open');
    if (window.Music) Music.duck(true);

    $('#result-emblem').textContent = win ? '🏆' : '💥';
    $('#result-title').textContent = win ? 'Победа!' : 'Поражение';
    const online = state.mode === 'online';
    $('#result-sub').textContent = win
      ? (reason === 'surrender' ? 'Соперник сдался — победа твоя' : 'Флот противника отправлен на дно')
      : (reason === 'surrender' ? 'Ты покинул бой' : 'Твой флот уничтожен');
    $('#result-opp').textContent = (online ? 'онлайн · ' : 'против ') + state.botName +
      (state.botRating ? ' · ' + Math.round(state.botRating) : '');

    const eloRow = document.querySelector('.result-card .elo-row');
    if (eloRow) eloRow.hidden = online;

    if (online) {
      $('#btn-again').textContent = '🔁 Новая комната';
    } else if (state.cupMatch && state.cup && state.cup.finished) {
      $('#btn-again').textContent = '🏆 Новый кубок';
    } else if (state.cupMatch && state.cup && state.cup.round > 1) {
      $('#btn-again').textContent = '▶️ Раунд ' + state.cup.round;
    } else {
      $('#btn-again').textContent = '⚔️ Ещё бой';
    }

    // бонусы дня и кубка — отдельной строкой, чтобы не путать с ELO
    const bonusEl = $('#bonus-line');
    if (bonusEl) {
      const parts = [];
      if (extras && extras.dailyGain > 0) parts.push('🎁 Бонус дня +' + extras.dailyGain);
      if (extras && extras.cupInfo) {
        const c = extras.cupInfo;
        if (c.done && c.won) parts.push('🏆 Кубок моря твой! +' + c.gain);
        else if (c.done) parts.push('🏆 Кубок упущен — начни заново из меню');
        else parts.push('🏆 Кубок: раунд ' + c.round + ' из 3');
      }
      bonusEl.hidden = !parts.length;
      bonusEl.textContent = parts.join(' · ');
    }

    $('#elo-before').textContent = oldRating;
    $('#elo-after').textContent = oldRating;
    const deltaEl = $('#elo-delta');
    deltaEl.textContent = (delta >= 0 ? '+' : '') + delta;
    deltaEl.classList.toggle('minus', delta < 0);

    const rankEl = $('#rank-change');
    const oldRank = Engine.rankFor(oldRating);
    const newRank = Engine.rankFor(newRating);
    if (oldRank.name !== newRank.name) {
      rankEl.hidden = false;
      rankEl.classList.toggle('down', newRank.min < oldRank.min);
      rankEl.textContent = (newRank.min > oldRank.min ? '⬆️ Новый ранг: ' : '⬇️ Ранг понижен: ') +
        newRank.icon + ' ' + newRank.name;
    } else {
      rankEl.hidden = true;
    }

    requestAnimationFrame(() => overlay.classList.add('is-open'));
    setTimeout(() => animateNumber($('#elo-after'), oldRating, newRating, 900), 550);
    if (win) confetti();
    updateBonusButton();
  }

  /* ---------------- Реклама (только Яндекс Игры) ---------------- */

  /* Награда за rewarded-видео: раз в день, +25 к рейтингу. */
  function canShowAdBonus() {
    return !!YG && state.profile.adBonusDate !== dayKey();
  }

  function updateBonusButton() {
    const btn = $('#btn-bonus');
    if (!btn) return;
    btn.hidden = true;
    if (!YG || !canShowAdBonus()) return;
    // SDK инициализируется асинхронно — показываем кнопку, когда он готов
    YG.whenReady().then(function (sdk) {
      if (!sdk || !canShowAdBonus()) return;
      const overlay = $('#overlay');
      if (overlay && !overlay.hidden) btn.hidden = false;
    });
  }

  function applyAdBonus() {
    const p = state.profile;
    if (p.adBonusDate === dayKey()) return;
    const before = Math.round(p.rating);
    p.rating = before + 25;
    p.best = Math.max(p.best || 0, p.rating);
    p.adBonusDate = dayKey();
    saveProfile();
    updateMenu();
    const btn = $('#btn-bonus');
    if (btn) btn.hidden = true;
    animateNumber($('#elo-after'), before, p.rating, 700);
    const bonusEl = $('#bonus-line');
    if (bonusEl) {
      const prev = bonusEl.hidden ? '' : bonusEl.textContent + ' · ';
      bonusEl.hidden = false;
      bonusEl.textContent = prev + '🎁 Реклама +25';
    }
    toast('🎁 +25 к рейтингу за просмотр', 'turn');
    Sfx.play('win');
  }

  /* Полноэкранная реклама между боями: не чаще раза в 90 секунд
     и не раньше третьего боя, чтобы не мешать новичку. */
  function showInterstitialBetweenMatches(done) {
    const p = state.profile;
    const ready = !!YG && (p.adMatches || 0) >= 2 && Date.now() - (p.lastAdAt || 0) >= 90000;
    if (!ready) { done(); return; }
    YG.showInterstitial().then(function (wasShown) {
      // даже неудачный показ считаем попыткой: иначе будем дёргать SDK каждый бой
      p.lastAdAt = Date.now();
      if (wasShown) p.adMatches = 0;
      saveProfile();
      done();
    }, done);
  }

  function confetti() {
    const layer = $('#confetti');
    layer.innerHTML = '';
    const colors = ['#ffd166', '#35e0d2', '#ff6b5e', '#8b9cff', '#45e0a8', '#ff9ecd', '#7fe0ff'];
    const count = window.innerWidth < 700 ? 26 : 46;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i');
      bit.style.left = (Math.random() * 100) + '%';
      bit.style.background = colors[i % colors.length];
      bit.style.setProperty('--x', (Math.random() * 200 - 100) + 'px');
      bit.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      bit.style.animationDelay = (Math.random() * 0.5) + 's';
      bit.style.animationDuration = (1.7 + Math.random() * 1.3) + 's';
      layer.appendChild(bit);
    }
    setTimeout(() => { layer.innerHTML = ''; }, 3600);
  }

  function closeOverlay(el) {
    if (!el) return;
    if (el.id === 'overlay' && window.Music) Music.duck(false);
    if (el._closeTimer) clearTimeout(el._closeTimer);
    el.classList.remove('is-open');
    el._closeTimer = setTimeout(() => {
      el._closeTimer = null;
      if (!el.classList.contains('is-open')) el.hidden = true;
      el.classList.remove('is-lose');
    }, 340);
  }

  /* ---------------- Сброс прогресса ---------------- */
  function resetProgress(keepSettings) {
    const p = state.profile || defaultProfile();
    const keep = {
      name: p.name,
      muted: p.muted,
      volume: p.volume,
      music: p.music,
      musicVolume: p.musicVolume,
      musicTrack: p.musicTrack,
      motion: p.motion,
      bubbles: p.bubbles,
      theme: p.theme,
      difficulty: p.difficulty,
      fleet: p.fleet
    };
    state.profile = Object.assign(defaultProfile(), keepSettings ? keep : { name: keep.name });
    state.cup = null;
    state.cupMatch = false;
    saveProfile();
    applyMotion();
    applyBubbles();
    applyTheme();
    applyMusicSettings();
    updateMenu();
  }

  /* ---------------- События ---------------- */
  function commitNickname() {
    const input = $('#nickname');
    let v = input.value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!v) v = state.profile.name;
    state.profile.name = v;
    input.value = v;
    saveProfile();
  }

  function wireEvents() {
    $('#btn-play').addEventListener('click', () => {
      Sfx.play('click');
      state.mode = 'bot';
      state.cupMatch = false;
      startMatch();
    });

    $('#btn-online').addEventListener('click', () => {
      Sfx.play('click');
      if (!Online.available()) {
        toast('⚠️ Онлайн ещё не настроен', 'miss');
        return;
      }
      $('#online-wait').hidden = true;
      $('#room-code').value = '';
      setOnlineStatus('');
      showScreen('online');
    });

    $('#btn-online-back').addEventListener('click', () => {
      Sfx.play('click');
      leaveOnline();
      resetOnlineRoom();
      updateMenu();
      showScreen('menu');
    });

    $('#btn-share-room').addEventListener('click', () => {
      Sfx.play('click');
      shareRoom();
    });

    $('#btn-lb-refresh').addEventListener('click', () => {
      Sfx.play('click');
      loadLeaderboard();
    });

    $('#btn-reconnect').addEventListener('click', () => {
      Sfx.play('click');
      showReconnect(false);
      setOnlineStatus('Подключаемся…');
      Online.connect()
        .then(() => setOnlineStatus('Соединение восстановлено'))
        .catch((err) => {
          setOnlineStatus((err && err.message) || 'Сервер недоступен', true);
          showReconnect(true);
        });
    });

    $('#btn-create-room').addEventListener('click', () => {
      Sfx.play('click');
      Online.connect()
        .then(() => {
          setOnlineStatus('Создаём комнату…');
          Online.create(state.profile.name, Math.round(state.profile.rating));
        })
        .catch((err) => {
          setOnlineStatus((err && err.message) || 'Сервер недоступен', true);
        });
    });

    function joinRoom() {
      const code = ($('#room-code').value || '').replace(/\D/g, '');
      if (code.length !== 4) {
        setOnlineStatus('Введи 4 цифры кода', true);
        return;
      }
      Sfx.play('click');
      Online.connect()
        .then(() => {
          setOnlineStatus('Подключаемся…');
          Online.join(code, state.profile.name, Math.round(state.profile.rating));
        })
        .catch((err) => {
          setOnlineStatus((err && err.message) || 'Сервер недоступен', true);
        });
    }

    $('#btn-join-room').addEventListener('click', joinRoom);
    $('#room-code').addEventListener('input', (e) => {
      e.target.value = (e.target.value || '').replace(/\D/g, '').slice(0, 4);
    });
    $('#room-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); joinRoom(); }
    });

    $('#btn-sound').addEventListener('click', () => {
      const anyOn = !state.profile.muted || state.profile.music !== false;
      const next = !anyOn;
      state.profile.muted = !next;
      state.profile.music = next;
      saveProfile();
      applyMusicSettings();
      if (next) ensureMusicStarted();
      else if (window.Music) Music.stop();
      syncSettings();
      updateMenu();
      if (next) Sfx.play('click');
    });

    $('#nickname').addEventListener('change', commitNickname);
    $('#nickname').addEventListener('blur', commitNickname);
    $('#nickname').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });

    $('#btn-rules').addEventListener('click', () => {
      Sfx.play('click');
      const modal = $('#modal-rules');
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('is-open'));
    });

    $('#btn-achievements').addEventListener('click', () => {
      Sfx.play('click');
      renderAchievements();
      const modal = $('#modal-achievements');
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('is-open'));
    });
    $('#btn-ach-close').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#modal-achievements'));
    });
    $('#modal-achievements').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeOverlay(e.currentTarget);
    });

    $('#btn-cup').addEventListener('click', () => {
      Sfx.play('click');
      state.mode = 'bot';
      state.cupMatch = true;
      if (state.cup && !state.cup.finished) {
        startMatch();
        return;
      }
      startCup();
    });

    $('#daily-card').addEventListener('click', () => {
      const p = state.profile;
      if (p.daily && p.daily.date === dayKey()) {
        toast('✅ Бонус дня уже получен — серия ' + p.daily.streak + ' дн.', 'turn');
      } else {
        toast('🎁 Победи сегодня и получи +' + dailyBonusFor(nextDailyStreak()) + ' к рейтингу', 'turn');
      }
      Sfx.play('click');
    });
    $('#btn-rules-close').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#modal-rules'));
    });
    $('#modal-rules').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeOverlay(e.currentTarget);
    });

    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('Сбросить рейтинг, статистику и историю боёв? Настройки останутся.')) return;
      resetProgress(true);
      Sfx.play('click');
    });

    /* --- настройки --- */
    $('#btn-settings').addEventListener('click', () => {
      Sfx.play('click');
      syncSettings();
      const modal = $('#modal-settings');
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('is-open'));
    });
    $('#btn-settings-close').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#modal-settings'));
    });
    $('#modal-settings').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeOverlay(e.currentTarget);
    });

    $('#set-volume').addEventListener('input', (e) => {
      state.profile.volume = clamp(Number(e.target.value) / 100, 0, 1);
      $('#set-volume-val').textContent = Math.round(state.profile.volume * 100) + '%';
      if (state.profile.muted && state.profile.volume > 0) {
        state.profile.muted = false;
        $('#btn-sound').textContent = '🔊';
      }
      saveProfile();
    });
    $('#set-volume').addEventListener('change', () => Sfx.play('click'));

    $('#set-sfx').addEventListener('click', () => {
      state.profile.muted = !state.profile.muted;
      saveProfile();
      syncSettings();
      updateMenu();
      Sfx.play('click');
    });

    $('#set-music').addEventListener('click', () => {
      state.profile.music = state.profile.music === false;
      saveProfile();
      applyMusicSettings();
      if (state.profile.music) {
        ensureMusicStarted();
      } else if (window.Music) {
        Music.stop();
      }
      syncSettings();
      updateMenu();
      Sfx.play('click');
    });

    $('#set-music-volume').addEventListener('input', (e) => {
      state.profile.musicVolume = clamp(Number(e.target.value) / 100, 0, 1);
      const val = $('#set-music-volume-val');
      if (val) val.textContent = Math.round(state.profile.musicVolume * 100) + '%';
      applyMusicSettings();
      saveProfile();
    });
    $('#set-music-volume').addEventListener('change', () => Sfx.play('click'));

    $('#set-motion').addEventListener('click', () => {
      state.profile.motion = state.profile.motion === 'off' ? 'on' : 'off';
      applyMotion();
      syncSettings();
      saveProfile();
      Sfx.play('click');
    });

    $('#set-bubbles').addEventListener('click', () => {
      state.profile.bubbles = state.profile.bubbles === false;
      applyBubbles();
      syncSettings();
      saveProfile();
      Sfx.play('click');
    });

    $('#set-theme').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-theme]');
      if (!btn) return;
      const value = btn.dataset.theme;
      state.profile.theme = value === 'light' || value === 'amoled' ? value : 'dark';
      applyTheme();
      syncSettings();
      saveProfile();
      Sfx.play('click');
    });

    $('#set-music-track').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-track]');
      if (!btn) return;
      const value = btn.dataset.track;
      state.profile.musicTrack = value === 'ambient' || value === 'tavern' ? value : 'pirate';
      applyMusicSettings();
      syncSettings();
      saveProfile();
      Sfx.play('click');
    });

    $('#set-size').addEventListener('click', (e) => {
      if (state.screen !== 'menu') return;
      const btn = e.target.closest('button[data-size]');
      if (!btn) return;
      const cfg = state.profile.botConfig;
      cfg.size = Number(btn.dataset.size);
      if (!Engine.fleetFor(cfg.size, cfg.fleet)) cfg.fleet = 'classic';
      state.profile.fleet = cfg.fleet;
      syncSettings();
      saveProfile();
      Sfx.play('click');
      toast('Поле: ' + cfg.size + '×' + cfg.size, 'turn');
    });

    $('#set-fleet').addEventListener('click', (e) => {
      if (state.screen !== 'menu') return;
      const btn = e.target.closest('button[data-fleet]');
      if (!btn || btn.disabled) return;
      const cfg = state.profile.botConfig;
      const key = btn.dataset.fleet === 'admiral' ? 'admiral' : 'classic';
      if (!Engine.fleetFor(cfg.size, key)) return;
      cfg.fleet = key;
      state.profile.fleet = key;
      syncSettings();
      saveProfile();
      Sfx.play('click');
      toast('Флот: ' + (key === 'admiral' ? 'адмиральский 🛳️' : 'классический ⚓'), 'turn');
    });

    $('#set-tactics').addEventListener('click', (e) => {
      if (state.screen !== 'menu') return;
      const btn = e.target.closest('button[data-tactics]');
      if (!btn) return;
      state.profile.botConfig.tactics = btn.dataset.tactics === 'on';
      syncSettings();
      saveProfile();
      Sfx.play('click');
      toast(state.profile.botConfig.tactics
        ? 'Тактика: выбор двух способностей'
        : 'Бой без способностей', 'turn');
    });

    $('#set-difficulty').addEventListener('click', (e) => {
      if (state.screen !== 'menu') return;
      const btn = e.target.closest('button[data-level]');
      if (!btn) return;
      state.profile.difficulty = btn.dataset.level;
      syncSettings();
      saveProfile();
      Sfx.play('click');
      toast('Сложность бота: ' + DIFFICULTY[btn.dataset.level].name, 'turn');
    });

    $('#btn-reset-stats').addEventListener('click', () => {
      if (!confirm('Сбросить рейтинг, статистику и историю боёв? Настройки останутся.')) return;
      resetProgress(true);
      Sfx.play('click');
    });
    $('#btn-reset-all').addEventListener('click', () => {
      if (!confirm('Сбросить всё: рейтинг, статистику, историю и настройки?')) return;
      resetProgress(false);
      Sfx.play('click');
    });

    $('#btn-back').addEventListener('click', () => {
      Sfx.play('click');
      if (state.mode === 'online') {
        leaveOnline();
        resetOnlineRoom();
        showScreen('online');
        return;
      }
      showScreen('menu');
      updateMenu();
    });

    /* --- расстановка --- */
    // Свайп по полю на телефоне: провёл пальцем — корабль повернулся
    // в сторону свайпа. Обычный тап по-прежнему ставит корабль.
    let swipe = null;
    let ignoreClickUntil = 0;

    boards.place.addEventListener('pointerdown', (e) => {
      if (!state.placement || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const cell = e.target.closest('.cell');
      swipe = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        cell: cell ? { x: Number(cell.dataset.x), y: Number(cell.dataset.y) } : null
      };
    });

    boards.place.addEventListener('pointerup', (e) => {
      if (!swipe || swipe.id !== e.pointerId) { swipe = null; return; }
      const s = swipe;
      swipe = null;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.sqrt(dx * dx + dy * dy) < 24) return;   // это тап, не свайп
      ignoreClickUntil = Date.now() + 400;
      const dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      setDirection(dir, s.cell);
      Sfx.play('click');
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* не критично */ }
    });

    boards.place.addEventListener('pointercancel', () => { swipe = null; });

    boards.place.addEventListener('click', (e) => {
      if (Date.now() < ignoreClickUntil) return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      placeAt(Number(cell.dataset.x), Number(cell.dataset.y));
    });

    boards.place.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const cell = e.target.closest('.cell');
      if (!cell) { state.hover = null; clearGhost(); return; }
      state.hover = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
      showGhost(state.hover.x, state.hover.y, false);
    });
    boards.place.addEventListener('pointerleave', () => {
      state.hover = null;
      clearGhost();
    });
    boards.place.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleRotate(e.shiftKey);
    });
    // колесо над полем — тоже поворот, страница при этом не скроллится
    let lastWheel = 0;
    boards.place.addEventListener('wheel', (e) => {
      if (!state.placement) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel < 220) return;   // трекпад сыплет событиями — не крутим 10 раз
      lastWheel = now;
      toggleRotate(e.shiftKey);
      Sfx.play('click');
    }, { passive: false });

    $('#btn-rotate').addEventListener('click', (e) => {
      Sfx.play('click');
      toggleRotate(e.shiftKey);
    });
    $('#btn-random').addEventListener('click', randomPlacement);
    $('#btn-clear').addEventListener('click', clearPlacement);
    $('#btn-erase').addEventListener('click', () => {
      const next = !state.placement.erase;
      setErase(next);
      if (next) toast('🖐️ Тапни по кораблю, чтобы убрать', 'turn');
      Sfx.play('click');
    });
    $('#btn-ready').addEventListener('click', () => {
      if (totalLeft() > 0) return;
      Sfx.play('click');
      if (state.mode === 'online') { sendFleetOnline(); return; }
      if (state.config && state.config.tactics) {
        showPrepare(() => beginBattle());
        return;
      }
      beginBattle();
    });

    /* --- экран подготовки --- */
    $('#prep-cards').addEventListener('click', (e) => {
      const card = e.target.closest('.prep-card[data-ability]');
      if (!card) return;
      togglePrepAbility(card.dataset.ability);
    });
    $('#btn-prep-go').addEventListener('click', () => {
      if (prepSelection().length !== 2) return;
      Sfx.play('click');
      confirmLoadout();
    });
    $('#btn-prep-back').addEventListener('click', () => {
      Sfx.play('click');
      state.prepGo = null;
      showScreen('place');
    });

    /* --- редактор корабля --- */
    $('#ship-editor').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'left' || act === 'right') rotateSelectedShip(act);
      else if (act === 'delete') deleteSelectedShip();
      else closeShipEditor();
    });
    window.addEventListener('resize', () => positionEditorPanel());
    window.addEventListener('orientationchange', () => setTimeout(positionEditorPanel, 120));
    document.addEventListener('pointerdown', (e) => {
      if (!state.placement || !state.placement.editor) return;
      if (e.target.closest('#ship-editor')) return;
      if (e.target.closest('#board-place')) return;
      closeShipEditor();
    });

    /* --- бой --- */
    boards.enemy.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      playerShoot(Number(cell.dataset.x), Number(cell.dataset.y));
    });

    boards.enemy.addEventListener('pointermove', (e) => {
      if (state.pendingAbility !== 'airstrike') return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      paintAim(boards.enemy, Number(cell.dataset.x), Number(cell.dataset.y));
    });
    boards.enemy.addEventListener('pointerleave', clearAim);

    boards.own.addEventListener('pointermove', (e) => {
      if (state.pendingAbility !== 'smoke') return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      paintAim(boards.own, Number(cell.dataset.x), Number(cell.dataset.y));
    });
    boards.own.addEventListener('pointerleave', clearAim);

    boards.own.addEventListener('click', (e) => {
      if (state.pendingAbility !== 'smoke') return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      useSmoke(Number(cell.dataset.x), Number(cell.dataset.y));
    });

    $('#ability-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('.ability-btn[data-ability]');
      if (!btn || btn.disabled) return;
      armAbility(btn.dataset.ability);
    });

    $('#btn-surrender').addEventListener('click', () => {
      if (state.gameOver) return;
      if (state.mode === 'online') {
        if (confirm('Сдаться? Соперник получит победу.')) {
          state.locked = true;
          Online.surrender();
        }
        return;
      }
      if (confirm('Сдаться и засчитать поражение?')) endGame(false, 'surrender');
    });

    /* --- результат --- */
    $('#btn-again').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#overlay'));
      if (state.mode === 'online') {
        leaveOnline();
        resetOnlineRoom();
        showScreen('online');
        return;
      }
      const next = () => {
        if (state.cupMatch && state.cup && state.cup.finished) {
          startCup();
          return;
        }
        state.cupMatch = !!(state.cup && !state.cup.finished);
        startMatch();
      };
      showInterstitialBetweenMatches(next);
    });

    /* Награда за просмотр рекламы (только Яндекс Игры). */
    const bonusBtn = $('#btn-bonus');
    if (bonusBtn) bonusBtn.addEventListener('click', () => {
      if (bonusBtn.disabled || !canShowAdBonus()) return;
      Sfx.play('click');
      bonusBtn.disabled = true;
      YG.showRewarded().then(function (ok) {
        bonusBtn.disabled = false;
        if (!ok) {
          toast('Реклама не загрузилась — попробуй позже', 'miss');
          return;
        }
        applyAdBonus();
      });
    });
    $('#btn-menu').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#overlay'));
      if (state.mode === 'online') leaveOnline();
      updateMenu();
      showScreen('menu');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        if (state.screen === 'place') {
          e.preventDefault();
          if (state.placement && state.placement.editor) {
            rotateSelectedShip(e.shiftKey ? 'left' : 'right');
          } else {
            toggleRotate(e.shiftKey);
            Sfx.play('click');
          }
        }
      }
      if (e.key === 'Escape') {
        if (state.placement && state.placement.editor) closeShipEditor();
        const settings = $('#modal-settings');
        if (!settings.hidden) closeOverlay(settings);
        const modal = $('#modal-rules');
        if (!modal.hidden) closeOverlay(modal);
        const ach = $('#modal-achievements');
        if (!ach.hidden) closeOverlay(ach);
      }
    });

    document.addEventListener('pointerdown', () => {
      Sfx.init();
      Sfx.resume();
    }, { once: true });

    ['pointerdown', 'keydown'].forEach((type) => {
      document.addEventListener(type, ensureMusicStarted, { once: true, passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!window.Music) return;
      if (document.hidden) Music.pause();
      else if (state.profile.music !== false) Music.resume();
    });
  }

  /* Поворот: обычный шаг — следующее направление по кругу (4 стороны),
     с Shift — сразу в противоположную сторону. */
  function setDirection(dir, cell) {
    const p = state.placement;
    if (!p || !DIR_ARROW[dir]) return;
    p.dir = dir;
    updateRotateLabel();
    if (cell) state.hover = { x: cell.x, y: cell.y };
    if (state.hover) showGhost(state.hover.x, state.hover.y, true);
    else clearGhost();
    renderDock();
  }

  function toggleRotate(flipSide) {
    const p = state.placement;
    if (!p) return;
    const dir = flipSide
      ? oppositeDir(p.dir)
      : DIR_ORDER[(DIR_ORDER.indexOf(p.dir) + 1) % DIR_ORDER.length];
    setDirection(dir, state.hover);
  }

  /* ---------------- Старт ---------------- */
  /* iPhone: Safari не показывает «Установить», поэтому подсказываем вручную.
     В установленном режиме и в других браузерах подсказка не нужна. */
  const IOS_HINT_KEY = 'seabattle.iosHint.v1';

  function isIosSafari() {
    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return false;
    if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua)) return false;
    const standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    return !standalone;
  }

  function refreshIosHint() {
    const el = $('#ios-install');
    if (!el) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(IOS_HINT_KEY) === 'off'; } catch (e) { /* приватный режим */ }
    el.hidden = dismissed || !isIosSafari();
  }

  function wireIosHint() {
    const close = $('#ios-install-close');
    if (close) close.addEventListener('click', function () {
      try { localStorage.setItem(IOS_HINT_KEY, 'off'); } catch (e) { /* не критично */ }
      const el = $('#ios-install');
      if (el) el.hidden = true;
    });
    refreshIosHint();
    // Safari может восстановить страницу из кэша — перепроверяем режим запуска
    window.addEventListener('pageshow', refreshIosHint);
  }

  /* ---------------- Яндекс Игры ---------------- */
  /* Пауза платформы (реклама, окно покупок, чужая вкладка): глушим звук
     и останавливаем бота, чтобы бой не шёл за спиной у игрока. */
  function wireYandex() {
    if (!YG) return;
    const setPaused = (on) => {
      state.paused = on;
      if (on) Sfx.suspend();
      else Sfx.resume();
      if (window.Music) {
        if (on) Music.pause();
        else if (state.profile.music !== false) Music.resume();
      }
    };
    YG.onPause(() => setPaused(true));
    YG.onResume(() => setPaused(false));
    if (YG.isPaused()) setPaused(true);
  }

  function makeBubbles() {
    const ocean = $('#ocean');
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('span');
      b.className = 'bubble';
      b.style.left = (Math.random() * 100) + '%';
      b.style.setProperty('--size', (6 + Math.random() * 26) + 'px');
      b.style.setProperty('--dur', (14 + Math.random() * 20) + 's');
      b.style.setProperty('--delay', (-Math.random() * 24) + 's');
      b.style.setProperty('--drift', (Math.random() * 70 - 35) + 'px');
      ocean.appendChild(b);
    }
  }

  state.profile = loadProfile();
  state.loadout = normalizeLoadout(state.profile.loadout);
  state.cup = state.profile.cup || null;
  applyNativeInsets();
  applyMotion();
  applyBubbles();
  applyTheme();
  applyMusicSettings();
  wireIosHint();
  makeBubbles();
  wireEvents();
  wireOnlineEvents();
  wireYandex();
  updateMenu();
  showScreen('menu');
  // Яндекс Игры: игра загрузилась и готова к взаимодействию
  if (YG) YG.ready();

  /* Приглашение по ссылке: ?room=1234 — сразу заходим в комнату. */
  const invite = inviteCode();
  if (invite && Online.available()) {
    setTimeout(() => joinInvite(invite), 400);
  }

  /* PWA: офлайн-режим и установка на домашний экран.
     На file:// service worker недоступен, в Capacitor он не нужен — пропускаем. */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js?v=' + SW_VERSION).catch(function () { /* не критично */ });
    });
  }

})();
