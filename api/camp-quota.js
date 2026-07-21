const { db, FieldValue, todayJST } = require('../lib/db');
const { computeCampView } = require('../lib/camp');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { dailyQuota } = req.body || {};
    const hasQuota = dailyQuota !== null && dailyQuota !== undefined && dailyQuota !== '';
    const value = hasQuota ? Number(dailyQuota) : null;

    const campRef = db.collection('camps').doc('main');
    const snap = await campRef.get();
    if (!snap.exists) return res.status(200).json({ ok: false, error: '合宿プランがまだ作成されていません' });

    await campRef.set({ dailyQuotaOverride: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const updated = await campRef.get();
    return res.status(200).json({ ok: true, camp: computeCampView(updated.data(), todayJST()) });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
