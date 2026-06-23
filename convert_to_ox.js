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
const BATCH_LIMIT = 500;

// 4択1問 → ○×4問。doc.idと選択肢indexから決定的なIDを作るので、再実行しても重複せず上書きされる
function buildOxQuestions(doc) {
  const q = doc.data();
  const correctIdx = Number(q.ans);

  return q.opts.map((optText, i) => ({
    id: `${doc.id}_${i}`,
    cat: q.cat,
    q: optText,
    opts: ['○', '×'],
    ans: i === correctIdx ? 0 : 1,
    ex: q.ex || '',
    sourceId: doc.id,
    sourceOptionIndex: i,
  }));
}

async function main() {
  const snapshot = await db.collection('questions').get();

  const oxQuestions = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!Array.isArray(data.opts) || data.ans === undefined) return;
    oxQuestions.push(...buildOxQuestions(doc));
  });

  console.log(`元の4択問題: ${snapshot.size}件 → ○×問題: ${oxQuestions.length}件 に変換`);

  let written = 0;
  for (let i = 0; i < oxQuestions.length; i += BATCH_LIMIT) {
    const chunk = oxQuestions.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    chunk.forEach(item => {
      const { id, ...data } = item;
      batch.set(db.collection('questions_ox').doc(id), data);
    });

    await batch.commit();
    written += chunk.length;
    console.log(`${written} / ${oxQuestions.length} 件処理済み`);
  }

  console.log(`完了: questions_ox コレクションへ ${written}件 保存しました`);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
