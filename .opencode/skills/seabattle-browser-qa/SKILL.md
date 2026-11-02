---
name: Seabattle Browser QA
description: Проверка UI «Морского боя» в браузере: смоук бота и онлайна, DOM-пробы, скриншоты, мобильная ширина
---

# Seabattle Browser QA

## Когда использовать

После правок `index.html`, `style.css`, `js/app.js`, `js/online.js`: нужно
убедиться, что экраны переключаются, бой идёт, консоль чистая, вёрстка не
разъехалась на телефоне.

## Подготовка

1. `npm run dev` в фоне (http://localhost:5173).
2. Для онлайна — ещё `npm run server` (см. skill `seabattle-online`).
3. Браузерные инструменты доступны только в code mode (`tools.browser.*`).

**Снять service worker перед проверкой правок** — он отдаёт закэшированный
`js/app.js` и создаёт ложное впечатление, что изменения не применились:

```js
(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
})()
```

Затем обновить HTTP-кэш и перезагрузить (иначе GitHub Pages отдаст файлы
из кэша с `max-age=600`):

```js
(async () => {
  for (const f of ['./js/app.js', './js/online.js', './js/engine.js', './sw.js'])
    await fetch(f, { cache: 'reload' });
})()
```

Проверка, что клиент видит боевой сервер: `window.Online.available()` → `true`,
`(await caches.keys())` содержит актуальную версию (`sb-v6` и т. п.).

## Правила работы с инструментом

- Каждая операция требует `tabID` из `tabs.open`/`tabs.list`; фокус не выбирает цель.
- `ref` из снапшота живёт до следующего снапшота/навигации — после действия
  брать новый снапшот или кликать через `evaluate` по CSS-селектору.
- Скриншот — только для сфокусированной вкладки: `tabs.focus`, потом `screenshot`.
- Не спать таймерами: `wait` по тексту/загрузке; в `evaluate` допустим короткий
  `setTimeout` внутри страницы, когда ждём анимацию/ответ сервера.

## Быстрые DOM-пробы

Состояние экрана и боя:

```js
({
  screen: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('is-active')).map(s => s.id),
  pill: document.querySelector('#turn-pill').textContent,
  you: document.querySelector('#you-fleet').textContent,
  foe: document.querySelector('#foe-fleet').textContent,
  overlay: !document.querySelector('#overlay').hidden,
  result: document.querySelector('#result-title').textContent,
  eloHidden: document.querySelector('.result-card .elo-row').hidden
})
```

Клетки поля — кнопки `.cell` с `data-x`/`data-y`; свои корабли имеют класс
`ship`, результаты — `hit`, `miss`, `sunk`, `ship-reveal`. Клик:
`document.querySelectorAll('#board-enemy .cell')[y * 10 + x].click()`.

## Сценарий «бот»

1. Меню: виден ник, рейтинг, кнопки «В БОЙ», «Играть с другом», «Правила».
2. «В БОЙ» → «Случайно» → «В БОЙ» — флот 10/10, ход твой.
3. Выстрел по `#board-enemy` — класс `miss`/`hit`, затем ход бота.
4. Дождаться ответного хода бота, проверить `#turn-pill`.
5. Консоль: нет ошибок.

## Сценарий «онлайн»

Две вкладки, полный цикл — в skill `seabattle-online`. Ключевые проверки:

- у нетеривого `#turn-pill` = «ХОД СОПЕРНИКА», поле заблокировано (`is-locked`);
- промах передаёт ход, попадание оставляет;
- «Сдаться» → у обоих результат, блок ELO скрыт, кнопка «🔁 Новая комната»;
- выход из расстановки → у соперника тост и возврат в меню.

## Скриншоты

- Для RuStore: 1080×1920, лежат в `docs/screenshots/` (меню, расстановка, бой, правила).
- Для проверки вёрстки: ширина 390 px (телефон) и 1280 px (десктоп).
- `prefers-reduced-motion`: проверить `matchMedia('(prefers-reduced-motion: reduce)').matches`
  и что анимации не мешают (конфетти/тряска отключаются стилями).

## Что считать регрессией

- Поле не помещается по ширине, клетки меньше 32 px.
- Тост перекрывает кнопки, оверлей не закрывается, скролл «прыгает».
- `file://` ломается из-за `import`/`fetch` локальных файлов.
- После правок не поднят `VERSION` в `sw.js` — офлайн-версия останется старой.
