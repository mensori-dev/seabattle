# iPhone / IPA

## Что собирается

`npm run ios:ipa` запускает `.github/workflows/ios-ipa.yml` на macOS-раннере
GitHub Actions и скачивает готовый файл:

```
dist/seabattle-<версия>-unsigned.ipa
C:\Users\skamm\OneDrive\seabattle-<версия>-unsigned.ipa
```

Внутри — Capacitor-обёртка с тем же `www/`, что и Android/PWA.
Версия и build-номер берутся из `package.json` и `android/app/build.gradle`,
поэтому IPA и APK совпадают по версии.

## Почему unsigned

Windows не собирает iOS-приложения: нужен Xcode и macOS. GitHub Actions даёт
macOS, но **без Apple Developer Account** подписать IPA нельзя. Поэтому файл
собирается без подписи (`CODE_SIGNING_ALLOWED=NO`).

Что это значит:

- Двойным кликом на iPhone IPA не установится.
- Нужен AltStore, Sideloadly или Xcode с Apple ID — они переподпишут приложение
  под конкретный iPhone. Бесплатный Apple ID: подпись живёт 7 дней, потом
  приложение нужно переподписать.
- Для нормальной установки у друзей, TestFlight или App Store нужен
  Apple Developer Account ($99/год), сертификат и provision profile.

## Установка через Sideloadly (Windows + iPhone)

1. Установить iTunes из Microsoft Store (нужен драйвер Apple Mobile Device).
2. Скачать Sideloadly с https://sideloadly.io и установить.
3. Подключить iPhone кабелем, разблокировать, нажать «Trust».
4. Перетащить `seabattle-<версия>-unsigned.ipa` в Sideloadly.
5. Ввести Apple ID, нажать Start.
6. На iPhone: Настройки → Основные → VPN и управление устройством →
   доверять профилю разработчика.

## PWA — проще для друзей

Если не хочется возиться с подписью:

1. Открыть https://mensori-dev.github.io/seabattle/ в Safari.
2. «Поделиться» → «На экран Домой».
3. Игра откроется на весь экран и будет работать офлайн.

PWA не требует Apple ID, не истекает через 7 дней и обновляется само.

## Если появится Apple Developer Account

Тогда можно добавить в workflow шаги подписи:

- импорт сертификата и provisioning profile из GitHub Secrets;
- `xcodebuild archive` с `DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE=Manual`;
- экспорт `ExportOptions.plist` для ad-hoc/App Store;
- загрузка в TestFlight через `xcrun altool`/`notarytool`.

До этого момента в OneDrive лежит именно unsigned-сборка.
