/* ============================================================
   Движок «Морского боя»: поле, флот, выстрелы, бот, ELO
   ============================================================ */
(function (global) {
  'use strict';

  const SIZE = 10;
  const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  // Адмиральский флот: тяжелее и плотнее.
  const ADMIRAL_FLEET = [5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1];
  const FLEETS = { classic: FLEET, admiral: ADMIRAL_FLEET };
  const SHIP_LABEL = { 5: 'Флагман', 4: 'Линкор', 3: 'Крейсер', 2: 'Эсминец', 1: 'Катер' };

  // Пресеты по размеру поля. Поле хранит размер, флот — просто длины.
  const CONFIG = {
    sizes: [8, 10, 12],
    default: 10,
    fleets: {
      8: { classic: [3, 2, 2, 2, 1, 1, 1], admiral: null },
      10: { classic: FLEET, admiral: ADMIRAL_FLEET },
      12: {
        classic: [5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1],
        admiral: [5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1]
      }
    }
  };

  function fleetsFor(size) {
    return CONFIG.fleets[size] || CONFIG.fleets[CONFIG.default];
  }

  function fleetFor(size, key) {
    const set = fleetsFor(size);
    return set[key] || null;
  }

  // Рейтинг — только за классический бой с ботом на 10×10 без тактики.
  function isRatedBattle(mode, config) {
    if (mode !== 'bot' || !config) return false;
    return Number(config.size) === 10 && !config.tactics;
  }

  // Испытание дня: конфиг один на всех и меняется по календарю.
  // Награда одна в день, поэтому кастомные настройки здесь не фарм.
  const DAILY_PRESETS = [
    { id: 'classic', name: 'Классика', desc: '10×10, классический флот, без тактики',
      config: { size: 10, fleet: 'classic', tactics: false } },
    { id: 'blitz', name: 'Блиц', desc: '8×8, классический флот, с тактикой',
      config: { size: 8, fleet: 'classic', tactics: true } },
    { id: 'small', name: 'Малый флот', desc: '8×8, классический флот, без тактики',
      config: { size: 8, fleet: 'classic', tactics: false } },
    { id: 'admiral', name: 'Адмирал', desc: '10×10, адмиральский флот, без тактики',
      config: { size: 10, fleet: 'admiral', tactics: false } },
    { id: 'big', name: 'Большое поле', desc: '12×12, классический флот, без тактики',
      config: { size: 12, fleet: 'classic', tactics: false } },
    { id: 'armada', name: 'Армада', desc: '12×12, адмиральский флот, с тактикой',
      config: { size: 12, fleet: 'admiral', tactics: true } }
  ];

  function dailyChallenge(key) {
    const text = String(key || '');
    let sum = 0;
    for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
    const p = DAILY_PRESETS[sum % DAILY_PRESETS.length];
    return { id: p.id, name: p.name, desc: p.desc, config: {
      size: p.config.size,
      fleet: p.config.fleet,
      tactics: p.config.tactics
    } };
  }

  // Кампания 1.7.0: 12 миссий, 3 акта по 4 миссии, 3 босса.
  // Модификаторы — только идентификаторы. Поведение появится на шагах 3–4.
  const CAMPAIGN_MODIFIERS = Object.freeze([
    'extra-ship', 'airstrike-only', 'single-deck-fleet', 'fog',
    'smoke', 'storm-refund', 'few-ships',
    'boss-double-turn', 'boss-aa', 'boss-smoke', 'boss-airstrike'
  ]);

  // stars — максимум звёзд за миссию. Фазы босса идут по убыванию порога `at`.
  const CAMPAIGN = [
    { id: 1, act: 1, title: 'Первый выход', size: 8, fleet: 'classic',
      bot: 'easy', mods: [], boss: null, stars: 5 },
    { id: 2, act: 1, title: 'Лишний корабль', size: 8, fleet: 'classic',
      bot: 'easy', mods: ['extra-ship'], boss: null, stars: 5 },
    { id: 3, act: 1, title: 'Авиаудар', size: 10, fleet: 'classic',
      bot: 'normal', mods: ['airstrike-only'], boss: null, stars: 5 },
    { id: 4, act: 1, title: 'Старый Пират', size: 10, fleet: 'classic',
      bot: 'hard', mods: ['boss-double-turn'],
      boss: { name: 'Старый Пират', phases: [
        { at: 100, mods: ['boss-double-turn'] },
        { at: 50, mods: ['boss-double-turn'] }
      ] }, stars: 5 },

    { id: 5, act: 2, title: 'Москитный флот', size: 10, fleet: 'classic',
      bot: 'normal', mods: ['single-deck-fleet'], boss: null, stars: 5 },
    { id: 6, act: 2, title: 'Туман войны', size: 10, fleet: 'classic',
      bot: 'normal', mods: ['fog'], boss: null, stars: 5 },
    { id: 7, act: 2, title: 'Дымовая завеса', size: 12, fleet: 'classic',
      bot: 'hard', mods: ['smoke'], boss: null, stars: 5 },
    { id: 8, act: 2, title: 'Адмирал Гроза', size: 12, fleet: 'classic',
      bot: 'hard', mods: ['boss-smoke'],
      boss: { name: 'Адмирал Гроза', phases: [
        { at: 100, mods: ['boss-smoke'] },
        { at: 50, mods: ['boss-smoke', 'boss-airstrike'] }
      ] }, stars: 5 },

    { id: 9, act: 3, title: 'Штормовой отлив', size: 10, fleet: 'classic',
      bot: 'hard', mods: ['storm-refund'], boss: null, stars: 5 },
    { id: 10, act: 3, title: 'Три корабля', size: 10, fleet: 'classic',
      bot: 'hard', mods: ['few-ships'], boss: null, stars: 5 },
    { id: 11, act: 3, title: 'Ледяная армада', size: 12, fleet: 'admiral',
      bot: 'hard', mods: [], boss: null, stars: 5 },
    { id: 12, act: 3, title: 'Ледяной Король', size: 12, fleet: 'admiral',
      bot: 'hard', mods: ['boss-aa', 'boss-smoke', 'boss-airstrike'],
      boss: { name: 'Ледяной Король', phases: [
        { at: 100, mods: ['boss-smoke'] },
        { at: 66, mods: ['boss-airstrike'] },
        { at: 33, mods: ['boss-double-turn'] }
      ] }, stars: 5 }
  ];

  function campaignById(id) {
    const n = Number(id);
    for (const mission of CAMPAIGN) {
      if (mission.id === n) return mission;
    }
    return null;
  }

  function campaignCompleted(progress, id) {
    if (!progress) return false;
    if (Array.isArray(progress)) {
      return progress.some((item) => {
        if (Number(item) === id) return true;
        if (!item || typeof item !== 'object') return false;
        return Number(item.id) === id &&
          (item.completed === true || item.done === true || Number(item.stars) > 0);
      });
    }
    if (typeof progress !== 'object') return false;

    const direct = progress[id];
    if (direct === true) return true;
    if (typeof direct === 'number') return direct > 0;
    if (direct && typeof direct === 'object') {
      if (direct.completed === true || direct.done === true || Number(direct.stars) > 0) return true;
    }

    const completed = progress.completed;
    if (Array.isArray(completed)) {
      if (completed.some((v) => Number(v) === id)) return true;
    } else if (completed && typeof completed === 'object') {
      const v = completed[id];
      if (v === true || Number(v) > 0) return true;
      if (v && typeof v === 'object' &&
        (v.completed === true || v.done === true || Number(v.stars) > 0)) return true;
    }

    const missions = progress.missions;
    if (Array.isArray(missions)) {
      if (missions.some((v) => Number(v) === id)) return true;
    } else if (missions && typeof missions === 'object') {
      const m = missions[id];
      if (m === true || Number(m) > 0) return true;
      if (m && typeof m === 'object' &&
        (m.completed === true || m.done === true || Number(m.stars) > 0)) return true;
    }

    const stars = progress.stars;
    if (stars && typeof stars === 'object' && Number(stars[id]) > 0) return true;
    return false;
  }

  // Первая миссия открыта всегда, следующая — только после прохождения предыдущей.
  function campaignUnlocked(progress, id) {
    const mission = campaignById(id);
    if (!mission) return false;
    if (mission.id === 1) return true;
    return campaignCompleted(progress, mission.id - 1);
  }

  // Победа без потерь — 5, победа с потерями — 3, поражение — 0.
  // Поражение можно передать явно через won/win/victory === false или result: 'loss'.
  function campaignStars(result) {
    const r = result && typeof result === 'object' ? result : {};
    let won;
    if (typeof r.won === 'boolean') won = r.won;
    else if (typeof r.win === 'boolean') won = r.win;
    else if (typeof r.victory === 'boolean') won = r.victory;
    else if (typeof r.result === 'string') won = ['win', 'won', 'victory'].indexOf(r.result.toLowerCase()) >= 0;

    if (won === undefined && r.shots && typeof r.shots === 'object' && !Array.isArray(r.shots)) {
      const s = r.shots;
      if (typeof s.won === 'boolean') won = s.won;
      else if (typeof s.win === 'boolean') won = s.win;
      else if (typeof s.result === 'string') {
        won = ['win', 'won', 'victory'].indexOf(s.result.toLowerCase()) >= 0;
      }
    }

    if (won === undefined) won = r.lostShips !== null && r.lostShips !== undefined;
    if (!won) return 0;

    const lost = r.lostShips;
    let count = 0;
    if (Array.isArray(lost)) count = lost.length;
    else if (lost && typeof lost === 'object') count = Object.keys(lost).length;
    else count = Math.max(0, Number(lost) || 0);
    return count === 0 ? 5 : 3;
  }

  function campaignHasMod(mission, id) {
    return !!(mission && Array.isArray(mission.mods) && mission.mods.indexOf(id) >= 0);
  }

  // Флот игрока в миссии: модификаторы меняют состав до расстановки.
  function campaignPlayerFleet(mission) {
    if (!mission) return FLEET.slice();
    const base = (fleetFor(mission.size, mission.fleet) || FLEET).slice();
    if (campaignHasMod(mission, 'single-deck-fleet')) {
      return base.map(() => 1);
    }
    if (campaignHasMod(mission, 'few-ships')) {
      return [3, 2, 1];
    }
    return base;
  }

  // Флот бота: extra-ship добавляет самый маленький корабль.
  function campaignBotFleet(mission) {
    if (!mission) return FLEET.slice();
    const base = (fleetFor(mission.size, mission.fleet) || FLEET).slice();
    if (campaignHasMod(mission, 'extra-ship')) base.push(1);
    return base;
  }

  // Лоадаут игрока: airstrike-only оставляет только авиаудар,
  // smoke гарантирует дым у игрока.
  function campaignLoadout(mission, base) {
    const source = Array.isArray(base) ? base.filter((id) => ABILITIES[id]) : [];
    if (campaignHasMod(mission, 'airstrike-only')) return ['airstrike'];
    const out = source.slice(0, 2);
    if (campaignHasMod(mission, 'smoke') && out.indexOf('smoke') < 0) {
      if (out.length >= 2) out[1] = 'smoke';
      else out.push('smoke');
    }
    return out;
  }

  // Способности бота: обычный дым плюс способности текущей фазы босса.
  function campaignBotLoadout(mission, phase) {
    if (!mission) return [];
    const out = [];
    const add = (id) => {
      if (ABILITIES[id] && out.indexOf(id) < 0) out.push(id);
    };
    if (campaignHasMod(mission, 'smoke')) add('smoke');
    for (const id of campaignBossMods(mission, phase || 1)) {
      if (id === 'boss-smoke') add('smoke');
      if (id === 'boss-airstrike') add('airstrike');
      if (id === 'boss-aa') add('aa');
    }
    return out;
  }

  // Фаза босса по доле оставшихся кораблей: 100% → 1, ниже порога → 2/3.
  function campaignBossPhase(mission, shipsLeft, totalShips) {
    const boss = mission && mission.boss;
    if (!boss || !Array.isArray(boss.phases) || !boss.phases.length) return 1;
    const total = Math.max(1, Number(totalShips) || 0);
    const left = Math.max(0, Math.min(total, Number(shipsLeft) || 0));
    const pct = left / total * 100;
    const phases = boss.phases.slice().sort((a, b) => Number(b.at) - Number(a.at));
    let phase = 1;
    for (let i = 1; i < phases.length; i++) {
      if (pct <= Number(phases[i].at)) phase = i + 1;
    }
    return Math.max(1, Math.min(3, phase));
  }

  // Модификаторы босса накапливаются: способности прошлых фаз не исчезают.
  // ПВО действует с первой фазы, остальные boss-* открываются по фазам.
  function campaignBossMods(mission, phase) {
    const boss = mission && mission.boss;
    if (!boss || !Array.isArray(boss.phases)) return [];
    const upto = Math.max(1, Math.min(3, Number(phase) || 1));
    const out = [];
    const add = (id) => {
      if (typeof id === 'string' && id.indexOf('boss-') === 0 && out.indexOf(id) < 0) out.push(id);
    };
    if (campaignHasMod(mission, 'boss-aa')) add('boss-aa');
    boss.phases.slice(0, upto).forEach((p) => {
      (p.mods || []).forEach(add);
    });
    return out;
  }

  function campaignHasBossMod(mission, id, phase) {
    return campaignBossMods(mission, phase || 1).indexOf(id) >= 0;
  }

  // Туман: несколько случайных клеток врага скрыты до первого выстрела.
  function campaignFogCells(board, count) {
    const n = (board && board.size) || SIZE;
    const cells = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push({ x: x, y: y });
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = cells[i];
      cells[i] = cells[j];
      cells[j] = tmp;
    }
    return cells.slice(0, Math.max(0, Math.min(cells.length, Number(count) || 5)));
  }

  // Каждый пятый промах в «Штормовом отливе» не передаёт ход.
  function campaignStormRefund(mission, missCount) {
    return campaignHasMod(mission, 'storm-refund') &&
      Number(missCount) > 0 && Number(missCount) % 5 === 0;
  }

  function campaignNextId(id) {
    const mission = campaignById(id);
    if (!mission) return 0;
    return campaignById(mission.id + 1) ? mission.id + 1 : 0;
  }

  // Чистый расчёт прогресса: звёзды только растут, победа закрывает миссию.
  function campaignRecord(progress, id, result) {
    const src = progress && typeof progress === 'object' ? progress : {};
    const mission = campaignById(id);
    if (!mission) return src;
    const stars = campaignStars(result);
    const completed = [];
    if (Array.isArray(src.completed)) {
      src.completed.forEach((value) => {
        const n = Math.round(Number(value && typeof value === 'object' ? value.id : value));
        if (n >= 1 && completed.indexOf(n) < 0) completed.push(n);
      });
    }
    const starMap = {};
    if (src.stars && typeof src.stars === 'object' && !Array.isArray(src.stars)) {
      Object.keys(src.stars).forEach((key) => {
        const n = Math.round(Number(key));
        const v = Math.max(0, Math.min(5, Number(src.stars[key]) || 0));
        if (n >= 1 && v > 0) {
          starMap[n] = v;
          if (completed.indexOf(n) < 0) completed.push(n);
        }
      });
    }
    if (stars > 0) {
      if (completed.indexOf(mission.id) < 0) completed.push(mission.id);
      starMap[mission.id] = Math.max(starMap[mission.id] || 0, stars);
    }
    completed.sort((a, b) => a - b);
    return { completed: completed, stars: starMap, lastId: mission.id };
  }

  // Ежедневная миссия: детерминированный выбор из пройденных миссий.
  function campaignDayValue(dayKey) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ''));
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function campaignDailySeed(dayKey) {
    let hash = 2166136261;
    const text = String(dayKey || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function campaignDaily(dayKey, progress) {
    const done = CAMPAIGN.filter((m) => campaignCompleted(progress, m.id)).map((m) => m.id);
    const pool = done.length ? done : CAMPAIGN.map((m) => m.id);
    const seed = campaignDailySeed(dayKey);
    const mission = campaignById(pool[seed % pool.length]);
    return { id: mission.id, mods: mission.mods.slice(), seed: seed };
  }

  function campaignDailyProgress(profile) {
    if (!profile || typeof profile !== 'object') return null;
    if (profile.campaign && profile.campaign.daily &&
      typeof profile.campaign.daily === 'object') return profile.campaign.daily;
    if (profile.campaignDaily && typeof profile.campaignDaily === 'object') {
      return profile.campaignDaily;
    }
    if (profile.daily && profile.daily.campaign &&
      typeof profile.daily.campaign === 'object') return profile.daily.campaign;
    return null;
  }

  function campaignDailyReward(dayKey, profile) {
    const daily = campaignDailyProgress(profile);
    if (daily && String(daily.rewardDate || '') === String(dayKey || '')) return 0;
    return 30;
  }

  function campaignDailyStreak(profile, dayKey) {
    const daily = campaignDailyProgress(profile);
    if (!daily) return 0;
    const streak = Math.max(0, Math.floor(Number(daily.streak) || 0));
    if (!streak) return 0;
    const today = campaignDayValue(dayKey);
    const last = campaignDayValue(daily.date);
    if (!isFinite(today) || !isFinite(last)) return 0;
    const days = Math.round((today - last) / 86400000);
    if (days === 0 || days === 1) return streak;
    return 0;
  }

  function createBoard(size) {
    const n = CONFIG.sizes.indexOf(size) >= 0 ? size : SIZE;
    return {
      size: n,
      grid: Array.from({ length: n }, () => new Array(n).fill(-1)),
      shots: Array.from({ length: n }, () => new Array(n).fill(null)),
      ships: [],
      smoke: []
    };
  }

  function inBounds(size, x, y) {
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function canPlace(board, x, y, size, horizontal) {
    for (let i = 0; i < size; i++) {
      const cx = x + (horizontal ? i : 0);
      const cy = y + (horizontal ? 0 : i);
      if (!inBounds(board.size, cx, cy)) return false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(board.size, nx, ny)) continue;
          if (board.grid[ny][nx] !== -1) return false;
        }
      }
    }
    return true;
  }

  function placeShip(board, x, y, size, horizontal) {
    if (!canPlace(board, x, y, size, horizontal)) return null;
    const ship = {
      id: board.ships.length,
      size,
      horizontal: !!horizontal,
      cells: [],
      hits: 0,
      sunk: false
    };
    for (let i = 0; i < size; i++) {
      const cx = x + (horizontal ? i : 0);
      const cy = y + (horizontal ? 0 : i);
      board.grid[cy][cx] = ship.id;
      ship.cells.push({ x: cx, y: cy });
    }
    board.ships.push(ship);
    return ship;
  }

  function rebuild(board) {
    const list = board.ships.filter(Boolean);
    const n = board.size;
    board.grid = Array.from({ length: n }, () => new Array(n).fill(-1));
    list.forEach((ship, i) => {
      ship.id = i;
      for (const c of ship.cells) board.grid[c.y][c.x] = i;
    });
    board.ships = list;
  }

  function removeShipAt(board, x, y) {
    if (!inBounds(board.size, x, y)) return null;
    const id = board.grid[y][x];
    if (id < 0) return null;
    const ship = board.ships[id];
    if (!ship) return null;
    for (const c of ship.cells) board.grid[c.y][c.x] = -1;
    board.ships[id] = null;
    rebuild(board);
    return ship;
  }

  function shipAt(board, x, y) {
    if (!inBounds(board.size, x, y)) return null;
    const id = board.grid[y][x];
    return id >= 0 ? board.ships[id] || null : null;
  }

  function canPlaceCells(board, cells, ignoreShipId) {
    const ignore = typeof ignoreShipId === 'number' ? ignoreShipId : -1;
    for (const c of cells) {
      if (!inBounds(board.size, c.x, c.y)) return false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (!inBounds(board.size, nx, ny)) continue;
          const id = board.grid[ny][nx];
          if (id !== -1 && id !== ignore) return false;
        }
      }
    }
    return true;
  }

  function rotateShip(board, shipId, dir) {
    const ship = board.ships[shipId];
    if (!ship) return { ok: false, reason: 'missing' };
    if (ship.size <= 1) return { ok: true, ship };

    const xs = ship.cells.map((c) => c.x);
    const ys = ship.cells.map((c) => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const wasHorizontal = ship.horizontal;

    const cells = [];
    for (let i = 0; i < ship.size; i++) {
      cells.push(wasHorizontal
        ? { x: minX, y: minY + i }
        : { x: minX + i, y: minY });
    }

    // сдвигаем линию внутрь поля, если она вылезла за край
    const n = board.size;
    const overflowY = Math.max(0, (minY + ship.size) - n);
    const overflowX = Math.max(0, (minX + ship.size) - n);
    for (const c of cells) {
      c.y -= overflowY;
      c.x -= overflowX;
    }

    if (!canPlaceCells(board, cells, shipId)) return { ok: false, reason: 'collision' };

    for (const c of ship.cells) board.grid[c.y][c.x] = -1;
    ship.cells = cells;
    ship.horizontal = !wasHorizontal;
    if (dir === 'left') ship.cells.reverse();
    for (const c of cells) board.grid[c.y][c.x] = shipId;
    return { ok: true, ship };
  }

  function randomBoard(fleet, size) {
    const n = CONFIG.sizes.indexOf(size) >= 0 ? size : SIZE;
    const sizes = (Array.isArray(fleet) && fleet.length ? fleet : FLEET)
      .slice().sort((a, b) => b - a);
    // плотный флот ставится труднее — даём больше попыток
    const attempts = sizes.length > 10 ? 900 : 400;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const board = createBoard(n);
      let ok = true;
      for (const size of sizes) {
        let placed = false;
        for (let t = 0; t < 500; t++) {
          const horizontal = Math.random() < 0.5;
          const maxX = n - (horizontal ? size : 1);
          const maxY = n - (horizontal ? 1 : size);
          const x = Math.floor(Math.random() * (maxX + 1));
          const y = Math.floor(Math.random() * (maxY + 1));
          if (canPlace(board, x, y, size, horizontal)) {
            placeShip(board, x, y, size, horizontal);
            placed = true;
            break;
          }
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return board;
    }
    return createBoard(n);
  }

  function fireCell(board, x, y) {
    if (board.shots[y][x]) return null;
    const id = board.grid[y][x];
    if (id < 0) {
      board.shots[y][x] = 'miss';
      return { x, y, result: 'miss' };
    }
    board.shots[y][x] = 'hit';
    const ship = board.ships[id];
    if (!ship) return { x, y, result: 'miss' };
    ship.hits += 1;
    if (ship.hits >= ship.size) {
      ship.sunk = true;
      return { x, y, result: 'sunk', ship };
    }
    return { x, y, result: 'hit', ship };
  }

  function fire(board, x, y) {
    if (!inBounds(board.size, x, y)) return null;
    if (board.shots[y][x]) return null;
    if (smokeBlocks(board, x, y)) return null;
    return fireCell(board, x, y);
  }

  /* ---------------- Способности ---------------- */

  const ABILITIES = {
    airstrike: {
      id: 'airstrike',
      name: 'Авиаудар',
      icon: '✈️',
      desc: 'Бьёт по площади 3×3 (на 8×8 — 2×2). Каждая клетка — обычный выстрел.'
    },
    aa: {
      id: 'aa',
      name: 'ПВО',
      icon: '🛡️',
      desc: 'Сбивает первый авиаудар соперника: бьёт только центр.'
    },
    smoke: {
      id: 'smoke',
      name: 'Дым',
      icon: '💨',
      desc: 'Дым на 3 хода: зона 3×3 (на 8×8 — 2×2), соперник не может в неё стрелять.'
    }
  };

  // На 8×8 способности занимают 2×2, на большом поле — 3×3.
  function abilitySide(size) {
    return size === 8 ? 2 : 3;
  }

  function areaCells(size, side, x, y) {
    if (x < 0 || y < 0 || x >= size || y >= size) return [];
    const cells = [];
    if (side === 2) {
      const ax = Math.max(0, Math.min(size - 2, x));
      const ay = Math.max(0, Math.min(size - 2, y));
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) cells.push({ x: ax + dx, y: ay + dy });
      }
      return cells;
    }
    // 3×3: якорь — центр, область не обрезается
    if (x < 1 || y < 1 || x > size - 2 || y > size - 2) return [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) cells.push({ x: x + dx, y: y + dy });
    }
    return cells;
  }

  function newAbilityState(ids) {
    const out = {};
    for (const id of ids || []) if (ABILITIES[id]) out[id] = 1;
    return out;
  }

  function airstrike(board, x, y) {
    const cells = areaCells(board.size, abilitySide(board.size), x, y);
    if (!cells.length) return { ok: false, reason: 'bounds' };
    const hit = [];
    for (const c of cells) {
      const r = fireCell(board, c.x, c.y);
      if (r) hit.push(r);
    }
    if (!hit.length) return { ok: false, reason: 'empty' };
    return { ok: true, cells: hit };
  }

  function placeSmoke(board, x, y) {
    const cells = areaCells(board.size, abilitySide(board.size), x, y);
    if (!cells.length) return { ok: false, reason: 'bounds' };
    const free = cells.filter((c) => !board.shots[c.y][c.x]);
    if (!free.length) return { ok: false, reason: 'empty' };
    board.smoke.push({ cells, turnsLeft: 3 });
    return { ok: true, cells, turnsLeft: 3 };
  }

  function smokeBlocks(board, x, y) {
    return (board.smoke || []).some((z) => z.turnsLeft > 0 &&
      z.cells.some((c) => c.x === x && c.y === y));
  }

  function smokeCells(board) {
    const out = [];
    for (const z of board.smoke || []) {
      for (const c of z.cells) out.push({ x: c.x, y: c.y, turnsLeft: z.turnsLeft });
    }
    return out;
  }

  function tickSmoke(board) {
    if (!board.smoke || !board.smoke.length) return 0;
    let removed = 0;
    for (const z of board.smoke) {
      z.turnsLeft -= 1;
      if (z.turnsLeft <= 0) removed += 1;
    }
    board.smoke = board.smoke.filter((z) => z.turnsLeft > 0);
    return removed;
  }

  function legalShots(board) {
    const out = [];
    for (let y = 0; y < board.size; y++) {
      for (let x = 0; x < board.size; x++) {
        if (!board.shots[y][x] && !smokeBlocks(board, x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  function allSunk(board) {
    if (!board.ships.length) return false;
    return board.ships.every((s) => s && s.sunk);
  }

  function shipsLeft(board) {
    return board.ships.filter((s) => s && !s.sunk).length;
  }

  function totalShips(board) {
    return board.ships.filter(Boolean).length;
  }

  /* ---------------- Бот ---------------- */
  const BOT_LEVELS = ['easy', 'normal', 'hard'];

  class Bot {
    constructor(level) {
      this.level = BOT_LEVELS.indexOf(level) >= 0 ? level : 'normal';
      this.size = SIZE;
      this.tried = new Set();
      this.excluded = new Set();
      this.queue = [];
      this.queued = new Set();
      this.hits = new Set();
    }
    key(x, y) { return x + ',' + y; }
    keyOf(cell) { return cell.x + ',' + cell.y; }
    in(x, y) { return inBounds(this.size, x, y); }
    add(x, y, front) {
      if (!this.in(x, y)) return;
      const k = this.key(x, y);
      if (this.tried.has(k) || this.excluded.has(k) || this.queued.has(k)) return;
      this.queued.add(k);
      if (front) this.queue.unshift(k);
      else this.queue.push(k);
    }
    free(x, y) {
      if (!this.in(x, y)) return false;
      const k = this.key(x, y);
      return !this.tried.has(k) && !this.excluded.has(k);
    }
    freeCells() {
      const out = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) if (this.free(x, y)) out.push({ x, y });
      }
      return out;
    }
    // «Сложно»: выбираем клетку, где помещается больше всего вариантов
    // оставшихся кораблей — так бот быстрее находит флот.
    density(x, y, sizes) {
      let score = 0;
      for (const size of sizes) {
        for (let dir = 0; dir < 2; dir++) {
          const horiz = dir === 0;
          for (let i = 0; i < size; i++) {
            const sx = x - (horiz ? i : 0);
            const sy = y - (horiz ? 0 : i);
            let fits = true;
            for (let j = 0; j < size; j++) {
              const cx = sx + (horiz ? j : 0);
              const cy = sy + (horiz ? 0 : j);
              if (!this.free(cx, cy)) { fits = false; break; }
            }
            if (fits) score++;
          }
        }
      }
      return score;
    }
    choose(board) {
      if (board && board.size) this.size = board.size;
      // «Легко»: просто случайные выстрелы, без добивания
      if (this.level === 'easy') {
        const pool = this.freeCells();
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      }
      while (this.queue.length) {
        const k = this.queue.shift();
        this.queued.delete(k);
        if (this.tried.has(k) || this.excluded.has(k)) continue;
        const p = k.split(',');
        return { x: Number(p[0]), y: Number(p[1]) };
      }
      const even = [];
      const any = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const k = this.key(x, y);
          if (this.tried.has(k) || this.excluded.has(k)) continue;
          any.push({ x, y });
          if ((x + y) % 2 === 0) even.push({ x, y });
        }
      }
      const pool = even.length ? even : any;
      if (!pool.length) return null;
      if (this.level === 'hard' && board) {
        const sizes = board.ships.filter((s) => s && !s.sunk).map((s) => s.size);
        let best = -1;
        let pick = null;
        for (const c of pool) {
          const score = this.density(c.x, c.y, sizes);
          if (score > best) { best = score; pick = c; }
        }
        if (pick && best > 0) return pick;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }
    report(x, y, shot) {
      const k = this.key(x, y);
      this.tried.add(k);
      if (!shot || shot.result === 'miss') return;
      this.hits.add(k);

      if (shot.result === 'sunk') {
        for (const c of shot.ship.cells) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (this.in(c.x + dx, c.y + dy)) this.excluded.add(this.key(c.x + dx, c.y + dy));
            }
          }
        }
        this.queue = [];
        this.queued.clear();
        return;
      }

      if (this.level === 'easy') return; // доблестный рандом

      const L = this.hits.has(this.key(x - 1, y));
      const R = this.hits.has(this.key(x + 1, y));
      const U = this.hits.has(this.key(x, y - 1));
      const D = this.hits.has(this.key(x, y + 1));

      if ((L || R) && !(U || D)) {
        let l = x;
        let r = x;
        while (this.hits.has(this.key(l - 1, y))) l--;
        while (this.hits.has(this.key(r + 1, y))) r++;
        this.add(l - 1, y, true);
        this.add(r + 1, y, true);
      } else if ((U || D) && !(L || R)) {
        let t = y;
        let b = y;
        while (this.hits.has(this.key(x, t - 1))) t--;
        while (this.hits.has(this.key(x, b + 1))) b++;
        this.add(x, t - 1, true);
        this.add(x, b + 1, true);
      } else {
        this.add(x - 1, y, true);
        this.add(x + 1, y, true);
        this.add(x, y - 1, true);
        this.add(x, y + 1, true);
      }
    }
  }

  /* ---------------- Рейтинг ---------------- */
  const RANKS = [
    { min: 0, name: 'Юнга', icon: '🪝', color: '#93a9bd' },
    { min: 900, name: 'Матрос', icon: '⚓', color: '#59c3ef' },
    { min: 1100, name: 'Боцман', icon: '🧭', color: '#45e0a8' },
    { min: 1300, name: 'Штурман', icon: '🗺️', color: '#8b9cff' },
    { min: 1500, name: 'Капитан', icon: '⚔️', color: '#c08bff' },
    { min: 1700, name: 'Адмирал', icon: '👑', color: '#ffb35c' },
    { min: 1900, name: 'Легенда', icon: '🔥', color: '#ff7d9c' }
  ];

  function rankFor(rating) {
    let out = RANKS[0];
    for (const r of RANKS) if (rating >= r.min) out = r;
    return out;
  }

  function nextRank(rating) {
    return RANKS.find((r) => r.min > rating) || null;
  }

  function eloExpected(my, opp) {
    return 1 / (1 + Math.pow(10, (opp - my) / 400));
  }

  function eloDelta(my, opp, score, k) {
    const K = k || 32;
    return Math.round(K * (score - eloExpected(my, opp)));
  }

  const NAMES = [
    'Капитан Кракен', 'Боцман Бублик', 'Адмирал Пельмень', 'Юнга Шпрот',
    'Штурман Компас', 'Матрос Тюлень', 'Капитан Ржавый', 'Боцман Борщ',
    'Адмирал Кальмар', 'Юнга Пузырь', 'Штурман Чайка', 'Матрос Осьминог',
    'Капитан Шторм', 'Боцман Якорь', 'Адмирал Акула', 'Юнга Карась',
    'Штурман Мираж', 'Матрос Волна', 'Капитан Гроза', 'Боцман Клевер',
    'Адмирал Медуза', 'Юнга Плотва', 'Штурман Туман', 'Матрос Ракушка'
  ];

  function randomName() {
    return NAMES[Math.floor(Math.random() * NAMES.length)];
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  global.Engine = {
    SIZE, FLEET, FLEETS, SHIP_LABEL, RANKS, CONFIG,
    fleetsFor, fleetFor, isRatedBattle, DAILY_PRESETS, dailyChallenge,
    CAMPAIGN, CAMPAIGN_MODIFIERS, campaignById, campaignStars, campaignUnlocked,
    campaignHasMod, campaignPlayerFleet, campaignBotFleet, campaignLoadout,
    campaignBotLoadout, campaignBossPhase, campaignBossMods, campaignHasBossMod,
    campaignFogCells, campaignStormRefund, campaignNextId, campaignRecord,
    campaignDaily, campaignDailyReward, campaignDailyStreak,
    createBoard, inBounds, canPlace, placeShip, removeShipAt, randomBoard,
    shipAt, canPlaceCells, rotateShip,
    fire, allSunk, shipsLeft, totalShips,
    ABILITIES, abilitySide, areaCells, newAbilityState,
    airstrike, placeSmoke, smokeBlocks, smokeCells, tickSmoke, legalShots,
    Bot, rankFor, nextRank, eloExpected, eloDelta,
    NAMES, randomName, clamp
  };
})(window);
