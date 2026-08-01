/**
 * audit_ox.js が検出した ans 反転（「適切なものはどれか」型の設問を
 * ○×化する際に元設問の正誤を取り違えたケース）を修正するワンオフスクリプト。
 *
 * 判定ロジックは audit_ox.js と同一のものを使う。judged（適切型/不適切型と
 * 判定できたもの）のうち ans が期待値と食い違うドキュメントだけを対象に、
 * ans を期待値へ更新する。polarity が unknown / no-source のものには触れない。
 *
 * 既定は --dry-run 相当の安全動作ではなく migrate_fix_ox_q.js に合わせて
 * 「--dry-run を付けない限り書き込む」。必ず --dry-run で件数を確認してから実行すること。
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

// audit_ox.js と同一のロジック（意図的に重複させている。切り出すほどの規模ではない）
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

function truncate(s, n) {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return t.length > n ? t.slice(0, n) + '…' : t;
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

  const updates = [];

  for (const ox of oxDocs) {
    const source = ox.sourceId ? sourceById.get(ox.sourceId) : null;
    if (!source || !Array.isArray(source.opts)) continue;

    const optText = source.opts[ox.sourceOptionIndex];
    if (optText === undefined) continue;

    const polarity = detectPolarity(stemOf(source.q));
    if (polarity === 'unknown') continue;

    const isCorrectOption = Number(ox.sourceOptionIndex) === Number(source.ans);
    const expected = polarity === 'negative'
      ? (isCorrectOption ? 1 : 0)
      : (isCorrectOption ? 0 : 1);

    if (Number(ox.ans) !== expected) {
      updates.push({
        ref: ox.ref, id: ox.id, cat: ox.cat,
        from: ox.ans, to: expected, stem: stemOf(source.q), optText,
      });
    }
  }

  console.log(`questions_ox: ${oxDocs.length}件 / questions（原本）: ${sourceDocs.length}件`);
  console.log(`ans 修正対象: ${updates.length}件\n`);

  updates.forEach((u, i) => {
    console.log(`  [${i + 1}] ${u.id}  （${u.cat}）  ${u.from === 0 ? '○' : '×'} → ${u.to === 0 ? '○' : '×'}`);
    console.log(`      元の設問: ${truncate(u.stem, 70)}`);
    console.log(`      選択肢  : ${truncate(u.optText, 70)}`);
  });

  if (dryRun) {
    console.log('\n--dry-run のため書き込みは行いません。');
    return;
  }

  if (updates.length === 0) {
    console.log('\n修正対象がないため終了します。');
    return;
  }

  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(u => batch.update(u.ref, { ans: u.to }));
    await batch.commit();
    written += chunk.length;
  }
  console.log(`\n完了: questions_ox の ans を ${written}件 修正しました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
