# Морской бой — Морская арена

Браузерная игра «Морской бой» против бота с ELO-рейтингом. Без фреймворков и сборки:
чистые HTML/CSS/JS, запускается двойным кликом по `index.html`.

## Структура

- `index.html` — экраны: меню, онлайн, расстановка, бой, результат, правила.
- `style.css` — оформление, анимации, адаптив, reduced-motion.
- `js/engine.js` — правила, генерация флота, выстрелы, бот, ELO. Без DOM.
- `js/app.js` — UI, звук, ход игры, localStorage, экраны.
- `js/online.js` — клиент онлайн-игры: WebSocket, комнаты (`window.Online`).
- `server/main.ts` — Deno-сервер комнат: проверяет флот и сам считает выстрелы.
- `docs/online.md` — деплой сервера на Deno Deploy и протокол сообщений.
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
- `npm run server` — онлайн-сервер на http://127.0.0.1:8000 (нужен Deno)
- `npm test` — тесты движка
- `node --test tests/` — то же напрямую
- `npm run icons` — перегенерировать иконки (Python + Pillow)
- `npm run www` — собрать `www/` для Capacitor
- `npm run android:apk` — sync + debug APK
- `cd android; gradlew.bat assembleRelease bundleRelease` — подписанные APK/AAB для магазинов
  (нужен `android/keystore.properties` + `android/keystore/seabattle-release.jks`, оба в git не идут)

## Правила разработки

- Не добавлять сборщик/фреймворк без явной просьбы: игра должна открываться как `file://`.
- Никаких ES-модулей в браузерных скриптах (`import`), иначе `file://` ломается. Только классические IIFE.
- Правила игры и бот — только в `engine.js`; DOM и звук — только в `app.js`.
- Онлайн: истина на сервере (`server/main.ts`). Клиент не должен получать чужой флот,
  а ELO за онлайн-матчи не начисляется.
- UI на русском, mobile-first, тач-цели не меньше 32px.
- Новые анимации уважают `prefers-reduced-motion`.
- Ключ localStorage `seabattle.profile.v2` не менять без миграции.
- Меняя `index.html`/`style.css`/`js/*`, поднимать версию кэша в `sw.js` (`VERSION`), иначе офлайн-копия останется старой.
- Не коммитить `node_modules`, логи, временные файлы.
- После изменений: `npm test` + смоук (меню → случайная расстановка → бой → выстрел).
  Трогал онлайн — ещё `npm run server` + `npm run test:online`.
- Деплой и `git push` — только после подтверждения пользователя.

## Известные нюансы

- Ход бота асинхронный; защита от «просроченных» ходов — `state.matchSeq`.
- Корабли не касаются даже углами — это проверяет `canPlace`.
- При потоплении раскрываются все клетки корабля (`revealSunk`).
