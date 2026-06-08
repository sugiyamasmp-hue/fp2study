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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { category, limit = 10 } = req.query;
    const limitNum = Number(limit);

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
      // 複数cat対応（カンマ区切り）
      const cats = category.split(',').map(c => c.trim());
      for (const cat of cats) {
        const snapshot = await db.collection('questions').where('cat', '==', cat).limit(limitNum).get();
        snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
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
