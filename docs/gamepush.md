# GamePush: VK Games и OK Games

GamePush — один SDK для VK Games, OK Games и других площадок. Игра остаётся
обычным HTML5-билдом: GamePush даёт рекламу, паузу, `gameStart` и определение
платформы, а комнаты по-прежнему работают через Deno Deploy.

## Что уже готово

- `js/gamepush.js` — адаптер `window.GamePlatform` поверх `window.onGPInit(gp)`.
  Без SDK игра работает как обычно (кнопки рекламы скрыты).
- `scripts/build-gamepush.mjs` — сборка `dist/gamepush/` и архива
  `dist/seabattle-gamepush-<версия>.zip`.
- `npm run gamepush` — боевая сборка с SDK.
- `npm run gamepush:demo` — сборка без SDK для локальной проверки.

Отличия сборки от корня:

- нет PWA: service worker, `manifest.webmanifest`, apple-touch иконок и
  установки на домашний экран;
- шрифты локальные, без Google Fonts;
- остаётся онлайн-игра и ссылка на политику конфиденциальности;
- перед `app.js` подключаются `js/gamepush.js` и загрузчик SDK.

## 1. Создать проект в GamePush

1. Зарегистрироваться на <https://gamepush.com/> и создать проект игры.
2. Открыть **Настройки проекта** и скопировать:
   - `projectId`;
   - `publicToken`.
3. Создать в корне репозитория `gamepush.config.json` (он в `.gitignore`):

```json
{
  "projectId": "ваш_project_id",
  "publicToken": "ваш_public_token"
}
```

Можно не создавать файл, а передать переменные окружения:

```powershell
$env:GAMEPUSH_PROJECT_ID = "ваш_project_id"
$env:GAMEPUSH_PUBLIC_TOKEN = "ваш_public_token"
npm.cmd run gamepush
```

Токен публичный (он всё равно виден в HTML), но в git его лучше не класть:
конфиг уже исключён.

## 2. Собрать и проверить

```powershell
npm.cmd run yandex   # заодно проверяет, что общий app.js не сломал Яндекс
npm.cmd run gamepush
```

Готовые файлы:

- `dist/gamepush/` — распакованная игра;
- `dist/seabattle-gamepush-<версия>.zip` — архив для GamePush Hosting.

Локальная проверка без панели:

```powershell
npm.cmd run gamepush:demo
python -m http.server 5180 --directory dist/gamepush --bind 127.0.0.1
```

Открыть `http://127.0.0.1:5180/` и в консоли вызвать заглушку:

```js
window.onGPInit({
  language: 'ru',
  player: { ready: Promise.resolve() },
  on: function () {},
  gameStart: function () {},
  gameplayStart: function () {},
  gameplayStop: function () {},
  ads: {
    isFullscreenAvailable: true,
    isRewardedAvailable: true,
    showFullscreen: function () { return Promise.resolve(true); },
    showRewardedVideo: function () { return Promise.resolve(true); }
  }
});
```

`GamePlatform.available()` должен стать `true`, а `GamePlatform.ready()` и
`showInterstitial()` — отработать без ошибок. Демо-сборка не содержит SDK,
поэтому сама по себе кнопки рекламы не показывает.

## 3. Залить на GamePush Hosting

1. В панели GamePush открыть **Хостинг игр** → **Загрузить игру**.
2. Загрузить `dist/seabattle-gamepush-<версия>.zip` (до 200 МБ).
3. Дождаться сборки и проверить игру по выданной ссылке.
4. Опубликовать черновик и скопировать URL — он понадобится в настройках
   VK и OK.

## 4. VK Games

1. Создать приложение на <https://vk.com/apps?act=manage>:
   - тип — **Игра**;
   - платформа — **Web** / встраиваемое приложение.
2. Скопировать **App ID** и **Secret Key**.
3. В GamePush открыть **Платформы** → **VK Games** и добавить:
   - App ID;
   - Secret Key;
   - ссылку на хостинг GamePush.
4. В настройках VK-приложения указать URL игры (ссылка GamePush Hosting).
5. Реклама: зарегистрироваться на <https://appscentrum.com/apps>, добавить
   VK-приложение в **Медийная реклама → Приложения**. Без этого
   `showFullscreen`/`showRewardedVideo` могут быть недоступны.
6. Заполнить карточку приложения (иконка, скриншоты, описание, возраст 6+)
   и отправить на модерацию VK.

В VK нельзя показывать fullscreen-рекламу во время боя или перехода между
экранами. В игре межстраничная реклама вызывается только между матчами,
rewarded — по кнопке на экране результата.

## 5. OK Games (Одноклассники)

**Важно:** OK работает только с юридическими лицами или ИП. Самозанятые и
физические лица не подходят.

1. Зарегистрировать приложение в кабинете OK для разработчиков.
2. Получить по почте **App ID** и **Secret Key**.
3. В GamePush открыть **Платформы** → **OK Games** и добавить App ID,
   Secret Key и ссылку на хостинг.
4. Указать URL игры в настройках приложения OK.
5. Реклама на OK настраивается на стороне площадки; отдельный кабинет, как
   AppsCentrum для VK, не нужен.
6. Заполнить карточку и отправить на модерацию OK.

## 6. Что проверить перед модерацией

- [ ] Игра открывается по ссылке GamePush Hosting без консольных ошибок.
- [ ] В консоли нет 404 на `game-score.js` и предупреждений CORS.
- [ ] `GamePlatform.available()` — `true`; в логе есть `gameStart`.
- [ ] Кнопка rewarded-рекламы появляется на экране результата и выдаёт бонус
      только после `true`.
- [ ] Fullscreen-реклама не показывается во время боя.
- [ ] Пауза платформы останавливает музыку/звук и ход бота, resume возвращает.
- [ ] Онлайн-комната создаётся и подключается по коду (WebSocket Deno Deploy).
- [ ] Политика конфиденциальности открывается.
- [ ] Мобильная ширина 360 px: кнопки не меньше 32 px, ничего не обрезано.
- [ ] Нет внешних запросов, кроме GamePush SDK, шрифтов с собственного хостинга
      и WebSocket/HTTP Deno Deploy.

## 7. Ограничения и заметки

- GamePush SDK грузится с зеркал; загрузчик сам перебирает адреса. Если SDK
  не загрузился за 8 секунд, `whenReady()` возвращает `null`, игра работает
  без рекламы и платформенных вызовов.
- Прогресс игрока хранится в `localStorage` (`seabattle.profile.v2`). Облачные
  сохранения GamePush пока не подключены: для VK/OK это можно сделать позже
  через `gp.player` и `gp.storage`.
- Онлайн-комнаты живут в памяти инстанса Deno Deploy. После холодного старта
  или перехода на другой инстанс комната может не найтись — клиент делает два
  повтора, но для турниров понадобится внешнее хранилище.
- `sw.js` и PWA в сборку не входят: в iframe VK/OK service worker не нужен.
- После изменений в `index.html`, `style.css` или `js/*` поднимайте `sb-vNN`
  в `sw.js` и `SW_VERSION` в `js/app.js`, даже если GamePush-сборка PWA не
  использует: корневая игра и GitHub Pages должны получить свежий кэш.

## 8. Ссылки

- Документация: <https://docs.gamepush.com/ru/>
- Публикация на площадках: <https://docs.gamepush.com/ru/tutorials/publishing-the-game-on-platforms-guide/>
- VK Games: <https://docs.gamepush.com/ru/tutorials/adding-game-vk/>
- Реклама: <https://docs.gamepush.com/ru/docs/advertising/>
- Панель: <https://panel.gamepush.com/>
