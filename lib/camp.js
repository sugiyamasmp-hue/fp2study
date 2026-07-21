const { DOMAINS } = require('./categoryDomains');
const { diffDaysStr } = require('./db');

// 合宿プラン（3周回学習）の試験日デフォルト値。作成画面で未入力の場合に使う。
const DEFAULT_EXAM_DATE = '2026-10-31';
const ROUND_KEYS = ['1', '2', '3'];

// ジャンルごとの問題IDリストから、進捗管理用の初期状態オブジェクトを組み立てる。
// 1周目・3周目（全ジャンル全問）にも、2周目（1周目の不正解のみ）にも使う共通処理。
function buildGenresFromIds(idsByDomain) {
  const genres = {};
  DOMAINS.forEach(domain => {
    const ids = idsByDomain[domain] || [];
    genres[domain] = { questionIds: ids.slice(), answeredIds: [], correctIds: [], incorrectIds: [] };
  });
  return genres;
}

function sumGenres(genres, field) {
  return DOMAINS.reduce((sum, domain) => {
    const g = genres[domain];
    return sum + (g ? g[field].length : 0);
  }, 0);
}

// 周のジャンル全てで「解答済み数 >= 出題数」になっていれば、その周は完了。
function roundIsComplete(round) {
  return DOMAINS.every(domain => {
    const g = round.genres[domain];
    if (!g) return true;
    return g.answeredIds.length >= g.questionIds.length;
  });
}

// アマド（マスコット犬）の応援メッセージ。日替わりでプールから1つ選ぶ。
const ACHIEVED_MESSAGES = [
  '今日のノルマ達成だよ！アマドも大喜び！🐶✨',
  'えらい！今日の分ちゃんとこなしたね。アマドも誇らしいよ！',
  'ノルマクリア！この調子で合宿完走しよう！',
  '今日もコツコツ、えらいぞ！アマドがしっぽブンブン振ってるよ！',
];
const NOT_ACHIEVED_MESSAGES = [
  'まだノルマまであと少し！アマドと一緒にもうひと踏ん張り！',
  '焦らなくて大丈夫、コツコツいこう。アマドも応援してるよ！',
  '今日はここまででもOK！明日もまた頑張ろうね！',
  'ちょっとずつでも前に進んでる！アマドはちゃんと見てるよ！',
];

function pickMessage(achieved) {
  const pool = achieved ? ACHIEVED_MESSAGES : NOT_ACHIEVED_MESSAGES;
  const seed = new Date().getDate();
  return pool[seed % pool.length];
}

// GET /api/camp・POST /api/camp-answer の両方で使う、camps/main ドキュメントからAPIレスポンスを組み立てる処理。
function computeCampView(camp, today) {
  const roundsView = ROUND_KEYS.map(key => {
    const round = camp.rounds[key] || { status: '未着手', genres: {} };
    const genres = DOMAINS.map(domain => {
      const g = round.genres[domain];
      const total = g ? g.questionIds.length : 0;
      const answered = g ? g.answeredIds.length : 0;
      const correct = g ? g.correctIds.length : 0;
      const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
      return { domain, total, answered, correct, accuracy };
    });
    return { round: Number(key), status: round.status, genres };
  });

  function remainingForRound(key, estimateFallback) {
    const round = camp.rounds[key];
    if (!round || round.status === '完了') return 0;
    const total = sumGenres(round.genres, 'questionIds');
    if (total > 0) return total - sumGenres(round.genres, 'answeredIds');
    return estimateFallback;
  }

  const round1 = camp.rounds['1'];
  const round1Total = round1 ? sumGenres(round1.genres, 'questionIds') : 0;
  // 2周目の母数はまだ確定していない間、1周目の「これまでの不正解数」を暫定見積もりとして使う
  const round1IncorrectSoFar = round1 ? sumGenres(round1.genres, 'incorrectIds') : 0;

  const remaining1 = remainingForRound('1', 0);
  const remaining2 = remainingForRound('2', round1IncorrectSoFar);
  const remaining3 = remainingForRound('3', round1Total);
  const totalRemaining = remaining1 + remaining2 + remaining3;

  const daysRemaining = Math.max(0, diffDaysStr(today, camp.examDate));
  const autoDailyQuota = daysRemaining > 0 ? Math.ceil(totalRemaining / daysRemaining) : totalRemaining;
  const todayQuota = (camp.dailyQuotaOverride !== null && camp.dailyQuotaOverride !== undefined)
    ? camp.dailyQuotaOverride
    : autoDailyQuota;
  const todayAnswered = camp.todayDate === today ? (camp.todayAnswered || 0) : 0;
  const achieved = todayQuota > 0 ? todayAnswered >= todayQuota : true;

  return {
    startDate: camp.startDate,
    examDate: camp.examDate,
    status: camp.status,
    currentRound: camp.currentRound,
    rounds: roundsView,
    daysRemaining,
    autoDailyQuota,
    dailyQuotaOverride: (camp.dailyQuotaOverride === undefined) ? null : camp.dailyQuotaOverride,
    totalRemaining,
    today: { date: today, answered: todayAnswered, quota: todayQuota, achieved },
    message: pickMessage(achieved),
  };
}

module.exports = {
  DEFAULT_EXAM_DATE,
  ROUND_KEYS,
  buildGenresFromIds,
  sumGenres,
  roundIsComplete,
  pickMessage,
  computeCampView,
};
