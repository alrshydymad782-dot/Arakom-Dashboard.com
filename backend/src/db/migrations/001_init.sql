-- =====================================================================
-- أراكم (Arakom) — بناء قاعدة البيانات
-- PostgreSQL 14+
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- المجمعات / المنشآت (العملاء)
-- ---------------------------------------------------------------------
CREATE TABLE tenants (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  contact_name     TEXT,
  phone            TEXT,
  email            TEXT,
  city             TEXT,
  country          CHAR(2) NOT NULL DEFAULT 'SA',
  address          TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  salla_customer_id TEXT UNIQUE,                 -- لربط مدفوعات سلة بالعميل
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tenants_phone_idx ON tenants (phone);
CREATE INDEX tenants_email_idx ON tenants (lower(email));

-- ---------------------------------------------------------------------
-- الباقات (تُربط بمنتجات متجر سلة عبر SKU)
-- ---------------------------------------------------------------------
CREATE TABLE plans (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  salla_sku      TEXT UNIQUE,                     -- رمز المنتج في متجر سلة
  duration_months INT NOT NULL DEFAULT 12 CHECK (duration_months > 0),
  max_vehicles   INT NOT NULL DEFAULT 200 CHECK (max_vehicles > 0),
  max_gates      INT NOT NULL DEFAULT 2 CHECK (max_gates > 0),
  price          NUMERIC(10, 2),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- الاشتراكات (اشتراك واحد حالي لكل مجمع)
-- ---------------------------------------------------------------------
CREATE TABLE subscriptions (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL UNIQUE REFERENCES tenants (id) ON DELETE CASCADE,
  plan_id       BIGINT REFERENCES plans (id) ON DELETE SET NULL,
  starts_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at       DATE NOT NULL,
  max_vehicles  INT NOT NULL DEFAULT 200 CHECK (max_vehicles > 0),
  auto_renew    BOOLEAN NOT NULL DEFAULT false,  -- تجديد آلي عند وصول دفعة من سلة
  grace_days    INT NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

-- ---------------------------------------------------------------------
-- المستخدمون
--   super_admin  : إدارة أراكم (admin.arakom.sa)
--   tenant_admin : مدير المجمع (app.arakom.sa)
--   tenant_guard : حارس/موظف أمن (يرى ويفتح البوابة فقط)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT REFERENCES tenants (id) ON DELETE CASCADE,
  username      TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin', 'tenant_admin', 'tenant_guard')),
  active        BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role = 'super_admin' AND tenant_id IS NULL) OR (role <> 'super_admin' AND tenant_id IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- البوابات الفيزيائية: كل بوابة = كاميرا دخول + كاميرا خروج + ريليه
-- code هو {gate_id} المستخدم في مواضيع MQTT: arakom/gates/{code}/...
-- ---------------------------------------------------------------------
CREATE TABLE gates (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{2,40}$'),
  name        TEXT NOT NULL,
  relay_id    INT NOT NULL DEFAULT 1,
  auto_open   BOOLEAN NOT NULL DEFAULT true,     -- فتح تلقائي للسيارات المسموح لها
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gates_tenant_idx ON gates (tenant_id);

-- ---------------------------------------------------------------------
-- الكاميرات (تُعرف بالرقم التسلسلي sn). تُسجَّل تلقائياً عند اتصالها
-- ---------------------------------------------------------------------
CREATE TABLE cameras (
  id               BIGSERIAL PRIMARY KEY,
  sn               TEXT NOT NULL UNIQUE,
  gate_id          BIGINT REFERENCES gates (id) ON DELETE SET NULL,
  direction        TEXT CHECK (direction IN ('in', 'out')),
  name             TEXT,
  model            TEXT,
  mac              TEXT,
  software_version TEXT,
  ip               TEXT,
  subtopic         TEXT,                         -- موضوع أوامر الكاميرا (من رسالة التسجيل)
  pubtopic         TEXT,                         -- موضوع نشر الكاميرا
  is_online        BOOLEAN NOT NULL DEFAULT false,
  last_seen_at     TIMESTAMPTZ,
  registered_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gate_id, direction)                    -- كاميرا دخول واحدة وكاميرا خروج واحدة لكل بوابة
);
CREATE INDEX cameras_gate_idx ON cameras (gate_id);

-- ---------------------------------------------------------------------
-- السيارات المسموح لها (Whitelist) لكل مجمع
-- plate_key: صيغة موحدة للمقارنة مثل ABJ1234 (تجمع العربي والإنجليزي)
-- ---------------------------------------------------------------------
CREATE TABLE vehicles (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  plate_key    TEXT NOT NULL,
  plate_ar     TEXT,
  plate_en     TEXT,
  owner_name   TEXT,
  unit_number  TEXT,
  phone        TEXT,
  car_make     TEXT,
  car_color    TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  valid_until  DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plate_key)
);

-- ---------------------------------------------------------------------
-- سجلات الحركة (دخول/خروج)
-- ---------------------------------------------------------------------
CREATE TABLE access_logs (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT REFERENCES tenants (id) ON DELETE CASCADE,
  gate_id       BIGINT REFERENCES gates (id) ON DELETE SET NULL,
  camera_id     BIGINT REFERENCES cameras (id) ON DELETE SET NULL,
  vehicle_id    BIGINT REFERENCES vehicles (id) ON DELETE SET NULL,
  camera_sn     TEXT,
  plate_raw     TEXT NOT NULL,
  plate_key     TEXT NOT NULL,
  plate_ar      TEXT,
  plate_en      TEXT,
  direction     TEXT CHECK (direction IN ('in', 'out')),
  decision      TEXT NOT NULL CHECK (decision IN ('opened', 'denied')),
  reason        TEXT NOT NULL,     -- whitelisted | manual | not_whitelisted | blocked | expired_vehicle
                                   -- subscription_expired | tenant_suspended | unassigned_camera | auto_open_disabled
  source        TEXT NOT NULL DEFAULT 'camera' CHECK (source IN ('camera', 'manual')),
  confidence    INT,
  plate_color   TEXT,
  car_color     TEXT,
  plate_image   TEXT,
  full_image    TEXT,
  opened_by     BIGINT REFERENCES users (id) ON DELETE SET NULL,
  camera_msg_id TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX access_logs_tenant_time_idx ON access_logs (tenant_id, occurred_at DESC);
CREATE INDEX access_logs_plate_idx ON access_logs (tenant_id, plate_key);
CREATE INDEX access_logs_time_idx ON access_logs (occurred_at DESC);
CREATE UNIQUE INDEX access_logs_camera_msg_uq ON access_logs (camera_sn, camera_msg_id) WHERE camera_msg_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- سجل أحداث MQTT (للمراقبة المباشرة في لوحة الإدارة)
-- ---------------------------------------------------------------------
CREATE TABLE mqtt_events (
  id          BIGSERIAL PRIMARY KEY,
  level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  event       TEXT NOT NULL,
  camera_sn   TEXT,
  topic       TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mqtt_events_time_idx ON mqtt_events (created_at DESC);

-- ---------------------------------------------------------------------
-- مدفوعات سلة
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT REFERENCES tenants (id) ON DELETE SET NULL,
  provider       TEXT NOT NULL DEFAULT 'salla',
  event          TEXT,
  order_id       TEXT NOT NULL,
  reference_id   TEXT,
  amount         NUMERIC(10, 2),
  currency       TEXT,
  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  sku            TEXT,
  status         TEXT NOT NULL CHECK (status IN ('applied', 'pending', 'unmatched', 'ignored')),  -- pending: بانتظار موافقة الإدارة (التجديد اليدوي)
  months_added   INT,
  raw            JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, order_id)
);

-- ---------------------------------------------------------------------
-- سجل العمليات (من فعل ماذا)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users (id) ON DELETE SET NULL,
  tenant_id   BIGINT REFERENCES tenants (id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_time_idx ON audit_log (created_at DESC);

-- ---------------------------------------------------------------------
-- عرض مساعد: هل اشتراك المجمع فعال اليوم؟
-- ---------------------------------------------------------------------
CREATE VIEW tenant_access_state AS
SELECT t.id AS tenant_id,
       t.status,
       s.ends_at,
       s.max_vehicles,
       (t.status = 'active'
        AND s.id IS NOT NULL
        AND CURRENT_DATE BETWEEN s.starts_at AND (s.ends_at + s.grace_days)) AS can_access
FROM tenants t
LEFT JOIN subscriptions s ON s.tenant_id = t.id;
