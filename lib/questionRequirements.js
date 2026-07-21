const { DOMAINS } = require('./categoryDomains');
const { GENRE_QUESTION_COUNTS } = require('./mockExamConfig');

// 「合宿3周分＋模擬試験1回分」をカバーできる目安必要数の定数管理。
// ROUND_SIZE_BY_DOMAIN: 合宿で1周する際にジャンルごとに解く問題数の目安（重複なしで回せる想定）。
// ジャンルごとに難易度・出題範囲の広さが異なるため、必要に応じて個別に調整してよい。
const ROUNDS = 3;
const ROUND_SIZE_BY_DOMAIN = DOMAINS.reduce((acc, domain) => {
  acc[domain] = 20;
  return acc;
}, {});

// 目安必要数 = 合宿1周分の問題数 × 周回数 + 模擬試験1回分（ジャンル別出題数）
const REQUIRED_COUNTS = DOMAINS.reduce((acc, domain) => {
  acc[domain] = (ROUND_SIZE_BY_DOMAIN[domain] || 0) * ROUNDS + (GENRE_QUESTION_COUNTS[domain] || 0);
  return acc;
}, {});

module.exports = { ROUNDS, ROUND_SIZE_BY_DOMAIN, REQUIRED_COUNTS };
