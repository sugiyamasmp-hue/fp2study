/**
 * 38q_rewrite_spec.md のステップ1（対象データの抽出）用スクリプト。
 *
 * questions_ox のうち exclude=true（出題対象から除外中）のドキュメントを集め、
 * その sourceId ごとに元の4択問題（questions コレクション）とセットにして
 * JSON配列で書き出す。AI書き直しプロンプトにそのまま渡せる形。
 *
 * 実際のFirestoreフィールド名:
 *   questions     : q(設問) / opts(選択肢) / ans(正解index) / ex(解説) / cat(ジャンル)
 *   questions_ox  : q(記述文) / ans(0=○,1=×) / ex(解説) / sourceId / exclude
 *
 * 実行:
 *   node --env-file=.env fetch_original_questions.js
 *
 * 出力:
 *   original_questions_for_fix.json
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 対象を明示指定したい場合はこのファイルを置く（無ければ exclude=true から自動抽出）
const AFFECTED_IDS_PATH = path.join(__dirname, 'affected_source_question_ids.json');
const OUTPUT_PATH = path.join(__dirname, 'original_questions_for_fix.json');

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

/** questions_ox を全件読み、sourceId ごとに○×バリアントをまとめる */
async function loadOxVariants() {
  const snapshot = await db.collection('questions_ox').get();
  const groups = new Map();

  snapshot.forEach(doc => {
    const d = doc.data();
    const sid = d.sourceId;
    if (!sid) return;
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push({
      id: doc.id,
      stmt: d.q,
      ans: d.ans,
      ex: d.ex,
      exclude: d.exclude === true,
    });
  });

  return groups;
}

/** 対象 sourceId の一覧を決める */
function resolveAffectedIds(oxGroups) {
  if (fs.existsSync(AFFECTED_IDS_PATH)) {
    const data = JSON.parse(fs.readFileSync(AFFECTED_IDS_PATH, 'utf-8'));
    const ids = data.affected_source_question_ids || data;
    console.log(`${path.basename(AFFECTED_IDS_PATH)} から ${ids.length} 件の対象を読み込みました`);
    return ids;
  }

  const ids = [];
  for (const [sid, variants] of oxGroups) {
    if (variants.some(v => v.exclude)) ids.push(sid);
  }
  console.log(`exclude=true の○×問題から ${ids.length} 件の元問題を対象にしました`);
  return ids;
}

async function main() {
  const oxGroups = await loadOxVariants();
  const affectedIds = resolveAffectedIds(oxGroups);

  const output = [];
  for (const sid of affectedIds) {
    const doc = await db.collection('questions').doc(sid).get();
    if (!doc.exists) {
      console.warn(`⚠️ questions に見つかりませんでした: ${sid}`);
      continue;
    }
    const d = doc.data();
    const opts = d.opts || [];
    output.push({
      source_question_id: sid,
      genre: d.cat,
      original_question: d.q,
      original_choices: opts,
      original_answer_index: d.ans,
      original_answer_text: opts[d.ans],
      original_explanation: d.ex,
      ox_variants: oxGroups.get(sid) || [],
    });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  const variantCount = output.reduce((n, r) => n + r.ox_variants.filter(v => v.exclude).length, 0);
  console.log(`✅ 元問題 ${output.length} 件（除外中の○× ${variantCount} 件）を ${OUTPUT_PATH} に出力しました`);
}

main().catch(error => {
  console.error('抽出に失敗しました:', error);
  process.exit(1);
});
