-- =====================================================================
-- 005: إعدادات النظام المحفوظة (مثل ربط بريد Outlook لإرسال رموز الدخول)
-- =====================================================================
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
