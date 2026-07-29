const fs = require('fs');
const path = require('path');
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

async function main() {
  const filePath = process.argv[2] || path.join(__dirname, 'questions_ox_generated.json');
  const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const validIds = new Set(items.map(item => item.id));

  let written = 0;
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    chunk.forEach(item => {
      const { id, ...data } = item;
      batch.set(db.collection('questions_ox').doc(id), data);
    });

    await batch.commit();
    written += chunk.length;
    console.log(`${written} / ${items.length} 件処理済み`);
  }

  console.log(`完了: questions_ox コレクションへ ${written}件 保存しました`);

  // 変換対象から外れたドキュメント（例: 元問題の除外や再構成）を削除して整合させる
  const snapshot = await db.collection('questions_ox').get();
  const staleDocs = snapshot.docs.filter(doc => !validIds.has(doc.id));

  for (let i = 0; i < staleDocs.length; i += BATCH_LIMIT) {
    const chunk = staleDocs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log(`不要になった${staleDocs.length}件を削除しました`);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
