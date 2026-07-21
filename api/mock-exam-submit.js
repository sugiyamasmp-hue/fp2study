const { db, FieldValue } = require('../lib/db');
const { DOMAINS } = require('../lib/categoryDomains');
const { MOCK_EXAM_PASS_SCORE, MOCK_EXAM_TOTAL_QUESTIONS } = require('../lib/mockExamConfig');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
