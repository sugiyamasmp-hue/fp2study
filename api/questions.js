/*
 * 問題取得の入口。source クエリで出題ロジックを切り替える（Vercel Hobbyプランの
 * Serverless Function 12個制限に収めるため、旧 /api/sukima-questions と
 * /api/jitsugi-questions をここへ統合している）。
 *   source 未指定 … 通常演習（分野・レベル・復習・差分優先）
 *   source=sukima … スキマ時間モード（全ジャンル均等ランダム）
 *   source=jitsugi … 実技モード（questions_jitsugi 全件）
 *   source=genre … 受験勉強モードのジャンル別○×（在庫から最大50問ランダム）
 *   source=genre&counts=1 … ジャンル選択画面に出す在庫数
 */
const { db } = require('../lib/db');
const { sanitizeOxExplanation, sanitizeOxQuestion } = require('../lib/oxExplanation');
const { DOMAINS, mapCategoryToDomain } = require('../lib/categoryDomains');

const SUKIMA_DEFAULT_LIMIT = 20;
// 受験勉強モードの○×学習フローは「1ジャンル＝50問セット」。スキマ時間モードの
// 先読みバッチもこの上限を共有する。在庫が50問に満たないジャンルは在庫の全問を返す
// （水増しはしない）。
const OX_SET_SIZE = 50;
// コレクション全体を読んでからシャッフルするので、同じインスタンスへの連続アクセスでは読み直さない
const POOL_CACHE_TTL_MS = 5 * 60 * 1000;
const questionPools = {}; // { [コレクション名]: { at, questions } }

/*
 * スキマ時間モード（全ジャンル均等ランダム）とジャンル別○×（受験勉強モード）で共有する母集団。
 * Firestoreのlimit()はドキュメントIDの並び順で先頭から取るため母集団が偏る（通常演習と同じ制約）。
 * 母集団が数百〜千件規模なのでコレクションを丸ごと1回読み、インスタンス内にキャッシュしてから抽選する。
 *
 * cat はFirestore上「年金」「タックス」など細かい表記揺れがあるため、ジャンル絞り込み用に
 * lib/categoryDomains.js の6分野へ丸めた domain を併せて持たせる（cat の完全一致で
 * where を掛けると表記揺れぶんの在庫を取りこぼす）。
 */
async function loadQuestionPool(collectionName) {
  const cached = questionPools[collectionName];
  if (cached && Date.now() - cached.at < POOL_CACHE_TTL_MS) return cached.questions;

  const snapshot = await db.collection(collectionName).get();
  const questions = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    // ○×化に失敗した設問（flag_exclude_ox.js が exclude を立てたもの）は出題しない
    if (d.exclude) return;
    if (!d.q || !Array.isArray(d.opts) || typeof d.ans !== 'number') return;
    questions.push({
      id: doc.id,
      cat: d.cat || '',
      domain: mapCategoryToDomain(d.cat),
      q: sanitizeOxQuestion(d.q, d.opts),
      opts: d.opts,
      ans: d.ans,
      ex: sanitizeOxExplanation(d.ex || '', d.opts),
    });
  });

  questionPools[collectionName] = { at: Date.now(), questions };
  return questions;
}

// 重複なしでn件抽選（Fisher-Yatesを全件に掛けるより軽い）
function pickRandom(pool, n) {
  const count = Math.min(n, pool.length);
  const used = new Set();
  const picked = [];
  while (picked.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picked.push(pool[i]);
  }
  return picked;
}

async function handleSukima(req, res) {
  const { format, limit } = req.query;
  const collectionName = format === 'ox' ? 'questions_ox' : 'questions';
  const limitNum = Math.min(Math.max(Number(limit) || SUKIMA_DEFAULT_LIMIT, 1), OX_SET_SIZE);

  const pool = await loadQuestionPool(collectionName);
  return res.status(200).json({ questions: pickRandom(pool, limitNum) });
}

