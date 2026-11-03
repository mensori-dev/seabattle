# Сайт-витрина «Морского боя» — план реализации

> **Для агентов:** обязательный скилл: `superpowers:executing-plans` (рекомендуется) или `superpowers:subagent-driven-development`. Шаги отмечать `- [ ]`.

**Цель:** статичная страница-витрина в `site/` со скачиванием APK/IPA, автоматически обновляемая при каждом релизе, плюс `npm run release`, который обновляет GitHub Releases и OneDrive и чистит старые версии.

**Архитектура:** обычные HTML/CSS/JS без сборки, никаких ES-модулей. Версия и ссылки на файлы приходят из генерируемого `site/version.json`. IP-адресов и внешних CDN нет. Игра остаётся в корне, витрина — в `/site/`; service worker игры перестаёт перехватывать `/site/`.

**Стек:** vanilla HTML/CSS/JS, Node 22 (скрипты), Python + Pillow (сжатие скриншотов), gh CLI.

**Спека:** `docs/superpowers/specs/2026-11-03-seabattle-site-design.md`

## Глобальные ограничения

- Русский язык интерфейса, mobile-first, тач-цели ≥ 32px.
- Никаких фреймворков, сборщиков и ES-модулей в браузерных скриптах.
- Версия игры — `1.3.0`, `versionCode 4`; кэш SW поднимается до `sb-v17` (совпадает в `sw.js` и `js/app.js`).
- `prefers-reduced-motion` отключает анимации.
- Публикация (GitHub Releases, OneDrive) — только с флагом `--yes`.
- Публичные ссылки: `https://github.com/mensori-dev/seabattle/releases/download/v<версия>/...`.

## Фокус ревью

- Открытие `/site/` при установленной PWA: офлайн-игра не должна показывать лендинг.
- `version.json` не загрузился / 404: кнопки ведут на страницу релизов, а не в пустоту.
- iPhone: кнопка IPA не должна выглядеть как обычная установка из App Store.
- Горизонтальный скролл скриншотов на 390px без «дёрганья» страницы.
- Повторный запуск `release.mjs` на уже существующем релизе не падает и не плодит дубликаты в OneDrive.

---

### Task 1: Service worker не трогает витрину

**Files:**
- Modify: `sw.js:4`, `sw.js:47-50`, `js/app.js` (константа `SW_VERSION`)
- Test: `tests/sw-site-skip.test.mjs` (создать)

**Interfaces:**
- Produces: `sb-v17` в обеих константах; ранний выход для путей, содержащих `/site/`.

- [ ] **Шаг 1: Написать падающий тест** — читает `sw.js` и `js/app.js` как текст, проверяет, что `VERSION` и `SW_VERSION` равны `sb-v17`, и что в `sw.js` есть строка `url.pathname.includes('/site/')` до вызова `caches.match`.
- [ ] **Шаг 2: Запустить** `node --test tests/sw-site-skip.test.mjs` — FAIL.
- [ ] **Шаг 3: Реализовать** — в `sw.js` после проверки origin добавить `if (url.pathname.includes('/site/')) return;` с комментарием; `VERSION = 'sb-v17'`; в `js/app.js` `SW_VERSION = 'sb-v17'`.
- [ ] **Шаг 4: Прогнать** `node --test tests/` — 13/13 (12 старых + новый).
- [ ] **Шаг 5: Коммит** `fix(sw): не кэшировать витрину /site/ как index.html`.

### Task 2: Оптимизированные картинки для сайта

**Files:**
- Create: `scripts/make-site-images.py`
- Create: `site/img/01-menu.webp` … `06-online.webp`, `site/img/og.jpg`

**Interfaces:**
- Produces: файлы шириной 720px, webp quality 82; `og.jpg` 1200×630 из `03-battle`.

- [ ] **Шаг 1: Скрипт** читает `docs/screenshots/*.png`, ресайзит до ширины 720 с сохранением пропорций, сохраняет `site/img/<имя>.webp`.
- [ ] **Шаг 2: Запустить** `python scripts/make-site-images.py`; проверить, что каждый файл < 250 КБ и суммарно < 2 МБ.
- [ ] **Шаг 3: Коммит** `feat(site): оптимизированные скриншоты`.

### Task 3: Страница витрины

**Files:**
- Create: `site/index.html`, `site/site.css`, `site/site.js`, `site/version.json`
- Test: браузерный смоук через инструменты browser

