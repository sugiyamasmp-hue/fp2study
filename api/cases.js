const { db } = require('../lib/db');

// 実技モード（資産設計提案業務）の事例関連エンドポイントを1関数に集約（Vercel Hobbyプランの関数数上限対策）。
//   GET /api/cases        … 事例一覧取得（旧 api/cases.js）
//   GET /api/cases?id=X   … 事例詳細取得（旧 api/case-detail.js）

async function handleList(req, res) {
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
}

async function handleDetail(req, res, id) {
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
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    if (id) return await handleDetail(req, res, id);
    return await handleList(req, res);
  } catch (error) {
    return res.status(200).json({ error: error.message, cases: [], case: null });
  }
};
