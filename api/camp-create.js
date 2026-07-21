const { db, FieldValue, todayJST } = require('../lib/db');
const { DOMAINS, mapCategoryToDomain } = require('../lib/categoryDomains');
const { DEFAULT_EXAM_DATE, buildGenresFromIds } = require('../lib/camp');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { startDate, examDate, dailyQuota } = req.body || {};
    const start = startDate || todayJST();
    const exam = examDate || DEFAULT_EXAM_DATE;

    // Firestoreの全問題をジャンル別に集計し、1周目（＝3周目の元データ）の問題ID一覧を作る
    const idsByDomain = {};
    DOMAINS.forEach(d => { idsByDomain[d] = []; });
    const snapshot = await db.collection('questions').get();
    snapshot.forEach(doc => {
      const domain = mapCategoryToDomain(doc.data().cat);
      if (domain && idsByDomain[domain]) idsByDomain[domain].push(doc.id);
    });

    const round1Genres = buildGenresFromIds(idsByDomain);
    const hasQuota = dailyQuota !== null && dailyQuota !== undefined && dailyQuota !== '';

    const campDoc = {
      startDate: start,
      examDate: exam,
      status: 'active',
      currentRound: 1,
      dailyQuotaOverride: hasQuota ? Number(dailyQuota) : null,
      todayDate: null,
      todayAnswered: 0,
      rounds: {
        '1': { status: '進行中', genres: round1Genres },
        '2': { status: '未着手', genres: {} },
        '3': { status: '未着手', genres: {} },
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection('camps').doc('main').set(campDoc);

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
