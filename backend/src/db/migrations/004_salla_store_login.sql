-- =====================================================================
-- 004: الدخول بحساب متجر أراكم على سلة
-- تُحفظ صلاحية الوصول لمتجرك (Access Token) التي ترسلها سلة عند تثبيت تطبيق أراكم على المتجر،
-- ليتحقق النظام من أن العميل مسجل في المتجر قبل السماح له بالدخول.
-- =====================================================================
CREATE TABLE salla_tokens (
  id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- متجر واحد فقط (متجر أراكم)
  merchant_id    TEXT,
  merchant_name  TEXT,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,
  scope          TEXT,
  expires_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