**Interfaces:**
- Consumes: `site/img/*.webp`, `../assets/icon-192.png`, `../index.html`, `../privacy.html`, `version.json`.
- Produces: `version.json` вида `{"version":"1.3.0","date":"2026-11-03","notes":["…","…","…"]}`; `site.js` строит ссылки `releases/download/v<version>/seabattle-<version>-release.apk` и `…-unsigned.ipa`, при ошибке — `releases/latest`.

- [ ] **Шаг 1: Разметка** — hero (название, слоган, две кнопки, строка «v1.3.0 · Android · iPhone»), блок скриншотов, 4 карточки фич, три таба установки (`<button role="tab">` + панели), блок версии/changelog, подвал (privacy, GitHub).
- [ ] **Шаг 2: Стили** — палитра `#071a2b` / `#ff7a59` / `#3ddad7`, system-ui, SVG-волны на фоне, `@media (prefers-reduced-motion: reduce)` отключает анимацию, брейкпоинт 760px.
- [ ] **Шаг 3: Скрипт** — IIFE: fetch `version.json`, подстановка версии и `href`; определение платформы (`/android/i`, `/iphone|ipad|ipod/i`) с классом на кнопке; переключение табов с клавиатурой (стрелки), `aria-selected`.
- [ ] **Шаг 4: Смоук** `npm run dev`, открыть `/site/` на 390×844 и 1440×900: нет горизонтального скролла страницы, кнопки видимы, табы переключаются, консоль без ошибок.
- [ ] **Шаг 5: Коммит** `feat(site): витрина с скачиванием APK/IPA`.

### Task 4: Релизный скрипт

**Files:**
- Create: `scripts/release.mjs`
- Modify: `package.json` (script `"release": "node scripts/release.mjs"`)

**Interfaces:**
- Consumes: `package.json.version`, `dist/seabattle-<v>-release.apk`, `dist/seabattle-<v>-release.aab`, `dist/seabattle-<v>-unsigned.ipa`, `dist/RELEASE_NOTES.md`.
- Produces: `site/version.json` (версия, дата, до 3 пунктов из notes), релиз `v<v>` с ассетами, OneDrive только с текущей версией.

- [ ] **Шаг 1: Проверки** — без `--yes` печатает план и выходит 0; с `--yes` требует наличия всех файлов и `gh auth status`.
- [ ] **Шаг 2: version.json** — берёт первые 3 строки, начинающиеся с `- `, из release notes.
- [ ] **Шаг 3: GitHub Releases** — `gh release view v<v>`: если нет — `gh release create`, если есть — `gh release upload --clobber`; notes из `dist/RELEASE_NOTES.md`.
- [ ] **Шаг 4: OneDrive** — копирует `seabattle-<v>.apk`, `-unsigned.ipa`, notes, папки `seabattle-<v>/` и `seabattle-rustore-<v>/`; удаляет все `seabattle-*`, не относящиеся к текущей версии; печатает итог.
- [ ] **Шаг 5: Тест-прогон** сначала без `--yes`, затем с `--yes` после сборки из Task 5; повторный прогон не падает.
- [ ] **Шаг 6: Коммит** `feat(release): автообновление сайта, GitHub Releases и OneDrive`.

### Task 5: Пересборка, публикация, документация

**Files:**
- Modify: `AGENTS.md`, `README.md` (раздел про сайт и `npm run release`), `docs/rustore.md` при необходимости
- Build: `dist/*`, `www/`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: опубликованный релиз `v1.3.0` с APK/IPA, обновлённый OneDrive.

- [ ] **Шаг 1: Собрать** `npm run www`, `npm run android:apk`, `npm run ios:ipa` (APK/IPA уже с `sb-v17`).
- [ ] **Шаг 2: Проверить** контрольные суммы в `dist/RELEASE_NOTES.md` совпадают с файлами.
- [ ] **Шаг 3: Запустить** `npm run release -- --yes`, затем `curl -I` обеих ссылок — 200 и корректный `content-length`.
- [ ] **Шаг 4: Проверить OneDrive** — только `1.3.0`.
- [ ] **Шаг 5: Смоук сайта** — открыть опубликованный `/site/`, кнопки ведут на рабочие файлы.
- [ ] **Шаг 6: Обновить `AGENTS.md`** — раздел «Сайт-витрина», правило «каждый релиз: сайт + Releases + OneDrive, старые версии удаляются».
- [ ] **Шаг 7: Коммит + пуш** после подтверждения пользователя.
