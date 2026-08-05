/**
 * gakka_202505_28（Ａさんのポートフォリオの期待収益率）の4件を、
 * 前提となる資産配分を記述文に埋め込んで単体で解けるようにするワンオフスクリプト。
 *
 * ■ なぜ必要か
 *   import_gakka_202505_ox.js の投入時、前提データ欠落として除外したのは
 *   gakka_202505_10（Ｘ社の貸借対照表）の4件だけだった。同じ理由で除外すべき
 *   gakka_202505_28 が漏れ、資産配分表が無いまま出題対象に残っている。
 *
 *     Ａさんのポートフォリオの期待収益率は0.32％である。   ← 何のポートフォリオか不明
 *
 * ■ 前提の復元
 *   4件すべての解説に計算式 0.6×0.1＋0.1×1.0＋0.3×7.0＝2.26% が残っており、
 *   「期待収益率0.1％の資産を60％、1.0％の資産を10％、7.0％の資産を30％」という
 *   構成比が復元できる。資産の名称（預貯金・債券・株式など）は解説に無いため
 *   復元できないので、名称を作らず期待収益率と構成比だけで記述する。
 *
 * ■ 変更するもの
 *   既存ドキュメント（docIDは変更しない）の q と ex のみ。
 *   ans は元の正誤のまま（2.26％＝○、他3件＝×）で変わらない。
 *
 * 使い方:
 *   node apply_ox_premise_fix_gakka28.js --dry-run   # 差分の確認のみ
 *   node apply_ox_premise_fix_gakka28.js             # 反映
 */

const { db } = require('./lib/db');

// 記述文の共通の前置き。ここが元の設問の＜資料＞にあたる
const PREMISE = 'Ａさんのポートフォリオが、期待収益率0.1％の資産を60％、期待収益率1.0％の資産を10％、期待収益率7.0％の資産を30％の割合で組み入れて構成されている場合、';

const CORRECT_EX = 'ポートフォリオの期待収益率は、組み入れた各資産の期待収益率を構成比で加重平均して求める。0.6×0.1％＋0.1×1.0％＋0.3×7.0％＝2.26％である。';

const REWRITES = [
  { id: 'gakka_202505_28_0', value: '0.32', ans: 1 },
  { id: 'gakka_202505_28_1', value: '1.10', ans: 1 },
  { id: 'gakka_202505_28_2', value: '2.26', ans: 0 },
  { id: 'gakka_202505_28_3', value: '2.70', ans: 1 },
].map(r => ({
  ...r,
  q: `${PREMISE}このポートフォリオの期待収益率は${r.value}％である。`,
  ex: r.ans === 0
    ? `${CORRECT_EX}正解である。`
    : `${CORRECT_EX}${r.value}％ではないため誤り。`,
}));

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const refs = REWRITES.map(r => db.collection('questions_ox').doc(r.id));
  const snaps = await db.getAll(...refs);

  const missing = snaps.filter(s => !s.exists);
  if (missing.length) {
    console.log(`⚠ Firestoreに存在しないID: ${missing.map(s => s.id).join(', ')}`);
  }

  const targets = REWRITES.filter((r, i) => snaps[i].exists);
  console.log(`更新対象: ${targets.length}件\n`);

  targets.forEach((r, i) => {
    const before = snaps[REWRITES.indexOf(r)].data();
    console.log(`  [${r.id}]  ans=${r.ans === 0 ? '○' : '×'}`);
    console.log(`    before: ${before.q}`);
    console.log(`    after : ${r.q}`);
    // ans は変えない前提だが、投入時と食い違っていたら気付けるようにする
    if (before.ans !== r.ans) {
      console.log(`    ⚠ ans が既存(${before.ans})と想定(${r.ans})で食い違っています。確認してください`);
    }
    console.log('');
  });

  if (dryRun) {
    console.log('--dry-run のため書き込みは行いません。');
    return;
  }

  const batch = db.batch();
  targets.forEach(r => {
    batch.update(db.collection('questions_ox').doc(r.id), { q: r.q, ex: r.ex });
  });
  await batch.commit();

  console.log(`完了: ${targets.length}件の記述文に前提を埋め込みました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
