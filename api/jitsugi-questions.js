const { db } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snapshot = await db.collection('questions_jitsugi').get();
    const questions = [];
    snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ questions });
  } catch (error) {
    return res.status(200).json({ error: error.message, questions: [] });
  }
};
