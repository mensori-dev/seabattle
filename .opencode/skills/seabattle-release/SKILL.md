---
name: Seabattle Release
description: Релиз «Морского боя»: PWA-кэш, www/, подписанные APK/AAB, RuStore, GitHub Releases
---

# Seabattle Release

## Когда использовать

Перед публикацией веб-версии, сборкой APK/AAB, обновлением в RuStore или
GitHub Releases, при жалобах «у меня старая версия игры».

## Железные правила

- Пуш и деплой — **только после явного «да»** пользователя.
- `android/keystore.properties` и `android/keystore/*.jks` не коммитить,
  пароль из переписки в файлы и коммиты не писать.
- `node_modules`, `dist/`, `www/`, логи — не коммитить.

## Чек-лист перед релизом

1. `npm test` — 9/9.
2. Смоук в браузере: бот-бой и (если трогали) онлайн по skill `seabattle-online`.
3. `VERSION` в `sw.js` поднят, если менялись `index.html`, `style.css`, `js/*` —
   иначе установленные PWA останутся на старом кэше.
4. Версия в `package.json` и `android/app/build.gradle` (`versionName`/`versionCode`)
   согласованы; для стора `versionCode` увеличивается.
5. `privacy.html` отражает реальность: если появились новые сетевые запросы
   или данные — обновить раздел и дату.
6. `manifest.webmanifest` и иконки не разъехались с темой.

## PWA / GitHub Pages

```
npm test
git status --short
git add <файлы>
git commit -m "..."
git push origin main
```

Pages собирается из корня `main`; проверить после пуша:
`https://mensori-dev.github.io/seabattle/` и `.../privacy.html` (200).

## APK / AAB

Окружение (PowerShell):

```
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot'
$env:ANDROID_HOME = 'C:\Android\sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

Сборка:

```
npm run www
npx cap sync android
cd android
gradlew.bat assembleRelease bundleRelease --no-daemon
```

Результат: `android/app/build/outputs/apk/release/app-release.apk` и
`bundle/release/app-release.aab`. Копировать в `dist/` с понятными именами
(`seabattle-<version>-release.apk` / `.aab`).

Проверка подписи:

```
& "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --print-certs dist\seabattle-<version>-release.apk
```

В `android/gradle.properties` обязателен `android.overridePathCheck=true`
(в пути к проекту кириллица).

## RuStore

- Тексты карточки и чек-лист: `docs/rustore.md`.
- Скриншоты: `docs/screenshots/` (1080×1920), иконка `assets/icon-512.png`.
- Политика: `https://mensori-dev.github.io/seabattle/privacy.html`.
- Загружать APK/AAB, подписанные **release**-ключом; после одобрения —
  «Опубликовать».
- Обновление: поднять `versionCode`, собрать заново, загрузить новый артефакт.

## GitHub Releases

```
gh release create v<version> dist/seabattle-<version>.apk --title "..." --notes "..."
```

Проверить, что asset скачивается и совпадает по размеру с локальным файлом.

## Если «у меня старая версия»

1. Проверить `VERSION` в `sw.js` на сервере.
2. В браузере: DevTools → Application → Service Workers → Update/Unregister.
3. На телефоне: закрыть PWA полностью и открыть заново; в крайнем случае
   переустановить с домашнего экрана.
