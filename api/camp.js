const { db, FieldValue, todayJST } = require('../lib/db');
const { DOMAINS, mapCategoryToDomain } = require('../lib/categoryDomains');
const { DEFAULT_EXAM_DATE, buildGenresFromIds, roundIsComplete, computeCampView } = require('../lib/camp');

// 合宿プラン（3周回学習）関連のエンドポイントを1関数に集約。
// Vercel Hobbyプランのサーバーレス関数数上限（12個）を超えないよう、
// GET /api/camp（取得・出題）・POST /api/camp（作成・ノルマ変更・解答）を action で振り分ける。
//   GET  /api/camp                          … 合宿プラン取得（旧 api/camp.js）
//   GET  /api/camp?action=questions&genre=X … 出題取得（旧 api/camp-questions.js）
//   POST /api/camp {action:'create', ...}   … 合宿プラン作成（旧 api/camp-create.js）
//   POST /api/camp {action:'quota', ...}    … ノルマ手動変更（旧 api/camp-quota.js）
//   POST /api/camp {action:'answer', ...}   … 解答記録（旧 api/camp-answer.js）

async function handleGetCamp(req, res) {
  const snap = await db.collection('camps').doc('main').get();
  if (!snap.exists) return res.status(200).json({ camp: null });
  const camp = snap.data();
  const today = todayJST();
  return res.status(200).json({ camp: computeCampView(camp, today) });
}

async function handleGetQuestions(req, res) {
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
}

async function handleCreate(req, res) {
  const { startDate, examDate, dailyQuota } = req.body || {};
  const start = startDate || todayJST();
  const exam = examDate || DEFAULT_EXAM_DATE;

  // Firestoreの全問題をジャンル別に集計し、1周目（＝3周目の元データ）の問題ID一覧を作る
  const idsByDomain = {};
  DOMAINS.forEach(d => { idsByDomain[d] = []; });
  const snapshot = await db.collection('questions').get();
  snapshot.forEach(doc => {
    const domain = mapCategoryToDomain(doc.data().cat);
    if (domain && idsByDomain[domain]) idsByDomain[domain].push(doc.id);
  });

  const round1Genres = buildGenresFromIds(idsByDomain);
  const hasQuota = dailyQuota !== null && dailyQuota !== undefined && dailyQuota !== '';

  const campDoc = {
    startDate: start,
    examDate: exam,
    status: 'active',
    currentRound: 1,
    dailyQuotaOverride: hasQuota ? Number(dailyQuota) : null,
    todayDate: null,
    todayAnswered: 0,
    rounds: {
      '1': { status: '進行中', genres: round1Genres },
      '2': { status: '未着手', genres: {} },
      '3': { status: '未着手', genres: {} },
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection('camps').doc('main').set(campDoc);
  return res.status(200).json({ ok: true });
}

async function handleQuota(req, res) {
  const { dailyQuota } = req.body || {};
  const hasQuota = dailyQuota !== null && dailyQuota !== undefined && dailyQuota !== '';
  const value = hasQuota ? Number(dailyQuota) : null;

  const campRef = db.collection('camps').doc('main');
  const snap = await campRef.get();
  if (!snap.exists) return res.status(200).json({ ok: false, error: '合宿プランがまだ作成されていません' });

  await campRef.set({ dailyQuotaOverride: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const updated = await campRef.get();
  return res.status(200).json({ ok: true, camp: computeCampView(updated.data(), todayJST()) });
}

async function handleAnswer(req, res) {
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
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (req.query.action === 'questions') return await handleGetQuestions(req, res);
      return await handleGetCamp(req, res);
    }
    if (req.method === 'POST') {
      const action = (req.body || {}).action;
      if (action === 'create') return await handleCreate(req, res);
      if (action === 'quota') return await handleQuota(req, res);
      if (action === 'answer') return await handleAnswer(req, res);
      return res.status(400).json({ ok: false, error: 'action が不正です' });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error.message });
  }
};
