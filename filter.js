// Simple profanity filter (Azerbaijani / Russian / English).
// It runs in the browser, so it is a speed bump for honest users, not a hard guarantee: reports + moderators do the rest.
const LONG = ['пизд', 'ебан', 'ебат', 'ебал', 'ебуч', 'бляд', 'мудак', 'мудил', 'гандон', 'залуп', 'пидор', 'пидар', 'хуйн', 'хуев', 'хуяр',
  'fuck', 'shit', 'bitch', 'asshole', 'siktir', 'sikim', 'amcıq', 'orospu', 'qəhbə', 'peysər'];
const EXACT = new Set(['хуй', 'хуя', 'хую', 'хуе', 'сука', 'суки', 'сучка', 'ебать', 'бля', 'блять', 'блядь', 'fuck', 'shit', 'göt', 'sik', 'piç', 'amciq']);
export function isBad(text) {
  const t = (text || '').toLowerCase().replace(/ё/g, 'е').replace(/(.)\1{2,}/g, '$1').replace(/(?<=\p{L})[.*_\-](?=\p{L})/gu, '');
  return t.split(/[^\p{L}\p{N}]+/u).some(w => w && (EXACT.has(w) || LONG.some(s => w.includes(s))));
}