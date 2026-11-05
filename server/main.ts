/* ============================================================
   Сервер «Морского боя»: комнаты по коду, 2 игрока, WebSocket.
   Считает попадания он — клиенты видят только свои корабли.
   Персональные данные не хранит: комнаты и топ побед живут в памяти.
   Запуск локально:  deno run --allow-net --allow-env server/main.ts
   Деплой:           https://console.deno.com → приложение mensori-seabattle
   ============================================================ */

type Cell = [number, number];
type ShipIn = { size: number; cells: Cell[] };

interface Ship {
  size: number;
  cells: Cell[];
  hits: number;
  sunk: boolean;
}

interface BattleConfig {
  size: 8 | 10 | 12;
  fleet: 'classic' | 'admiral';
  tactics: boolean;
}

interface SmokeZone {
  cells: Cell[];
  turnsLeft: number;
}

interface Board {
  size: number;
  grid: number[][];
  shots: number[][];
  ships: Ship[];
  smoke: SmokeZone[];
}

interface Player {
  ws: WebSocket;
  name: string;
  rating: number;
  board: Board | null;
  loadout: string[] | null;
  hintLoadout: string[];
}

interface Room {
  code: string;
  config: BattleConfig;
  players: Player[];
  turn: number;
  started: boolean;
  createdAt: number;
  charges: Record<string, number>[];
  loadoutTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_SIZE = 10;
const CONFIG_SIZES = [8, 10, 12];
// Те же пресеты, что в js/engine.js (CONFIG.fleets).
const FLEETS: Record<number, Record<string, number[] | null>> = {
  8: { classic: [3, 2, 2, 2, 1, 1, 1], admiral: null },
  10: {
    classic: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
    admiral: [5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1]
  },
  12: {
    classic: [5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1],
    admiral: [5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1]
  }
};
const ROOM_TTL = 2 * 60 * 60 * 1000; // 2 часа
const rooms = new Map<string, Room>();

function normalizeConfig(raw: unknown): BattleConfig | null {
  // Без настроек — привычная классика 10×10 без тактики.
  if (raw === undefined || raw === null) return { size: 10, fleet: 'classic', tactics: false };
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const size = Number(r.size);
  if (CONFIG_SIZES.indexOf(size) < 0) return null;
  const fleet = String(r.fleet || 'classic');
  const set = FLEETS[size];
  if (!set || !set[fleet]) return null;
  return { size: size as 8 | 10 | 12, fleet: fleet as 'classic' | 'admiral', tactics: !!r.tactics };
}

function isClassicRoom(config: BattleConfig): boolean {
  return config.size === 10 && config.fleet === 'classic' && !config.tactics;
}

function fleetFor(config: BattleConfig): number[] | null {
  const set = FLEETS[config.size];
  return set ? set[config.fleet] : null;
}

/* ---------------- Доска ---------------- */

function buildBoard(input: unknown, config: BattleConfig): Board | null {
  const fleet = fleetFor(config);
  if (!fleet) return null;
  if (!Array.isArray(input) || input.length !== fleet.length) return null;
  const shipsIn = input as ShipIn[];
  const want = fleet.slice().sort((a, b) => a - b).join(',');
  const got = shipsIn.map((s) => Number(s && s.size)).sort((a, b) => a - b).join(',');
  if (want !== got) return null;

  const maxShip = Math.max(...fleet);
  const grid = Array.from({ length: config.size }, () => new Array<number>(config.size).fill(-1));
  const shots = Array.from({ length: config.size }, () => new Array<number>(config.size).fill(0));
  const ships: Ship[] = [];

  for (const raw of shipsIn) {
    if (!raw || !Array.isArray(raw.cells)) return null;
    const size = Number(raw.size);
    if (!Number.isInteger(size) || size < 1 || size > maxShip) return null;
    if (raw.cells.length !== size) return null;
    const cells: Cell[] = [];
    for (const c of raw.cells) {
      if (!Array.isArray(c) || c.length !== 2) return null;
      const x = Number(c[0]);
      const y = Number(c[1]);
      if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
      if (x < 0 || y < 0 || x >= config.size || y >= config.size) return null;
      if (grid[y][x] !== -1) return null;
      // корабли не должны касаться даже углами
      for (const ship of ships) {
        for (const other of ship.cells) {
          if (Math.abs(other[0] - x) <= 1 && Math.abs(other[1] - y) <= 1) return null;
        }
      }
      grid[y][x] = ships.length;
      cells.push([x, y]);
    }
    // корабль должен быть ровной линией без разрывов
    const xs = cells.map((c) => c[0]).sort((a, b) => a - b);
    const ys = cells.map((c) => c[1]).sort((a, b) => a - b);
    const sameRow = ys[0] === ys[ys.length - 1];
    const sameCol = xs[0] === xs[xs.length - 1];
    if (!sameRow && !sameCol) return null;
    if (sameRow) {
      for (let i = 1; i < xs.length; i++) if (xs[i] !== xs[i - 1] + 1) return null;
    } else {
      for (let i = 1; i < ys.length; i++) if (ys[i] !== ys[i - 1] + 1) return null;
    }
    ships.push({ size, cells, hits: 0, sunk: false });
  }
  return { size: config.size, grid, shots, ships, smoke: [] };
}

function fire(board: Board, x: number, y: number) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || y < 0 || x >= board.size || y >= board.size) return null;
  if (board.shots[y][x]) return null;
  board.shots[y][x] = 1;
  const id = board.grid[y][x];
  if (id < 0) return { x, y, result: 'miss' as const, ship: null as Cell[] | null };
  const ship = board.ships[id];
  ship.hits += 1;
  if (ship.hits >= ship.size) {
    ship.sunk = true;
    return { x, y, result: 'sunk' as const, ship: ship.cells };
  }
  return { x, y, result: 'hit' as const, ship: null as Cell[] | null };
}

function allSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => s.sunk);
}

/* ---------------- Способности ---------------- */

const ABILITY_IDS = ['airstrike', 'aa', 'smoke'];
const DEFAULT_LOADOUT = ['airstrike', 'smoke'];

function normalizeLoadout(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    const id = String(v);
    if (ABILITY_IDS.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
  }
  return out.length === 2 ? out : null;
}

function newAbilityState(ids: string[] | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids || []) out[id] = 1;
  return out;
}

// На 8×8 способности занимают 2×2, на большом поле — 3×3.
function sideFor(size: number): number {
  return size === 8 ? 2 : 3;
}

function areaCells(size: number, side: number, x: number, y: number): Cell[] {
  if (x < 0 || y < 0 || x >= size || y >= size) return [];
  const cells: Cell[] = [];
  if (side === 2) {
    const ax = Math.max(0, Math.min(size - 2, x));
    const ay = Math.max(0, Math.min(size - 2, y));
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) cells.push([ax + dx, ay + dy]);
    }
    return cells;
  }
  // 3×3: якорь — центр, область не обрезается
  if (x < 1 || y < 1 || x > size - 2 || y > size - 2) return [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) cells.push([x + dx, y + dy]);
  }
  return cells;
}

function smokeBlocks(board: Board, x: number, y: number): boolean {
  return board.smoke.some((z) => z.turnsLeft > 0 &&
    z.cells.some((c) => c[0] === x && c[1] === y));
}

function placeSmoke(board: Board, x: number, y: number): boolean {
  const cells = areaCells(board.size, sideFor(board.size), x, y);
  if (!cells.length) return false;
  if (!cells.some((c) => !board.shots[c[1]][c[0]])) return false;
  board.smoke.push({ cells, turnsLeft: 3 });
  return true;
}

function tickSmoke(board: Board): void {
  for (const z of board.smoke) z.turnsLeft -= 1;
  board.smoke = board.smoke.filter((z) => z.turnsLeft > 0);
}

function legalShots(board: Board): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      if (!board.shots[y][x] && !smokeBlocks(board, x, y)) out.push([x, y]);
    }
  }
  return out;
}

function awaitingLoadout(room: Room): boolean {
  return room.config.tactics && !room.players.every((p) => !!p.loadout);
}

function startBattle(room: Room): void {
  if (room.started || room.players.length !== 2) return;
  if (room.loadoutTimer) {
    clearTimeout(room.loadoutTimer);
    room.loadoutTimer = null;
  }
  room.started = true;
  room.turn = Math.random() < 0.5 ? 0 : 1;
  room.charges = room.players.map((p) => newAbilityState(p.loadout));
  room.players.forEach((p, i) => {
    const mine = room.players[1 - i];
    send(p, {
      t: 'begin',
      you: i,
      first: room.turn === i,
      config: room.config,
      loadout: p.loadout,
      foeLoadout: mine.loadout,
      foe: { name: mine.name, rating: mine.rating }
    });
  });
}

