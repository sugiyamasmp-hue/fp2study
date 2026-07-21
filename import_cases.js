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

// 想定する1件のフォーマット（cases_generated.json）:
// {
//   "caseId": "case-2024-01",
//   "title": "会社員Aさんの資産設計提案",
//   "familyInfo": "Aさん（42歳・会社員）、妻（40歳・パート）、長男（12歳）...",
//   "data": { "係数表": { "年利1%": { "終価係数": 1.010, ... } } },
//   "questions": [
//     { "questionId": "q1", "text": "Aさんの60歳時点の...を求めなさい。", "answerType": "number", "correctAnswer": 1234, "unit": "万円", "tolerance": 0, "ex": "解説文" },
//     { "questionId": "q2", "text": "次のうち最も適切なものはどれか。", "answerType": "choice", "choices": ["選択肢1","選択肢2","選択肢3"], "correctAnswer": 0, "ex": "解説文" }
//   ]
// }
async function main() {
  const filePath = process.argv[2] || path.join(__dirname, 'cases_generated.json');
  const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const { id, caseId, ...data } = item;
    const docId = id || caseId;
    if (docId) {
      await db.collection('cases').doc(docId).set({ caseId: caseId || docId, ...data }, { merge: true });
      updated++;
    } else {
      await db.collection('cases').add(data);
      created++;
    }
  }

  console.log(`完了: 新規 ${created}件 / 更新 ${updated}件 を cases コレクションへ反映しました`);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
