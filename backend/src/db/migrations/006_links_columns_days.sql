-- =====================================================================
-- 006: رابط خاص لكل عميل، اشتراك بالأيام، وعدد أعمدة البوابة (1 أو 2)
-- =====================================================================

-- رابط لوحة العميل الخاص: app.arakom.sa/c/{access_token}
ALTER TABLE tenants ADD COLUMN access_token TEXT;
UPDATE tenants SET access_token = encode(gen_random_bytes(18), 'hex') WHERE access_token IS NULL;
ALTER TABLE tenants ALTER COLUMN access_token SET NOT NULL;
ALTER TABLE tenants ALTER COLUMN access_token SET DEFAULT encode(gen_random_bytes(18), 'hex');
CREATE UNIQUE INDEX tenants_access_token_uq ON tenants (access_token);

-- عدد أعمدة البوابة (أذرع الحاجز):
--   1 = عمود واحد للدخول فقط
--   2 = عمودان: دخول وخروج
ALTER TABLE gates ADD COLUMN columns INT NOT NULL DEFAULT 2 CHECK (columns IN (1, 2));

-- الاشتراك بالأيام (مثلاً 30 يوماً) — آخر مدة أضافتها الإدارة
ALTER TABLE subscriptions ADD COLUMN last_added_days INT;
