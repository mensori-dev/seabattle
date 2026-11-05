# GamePush: VK Games и OK Games

GamePush — один SDK для VK Games, OK Games и других площадок. Игра остаётся
обычным HTML5-билдом: GamePush даёт рекламу, паузу, `gameStart` и определение
платформы. Сборка для VK/OK — только одиночный бой с ботом, без онлайн-комнат.

## Что уже готово

- `js/gamepush.js` — адаптер `window.GamePlatform` поверх `window.onGPInit(gp)`.
  Без SDK игра работает как обычно (кнопки рекламы скрыты). Перед `gameStart`
  адаптер показывает preloader; если площадка не ответила за 12 секунд,
  игра стартует без него.
- `scripts/build-gamepush.mjs` — сборка `dist/gamepush/` и архива
  `dist/seabattle-gamepush-<версия>.zip`.
- `npm run gamepush` — боевая сборка с SDK.
- `npm run gamepush:demo` — сборка без SDK для локальной проверки.

Отличия сборки от корня:

- нет PWA: service worker, `manifest.webmanifest`, apple-touch иконок и
  установки на домашний экран;
- шрифты локальные, без Google Fonts;
- онлайн-игра вырезана, остаётся бой с ботом и ссылка на политику
  конфиденциальности;
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
    isPreloaderAvailable: true,
    showPreloader: function () { return Promise.resolve(true); },
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
3. Дождаться сборки и проверить игру по ссылке черновика.
4. Нажать «Опубликовать черновик». Для VK/OK нужна ссылка опубликованной
   версии вида `https://s3.eponesh.com/games/<projectId>/v<N>/`, а не
   `.../games/draft/...`. После каждой новой публикации номер версии растёт,
   и URL в настройках VK нужно обновлять.

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
экранами. В игре preloader показывается до `gameStart`, межстраничная реклама —
только между матчами (не раньше третьего боя и не чаще раза в 90 секунд),
rewarded — по кнопке на главном экране и на экране результата. Награда — +25
к рейтингу раз в день. Sticky-баннер код не вызывает: он перекрывал бы поле
на телефоне.

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
- [ ] Preloader показывается до старта игры и не блокирует загрузку дольше
      12 секунд.
- [ ] Кнопка rewarded-рекламы есть на главном экране и на экране результата;
      бонус выдаётся только после `true` и только раз в день.
- [ ] Fullscreen-реклама не показывается во время боя.
- [ ] Пауза платформы останавливает музыку/звук и ход бота, resume возвращает.
- [ ] Одиночный бой с ботом запускается и завершается без онлайна.
- [ ] Политика конфиденциальности открывается.
- [ ] Мобильная ширина 360 px: кнопки не меньше 32 px, ничего не обрезано.
- [ ] Нет внешних запросов, кроме GamePush SDK и шрифтов с собственного
      хостинга.

## 7. Ограничения и заметки

- GamePush SDK грузится с зеркал; загрузчик сам перебирает адреса. Если SDK
  не загрузился за 8 секунд, `whenReady()` возвращает `null`, игра работает
  без рекламы и платформенных вызовов.
- Прогресс игрока хранится в `localStorage` (`seabattle.profile.v2`). Облачные
  сохранения GamePush пока не подключены: для VK/OK это можно сделать позже
  через `gp.player` и `gp.storage`.
- Онлайн-комнаты в сборку VK/OK не входят: на площадках доступен только бой
  с ботом. Онлайн остаётся в корневой игре, PWA и мобильных приложениях.
- `sw.js` и PWA в сборку не входят: в iframe VK/OK service worker не нужен.
- После изменений в `index.html`, `style.css` или `js/*` поднимайте `sb-vNN`
  в `sw.js` и `SW_VERSION` в `js/app.js`, даже если GamePush-сборка PWA не
  использует: корневая игра и GitHub Pages должны получить свежий кэш.

## 8. Материалы для карточки VK Play

```powershell
npm.cmd run gamepush:assets          # иконки, обложки, фон, скриншоты
npm.cmd run gamepush:video           # видео 1080×1920, до 20 с
npm.cmd run gamepush:video:landscape # видео 1920×1080, до 20 с
```

Готовые файлы складываются в `dist/gamepush-assets/`, `dist/gamepush-video/`
и `dist/gamepush-video-landscape/`. Общий архив для загрузки в кабинет —
`dist/gamepush-assets.zip`. Скрипты используют демо-сборку `dist/gamepush`
(без SDK), поэтому перед генерацией выполните `npm.cmd run gamepush:demo`.

Требования VK Play: иконки 1024×1024, 4:3 512×384 и 2:3 800×1200; обложки
1920×1080 и 1080×1920; фон 1920×1080 без текста; скриншоты 1280×720 и
720×1280; видео MP4 до 20 с и 100 МБ, без чёрных полос. Тексты и безопасные
зоны — в `docs/vk-play-listing.md` и шаблонах PSD из Downloads.

## 9. Ссылки

- Документация: <https://docs.gamepush.com/ru/>
- Публикация на площадках: <https://docs.gamepush.com/ru/tutorials/publishing-the-game-on-platforms-guide/>
- VK Games: <https://docs.gamepush.com/ru/tutorials/adding-game-vk/>
- Реклама: <https://docs.gamepush.com/ru/docs/advertising/>
- Панель: <https://panel.gamepush.com/>
