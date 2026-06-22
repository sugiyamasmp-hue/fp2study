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

// idがある項目は既存ドキュメントへmerge更新（例: easyフィールドの反映）
// idが無い項目は新規ドキュメントとして追加（例: generate_more.jsの生成結果）
async function main() {
  const filePath = process.argv[2] || path.join(__dirname, 'questions_generated.json');
  const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  let created = 0;
  let updated = 0;

  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    chunk.forEach(item => {
      const { id, ...data } = item;
      if (id) {
        batch.set(db.collection('questions').doc(id), data, { merge: true });
        updated++;
      } else {
        batch.set(db.collection('questions').doc(), data);
        created++;
      }
    });

    await batch.commit();
    console.log(`${Math.min(i + BATCH_LIMIT, items.length)} / ${items.length} 件処理済み`);
  }

  console.log(`完了: 新規 ${created}件 / 更新 ${updated}件 を questions コレクションへ反映しました`);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