function maybeBegin(room: Room): void {
  if (room.started || room.players.length !== 2) return;
  if (!room.players.every((p) => !!p.board)) return;
  if (awaitingLoadout(room)) {
    // Комната не должна зависнуть на подготовке: через минуту берём подсказку.
    if (!room.loadoutTimer) {
      room.loadoutTimer = setTimeout(() => {
        room.loadoutTimer = null;
        if (room.started || room.players.length !== 2) return;
        room.players.forEach((p) => {
          if (!p.loadout) p.loadout = (p.hintLoadout || DEFAULT_LOADOUT).slice();
        });
        startBattle(room);
      }, 60000);
    }
    return;
  }
  startBattle(room);
}

// Ход перешёл: дым на доске игрока, чей ход начинается, тикает.
function advanceTurn(room: Room, fromIdx: number, depth = 0): void {
  room.turn = 1 - fromIdx;
  const finished = room.players[1 - fromIdx];
  if (finished.board) tickSmoke(finished.board);
  room.players.forEach((p, i) => send(p, { t: 'turn', you: room.turn === i }));
  // Игрок стреляет по чужому полю: если там всё простреляно или под дымом,
  // ход пропускается (с защитой от бесконечной рекурсии).
  const target = room.players[1 - room.turn];
  if (target && target.board && legalShots(target.board).length === 0) {
    room.players.forEach((p) => send(p, { t: 'pass', reason: 'smoke' }));
    if (depth < 4) advanceTurn(room, room.turn, depth + 1);
  }
}

/* ---------------- Утилиты ---------------- */

function send(player: Player, data: unknown) {
  try {
    if (player.ws.readyState === WebSocket.OPEN) player.ws.send(JSON.stringify(data));
  } catch (_e) { /* соединение уже закрыто */ }
}

