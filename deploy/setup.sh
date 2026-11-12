#!/usr/bin/env bash
# الإعداد الأول على سيرفر Ubuntu جديد. شغّله من مجلد المشروع:
#   bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# سيرفر صغير (أقل من 3GB رام): نضيف ذاكرة احتياطية 2GB حتى لا يتوقف أثناء بناء النظام
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3000 ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
  echo ">> إضافة ذاكرة احتياطية (Swap) 2GB..."
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v docker >/dev/null 2>&1; then
  echo ">> تثبيت Docker..."
  curl -fsSL https://get.docker.com | sh
fi

rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-32}"; }

if [ ! -f .env ]; then
  cp .env.example .env
  read -rp "نطاق لوحة الإدارة [admin.arakom.sa]: " ADMIN_HOST; ADMIN_HOST=${ADMIN_HOST:-admin.arakom.sa}
  read -rp "نطاق لوحة العملاء [app.arakom.sa]: " APP_HOST; APP_HOST=${APP_HOST:-app.arakom.sa}
  ADMIN_PASSWORD=$(rand 16)
  BACKEND_MQTT=$(rand 24)
  CAMERA_MQTT=$(rand 16)
  RELAY_MQTT=$(rand 16)
  sed -i \
    -e "s|^ADMIN_HOST=.*|ADMIN_HOST=$ADMIN_HOST|" \
    -e "s|^APP_HOST=.*|APP_HOST=$APP_HOST|" \
    -e "s|^APP_URL=.*|APP_URL=https://$APP_HOST|" \
    -e "s|^ADMIN_URL=.*|ADMIN_URL=https://$ADMIN_HOST|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(rand 48)|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rand 24)|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN_PASSWORD|" \
    -e "s|^MQTT_PASSWORD=.*|MQTT_PASSWORD=$BACKEND_MQTT|" .env
  chmod 600 .env

  echo ">> إنشاء حسابات Mosquitto..."
  touch deploy/mosquitto/passwd
  docker run --rm -v "$PWD/deploy/mosquitto:/m" eclipse-mosquitto:2 sh -c "
    mosquitto_passwd -b /m/passwd arakom-backend '$BACKEND_MQTT' &&
    mosquitto_passwd -b /m/passwd camera '$CAMERA_MQTT' &&
    mosquitto_passwd -b /m/passwd relay '$RELAY_MQTT' &&
    chown 1883:1883 /m/passwd && chmod 0600 /m/passwd"

  cat > deploy/CREDENTIALS.txt <<CRED
احفظ هذه البيانات في مكان آمن ثم احذف هذا الملف

لوحة الإدارة:   https://$ADMIN_HOST
  المستخدم:     admin
  كلمة المرور:  $ADMIN_PASSWORD

إعدادات MQTT في صفحة إعدادات كل كاميرا:
  الخادم:       $(curl -fsS https://api.ipify.org 2>/dev/null || echo 'عنوان IP السيرفر')
  المنفذ:       1883
  المستخدم:     camera
  كلمة المرور:  $CAMERA_MQTT

جهاز ريليه خارجي (اختياري): المستخدم relay / كلمة المرور $RELAY_MQTT
CRED
  chmod 600 deploy/CREDENTIALS.txt
fi

docker compose up -d --build
echo
echo "تم التشغيل. البيانات السرية في: deploy/CREDENTIALS.txt"
