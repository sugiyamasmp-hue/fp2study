const { db } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id は必須です' });

    const doc = await db.collection('cases').doc(id).get();
    if (!doc.exists) return res.status(200).json({ error: 'not found', case: null });

    const d = doc.data();
    return res.status(200).json({
      case: {
        id: doc.id,
        caseId: d.caseId || doc.id,
        title: d.title || '',
        familyInfo: d.familyInfo || '',
        data: d.data || null,
        questions: d.questions || [],
      },
    });
  } catch (error) {
    return res.status(200).json({ error: error.message, case: null });
  }
};
