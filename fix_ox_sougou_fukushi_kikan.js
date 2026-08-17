/**
 * questions_ox の「総合福祉団体定期保険」に関する設問で、主語が欠落したまま
 * 「保険期間は1年から5年の範囲内で被保険者ごとに設定できる。」となっている
 * ドキュメントを、主語を補って正しい設問文に修正するワンオフスクリプト。
 *
 * migrate_fix_ox_q.js 等に合わせ、既定は「--dry-run を付けない限り書き込む」。
 * 必ず --dry-run で対象件数を確認してから実行すること。
 */

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

const TARGET_Q = '保険期間は1年から5年の範囲内で被保険者ごとに設定できる。';
const FIXED_Q = '総合福祉団体定期保険の保険期間は1年から5年の範囲内で被保険者ごとに設定できる。';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔍 問題を検索中...\n');

  const snap = await db.collection('questions_ox').where('q', '==', TARGET_Q).get();

  if (snap.empty) {
    console.log('対象の問題は見つかりませんでした。');
    return;
  }

  console.log(`✅ ${snap.size}件見つかりました\n`);

  snap.forEach(doc => {
    console.log(`   ID: ${doc.id}`);
    console.log(`   修正前: ${doc.data().q}`);
    console.log(`   修正後: ${FIXED_Q}\n`);
  });

  if (dryRun) {
    console.log('--dry-run のため書き込みは行いません。');
    return;
  }

  const batch = db.batch();
  snap.forEach(doc => {
    batch.update(doc.ref, { q: FIXED_Q, updated_at: new Date() });
  });
  await batch.commit();

  console.log(`完了: questions_ox の ${snap.size}件 を修正しました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
