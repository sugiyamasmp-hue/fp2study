const { db, FieldValue, todayJST, addDaysToDateStr } = require('../lib/db');
const { mapCategoryToDomain } = require('../lib/categoryDomains');
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

    // ダッシュボード用：今日の解答数・正答率・連続学習日数
    const today = todayJST();
    const progressRef = db.collection('user_progress').doc('main');
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(progressRef);
      const cur = snap.exists ? snap.data() : {};
      let todayAnswered = cur.todayDate === today ? (cur.todayAnswered || 0) : 0;
      let todayCorrect = cur.todayDate === today ? (cur.todayCorrect || 0) : 0;
      let currentStreak = cur.currentStreak || 0;
      let longestStreak = cur.longestStreak || 0;

      if (cur.lastAnsweredDate !== today) {
        // 今日初めての解答。前回が「昨日」なら連続記録を伸ばし、それ以外（初回・間が空いた）はリセットして1から
        currentStreak = cur.lastAnsweredDate === addDaysToDateStr(today, -1) ? currentStreak + 1 : 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      }

      todayAnswered += 1;
      if (isCorrect) todayCorrect += 1;

      tx.set(progressRef, {
        todayDate: today,
        todayAnswered,
        todayCorrect,
        lastAnsweredDate: today,
        currentStreak,
        longestStreak,
      }, { merge: true });
    });

    // ジャンル別（6分野）正答率
    const domain = mapCategoryToDomain(cat);
    if (domain) {
      const domainRef = db.collection('category_progress').doc(domain);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(domainRef);
        const cur = snap.exists ? snap.data() : { answered: 0, correct: 0 };
        const answered = (cur.answered || 0) + 1;
        const correct = (cur.correct || 0) + (isCorrect ? 1 : 0);
        tx.set(domainRef, { domain, answered, correct }, { merge: true });
      });
    }

    return res.status(200).json({ ok: true, leveledUp, newLevel, rate });

  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
