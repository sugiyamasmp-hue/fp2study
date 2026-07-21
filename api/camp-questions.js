const { db } = require('../lib/db');
const { DOMAINS } = require('../lib/categoryDomains');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { genre } = req.query;
    if (!DOMAINS.includes(genre)) return res.status(400).json({ error: 'genre が不正です', questions: [] });

    const campSnap = await db.collection('camps').doc('main').get();
    if (!campSnap.exists) {
      return res.status(200).json({ error: '合宿プランがまだ作成されていません', questions: [] });
    }
    const camp = campSnap.data();

    // 順番スキップ不可：現在進行中の周以外の問題は取得させない
    const roundKey = String(camp.currentRound);
    const round = camp.rounds[roundKey];
    if (!round || round.status === '完了') {
      return res.status(200).json({ error: 'この周は現在利用できません', questions: [] });
    }

    const g = round.genres[genre];
    if (!g || g.questionIds.length === 0) {
      return res.status(200).json({ questions: [], round: camp.currentRound, genre, done: true });
    }

    // 解答済みの問題は除外し、中断した続きから再開できるようにする
    const answeredSet = new Set(g.answeredIds);
    const unansweredIds = g.questionIds.filter(id => !answeredSet.has(id));
    if (unansweredIds.length === 0) {
      return res.status(200).json({ questions: [], round: camp.currentRound, genre, done: true });
    }

    const refs = unansweredIds.map(id => db.collection('questions').doc(id));
    const docs = await db.getAll(...refs);
    const questions = docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() }));

    return res.status(200).json({ questions, round: camp.currentRound, genre });
  } catch (error) {
    return res.status(200).json({ error: error.message, questions: [] });
  }
};
