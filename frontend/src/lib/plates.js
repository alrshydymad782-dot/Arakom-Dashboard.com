// نفس منطق الخادم لمعاينة اللوحة السعودية قبل الحفظ
const AR_TO_EN = {
  'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A', 'ب': 'B', 'ح': 'J', 'د': 'D', 'ر': 'R', 'س': 'S', 'ص': 'X', 'ط': 'T',
  'ع': 'E', 'ق': 'G', 'ك': 'K', 'ل': 'L', 'م': 'Z', 'ن': 'N', 'ه': 'H', 'ة': 'H', 'و': 'U', 'ى': 'V', 'ي': 'V',
};
export const EN_TO_AR = { A: 'ا', B: 'ب', J: 'ح', D: 'د', R: 'ر', S: 'س', X: 'ص', T: 'ط', E: 'ع', G: 'ق', K: 'ك', L: 'ل', Z: 'م', N: 'ن', H: 'هـ', U: 'و', V: 'ى' };
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toArabicDigits = (s) => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[d]);

export function plateKey(raw) {
  const s = String(raw || '').replace(/ـ/g, '');
  const latin = (s.match(/[A-Za-z]/g) || []).map((c) => c.toUpperCase());
  const arabic = (s.match(/[ء-ي]/g) || []).map((c) => AR_TO_EN[c]).filter(Boolean);
  const digits = (s.match(/[0-9]/g) || []).join('') || (s.match(/[٠-٩]/g) || []).map((c) => AR_DIGITS.indexOf(c)).join('');
  return (latin.length ? latin.join('') : arabic.reverse().join('')) + digits;
}

export function splitKey(key) {
  const k = String(key || '');
  const letters = k.replace(/[0-9]/g, '');
  const digits = k.replace(/[^0-9]/g, '');
  const saudi = letters.length >= 1 && letters.length <= 3 && digits.length >= 1 && digits.length <= 4 && [...letters].every((c) => EN_TO_AR[c]);
  return { letters, digits, saudi };
}
