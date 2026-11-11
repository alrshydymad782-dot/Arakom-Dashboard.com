'use strict';
/*
 * معالجة لوحات المركبات السعودية والخليجية
 * اللوحة السعودية: حتى 4 أرقام + حتى 3 أحرف، ولكل حرف عربي حرف لاتيني رسمي مقابل.
 * على اللوحة يقع كل حرف لاتيني تحت مقابله العربي، لذلك ترتيب القراءة اللاتيني (يسار←يمين)
 * هو عكس ترتيب القراءة العربي (يمين←يسار). مثال: عربي "ا ب ح" = لاتيني "J B A".
 * المفتاح الموحد = الأحرف اللاتينية بترتيب قراءتها + الأرقام، مثل: JBA1234
 */

const AR_TO_EN = {
  'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A',
  'ب': 'B', 'ح': 'J', 'د': 'D', 'ر': 'R', 'س': 'S', 'ص': 'X', 'ط': 'T',
  'ع': 'E', 'ق': 'G', 'ك': 'K', 'ل': 'L', 'م': 'Z', 'ن': 'N',
  'ه': 'H', 'ة': 'H', 'و': 'U', 'ى': 'V', 'ي': 'V',
};
const EN_TO_AR = { A: 'ا', B: 'ب', J: 'ح', D: 'د', R: 'ر', S: 'س', X: 'ص', T: 'ط', E: 'ع', G: 'ق', K: 'ك', L: 'ل', Z: 'م', N: 'ن', H: 'هـ', U: 'و', V: 'ى' };

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const toWesternDigits = (s) => String(s)
  .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
  .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d));
const toArabicDigits = (s) => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[d]);

// يحوّل أي نص لوحة (عربي، إنجليزي، أو الاثنين معاً كما ترسله بعض الكاميرات) إلى صيغة موحدة
function parsePlate(raw) {
  const original = String(raw || '').trim();
  // نزيل الرموز الصينية (مثل لون اللوحة) والفواصل والتطويل
  const s = original.replace(/[一-鿿]/g, '').replace(/ـ/g, '');

  const latinDigits = (s.match(/[0-9]/g) || []).join('');
  const arabicDigits = toWesternDigits((s.match(/[٠-٩۰-۹]/g) || []).join(''));
  const latin = (s.match(/[A-Za-z]/g) || []).map((c) => c.toUpperCase());
  const arabic = (s.match(/[ء-ي]/g) || []).map((c) => AR_TO_EN[c]).filter(Boolean);

  // نفضّل الجزء اللاتيني إن وجد، وإلا نحوّل العربي ونعكس ترتيبه
  const lettersEn = latin.length ? latin.join('') : arabic.reverse().join('');
  const digits = latinDigits || arabicDigits;

  const isSaudi = lettersEn.length >= 1 && lettersEn.length <= 3 && digits.length >= 1 && digits.length <= 4 &&
    [...lettersEn].every((c) => EN_TO_AR[c]);
  // الأحرف العربية بترتيب القراءة العربي
  const lettersAr = isSaudi ? [...lettersEn].reverse().map((c) => EN_TO_AR[c]).join(' ') : '';

  return {
    raw: original,
    key: lettersEn + digits,
    digits,
    lettersEn,
    lettersAr,
    digitsAr: toArabicDigits(digits),
    country: isSaudi ? 'SA' : 'OTHER',
    display: isSaudi ? `${[...lettersEn].join(' ')} ${digits}` : `${lettersEn} ${digits}`.trim() || original,
    displayAr: isSaudi ? `${lettersAr} ${toArabicDigits(digits)}` : original,
  };
}

const normalizeKey = (raw) => parsePlate(raw).key;

module.exports = { parsePlate, normalizeKey, toArabicDigits, toWesternDigits, AR_TO_EN, EN_TO_AR };
