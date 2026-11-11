-- =====================================================================
-- 002: مدد الاشتراك الثابتة (شهر / 3 / 6 / سنة) من متجر سلة + مستند لوحة السيارة
-- =====================================================================

-- الاشتراكات تأتي من سلة مباشرة، فلا حاجة لجدول الباقات
ALTER TABLE subscriptions DROP COLUMN IF EXISTS plan_id;
DROP TABLE IF EXISTS plans;

-- آخر مدة مدفوعة (1 أو 3 أو 6 أو 12 شهراً)
ALTER TABLE subscriptions ADD COLUMN duration_months INT
  CHECK (duration_months IN (1, 3, 6, 12));

-- الحد الأقصى للسيارات اختياري: فارغ = بدون حد
ALTER TABLE subscriptions ALTER COLUMN max_vehicles DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN max_vehicles DROP DEFAULT;

-- التجديد من سلة يُطبَّق تلقائياً دائماً
ALTER TABLE subscriptions ALTER COLUMN auto_renew SET DEFAULT true;

-- اسم المنتج في سلة (لمعرفة المدة المدفوعة)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_name TEXT;

-- مستند لوحة السيارة: صورة (JPG/PNG/WEBP) أو PDF يرفعه مدير المجمع
ALTER TABLE vehicles ADD COLUMN document_path TEXT;
ALTER TABLE vehicles ADD COLUMN document_type TEXT CHECK (document_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));
ALTER TABLE vehicles ADD COLUMN document_name TEXT;
ALTER TABLE vehicles ADD COLUMN document_size INT;
ALTER TABLE vehicles ADD COLUMN document_uploaded_at TIMESTAMPTZ;
