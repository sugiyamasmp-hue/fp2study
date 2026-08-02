const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// convert_to_ox.js のバグ（元の設問文=シナリオを捨てて選択肢文のみを q に入れていた）により
// 既に questions_ox コレクションへ書き込まれてしまった不完全な問題文を、questions（4択の原本）を
// 正として一括修復するワンオフの移行スクリプト。
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const sourceSnap = await db.collection('questions').get();
  const sourceById = new Map();
  sourceSnap.forEach(doc => sourceById.set(doc.id, doc.data()));
  console.log(`questions（原本）: ${sourceById.size}件`);

  const oxSnap = await db.collection('questions_ox').get();
  console.log(`questions_ox（既存）: ${oxSnap.size}件`);

  const updates = [];
  let alreadyOk = 0;
  let missingSource = 0;

  oxSnap.forEach(doc => {
    const data = doc.data();
    // standalone: true は4択の展開ではなく単体で書かれた○×。原本から q を作り直すと
    // 記述文が壊れるため対象外にする（import_gakka_202505_ox.js で投入したもの）
    if (data.standalone === true) return;
    const source = sourceById.get(data.sourceId);
    if (!source || !Array.isArray(source.opts)) {
      missingSource++;
      return;
    }
    const optText = source.opts[data.sourceOptionIndex];
    if (optText === undefined) {
      missingSource++;
      return;
    }
    const expectedQ = `${source.q}\n${optText}`;
    if (data.q === expectedQ) {
      alreadyOk++;
      return;
    }
    updates.push({ ref: doc.ref, id: doc.id, q: expectedQ });
  });

  console.log(`既に修復済み: ${alreadyOk}件 / 原本が見つからずスキップ: ${missingSource}件 / 修復対象: ${updates.length}件`);

  if (updates.length > 0) {
    console.log('修復対象の例（先頭3件）:');
    updates.slice(0, 3).forEach(u => console.log(`  [${u.id}] -> ${JSON.stringify(u.q)}`));
  }

  if (dryRun) {
    console.log('--dry-run のため書き込みは行いません。');
    return;
  }

  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(u => batch.update(u.ref, { q: u.q }));
    await batch.commit();
    written += chunk.length;
    console.log(`${written} / ${updates.length} 件書き込み済み`);
  }

  console.log(`完了: questions_ox の ${written}件 を修復しました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
