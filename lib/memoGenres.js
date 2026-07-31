// 学習メモのジャンル定義。
// index.html 側の MEMO_GENRES と同じ内容を保持しているので、片方を変更したらもう片方も揃えること
// （このアプリは静的HTML＋Vercel Functions構成で、クライアントからサーバのCommonJSモジュールを
//  直接読み込めないため。CATEGORIES／categoryDomains.js と同じ扱い）。
const GENRES = [
  { code: 'life_planning', label: 'ライフプランニング', color: '#2563eb' },
  { code: 'risk', label: 'リスク管理', color: '#e11d48' },
  { code: 'asset_management', label: '金融資産運用', color: '#059669' },
  { code: 'tax', label: 'タックスプランニング', color: '#d97706' },
  { code: 'real_estate', label: '不動産', color: '#7c3aed' },
  { code: 'inheritance', label: '相続・事業承継', color: '#0891b2' },
  { code: 'other', label: 'その他・雑感', color: '#6b7280' },
];

const GENRE_CODES = GENRES.map(g => g.code);
const DEFAULT_GENRE = 'other';

// メモ1件あたりの本文の上限。音声入力で長文を貼られてもFirestoreの1MB上限に余裕を持って収まる長さ。
const MAX_CONTENT_LENGTH = 5000;

function isValidGenre(code) {
  return GENRE_CODES.indexOf(code) !== -1;
}

module.exports = { GENRES, GENRE_CODES, DEFAULT_GENRE, MAX_CONTENT_LENGTH, isValidGenre };
