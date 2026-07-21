const { db, FieldValue } = require('../lib/db');
const { DOMAINS, mapCategoryToDomain } = require('../lib/categoryDomains');
const { GENRE_QUESTION_COUNTS, MOCK_EXAM_PASS_SCORE, MOCK_EXAM_TOTAL_QUESTIONS } = require('../lib/mockExamConfig');

// 学科模擬試験モード関連のエンドポイントを1関数に集約（Vercel Hobbyプランの関数数上限対策）。
//   GET  /api/mock-exam                  … 出題取得（旧 api/mock-exam-questions.js）
//   GET  /api/mock-exam?action=history   … 受験履歴取得（旧 api/mock-exam-history.js）
//   POST /api/mock-exam                  … 採点・履歴保存（旧 api/mock-exam-submit.js）

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function handleQuestions(req, res) {
  // 6分野の通常問題プール（模擬試験専用cat・実技catは母集団から除外し、本番同様の学科問題から出題する）
  const snapshot = await db.collection('questions').get();
  const byDomain = {};
  DOMAINS.forEach(d => { byDomain[d] = []; });
  snapshot.forEach(doc => {
    const data = doc.data();
    const domain = mapCategoryToDomain(data.cat);
    if (domain && byDomain[domain]) {
      byDomain[domain].push({ id: doc.id, ...data });
    }
  });

  const questions = [];
  const shortage = {};
  DOMAINS.forEach(domain => {
    const need = GENRE_QUESTION_COUNTS[domain] || 0;
    const pool = shuffle(byDomain[domain].slice());
    const picked = pool.slice(0, need);
    if (picked.length < need) shortage[domain] = need - picked.length;
    questions.push(...picked.map(q => ({ ...q, domain })));
  });

  return res.status(200).json({
    questions,
    total: questions.length,
    shortage: Object.keys(shortage).length ? shortage : null,
  });
}

async function handleHistory(req, res) {
  const limit = Number(req.query.limit) || 30;
  const snapshot = await db.collection('mockExamHistory')
    .orderBy('createdAt', 'asc')
    .limitToLast(limit)
    .get();

  const attempts = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    attempts.push({
      id: doc.id,
      score: d.score,
      total: d.total,
      passScore: d.passScore,
      pct: d.pct,
      passed: d.passed,
      domainStats: d.domainStats || {},
      durationSec: d.durationSec || null,
      createdAt: d.createdAt ? d.createdAt.toDate().toISOString() : null,
    });
  });

  return res.status(200).json({ attempts });
}

async function handleSubmit(req, res) {
  const { answers, durationSec, autoSubmitted } = req.body;
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'answers は必須です' });
  }

  const domainStats = {};
  DOMAINS.forEach(d => { domainStats[d] = { answered: 0, correct: 0 }; });

  let score = 0;
  const batch = db.batch();
  answers.forEach(a => {
    const domain = DOMAINS.includes(a.domain) ? a.domain : null;
    if (domain) {
      domainStats[domain].answered += 1;
      if (a.isCorrect) domainStats[domain].correct += 1;
    }
    if (a.isCorrect) score += 1;

    const logRef = db.collection('answerLog').doc();
    batch.set(logRef, {
      questionId: a.questionId || null,
      cat: a.cat || domain || '',
      domain: domain || '',
      level: Number(a.level) || 1,
      isCorrect: !!a.isCorrect,
      mode: 'mock-exam',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  const total = answers.length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = score >= MOCK_EXAM_PASS_SCORE;

  const weakDomains = DOMAINS
    .map(d => {
      const s = domainStats[d];
      return { domain: d, answered: s.answered, correct: s.correct, accuracy: s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : null };
    })
    .filter(d => d.accuracy !== null)
    .sort((x, y) => x.accuracy - y.accuracy);

  const historyRef = db.collection('mockExamHistory').doc();
  batch.set(historyRef, {
    score,
    total,
    passScore: MOCK_EXAM_PASS_SCORE,
    totalQuestions: MOCK_EXAM_TOTAL_QUESTIONS,
    pct,
    passed,
    domainStats,
    durationSec: Number(durationSec) || null,
    autoSubmitted: !!autoSubmitted,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return res.status(200).json({
    ok: true,
    id: historyRef.id,
    score,
    total,
    passScore: MOCK_EXAM_PASS_SCORE,
    pct,
    passed,
    domainStats: weakDomains,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (req.query.action === 'history') return await handleHistory(req, res);
      return await handleQuestions(req, res);
    }
    if (req.method === 'POST') return await handleSubmit(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message, questions: [], attempts: [] });
  }
};
