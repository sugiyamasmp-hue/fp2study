const { DOMAINS } = require('./categoryDomains');

// 学科模擬試験モード（本番形式）の設定。
// 本番のFP2級学科試験は60問・120分・6分野均等10問ずつの構成のため、それに合わせる。
// ジャンルごとの出題数はここを変更すれば比率を調整できる（合計が出題総数になるようにすること）。
const GENRE_QUESTION_COUNTS = DOMAINS.reduce((acc, domain) => {
  acc[domain] = 10;
  return acc;
}, {});

const MOCK_EXAM_TOTAL_QUESTIONS = Object.values(GENRE_QUESTION_COUNTS).reduce((a, b) => a + b, 0);
const MOCK_EXAM_DURATION_SEC = 120 * 60;
const MOCK_EXAM_PASS_RATE = 0.6;
const MOCK_EXAM_PASS_SCORE = Math.ceil(MOCK_EXAM_TOTAL_QUESTIONS * MOCK_EXAM_PASS_RATE);

module.exports = {
  GENRE_QUESTION_COUNTS,
  MOCK_EXAM_TOTAL_QUESTIONS,
  MOCK_EXAM_DURATION_SEC,
  MOCK_EXAM_PASS_RATE,
  MOCK_EXAM_PASS_SCORE,
};
