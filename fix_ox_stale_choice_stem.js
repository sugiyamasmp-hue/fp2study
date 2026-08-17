/**
 * questions_ox の q に残っている旧4択の設問文（「〜に関する次の記述のうち、
 * 最も〜なものはどれか。」）を、○×形式向けの書き出しに直すワンオフスクリプト。
 *
 * convert_to_ox.js は q を「元の4択の設問文\n選択肢文」で作るため、1行目に
 * 上記のような「どれか」型の疑問文がそのまま残ってしまうケースがある。
 * 1行目だけを「〜に関する記述である。」に置き換え、2行目以降（実際に正誤を
 * 判定する記述文＝選択肢文）はそのまま保持する。
 *
 * 注意: 同種の書き換えをPythonで行うワンオフスクリプトが別途あったが、
 * `q` フィールド全体を新しい1行だけに置き換えてしまい、2行目の記述文
 * （○×の判定対象そのもの）を消してしまうバグがあった。本スクリプトは
 * それを踏まえ、1行目のみを置換し、2行目以降は変更しない。
 *
 * 2行目以降が無い（＝旧設問文しか無く、判定対象の記述文が無い）ドキュメントは
 * 書き換えると内容の無い問題になってしまうため対象から除外し、一覧に出力する。
 * それらは目視で個別に対応すること。
 *
 * 既定は --dry-run を付けない限り書き込む（migrate_fix_ox_q.js 等と同じ運用）。
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
const BATCH_LIMIT = 500;

const STEM_PATTERN = /^(.+?)に関する次の記述のうち、最も(.+?)なものはどれか。$/;

function truncate(s, n) {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const snap = await db.collection('questions_ox').get();
  console.log(`questions_ox: ${snap.size}件\n`);

  const updates = [];
  const skippedNoBody = [];

  snap.forEach(doc => {
    const data = doc.data();
    const q = String(data.q || '');
    const idx = q.indexOf('\n');
    const firstLine = idx === -1 ? q : q.slice(0, idx);
    const rest = idx === -1 ? '' : q.slice(idx); // 先頭に \n を含む2行目以降

    const m = firstLine.match(STEM_PATTERN);
    if (!m) return;

    if (!rest.trim()) {
      skippedNoBody.push({ id: doc.id, cat: data.cat, q });
      return;
    }

    const newQ = `${m[1]}に関する記述である。${rest}`;
    if (newQ === q) return;
    updates.push({ ref: doc.ref, id: doc.id, cat: data.cat, before: q, after: newQ });
  });

  console.log(`書き換え対象: ${updates.length}件`);
  updates.forEach((u, i) => {
    console.log(`  [${i + 1}] ${u.id}  （${u.cat}）`);
    console.log(`      変更前: ${truncate(u.before, 90)}`);
    console.log(`      変更後: ${truncate(u.after, 90)}`);
  });

  if (skippedNoBody.length) {
    console.log(`\n⚠ 2行目（実際の記述文）が無いため対象外にしたもの: ${skippedNoBody.length}件 — 目視確認してください`);
    skippedNoBody.forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.id}]  （${s.cat}）  ${truncate(s.q, 90)}`);
    });
  }

  if (dryRun) {
    console.log('\n--dry-run のため書き込みは行いません。');
    return;
  }

  if (updates.length === 0) {
    console.log('\n書き換え対象がないため終了します。');
    return;
  }

  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(u => batch.update(u.ref, { q: u.after }));
    await batch.commit();
    written += chunk.length;
  }
  console.log(`\n完了: questions_ox の q を ${written}件 書き換えました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
