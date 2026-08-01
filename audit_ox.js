/**
 * questions_ox コレクションの棚卸しスクリプト（読み取り専用）
 *
 * 確認できること:
 *   1. questions_ox の総件数
 *   2. ジャンル（cat）ごとの件数
 *   3. 「最も不適切なものはどれか」型の設問から作られた○×問題で、
 *      正誤（ans）が反転していないかの全件判定＋サンプル表示
 *
 * 判定のしくみ:
 *   convert_to_ox.js は 4択1問 → ○×4問 に展開する際、
 *   「その選択肢が4択の正解かどうか」をそのまま ○(0) / ×(1) にしている。
 *
 *     ans = (sourceOptionIndex === 元問題のans) ? 0 : 1
 *
 *   これは元の設問が「最も適切なものはどれか」型なら正しい。
 *   だが「最も不適切なものはどれか」型では、4択の正解＝“誤った記述”なので
 *   ○×に直すと × でなければならず、展開した4問すべての正誤が反転する。
 *
 *   そこで questions（4択の原本）を sourceId で引き当て、設問文の
 *   肯定形／否定形を判定して「あるべき ans」を計算し、実データと突き合わせる。
 *
 * このスクリプトは書き込みを一切行わない。修正は結果を確認してから別途行うこと。
 */

const fs = require('fs');
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

// 「不適切なものはどれか」型。「適切でない」は「適切」を含むので必ず先に判定する
const NEGATIVE_PATTERNS = [
  '不適切', '不適当', '適切でない', '適当でない',
  '誤っている', '誤りである', '誤りはどれ', '正しくない',
];
// 「適切なものはどれか」型
const POSITIVE_PATTERNS = ['適切', '適当', '正しい'];

function detectPolarity(text) {
  const s = String(text || '');
  for (const p of NEGATIVE_PATTERNS) if (s.includes(p)) return 'negative';
  for (const p of POSITIVE_PATTERNS) if (s.includes(p)) return 'positive';
  return 'unknown';
}

// 元設問の「〜はどれか」までの部分。選択肢文に含まれる「適切」に引きずられないよう
// 設問文の先頭行だけを見る（convert_to_ox.js は q を「設問文\n選択肢文」で作る）
function stemOf(sourceQ) {
  return String(sourceQ || '').split('\n')[0];
}

function truncate(s, n) {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name, def) => {
    const hit = args.find(a => a.startsWith('--' + name + '='));
    return hit ? hit.split('=').slice(1).join('=') : def;
  };
  return {
    samples: Number(get('samples', 5)),
    jsonPath: get('json', ''),
    showAll: args.includes('--all'),
  };
}

async function fetchAll(collectionName) {
  const snap = await db.collection(collectionName).get();
  const out = [];
  snap.forEach(doc => out.push({ id: doc.id, ...doc.data() }));
  return out;
}

function line(char = '─', n = 64) {
  return char.repeat(n);
}

