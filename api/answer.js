const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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
const PROMOTION_RATE = 0.6;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { questionId, cat, isCorrect, level, mode, q, opts, ans, ex } = req.body;
    if (!questionId || !cat || typeof isCorrect !== 'boolean') {
      return res.status(400).json({ error: 'questionId, cat, isCorrect は必須です' });
    }
    const qLevel = Number(level) || 1;

    await db.collection('answerLog').add({
      questionId,
      cat,
      level: qLevel,
      isCorrect,
      mode: mode || 'chat',
      createdAt: FieldValue.serverTimestamp(),
    });

    const wrongRef = db.collection('wrongQuestions').doc(questionId);
    if (isCorrect) {
      await wrongRef.delete().catch(() => {});
    } else {
      await wrongRef.set({
        questionId,
        cat,
        level: qLevel,
        q: q || '',
        opts: opts || [],
        ans: ans ?? 0,
        ex: ex || '',
        missCount: FieldValue.increment(1),
        lastWrongAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const statsRef = db.collection('categoryStats').doc(cat);
    let leveledUp = false;
    let newLevel = 1;
    let rate = 0;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(statsRef);
      const cur = snap.exists ? snap.data() : { totalAnswered: 0, totalCorrect: 0, level: 1 };
      const totalAnswered = (cur.totalAnswered || 0) + 1;
      const totalCorrect = (cur.totalCorrect || 0) + (isCorrect ? 1 : 0);
      let lvl = cur.level || 1;
      rate = totalCorrect / totalAnswered;

      if (lvl < 2 && rate >= PROMOTION_RATE) {
        lvl = 2;
        leveledUp = true;
      }

      newLevel = lvl;
      tx.set(statsRef, { cat, totalAnswered, totalCorrect, level: lvl }, { merge: true });
    });

    return res.status(200).json({ ok: true, leveledUp, newLevel, rate });

  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
