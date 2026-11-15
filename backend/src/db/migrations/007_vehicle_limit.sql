-- حد أقصى للوحات كل عميل (افتراضياً 500)، يعدّله المدير من صفحة العميل
-- NULL = بدون حد
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_vehicles INT DEFAULT 500
  CHECK (max_vehicles IS NULL OR max_vehicles > 0);