async function main() {
  const opts = parseArgs();

  console.log('questions_ox / questions を読み込み中...（読み取りのみ・書き込みなし）\n');
  const [oxDocs, sourceDocs] = await Promise.all([
    fetchAll('questions_ox'),
    fetchAll('questions'),
  ]);

  const sourceById = new Map(sourceDocs.map(d => [d.id, d]));

  /* ============================================================
     1. 総件数
     ============================================================ */
  console.log(line('═'));
  console.log('【1】questions_ox 総件数');
  console.log(line('═'));
  console.log(`  questions_ox : ${oxDocs.length} 件`);
  console.log(`  questions（4択の原本） : ${sourceDocs.length} 件`);
  console.log('');

  /* ============================================================
     2. ジャンル（cat）ごとの件数
     ============================================================ */
  const byCat = new Map();
  for (const d of oxDocs) {
    const cat = d.cat || '(cat未設定)';
    byCat.set(cat, (byCat.get(cat) || 0) + 1);
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  console.log(line('═'));
  console.log('【2】ジャンル（cat）ごとの件数');
  console.log(line('═'));
  const catWidth = Math.max(...catRows.map(r => [...r[0]].length), 10);
  for (const [cat, n] of catRows) {
    console.log(`  ${cat.padEnd(catWidth, '　')}  ${String(n).padStart(5)} 件`);
  }
  console.log(`  ${'合計'.padEnd(catWidth, '　')}  ${String(oxDocs.length).padStart(5)} 件`);
  console.log('');

  /* ============================================================
     3. 正誤（ans）の反転チェック
     ============================================================ */
  const results = [];
  const stats = {
    positive: 0, negative: 0, unknown: 0,
    noSource: 0, badShape: 0,
    mismatch: 0, mismatchNegative: 0, mismatchPositive: 0,
    qTextStale: 0,
  };

  for (const ox of oxDocs) {
    // データ形状の確認（○×2択・ans は 0/1 のはず）
    const shapeOk = Array.isArray(ox.opts) && ox.opts.length === 2 &&
                    (ox.ans === 0 || ox.ans === 1);
    if (!shapeOk) stats.badShape++;

    const source = ox.sourceId ? sourceById.get(ox.sourceId) : null;
    if (!source || !Array.isArray(source.opts)) {
      stats.noSource++;
      results.push({ id: ox.id, cat: ox.cat, status: 'no-source', ans: ox.ans, q: ox.q });
      continue;
    }

    const optText = source.opts[ox.sourceOptionIndex];
    if (optText === undefined) {
      stats.noSource++;
      results.push({ id: ox.id, cat: ox.cat, status: 'no-source', ans: ox.ans, q: ox.q });
      continue;
    }

    // migrate_fix_ox_q.js が未適用で設問文が欠けていないかも併せて見る
    if (ox.q !== `${source.q}\n${optText}`) stats.qTextStale++;

    const stem = stemOf(source.q);
    const polarity = detectPolarity(stem);
    stats[polarity]++;

    if (polarity === 'unknown') {
      results.push({
        id: ox.id, cat: ox.cat, status: 'unknown-polarity',
        ans: ox.ans, stem, optText, sourceId: ox.sourceId,
      });
      continue;
    }

    const isCorrectOption = Number(ox.sourceOptionIndex) === Number(source.ans);
    // 適切型: 4択の正解＝正しい記述 → ○(0)
    // 不適切型: 4択の正解＝誤った記述 → ×(1)
    const expected = polarity === 'negative'
      ? (isCorrectOption ? 1 : 0)
      : (isCorrectOption ? 0 : 1);

    const ok = Number(ox.ans) === expected;
    if (!ok) {
      stats.mismatch++;
      if (polarity === 'negative') stats.mismatchNegative++;
      else stats.mismatchPositive++;
    }

    results.push({
      id: ox.id, cat: ox.cat, status: ok ? 'ok' : 'mismatch',
      polarity, ans: ox.ans, expected, isCorrectOption,
      stem, optText, sourceId: ox.sourceId,
    });
  }

  console.log(line('═'));
  console.log('【3】正誤（ans）の反転チェック');
  console.log(line('═'));
  console.log('  元の設問タイプの内訳:');
  console.log(`    適切型（「適切なものはどれか」等）   : ${stats.positive} 件`);
  console.log(`    不適切型（「不適切なものはどれか」等）: ${stats.negative} 件  ← 反転が起きうる対象`);
  console.log(`    判定不能（どちらの語も無い設問）      : ${stats.unknown} 件  ← 目視確認が必要`);
  console.log(`    原本が引けない（sourceId欠落など）    : ${stats.noSource} 件  ← 自動判定不可`);
  console.log('');
  console.log('  判定結果:');
  const judged = stats.positive + stats.negative;
  console.log(`    自動判定できた件数 : ${judged} 件`);
  console.log(`    正誤が合っている   : ${judged - stats.mismatch} 件`);
  console.log(`    正誤が反転している : ${stats.mismatch} 件` +
              (stats.mismatch ? `（うち不適切型 ${stats.mismatchNegative} 件 / 適切型 ${stats.mismatchPositive} 件）` : ''));
  console.log('');
  if (stats.badShape) {
    console.log(`  ⚠ opts が2択でない、または ans が 0/1 でないドキュメント: ${stats.badShape} 件`);
  }
  if (stats.qTextStale) {
    console.log(`  ⚠ q が「設問文＋選択肢文」の形になっていないドキュメント: ${stats.qTextStale} 件`);
    console.log('    （migrate_fix_ox_q.js が未適用の可能性。--dry-run で確認できます）');
  }
  if (stats.badShape || stats.qTextStale) console.log('');

  /* --- 反転しているものを表示 --- */
  const mismatches = results.filter(r => r.status === 'mismatch');
  if (mismatches.length) {
    const show = opts.showAll ? mismatches : mismatches.slice(0, opts.samples);
    console.log(line('─'));
    console.log(`⚠ 反転している問題（${show.length} / ${mismatches.length} 件を表示）`);
    console.log(line('─'));
    show.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.id}  （${r.cat}）`);
      console.log(`      元の設問  : ${truncate(r.stem, 70)}`);
      console.log(`      選択肢    : ${truncate(r.optText, 70)}`);
      console.log(`      設問タイプ: ${r.polarity === 'negative' ? '不適切型' : '適切型'}` +
                  `（この選択肢は4択の${r.isCorrectOption ? '正解' : '不正解'}）`);
      console.log(`      現在のans : ${r.ans === 0 ? '○' : '×'}  →  あるべき: ${r.expected === 0 ? '○' : '×'}`);
      console.log('');
    });
    if (!opts.showAll && mismatches.length > show.length) {
      console.log(`  …残り ${mismatches.length - show.length} 件は --all で全件表示できます。\n`);
    }
  } else if (judged > 0) {
    console.log('  ✅ 自動判定できた範囲では、反転している問題はありませんでした。\n');
  }

  /* --- 不適切型のサンプルを目視用に表示（反転が無くても出す） --- */
  const negatives = results.filter(r => r.polarity === 'negative');
  if (negatives.length) {
    const show = negatives.slice(0, opts.samples);
    console.log(line('─'));
    console.log(`「最も不適切なものはどれか」型のサンプル（${show.length} / ${negatives.length} 件）— 目視確認用`);
    console.log(line('─'));
    show.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.id}  （${r.cat}）  ${r.status === 'ok' ? '判定: OK' : '判定: 反転'}`);
      console.log(`      元の設問  : ${truncate(r.stem, 70)}`);
      console.log(`      ○×の記述 : ${truncate(r.optText, 70)}`);
      console.log(`      正解      : ${r.ans === 0 ? '○' : '×'}`);
      console.log('');
    });
  } else {
    console.log('  ※「不適切型」に該当する問題は見つかりませんでした。\n');
  }

  /* --- 判定不能なものも数件出す --- */
  const unknowns = results.filter(r => r.status === 'unknown-polarity');
  if (unknowns.length) {
    const show = unknowns.slice(0, Math.min(3, opts.samples));
    console.log(line('─'));
    console.log(`設問タイプを自動判定できなかったもの（${show.length} / ${unknowns.length} 件）— 目視確認が必要`);
    console.log(line('─'));
    show.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.id}  （${r.cat}）`);
      console.log(`      元の設問  : ${truncate(r.stem, 70)}`);
      console.log(`      正解      : ${r.ans === 0 ? '○' : '×'}`);
      console.log('');
    });
  }

  /* --- ジャンル別の反転件数 --- */
  if (mismatches.length) {
    const byCatMismatch = new Map();
    for (const r of mismatches) {
      const cat = r.cat || '(cat未設定)';
      byCatMismatch.set(cat, (byCatMismatch.get(cat) || 0) + 1);
    }
    console.log(line('─'));
    console.log('ジャンル別の反転件数');
    console.log(line('─'));
    [...byCatMismatch.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
      console.log(`  ${cat.padEnd(catWidth, '　')}  ${String(n).padStart(5)} 件 / ${byCat.get(cat)} 件中`);
    });
    console.log('');
  }

  /* --- JSON出力（任意） --- */
  if (opts.jsonPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      total: oxDocs.length,
      sourceTotal: sourceDocs.length,
      byCat: Object.fromEntries(catRows),
      stats,
      results,
    };
    fs.writeFileSync(opts.jsonPath, JSON.stringify(report, null, 2));
    console.log(`詳細レポートを ${opts.jsonPath} に書き出しました。`);
  }

  console.log(line('═'));
  console.log('完了（Firestoreへの書き込みは行っていません）');
  console.log(line('═'));
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
