// Смоук онлайн-сервера: два клиента, полная партия по протоколу.
// Требует запущенный сервер: npm run server
// Запуск: npm run test:online  (или node scripts/online-smoke.mjs wss://.../ws)

const URL = process.argv[2] || 'ws://127.0.0.1:8000/ws';

// Валидная расстановка: флот без касаний даже углами.
const FLEET = [
  { size: 4, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { size: 3, cells: [[5, 0], [6, 0], [7, 0]] },
  { size: 3, cells: [[0, 2], [1, 2], [2, 2]] },
  { size: 2, cells: [[5, 2], [6, 2]] },
  { size: 2, cells: [[8, 2], [9, 2]] },
  { size: 2, cells: [[0, 4], [0, 5]] },
  { size: 1, cells: [[2, 4]] },
  { size: 1, cells: [[4, 4]] },
  { size: 1, cells: [[6, 4]] },
  { size: 1, cells: [[8, 4]] }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  let ws = null;
  const inbox = [];
  return {
    get ws() { return ws; },
    inbox,
    open: () => new Promise((res, rej) => {
      if (ws && ws.readyState === 1) { res(); return; }
      ws = new WebSocket(URL); // создаём лениво: иначе open может проскочить до подписки
      ws.addEventListener('message', (e) => inbox.push(JSON.parse(e.data)));
      ws.addEventListener('open', () => res(), { once: true });
      ws.addEventListener('error', () => rej(new Error('нет соединения с ' + URL)), { once: true });
      setTimeout(() => rej(new Error('таймаут подключения к ' + URL)), 5000);
    }),
    send: (o) => {
      if (!ws || ws.readyState !== 1) throw new Error('сокет не открыт (' + name + ')');
      ws.send(JSON.stringify(o));
    },
    // ждёт сообщение по типу и условию, забирая его из очереди
    take: (type, pred, ms = 3000) => new Promise((res, rej) => {
      const started = Date.now();
      const tick = () => {
        const i = inbox.findIndex((m) => m.t === type && (!pred || pred(m)));
        if (i >= 0) { res(inbox.splice(i, 1)[0]); return; }
        if (Date.now() - started > ms) { rej(new Error('таймаут: ' + type + ' (' + name + ')')); return; }
        setTimeout(tick, 10);
      };
      tick();
    })
  };
}

let fails = 0;
const check = (cond, label) => {
  if (cond) console.log('  ok  ', label);
  else { fails++; console.log('  FAIL', label); }
};

// страховка от зависания
const watchdog = setTimeout(() => {
  console.error('\nСмоук не уложился в 30 секунд — процесс остановлен.');
  process.exit(1);
}, 30000);
watchdog.unref?.();

const a = client('A');
const b = client('B');
try {
  await a.open();
  a.send({ t: 'create', name: 'Тест А', rating: 1200 });
  const roomA = await a.take('room');
  check(/^\d{4}$/.test(roomA.code), 'комната: код из 4 цифр');
  await a.take('wait');

  await b.open();
  b.send({ t: 'join', code: roomA.code, name: 'Тест Б', rating: 1100 });
  const roomB = await b.take('room');
  check(roomB.you === 1, 'второй игрок получил индекс 1');
  check((await a.take('start')).foe.name === 'Тест Б', 'хост узнал соперника');
  check((await b.take('start')).foe.name === 'Тест А', 'гость узнал соперника');

  // некорректный флот: корабль касается другого углом
  const touching = JSON.parse(JSON.stringify(FLEET));
  touching[1].cells = [[5, 1], [6, 1], [7, 1]];
  b.send({ t: 'fleet', ships: touching });
  check((await b.take('error')).msg.includes('Некорректная'), 'сервер отклонил касающийся флот');

  // некорректный флот: неполный состав
  b.send({ t: 'fleet', ships: FLEET.slice(1) });
  check((await b.take('error')).msg.includes('Некорректная'), 'сервер отклонил неполный флот');

  b.send({ t: 'fleet', ships: FLEET });
  check((await b.take('fleetOk')).t === 'fleetOk', 'флот гостя принят');
  a.send({ t: 'fleet', ships: FLEET });
  check((await a.take('fleetOk')).t === 'fleetOk', 'флот хоста принят');
  check((await a.take('foeReady')).t === 'foeReady', 'хост получил foeReady');

  const beginA = await a.take('begin');
  const beginB = await b.take('begin');
  check(beginA.you === 0 && beginB.you === 1, 'индексы в begin верные');
  check(beginA.first !== beginB.first, 'первый ход ровно у одного');

  const shooter = beginA.first ? a : b;
  const defender = beginA.first ? b : a;

  // выстрел мимо (9,0 — пусто в этом флоте) → ход переходит
  shooter.send({ t: 'shot', x: 9, y: 0 });
  check((await shooter.take('shot', (m) => m.mine === true)).result === 'miss', 'первый выстрел мимо');
  check((await defender.take('shot', (m) => m.mine === false)).result === 'miss', 'защитник увидел промах');
  check((await shooter.take('turn')).you === false, 'после промаха ход перешёл');
  check((await defender.take('turn')).you === true, 'защитник получил ход');

  // повторный выстрел: сначала попадание, потом та же клетка — ошибка
  defender.send({ t: 'shot', x: 0, y: 0 });
  check((await defender.take('shot', (m) => m.mine === true && m.x === 0 && m.y === 0)).result === 'hit', 'попадание оставляет ход');
  defender.send({ t: 'shot', x: 0, y: 0 });
  check((await defender.take('error')).msg.includes('уже стреляли'), 'повторный выстрел отклонён');
  check(!defender.inbox.some((m) => m.t === 'turn'), 'ход остался у стрелка');

  // остальные 19 клеток флота — попадания, ход не переходит
  const cells = FLEET.flatMap((s) => s.cells.map((c) => ({ x: c[0], y: c[1], size: s.size })))
    .filter((c) => !(c.x === 0 && c.y === 0));
  let hits = 1;
  let sunk = 0;
  for (const c of cells) {
    defender.send({ t: 'shot', x: c.x, y: c.y });
    const res = await defender.take('shot', (m) => m.mine === true && m.x === c.x && m.y === c.y);
    if (res.result === 'hit' || res.result === 'sunk') hits++;
    if (res.result === 'sunk') {
      sunk++;
      check(res.ship.length === c.size, 'потоплен корабль ' + c.size);
    }
  }
  check(hits === 20, 'поражены все 20 клеток флота (' + hits + ')');
  check(sunk === 10, 'потоплены все 10 кораблей (' + sunk + ')');
  check(!defender.inbox.some((m) => m.t === 'turn'), 'при попаданиях ход не переходил');

  // победа, поражение и закрытие комнаты
  check((await defender.take('end', (m) => m.win === true)).win === true, 'победитель получил end');
  check((await shooter.take('end', (m) => m.win === false)).win === false, 'проигравший получил end');

  await sleep(200);
  const c = client('C');
  await c.open();
  c.send({ t: 'join', code: roomA.code, name: 'Тест Ц', rating: 1000 });
  check((await c.take('error')).msg.includes('не найдена'), 'после боя комната закрыта');
  c.ws.close();
} catch (err) {
  fails++;
  console.error('\nОшибка смоука:', err.message);
} finally {
  try { a.ws.close(); } catch (_e) { /* ignore */ }
  try { b.ws.close(); } catch (_e) { /* ignore */ }
}

console.log(fails === 0 ? '\nВСЁ ОК' : '\nПРОВАЛОВ: ' + fails);
process.exit(fails ? 1 : 0);
