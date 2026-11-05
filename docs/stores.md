# Магазины приложений: статус и чек-лист

Текущая версия — **1.5.0**, `versionCode 6`, `versionName "1.5.0"`,
package `dev.mensori.seabattle`.

## Что уже есть

| Площадка | Статус | Артефакт |
| --- | --- | --- |
| RuStore | на модерации | `dist/seabattle-1.5.0-release.apk` / `.aab` |
| GitHub Releases | опубликовано | тег `v1.5.0`, APK/AAB/IPA |
| Сайт-витрина | опубликовано | https://mensori-dev.github.io/seabattle/site/ |
| Яндекс Игры | не принимает новые игры | `dist/seabattle-yandex-1.5.0.zip` |
| VK Games | ждёт подтверждения кабинета выплат, затем модерация | `dist/seabattle-gamepush-1.5.0.zip` |
| VK Play | материалы готовы, нужна загрузка в кабинет | `dist/gamepush-assets.zip` |
| OK Games | одиночная сборка готова, нужны ключи OK (ИП/юрлицо есть) | `dist/seabattle-gamepush-1.5.0.zip` |
| Google Play | не начато | `dist/seabattle-1.5.0-release.aab` |
| App Store | не начато, нужен Apple Developer | unsigned IPA + подпись |

GamePush, VK/OK и VK Play описаны отдельно в `docs/gamepush.md`.

## RuStore

- [ ] Проверить статус модерации в RuStore Console.
- [ ] Если вернули замечания — исправить и загрузить `versionCode 6` заново;
      при новых правках поднять `versionCode` и `versionName`.
- [ ] В карточке: иконка 512×512, скриншоты 1080×1920, описание из
      `docs/rustore.md`, политика конфиденциальности.
- [ ] Проверить, что в APK нет тестовых данных и лишних разрешений.
- [ ] После публикации обновить `site/version.json` и ссылки на скачивание.

## Google Play

Нужен аккаунт Google Play Console (разовая регистрация) и подписанный AAB.

1. Создать приложение с package `dev.mensori.seabattle`.
2. Загрузить `dist/seabattle-1.5.0-release.aab` во внутреннее тестирование.
3. Заполнить:
   - название, краткое и полное описание (можно взять из `docs/rustore.md`);
   - иконку 512×512, feature graphic 1024×500, скриншоты телефона;
   - категорию «Игры», возрастной рейтинг 6+ (пройти опросник);
   - политику конфиденциальности:
     https://mensori-dev.github.io/seabattle/privacy.html;
   - Data safety: игра не показывает рекламу и не использует аналитику;
     ник и рейтинг передаются на сервер только для онлайн-комнаты и не
     хранятся постоянно; прогресс хранится локально на устройстве.
4. Проверить подпись: загрузка идёт с release-ключом, `versionCode 6`.
5. Пройти внутреннее тестирование на 1–2 устройствах, затем выкатить
   в закрытое/открытое тестирование и production.

Важно: если меняется `applicationId`, старые ключи и релизы перестают
подходить. `dev.mensori.seabattle` уже используется в RuStore.

## App Store / iOS

Нужен Apple Developer Program и Mac/CI с подписью. Сейчас собирается только
unsigned IPA для AltStore/Sideloadly.

1. Создать App ID `dev.mensori.seabattle` в Apple Developer.
2. Собрать подписанный архив в Xcode/CI (Capacitor-проект уже есть).
3. Загрузить в App Store Connect, заполнить карточку:
   - иконка 1024×1024, скриншоты iPhone;
   - описание, ключевые слова, поддержка и политика конфиденциальности;
   - возрастной рейтинг по опроснику;
   - App Privacy: локальный прогресс, ник/рейтинг для онлайна;
   - экспортное шифрование: только стандартный HTTPS/WebSocket.
4. Проверить онлайн-игру на реальном iPhone: WebSocket, сворачивание
   приложения, возврат в бой.
5. Отправить на review.

## Общий релизный цикл

1. Поднять версию в `package.json`, `android/app/build.gradle`
   (`versionCode` +1, `versionName`), `sw.js`/`js/app.js` (`sb-vNN`).
2. `npm.cmd test`, `npm.cmd run test:online`, `npm.cmd run yandex`,
   `npm.cmd run gamepush`.
3. `npm.cmd run shots` — свежие скриншоты.
4. `npm.cmd run android:apk` — подписанные APK/AAB.
5. `npm.cmd run ios:ipa` — unsigned IPA через GitHub Actions (нужен push).
6. `npm.cmd run release -- --yes` — GitHub Releases, сайт, OneDrive.
7. Обновить карточки магазинов и `docs/rustore.md`/`dist/RELEASE_NOTES.md`.

## Ассеты

- Иконки: `assets/icon-512.png`, `assets/icon-1024.png`,
  `assets/icon-maskable-512.png`.
- Скриншоты: `docs/screenshots/01-menu.png` … `06-online.png` (1080×1920).
- Тексты: `docs/rustore.md` (краткое/полное описание, что нового).
- Политика: `privacy.html`, опубликована на GitHub Pages.
- Промо для Яндекс Игр: `yandex-promo/` (иконка, обложка, скриншоты, видео).
