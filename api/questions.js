const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
    }),
  });
}

const db = getFirestore();

async function getCategoryLevel(cat) {
  const snap = await db.collection('categoryStats').doc(cat).get();
  return snap.exists ? (snap.data().level || 1) : 1;
}

// レベル2（上級）に昇格した分野は上級問題を優先。まだ上級問題が無ければ初級にフォールバック
function filterByLevel(docs, level) {
  if (level < 2) return docs.filter(d => !d.level || d.level < 2);
  const hard = docs.filter(d => d.level >= 2);
  return hard.length > 0 ? hard : docs.filter(d => !d.level || d.level < 2);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { category, limit = 10, mode } = req.query;
    const limitNum = Number(limit);

    // 復習モード：間違えた問題を優先して出題
    if (mode === 'review') {
      const snapshot = await db.collection('wrongQuestions')
        .orderBy('lastWrongAt', 'desc')
        .limit(limitNum)
        .get();
      const questions = [];
      snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ questions, reviewEmpty: questions.length === 0 });
    }

    let questions = [];

    if (!category || category === 'all') {
      // 全分野
      const snapshot = await db.collection('questions').limit(limitNum * 3).get();
      snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
    } else if (category === '模擬試験') {
      // 模擬試験系は前方一致
      const snapshot = await db.collection('questions').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.cat && data.cat.startsWith('模擬試験')) {
          questions.push({ id: doc.id, ...data });
        }
      });
    } else {
      // 複数cat対応（カンマ区切り）。分野ごとの現在のレベルに応じて出題を絞り込む
      const cats = category.split(',').map(c => c.trim());
      for (const cat of cats) {
        const snapshot = await db.collection('questions').where('cat', '==', cat).limit(limitNum * 3).get();
        const docs = [];
        snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        const level = await getCategoryLevel(cat);
        questions.push(...filterByLevel(docs, level));
      }
    }

    // シャッフルして件数制限
    questions.sort(() => Math.random() - 0.5);
    questions = questions.slice(0, limitNum);

    return res.status(200).json({ questions });

  } catch (error) {
    return res.status(200).json({ error: error.message, questions: [] });
  }
};
