# Морской бой — Морская арена

Браузерная игра «Морской бой» против бота с ELO-рейтингом. Без фреймворков и сборки:
чистые HTML/CSS/JS, запускается двойным кликом по `index.html`.

## Структура

- `index.html` — экраны: меню, онлайн, расстановка, бой, результат, правила.
- `style.css` — оформление, анимации, адаптив, reduced-motion.
- `js/engine.js` — правила, генерация флота, выстрелы, бот, ELO. Без DOM.
- `js/app.js` — UI, звук, ход игры, localStorage, экраны.
- `js/online.js` — клиент онлайн-игры: WebSocket, комнаты (`window.Online`).
- `js/music.js` — процедурная фоновая музыка на WebAudio: без внешних файлов
  (`window.Music`).
- `js/yandex.js` — платформа Яндекс Игр: SDK, реклама, пауза (`window.YandexGame`).
  Подключается только в сборке для Яндекс Игр.
- `js/gamepush.js` — платформа GamePush для VK/OK: SDK, реклама, пауза
  (`window.GamePlatform`). Подключается только в GamePush-сборке; без SDK игра
  работает как обычно.
- `server/main.ts` — Deno-сервер комнат: проверяет флот и сам считает выстрелы.
  Персональные данные не хранит: комнаты и топ побед живут в памяти.
- `docs/online.md` — деплой сервера на Deno Deploy и протокол сообщений.
- `docs/yandex.md` — сборка для Яндекс Игр, чек-лист модерации, выплаты.
- `docs/gamepush.md` — GamePush, VK Games и OK Games: ключи, сборка, хостинг,
  реклама и модерация.
- `docs/stores.md` — статус и чек-лист RuStore, Google Play и App Store.
- `docs/yandex-promo/` — тексты полей карточки (`TEXTS.md`) и пошаговая
  инструкция публикации (`README.md`).
- `scripts/make-yandex-promo.mjs` — промоматериалы для консоли:
  `yandex-promo/` (иконка, обложка, hero, скриншоты, два MP4, тексты, архив игры).
- `scripts/promo-picker.mjs` — вероятностный прицел для промо-автоигры:
  стабильно выигрывает у лёгкого бота, чтобы скриншот результата был «Победа!».
- `tests/` — unit-тесты движка (node:test, без зависимостей).
- `scripts/serve.mjs` — локальный статический сервер.
- `site/` — витрина для друзей на GitHub Pages (`/site/`): скриншоты и кнопки
  скачивания APK/IPA. Версия и ссылки — в `site/version.json`.
- `scripts/release.mjs` — релиз: `version.json`, GitHub Releases и OneDrive.
- `manifest.webmanifest`, `sw.js` — PWA: установка на телефон и офлайн-кэш.
- `assets/` — иконки PWA (генерируются `scripts/make-icons.py`) и локальные
  шрифты Nunito/Rubik (`scripts/fetch-fonts.mjs`).
- `scripts/make-android-icons.py` — adaptive-иконки Android: фон, якорь, monochrome.
- `.github/workflows/ios-ipa.yml` — сборка unsigned IPA на macOS-раннере GitHub Actions.
- `scripts/build-ipa.mjs` — запуск этой сборки и скачивание IPA в `dist/` и OneDrive.
- `capacitor.config.json`, `www/` — мобильная обёртка: `www` собирается из корня `scripts/build-www.mjs`.
- `scripts/build-yandex.mjs` — сборка для Яндекс Игр: `dist/yandex/` и архив
  `dist/seabattle-yandex-<версия>.zip` (онлайн, Google Fonts и PWA вырезаны).
- `scripts/build-gamepush.mjs` — сборка для VK/OK через GamePush:
  `dist/gamepush/` и `dist/seabattle-gamepush-<версия>.zip` (PWA и онлайн
  вырезаны, остаётся одиночный бой и приватность; ключи из env или
  `gamepush.config.json`).
- `gamepush.config.example.json` — шаблон ключей GamePush; настоящий
  `gamepush.config.json` в git не идёт.
- `scripts/make-gamepush-assets.py` — материалы VK Play: иконки 1024×1024,
  4:3 и 2:3, обложки 1920×1080 и 1080×1920, фон без текста.
- `scripts/make-gamepush-screens.py` — скриншоты 1280×720 и 720×1280.
- `scripts/gamepush-video.mjs` — портретное видео 1080×1920 до 20 с.
- `scripts/gamepush-video-landscape.mjs` — альбомное видео 1920×1080.
- `scripts/fetch-fonts.mjs` — локальные Nunito и Rubik в `assets/fonts` для Яндекс Игр.
- `android/` — нативный проект Capacitor (генерируется `npx cap add android`).
  Сборка требует JDK 21 (Capacitor 8) и Android SDK: platform 36 + build-tools 36.
  Из-за кириллицы в пути нужен `android.overridePathCheck=true` в `android/gradle.properties`.

## Команды

- `npm run dev` — сервер на http://localhost:5173
- `npm run server` — онлайн-сервер на http://127.0.0.1:8000 (нужен Deno)
- `npm run test:online` — смоук онлайн-протокола (сервер должен быть запущен)
- `npm run shots` — скриншоты 1080×1920 в `docs/screenshots/` (нужны dev + server)
- `npm run release` — план релиза; `npm run release -- --yes` — публикация:
  `site/version.json`, релиз на GitHub, OneDrive (старые версии удаляются).
  Нужны APK, AAB и IPA в `dist/` — `android:apk -- --apk` для релиза не хватит.
