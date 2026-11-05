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
      desc: 'Бьёт по площади 3×3. Каждая клетка — обычный выстрел.'
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
      desc: 'Дым на 3 хода: соперник не может стрелять в эту зону.'
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
    fleetsFor, fleetFor, isRatedBattle,
    createBoard, inBounds, canPlace, placeShip, removeShipAt, randomBoard,
    shipAt, canPlaceCells, rotateShip,
    fire, allSunk, shipsLeft, totalShips,
    ABILITIES, abilitySide, areaCells, newAbilityState,
    airstrike, placeSmoke, smokeBlocks, smokeCells, tickSmoke, legalShots,
    Bot, rankFor, nextRank, eloExpected, eloDelta,
    NAMES, randomName, clamp
  };
})(window);
