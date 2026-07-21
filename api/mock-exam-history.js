const { db } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
  } catch (error) {
    return res.status(200).json({ attempts: [], error: error.message });
  }
};
