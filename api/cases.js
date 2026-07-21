const { db } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snapshot = await db.collection('cases').get();
    const cases = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      cases.push({
        id: doc.id,
        caseId: d.caseId || doc.id,
        title: d.title || '',
        questionCount: Array.isArray(d.questions) ? d.questions.length : 0,
      });
    });
    return res.status(200).json({ cases });
  } catch (error) {
    return res.status(200).json({ cases: [], error: error.message });
  }
};
