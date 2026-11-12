/*
 * تصغير صورة اللوحة في المتصفح قبل رفعها
 * صورة الجوال (2–5 ميجابايت) تصبح تقريباً 100–200 كيلوبايت وتبقى اللوحة واضحة.
 * ملفات PDF تُرفع كما هي.
 */
const MAX_SIDE = 1600; // أقصى طول أو عرض بالبكسل
const QUALITY = 0.8;

export async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  try {
    // createImageBitmap يطبق اتجاه الصورة من بيانات الكاميرا (EXIF) في المتصفحات الحديثة
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // خلفية بيضاء للصور الشفافة (PNG)
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    // إن لم يصغر الحجم نرفع الأصل
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

export const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} ميجابايت` : `${Math.max(1, Math.round(n / 1024))} كيلوبايت`);
