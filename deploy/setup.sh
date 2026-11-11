#!/usr/bin/env bash
# سكربت الإعداد الأول على السيرفر (Ubuntu). يُشغَّل مرة واحدة من مجلد المشروع:
#   bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(openssl rand -hex 32)
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$SECRET/" .env
  read -rp "النطاق (مثال: app.example.com): " DOMAIN
  read -rp "كلمة مرور المدير: " ADMIN_PASSWORD
  read -rp "كلمة مرور MQTT للوحة التحكم: " MQTT_PASSWORD
  read -rp "كلمة مرور MQTT للكاميرات: " CAM_PASSWORD
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/; s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$ADMIN_PASSWORD/; s/^MQTT_PASSWORD=.*/MQTT_PASSWORD=$MQTT_PASSWORD/" .env
  touch deploy/mosquitto/passwd
  docker run --rm -v "$PWD/deploy/mosquitto:/m" eclipse-mosquitto:2 sh -c \
    "mosquitto_passwd -b /m/passwd dashboard '$MQTT_PASSWORD' && mosquitto_passwd -b /m/passwd camera '$CAM_PASSWORD' && chmod 0700 /m/passwd"
fi

mkdir -p data deploy/mosquitto/data
docker compose up -d --build
echo "تم التشغيل. افتح https://$(grep ^DOMAIN= .env | cut -d= -f2)"
