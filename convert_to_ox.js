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

// 「誤っているもの」「不適切なもの」等、正解の選択肢自体が誤った記述である設問（逆パターン）の判定
const NEGATIVE_STEM_PATTERNS = [
  /誤って/, /間違って/, /不適切/, /適切でない/, /適切ではない/,
  /正しくない/, /ふさわしくない/, /あてはまらない/, /該当しない/,
];
function isNegativeStem(stem) {
  return NEGATIVE_STEM_PATTERNS.some(re => re.test(stem || ''));
}

// 4択1問 → ○×4問。doc.idと選択肢indexから決定的なIDを作るので、再実行しても重複せず上書きされる
// 通常の設問（正しいものを選べ）ではans番目の選択肢だけが正しい記述だが、
// 「誤っているものを選べ」型の設問ではans番目の選択肢だけが誤った記述で、他の3つが正しい記述になる。
// 設問文（q.q）のキーワードから型を判定し、選択肢ごとの○×を反転させる。
function buildOxQuestions(doc) {
  const q = doc.data();
  const correctIdx = Number(q.ans);
  const negative = isNegativeStem(q.q);

  return q.opts.map((optText, i) => {
    const isTrueStatement = negative ? (i !== correctIdx) : (i === correctIdx);
    return {
      id: `${doc.id}_${i}`,
      cat: q.cat,
      q: optText,
      opts: ['○', '×'],
      ans: isTrueStatement ? 0 : 1,
      ex: q.ex || '',
      sourceId: doc.id,
      sourceOptionIndex: i,
    };
  });
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
