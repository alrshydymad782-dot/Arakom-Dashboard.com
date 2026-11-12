-- =====================================================================
-- 003: الدخول بالبريد أو الجوال + رمز الدخول، فتح البوابة للجميع لمدة محددة،
--      وتبسيط السيارات (رقم اللوحة أو صورة/PDF فقط)
-- =====================================================================

-- ---------- الدخول بالبريد أو الجوال ----------
ALTER TABLE users ADD COLUMN email TEXT;
-- phone_key: آخر 9 أرقام من الجوال (يطابق 05xxxxxxxx و +9665xxxxxxxx و 9665xxxxxxxx)
ALTER TABLE users ADD COLUMN phone_key TEXT;
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_key_uq ON users (phone_key) WHERE phone_key IS NOT NULL;
UPDATE users SET phone_key = right(regexp_replace(phone, '\D', '', 'g'), 9)
  WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 9;

-- رموز الدخول المؤقتة (تُرسل للبريد) — يُحفظ الرمز مشفراً فقط
CREATE TABLE login_codes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_codes_user_idx ON login_codes (user_id, created_at DESC);

-- مصدر حساب المجمع: يدوي من الإدارة أو تلقائي عند الشراء من متجر سلة
ALTER TABLE tenants ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'salla'));

-- ---------- فتح البوابة لأي سيارة ----------
-- open_all_always: فتح دائم 24/7 ، open_all_until: فتح مؤقت حتى هذا الوقت (ساعة / 6 / 12 ساعة)
ALTER TABLE gates ADD COLUMN open_all_always BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE gates ADD COLUMN open_all_until TIMESTAMPTZ;
ALTER TABLE gates ADD COLUMN open_all_set_by BIGINT REFERENCES users (id) ON DELETE SET NULL;

-- ---------- تبسيط السيارات ----------
-- يمكن تسجيل السيارة برفع صورة/PDF للوحة فقط، ثم يُدخل رقمها لاحقاً
ALTER TABLE vehicles ALTER COLUMN plate_key DROP NOT NULL;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_plate_or_document CHECK (plate_key IS NOT NULL OR document_path IS NOT NULL) NOT VALID;
