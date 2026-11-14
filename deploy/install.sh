#!/usr/bin/env bash
# =====================================================================
# تثبيت أراكم بأمر واحد على سيرفر Ubuntu جديد (كمستخدم root):
#   curl -fsSL https://raw.githubusercontent.com/alrshydymad782-dot/Arakom-Dashboard.com/claude/laughing-johnson-uwsszq/deploy/install.sh | bash
#
# - يثبّت git ويحمّل النظام إلى /root/arakom
# - بدون نطاق: يستخدم عناوين تجربة مجانية من sslip.io مبنية على عنوان السيرفر
#   (لاستخدام نطاقك: ADMIN_HOST=admin.example.com APP_HOST=app.example.com قبل الأمر)
# - يعمل التثبيت في الخلفية، فلا يتوقف إن انقطعت نافذة الأوامر
#   متابعته لاحقاً:  tail -f /root/arakom-install.log
# =====================================================================
set -euo pipefail

# كل الأوامر داخل دالة: يُحمَّل السكربت كاملاً قبل أن يبدأ التنفيذ (آمن مع curl | bash)
main() {
  REPO=https://github.com/alrshydymad782-dot/Arakom-Dashboard.com.git
  BRANCH=claude/laughing-johnson-uwsszq
  DIR=/root/arakom
  LOG=/root/arakom-install.log

  if [ "$(id -u)" -ne 0 ]; then
    echo "شغّل الأمر كمدير: اكتب أولاً  sudo -i  ثم أعد الأمر"
    exit 1
  fi

  echo ">> تجهيز السيرفر..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -qq
  apt-get install -y -qq git curl openssl >/dev/null

  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" pull -q
  else
    git clone -q -b "$BRANCH" "$REPO" "$DIR"
  fi
  cd "$DIR"

  # عناوين التجربة: admin.1-2-3-4.sslip.io تشير تلقائياً إلى عنوان السيرفر 1.2.3.4
  IP=$(curl -fsS https://checkip.amazonaws.com 2>/dev/null || curl -fsS https://api.ipify.org)
  IP=$(echo "$IP" | tr -d '[:space:]')
  DASHED=${IP//./-}
  export ADMIN_HOST=${ADMIN_HOST:-admin.$DASHED.sslip.io}
  export APP_HOST=${APP_HOST:-app.$DASHED.sslip.io}

  echo ">> لوحة الإدارة: https://$ADMIN_HOST"
  echo ">> لوحة العملاء: https://$APP_HOST"
  echo ">> جاري التثبيت (5 إلى 10 دقائق)... لا تغلق الصفحة"

  # في الخلفية مع سجل، حتى لا يتوقف إن انقطع الاتصال
  setsid -w nohup bash deploy/setup.sh </dev/null >"$LOG" 2>&1 &
  PID=$!
  tail -n +1 -f --pid="$PID" "$LOG" || true
  wait "$PID" && STATUS=0 || STATUS=$?

  echo
  if [ "$STATUS" -eq 0 ]; then
    echo "=============================================="
    echo "  تم تثبيت أراكم بنجاح"
    echo "=============================================="
    cat deploy/CREDENTIALS.txt
    echo
    echo "احفظ البيانات أعلاه ثم احذف الملف بالأمر:  rm $DIR/deploy/CREDENTIALS.txt"
  else
    echo "حدث خطأ أثناء التثبيت. صوّر الشاشة، أو اعرض آخر السجل بالأمر:  tail -n 50 $LOG"
  fi
}

main "$@"
