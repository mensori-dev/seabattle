---
name: Seabattle Online
description: Онлайн-игра «Морского боя»: WebSocket-сервер комнат, деплой на Deno, двухвкладочный смоук и отладка
---

# Seabattle Online

## Когда использовать

Любая работа с режимом «Играть с другом»: клиент `js/online.js`, сервер
`server/main.ts`, экран `#screen-online`, деплой на Deno Deploy, разбор
проблем с комнатами и ходами.

## Архитектура

- `js/online.js` — классический IIFE, `window.Online`: `connect`, `create`,
  `join`, `fleet`, `shot`, `surrender`, `leave`, `on/off`. Адрес берётся из
  `PROD_URL`, локально — `ws://127.0.0.1:8000/ws`.
- `server/main.ts` — Deno, `Deno.serve` + `Deno.upgradeWebSocket`. Комнаты
  в `Map`, TTL 2 часа, код из 4 цифр.
- **Сервер авторитетный**: он проверяет флот, хранит оба поля, считает
  попадания и рассылает только результат (`miss`/`hit`/`sunk` + клетки
  потопленного корабля). Клиент не получает чужой флот — не «оптимизировать»
  это в клиентскую логику.
- Онлайн-матчи **не меняют ELO** и не пишутся в историю.
- Правила: попадание — стреляешь снова, промах — ход переходит. Первый ход
  выбирает сервер случайно (`begin.first`).

Полный протокол и шаги деплоя — `docs/online.md`.

## Локальный запуск

```
npm run server   # http://127.0.0.1:8000, нужен Deno
npm run dev      # http://localhost:5173
```

Проверка живости: `http://127.0.0.1:8000/health` → `{"ok":true,"rooms":N}`.

## Обязательная проверка

1. `npm test` — движок не сломан.
2. `npm run server` в фоне, затем `npm run test:online` — полный протокол
   (комната, валидация флота, промах/переход хода, 20 попаданий, победа,
   закрытие комнаты). Скрипт: `scripts/online-smoke.mjs`, можно указать URL:
   `node scripts/online-smoke.mjs wss://.../ws`.
3. Браузер, **две вкладки** на `http://localhost:5173` — см. сценарий ниже.

## Сценарий двух вкладок (браузерные инструменты)

1. Вкладка A: `#btn-online` → `#btn-create-room` → прочитать `#online-code`.
2. Вкладка B: `#btn-online`, вписать код в `#room-code`, `#btn-join-room`.
3. Обе: `#btn-random`, затем `#btn-ready`.
4. У кого `#turn-pill` = «ТВОЙ ХОД», тот кликает по `#board-enemy .cell`.
5. Проверить: промах → «ХОД СОПЕРНИКА», попадание → ход остаётся,
   `#foe-fleet` уменьшается только при потоплении.
6. «Сдаться» (`window.confirm = () => true` перед кликом) → у обоих
   результат, блок ELO скрыт, кнопка «🔁 Новая комната».
7. Выход из расстановки (`#btn-back`) → у соперника тост «Соперник вышел»
   и возврат в меню.

Быстрая проба состояния без снапшота:

```js
({
  screen: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('is-active')).map(s => s.id),
  pill: document.querySelector('#turn-pill').textContent,
  foe: document.querySelector('#foe-fleet').textContent,
  own: document.querySelector('#you-fleet').textContent,
  overlay: !document.querySelector('#overlay').hidden
})
```

## Подводные камни

- **Service worker отдаёт старый `js/app.js`** (cache-first). Перед проверкой
  правок снять его в обеих вкладках и перезагрузить:

  ```js
  (async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()
  ```

- `PROD_URL` должен быть `wss://<project>.deno.dev/ws` — именно `wss` и `/ws`.
- После правок `index.html`, `style.css`, `js/*` поднять `VERSION` в `sw.js`.
- Второй игрок не подключается: сервер не запущен/упал, порт 8000 занят,
  или вкладка держит старое соединение — перезапустить сервер и вкладки.
- Комната живёт в памяти инстанса: перезапуск Deno рвёт активные партии.
- `Online.leave()` закрывает сокет; для новой комнаты `connect()` создаёт новый.
- На `file://` сервер недоступен по смыслу, но клиент не должен падать:
  `Online.available()` возвращает `false` вне localhost без `PROD_URL`.

## Безопасность и данные

- Ник режется до 16 символов, управляющие символы и `<>` вычищаются на сервере;
  на клиенте всё выводится через `textContent`.
- Не логировать флоты, координаты и IP. Политика конфиденциальности описывает
  онлайн в разделе 3 — обновить её, если меняется состав передаваемых данных.
- Не принимать решения о победе на клиенте и не доверять клиентским `shot`.
