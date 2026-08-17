/**
 * questions_ox の特定の1件（Dさん（67歳）の資金計画に関する記述）で、
 * q の1行目に元の4択の設問文（共通の書き出し）が残ってしまっているのを削除し、
 * 2行目（実際に正誤を判定する記述文）だけを残すワンオフスクリプト。
 *
 * 修正前:
 *   「ライフプラン実現のための資金計画に関する次の記述のうち、最も不適切なものはどれか。
 *    Dさん（67歳）は、年金受給を開始しながら、退職金を金融機関で管理し、計画に基づいて定期的に取り崩している。」
 * 修正後:
 *   「Dさん（67歳）は、年金受給を開始しながら、退職金を金融機関で管理し、計画に基づいて定期的に取り崩している。」
 *
 * 対象を誤って書き換えないよう、1行目・2行目とも完全一致するドキュメントのみを対象にする。
 * questions_ox 以外（questions / questions_jitsugi / cases）は書き込み対象にせず、
 * 該当しそうなものが見つかった場合は一覧表示のみ行うので、目視で確認すること。
 *
 * 既定は --dry-run を付けない限り書き込む（migrate_fix_ox_q.js 等と同じ運用）。
 *
 * 実行方法:
 *   node fix_dsan_shikin_keikaku_stem.js --dry-run   # まず件数と内容を確認
 *   node fix_dsan_shikin_keikaku_stem.js             # 実際に書き込む
 *
 * 実行には FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY の
 * 環境変数（Vercelの本番Firestoreへの管理者クレデンシャル）が必要。
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

const HEADER = 'ライフプラン実現のための資金計画に関する次の記述のうち、最も不適切なものはどれか。';
const BODY = 'Dさん（67歳）は、年金受給を開始しながら、退職金を金融機関で管理し、計画に基づいて定期的に取り崩している。';
const BEFORE_TEXT = `${HEADER}\n${BODY}`;

function truncate(s, n) {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const snap = await db.collection('questions_ox').get();
  console.log(`questions_ox: ${snap.size}件`);

  const updates = [];
  snap.forEach(doc => {
    const data = doc.data();
    const q = String(data.q || '');
    if (q === BEFORE_TEXT) {
      updates.push({ ref: doc.ref, id: doc.id, cat: data.cat, before: q, after: BODY });
    }
  });

  console.log(`修正対象（questions_ox）: ${updates.length}件`);
  updates.forEach((u, i) => {
    console.log(`  [${i + 1}] ${u.id}（${u.cat}）`);
    console.log(`      変更前: ${truncate(u.before, 120)}`);
    console.log(`      変更後: ${truncate(u.after, 120)}`);
  });

  // 参考情報: 他のコレクションにも同じ文言が残っていないか確認（自動修正はしない）
  for (const col of ['questions', 'questions_jitsugi']) {
    const s = await db.collection(col).get();
    const hits = [];
    s.forEach(doc => {
      const data = doc.data();
      const q = String(data.q || '');
      if (q.includes(BODY)) hits.push({ id: doc.id, q });
      if (Array.isArray(data.opts)) {
        data.opts.forEach((opt, idx) => {
          if (String(opt || '').includes(BODY)) hits.push({ id: `${doc.id}[opts:${idx}]`, q: opt });
        });
      }
    });
    if (hits.length) {
      console.log(`\n参考: ${col} に同じ記述文を含むドキュメントが${hits.length}件あります（自動修正対象外・目視確認推奨）`);
      hits.forEach(h => console.log(`  [${h.id}] ${truncate(h.q, 120)}`));
    }
  }

  const s = await db.collection('cases').get();
  const caseHits = [];
  s.forEach(doc => {
    const data = doc.data();
    const questions = Array.isArray(data.questions) ? data.questions : [];
    questions.forEach((q, idx) => {
      const text = typeof q === 'string' ? q : JSON.stringify(q);
      if (text.includes(BODY)) caseHits.push({ id: `${doc.id}[questions:${idx}]`, q: text });
    });
  });
  if (caseHits.length) {
    console.log(`\n参考: cases に同じ記述文を含むものが${caseHits.length}件あります（自動修正対象外・目視確認推奨）`);
    caseHits.forEach(h => console.log(`  [${h.id}] ${truncate(h.q, 120)}`));
  }

  if (dryRun) {
    console.log('\n--dry-run のため書き込みは行いません。');
    return;
  }

  if (updates.length === 0) {
    console.log('\n修正対象がないため終了します。');
    return;
  }

  const batch = db.batch();
  updates.forEach(u => batch.update(u.ref, { q: u.after }));
  await batch.commit();
  console.log(`\n完了: questions_ox の q を ${updates.length}件 修正しました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