function newCode(): string {
  for (let i = 0; i < 200; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

function cleanName(v: unknown): string {
  const s = String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || 'Игрок';
}

function cleanRating(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1000;
  return Math.max(0, Math.min(4000, Math.round(n)));
}

function dropRoom(room: Room) {
  if (room.loadoutTimer) {
    clearTimeout(room.loadoutTimer);
    room.loadoutTimer = null;
  }
  rooms.delete(room.code);
}

/* ---------------- Рейтинг онлайн-побед ----------------
   Считаем победы только в памяти инстанса. Сервер не пишет персональные
   данные в базу: топ живёт, пока работает сервер, и обнуляется после
   перезапуска. Это осознанное решение — см. privacy.html, раздел 3. */

interface WinRow {
  name: string;
  wins: number;
}

const memWins = new Map<string, number>();

function recordWin(name: string) {
  const clean = cleanName(name);
  memWins.set(clean, (memWins.get(clean) || 0) + 1);
}

function topPlayers(limit: number): WinRow[] {
  const top: WinRow[] = [];
  for (const [name, wins] of memWins) top.push({ name, wins });
  return top.sort((a, b) => b.wins - a.wins).slice(0, limit);
}

/* ---------------- Обработка соединения ---------------- */

function handle(socket: WebSocket) {
  let me: Player | null = null;
  let room: Room | null = null;

  socket.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(event.data));
    } catch (_e) {
      return;
    }
    const type = String(msg.t || '');

    if (type === 'ping') {
      if (me) send(me, { t: 'pong' });
      return;
    }

    if (type === 'create') {
      if (room) return;
      const config = normalizeConfig(msg.config);
      if (!config) {
        send({ ws: socket, name: '', rating: 0, board: null, loadout: null, hintLoadout: [] }, { t: 'error', msg: 'Некорректные настройки комнаты.' });
        return;
      }
      me = {
        ws: socket,
        name: cleanName(msg.name),
        rating: cleanRating(msg.rating),
        board: null,
        loadout: null,
        hintLoadout: DEFAULT_LOADOUT.slice()
      };
      room = {
        code: newCode(),
        config: config,
        players: [me],
        turn: 0,
        started: false,
        createdAt: Date.now(),
        charges: [],
        loadoutTimer: null
      };
      rooms.set(room.code, room);
      send(me, { t: 'room', code: room.code, you: 0, name: me.name, rating: me.rating, config: room.config });
      send(me, { t: 'wait' });
      return;
    }

    if (type === 'join') {
      if (room) return;
      const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
      const target = rooms.get(code);
      if (!target) {
        send({ ws: socket, name: '', rating: 0, board: null, loadout: null, hintLoadout: [] }, { t: 'error', msg: 'Комната не найдена. Проверь код.' });
        return;
      }
      if (target.players.length >= 2) {
        send({ ws: socket, name: '', rating: 0, board: null, loadout: null, hintLoadout: [] }, { t: 'error', msg: 'В комнате уже двое.' });
        return;
      }
      me = {
        ws: socket,
        name: cleanName(msg.name),
        rating: cleanRating(msg.rating),
        board: null,
        loadout: null,
        hintLoadout: DEFAULT_LOADOUT.slice()
      };
      room = target;
      room.players.push(me);
      const idx = room.players.length - 1;
      send(me, { t: 'room', code: room.code, you: idx, name: me.name, rating: me.rating, config: room.config });
      room.players.forEach((p, i) => {
        const foe = room!.players[1 - i];
        send(p, { t: 'start', you: i, foe: { name: foe.name, rating: foe.rating }, config: room!.config });
      });
      return;
    }

    if (!me || !room) return;

    if (type === 'loadout') {
      if (room.started) {
        send(me, { t: 'error', msg: 'Бой уже начался.' });
        return;
      }
      const ids = normalizeLoadout(msg.ids);
      if (!ids) {
        send(me, { t: 'error', msg: 'Выбери ровно две способности.' });
        return;
      }
      me.loadout = ids;
      me.hintLoadout = ids.slice();
      maybeBegin(room);
      return;
    }

    if (type === 'fleet') {
      // Флот принимается только один раз и только до старта боя:
      // иначе можно подменить расстановку по ходу матча.
      if (room.started || me.board) {
        send(me, { t: 'error', msg: 'Флот уже принят.' });
        return;
      }
      const hint = normalizeLoadout(msg.loadout);
      if (hint) me.hintLoadout = hint;
      const board = buildBoard(msg.ships, room.config);
      if (!board) {
        send(me, { t: 'error', msg: 'Некорректная расстановка флота.' });
        return;
      }
      me.board = board;
      send(me, { t: 'fleetOk' });
      const idx = room.players.indexOf(me);
      const foe = room.players[1 - idx];
      if (foe) send(foe, { t: 'foeReady' });

      maybeBegin(room);
      return;
    }

    if (type === 'ability') {
      if (!room.started || !room.config.tactics) {
        send(me, { t: 'error', msg: 'Способности недоступны.' });
        return;
      }
      const idx = room.players.indexOf(me);
      if (idx !== room.turn) {
        send(me, { t: 'error', msg: 'Сейчас не твой ход.' });
        return;
      }
      const kind = String(msg.kind || '');
      const charges = room.charges[idx] || {};
      if (!me.loadout || me.loadout.indexOf(kind) < 0 || !charges[kind]) {
        send(me, { t: 'error', msg: 'Способность недоступна.' });
        return;
      }
      const x = Number(msg.x);
      const y = Number(msg.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) ||
          x < 0 || y < 0 || x >= room.config.size || y >= room.config.size) {
        send(me, { t: 'error', msg: 'Координаты вне поля.' });
        return;
      }
      const foe = room.players[1 - idx];

      if (kind === 'smoke') {
        const own = me.board;
        if (!own) return;
        const cells = areaCells(own.size, sideFor(own.size), x, y);
        if (!cells.length) {
          send(me, { t: 'error', msg: 'Слишком близко к краю.' });
          return;
        }
        if (!cells.some((c) => !own.shots[c[1]][c[0]])) {
          send(me, { t: 'error', msg: 'Здесь уже всё обстреляно.' });
          return;
        }
        placeSmoke(own, x, y);
        charges.smoke -= 1;
        room.players.forEach((p, i) => send(p, {
          t: 'ability',
          kind: 'smoke',
          x: x,
          y: y,
          cells: cells.map((c) => ({ x: c[0], y: c[1] })),
          owner: idx,
          turnsLeft: 3,
          foe: i !== idx
        }));
        advanceTurn(room, idx);
        return;
      }

      if (kind === 'airstrike') {
        if (!foe || !foe.board) return;
        const foeBoard = foe.board;
        let cells = areaCells(foeBoard.size, sideFor(foeBoard.size), x, y);
        if (!cells.length) {
          send(me, { t: 'error', msg: 'Слишком близко к краю.' });
          return;
        }
        if (!cells.some((c) => !foeBoard.shots[c[1]][c[0]])) {
          send(me, { t: 'error', msg: 'Здесь уже всё обстреляно.' });
          return;
        }
        // ПВО соперника гасит первый авиаудар до центральной клетки.
        let blocked = false;
        const foeCharges = room.charges[1 - idx] || {};
        if (foeCharges.aa > 0) {
          foeCharges.aa = 0;
          cells = [[x, y]];
          blocked = true;
          room.players.forEach((p) => send(p, { t: 'ability', kind: 'aa', blocked: true, owner: 1 - idx }));
        }
        const hits: Array<NonNullable<ReturnType<typeof fire>>> = [];
        for (const c of cells) {
          const hit = fire(foeBoard, c[0], c[1]);
          if (hit) hits.push(hit);
        }
        charges.airstrike -= 1;
        room.players.forEach((p, i) => send(p, {
          t: 'ability',
          kind: 'airstrike',
          x: x,
          y: y,
          cells: hits,
          // «foe» — это «удар пришёлся по твоему сопернику»: для стрелка true,
          // для защитника false (он рисует попадания на своём поле).
          foe: i === idx,
          blocked: blocked
        }));
        if (allSunk(foeBoard)) {
          send(me, { t: 'end', win: true });
          send(foe, { t: 'end', win: false });
          if (isClassicRoom(room.config)) recordWin(me.name);
          dropRoom(room);
          room = null;
          return;
        }
        advanceTurn(room, idx);
        return;
      }

      send(me, { t: 'error', msg: 'Неизвестная способность.' });
      return;
    }

    if (type === 'shot') {
      if (!room.started) return;
      const idx = room.players.indexOf(me);
      if (idx !== room.turn) {
        send(me, { t: 'error', msg: 'Сейчас не твой ход.' });
        return;
      }
      const foe = room.players[1 - idx];
      if (!foe || !foe.board) return;

      const sx = Number(msg.x);
      const sy = Number(msg.y);
      if (smokeBlocks(foe.board, sx, sy)) {
        send(me, { t: 'error', msg: 'Клетка под дымом.' });
        return;
      }

      const res = fire(foe.board, sx, sy);
      if (!res) {
        send(me, { t: 'error', msg: 'По этой клетке уже стреляли.' });
        return;
      }

      send(me, { t: 'shot', x: res.x, y: res.y, result: res.result, ship: res.ship, mine: true });
      send(foe, { t: 'shot', x: res.x, y: res.y, result: res.result, ship: res.ship, mine: false });

      if (allSunk(foe.board)) {
        send(me, { t: 'end', win: true });
        send(foe, { t: 'end', win: false });
        if (isClassicRoom(room.config)) recordWin(me.name);
        dropRoom(room);
        room = null;
        return;
      }

      if (res.result === 'miss') {
        advanceTurn(room, idx);
      }
      return;
    }

    if (type === 'surrender') {
      // Сдаваться можно только в начавшемся бою: иначе победа засчитывается
      // без единого выстрела (накрутка таблицы побед).
      if (!room.started) {
        send(me, { t: 'error', msg: 'Бой ещё не начался.' });
        return;
      }
      const idx = room.players.indexOf(me);
      const foe = room.players[1 - idx];
      if (foe) {
        send(foe, { t: 'end', win: true, reason: 'surrender' });
        if (isClassicRoom(room.config)) recordWin(foe.name);
      }
      send(me, { t: 'end', win: false, reason: 'surrender' });
      dropRoom(room);
      room = null;
      return;
    }

    if (type === 'leave') {
      const idx = room.players.indexOf(me);
      const foe = room.players[1 - idx];
      if (foe) send(foe, { t: 'foeLeft' });
      dropRoom(room);
      room = null;
    }
  };

  socket.onclose = () => {
    if (!room || !me) return;
    const idx = room.players.indexOf(me);
    const foe = room.players[1 - idx];
    if (foe) send(foe, { t: 'foeLeft' });
    dropRoom(room);
    room = null;
  };

  socket.onerror = () => {
    try { socket.close(); } catch (_e) { /* ignore */ }
  };
}

/* ---------------- Уборка старых комнат ---------------- */

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL) {
      room.players.forEach((p) => send(p, { t: 'error', msg: 'Комната закрыта по таймауту.' }));
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

/* ---------------- HTTP + WebSocket ---------------- */

const PORT = Number(Deno.env.get('PORT') || 8000);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
  });
}

Deno.serve({ port: PORT }, async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (url.pathname === '/ws') {
    if (req.headers.get('upgrade') !== 'websocket') {
      return new Response('websocket only', { status: 400 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);
    handle(socket);
    return response;
  }

  if (url.pathname === '/api/leaderboard') {
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 10));
    const top = topPlayers(limit);
    return json({ top, updated: Date.now() });
  }

  if (url.pathname === '/health') {
    return json({ ok: true, rooms: rooms.size, top: memWins.size });
  }

  return new Response('Морской бой — онлайн-сервер работает. Комнат: ' + rooms.size, {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
});
