# Морской бой — Морская арена

Браузерная игра «Морской бой» против бота с ELO-рейтингом. Без фреймворков и сборки:
чистые HTML/CSS/JS, запускается двойным кликом по `index.html`.

## Структура

- `index.html` — экраны: меню, расстановка, бой, результат, правила.
- `style.css` — оформление, анимации, адаптив, reduced-motion.
- `js/engine.js` — правила, генерация флота, выстрелы, бот, ELO. Без DOM.
- `js/app.js` — UI, звук, ход игры, localStorage, экраны.
- `tests/` — unit-тесты движка (node:test, без зависимостей).
- `scripts/serve.mjs` — локальный статический сервер.
- `manifest.webmanifest`, `sw.js` — PWA: установка на телефон и офлайн-кэш.
- `assets/` — иконки PWA (генерируются `scripts/make-icons.py`).
- `capacitor.config.json`, `www/` — мобильная обёртка: `www` собирается из корня `scripts/build-www.mjs`.
- `android/` — нативный проект Capacitor (генерируется `npx cap add android`).
  Сборка требует JDK 21 (Capacitor 8) и Android SDK: platform 36 + build-tools 36.
  Из-за кириллицы в пути нужен `android.overridePathCheck=true` в `android/gradle.properties`.

## Команды

- `npm run dev` — сервер на http://localhost:5173
- `npm test` — тесты движка
- `node --test tests/` — то же напрямую
- `npm run icons` — перегенерировать иконки (Python + Pillow)
- `npm run www` — собрать `www/` для Capacitor
- `npm run android:apk` — sync + debug APK

## Правила разработки

- Не добавлять сборщик/фреймворк без явной просьбы: игра должна открываться как `file://`.
- Никаких ES-модулей в браузерных скриптах (`import`), иначе `file://` ломается. Только классические IIFE.
- Правила игры и бот — только в `engine.js`; DOM и звук — только в `app.js`.
- UI на русском, mobile-first, тач-цели не меньше 32px.
- Новые анимации уважают `prefers-reduced-motion`.
- Ключ localStorage `seabattle.profile.v2` не менять без миграции.
- Меняя `index.html`/`style.css`/`js/*`, поднимать версию кэша в `sw.js` (`VERSION`), иначе офлайн-копия останется старой.
- Не коммитить `node_modules`, логи, временные файлы.
- После изменений: `npm test` + смоук (меню → случайная расстановка → бой → выстрел).
- Деплой и `git push` — только после подтверждения пользователя.

## Известные нюансы

- Ход бота асинхронный; защита от «просроченных» ходов — `state.matchSeq`.
- Корабли не касаются даже углами — это проверяет `canPlace`.
- При потоплении раскрываются все клетки корабля (`revealSunk`).
