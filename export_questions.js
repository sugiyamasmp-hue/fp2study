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

async function main() {
  const snapshot = await db.collection('questions').get();
  const questions = [];
  snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));

  const outPath = path.join(__dirname, 'questions_export.json');
  fs.writeFileSync(outPath, JSON.stringify(questions, null, 2), 'utf-8');

  console.log(`${questions.length} 件のドキュメントを ${outPath} に書き出しました`);
}

main().catch(error => {
  console.error('エクスポートに失敗しました:', error);
  process.exit(1);
});
