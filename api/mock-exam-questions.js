const { db } = require('../lib/db');
const { DOMAINS, mapCategoryToDomain } = require('../lib/categoryDomains');
const { GENRE_QUESTION_COUNTS } = require('../lib/mockExamConfig');

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
  } catch (error) {
    return res.status(200).json({ error: error.message, questions: [] });
  }
};
