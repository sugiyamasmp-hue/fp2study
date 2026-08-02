/**
 * audit_ox.js が「判定不能」と分類した38問（適切/不適切のどちらのキーワードも
 * 元設問に含まれず、○×問題として成立していないもの）に exclude: true を立てる
 * ワンオフスクリプト。判定ロジックは audit_ox.js / fix_ox_ans.js と同一。
 *
 * exclude: true が立ったドキュメントは、api/questions.js・api/camp.js の
 * 出題ロジック側でスキップされる（このスクリプト自体は questions_ox の
 * ドキュメントを削除しない。データは残したまま出題対象から外すだけ）。
 *
 * 既定は --dry-run を付けない限り書き込む（migrate_fix_ox_q.js / fix_ox_ans.js と同じ運用）。
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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

const NEGATIVE_PATTERNS = [
  '不適切', '不適当', '適切でない', '適当でない',
  '誤っている', '誤りである', '誤りはどれ', '正しくない',
];
const POSITIVE_PATTERNS = ['適切', '適当', '正しい'];

function detectPolarity(text) {
  const s = String(text || '');
  for (const p of NEGATIVE_PATTERNS) if (s.includes(p)) return 'negative';
  for (const p of POSITIVE_PATTERNS) if (s.includes(p)) return 'positive';
  return 'unknown';
}

function stemOf(sourceQ) {
  return String(sourceQ || '').split('\n')[0];
}

async function fetchAll(collectionName) {
  const snap = await db.collection(collectionName).get();
  const out = [];
  snap.forEach(doc => out.push({ id: doc.id, ref: doc.ref, ...doc.data() }));
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const [oxDocs, sourceDocs] = await Promise.all([
    fetchAll('questions_ox'),
    fetchAll('questions'),
  ]);
  const sourceById = new Map(sourceDocs.map(d => [d.id, d]));

  const targets = [];
  for (const ox of oxDocs) {
    if (ox.exclude === true) continue; // 既に除外済み
    if (ox.standalone === true) continue; // 単体で書かれた○×。原本からの判定対象外
    const source = ox.sourceId ? sourceById.get(ox.sourceId) : null;
    if (!source || !Array.isArray(source.opts)) continue;
    const optText = source.opts[ox.sourceOptionIndex];
    if (optText === undefined) continue;

    const polarity = detectPolarity(stemOf(source.q));
    if (polarity === 'unknown') {
      targets.push({ ref: ox.ref, id: ox.id, cat: ox.cat });
    }
  }

  console.log(`除外フラグを立てる対象: ${targets.length}件\n`);
  targets.forEach((t, i) => console.log(`  ${i + 1}. [${t.id}]  （${t.cat}）`));

  if (dryRun) {
    console.log('\n--dry-run のため書き込みは行いません。');
    return;
  }

  if (targets.length === 0) {
    console.log('\n対象がないため終了します。');
    return;
  }

  let written = 0;
  for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
    const chunk = targets.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(t => batch.update(t.ref, {
      exclude: true,
      excludeReason: 'unknown-polarity',
      excludedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    written += chunk.length;
  }
  console.log(`\n完了: ${written}件に exclude: true を設定しました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
