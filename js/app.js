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

  /* Платформа: GamePush (VK/OK), Яндекс Игры или обычная сборка.
     В обычной игре ни js/gamepush.js, ни js/yandex.js не подключены,
     поэтому YG остаётся null и все хуки платформы пропускаются. */
  const YG = window.GamePlatform || window.YandexGame || null;

  /* RuStore: покупки и реклама. В обычной сборке js/rustore.js может
     отсутствовать, поэтому RU остаётся null, а кнопки магазина скрыты. */
  const RU = window.RuStorePlatform || null;

  /* Версия кэша PWA. Должна совпадать с VERSION в sw.js: адрес `sw.js?v=…`
     не даёт CDN GitHub Pages отдать старый service worker (кэш 10 минут). */
  const SW_VERSION = 'sb-v45';

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
    matchStats: { shots: 0, hits: 0, misses: 0, firstShot: true, firstShotSunk: false },
    matchStartedAt: 0,     // начало текущего боя для истории
    matchLog: [],          // выстрелы текущего боя для реплея
    size: 10,              // размер текущей доски
    config: { size: 10, fleet: 'classic', tactics: false },
    loadout: ['airstrike', 'smoke'],
    abilities: null,       // заряды способностей в текущем бою
    botAbilities: null,    // заряды способностей бота
    pendingAbility: null,  // выбранная способность в режиме прицела
    prepGo: null,          // что запустить после экрана подготовки
    cup: null,             // «Испытание дня»: { round, wins }
    cupMatch: false,       // текущий бой идёт в зачёт испытания
    quickBattle: false,    // расстановка открыта кнопкой «Быстрый бой»
    campaign: null,        // активная миссия кампании: { id, mission, phase, ... }
    captain: null          // выбранный капитан кампании
  };

  let netShotTimer = null;
  // Повтор входа в комнату: на Deno Deploy новый сокет может попасть на другой
  // инстанс, где комнаты ещё нет. Пара переподключений заметно повышает шанс.
  let pendingJoin = null;

  function clearPendingJoin() {
    if (!pendingJoin) return;
    if (pendingJoin.timer) clearTimeout(pendingJoin.timer);
    if (pendingJoin.deadline) clearTimeout(pendingJoin.deadline);
    pendingJoin = null;
  }

  let creatingRoom = false;
  let createDeadline = null;

  function clearCreatePending() {
    if (createDeadline) clearTimeout(createDeadline);
    createDeadline = null;
    creatingRoom = false;
  }

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
      skin: 'classic',      // 'classic' | 'grid' | 'cyber' | 'navy'
      water: 'calm',        // 'calm' | 'storm' | 'night' | 'fog'
      reactionsMuted: false, // не показывать реакции соперника
      hintSeen: false,      // подсказка первого выстрела уже показана
      difficulty: 'normal', // 'easy' | 'normal' | 'hard'
      fleet: 'classic',     // 'classic' | 'admiral' — старый ключ, читается как фолбэк
      botConfig: { size: 10, fleet: 'classic', tactics: false },
      lobby: { size: 10, fleet: 'classic', tactics: false },
      loadout: ['airstrike', 'smoke'],
      daily: { date: '', streak: 0 },   // последний день с победой и серия
      achievements: {},     // id → когда получено
      stats: { shots: 0, hits: 0 },
      heat: {},             // размер:x:y → сколько раз игрок стрелял сюда
      season: { id: seasonId(), wins: 0, streak: 0, bestStreak: 0 },
      medals: [],           // сезонные медали: { tier, season, ts }
      onlineWins: 0,        // победы в онлайн-матчах — только на этом устройстве
      onlineGames: 0,       // сколько онлайн-матчей сыграно
      cup: null,            // активная цепочка «Испытания дня»
      cupReward: '',        // день, за который уже получена награда испытания
      adMatches: 0,         // боёв с последней межстраничной рекламы (Яндекс Игры)
      lastAdAt: 0,          // когда последний раз показывали рекламу
      adBonusDate: '',      // день, когда уже брали награду за rewarded-видео
      removeAds: false,     // куплено в RuStore: принудительная реклама выключена
      supportThanks: false, // куплена добровольная поддержка support_99
      campaign: {
        completed: [], stars: {}, lastId: 1, captain: '',
        daily: { date: '', streak: 0, tokens: 0, rewardDate: '', milestones: {} }
      } // прогресс кампании 1.7.0
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

  function normalizeCampaignDaily(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const milestones = {};
    if (src.milestones && typeof src.milestones === 'object' && !Array.isArray(src.milestones)) {
      [3, 7, 14].forEach((days) => {
        const value = src.milestones[days];
        if (value) milestones[days] = String(value).slice(0, 10);
      });
    }
    return {
      date: typeof src.date === 'string' ? src.date.slice(0, 10) : '',
      streak: toInt(src.streak, 0, 100000, 0),
      tokens: toInt(src.tokens, 0, 1000000, 0),
      rewardDate: typeof src.rewardDate === 'string' ? src.rewardDate.slice(0, 10) : '',
      milestones: milestones
    };
  }

  function normalizeCampaign(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const maxId = (Engine.CAMPAIGN && Engine.CAMPAIGN.length) || 12;
    const completed = [];
    const addDone = (value) => {
      const id = Math.round(Number(value));
      if (id >= 1 && id <= maxId && completed.indexOf(id) < 0) completed.push(id);
    };
    if (Array.isArray(src.completed)) {
      src.completed.forEach((item) => addDone(item && typeof item === 'object' ? item.id : item));
    } else if (src.completed && typeof src.completed === 'object') {
      Object.keys(src.completed).forEach((id) => {
        if (src.completed[id]) addDone(id);
      });
    }
    const stars = {};
    if (src.stars && typeof src.stars === 'object' && !Array.isArray(src.stars)) {
      Object.keys(src.stars).forEach((key) => {
        const id = Math.round(Number(key));
        const value = toInt(src.stars[key], 0, 5, 0);
        if (id >= 1 && id <= maxId && value > 0) {
          stars[id] = value;
          if (completed.indexOf(id) < 0) completed.push(id);
        }
      });
    }
    completed.sort((a, b) => a - b);
    return {
      completed: completed,
      stars: stars,
      lastId: toInt(src.lastId, 1, maxId, 1),
      captain: src.captain && Engine.captainById(src.captain) ? src.captain : '',
      daily: normalizeCampaignDaily(src.daily)
    };
  }

  function toInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function toUnit(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  function seasonId(ts) {
    const d = ts === undefined ? new Date() : new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function seasonName(id) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(id || ''));
    const months = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    if (!m) return 'Текущий сезон';
    const month = months[Number(m[2]) - 1] || '';
    return month.charAt(0).toUpperCase() + month.slice(1) + ' ' + m[1];
  }

  function normalizeHeat(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach((key) => {
      const m = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(key);
      if (!m) return;
      const size = Number(m[1]);
      if ([8, 10, 12].indexOf(size) < 0) return;
      const x = Number(m[2]);
      const y = Number(m[3]);
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const count = toInt(raw[key], 0, 9999, 0);
      if (count > 0) out[key] = count;
    });
    return out;
  }

  function normalizeSeason(raw) {
    const current = seasonId();
    const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const id = typeof s.id === 'string' && /^\d{4}-\d{2}$/.test(s.id) ? s.id : current;
    if (id !== current) {
      return { id: current, wins: 0, streak: 0, bestStreak: 0 };
    }
    return {
      id: id,
      wins: toInt(s.wins, 0, 100000, 0),
      streak: toInt(s.streak, 0, 100000, 0),
      bestStreak: toInt(s.bestStreak, 0, 100000, 0)
    };
  }

  function normalizeMedals(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = {};
    const out = [];
    raw.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const tier = ['bronze', 'silver', 'gold'].indexOf(m.tier) >= 0 ? m.tier : '';
      const season = typeof m.season === 'string' && /^\d{4}-\d{2}$/.test(m.season) ? m.season : '';
      if (!tier || !season) return;
      const key = season + ':' + tier;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ tier: tier, season: season, ts: toInt(m.ts, 0, Number.MAX_SAFE_INTEGER, 0) });
    });
    return out.slice(-48);
  }

  function normalizeReplay(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach((s) => {
      if (!s || typeof s !== 'object') return;
      const x = toInt(s.x, 0, 11, -1);
      const y = toInt(s.y, 0, 11, -1);
      const result = ['miss', 'hit', 'sunk'].indexOf(s.result) >= 0 ? s.result : 'miss';
      const side = s.side === 'own' ? 'own' : 'enemy';
      if (x < 0 || y < 0) return;
      out.push({ x: x, y: y, result: result, side: side });
    });
    return out.slice(-160);
  }

  function normalizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((h) => h && typeof h === 'object').map((h) => ({
      name: typeof h.name === 'string' ? h.name.slice(0, 32) : '—',
      rating: toInt(h.rating, 0, 5000, 1000),
      delta: toInt(h.delta, -5000, 5000, 0),
      win: !!h.win,
      rated: h.rated !== false,
      ts: toInt(h.ts, 0, Number.MAX_SAFE_INTEGER, 0),
      duration: toInt(h.duration, 0, 6 * 60 * 60 * 1000, 0),
      moves: toInt(h.moves, 0, 5000, Array.isArray(h.replay) ? h.replay.length : 0),
      size: [8, 10, 12].indexOf(Number(h.size)) >= 0 ? Number(h.size) : 10,
      mode: ['bot', 'cup', 'online'].indexOf(h.mode) >= 0 ? h.mode : 'bot',
      replay: normalizeReplay(h.replay)
    })).slice(0, 20);
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (!p || typeof p !== 'object' || Array.isArray(p)) return defaultProfile();
        const prof = Object.assign(defaultProfile(), p, {
          name: typeof p.name === 'string' && p.name.trim()
            ? p.name.trim().slice(0, 16) : Engine.randomName(),
          rating: toInt(p.rating, 0, 5000, 1000),
          games: toInt(p.games, 0, 10000000, 0),
          wins: toInt(p.wins, 0, 10000000, 0),
          losses: toInt(p.losses, 0, 10000000, 0),
          best: toInt(p.best, 0, 5000, 1000),
          streak: toInt(p.streak, -10000000, 10000000, 0),
          volume: toUnit(p.volume, 0.7),
          musicVolume: toUnit(p.musicVolume, 0.5),
          muted: !!p.muted,
          music: p.music !== false,
          bubbles: p.bubbles !== false,
          motion: p.motion === 'off' ? 'off' : 'on',
          difficulty: DIFFICULTY[p.difficulty] ? p.difficulty : 'normal',
          theme: ['dark', 'light', 'amoled'].indexOf(p.theme) >= 0 ? p.theme : 'dark',
          skin: ['classic', 'grid', 'cyber', 'navy'].indexOf(p.skin) >= 0 ? p.skin : 'classic',
          water: ['calm', 'storm', 'night', 'fog'].indexOf(p.water) >= 0 ? p.water : 'calm',
          reactionsMuted: !!p.reactionsMuted,
          hintSeen: !!p.hintSeen,
          musicTrack: ['pirate', 'ambient', 'tavern'].indexOf(p.musicTrack) >= 0 ? p.musicTrack : 'pirate',
          onlineWins: toInt(p.onlineWins, 0, 10000000, 0),
          onlineGames: toInt(p.onlineGames, 0, 10000000, 0),
          adMatches: toInt(p.adMatches, 0, 10000000, 0),
          lastAdAt: toInt(p.lastAdAt, 0, Number.MAX_SAFE_INTEGER, 0),
          cupReward: typeof p.cupReward === 'string' ? p.cupReward : '',
          adBonusDate: typeof p.adBonusDate === 'string' ? p.adBonusDate : '',
          removeAds: !!p.removeAds,
          supportThanks: !!p.supportThanks,
          campaign: normalizeCampaign(p.campaign),
          history: normalizeHistory(p.history)
        });
        prof.games = Math.min(10000000, Math.max(prof.games, prof.wins + prof.losses));
        prof.best = Math.max(prof.best, prof.rating);

        // вложенные объекты нормализуем отдельно: старые профили их не знают
        const daily = p.daily && typeof p.daily === 'object' ? p.daily : {};
        prof.daily = {
          date: typeof daily.date === 'string' ? daily.date : '',
          streak: toInt(daily.streak, 0, 100000, 0)
        };
        const stats = p.stats && typeof p.stats === 'object' ? p.stats : {};
        const shots = toInt(stats.shots, 0, 1000000000, 0);
        prof.stats = { shots: shots, hits: Math.min(shots, toInt(stats.hits, 0, 1000000000, 0)) };
        prof.achievements = (p.achievements && typeof p.achievements === 'object' &&
          !Array.isArray(p.achievements)) ? p.achievements : {};
        prof.heat = normalizeHeat(p.heat);
        prof.season = normalizeSeason(p.season);
        prof.medals = normalizeMedals(p.medals);

        const cup = p.cup && typeof p.cup === 'object' ? p.cup : null;
        if (cup && cup.date === dayKey() && cup.round >= 1 && cup.round <= 3 && !cup.finished) {
          // У старых цепочек конфига не было — восстанавливаем пресет дня.
          const cupConfig = cup.config
            ? normalizeConfig(cup.config, 'classic')
            : Object.assign({}, Engine.dailyChallenge(cup.date).config);
          prof.cup = {
            round: toInt(cup.round, 1, 3, 1),
            wins: toInt(cup.wins, 0, 2, 0),
            date: cup.date,
            id: typeof cup.id === 'string' ? cup.id : '',
            config: normalizeConfig(cupConfig, 'classic')
          };
        } else {
          prof.cup = null;
        }

        prof.fleet = prof.fleet === 'admiral' ? 'admiral' : 'classic';
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
    { id: 'cup', icon: '🏆', name: 'Испытание дня', desc: 'Пройди испытание дня без поражений' },
    { id: 'streak3', icon: '🌊', name: 'Волна', desc: 'Выиграй 3 боя подряд' },
    { id: 'streak10', icon: '🌋', name: 'Девятый вал', desc: 'Выиграй 10 боёв подряд' },
    { id: 'season_medal', icon: '🏅', name: 'Сезонный кубок', desc: 'Получи медаль за серию побед в сезоне' }
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

  function lobbyConfig() {
    return normalizeConfig(state.profile && state.profile.lobby, 'classic');
  }

  function renderLobbyConfig() {
    if (!$('#lobby-config')) return;
    const c = lobbyConfig();
    $$('#lobby-size [data-lobby-size]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.lobbySize) === c.size);
    });
    $$('#lobby-fleet [data-lobby-fleet]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.lobbyFleet === c.fleet);
    });
    const admiral = $('#lobby-fleet [data-lobby-fleet="admiral"]');
    if (admiral) admiral.disabled = c.size === 8;
    $$('#lobby-tactics [data-lobby-tactics]').forEach((b) => {
      b.classList.toggle('is-active', (b.dataset.lobbyTactics === 'on') === c.tactics);
    });
  }

  function setLobbyConfig(patch) {
    const next = normalizeConfig(Object.assign({}, lobbyConfig(), patch), 'classic');
    state.profile.lobby = next;
    saveProfile();
    renderLobbyConfig();
    Sfx.play('click');
  }

  function configLabel(config) {
    const c = config || state.config;
    const fleet = c.fleet === 'admiral' ? 'Адмиральский' : 'Классика';
    return 'Поле ' + c.size + '×' + c.size + ' · ' + fleet + ' · ' +
      (c.tactics ? 'Тактика' : 'Без тактики');
  }

  function isRatedBattle() {
    // кампания не влияет на рейтинг и статистику рейтинговых боёв
    if (state.campaign) return false;
    return Engine.isRatedBattle('bot', state.config);
  }

  function fleetKey() {
    const key = state.config && state.config.fleet;
    return Engine.fleetFor(state.size, key) ? key : 'classic';
  }

  function fleetSizes() {
    if (state.campaign && state.campaign.playerFleet) return state.campaign.playerFleet.slice();
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
    const p = state.profile || {};
    const theme = p.theme || 'dark';
    const light = theme === 'light';
    const amoled = theme === 'amoled';
    const root = document.documentElement;
    root.classList.toggle('theme-light', light);
    root.classList.toggle('theme-amoled', amoled);
    const skin = ['grid', 'cyber', 'navy'].indexOf(p.skin) >= 0 ? p.skin : 'classic';
    ['grid', 'cyber', 'navy'].forEach((key) => root.classList.toggle('skin-' + key, skin === key));
    const water = ['storm', 'night', 'fog'].indexOf(p.water) >= 0 ? p.water : 'calm';
    ['storm', 'night', 'fog'].forEach((key) => root.classList.toggle('water-' + key, water === key));
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

    const skin = ['grid', 'cyber', 'navy'].indexOf(p.skin) >= 0 ? p.skin : 'classic';
    $$('#set-skin button').forEach((b) => {
      b.classList.toggle('is-active', (b.dataset.skin || 'classic') === skin);
    });

    const water = ['storm', 'night', 'fog'].indexOf(p.water) >= 0 ? p.water : 'calm';
    $$('#set-water button').forEach((b) => {
      b.classList.toggle('is-active', (b.dataset.water || 'calm') === water);
    });

    const reactions = $('#set-reactions');
    if (reactions) {
      const on = !p.reactionsMuted;
      reactions.classList.toggle('is-on', on);
      reactions.setAttribute('aria-checked', on ? 'true' : 'false');
    }

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
    const summary = $('#setup-summary');
    if (summary) {
      summary.textContent = configLabel(configFor('bot')) + ' · ' + DIFFICULTY[d].name;
    }
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
    const quickSub = $('#quick-sub');
    if (quickSub) {
      quickSub.textContent = configLabel(configFor('bot')) + ' · ' + DIFFICULTY[difficultyOf()].name;
    }
    syncSettings();
    updateDailyCard();
    updateCampaignCard();
    updateSideCards();
    updateAdBonusCard();
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
    const fameSub = $('#fame-sub');
    if (fameSub) {
      const medals = (p.medals || []).length;
      const matches = (p.history || []).length;
      fameSub.textContent = medals + ' медалей · ' + matches + ' матчей в истории';
    }
    const day = Engine.dailyChallenge(dayKey());
    const size = day.config.size + '×' + day.config.size;
    const title = $('#cup-title');
    if (title) title.textContent = 'Испытание дня';
    const cup = $('#cup-status');
    if (cup) {
      if (state.cup && !state.cup.finished) {
        cup.textContent = 'Раунд ' + state.cup.round + ' из 3 · ' + day.name + ' · ' + size;
      } else if (p.cupReward === dayKey()) {
        cup.textContent = day.name + ' · ' + size + ' · сегодня пройдено';
      } else {
        cup.textContent = day.name + ' · ' + size + ' · 3 боя без поражений';
      }
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
      const rated = h.rated !== false;
      const deltaText = rated ? (delta >= 0 ? '+' : '') + delta : '—';
      return '<div class="history-row">' +
        '<span class="h-dot ' + (h.win ? 'win' : 'lose') + '"></span>' +
        '<span class="h-name">' + escapeHtml(h.name) + '</span>' +
        '<span class="h-res">' + (h.win ? 'победа' : 'поражение') + '</span>' +
        '<span class="h-delta ' + (rated ? (delta >= 0 ? 'plus' : 'minus') : 'na') + '">' + deltaText + '</span>' +
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

  /* ---------------- Зал славы: карта, реплеи, сезоны ---------------- */
  function recordHeat(x, y) {
    const p = state.profile;
    if (!p || !Number.isInteger(x) || !Number.isInteger(y)) return;
    const size = state.size || 10;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    p.heat = p.heat || {};
    const key = size + ':' + x + ':' + y;
    p.heat[key] = Math.min(9999, (p.heat[key] || 0) + 1);
  }

  function recordReplay(side, x, y, result) {
    if (!state.matchLog) state.matchLog = [];
    if (state.matchLog.length >= 160) return;
    state.matchLog.push({
      x: x,
      y: y,
      result: result === 'sunk' ? 'sunk' : result === 'hit' ? 'hit' : 'miss',
      side: side === 'own' ? 'own' : 'enemy'
    });
  }

  function makeHistory(base, mode) {
    const duration = state.matchStartedAt
      ? Math.max(0, Math.min(6 * 60 * 60 * 1000, Date.now() - state.matchStartedAt))
      : 0;
    return Object.assign({
      duration: duration,
      moves: (state.matchLog || []).length,
      size: state.size,
      mode: mode || 'bot',
      replay: (state.matchLog || []).slice(-160)
    }, base);
  }

  function medalName(tier) {
    return tier === 'gold' ? 'Золото' : tier === 'silver' ? 'Серебро' : 'Бронза';
  }

  function medalIcon(tier) {
    return tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : '🥉';
  }

  function hasSeasonMedal(season, tier) {
    return (state.profile.medals || []).some((m) => m.season === season && m.tier === tier);
  }

  function awardSeasonMedals() {
    const p = state.profile;
    if (!p.season) return [];
    const gained = [];
    const tiers = [
      { tier: 'bronze', need: 3 },
      { tier: 'silver', need: 5 },
      { tier: 'gold', need: 10 }
    ];
    for (const t of tiers) {
      if (p.season.bestStreak < t.need || hasSeasonMedal(p.season.id, t.tier)) continue;
      p.medals = p.medals || [];
      p.medals.push({ tier: t.tier, season: p.season.id, ts: Date.now() });
      gained.push(t.tier);
    }
    if (gained.length) unlockAchievement('season_medal', 1200);
    return gained;
  }

  function updateSeason(win) {
    const p = state.profile;
    const id = seasonId();
    if (!p.season || p.season.id !== id) {
      p.season = { id: id, wins: 0, streak: 0, bestStreak: 0 };
    }
    const s = p.season;
    if (win) {
      s.wins = (s.wins || 0) + 1;
      s.streak = (s.streak || 0) + 1;
      s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
    } else {
      s.streak = 0;
    }
    return awardSeasonMedals();
  }

  function showScreen(name) {
    Object.keys({ menu: 1, campaign: 1, online: 1, setup: 1, place: 1, prepare: 1, battle: 1 }).forEach((key) => {
      const screen = $('#screen-' + key);
      if (screen) screen.classList.toggle('is-active', key === name);
    });
    state.screen = name;
    if (name === 'campaign') renderCampaign();
    if (name === 'setup') syncSettings();
    if (name === 'online') {
      // ссылка-приглашение имеет смысл только в браузере (не file://)
      const share = $('#btn-share-room');
      if (share) share.hidden = location.protocol === 'file:';
      renderOnlineMine();
      renderLobbyConfig();
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
  function startMatch(fromCampaign) {
    state.matchSeq += 1;
    state.mode = 'bot';
    if (!fromCampaign) state.campaign = null;
    const campaign = fromCampaign ? state.campaign : null;
    // Конфиг испытания дня живёт в state.cup: настройки игрока не перетираем.
    if (campaign) {
      state.config = normalizeConfig({
        size: campaign.mission.size,
        fleet: campaign.mission.fleet,
        tactics: true
      }, 'classic');
    } else {
      state.config = (state.cupMatch && state.cup && state.cup.config)
        ? normalizeConfig(state.cup.config, 'classic')
        : configFor('bot');
    }
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
    const level = campaign ? campaign.botLevel : difficultyOf();
    const boost = DIFFICULTY[level].boost +
      (campaign ? 0 : (FLEET_BOOST[fleetKey()] || 0)) +
      (!campaign && state.cupMatch && state.cup ? Math.max(0, state.cup.round - 1) * 90 : 0);
    state.botLevel = level;
    state.botName = campaign && campaign.mission.boss
      ? campaign.mission.boss.name
      : Engine.randomName();
    state.botRating = clamp(Math.round(state.profile.rating + randInt(-130, 130) + boost), 250, 2600);
    state.botAvatar = campaign && campaign.mission.boss
      ? '👑'
      : ['🤖', '👾', '🦈', '🐙', '🦑', '🐡', '🦀'][randInt(0, 6)];
    state.bot = new Engine.Bot(level);
    state.enemyBoard = null;
    state.playerBoard = Engine.createBoard(state.size);
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = false;
    state.matchStats = { shots: 0, hits: 0, misses: 0, firstShot: true, firstShotSunk: false };
    state.matchStartedAt = Date.now();
    state.matchLog = [];
    setupPlacement();
    showScreen('place');
    Sfx.play('start');
  }

  function startCampaignMission(id, daily) {
    const mission = Engine.campaignById(id);
    if (!mission) return false;
    if (!daily && !Engine.campaignUnlocked(state.profile.campaign, mission.id)) {
      toast('Миссия ' + mission.id + ': закрыта', 'turn');
      return false;
    }
    state.campaign = {
      id: mission.id,
      mission: mission,
      phase: 1,
      daily: !!daily,
      playerFleet: Engine.campaignPlayerFleet(mission),
      botFleet: Engine.campaignBotFleet(mission),
      loadout: Engine.campaignLoadout(mission, state.loadout),
      botLoadout: Engine.campaignBotLoadout(mission, 1),
      botLevel: mission.bot,
      fog: null,
      captain: state.captain || '',
      captainFirstHit: false,
      captainBonusShot: false,
      reveal: null
    };
    if (!daily) state.profile.campaign.lastId = mission.id;
    saveProfile();
    startMatch(true);
    return true;
  }

  /* ---------------- Испытание дня (бывший «Кубок моря») ---------------- */
  function startCup() {
    const day = Engine.dailyChallenge(dayKey());
    state.mode = 'bot';
    state.cupMatch = true;
    state.cup = {
      round: 1,
      wins: 0,
      date: dayKey(),
      id: day.id,
      config: Object.assign({}, day.config)
    };
    state.profile.cup = state.cup;
    saveProfile();
    startMatch();
    setTimeout(() => toast('🎯 Испытание дня: ' + day.name + ' · ' +
      day.config.size + '×' + day.config.size, 'turn'), 320);
  }

  // Продолжение цепочки: конфиг дня хранится в самой цепочке, а не в
  // настройках бота — иначе обычные бои молча переезжали на чужое поле.
  function continueCup() {
    if (!state.cup) {
      startCup();
      return;
    }
    if (!state.cup.config) {
      const day = Engine.dailyChallenge(dayKey());
      state.cup.config = Object.assign({}, day.config);
    }
    state.mode = 'bot';
    state.cupMatch = true;
    state.profile.cup = state.cup;
    saveProfile();
    startMatch();
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
    state.playerBoard = Engine.randomBoard(fleetSizes(), state.size);
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
    state.playerBoard = Engine.createBoard(state.size);
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
    const tactics = !!(state.config && state.config.tactics);
    bar.hidden = !tactics;
    bar.innerHTML = '';
    if (!tactics || !state.abilities) return;
    // В онлайне лоадаут мог отличаться от локального профиля: сервер присылает
    // итоговый набор в begin, и рисовать надо именно его.
    const ids = (state.mode === 'online' && state.net && Array.isArray(state.net.loadout) &&
      state.net.loadout.length) ? state.net.loadout : state.loadout;
    for (const id of ids) {
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
    if (state.mode === 'online' && (state.locked || !state.playerTurn || state.gameOver)) return;
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

  function paintNetSmoke() {
    if (!state.net || !state.size) return;
    $$('#board-own .cell.smoke, #board-enemy .cell.smoke').forEach((c) => c.classList.remove('smoke'));
    const you = state.net.you;
    for (const z of (state.net.zones || [])) {
      if (z.turnsLeft <= 0) continue;
      const target = z.owner === you ? boards.own : boards.enemy;
      for (const c of z.cells) {
        const cell = target.children[c.y * state.size + c.x];
        if (cell) cell.classList.add('smoke');
      }
    }
  }

  /* Клетка под дымом соперника: проверяем локально, чтобы не гонять
     заведомо отклонённый выстрел на сервер и не пугать игрока ответом. */
  function netSmokeBlocks(x, y) {
    if (!state.net) return false;
    const you = state.net.you;
    for (const z of (state.net.zones || [])) {
      if (!z || z.turnsLeft <= 0 || z.owner === you) continue;
      for (const c of (z.cells || [])) {
        if (Number(c.x) === x && Number(c.y) === y) return true;
      }
    }
    return false;
  }

  function sendNetAbility(kind, x, y) {
    if (state.mode !== 'online' || !state.net) return;
    state.pendingAbility = null;
    state.locked = true;
    clearAim();
    renderAbilityBar();
    Online.ability(kind, x, y);
    armNetShotTimeout();
  }

  function onNetAbility(msg) {
    if (state.mode !== 'online' || state.gameOver) return;
    if (msg.kind === 'aa') {
      // ПВО сработало у защитника: списываем заряд именно у него, иначе
      // кнопка останется доступной до конца боя.
      if (state.net && state.abilities && msg.owner === state.net.you) {
        state.abilities.aa = 0;
        renderAbilityBar();
      }
      Sfx.play('click');
      toast('🛡️ ПВО сбило авиаудар', 'turn');
      return;
    }
    if (msg.kind === 'smoke') {
      if (!state.net) return;
      state.net.zones = state.net.zones || [];
      state.net.zones.push({
        owner: Number(msg.owner),
        cells: Array.isArray(msg.cells) ? msg.cells : [],
        turnsLeft: Number(msg.turnsLeft) || 3
      });
      if (state.abilities && msg.owner === state.net.you) {
        state.abilities.smoke = Math.max(0, (state.abilities.smoke || 0) - 1);
      }
      paintNetSmoke();
      renderAbilityBar();
      toast(msg.owner === state.net.you ? '💨 Дым поставлен' : '💨 Соперник поставил дым', 'turn');
      return;
    }
    if (msg.kind === 'airstrike') {
      const target = msg.foe ? boards.enemy : boards.own;
      const board = msg.foe ? state.enemyBoard : state.playerBoard;
      const cells = Array.isArray(msg.cells) ? msg.cells : [];
      for (const hit of cells) {
        const x = Number(hit.x);
        const y = Number(hit.y);
        if (!board || x < 0 || y < 0 || x >= state.size || y >= state.size) continue;
        if (msg.foe) recordHeat(x, y);
        recordReplay(msg.foe ? 'enemy' : 'own', x, y, hit.result);
        if (msg.foe) {
          board.shots[y][x] = hit.result === 'miss' ? 'miss' : 'hit';
        } else {
          // Свой флот считаем движком: иначе счётчик потопленных разъедется.
          Engine.fire(state.playerBoard, x, y);
        }
        if (hit.result === 'sunk' && Array.isArray(hit.ship)) {
          hit.ship.forEach((c) => {
            const cx = Number(c[0]);
            const cy = Number(c[1]);
            if (cx >= 0 && cy >= 0 && cx < state.size && cy < state.size) {
              board.shots[cy][cx] = 'hit';
            }
          });
        }
        applyShotVisual(target, x, y, hit.result, hit.ship);
        if (hit.result === 'sunk' && msg.foe && state.net) state.net.foeShips -= 1;
      }
      if (state.abilities && msg.foe) {
        state.abilities.airstrike = Math.max(0, (state.abilities.airstrike || 0) - 1);
      }
      renderAbilityBar();
      updateFleet();
      shake(true);
      if (msg.blocked) {
        toast(msg.foe ? '🛡️ ПВО сбило удар: только центр' : '🛡️ Твоё ПВО сбило удар: только центр', 'miss');
      }
      else if (msg.foe) toast('✈️ Авиаудар: ' + cells.length + ' клеток', 'hit');
      else toast('✈️ Авиаудар соперника: ' + cells.length + ' клеток', 'miss');
      Sfx.play(msg.foe ? 'boom' : 'lose');
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
    if (state.campaign && Engine.campaignHasBossMod(
      state.campaign.mission, 'boss-aa', state.campaign.phase) &&
      state.botAbilities && state.botAbilities.aa > 0) {
      state.abilities.airstrike -= 1;
      state.botAbilities.aa -= 1;
      renderAbilityBar();
      toast('🛡️ ПВО босса сбило авиаудар', 'miss');
      state.playerTurn = false;
      setTurn(false);
      await sleep(520);
      if (seq !== state.matchSeq || state.gameOver) return;
      endPlayerTurn();
      botTurn(seq);
      return;
    }
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
      if (state.campaign) clearCampaignFog(hit.x, hit.y);
      recordHeat(hit.x, hit.y);
      recordReplay('enemy', hit.x, hit.y, hit.result);
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

    updateCampaignPhase();

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
    const captain = state.campaign && state.mode === 'bot'
      ? Engine.captainById(state.campaign.captain || state.captain) : null;
    const smokeTurns = Engine.captainSmokeTurns(captain, state.campaign && state.campaign.mission, 3);
    const res = Engine.placeSmoke(state.playerBoard, x, y, smokeTurns);
    if (!res.ok) {
      toast('Здесь нельзя поставить дым', 'miss');
      return;
    }
    state.abilities.smoke -= 1;
    state.pendingAbility = null;
    renderAbilityBar();
    paintSmoke(boards.own, state.playerBoard);
    toast('💨 Дым на ' + res.turnsLeft + ' хода соперника', 'turn');
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
  function updateBattleHint() {
    const hint = $('#battle-hint');
    if (!hint) return;
    hint.hidden = !!(state.profile.hintSeen || (state.profile.games || 0) >= 3);
  }

  function markHintSeen() {
    const hint = $('#battle-hint');
    if (hint) hint.hidden = true;
    if (state.profile.hintSeen) return;
    state.profile.hintSeen = true;
    saveProfile();
  }

  function beginBattle() {
    closeShipEditor(false);
    setPlacementLocked(false);
    const campaign = state.campaign;
    state.enemyBoard = Engine.randomBoard(
      campaign ? campaign.botFleet : fleetSizes(),
      state.size
    );
    state.bot = new Engine.Bot(campaign ? campaign.botLevel : difficultyOf());
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = true;
    state.pendingAbility = null;
    state.abilities = state.config.tactics
      ? Engine.newAbilityState(campaign ? campaign.loadout : state.loadout)
      : null;
    state.botAbilities = state.config.tactics
      ? Engine.newAbilityState(campaign ? campaign.botLoadout : botLoadout())
      : null;
    if (campaign) {
      const fog = Engine.campaignHasMod(campaign.mission, 'fog')
        ? Engine.campaignFogCells(state.enemyBoard, 5)
        : [];
      campaign.fog = fog.length ? new Set(fog.map((p) => p.x + ',' + p.y)) : null;
      campaign.reveal = null;
      const captain = activeCaptain();
      if (Engine.captainPassive(captain, 'reveal-one')) {
        const cell = Engine.captainRevealCell(captain, state.enemyBoard);
        if (cell) {
          campaign.reveal = cell;
          if (campaign.fog) campaign.fog.delete(cell.x + ',' + cell.y);
        }
      }
    }
    state.matchStartedAt = Date.now();
    state.matchLog = [];

    buildBoard(boards.enemy);
    buildBoard(boards.own);
    paintBoard(boards.enemy, state.enemyBoard, false);
    paintBoard(boards.own, state.playerBoard, true);
    paintCampaignFog();
    paintCaptainReveal();
    paintSmoke(boards.enemy, state.enemyBoard);
    paintSmoke(boards.own, state.playerBoard);
    clearAim();
    renderAbilityBar();
    updateCampaignPhaseBar();

    const pRank = Engine.rankFor(state.profile.rating);
    $('#b-you-name').textContent = state.profile.name;
    $('#b-you-rate').textContent = Math.round(state.profile.rating) + ' · ' + pRank.name;
    $('#b-foe-name').textContent = state.botName;
    $('#b-foe-rate').textContent = state.botRating + ' · ' + Engine.rankFor(state.botRating).name;
    $('#b-you-avatar').textContent = pRank.icon;
    $('#b-foe-avatar').textContent = state.botAvatar;

    updateFleet();
    updateReactionBar();
    showScreen('battle');
    updateBattleHint();
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
    state.net.foeGone = false;
    state.botName = (foe && foe.name) || 'Соперник';
    state.botRating = (foe && foe.rating) || 1000;
    state.botAvatar = '🌐';
    state.bot = null;
    state.enemyBoard = null;
    state.playerBoard = Engine.createBoard(state.size);
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = false;
    state.matchStartedAt = Date.now();
    state.matchLog = [];
    setupPlacement();
    showScreen('place');
    Sfx.play('start');
    toast('🌐 Игра с ' + state.botName, 'turn');
  }

  function sendFleetOnline() {
    if (!state.net || state.net.fleetSent) return;
    if (state.config && state.config.tactics && !state.net.loadoutSent) {
      // Сначала выбираем две способности, потом отправляем флот и лоудаут.
      showPrepare((ids) => {
        state.loadout = ids.slice();
        state.net.loadoutSent = true;
        showScreen('place');
        sendFleetNow();
      });
      return;
    }
    sendFleetNow();
  }

  function sendFleetNow() {
    if (!state.net || state.net.fleetSent) return;
    const ships = state.playerBoard.ships.filter(Boolean).map((s) => ({
      size: s.size,
      cells: s.cells.map((c) => [c.x, c.y])
    }));
    Online.fleet(ships, state.loadout);
    if (state.config && state.config.tactics) Online.loadout(state.loadout);
    state.net.fleetSent = true;
    setPlacementLocked(true);
    $('#btn-ready').disabled = true;
    $('#place-hint').textContent = 'Ждём соперника…';
    $('#place-opp').textContent = 'Противник: ' + state.botName + ' · расставляется';
    toast('⏳ Ждём соперника', 'turn');
  }

  /* Реванш не заставляет расставлять флот заново: сервер пересобирает доски
     из принятой расстановки, а клиент сбрасывает только следы выстрелов. */
  function resetOwnBoardForRematch() {
    const old = state.playerBoard;
    if (!old || !Array.isArray(old.ships)) {
      state.playerBoard = Engine.createBoard(state.size);
      return;
    }
    const fresh = Engine.createBoard(state.size);
    old.ships.filter(Boolean).forEach((ship) => {
      const id = fresh.ships.length;
      const copy = {
        id: id,
        size: ship.size,
        horizontal: !!ship.horizontal,
        cells: ship.cells.map((c) => ({ x: c.x, y: c.y })),
        hits: 0,
        sunk: false
      };
      copy.cells.forEach((c) => { fresh.grid[c.y][c.x] = id; });
      fresh.ships.push(copy);
    });
    state.playerBoard = fresh;
  }

  function beginOnlineBattle(first, rematch) {
    closeShipEditor(false);
    setPlacementLocked(false);
    if (rematch) {
      closeOverlay($('#overlay'));
      resetOwnBoardForRematch();
    }
    state.enemyBoard = Engine.createBoard(state.size);
    state.net.foeShips = fleetSizes().length;
    state.net.foeTotal = fleetSizes().length;
    state.net.rematchPending = false;
    state.net.foeGone = false;
    state.gameOver = false;
    state.locked = !first;
    state.playerTurn = !!first;
    state.matchStats = { shots: 0, hits: 0, misses: 0, firstShot: true, firstShotSunk: false };
    state.matchStartedAt = Date.now();
    state.matchLog = [];

    state.abilities = state.config.tactics
      ? Engine.newAbilityState((state.net && state.net.loadout) || state.loadout)
      : null;
    state.pendingAbility = null;
    state.net.zones = [];
    state.net.turnIdx = state.playerTurn ? state.net.you : 1 - state.net.you;
    clearAim();

    buildBoard(boards.enemy);
    buildBoard(boards.own);
    paintBoard(boards.enemy, state.enemyBoard, false);
    paintBoard(boards.own, state.playerBoard, true);
    paintNetSmoke();
    renderAbilityBar();

    const pRank = Engine.rankFor(state.profile.rating);
    const fRank = Engine.rankFor(state.botRating);
    $('#b-you-name').textContent = state.profile.name;
    $('#b-you-rate').textContent = Math.round(state.profile.rating) + ' · ' + pRank.name;
    $('#b-foe-name').textContent = state.botName;
    $('#b-foe-rate').textContent = Math.round(state.botRating) + ' · ' + fRank.name;
    $('#b-you-avatar').textContent = pRank.icon;
    $('#b-foe-avatar').textContent = '🌐';

    updateFleet();
    updateReactionBar();
    showScreen('battle');
    updateBattleHint();
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
  /* Снаряд летит от своего поля к цели. Координаты считаем по экрану:
     доски могут стоять рядом на десктопе и друг под другом на телефоне. */
  function launchShell(targetEl, cell, fromEl) {
    if (!motionOn() || !targetEl || !cell || !document.body) return;
    const target = cell.getBoundingClientRect();
    const srcEl = (fromEl && fromEl.getBoundingClientRect) ? fromEl : targetEl;
    const src = srcEl.getBoundingClientRect();
    const startX = src.left + src.width / 2;
    const startY = src.top + src.height * (srcEl === targetEl ? 0.12 : 0.5);
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    const shell = document.createElement('span');
    shell.className = 'shell';
    shell.setAttribute('aria-hidden', 'true');
    shell.style.left = startX + 'px';
    shell.style.top = startY + 'px';
    document.body.appendChild(shell);
    requestAnimationFrame(() => {
      shell.style.transform = 'translate(' + (endX - startX) + 'px,' + (endY - startY) + 'px) scale(.55)';
      shell.classList.add('is-flying');
    });
    setTimeout(() => shell.remove(), 460);
  }

  function markShot(targetEl, cell, result) {
    if (!targetEl || !cell) return;
    const miss = result === 'miss';
    cell.classList.add(miss ? 'is-last-miss' : 'is-last-hit');
    targetEl.classList.add('is-spotlight');
    const cx = cell.offsetLeft + cell.offsetWidth / 2;
    const cy = cell.offsetTop + cell.offsetHeight / 2;
    const ring = document.createElement('span');
    ring.className = 'impact-ring ' + (miss ? 'is-miss' : 'is-hit');
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    targetEl.appendChild(ring);
    const flag = document.createElement('span');
    flag.className = 'shot-flag ' + (miss ? 'is-miss' : 'is-hit');
    flag.textContent = miss ? '🌊' : '💥';
    flag.style.left = cx + 'px';
    flag.style.top = cy + 'px';
    targetEl.appendChild(flag);
    setTimeout(() => targetEl.classList.remove('is-spotlight'), 700);
    setTimeout(() => {
      cell.classList.remove('is-last-miss', 'is-last-hit');
      flag.remove();
      ring.remove();
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
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;
    clearNetShotTimeout();

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
      recordHeat(x, y);
      recordReplay('enemy', x, y, msg.result);
      launchShell(boards.enemy, boards.enemy.children[y * state.size + x], boards.own);
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
    recordReplay('own', x, y, msg.result);
    launchShell(boards.own, boards.own.children[y * state.size + x], boards.enemy);
    applyShotVisual(boards.own, x, y, msg.result, msg.ship);
    updateFleet();
    if (msg.result === 'miss') toast('🌊 Соперник промахнулся', 'miss');
    else toast('💢 Соперник попал', 'miss');
  }

  function onNetTurn(msg) {
    if (state.mode !== 'online') return;
    clearNetShotTimeout();
    if (state.net) {
      // Дым тикает на доске того, чей ход закончился (owner === 1 - прошлый ход).
      const prev = state.net.turnIdx;
      if (typeof prev === 'number') {
        const tickOwner = 1 - prev;
        state.net.zones = (state.net.zones || [])
          .map((z) => (z.owner === tickOwner ? Object.assign({}, z, { turnsLeft: z.turnsLeft - 1 }) : z))
          .filter((z) => z.turnsLeft > 0);
      }
      state.net.turnIdx = msg.you ? state.net.you : 1 - state.net.you;
      paintNetSmoke();
    }
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
    clearPendingJoin();
    clearCreatePending();
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

  function joinRoom(code, left) {
    const roomCode = String(code || '').replace(/\D/g, '').slice(0, 4);
    if (roomCode.length !== 4) {
      setOnlineStatus('Введи 4 цифры кода', true);
      return;
    }
    // Повторный тап не должен плодить параллельные join на одном сокете.
    if (pendingJoin && pendingJoin.code === roomCode) return;
    clearPendingJoin();
    const req = {
      code: roomCode,
      left: typeof left === 'number' ? left : 2,
      timer: null,
      deadline: null
    };
    pendingJoin = req;
    // Если сервер молчит (не тот инстанс, зависший сокет) — не держим игрока
    // в вечном «Заходим…»: через 12 секунд показываем ошибку.
    req.deadline = setTimeout(() => {
      if (pendingJoin !== req) return;
      clearPendingJoin();
      setOnlineStatus('Сервер не ответил. Попробуй войти ещё раз', true);
      toast('⚠️ Не удалось войти в комнату', 'miss');
    }, 12000);
    setOnlineStatus('Подключаемся…');
    Online.connect()
      .then(() => {
        if (!pendingJoin || pendingJoin.code !== roomCode) return;
        setOnlineStatus('Заходим в комнату ' + roomCode + '…');
        Online.join(roomCode, state.profile.name, Math.round(state.profile.rating));
      })
      .catch((err) => {
        clearPendingJoin();
        setOnlineStatus((err && err.message) || 'Сервер недоступен', true);
      });
  }

  function retryJoin() {
    const p = pendingJoin;
    if (!p || p.left <= 0) return false;
    p.left -= 1;
    setOnlineStatus('Комната не найдена — пробуем ещё раз…');
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (pendingJoin !== p) return;
      // Переподключаемся новым сокетом: повтор на том же инстансе бесполезен.
      try { Online.leave(); } catch (e) { /* ignore */ }
      Online.connect()
        .then(() => {
          if (pendingJoin !== p) return;
          setOnlineStatus('Заходим в комнату ' + p.code + '…');
          Online.join(p.code, state.profile.name, Math.round(state.profile.rating));
        })
        .catch(() => { /* следующая попытка или финальная ошибка */ });
    }, 900);
    return true;
  }

  function joinInvite(code) {
    $('#room-code').value = code;
    showScreen('online');
    setOnlineStatus('Тебя пригласили в комнату ' + code + ' — подключаемся…');
    joinRoom(code, 3);
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
      clearPendingJoin();
      clearCreatePending();
      state.net = state.net || {};
      state.net.code = msg.code;
      state.net.you = msg.you;
      state.net.loadoutSent = false;
      if (msg.config) {
        state.net.config = normalizeConfig(msg.config);
      } else {
        // Старый сервер не знает про кастомные комнаты — играем классику.
        state.net.config = normalizeConfig(null);
        toast('⚠️ Сервер не обновлён — кастомные комнаты недоступны', 'miss');
      }
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
      clearPendingJoin();
      state.net = state.net || {};
      state.net.you = msg.you;
      startOnlineMatch(msg.foe, msg.config);
    });

    Online.on('begin', (msg) => {
      const rematch = !!msg.rematch && state.mode === 'online' && state.screen === 'battle';
      if (state.screen !== 'place' && state.screen !== 'prepare' && !rematch) return;
      if (state.net) {
        state.net.you = typeof msg.you === 'number' ? msg.you : state.net.you;
        if (msg.config) state.net.config = normalizeConfig(msg.config);
        if (Array.isArray(msg.loadout)) state.net.loadout = msg.loadout.slice();
        if (Array.isArray(msg.foeLoadout)) state.net.foeLoadout = msg.foeLoadout.slice();
      }
      beginOnlineBattle(!!msg.first, rematch);
    });

    Online.on('shot', onNetShot);
    Online.on('turn', onNetTurn);
    Online.on('ability', onNetAbility);
    Online.on('pass', () => {
      if (state.mode !== 'online') return;
      toast('💨 Ход пропущен: всё под дымом', 'turn');
    });

    Online.on('emoji', (msg) => {
      if (state.mode !== 'online' || !state.net) return;
      const mine = Number(msg.from) === state.net.you;
      showReaction(mine ? 'you' : 'foe', msg.emoji);
    });

    Online.on('rematchAsked', () => {
      if (state.mode !== 'online') return;
      toast('🔁 Соперник предлагает реванш', 'turn');
    });

    Online.on('rematchWait', () => {
      if (state.mode !== 'online') return;
      const btn = $('#btn-again');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Ждём соперника…';
      }
    });

    Online.on('end', (msg) => {
      clearNetShotTimeout();
      if (state.mode !== 'online' || state.gameOver) return;
      endGame(!!msg.win, msg.reason || 'online');
    });

    Online.on('foeLeft', () => {
      toast('👋 Соперник вышел', 'miss');
      if (state.mode !== 'online') return;
      if (state.net) {
        state.net.foeGone = true;
        state.net.rematchPending = false;
      }
      if (!state.gameOver) {
        state.gameOver = true;
        state.locked = true;
        setTimeout(() => {
          leaveOnline(true);
          updateMenu();
          showScreen('menu');
        }, 1200);
        return;
      }
      // Бой уже закончен: реванш невозможен, но результат должен остаться
      // на экране. Просто гасим кнопку, чтобы не ждать ответа вечно.
      const btn = $('#btn-again');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Соперник вышел';
      }
    });

    Online.on('error', (msg) => {
      const text = (msg && msg.msg) || 'Ошибка соединения';
      clearNetShotTimeout();
      // «Комната не найдена» часто значит, что вход попал на другой инстанс
      // сервера. Переподключаемся и пробуем снова, прежде чем пугать игрока.
      if (pendingJoin && text.indexOf('не найдена') >= 0) {
        if (retryJoin()) return;
        clearPendingJoin();
        setOnlineStatus('Комната не найдена. Проверь код — или пусть друг создаст новую.', true);
        toast('⚠️ Комната не найдена', 'miss');
        return;
      }
      // Любая ошибка во время входа снимает ожидание: иначе повторный тап
      // будет молча проигнорирован до истечения 12-секундного таймаута.
      if (pendingJoin) clearPendingJoin();
      clearCreatePending();
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

  async function doShot(targetEl, board, x, y, slow, fromEl) {
    const cell = targetEl.children[y * state.size + x];
    if (!cell) return null;
    launchShell(targetEl, cell, fromEl);
    cell.classList.add('incoming');
    await sleep(slow ? 400 : 260);
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
    markHintSeen();
    if (state.pendingAbility === 'airstrike') {
      if (state.mode === 'online') { sendNetAbility('airstrike', x, y); return; }
      await useAirstrike(x, y);
      return;
    }
    if (Engine.smokeBlocks(state.enemyBoard, x, y) || netSmokeBlocks(x, y)) {
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
    const shot = await doShot(boards.enemy, state.enemyBoard, x, y, false, boards.own);
    if (seq !== state.matchSeq || state.gameOver) return;
    if (!shot) {
      state.locked = false;
      return;
    }
    if (state.campaign) clearCampaignFog(x, y);
    recordHeat(x, y);
    recordReplay('enemy', x, y, shot.result);
    if (state.matchStats) {
      state.matchStats.shots += 1;
      if (shot.result !== 'miss') state.matchStats.hits += 1;
      else state.matchStats.misses += 1;
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

    updateCampaignPhase();

    // Боцман: первое попадание по кораблю даёт бонусный выстрел.
    const captain = activeCaptain();
    if (captain && shot.result !== 'miss' && state.campaign &&
        Engine.captainFirstHitExtra(captain, true, state.campaign.captainFirstHit)) {
      state.campaign.captainFirstHit = true;
      state.campaign.captainBonusShot = true;
      toast('🎖️ Боцман: +1 выстрел за первое попадание', 'hit');
    }

    // Штормовой отлив: каждый пятый промах не отдаёт ход боту.
    if (shot.result === 'miss' && state.campaign &&
        Engine.campaignStormRefund(state.campaign.mission, state.matchStats.misses)) {
      toast('🌊 Шторм уносит волну — ход сохранён', 'turn');
      state.locked = false;
      state.playerTurn = true;
      setTurn(true);
      return;
    }

    // Боцман: бонусный выстрел сгорает на промахе, но ход остаётся.
    if (shot.result === 'miss' && state.campaign && state.campaign.captainBonusShot) {
      state.campaign.captainBonusShot = false;
      toast('🎖️ Боцман: дополнительный выстрел', 'turn');
      state.locked = false;
      state.playerTurn = true;
      setTurn(true);
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

    const bossDouble = !!(state.campaign &&
      Engine.campaignHasBossMod(state.campaign.mission, 'boss-double-turn', state.campaign.phase));
    let doubleArmed = false;

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

      const shot = await doShot(boards.own, state.playerBoard, move.x, move.y, true, boards.enemy);
      if (seq !== state.matchSeq || state.gameOver) return;
      if (!shot) continue;

      recordReplay('own', move.x, move.y, shot.result);
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
            recordReplay('own', hit.x, hit.y, hit.result);
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
        if (bossDouble && doubleArmed) {
          doubleArmed = false;
          toast('👑 Босс ходит ещё раз', 'turn');
          await sleep(320);
          continue;
        }
        toast('🌊 Бот промахнулся', 'miss');
        await sleep(360);
        break;
      }

      if (bossDouble) doubleArmed = true;
      if (shot.result === 'sunk') toast('💀 Бот потопил ' + Engine.SHIP_LABEL[shot.ship.size].toLowerCase(), 'sunk');
      else toast('🔥 Бот попал', 'hit');
      await sleep(420);
    }

    if (seq !== state.matchSeq || state.gameOver) return;
    endBotTurn();
    // Всё оставшееся поле противника под дымом — ходить некуда. Пропускаем
    // ход игрока (дым тикает) и отдаём его боту, как это делает сервер.
    if (Engine.legalShots(state.enemyBoard).length === 0) {
      state.pendingAbility = null;
      clearAim();
      endPlayerTurn();
      state.playerTurn = false;
      state.locked = true;
      setTurn(false);
      renderAbilityBar();
      toast('💨 Всё поле под дымом — пропуск хода', 'turn');
      await sleep(650);
      if (seq !== state.matchSeq || state.gameOver) return;
      botTurn(seq);
      return;
    }
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
    // Сезонные медали — только за рейтинговые бот-бои, иначе их можно
    // нафармить в кастомной комнате или онлайне без роста рейтинга.
    const seasonMedals = (state.mode === 'bot' && isRatedBattle()) ? updateSeason(playerWon) : [];

    if (state.mode === 'online') {
      const same = Math.round(p.rating);
      p.stats = p.stats || { shots: 0, hits: 0 };
      p.stats.shots += ms.shots;
      p.stats.hits += ms.hits;
      // Личный счёт онлайна — на этом устройстве, сервер его не хранит.
      // В топ побед идут только классические комнаты: кастомные настройки
      // не должны накручивать счётчик.
      p.onlineGames = (p.onlineGames || 0) + 1;
      if (playerWon && isClassicConfig(state.config)) {
        p.onlineWins = (p.onlineWins || 0) + 1;
      }
      p.history = [makeHistory({
        name: state.botName,
        rating: Math.round(state.botRating),
        delta: 0,
        win: !!playerWon,
        rated: false,
        ts: Date.now()
      }, 'online')].concat(p.history || []).slice(0, 20);
      unlockAchievement('online', 700);
      saveProfile();
      updateMenu();
      showResult(playerWon, same, same, 0, reason, { rated: false, seasonMedals: seasonMedals });
      return;
    }

    if (state.campaign) {
      const c = state.campaign;
      const lostShips = Math.max(0,
        Engine.totalShips(state.playerBoard) - Engine.shipsLeft(state.playerBoard));
      const stars = Engine.campaignStars({
        won: !!playerWon,
        lostShips: lostShips,
        shots: ms.shots
      });
      let nextId = 0;
      let daily = null;
      if (playerWon) {
        const recorded = Engine.campaignRecord(state.profile.campaign, c.id, {
          won: true,
          lostShips: lostShips,
          shots: ms.shots
        });
        recorded.daily = state.profile.campaign.daily;
        recorded.captain = state.profile.campaign.captain;
        state.profile.campaign = normalizeCampaign(recorded);
        nextId = Engine.campaignNextId(c.id);
        if (c.daily) daily = claimCampaignDaily();
      }
      saveProfile();
      updateMenu();
      showResult(playerWon, Math.round(p.rating), Math.round(p.rating), 0, reason, {
        rated: false,
        campaign: {
          id: c.id,
          mission: c.mission,
          won: !!playerWon,
          stars: stars,
          nextId: nextId,
          daily: daily,
          captain: c.captain || state.captain || ''
        }
      });
      return;
    }

    const oldRating = Math.round(p.rating);
    const today = dayKey();

    // Испытание дня: цепочка из трёх боёв и награда +60 не зависят от
    // рейтингового гейта — конфиг дня одинаков для всех, а награда одна в день.
    let cupInfo = null;
    if (state.cupMatch && state.cup && !state.cup.finished) {
      if (playerWon) {
        state.cup.wins = (state.cup.wins || 0) + 1;
        if (state.cup.round >= 3) {
          state.cup.finished = true;
          // Повторное прохождение в тот же день награду не даёт.
          const reward = p.cupReward === today ? 0 : 60;
          if (reward) p.cupReward = today;
          cupInfo = { done: true, won: true, gain: reward, rewarded: reward > 0 };
        } else {
          state.cup.round += 1;
          state.cup.date = today;
          cupInfo = { done: false, round: state.cup.round };
        }
      } else {
        cupInfo = { done: true, won: false };
        state.cup = null;
      }
    }
    p.cup = state.cup;
    const cupGain = cupInfo && cupInfo.done && cupInfo.won ? cupInfo.gain : 0;

    // Рейтинг — только классический бот-бой 10×10. Кастомные поле, флот
    // и тактика прогресс не двигают, иначе рейтинг можно фармить.
    if (!isRatedBattle()) {
      if (cupGain > 0) {
        p.rating = oldRating + cupGain;
        p.best = Math.max(p.best || 0, p.rating);
      }
      p.stats = p.stats || { shots: 0, hits: 0 };
      p.stats.shots += ms.shots;
      p.stats.hits += ms.hits;
      p.history = [makeHistory({
        name: state.botName,
        rating: Math.round(state.botRating),
        delta: 0,
        win: !!playerWon,
        rated: false,
        ts: Date.now()
      }, state.cupMatch ? 'cup' : 'bot')].concat(p.history || []).slice(0, 20);
      if (cupInfo && cupInfo.done && cupInfo.won) unlockAchievement('cup', 900);
      saveProfile();
      updateMenu();
      showResult(playerWon, oldRating, oldRating + cupGain, cupGain, reason,
        { rated: false, cupInfo: cupInfo, seasonMedals: seasonMedals });
      return;
    }

    const delta = Engine.eloDelta(oldRating, Math.round(state.botRating), playerWon ? 1 : 0);

    // Ежедневный бонус: первая победа за календарный день.
    let dailyGain = 0;
    if (playerWon && (!p.daily || p.daily.date !== today)) {
      const streak = nextDailyStreak();
      p.daily = { date: today, streak: streak };
      dailyGain = dailyBonusFor(streak);
    }

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
    p.history = [makeHistory({
      name: state.botName,
      rating: Math.round(state.botRating),
      delta: newRating - oldRating,
      win: !!playerWon,
      rated: true,
      ts: Date.now()
    }, state.cupMatch ? 'cup' : 'bot')].concat(p.history || []).slice(0, 20);

    // достижения — проверяем после обновления статистики
    let achOrder = 0;
    const unlock = (id) => { unlockAchievement(id, 900 + (achOrder++) * 450); };
    if (playerWon) unlock('first_win');
    if (playerWon && ms.shots > 0 && ms.hits === ms.shots) unlock('perfect');
    if (ms.firstShotSunk) unlock('first_blood');
    if (p.streak >= 3) unlock('streak3');
    if (p.streak >= 5) unlock('win5');
    if (p.streak >= 10) unlock('streak10');
    if ((p.wins || 0) >= 10) unlock('win10');
    if ((p.wins || 0) >= 50) unlock('win50');
    if (newRating >= 1500) unlock('rank1500');
    if (p.daily && p.daily.streak >= 3) unlock('daily3');
    if (playerWon && fleetKey() === 'admiral') unlock('admiral');
    if (cupInfo && cupInfo.done && cupInfo.won) unlock('cup');

    // Яндекс Игры: считаем бои для показа рекламы между матчами
    if (YG && YG.available()) p.adMatches = (p.adMatches || 0) + 1;

    saveProfile();
    updateMenu();

    showResult(playerWon, oldRating, newRating, delta + dailyGain + cupGain, reason,
      { dailyGain: dailyGain, cupInfo: cupInfo, seasonMedals: seasonMedals });
  }

  /* ---------------- Реванш и реакции ---------------- */
  function requestRematch() {
    if (!state.net || state.net.rematchPending) return;
    if (state.net.foeGone) {
      toast('Соперник вышел — реванш недоступен', 'miss');
      return;
    }
    state.net.rematchPending = true;
    Online.rematch();
    const btn = $('#btn-again');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Ждём соперника…';
    }
    toast('🔁 Реванш предложен', 'turn');
    // Если соперник закрыл вкладку или не отвечает, кнопка не должна
    // оставаться заблокированной навсегда.
    setTimeout(() => {
      if (!state.net || !state.net.rematchPending) return;
      state.net.rematchPending = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚔️ Ещё бой';
      }
      toast('Соперник не отвечает — можно выйти в меню', 'miss');
    }, 8000);
  }

  const REACTION_PHRASES = {
    '🆘': 'Нужна помощь',
    '😉': 'Хитрый ход',
    '⚓': 'Держись!',
    '🔥': 'Огонь!',
    '😂': 'Смешно',
    '👍': 'Хорошо'
  };

  function updateReactionBar() {
    const bar = $('#battle-reactions');
    if (!bar) return;
    const online = state.mode === 'online';
    bar.hidden = !online;
    const mute = $('#btn-reactions-mute');
    if (mute) {
      const muted = !!(state.profile && state.profile.reactionsMuted);
      mute.textContent = muted ? '🔕' : '🔔';
      mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
      mute.setAttribute('aria-label', muted ? 'Включить реакции соперника' : 'Заглушить реакции соперника');
      mute.title = muted ? 'Реакции соперника выключены' : 'Заглушить реакции';
    }
  }

  function showReaction(from, emoji) {
    const layer = $('#battle-emoji-layer');
    if (!layer) return;
    if (from !== 'you' && state.profile && state.profile.reactionsMuted) return;
    const node = document.createElement('span');
    node.className = 'battle-emoji ' + (from === 'you' ? 'is-you' : 'is-foe');
    const b = document.createElement('b');
    b.textContent = String(emoji || '');
    const small = document.createElement('small');
    small.textContent = REACTION_PHRASES[emoji] ||
      (from === 'you' ? state.profile.name : state.botName || 'Соперник');
    node.appendChild(b);
    node.appendChild(small);
    layer.appendChild(node);
    setTimeout(() => node.remove(), 2200);
    while (layer.children.length > 3) layer.firstElementChild.remove();
  }

  function toggleReactionMute() {
    state.profile.reactionsMuted = !state.profile.reactionsMuted;
    updateReactionBar();
    syncSettings();
    saveProfile();
    toast(state.profile.reactionsMuted ? '🔕 Реакции соперника выключены' : '🔔 Реакции включены', 'turn');
    Sfx.play('click');
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

  function shareResult() {
    const r = state.lastResult || {};
    const lines = [
      r.win ? '🏆 Победа в «Морском бое — Морская арена»!' : '⚓ Бой в «Морском бое — Морская арена»',
      r.opp ? 'Соперник: ' + r.opp : '',
      r.rating ? 'Рейтинг: ' + Math.round(r.rating) : '',
      r.delta ? 'За бой: ' + (r.delta > 0 ? '+' : '') + r.delta : '',
      'Сыграй и ты:'
    ].filter(Boolean);
    const url = location.protocol === 'file:'
      ? 'https://mensori-dev.github.io/seabattle/'
      : location.origin + location.pathname;
    const text = lines.join('\n') + '\n' + url;
    if (navigator.share) {
      navigator.share({ title: 'Морской бой — Морская арена', text: text }).catch(() => {});
      return;
    }
    const done = (ok) => toast(ok ? '📤 Скопировано — отправь другу' : url, ok ? 'turn' : 'miss');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    done(ok);
  }

  function showResult(win, oldRating, newRating, delta, reason, extras) {
    state.lastResult = {
      win: !!win,
      reason: reason || '',
      delta: delta,
      rating: newRating,
      opp: state.botName,
      campaign: (extras && extras.campaign) || null
    };
    const overlay = $('#overlay');
    overlay.classList.toggle('is-lose', !win);
    overlay.hidden = false;
    overlay.classList.remove('is-open');
    if (window.Music) Music.duck(true);

    $('#result-emblem').textContent = win ? '🏆' : '💥';
    $('#result-title').textContent = win ? 'Победа!' : 'Поражение';
    const online = state.mode === 'online';
    const campaign = extras && extras.campaign;
    $('#result-sub').textContent = campaign
      ? (campaign.won ? 'Миссия пройдена: ' : 'Миссия не пройдена: ') + campaign.mission.title
      : (win
        ? (reason === 'surrender' ? 'Соперник сдался — победа твоя' : 'Флот противника отправлен на дно')
        : (reason === 'surrender' ? 'Ты покинул бой' : 'Твой флот уничтожен'));
    $('#result-opp').textContent = campaign
      ? 'Кампания · ' + campaignActName(campaign.mission.act) +
        ' · миссия ' + campaign.id
      : (online ? 'онлайн · ' : 'против ') + state.botName +
        (state.botRating ? ' · ' + Math.round(state.botRating) : '');

    const campaignBox = $('#campaign-result');
    const campaignActions = $('#campaign-result-actions');
    if (campaignBox) {
      campaignBox.hidden = !campaign;
      if (campaign) {
        const row = $('#campaign-result-stars');
        if (row) {
          row.innerHTML = '';
          for (let i = 1; i <= 5; i++) {
            const star = document.createElement('span');
            star.className = 'campaign-result-star' + (i <= campaign.stars ? ' is-on' : '');
            star.textContent = '★';
            row.appendChild(star);
          }
        }
        const label = $('#campaign-result-label');
        if (label) {
          if (campaign.won) {
            label.textContent = campaign.stars + ' из 5 звёзд';
            if (campaign.daily && campaign.daily.claimed) {
              const d = campaign.daily;
              label.textContent += ' · ' + (d.reward > 0
                ? 'миссия дня: +' + d.reward + ' ELO'
                : 'миссия дня уже получена') +
                ' · 🎫 жетон · серия ' + d.streak + ' дн.';
              if (d.milestones && d.milestones.length) {
                label.textContent += ' · веха ' + d.milestones.join('/');
              }
            }
          } else {
            label.textContent = 'Звёзды не начислены — попробуй ещё раз';
          }
          if (campaign.captain) {
            const cap = Engine.captainById(campaign.captain);
            if (cap) label.textContent += ' · Капитан: ' + cap.name + ' · ' + cap.desc;
          }
        }
      }
    }
    if (campaignActions) campaignActions.hidden = !campaign;
    ['#btn-again', '#btn-menu', '#btn-share-result'].forEach((sel) => {
      const btn = $(sel);
      if (btn) btn.hidden = !!campaign;
    });
    if (campaign) {
      const nextBtn = $('#btn-campaign-next');
      if (nextBtn) nextBtn.hidden = !campaign.nextId;
    }

    const eloRow = document.querySelector('.result-card .elo-row');
    const rated = !online && !(extras && extras.rated === false);
    if (eloRow) eloRow.hidden = !rated;
    const ratedBadge = $('#result-rated');
    if (ratedBadge) {
      ratedBadge.hidden = rated;
      ratedBadge.textContent = rated ? '' : (campaign
        ? (campaign.daily ? 'Миссия дня · +30 ELO' : 'Кампания · без рейтинга')
        : 'Без рейтинга');
    }

    const againBtn = $('#btn-again');
    if (againBtn) againBtn.disabled = false;
    if (online) {
      $('#btn-again').textContent = '🔁 Реванш';
    } else if (state.cupMatch && state.cup && state.cup.finished) {
      $('#btn-again').textContent = '🎯 Новое испытание';
    } else if (state.cupMatch && state.cup && state.cup.round > 1) {
      $('#btn-again').textContent = '▶️ Раунд ' + state.cup.round;
    } else {
      $('#btn-again').textContent = '⚔️ Ещё бой';
    }

    // бонусы дня и испытания — отдельной строкой, чтобы не путать с ELO
    const bonusEl = $('#bonus-line');
    if (bonusEl) {
      const parts = [];
      if (extras && extras.dailyGain > 0) parts.push('🎁 Бонус дня +' + extras.dailyGain);
      if (extras && extras.cupInfo) {
        const c = extras.cupInfo;
        if (c.done && c.won) {
          parts.push(c.gain > 0
            ? '🎯 Испытание дня пройдено! +' + c.gain
            : '🎯 Испытание дня пройдено сегодня');
        } else if (c.done) parts.push('🎯 Испытание дня сорвано — начни заново из меню');
        else parts.push('🎯 Испытание дня: раунд ' + c.round + ' из 3');
      }
      if (extras && Array.isArray(extras.seasonMedals) && extras.seasonMedals.length) {
        parts.push(extras.seasonMedals.map((t) => medalIcon(t) + ' ' +
          medalName(t) + ' сезона').join(' · '));
      }
      bonusEl.hidden = !parts.length;
      bonusEl.textContent = parts.join(' · ');
    }

    const stats = state.matchStats || { shots: 0, hits: 0 };
    const accEl = $('#res-acc');
    const shotsEl = $('#res-shots');
    const timeEl = $('#res-time');
    const streakEl = $('#res-streak');
    if (accEl) accEl.textContent = stats.shots ? Math.round(stats.hits / stats.shots * 100) + '%' : '—';
    if (shotsEl) shotsEl.textContent = stats.shots || '—';
    if (timeEl) {
      const total = Math.max(1, Math.round((Date.now() - (state.matchStartedAt || Date.now())) / 1000));
      timeEl.textContent = total >= 60
        ? Math.floor(total / 60) + 'м ' + (total % 60) + 'с'
        : total + 'с';
    }
    if (streakEl) {
      const streak = (online || !rated) ? 0 : (state.profile.streak || 0);
      streakEl.textContent = streak > 0 ? '🔥 ' + streak : (streak < 0 ? '❄️ ' + Math.abs(streak) : '—');
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
    if (campaign) {
      const bonus = $('#btn-bonus');
      if (bonus) bonus.hidden = true;
    }
  }

  /* ---------------- Реклама (Яндекс Игры / GamePush) ---------------- */

  /* Награда за rewarded-видео: раз в день, +25 к рейтингу. */
  function canShowAdBonus() {
    return !!YG && YG.available() && state.profile.adBonusDate !== dayKey();
  }

  function updateBonusButton() {
    const btn = $('#btn-bonus');
    if (!btn) return;
    btn.hidden = true;
    if (RU && state.profile.removeAds) return;
    if (!YG) return;
    // SDK инициализируется асинхронно — показываем кнопку, когда он готов
    YG.whenReady().then(function (sdk) {
      if (!sdk || !canShowAdBonus()) return;
      const overlay = $('#overlay');
      if (overlay && !overlay.hidden) btn.hidden = false;
    });
  }

  /* Кнопка на главном экране: ещё одна точка входа в rewarded-видео. */
  function updateAdBonusCard() {
    const btn = $('#btn-ad-bonus');
    if (!btn) return;
    btn.hidden = true;
    if (RU && state.profile.removeAds) return;
    if (!YG) return;
    YG.whenReady().then(function (sdk) {
      if (!sdk || !canShowAdBonus()) return;
      btn.hidden = false;
    });
  }

  function watchAdBonus() {
    if (RU && state.profile.removeAds) return;
    if (!canShowAdBonus()) return;
    const buttons = [$('#btn-bonus'), $('#btn-ad-bonus')].filter(Boolean);
    if (buttons.some(function (b) { return b.disabled; })) return;
    Sfx.play('click');
    buttons.forEach(function (b) { b.disabled = true; });
    YG.showRewarded().then(function (ok) {
      buttons.forEach(function (b) { b.disabled = false; });
      if (!ok) {
        toast('Реклама не загрузилась — попробуй позже', 'miss');
        return;
      }
      applyAdBonus();
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
    const adBtn = $('#btn-ad-bonus');
    if (adBtn) adBtn.hidden = true;
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
    // Куплено «Убрать рекламу» в RuStore — принудительный показ пропускаем целиком.
    if (RU && p.removeAds) { done(); return; }
    const ready = !!YG && YG.available() &&
      (p.adMatches || 0) >= 2 && Date.now() - (p.lastAdAt || 0) >= 90000;
    if (!ready) { done(); return; }
    YG.showInterstitial().then(function (wasShown) {
      // даже неудачный показ считаем попыткой: иначе будем дёргать SDK каждый бой
      p.lastAdAt = Date.now();
      if (wasShown) p.adMatches = 0;
      saveProfile();
      done();
    }, done);
  }

  /* ---------------- RuStore: покупки и магазин ---------------- */

  /* Цену показывает RuStore; запасная — только для карточки до готовности SDK. */
  function shopPrice(productId, fallback) {
    if (!RU) return fallback;
    const list = RU.products();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item && item.id === productId) {
        const price = Number(item.price);
        if (price > 0) return price + ' ₽';
      }
    }
    return fallback;
  }

  /* Единая отрисовка магазина и старых кнопок в меню. */
  function renderShop() {
    const p = state.profile || {};
    const available = !!(RU && RU.available());
    // RuStore не показывает рекламу: «Убрать рекламу» вернём, когда появится сеть.
    const adsSupported = !!(RU && typeof RU.adsSupported === 'function' && RU.adsSupported());
    const removeSection = $('#shop-remove-section');
    if (removeSection) removeSection.hidden = !adsSupported;
    const note = $('#shop-note');
    if (note) note.hidden = available;

    const removeBtn = $('#shop-buy-remove-ads');
    if (removeBtn) {
      removeBtn.textContent = shopPrice('remove_ads', '149 ₽');
      removeBtn.disabled = !available || !!p.removeAds;
      removeBtn.hidden = !!p.removeAds;
    }
    const supportBtn = $('#shop-buy-support');
    if (supportBtn) {
      supportBtn.textContent = shopPrice('support_99', '99 ₽');
      supportBtn.disabled = !available || !!p.supportThanks;
      supportBtn.hidden = !!p.supportThanks;
    }

    const removeStatus = $('#shop-remove-status');
    if (removeStatus) removeStatus.hidden = !p.removeAds;
    const supportStatus = $('#shop-support-status');
    if (supportStatus) supportStatus.hidden = !p.supportThanks;

    // Кнопки-дубли в меню тоже показываем только при живом мосте.
    const menuRemove = $('#btn-remove-ads');
    if (menuRemove) menuRemove.hidden = !available || !adsSupported || !!p.removeAds;
    const menuSupport = $('#btn-support');
    if (menuSupport) menuSupport.hidden = !available || !!p.supportThanks;
  }

  function openShop() {
    renderShop();
    const modal = $('#modal-shop');
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function buyShopProduct(productId, btn) {
    if (!RU || !RU.available()) {
      toast('Покупки доступны только в RuStore', 'miss');
      renderShop();
      return;
    }
    if (!btn || btn.disabled) return;
    Sfx.play('click');
    btn.disabled = true;
    // Единственный платёжный путь: RuStorePlatform.purchase(id).
    RU.purchase(productId).then(function (ok) {
      if (!ok) {
        btn.disabled = false;
        toast('Покупка не завершена — попробуй позже', 'miss');
        return;
      }
      if (productId === 'remove_ads') {
        state.profile.removeAds = true;
        saveProfile();
        RU.setAdsEnabled(false);
        applyRemoveAds();
        toast('Реклама отключена — спасибо!', 'turn');
      } else if (productId === 'support_99') {
        state.profile.supportThanks = true;
        saveProfile();
        toast('Спасибо за поддержку!', 'turn');
      }
      renderShop();
      Sfx.play('win');
    }, function () {
      btn.disabled = false;
      toast('Покупка не завершена — попробуй позже', 'miss');
    });
  }

  /* Реальный эффект покупки: убираем rewarded-кнопки и просим мост
     выключить рекламу. Без RuStorePlatform всё остаётся как раньше. */
  function applyRemoveAds() {
    if (!RU) return;
    const p = state.profile;
    if (!p || !p.removeAds) return;
    const resultBonus = $('#btn-bonus');
    if (resultBonus) resultBonus.hidden = true;
    const adBonus = $('#btn-ad-bonus');
    if (adBonus) adBonus.hidden = true;
    RU.setAdsEnabled(false);
    renderShop();
  }

  /* Восстановление непотребляемой покупки после переустановки.
     Мост возвращает true, только если remove_ads действительно есть. */
  function restorePurchases() {
    if (!RU || !RU.available()) return;
    RU.restore().then(function (restored) {
      if (!restored) return;
      if (!state.profile.removeAds) {
        state.profile.removeAds = true;
        saveProfile();
      }
      applyRemoveAds();
      renderShop();
    });
  }

  function updateRuStoreButtons() {
    renderShop();
  }

  function wireRuStore() {
    const removeBtn = $('#btn-remove-ads');
    const supportBtn = $('#btn-support');
    if (removeBtn) removeBtn.addEventListener('click', function () { buyShopProduct('remove_ads', removeBtn); });
    if (supportBtn) supportBtn.addEventListener('click', function () { buyShopProduct('support_99', supportBtn); });
    $$('#modal-shop [data-product]').forEach(function (btn) {
      btn.addEventListener('click', function () { buyShopProduct(btn.dataset.product, btn); });
    });

    renderShop();
    applyRemoveAds();
    if (!RU) return;
    RU.whenReady().then(function (sdk) {
      if (!sdk) {
        renderShop();
        return;
      }
      updateRuStoreButtons();
      applyRemoveAds();
      restorePurchases();
      renderShop();
    });
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
      skin: p.skin,
      water: p.water,
      reactionsMuted: p.reactionsMuted,
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

  /* ---------------- Кампания ---------------- */
  function campaignActName(act) {
    if (act === 1) return 'Акт I · Туман';
    if (act === 2) return 'Акт II · Шторм';
    return 'Акт III · Ледяной флот';
  }

  function campaignStarsOf(id) {
    const p = state.profile.campaign || {};
    return toInt((p.stars || {})[id], 0, 5, 0);
  }

  function campaignStarTotal() {
    const p = state.profile.campaign || {};
    return Object.keys(p.stars || {}).reduce((sum, id) => sum + campaignStarsOf(id), 0);
  }

  function paintCampaignFog() {
    const c = state.campaign;
    if (!c || !c.fog || !boards.enemy || !state.enemyBoard) return;
    const n = state.enemyBoard.size;
    c.fog.forEach((key) => {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const cell = boards.enemy.children[y * n + x];
      if (cell && !cell.dataset.result) cell.classList.add('is-fog');
    });
  }

  function clearCampaignFog(x, y) {
    const c = state.campaign;
    if (!c) return;
    if (c.fog) c.fog.delete(x + ',' + y);
    const cell = boards.enemy && boards.enemy.children[y * state.size + x];
    if (cell) {
      cell.classList.remove('is-fog');
      cell.classList.remove('is-captain-reveal');
    }
    if (c.reveal && c.reveal.x === x && c.reveal.y === y) c.reveal = null;
  }

  function paintCaptainReveal() {
    const c = state.campaign;
    if (!c || !c.reveal || !boards.enemy) return;
    const n = state.enemyBoard ? state.enemyBoard.size : state.size;
    const cell = boards.enemy.children[c.reveal.y * n + c.reveal.x];
    if (cell) cell.classList.add('is-captain-reveal');
  }

  function updateCampaignPhase() {
    const c = state.campaign;
    if (!c || !c.mission || !c.mission.boss || !state.enemyBoard) return;
    const next = Engine.campaignBossPhase(
      c.mission,
      Engine.shipsLeft(state.enemyBoard),
      Engine.totalShips(state.enemyBoard)
    );
    if (next > (c.phase || 1)) {
      c.phase = next;
      c.botLoadout = Engine.campaignBotLoadout(c.mission, next);
      if (state.botAbilities) {
        const grant = Engine.newAbilityState(c.botLoadout);
        Object.keys(grant).forEach((key) => {
          state.botAbilities[key] = Math.max(state.botAbilities[key] || 0, grant[key] || 0);
        });
      }
      toast('👑 ' + c.mission.boss.name + ': фаза ' + next, 'turn');
    }
    updateCampaignPhaseBar();
  }

  function updateCampaignPhaseBar() {
    const wrap = $('#campaign-phase');
    if (!wrap) return;
    const c = state.campaign;
    if (!c || !c.mission || !c.mission.boss) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const name = $('#campaign-phase-name');
    const label = $('#campaign-phase-label');
    if (name) name.textContent = c.mission.boss.name;
    if (label) label.textContent = 'Фаза ' + (c.phase || 1);
    $$('#campaign-phase [data-phase]').forEach((el) => {
      el.classList.toggle('is-on', Number(el.dataset.phase) <= (c.phase || 1));
    });
  }

  function updateCampaignCard() {
    const sub = $('#campaign-sub');
    if (!sub) return;
    const p = state.profile.campaign || {};
    const done = (p.completed || []).length;
    const total = (Engine.CAMPAIGN && Engine.CAMPAIGN.length) || 12;
    sub.textContent = done
      ? 'Пройдено ' + done + ' из ' + total + ' · ' + campaignStarTotal() + ' ⭐'
      : total + ' миссий · 3 акта';
  }

  const CAMPAIGN_MOD_LABELS = {
    'extra-ship': 'у врага +1 корабль',
    'airstrike-only': 'только авиаудар',
    'single-deck-fleet': 'только однопалубные',
    'fog': 'туман: 5 клеток',
    'smoke': 'дым у обеих сторон',
    'storm-refund': 'каждый 5-й промах бесплатный',
    'few-ships': 'у тебя 3 корабля',
    'boss-double-turn': 'босс ходит дважды',
    'boss-aa': 'ПВО босса',
    'boss-smoke': 'дым босса',
    'boss-airstrike': 'авиаудар босса'
  };

  function campaignModsText(mods) {
    const list = (Array.isArray(mods) ? mods : [])
      .map((id) => CAMPAIGN_MOD_LABELS[id])
      .filter(Boolean);
    return list.length ? list.join(' · ') : 'без модификаторов';
  }

  function activeCaptain() {
    if (!state.campaign || state.mode !== 'bot') return null;
    return Engine.captainById(state.campaign.captain || state.captain);
  }

  function renderCaptains() {
    const box = $('#campaign-captains');
    if (!box) return;
    const progress = state.profile.campaign || {};
    const saved = progress.captain || state.captain || 'bosun';
    const cards = box.querySelectorAll('[data-captain]');
    cards.forEach((card) => {
      const captain = Engine.captainById(card.dataset.captain);
      if (!captain) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      const unlocked = Engine.captainUnlocked(progress, captain.id);
      const selected = unlocked && captain.id === saved;
      const actLabel = ['I', 'II', 'III'][captain.act - 1] || String(captain.act);
      card.disabled = !unlocked;
      card.classList.toggle('is-locked', !unlocked);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.setAttribute('aria-label', captain.name + ': ' + captain.desc +
        (unlocked ? (selected ? ' — выбран' : '') : ' — откроется в акте ' + actLabel));
      const name = card.querySelector('.campaign-captain-name');
      if (name) name.textContent = captain.name;
      const passive = card.querySelector('.campaign-captain-passive');
      if (passive) passive.textContent = captain.desc;
      const lock = card.querySelector('.campaign-captain-lock');
      if (lock) lock.textContent = 'Откроется в акте ' + actLabel;
    });
  }

  function selectCaptain(id) {
    const captain = Engine.captainById(id);
    if (!captain) return false;
    if (!Engine.captainUnlocked(state.profile.campaign || {}, captain.id)) {
      toast(captain.name + ': откроется позже', 'turn');
      return false;
    }
    state.captain = captain.id;
    state.profile.campaign.captain = captain.id;
    saveProfile();
    renderCaptains();
    toast('🎖️ Капитан: ' + captain.name, 'turn');
    return true;
  }

  function currentCampaignDaily() {
    return Engine.campaignDaily(dayKey(), state.profile.campaign);
  }

  function campaignDailyState() {
    const campaign = state.profile.campaign || {};
    return campaign.daily || { date: '', streak: 0, tokens: 0, rewardDate: '', milestones: {} };
  }

  function renderCampaignDaily() {
    const card = $('#campaign-daily');
    if (!card) return;
    const daily = currentCampaignDaily();
    const mission = Engine.campaignById(daily.id);
    if (!mission) { card.hidden = true; return; }
    card.hidden = false;
    const today = dayKey();
    const saved = campaignDailyState();
    const claimed = saved.date === today;
    const streak = Engine.campaignDailyStreak(state.profile, today);
    const title = $('#campaign-daily-title');
    const mods = $('#campaign-daily-mods');
    const reward = $('#campaign-daily-reward');
    const streakEl = $('#campaign-daily-streak');
    const token = $('#campaign-daily-token');
    const btn = $('#btn-campaign-daily');
    if (title) title.textContent = 'Миссия ' + mission.id + ' · ' + mission.title;
    if (mods) {
      mods.textContent = campaignModsText(daily.mods) + ' · ' +
        mission.size + '×' + mission.size + ' · ' + (mission.boss ? 'босс' : 'бот ' + mission.bot);
    }
    if (reward) {
      reward.textContent = claimed ? '✅ Награда получена' : '+30 ELO · 🎫 1 жетон';
    }
    if (streakEl) {
      const marks = [3, 7, 14].filter((n) => saved.milestones && saved.milestones[n]);
      streakEl.textContent = 'Серия: ' + streak + ' дн. · вехи ' +
        (marks.length ? 'получены: ' + marks.join(', ') : '3 / 7 / 14');
    }
    if (token) token.textContent = '🎫 ' + (saved.tokens || 0);
    card.classList.toggle('is-done', claimed);
    if (btn) {
      btn.disabled = claimed;
      btn.textContent = claimed ? 'Сегодня получено' : 'Играть';
      btn.setAttribute('aria-label', claimed
        ? 'Миссия дня уже пройдена'
        : 'Начать миссию дня ' + mission.id);
    }
  }

  function startCampaignDaily() {
    const today = dayKey();
    if (campaignDailyState().date === today) {
      toast('Миссия дня уже пройдена', 'turn');
      return false;
    }
    const daily = currentCampaignDaily();
    return startCampaignMission(daily.id, true);
  }

  function claimCampaignDaily() {
    const p = state.profile;
    if (!p.campaign) p.campaign = normalizeCampaign(null);
    const d = p.campaign.daily || normalizeCampaignDaily(null);
    p.campaign.daily = d;
    const today = dayKey();
    if (d.date === today) {
      return { claimed: false, reward: 0, streak: d.streak || 0, tokens: d.tokens || 0, milestones: [] };
    }
    const reward = Engine.campaignDailyReward(today, p);
    const yesterday = dayKey(Date.now() - 86400000);
    const streak = d.date === yesterday ? (d.streak || 0) + 1 : 1;
    if (reward > 0) {
      d.rewardDate = today;
      p.rating = Math.round(Number(p.rating) || 0) + reward;
      p.best = Math.max(Number(p.best) || 0, p.rating);
    }
    d.date = today;
    d.streak = streak;
    d.tokens = (d.tokens || 0) + 1;
    const milestones = [];
    [3, 7, 14].forEach((days) => {
      if (streak >= days && !d.milestones[days]) {
        d.milestones[days] = today;
        milestones.push(days);
      }
    });
    return { claimed: true, reward: reward, streak: streak, tokens: d.tokens, milestones: milestones };
  }

  function renderCampaign() {
    const map = $('#campaign-map');
    const progress = state.profile.campaign || { completed: [], stars: {}, lastId: 1 };
    const missions = (Engine.CAMPAIGN || []).slice();
    const last = Engine.campaignById ? Engine.campaignById(progress.lastId) : null;
    const actTitle = $('#campaign-act-title');
    if (actTitle) actTitle.textContent = campaignActName(last ? last.act : 1);
    const totalStars = $('#campaign-stars');
    if (totalStars) {
      const maxStars = missions.reduce((sum, m) => sum + (m.stars || 5), 0);
      totalStars.textContent = '⭐ ' + campaignStarTotal() + ' / ' + maxStars;
      totalStars.setAttribute('aria-label',
        'Собрано звёзд: ' + campaignStarTotal() + ' из ' + maxStars);
    }
    renderCaptains();
    renderCampaignDaily();
    if (!map) return;

    const make = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    };

    const fragment = document.createDocumentFragment();
    [1, 2, 3].forEach((act) => {
      const list = missions.filter((m) => m.act === act);
      if (!list.length) return;
      const section = make('section', 'campaign-act');
      section.dataset.act = String(act);
      const head = make('div', 'campaign-act-head');
      head.appendChild(make('h3', 'campaign-act-title', campaignActName(act)));
      const actStars = list.reduce((sum, m) => sum + campaignStarsOf(m.id), 0);
      head.appendChild(make('span', 'campaign-act-stars',
        actStars + ' / ' + list.length * 5 + ' ⭐'));
      section.appendChild(head);

      const grid = make('div', 'campaign-missions');
      list.forEach((mission) => {
        const unlocked = Engine.campaignUnlocked(progress, mission.id);
        const stars = campaignStarsOf(mission.id);
        const maxStars = mission.stars || 5;
        const card = make('button', 'campaign-mission');
        card.type = 'button';
        card.dataset.mission = String(mission.id);
        if (!unlocked) {
          card.disabled = true;
          card.classList.add('is-locked');
          card.setAttribute('aria-label', 'Миссия ' + mission.id + ': закрыта');
        } else {
          card.setAttribute('aria-label',
            'Миссия ' + mission.id + ': ' + mission.title + ', звёзды ' + stars + ' из ' + maxStars);
        }
        if (mission.id === progress.lastId) card.classList.add('is-last');

        const top = make('span', 'campaign-mission-top');
        top.appendChild(make('span', 'campaign-mission-num', '№ ' + mission.id));
        if (mission.boss) top.appendChild(make('span', 'campaign-boss', 'БОСС'));
        card.appendChild(top);
        card.appendChild(make('b', 'campaign-mission-title', mission.title));
        card.appendChild(make('small', 'campaign-mission-meta',
          mission.size + '×' + mission.size + ' · ' +
          (mission.fleet === 'admiral' ? 'Адмиральский флот' : 'Классика')));

        if (unlocked) {
          const starsRow = make('span', 'campaign-mission-stars');
          for (let i = 1; i <= maxStars; i++) {
            starsRow.appendChild(make('span', 'campaign-star' + (i <= stars ? ' is-on' : ''), '★'));
          }
          starsRow.appendChild(make('span', 'campaign-star-count', stars + ' / ' + maxStars));
          card.appendChild(starsRow);
        } else {
          card.appendChild(make('span', 'campaign-lock', '🔒 Закрыто'));
        }
        grid.appendChild(card);
      });
      section.appendChild(grid);
      fragment.appendChild(section);
    });
    map.innerHTML = '';
    map.appendChild(fragment);
  }

  function openCampaign() {
    showScreen('campaign');
    const p = state.profile.campaign || { lastId: 1 };
    const reduce = state.profile.motion === 'off' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    requestAnimationFrame(() => {
      const last = $('#campaign-map [data-mission="' + (p.lastId || 1) + '"]');
      if (last && last.scrollIntoView) {
        last.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }
    });
  }

  /* ---------------- Зал славы ---------------- */
  let fameTab = 'heat';
  let fameHeatSize = 10;
  let replayTimer = null;

  function openFame() {
    renderFame();
    const modal = $('#modal-fame');
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function renderFame() {
    $$('#fame-tabs button').forEach((b) => {
      const active = b.dataset.fameTab === fameTab;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.tabIndex = active ? 0 : -1;
    });
    const panels = { heat: $('#fame-heat'), history: $('#fame-history'), trophies: $('#fame-trophies') };
    Object.keys(panels).forEach((key) => {
      if (panels[key]) panels[key].hidden = key !== fameTab;
    });
    if (fameTab === 'heat') renderHeatmap();
    else if (fameTab === 'history') renderFameHistory();
    else renderTrophies();
  }

  function renderHeatmap() {
    const grid = $('#heatmap');
    if (!grid) return;
    const p = state.profile;
    const size = [8, 10, 12].indexOf(fameHeatSize) >= 0 ? fameHeatSize : 10;
    $$('#fame-heat-size button').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.heatSize) === size);
    });
    grid.style.setProperty('--n', size);
    grid.innerHTML = '';
    let total = 0;
    let max = 0;
    let best = null;
    const values = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const count = Number((p.heat || {})[size + ':' + x + ':' + y]) || 0;
        values.push(count);
        total += count;
        if (count > max) { max = count; best = { x: x, y: y, count: count }; }
      }
    }
    values.forEach((count, i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      const cell = document.createElement('span');
      cell.className = 'heat-cell' + (count ? '' : ' is-empty');
      cell.style.background = count
        ? 'rgba(255,107,94,' + (0.16 + (count / (max || 1)) * 0.76).toFixed(3) + ')'
        : 'rgba(120,200,255,.055)';
      cell.textContent = count ? String(count) : '';
      cell.title = 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': ' + count + ' выстрелов';
      grid.appendChild(cell);
    });
    const note = $('#heat-note');
    if (note) {
      note.textContent = total
        ? 'Всего выстрелов: ' + total + ' · чаще всего: ' + (best.x + 1) + ', ' + (best.y + 1) +
          ' (' + best.count + ' раз). Карта копится по всем боям на этом устройстве.'
        : 'Карта пока пустая. Сыграй бой — и увидишь свои любимые клетки.';
    }
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const min = Math.floor(total / 60);
    return min + ':' + String(total % 60).padStart(2, '0');
  }

  function renderFameHistory() {
    const list = $('#fame-history-list');
    if (!list) return;
    const hist = state.profile.history || [];
    if (!hist.length) {
      list.innerHTML = '<p class="fame-empty">История пока пуста — сыграй первый бой.</p>';
      return;
    }
    list.innerHTML = hist.map((h, i) => {
      const rated = h.rated !== false;
      const delta = Number(h.delta) || 0;
      const deltaText = rated ? (delta >= 0 ? '+' : '') + delta : '—';
      const date = h.ts ? new Date(h.ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';
      const mode = h.mode === 'online' ? 'онлайн' : h.mode === 'cup' ? 'испытание' : 'с ботом';
      return '<div class="fame-history-row">' +
        '<span class="h-dot ' + (h.win ? 'win' : 'lose') + '"></span>' +
        '<span class="fame-history-main"><b>' + escapeHtml(h.name) + '</b>' +
          '<small>' + date + ' · ' + mode + ' · ' + formatDuration(h.duration) +
          ' · ' + (h.moves || 0) + ' выстр.</small></span>' +
        '<span class="h-delta ' + (rated ? (delta >= 0 ? 'plus' : 'minus') : 'na') + '">' + deltaText + '</span>' +
        '<button class="fame-replay-btn" type="button" data-replay-index="' + i + '"' +
          (h.replay && h.replay.length ? '' : ' disabled') + ' aria-label="Смотреть реплей">▶</button>' +
      '</div>';
    }).join('');
  }

  function renderTrophies() {
    const p = state.profile;
    const s = p.season || { id: seasonId(), wins: 0, streak: 0, bestStreak: 0 };
    const next = s.bestStreak >= 10 ? 10 : s.bestStreak >= 5 ? 10 : s.bestStreak >= 3 ? 5 : 3;
    const pct = Math.min(100, (s.bestStreak / next) * 100);
    const seasonCard = $('#season-card');
    if (seasonCard) {
      seasonCard.innerHTML =
        '<div class="season-head"><span>🏆</span><div><b>' + escapeHtml(seasonName(s.id)) + '</b>' +
        '<small>Сезон ' + escapeHtml(s.id) + ' · побед: ' + (s.wins || 0) + '</small></div></div>' +
        '<div class="season-progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<p class="fame-note">Текущая серия: ' + (s.streak || 0) + ' · лучшая: ' + (s.bestStreak || 0) +
        ' · до следующей медали: ' + Math.max(0, next - (s.bestStreak || 0)) + '</p>';
    }
    const grid = $('#medal-grid');
    if (!grid) return;
    const medals = (p.medals || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!medals.length) {
      grid.innerHTML = '<p class="fame-empty">Медалей пока нет. Выиграй 3 боя подряд в одном месяце — получишь бронзу.</p>';
      return;
    }
    grid.innerHTML = medals.map((m) =>
      '<div class="medal-item"><span class="medal-icon">' + medalIcon(m.tier) + '</span>' +
      '<span class="medal-text"><b>' + medalName(m.tier) + '</b>' +
      '<small>' + escapeHtml(seasonName(m.season)) + '</small></span></div>'
    ).join('');
  }

  function replayCell(el, shot) {
    const cell = el.children[shot.y * Number(el.style.getPropertyValue('--n') || 10) + shot.x];
    if (!cell) return;
    if (shot.result === 'miss') cell.classList.add('miss');
    else {
      cell.classList.add('hit');
      if (shot.result === 'sunk') cell.classList.add('sunk');
    }
    cell.dataset.result = shot.result;
  }

  function closeReplay() {
    if (replayTimer) clearTimeout(replayTimer);
    replayTimer = null;
    closeOverlay($('#modal-replay'));
  }

  function openReplay(index) {
    const entry = (state.profile.history || [])[index];
    if (!entry || !entry.replay || !entry.replay.length) {
      toast('У этого матча нет реплея', 'miss');
      return;
    }
    const size = [8, 10, 12].indexOf(Number(entry.size)) >= 0 ? Number(entry.size) : 10;
    const enemy = $('#replay-enemy');
    const own = $('#replay-own');
    if (!enemy || !own) return;
    buildBoard(enemy, size);
    buildBoard(own, size);
    const title = $('#replay-title');
    if (title) title.textContent = (entry.win ? 'Победа' : 'Поражение') + ' · ' + entry.name;
    const status = $('#replay-status');
    if (status) status.textContent = 'Готовим реплей…';
    const modal = $('#modal-replay');
    if (modal) {
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('is-open'));
    }
    if (replayTimer) clearTimeout(replayTimer);
    let step = 0;
    const shots = entry.replay;
    const play = () => {
      if (step >= shots.length) {
        replayTimer = null;
        if (status) status.textContent = 'Реплей завершён';
        return;
      }
      const shot = shots[step];
      replayCell(shot.side === 'own' ? own : enemy, shot);
      step += 1;
      if (status) status.textContent = 'Выстрел ' + step + ' из ' + shots.length;
      replayTimer = setTimeout(play, 220);
    };
    replayTimer = setTimeout(play, 260);
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
      state.quickBattle = true;
      startMatch();
    });

    $('#btn-setup').addEventListener('click', () => {
      Sfx.play('click');
      showScreen('setup');
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
      if (creatingRoom) return;
      creatingRoom = true;
      createDeadline = setTimeout(() => {
        if (!creatingRoom) return;
        clearCreatePending();
        setOnlineStatus('Сервер не ответил. Попробуй создать комнату ещё раз', true);
        toast('⚠️ Не удалось создать комнату', 'miss');
      }, 12000);
      Online.connect()
        .then(() => {
          if (!creatingRoom) return;
          setOnlineStatus('Создаём комнату…');
          clearPendingJoin();
          Online.create(state.profile.name, Math.round(state.profile.rating), lobbyConfig());
        })
        .catch((err) => {
          clearCreatePending();
          setOnlineStatus((err && err.message) || 'Сервер недоступен', true);
        });
    });

    function submitJoin() {
      const code = ($('#room-code').value || '').replace(/\D/g, '');
      Sfx.play('click');
      joinRoom(code);
    }

    $('#btn-join-room').addEventListener('click', submitJoin);
    $('#room-code').addEventListener('input', (e) => {
      e.target.value = (e.target.value || '').replace(/\D/g, '').slice(0, 4);
    });
    $('#room-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitJoin(); }
    });

    $('#lobby-size').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lobby-size]');
      if (!btn) return;
      setLobbyConfig({ size: Number(btn.dataset.lobbySize) });
    });
    $('#lobby-fleet').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lobby-fleet]');
      if (!btn || btn.disabled) return;
      setLobbyConfig({ fleet: btn.dataset.lobbyFleet });
    });
    $('#lobby-tactics').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lobby-tactics]');
      if (!btn) return;
      setLobbyConfig({ tactics: btn.dataset.lobbyTactics === 'on' });
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

    $('#btn-setup-back').addEventListener('click', () => {
      Sfx.play('click');
      showScreen('menu');
    });
    $('#btn-setup-go').addEventListener('click', () => {
      if (state.screen !== 'setup') return;
      Sfx.play('click');
      state.quickBattle = false;
      state.cupMatch = false; // «Настроить» — обычный бой, не раунд испытания
      startMatch();
    });

    const reactionBar = $('#battle-reactions');
    if (reactionBar) {
      reactionBar.addEventListener('click', (e) => {
        if (e.target.closest('#btn-reactions-mute')) {
          toggleReactionMute();
          return;
        }
        const btn = e.target.closest('button[data-emoji]');
        if (!btn) return;
        const emoji = btn.dataset.emoji;
        if (state.mode !== 'online') return;
        Online.emoji(emoji);
        showReaction('you', emoji);
        Sfx.play('click');
      });
    }

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

    const shopBtn = $('#btn-shop');
    if (shopBtn) {
      shopBtn.addEventListener('click', () => {
        Sfx.play('click');
        openShop();
      });
      const shopClose = $('#btn-shop-close');
      if (shopClose) shopClose.addEventListener('click', () => {
        Sfx.play('click');
        closeOverlay($('#modal-shop'));
      });
      const shopDone = $('#btn-shop-done');
      if (shopDone) shopDone.addEventListener('click', () => {
        Sfx.play('click');
        closeOverlay($('#modal-shop'));
      });
      const shopModal = $('#modal-shop');
      if (shopModal) shopModal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeOverlay(e.currentTarget);
      });
    }

    $('#btn-fame').addEventListener('click', () => {
      Sfx.play('click');
      openFame();
    });
    $('#btn-fame-close').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#modal-fame'));
    });
    $('#btn-fame-done').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#modal-fame'));
    });
    $('#modal-fame').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeOverlay(e.currentTarget);
    });
    $('#fame-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-fame-tab]');
      if (!btn) return;
      fameTab = btn.dataset.fameTab;
      Sfx.play('click');
      renderFame();
    });
    $('#fame-heat-size').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-heat-size]');
      if (!btn) return;
      fameHeatSize = Number(btn.dataset.heatSize) || 10;
      Sfx.play('click');
      renderHeatmap();
    });
    $('#fame-history-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-replay-index]');
      if (!btn || btn.disabled) return;
      Sfx.play('click');
      openReplay(Number(btn.dataset.replayIndex));
    });
    $('#btn-replay-close').addEventListener('click', () => {
      Sfx.play('click');
      closeReplay();
    });
    $('#modal-replay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeReplay();
    });

    const campaignBtn = $('#btn-campaign');
    if (campaignBtn) campaignBtn.addEventListener('click', () => {
      Sfx.play('click');
      openCampaign();
    });
    const campaignBack = $('#btn-campaign-back');
    if (campaignBack) campaignBack.addEventListener('click', () => {
      Sfx.play('click');
      updateMenu();
      showScreen('menu');
    });
    const campaignMap = $('#campaign-map');
    if (campaignMap) campaignMap.addEventListener('click', (e) => {
      const card = e.target.closest('button[data-mission]');
      if (!card || card.disabled) return;
      const id = Math.round(Number(card.dataset.mission));
      const mission = Engine.campaignById ? Engine.campaignById(id) : null;
      if (!mission) return;
      Sfx.play('click');
      startCampaignMission(id);
    });
    const campaignDailyBtn = $('#btn-campaign-daily');
    if (campaignDailyBtn) campaignDailyBtn.addEventListener('click', () => {
      Sfx.play('click');
      startCampaignDaily();
    });
    const campaignCaptains = $('#campaign-captains');
    if (campaignCaptains) campaignCaptains.addEventListener('click', (e) => {
      const card = e.target.closest('button[data-captain]');
      if (!card || card.disabled) return;
      const captain = Engine.captainById(card.dataset.captain);
      if (!captain) return;
      Sfx.play('click');
      selectCaptain(captain.id);
    });

    $('#btn-cup').addEventListener('click', () => {
      Sfx.play('click');
      state.mode = 'bot';
      const active = state.cup && !state.cup.finished && state.cup.date === dayKey();
      if (active) {
        continueCup();
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

    $('#set-skin').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-skin]');
      if (!btn) return;
      const value = btn.dataset.skin;
      state.profile.skin = ['grid', 'cyber', 'navy'].indexOf(value) >= 0 ? value : 'classic';
      applyTheme();
      syncSettings();
      saveProfile();
      Sfx.play('click');
      toast('Скин поля: ' + btn.textContent.trim(), 'turn');
    });

    $('#set-water').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-water]');
      if (!btn) return;
      const value = btn.dataset.water;
      state.profile.water = ['storm', 'night', 'fog'].indexOf(value) >= 0 ? value : 'calm';
      applyTheme();
      syncSettings();
      saveProfile();
      Sfx.play('click');
      toast('Вода: ' + btn.textContent.trim(), 'turn');
    });

    $('#set-reactions').addEventListener('click', toggleReactionMute);

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
      if (state.screen !== 'setup') return;
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
      if (state.screen !== 'setup') return;
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
      if (state.screen !== 'setup') return;
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
      if (state.screen !== 'setup') return;
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
      if (state.campaign) {
        state.campaign = null;
        updateMenu();
        showScreen('campaign');
        return;
      }
      // После «Быстрого боя» возвращаемся в меню, из настроек — к настройкам:
      // так можно поменять воду, поле или флот, не выходя из сценария.
      if (state.mode === 'bot' && !state.cupMatch) {
        if (state.quickBattle) {
          state.quickBattle = false;
          showScreen('menu');
          updateMenu();
        } else {
          showScreen('setup');
        }
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
      if (state.campaign) { beginBattle(); return; }
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
    // На тач-экранах нет hover: показываем зону уже при касании.
    boards.enemy.addEventListener('pointerdown', (e) => {
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
    boards.own.addEventListener('pointerdown', (e) => {
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
      if (state.mode === 'online') {
        sendNetAbility('smoke', Number(cell.dataset.x), Number(cell.dataset.y));
        return;
      }
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
      if (state.mode === 'online') {
        requestRematch();
        return;
      }
      closeOverlay($('#overlay'));
      const wasCup = state.cupMatch;
      const next = () => {
        if (wasCup && state.cup && state.cup.finished) {
          startCup();
          return;
        }
        // Продолжаем цепочку только если только что был её раунд;
        // после обычного боя «Ещё бой» не должен возвращать в испытание.
        state.cupMatch = !!(wasCup && state.cup && !state.cup.finished);
        startMatch();
      };
      showInterstitialBetweenMatches(next);
    });

    /* Награда за просмотр рекламы (Яндекс Игры / GamePush). */
    const bonusBtn = $('#btn-bonus');
    if (bonusBtn) bonusBtn.addEventListener('click', watchAdBonus);
    const adBonusBtn = $('#btn-ad-bonus');
    if (adBonusBtn) adBonusBtn.addEventListener('click', watchAdBonus);
    const shareBtn = $('#btn-share-result');
    if (shareBtn) shareBtn.addEventListener('click', () => {
      Sfx.play('click');
      shareResult();
    });
    $('#btn-menu').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#overlay'));
      if (state.mode === 'online') leaveOnline();
      updateMenu();
      showScreen('menu');
    });

    /* --- результат кампании --- */
    const campaignNext = $('#btn-campaign-next');
    if (campaignNext) campaignNext.addEventListener('click', () => {
      const c = state.lastResult && state.lastResult.campaign;
      if (!c || !c.nextId) return;
      Sfx.play('click');
      closeOverlay($('#overlay'));
      startCampaignMission(c.nextId);
    });
    const campaignRetry = $('#btn-campaign-retry');
    if (campaignRetry) campaignRetry.addEventListener('click', () => {
      const c = state.lastResult && state.lastResult.campaign;
      if (!c) return;
      Sfx.play('click');
      closeOverlay($('#overlay'));
      startCampaignMission(c.id);
    });
    const campaignMapBtn = $('#btn-campaign-map');
    if (campaignMapBtn) campaignMapBtn.addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#overlay'));
      state.campaign = null;
      updateMenu();
      showScreen('campaign');
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
        const fame = $('#modal-fame');
        if (fame && !fame.hidden) closeOverlay(fame);
        const shop = $('#modal-shop');
        if (shop && !shop.hidden) closeOverlay(shop);
        const replay = $('#modal-replay');
        if (replay && !replay.hidden) closeReplay();
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
  state.captain = state.profile.campaign.captain || 'bosun';
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
  wireRuStore();
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
