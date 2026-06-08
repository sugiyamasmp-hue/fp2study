import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin初期化（重複初期化防止）
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { category, limit = 10 } = req.query;

    let query = db.collection('questions');

    // カテゴリ指定があればフィルタ
    if (category && category !== 'all') {
      query = query.where('cat', '==', category);
    }

    // 件数制限
    query = query.limit(Number(limit));

    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.status(200).json({ questions: [] });
    }

    const questions = [];
    snapshot.forEach(doc => {
      questions.push({ id: doc.id, ...doc.data() });
    });

    // シャッフル
    questions.sort(() => Math.random() - 0.5);

    return res.status(200).json({ questions });

  } catch (error) {
    return res.status(200).json({ error: 'エラー: ' + error.message, questions: [] });
  }
}
