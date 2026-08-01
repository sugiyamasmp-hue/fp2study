const { db, FieldValue } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { status, answeredCount, correctCount, mode, source, cat } = req.body || {};
    const answered = Number(answeredCount) || 0;
    const correct = Number(correctCount) || 0;
    // ゼロ除算対策：1問も解いていない状態で中断した場合は正答率を0とする
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    const docRef = await db.collection('study_sessions').add({
      status: status || 'interrupted',
      answeredCount: answered,
      correctCount: correct,
      accuracy,
      mode: mode || null,
      source: source || null,
      cat: cat || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true, id: docRef.id, accuracy });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
