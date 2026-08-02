/**
 * 2025年5月学科試験の○×版（236問）を questions_ox コレクションへ投入するスクリプト。
 *
 * 入力: monndai/gakka_202505_ox_cleaned.json
 *   （元240問から、貸借対照表の数値が statement に含まれず単体で正誤判定できない
 *     問10の4件を除いたもの。除外分は monndai/gakka_202505_ox_excluded.json）
 *
 * ■ フィールドの対応（投入スペックの表ではなく、questions_ox の実データに合わせている）
 *   JSON                  Firestore     備考
 *   genre               → cat           既存6分野の表記そのまま
 *   statement           → q             ○×の記述文
 *   ans (true/false)    → ans (0/1)     questions_ox の ans は opts の添字。○=0 / ×=1
 *   explanation         → ex
 *   source_question_id  → sourceId      元の学科試験の設問番号（4択1問＝○×4問の束）
 *   （出現順）          → sourceOptionIndex
 *   comparative         → needs_review  他の選択肢との比較表現が残っている疑いのある7件
 *
 * ■ standalone: true について
 *   既存の○×は convert_to_ox.js が questions（4択の原本）を機械展開したもので、
 *   audit_ox.js / fix_ox_ans.js / migrate_fix_ox_q.js は sourceId で原本を引いて
 *   設問文や正誤を検算・上書きする。今回の236問は最初から単体で成立する記述文として
 *   書かれており原本が questions に存在しないため、それらのスクリプトが誤って
 *   上書き・誤判定しないよう standalone: true を立てて対象外にする。
 *
 * ■ ドキュメントID
 *   `${source_question_id}_${出現順}`（例: gakka_202505_01_0）。
 *   convert_to_ox.js と同じ決定的なID採番なので、再実行しても重複せず上書きになる。
 *
 * 使い方:
 *   node import_gakka_202505_ox.js --dry-run   # 検証と件数表示のみ（Firestoreに接続しない）
 *   node import_gakka_202505_ox.js             # 投入
 *   node import_gakka_202505_ox.js <別のJSON>  # 入力ファイルを差し替える場合
 *
 * 投入後は audit_ox.js を実行して件数とジャンル別内訳を確認すること。
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_INPUT = path.join(__dirname, 'monndai', 'gakka_202505_ox_cleaned.json');
const OX_OPTS = ['○', '×'];
const EXAM_LABEL = '2025年5月学科試験';
const BATCH_LIMIT = 500;

// lib/categoryDomains.js の DOMAINS と同じ6分野。表記ゆれをここで弾く
const { DOMAINS } = require('./lib/categoryDomains');

// 投入スペックに記載された、ジャンル別の期待件数
const EXPECTED_BY_CAT = {
  'ライフプランニング・社会保険': 36,
  'リスク管理・保険': 40,
  '金融資産運用': 40,
  'タックスプランニング': 40,
  '不動産': 40,
  '相続・事業承継': 40,
};

function buildDocs(items) {
  const seenPerSource = new Map();

  return items.map((item, i) => {
    const sourceId = item.source_question_id;
    const index = seenPerSource.get(sourceId) || 0;
    seenPerSource.set(sourceId, index + 1);

    return {
      id: `${sourceId}_${index}`,
      data: {
        cat: item.genre,
        q: item.statement,
        opts: OX_OPTS,
        ans: item.ans === true ? 0 : 1,
        ex: item.explanation,
        sourceId,
        sourceOptionIndex: index,
        exam: EXAM_LABEL,
        standalone: true,
        // comparative:true は「他の選択肢との比較」を前提にした表現が残っている
        // 可能性があり、目視確認の対象として印を残す（出題自体はする）
        ...(item.comparative === true ? { needs_review: true } : {}),
      },
      _lineNo: i + 1,
    };
  });
}

function validate(items, docs) {
  const errors = [];

  items.forEach((item, i) => {
    const at = `#${i + 1}`;
    if (!item.source_question_id) errors.push(`${at}: source_question_id がありません`);
    if (!item.statement || !String(item.statement).trim()) errors.push(`${at}: statement が空です`);
    if (!item.explanation || !String(item.explanation).trim()) errors.push(`${at}: explanation が空です`);
    if (typeof item.ans !== 'boolean') errors.push(`${at}: ans が true/false ではありません（${item.ans}）`);
    if (!DOMAINS.includes(item.genre)) errors.push(`${at}: genre が既存6分野にありません（${item.genre}）`);
  });

  const seen = new Set();
  docs.forEach(d => {
    if (seen.has(d.id)) errors.push(`ドキュメントIDが重複しています: ${d.id}`);
    seen.add(d.id);
  });

  return errors;
}

function countBy(docs, key) {
  const map = new Map();
  docs.forEach(d => map.set(d.data[key], (map.get(d.data[key]) || 0) + 1));
  return map;
}

function printSummary(docs) {
  const byCat = countBy(docs, 'cat');
  const width = Math.max(...[...byCat.keys()].map(c => [...c].length), 10);

  console.log('ジャンル（cat）別の件数:');
  [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
    const expected = EXPECTED_BY_CAT[cat];
    const mark = expected === undefined ? '' : (expected === n ? '  ✅ 想定どおり' : `  ⚠ 想定は ${expected}件`);
    console.log(`  ${cat.padEnd(width, '　')}  ${String(n).padStart(4)} 件${mark}`);
  });
  console.log(`  ${'合計'.padEnd(width, '　')}  ${String(docs.length).padStart(4)} 件\n`);

  const maru = docs.filter(d => d.data.ans === 0).length;
  console.log(`正解の内訳: ○ ${maru}件 / × ${docs.length - maru}件`);

  const review = docs.filter(d => d.data.needs_review);
  console.log(`needs_review（比較表現の疑い・目視確認推奨）: ${review.length}件`);
  review.forEach(d => console.log(`  - ${d.id}  ${d.data.q.slice(0, 50)}…`));
  console.log('');

  console.log('投入されるドキュメントの例:');
  console.log(JSON.stringify({ id: docs[0].id, ...docs[0].data }, null, 2));
  console.log('');
}

async function write(docs) {
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
  let written = 0;

  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const chunk = docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(d => batch.set(db.collection('questions_ox').doc(d.id), d.data));
    await batch.commit();
    written += chunk.length;
    console.log(`${written} / ${docs.length} 件処理済み`);
  }

  console.log(`\n完了: questions_ox コレクションへ ${written}件 保存しました`);
  console.log('続けて `node audit_ox.js` で件数とジャンル別内訳を確認してください。');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--')) || DEFAULT_INPUT;

  const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`入力: ${filePath}（${items.length}件）\n`);

  const docs = buildDocs(items);
  const errors = validate(items, docs);
  if (errors.length) {
    console.error(`検証エラー ${errors.length}件:`);
    errors.slice(0, 20).forEach(e => console.error(`  - ${e}`));
    if (errors.length > 20) console.error(`  …ほか ${errors.length - 20}件`);
    process.exit(1);
  }
  console.log('検証OK（必須フィールド・ジャンル名・ID重複）\n');

  printSummary(docs);

  if (dryRun) {
    console.log('--dry-run のため書き込みは行いません。');
    return;
  }

  await write(docs);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
