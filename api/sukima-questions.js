const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { sanitizeOxExplanation } = require('../lib/oxExplanation');

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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// コレクション全体を読んでからシャッフルするので、同じインスタンスへの連続アクセスでは読み直さない
const CACHE_TTL_MS = 5 * 60 * 1000;
const pools = {}; // { [コレクション名]: { at, questions } }

/*
 * スキマ時間モードは「全ジャンルから均等ランダム」で出題する。
 * Firestoreのlimit()はドキュメントIDの並び順で先頭から取るため母集団が偏る（api/questions.js と同じ制約）。
 * 母集団が数百〜千件規模なのでコレクションを丸ごと1回読み、インスタンス内にキャッシュしてから抽選する。
 */
async function loadPool(collectionName) {
  const cached = pools[collectionName];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.questions;

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
      q: d.q,
      opts: d.opts,
      ans: d.ans,
      ex: sanitizeOxExplanation(d.ex || '', d.opts),
    });
  });

  pools[collectionName] = { at: Date.now(), questions };
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { format, limit } = req.query;
    const collectionName = format === 'ox' ? 'questions_ox' : 'questions';
    const limitNum = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const pool = await loadPool(collectionName);
    return res.status(200).json({ questions: pickRandom(pool, limitNum) });

  } catch (error) {
    return res.status(200).json({ error: error.message, questions: [] });
  }
};
