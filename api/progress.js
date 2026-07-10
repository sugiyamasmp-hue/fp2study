const { db, todayJST, addDaysToDateStr } = require('../lib/db');
const { DOMAINS, MOCK_EXAM_CATEGORY } = require('../lib/categoryDomains');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const today = todayJST();

    const progressSnap = await db.collection('user_progress').doc('main').get();
    const p = progressSnap.exists ? progressSnap.data() : {};
    // todayDateが古い場合（今日まだ何も解いていない）は0件として返す。書き込みはしない（読み取り専用）。
    const isToday = p.todayDate === today;
    const todayAnswered = isToday ? (p.todayAnswered || 0) : 0;
    const todayCorrect = isToday ? (p.todayCorrect || 0) : 0;
    const todayAccuracy = todayAnswered > 0 ? Math.round((todayCorrect / todayAnswered) * 100) : 0;
    // 連続学習日数も、今日または昨日のいずれかに解答していなければ途切れているとみなす
    const streakAlive = p.lastAnsweredDate === today || p.lastAnsweredDate === addDaysToDateStr(today, -1);
    const currentStreak = streakAlive ? (p.currentStreak || 0) : 0;

    const domainSnaps = await Promise.all(
      DOMAINS.map(d => db.collection('category_progress').doc(d).get())
    );
    const categories = DOMAINS.map((domain, i) => {
      const d = domainSnaps[i].exists ? domainSnaps[i].data() : { answered: 0, correct: 0 };
      const answered = d.answered || 0;
      const correct = d.correct || 0;
      const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
      return { domain, answered, correct, accuracy };
    }).sort((a, b) => {
      // 未挑戦(accuracy=null)は最後、それ以外は正答率が低い順
      if (a.accuracy === null && b.accuracy === null) return 0;
      if (a.accuracy === null) return 1;
      if (b.accuracy === null) return -1;
      return a.accuracy - b.accuracy;
    });

    const mockSnap = await db.collection('category_progress').doc(MOCK_EXAM_CATEGORY).get();
    const m = mockSnap.exists ? mockSnap.data() : { answered: 0, correct: 0 };
    const mockAnswered = m.answered || 0;
    const mockCorrect = m.correct || 0;
    const mockExam = {
      domain: MOCK_EXAM_CATEGORY,
      answered: mockAnswered,
      correct: mockCorrect,
      accuracy: mockAnswered > 0 ? Math.round((mockCorrect / mockAnswered) * 100) : null,
    };

    return res.status(200).json({
      today: { answered: todayAnswered, correct: todayCorrect, accuracy: todayAccuracy },
      streak: { current: currentStreak, longest: p.longestStreak || 0 },
      categories,
      mockExam,
    });
  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
};
