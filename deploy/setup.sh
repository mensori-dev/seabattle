#!/usr/bin/env bash
# Установка онлайн-сервера «Морского боя» на Ubuntu 24.04.
# Запуск из корня проекта: sudo bash deploy/setup.sh <домен> [email]
# Пример: sudo bash deploy/setup.sh 203.0.113.10.nip.io mensoridev@gmail.com
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-mensoridev@gmail.com}"
APP_DIR=/opt/seabattle
SERVICE_USER=seabattle

if [ "$(id -u)" -ne 0 ]; then
  echo "Нужен root: sudo bash deploy/setup.sh <домен>" >&2
  exit 1
fi
if [ -z "$DOMAIN" ]; then
  echo "Укажи домен: sudo bash deploy/setup.sh <домен> [email]" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
if [ ! -f "$ROOT/server/main.ts" ]; then
  echo "Не найден server/main.ts — запускай скрипт из папки проекта." >&2
  exit 1
fi

echo "==> Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl unzip nginx certbot python3-certbot-nginx

echo "==> Deno"
if ! command -v deno >/dev/null 2>&1; then
  DENO_INSTALL=/usr/local sh -c "$(curl -fsSL https://deno.land/install.sh)" -y
fi

echo "==> Пользователь и файлы"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$APP_DIR/server" "$APP_DIR/.deno"
install -m 0644 "$ROOT/server/main.ts" "$APP_DIR/server/main.ts"
install -m 0644 "$HERE/seabattle.service" /etc/systemd/system/seabattle.service
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

echo "==> systemd"
systemctl daemon-reload
systemctl enable seabattle
systemctl restart seabattle

echo "==> nginx"
install -m 0644 "$HERE/nginx-seabattle.conf" /etc/nginx/sites-available/seabattle
sed -i "s/server_name _;/server_name $DOMAIN;/" /etc/nginx/sites-available/seabattle
ln -sf /etc/nginx/sites-available/seabattle /etc/nginx/sites-enabled/seabattle
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> TLS"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> Проверка"
sleep 2
systemctl --no-pager --lines=5 status seabattle || true
curl -fsS "https://$DOMAIN/api/leaderboard" || {
  echo "Проверь вручную: journalctl -u seabattle -n 50" >&2
  exit 1
}

cat <<EOT

Готово. Адрес для клиента:

  js/online.js:  var PROD_URL = 'wss://$DOMAIN/ws';

Дальше:
  1. Поменять PROD_URL и собрать www/ + APK/AAB.
  2. npm.cmd run test:online -- wss://$DOMAIN/ws
  3. Обновить docs/rkn-notice.md и privacy.html: сервер в России.
EOT