// ジャンル選択画面に出す在庫数。実際の出題数は min(在庫, OX_SET_SIZE) になる
async function handleGenreCounts(req, res) {
  const collectionName = req.query.format === 'choice' ? 'questions' : 'questions_ox';
  const pool = await loadQuestionPool(collectionName);

  const counts = {};
  DOMAINS.forEach(d => { counts[d] = 0; });
  pool.forEach(q => {
    if (counts[q.domain] !== undefined) counts[q.domain] += 1;
  });

  // 「全ジャンルおまかせ」は6分野の合計（模擬試験・実技のcatは含めない）
  const all = DOMAINS.reduce((sum, d) => sum + counts[d], 0);
  return res.status(200).json({ counts, all, setSize: OX_SET_SIZE });
}

/*
 * 受験勉強モードのジャンル別○×出題。
 * ジャンルの在庫全体からランダムに最大 OX_SET_SIZE 問を抽出する。
 * 在庫が OX_SET_SIZE に満たない場合は在庫の全問を返す（水増ししない）。
 */
async function handleGenre(req, res) {
  if (req.query.counts !== undefined) return await handleGenreCounts(req, res);

  const { cat, limit, format } = req.query;
  const collectionName = format === 'choice' ? 'questions' : 'questions_ox';
  const limitNum = Math.min(Math.max(Number(limit) || OX_SET_SIZE, 1), OX_SET_SIZE);

  const pool = await loadQuestionPool(collectionName);
  const scoped = (!cat || cat === 'all')
    ? pool.filter(q => DOMAINS.includes(q.domain))
    : pool.filter(q => q.domain === cat);

  return res.status(200).json({
    questions: pickRandom(scoped, limitNum),
    available: scoped.length, // 在庫数（フロントの「◯問中◯問」表示用）
    setSize: OX_SET_SIZE,
  });
}

async function handleJitsugi(req, res) {
  const snapshot = await db.collection('questions_jitsugi').get();
  const questions = [];
  snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
  return res.status(200).json({ questions });
}

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
    const { source } = req.query;
    if (source === 'sukima') return await handleSukima(req, res);
    if (source === 'jitsugi') return await handleJitsugi(req, res);
    if (source === 'genre') return await handleGenre(req, res);

    const { category, limit = 10, mode, set, levelType } = req.query;
    const limitNum = Number(limit);
    const collectionName = set === 'ox' ? 'questions_ox' : 'questions';
    // 差分優先モード：2級から新しく登場する論点（level_type === 'gap'）だけに絞り込む
    const gapOnly = levelType === 'gap';

    // 復習モード：間違えた問題を優先して出題
    if (mode === 'review') {
      const snapshot = await db.collection('wrongQuestions')
        .orderBy('lastWrongAt', 'desc')
        .limit(limitNum)
        .get();
      const questions = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        questions.push({
          id: doc.id,
          ...data,
          q: sanitizeOxQuestion(data.q, data.opts),
          ex: sanitizeOxExplanation(data.ex, data.opts),
        });
      });
      return res.status(200).json({ questions, reviewEmpty: questions.length === 0 });
    }

    let questions = [];

    if (!category || category === 'all') {
      // 全分野（差分優先モードは母集団が偏るため全件取得してから絞り込む）
      const snapshot = gapOnly
        ? await db.collection(collectionName).get()
        : await db.collection(collectionName).limit(limitNum * 3).get();
      snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
    } else if (category === '模擬試験') {
      // 模擬試験系は前方一致
      const snapshot = await db.collection(collectionName).get();
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
        const snapshot = gapOnly
          ? await db.collection(collectionName).where('cat', '==', cat).get()
          : await db.collection(collectionName).where('cat', '==', cat).limit(limitNum * 3).get();
        const docs = [];
        snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        const level = await getCategoryLevel(cat);
        questions.push(...filterByLevel(docs, level));
      }
    }

    // ○×化に失敗した設問（棚卸しで判定不能となったもの）は出題対象から除外
    questions = questions.filter(q => !q.exclude);

    if (gapOnly) {
      questions = questions.filter(q => q.level_type === 'gap');
    }

    // シャッフルして件数制限
    questions.sort(() => Math.random() - 0.5);
    questions = questions.slice(0, limitNum)
      .map(q => ({ ...q, q: sanitizeOxQuestion(q.q, q.opts), ex: sanitizeOxExplanation(q.ex, q.opts) }));

    return res.status(200).json({ questions, gapEmpty: gapOnly && questions.length === 0 });

  } catch (error) {
    return res.status(200).json({ error: error.message, questions: [] });
  }
};
