# Онлайн-сервер на российском VPS

Комплект для переезда с Deno Deploy на свой VPS. Нужен, чтобы убрать
трансграничную передачу из уведомления РКН и ускорить комнаты.

Рассчитан на Ubuntu 24.04 LTS, 1 vCPU / 1 ГБ RAM.

```
deploy/setup.sh              установка Deno, nginx и systemd-юнита
deploy/seabattle.service     systemd-юнит сервера комнат
deploy/nginx-seabattle.conf  reverse proxy: /ws и /api/leaderboard
```

## 1. Подготовка (5 минут)

1. Создать в панели Timeweb Cloud сервер: Ubuntu 24.04, 1 vCPU, 1 ГБ, 15 ГБ.
2. Записать публичный IPv4.
3. Подключиться по SSH:

```bash
ssh root@<IP>
```

4. Нужен домен или его замена. Если домена нет, берём бесплатный
   `nip.io`: для IP `203.0.113.10` имя будет `203.0.113.10.nip.io`.
   Let's Encrypt выдаёт на него нормальный сертификат.

## 2. Запуск установки

Скопировать папку `deploy` и `server` на сервер и выполнить:

```bash
sudo bash deploy/setup.sh <домен>
```

Пример:

```bash
sudo bash deploy/setup.sh 203.0.113.10.nip.io
```

Скрипт:
- ставит Deno в `/usr/local/bin/deno`;
- создаёт пользователя `seabattle` и папку `/opt/seabattle`;
- копирует `server/main.ts` и `deploy/seabattle.service`;
- включает systemd-юнит и автозапуск;
- настраивает nginx как reverse proxy на `127.0.0.1:8000`;
- выпускает TLS через Let's Encrypt.

## 3. Проверка

```bash
systemctl status seabattle        # активен
curl -s localhost:8000/api/leaderboard
curl -s https://<домен>/api/leaderboard
```

Затем в корне проекта изменить адрес сервера:

```js
// js/online.js
var PROD_URL = 'wss://<домен>/ws';
```

Пересобрать `www/`, APK и AAB, поднять PWA-кэш и проверить онлайн-смоук:

```bash
npm.cmd run test:online -- wss://<домен>/ws
```

## 4. Обновление сервера

```bash
scp server/main.ts root@<IP>:/opt/seabattle/server/main.ts
ssh root@<IP> systemctl restart seabattle
```

Комнаты живут в памяти, поэтому перезапуск обнуляет активные комнаты и
топ побед. Делать это лучше ночью.

## 5. После переезда

- `docs/rkn-notice.md`: убрать раздел про США и Deno Deploy, сервер в РФ.
- `privacy.html`: указать, что сервер находится в России.
- Форма РКН: снять пункт о трансграничной передаче.
- `docs/online.md`: обновить схему запуска.

## Если что-то не работает

| Симптом | Причина |
| --- | --- |
| 502 от nginx | сервер не запустился: `journalctl -u seabattle -n 50` |
| WebSocket не подключается | нет `Upgrade`/`Connection` в nginx |
| Сертификат не выдался | домен не указывает на IP или закрыт порт 80 |
