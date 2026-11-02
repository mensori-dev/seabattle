/* ============================================================
   Морской бой — интерфейс и игровой процесс
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const STORE_KEY = 'seabattle.profile.v2';
  let memoryStore = null;

  /* Версия кэша PWA. Должна совпадать с VERSION в sw.js: адрес `sw.js?v=…`
     не даёт CDN GitHub Pages отдать старый service worker (кэш 10 минут). */
  const SW_VERSION = 'sb-v6';

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
    gameOver: false,
    matchSeq: 0,
    ghost: []
  };

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
      muted: false
    };
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return Object.assign(defaultProfile(), p, {
          rating: Number(p.rating) || 1000,
          history: Array.isArray(p.history) ? p.history.slice(0, 8) : []
        });
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
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, gain, to, delay) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.05), t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    noise(dur, gain, freq, delay) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 900;
      const g = ctx.createGain();
      g.gain.value = gain || 0.07;
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    },
    play(name) {
      if (state.profile && state.profile.muted) return;
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
    $('#btn-sound').textContent = p.muted ? '🔇' : '🔊';
    renderHistory();
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
    list.innerHTML = hist.slice(0, 4).map((h) => (
      '<div class="history-row">' +
        '<span class="h-dot ' + (h.win ? 'win' : 'lose') + '"></span>' +
        '<span class="h-name">' + escapeHtml(h.name) + '</span>' +
        '<span class="h-res">' + (h.win ? 'победа' : 'поражение') + '</span>' +
        '<span class="h-delta ' + (h.delta >= 0 ? 'plus' : 'minus') + '">' + (h.delta >= 0 ? '+' : '') + h.delta + '</span>' +
      '</div>'
    )).join('');
  }

  function showScreen(name) {
    Object.keys({ menu: 1, online: 1, place: 1, battle: 1 }).forEach((key) => {
      const screen = $('#screen-' + key);
      if (screen) screen.classList.toggle('is-active', key === name);
    });
    state.screen = name;
    window.scrollTo(0, 0);
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
  function buildBoard(el) {
    el.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let y = 0; y < Engine.SIZE; y++) {
      for (let x = 0; x < Engine.SIZE; x++) {
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
    for (let y = 0; y < Engine.SIZE; y++) {
      for (let x = 0; x < Engine.SIZE; x++) {
        const cell = el.children[y * Engine.SIZE + x];
        cell.className = 'cell';
        cell.style.removeProperty('--sd');
        const id = board.grid[y][x];
        const ship = id >= 0 ? board.ships[id] : null;
        if (reveal && ship) applyShipLook(cell, ship, x, y);
        const shot = board.shots[y][x];
        if (shot === 'miss') cell.classList.add('miss');
        if (shot === 'hit') cell.classList.add('hit');
        if (ship && ship.sunk) cell.classList.add('sunk');
      }
    }
  }

  /* ---------------- Матч / расстановка ---------------- */
  function startMatch() {
    state.matchSeq += 1;
    state.botName = Engine.randomName();
    state.botRating = clamp(Math.round(state.profile.rating + randInt(-130, 130)), 250, 2600);
    state.botAvatar = ['🤖', '👾', '🦈', '🐙', '🦑', '🐡', '🦀'][randInt(0, 6)];
    state.bot = new Engine.Bot();
    state.enemyBoard = null;
    state.playerBoard = Engine.createBoard();
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = false;
    setupPlacement();
    showScreen('place');
    Sfx.play('start');
  }

  function setupPlacement() {
    state.placement = {
      size: 4,
      horizontal: true,
      erase: false,
      remaining: { 4: 1, 3: 2, 2: 3, 1: 4 }
    };
    state.ghost = [];
    buildBoard(boards.place);
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateRotateLabel();
    setErase(false);
    const oppRank = Engine.rankFor(state.botRating);
    $('#place-opp').textContent = 'Противник: ' + state.botName + ' · ' + state.botRating + ' (' + oppRank.name + ')';
    updateReady();
  }

  function totalLeft() {
    const r = state.placement.remaining;
    return r[4] + r[3] + r[2] + r[1];
  }

  function renderDock() {
    const dock = $('#dock-ships');
    const rem = state.placement.remaining;
    dock.innerHTML = '';
    [4, 3, 2, 1].forEach((size) => {
      const left = rem[size];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ship-chip' +
        (state.placement.size === size ? ' is-selected' : '') +
        (left <= 0 ? ' is-done' : '');
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
    const order = [4, 3, 2, 1];
    const rem = state.placement.remaining;
    state.placement.size = order.find((s) => rem[s] > 0) || null;
  }

  function updateReady() {
    const left = totalLeft();
    $('#btn-ready').disabled = left > 0;
    $('#place-hint').textContent = left
      ? 'Осталось расставить: ' + left
      : 'Флот готов — в бой!';
  }

  function updateRotateLabel() {
    $('#btn-rotate').textContent = state.placement.horizontal ? '↔️ Горизонтально' : '↕️ Вертикально';
  }

  function setErase(on) {
    if (!state.placement) return;
    state.placement.erase = on;
    $('#btn-erase').classList.toggle('is-active', on);
  }

  function clearGhost() {
    state.ghost.forEach((c) => c.classList.remove('ghost-ok', 'ghost-bad'));
    state.ghost = [];
  }

  function showGhost(x, y) {
    clearGhost();
    if (!state.placement.size) return;
    const { size, horizontal } = state.placement;
    const ok = Engine.canPlace(state.playerBoard, x, y, size, horizontal);
    for (let i = 0; i < size; i++) {
      const gx = x + (horizontal ? i : 0);
      const gy = y + (horizontal ? 0 : i);
      if (gx < 0 || gy < 0 || gx >= Engine.SIZE || gy >= Engine.SIZE) continue;
      const cell = boards.place.children[gy * Engine.SIZE + gx];
      cell.classList.add(ok ? 'ghost-ok' : 'ghost-bad');
      state.ghost.push(cell);
    }
  }

  function placeAt(x, y) {
    if (state.placement.erase) {
      const ship = Engine.removeShipAt(state.playerBoard, x, y);
      if (ship) {
        state.placement.remaining[ship.size] += 1;
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
    if (!Engine.canPlace(state.playerBoard, x, y, size, state.placement.horizontal)) {
      toast('Тут не помещается 😅', 'error');
      Sfx.play('error');
      return;
    }
    Engine.placeShip(state.playerBoard, x, y, size, state.placement.horizontal);
    state.placement.remaining[size] -= 1;
    selectNextSize();
    clearGhost();
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    Sfx.play('place');
  }

  function randomPlacement() {
    state.playerBoard = Engine.randomBoard();
    state.placement.remaining = { 4: 0, 3: 0, 2: 0, 1: 0 };
    state.placement.size = null;
    clearGhost();
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    Sfx.play('place');
  }

  function clearPlacement() {
    state.playerBoard = Engine.createBoard();
    state.placement.remaining = { 4: 1, 3: 2, 2: 3, 1: 4 };
    state.placement.size = 4;
    setErase(false);
    clearGhost();
    paintBoard(boards.place, state.playerBoard, true);
    renderDock();
    updateReady();
    Sfx.play('click');
  }

  /* ---------------- Бой ---------------- */
  function beginBattle() {
    state.enemyBoard = Engine.randomBoard();
    state.bot = new Engine.Bot();
    state.gameOver = false;
    state.locked = true;
    state.playerTurn = true;

    buildBoard(boards.enemy);
    buildBoard(boards.own);
    paintBoard(boards.enemy, state.enemyBoard, false);
    paintBoard(boards.own, state.playerBoard, true);

    const pRank = Engine.rankFor(state.profile.rating);
    $('#b-you-name').textContent = state.profile.name;
    $('#b-you-rate').textContent = Math.round(state.profile.rating) + ' · ' + pRank.name;
    $('#b-foe-name').textContent = state.botName;
    $('#b-foe-rate').textContent = state.botRating + ' · ' + Engine.rankFor(state.botRating).name;
    $('#b-you-avatar').textContent = pRank.icon;
    $('#b-foe-avatar').textContent = state.botAvatar;

    updateFleet();
    showScreen('battle');
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

  function startOnlineMatch(foe) {
    state.matchSeq += 1;
    state.mode = 'online';
    state.net = state.net || {};
    state.net.foeShips = 10;
    state.net.fleetSent = false;
    state.botName = (foe && foe.name) || 'Соперник';
    state.botRating = (foe && foe.rating) || 1000;
    state.botAvatar = '🌐';
    state.bot = null;
    state.enemyBoard = null;
    state.playerBoard = Engine.createBoard();
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
    $('#btn-ready').disabled = true;
    $('#place-hint').textContent = 'Ждём соперника…';
    $('#place-opp').textContent = 'Противник: ' + state.botName + ' · расставляется';
    toast('⏳ Ждём соперника', 'turn');
  }

  function beginOnlineBattle(first) {
    state.enemyBoard = Engine.createBoard();
    state.net.foeShips = 10;
    state.gameOver = false;
    state.locked = !first;
    state.playerTurn = !!first;

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
      const cell = targetEl.children[c.y * Engine.SIZE + c.x];
      if (!cell) return;
      cell.style.setProperty('--sd', (i * 70) + 'ms');
      applyShipLook(cell, ship, c.x, c.y);
      cell.classList.add('sunk', 'ship-reveal');
    });
  }

  function applyShotVisual(targetEl, x, y, result, shipCells) {
    const cell = targetEl.children[y * Engine.SIZE + x];
    if (!cell) return;
    cell.classList.remove('incoming');
    if (result === 'miss') {
      cell.classList.add('miss');
      Sfx.play('splash');
      return;
    }
    cell.classList.add('hit');
    if (result === 'sunk' && Array.isArray(shipCells)) {
      revealNetShip(targetEl, shipCells);
      Sfx.play('sunk');
      shake(true);
    } else {
      Sfx.play('boom');
      shake(false);
    }
  }

  function onNetShot(msg) {
    if (state.mode !== 'online' || !state.enemyBoard || !state.playerBoard) return;
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (x < 0 || y < 0 || x >= Engine.SIZE || y >= Engine.SIZE) return;

    if (msg.mine) {
      state.enemyBoard.shots[y][x] = msg.result === 'miss' ? 'miss' : 'hit';
      applyShotVisual(boards.enemy, x, y, msg.result, msg.ship);
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

    state.playerBoard.shots[y][x] = msg.result === 'miss' ? 'miss' : 'hit';
    applyShotVisual(boards.own, x, y, msg.result, msg.ship);
    updateFleet();
    if (msg.result === 'miss') toast('🌊 Соперник промахнулся', 'miss');
    else toast('💢 Соперник попал', 'miss');
  }

  function onNetTurn(msg) {
    if (state.mode !== 'online') return;
    state.playerTurn = !!msg.you;
    state.locked = !msg.you;
    setTurn(state.playerTurn);
    if (msg.you) {
      Sfx.play('turn');
      toast('🎯 Твой ход', 'turn');
    }
  }

  function leaveOnline(silent) {
    if (state.mode === 'online') {
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

  function wireOnlineEvents() {
    Online.on('room', (msg) => {
      state.net = state.net || {};
      state.net.code = msg.code;
      state.net.you = msg.you;
      $('#online-wait').hidden = false;
      $('#online-code').textContent = msg.code;
      $('#online-hint').textContent = 'Скинь код другу — ждём второго игрока…';
      setOnlineStatus('');
    });

    Online.on('wait', () => {
      setOnlineStatus('Комната создана. Ждём друга…');
    });

    Online.on('start', (msg) => {
      startOnlineMatch(msg.foe);
    });

    Online.on('begin', (msg) => {
      if (state.screen !== 'place') return;
      beginOnlineBattle(!!msg.first);
    });

    Online.on('shot', onNetShot);
    Online.on('turn', onNetTurn);

    Online.on('end', (msg) => {
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
      toast('⚠️ ' + text, 'miss');
      if (state.screen === 'online') setOnlineStatus(text, true);
    });

    Online.on('closed', () => {
      if (state.mode !== 'online' || state.gameOver) return;
      toast('📡 Связь с сервером потеряна', 'miss');
    });
  }


  function updateFleet() {
    if (!state.enemyBoard || !state.playerBoard) return;
    const online = state.mode === 'online';
    const foeLeft = online ? state.net.foeShips : Engine.shipsLeft(state.enemyBoard);
    const foeTotal = online ? 10 : Engine.totalShips(state.enemyBoard);
    $('#foe-fleet').textContent = foeLeft + ' / ' + foeTotal;
    $('#you-fleet').textContent = Engine.shipsLeft(state.playerBoard) + ' / ' + Engine.totalShips(state.playerBoard);
  }

  function setTurn(mine) {
    const pill = $('#turn-pill');
    pill.classList.remove('is-mine', 'is-bot');
    if (mine === null) {
      pill.textContent = 'БОЙ';
      return;
    }
    pill.classList.add(mine ? 'is-mine' : 'is-bot');
    pill.textContent = mine ? 'ТВОЙ ХОД' : (state.mode === 'online' ? 'ХОД СОПЕРНИКА' : 'ХОД БОТА');
    boards.enemy.classList.toggle('is-locked', !mine);
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
      const cell = targetEl.children[c.y * Engine.SIZE + c.x];
      cell.style.setProperty('--sd', (i * 70) + 'ms');
      applyShipLook(cell, ship, c.x, c.y);
      cell.classList.add('sunk', 'ship-reveal');
    });
  }

  async function doShot(targetEl, board, x, y) {
    const cell = targetEl.children[y * Engine.SIZE + x];
    if (!cell) return null;
    cell.classList.add('incoming');
    await sleep(190);
    cell.classList.remove('incoming');
    const shot = Engine.fire(board, x, y);
    if (!shot) return null;

    if (shot.result === 'miss') {
      cell.classList.add('miss');
      Sfx.play('splash');
    } else {
      cell.classList.add('hit');
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
    if (state.locked || !state.playerTurn || state.gameOver || !state.enemyBoard) return;
    if (state.enemyBoard.shots[y][x]) return;

    if (state.mode === 'online') {
      state.locked = true;
      Online.shot(x, y);
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
    updateFleet();

    if (Engine.allSunk(state.enemyBoard)) {
      endGame(true);
      return;
    }

    if (shot.result === 'miss') {
      toast('🌊 Мимо', 'miss');
      state.playerTurn = false;
      setTurn(false);
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

      const move = state.bot.choose();
      if (!move) break;

      const shot = await doShot(boards.own, state.playerBoard, move.x, move.y);
      if (seq !== state.matchSeq || state.gameOver) return;
      if (!shot) continue;

      state.bot.report(move.x, move.y, shot);
      updateFleet();

      if (Engine.allSunk(state.playerBoard)) {
        endGame(false);
        return;
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
    state.playerTurn = true;
    state.locked = false;
    setTurn(true);
    toast('🎯 Твой ход', 'turn');
    Sfx.play('turn');
  }

  /* ---------------- Конец боя ---------------- */
  async function endGame(playerWon, reason) {
    if (state.gameOver) return;
    const seq = state.matchSeq;
    state.gameOver = true;
    state.locked = true;
    state.playerTurn = false;

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

    if (state.mode === 'online') {
      const same = Math.round(state.profile.rating);
      showResult(playerWon, same, same, 0, reason);
      return;
    }

    const oldRating = Math.round(state.profile.rating);
    const delta = Engine.eloDelta(oldRating, Math.round(state.botRating), playerWon ? 1 : 0);
    const newRating = Math.max(0, oldRating + delta);

    const p = state.profile;
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
    p.history = [{
      name: state.botName,
      rating: Math.round(state.botRating),
      delta: delta,
      win: !!playerWon,
      ts: Date.now()
    }].concat(p.history || []).slice(0, 8);
    saveProfile();
    updateMenu();

    showResult(playerWon, oldRating, newRating, delta, reason);
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

  function showResult(win, oldRating, newRating, delta, reason) {
    const overlay = $('#overlay');
    overlay.classList.toggle('is-lose', !win);
    overlay.hidden = false;
    overlay.classList.remove('is-open');

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
    $('#btn-again').textContent = online ? '🔁 Новая комната' : '⚔️ Ещё бой';

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
  }

  function confetti() {
    const layer = $('#confetti');
    layer.innerHTML = '';
    const colors = ['#ffd166', '#35e0d2', '#ff6b5e', '#8b9cff', '#45e0a8', '#ff9ecd', '#7fe0ff'];
    for (let i = 0; i < 46; i++) {
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
    el.classList.remove('is-open');
    setTimeout(() => {
      el.hidden = true;
      el.classList.remove('is-lose');
    }, 340);
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
      updateMenu();
      showScreen('menu');
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
      state.profile.muted = !state.profile.muted;
      saveProfile();
      $('#btn-sound').textContent = state.profile.muted ? '🔇' : '🔊';
      if (!state.profile.muted) Sfx.play('click');
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
    $('#btn-rules-close').addEventListener('click', () => {
      Sfx.play('click');
      closeOverlay($('#modal-rules'));
    });
    $('#modal-rules').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeOverlay(e.currentTarget);
    });

    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('Сбросить рейтинг, статистику и историю боёв?')) return;
      const name = state.profile.name;
      const muted = state.profile.muted;
      state.profile = Object.assign(defaultProfile(), { name: name, muted: muted });
      saveProfile();
      updateMenu();
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
    boards.place.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      placeAt(Number(cell.dataset.x), Number(cell.dataset.y));
    });

    boards.place.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const cell = e.target.closest('.cell');
      if (!cell) { clearGhost(); return; }
      showGhost(Number(cell.dataset.x), Number(cell.dataset.y));
    });
    boards.place.addEventListener('pointerleave', clearGhost);
    boards.place.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleRotate();
    });

    $('#btn-rotate').addEventListener('click', () => { Sfx.play('click'); toggleRotate(); });
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
      beginBattle();
    });

    /* --- бой --- */
    boards.enemy.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      playerShoot(Number(cell.dataset.x), Number(cell.dataset.y));
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
      startMatch();
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
        if (state.screen === 'place') { toggleRotate(); Sfx.play('click'); }
      }
      if (e.key === 'Escape') {
        const modal = $('#modal-rules');
        if (!modal.hidden) closeOverlay(modal);
      }
    });

    document.addEventListener('pointerdown', () => {
      Sfx.init();
      Sfx.resume();
    }, { once: true });
  }

  function toggleRotate() {
    if (!state.placement) return;
    state.placement.horizontal = !state.placement.horizontal;
    updateRotateLabel();
    clearGhost();
  }

  /* ---------------- Старт ---------------- */
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
  makeBubbles();
  wireEvents();
  wireOnlineEvents();
  updateMenu();
  showScreen('menu');

  /* PWA: офлайн-режим и установка на домашний экран.
     На file:// service worker недоступен, в Capacitor он не нужен — пропускаем. */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js?v=' + SW_VERSION).catch(function () { /* не критично */ });
    });
  }

})();
