const { db, FieldValue, todayJST } = require('../lib/db');
const { DOMAINS } = require('../lib/categoryDomains');
const { buildGenresFromIds, roundIsComplete, computeCampView } = require('../lib/camp');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { genre, questionId, isCorrect } = req.body || {};
    if (!DOMAINS.includes(genre) || !questionId || typeof isCorrect !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'genre, questionId, isCorrect は必須です' });
    }

    const today = todayJST();
    const campRef = db.collection('camps').doc('main');
    let roundJustCompleted = null;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(campRef);
      if (!snap.exists) throw new Error('合宿プランがまだ作成されていません');
      const camp = snap.data();

      const roundKey = String(camp.currentRound);
      const round = camp.rounds[roundKey];
      const g = round && round.genres[genre];
      if (!round || round.status === '完了' || !g || g.questionIds.indexOf(questionId) === -1) {
        throw new Error('この問題は現在の周では解答できません');
      }

      // 同じ問題を再送された場合は多重カウントしない（中断・再読み込み対策）
      if (g.answeredIds.indexOf(questionId) === -1) {
        g.answeredIds.push(questionId);
        if (isCorrect) g.correctIds.push(questionId);
        else g.incorrectIds.push(questionId);

        camp.todayAnswered = camp.todayDate === today ? (camp.todayAnswered || 0) + 1 : 1;
        camp.todayDate = today;
      }

      if (roundIsComplete(round)) {
        round.status = '完了';
        roundJustCompleted = Number(roundKey);

        if (roundKey === '1') {
          // 2周目：1周目の不正解問題だけを抽出して出題
          const idsByDomain = {};
          DOMAINS.forEach(d => { idsByDomain[d] = round.genres[d] ? round.genres[d].incorrectIds.slice() : []; });
          const round2Genres = buildGenresFromIds(idsByDomain);
          const round2Total = DOMAINS.reduce((s, d) => s + round2Genres[d].questionIds.length, 0);

          if (round2Total === 0) {
            // 不正解が1問もなければ2周目は自動的に完了扱いにして3周目へ
            camp.rounds['2'] = { status: '完了', genres: round2Genres };
            const idsByDomainR3 = {};
            DOMAINS.forEach(d => { idsByDomainR3[d] = round.genres[d] ? round.genres[d].questionIds.slice() : []; });
            camp.rounds['3'] = { status: '進行中', genres: buildGenresFromIds(idsByDomainR3) };
            camp.currentRound = 3;
          } else {
            camp.rounds['2'] = { status: '進行中', genres: round2Genres };
            camp.currentRound = 2;
          }
        } else if (roundKey === '2') {
          // 3周目：再び全ジャンル全問（1周目の元の出題範囲）を出題
          const idsByDomainR3 = {};
          const r1 = camp.rounds['1'];
          DOMAINS.forEach(d => { idsByDomainR3[d] = r1.genres[d] ? r1.genres[d].questionIds.slice() : []; });
          camp.rounds['3'] = { status: '進行中', genres: buildGenresFromIds(idsByDomainR3) };
          camp.currentRound = 3;
        } else if (roundKey === '3') {
          camp.status = 'completed';
        }
      }

      camp.updatedAt = FieldValue.serverTimestamp();
      tx.set(campRef, camp);
    });

    const finalSnap = await campRef.get();
    const view = computeCampView(finalSnap.data(), today);
    return res.status(200).json({ ok: true, roundJustCompleted, camp: view });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
