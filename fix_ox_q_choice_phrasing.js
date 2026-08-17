/**
 * questions_ox に紛れ込んだ「4択用の問いかけ」を○×用の文に直すワンオフスクリプト。
 *
 * convert_to_ox.js は 4択1問 → ○×4問 に展開する際、q を
 *
 *     `${原本のq}\n${選択肢文}`
 *
 * の形で作る。原本の設問文が「〜に関する次の記述のうち、最も適切なものはどれか。」型だと、
 * ○×に展開したあとも「どれか。」という4択の問いかけがそのまま残ってしまい、
 * ○×問題としては文章が成立しない。
 *
 * そこで設問行（q の1行目）だけを
 *
 *     「Xに関する次の記述のうち、最も（不）適切なものはどれか。」
 *   → 「Xに関する記述である。」
 *
 * と書き直す。選択肢行（2行目以降）と ans / ex には一切触れない。
 *
 * Firestoreは部分一致検索ができないため、where('q','==',...) の完全一致では
 * 選択肢行が連結されたドキュメントに当たらない。コレクションを全件走査して
 * 1行目のパターンで拾う。
 *
 * 使い方:
 *   node fix_ox_q_choice_phrasing.js --dry-run   # 検出のみ。書き込まない
 *   node fix_ox_q_choice_phrasing.js             # 既定の対象（相続税の財産評価）だけ修正
 *   node fix_ox_q_choice_phrasing.js --all       # 同じ問いかけが残る全件を修正
 *
 * 要 FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY。
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

// 今回の修正依頼の対象。この文字列を設問行に含むものだけを既定の修正対象にする。
const TARGET_TOPIC = '相続税の計算基礎となる相続財産の評価';

// 「〜に関する次の記述のうち、最も（不）適切なものはどれか。」型。topic を残して言い換える。
const TOPIC_PATTERN = /^(.+?)に関する(?:次の)?記述のうち、?最も(?:不)?適切なものはどれか。?$/;

// 上記に当てはまらないが4択の問いかけが残っている行を検出するための緩いパターン。
const CHOICE_TAIL_PATTERN = /(?:どれか|正しいものはどれか|誤っているものはどれか)。?$/;

/**
 * 設問行を○×用に書き直す。書き直せない場合は null を返す（推測で壊さない）。
 */
function rewriteStem(stem) {
  const m = stem.match(TOPIC_PATTERN);
  if (!m) return null;
  const topic = m[1].trim();
  if (!topic) return null;
  return `${topic}に関する記述である。`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fixAll = process.argv.includes('--all');

  const snap = await db.collection('questions_ox').get();
  console.log(`questions_ox: ${snap.size}件を走査\n`);

  const targets = [];   // 既定の修正対象（相続税の財産評価）
  const others = [];    // 同じ問いかけが残る他の問題
  const unhandled = []; // 問いかけは残っているが自動で書き直せなかったもの

  snap.forEach(doc => {
    const data = doc.data();
    if (typeof data.q !== 'string' || !data.q) return;

    const lines = data.q.split('\n');
    const stem = lines[0];
    const rewritten = rewriteStem(stem);

    if (!rewritten) {
      if (CHOICE_TAIL_PATTERN.test(stem)) {
        unhandled.push({ id: doc.id, stem });
      }
      return;
    }

    lines[0] = rewritten;
    const entry = { ref: doc.ref, id: doc.id, before: data.q, after: lines.join('\n') };

    if (stem.includes(TARGET_TOPIC)) targets.push(entry);
    else others.push(entry);
  });

  const show = (label, list) => {
    if (!list.length) return;
    console.log(`${label}: ${list.length}件`);
    list.forEach(e => {
      console.log(`  [${e.id}]`);
      console.log(`    修正前: ${e.before.split('\n')[0]}`);
      console.log(`    修正後: ${e.after.split('\n')[0]}`);
    });
    console.log('');
  };

  show('■ 今回の修正対象（相続税の財産評価）', targets);
  show(fixAll ? '■ 修正対象（--all で同時に修正）' : '■ 同じ問いかけが残る他の問題（--all を付けると修正）', others);

  if (unhandled.length) {
    console.log(`■ 4択の問いかけが残るが自動で書き直せなかったもの: ${unhandled.length}件（手動対応）`);
    unhandled.forEach(e => console.log(`  [${e.id}] ${e.stem}`));
    console.log('');
  }

  if (targets.length === 0) {
    console.log(`⚠ 「${TARGET_TOPIC}」を含む設問は見つかりませんでした。`);
  }

  const updates = fixAll ? targets.concat(others) : targets;
  if (updates.length === 0) {
    console.log('書き込む対象がありません。');
    return;
  }

  if (dryRun) {
    console.log('--dry-run のため書き込みは行いません。');
    return;
  }

  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(u => batch.update(u.ref, {
      q: u.after,
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    written += chunk.length;
    console.log(`${written} / ${updates.length} 件書き込み済み`);
  }

  console.log(`\n完了: questions_ox の ${written}件 の設問文を○×用に書き直しました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