- `npm test` — тесты движка
- `node --test tests/` — то же напрямую
- `npm run icons` — перегенерировать иконки PWA и Android (Python + Pillow)
- `npm run android:icons` — только adaptive-иконки Android
- `npm run www` — собрать `www/` для Capacitor
- `npm run yandex` — сборка для Яндекс Игр: `dist/yandex/` и архив
  `dist/seabattle-yandex-<версия>.zip` (`-- --no-zip` — только папка)
- `npm run yandex:promo` — промоматериалы в `yandex-promo/` (нужен Chrome;
  `-- --no-video` — без MP4, `-- --no-build` — не пересобирать `dist/yandex`).
- `npm run gamepush` — сборка для VK/OK: `dist/gamepush/` и архив
  `dist/seabattle-gamepush-<версия>.zip` (ключи из `gamepush.config.json` или
  env `GAMEPUSH_PROJECT_ID`/`GAMEPUSH_PUBLIC_TOKEN`; `-- --no-zip` — только папка)
- `npm run gamepush:demo` — то же без SDK для локальной проверки
- `npm run gamepush:assets` — иконки, обложки, фон, скриншоты VK Play в
  `dist/gamepush-assets/`
- `npm run gamepush:video` — портретное видео 1080×1920 в
  `dist/gamepush-video/`
- `npm run gamepush:video:landscape` — альбомное видео 1920×1080 в
  `dist/gamepush-video-landscape/`
- `npm run fonts` — перегенерировать локальные шрифты в `assets/fonts`
- `npm run android:apk` — sync + подписанный release APK/AAB в `dist/`
  (`-- --apk` только APK, `-- --debug` debug-сборка)
- `npm run ios:ipa` — unsigned IPA через GitHub Actions → `dist/` и OneDrive
  (нужен `gh auth login`; подпись Apple не ставится)
- `cd android; gradlew.bat assembleRelease bundleRelease` — подписанные APK/AAB для магазинов
  (нужен `android/keystore.properties` + `android/keystore/seabattle-release.jks`, оба в git не идут)

## Правила разработки

- Не добавлять сборщик/фреймворк без явной просьбы: игра должна открываться как `file://`.
- Никаких ES-модулей в браузерных скриптах (`import`), иначе `file://` ломается. Только классические IIFE.
- Правила игры и бот — только в `engine.js`; DOM и звук — только в `app.js`.
- Онлайн: истина на сервере (`server/main.ts`). Клиент не должен получать чужой флот,
  а ELO за онлайн-матчи не начисляется. Сервер не хранит персональные данные:
  топ побед считается в памяти и обнуляется после перезапуска.
- Сборка для Яндекс Игр не форкает код: `scripts/build-yandex.mjs` вырезает онлайн и PWA
  из тех же исходников. Правя общий код, не ломай её — `npm test` собирает и проверяет.
- Платформенные хуки в `app.js` идут через `window.GamePlatform || window.YandexGame`.
  В корне и `file://` оба отсутствуют — игра обязана работать без SDK.
- Сборка GamePush для VK/OK (`scripts/build-gamepush.mjs`) вырезает PWA, онлайн
  и внешние шрифты, но оставляет только одиночный бой с ботом и политику
  конфиденциальности. Ключи — в gitignored `gamepush.config.json` или env,
  в репозиторий их не коммитить.
- UI на русском, mobile-first, тач-цели не меньше 32px.
- Новые анимации уважают `prefers-reduced-motion`.
- Ключ localStorage `seabattle.profile.v2` не менять без миграции.
- Меняя `index.html`/`style.css`/`js/*`, поднимать версию кэша: `VERSION` в `sw.js`
  **и** `SW_VERSION` в `js/app.js` (должны совпадать). Иначе офлайн-копия останется
  старой, а CDN GitHub Pages может отдать прежний service worker (кэш 10 минут).
- Не коммитить `node_modules`, логи, временные файлы.
- После изменений: `npm test` + смоук (меню → случайная расстановка → бой → выстрел).
  Трогал онлайн — ещё `npm run server` + `npm run test:online`.
- При каждом релизе обновляй комплект: `dist/RELEASE_NOTES.md`, `docs/rustore.md`,
  подписанные `dist/seabattle-<версия>-release.apk`/`.aab`; скриншоты — если менялся UI.
- Каждый релиз обновляет три места: `site/version.json` (витрина), GitHub Releases
  и OneDrive. `npm run release -- --yes` делает это сам и удаляет из OneDrive
  артефакты прошлых версий; пуш сайта — после подтверждения пользователя.
- Каждый релиз кладём в OneDrive: `seabattle-<версия>.apk`,
  `seabattle-<версия>-unsigned.ipa` и папку `seabattle-rustore-<версия>/`
  (APK, AAB, иконка, скриншоты, тексты).
- Деплой и `git push` — только после подтверждения пользователя.

## Известные нюансы

- Ход бота асинхронный; защита от «просроченных» ходов — `state.matchSeq`.
- Корабли не касаются даже углами — это проверяет `canPlace`.
- При потоплении раскрываются все клетки корабля (`revealSunk`).
