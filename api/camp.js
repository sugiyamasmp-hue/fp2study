const { db, todayJST } = require('../lib/db');
const { computeCampView } = require('../lib/camp');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snap = await db.collection('camps').doc('main').get();
    if (!snap.exists) return res.status(200).json({ camp: null });

    const camp = snap.data();
    const today = todayJST();
    return res.status(200).json({ camp: computeCampView(camp, today) });
  } catch (error) {
    return res.status(200).json({ camp: null, error: error.message });
  }
};
