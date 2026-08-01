/**
 * 「比較表現タイプ」20問（audit_ox.jsで判定不能→flag_exclude_ox.jsで除外していたもの）を、
 * 単体で正誤判定できる記述文にAIが書き直した結果をquestions_oxへ反映するワンオフスクリプト。
 *
 * 対象は以下5つの元設問（4択）から生成された各4件、計20件：
 *   EX5XrWjwdeGp0tkxK957（元利均等/元金均等の総返済額比較）
 *   mB3JDeLX3fENhXLmHepZ（固定/変動金利、金利上昇局面での有利不利）
 *   0q4aCowyWC2MMGZ9eBfy（住宅ローン借り換えの判断基準）
 *   HIFcjZ8ffE05rOg7xjtm（教育ローン/奨学金の利息負担比較）
 *   gy8rnjTMYSWUcJyLoi7Z（ローン返済の金利計算方法）
 *
 * 既存ドキュメント（docIDは変更しない）の q/ans/ex を書き直し後の内容に更新し、
 * exclude関連フィールドを削除して出題対象に復帰させる。
 *
 * 既定は --dry-run を付けない限り書き込む。
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

const REWRITES = [
  { id: 'EX5XrWjwdeGp0tkxK957_0', ans: 0,
    q: '住宅ローンにおいて、他の条件が同一であれば、元利均等返済の総返済額は元金均等返済よりも多くなる。',
    ex: '元金均等返済は元金の減りが早く支払利息が少なくなるため、総返済額は元利均等返済の方が多くなる。' },
  { id: 'EX5XrWjwdeGp0tkxK957_1', ans: 1,
    q: '住宅ローンにおいて、他の条件が同一であれば、元金均等返済の総返済額は元利均等返済よりも多くなる。',
    ex: '実際には元利均等返済の方が総返済額は多く、元金均等返済の方が少なくなるため誤り。' },
  { id: 'EX5XrWjwdeGp0tkxK957_2', ans: 1,
    q: '住宅ローンにおいて、他の条件が同一であれば、元利均等返済と元金均等返済の総返済額は同じになる。',
    ex: '元利均等返済の方が元金均等返済より総返済額が多くなるため、両者は同額にはならない。' },
  { id: 'EX5XrWjwdeGp0tkxK957_3', ans: 1,
    q: '住宅ローンにおける元利均等返済と元金均等返済の総返済額の大小関係は、借入額によって変わる。',
    ex: '他の条件が同一であれば借入額の大小にかかわらず、元利均等返済の総返済額が常に多くなる。' },

  { id: 'mB3JDeLX3fENhXLmHepZ_0', ans: 1,
    q: '金利上昇局面において、変動金利ローンは固定金利ローンより有利な返済方法である。',
    ex: '金利上昇局面では変動金利ローンの返済額が増加するため、固定金利ローンより不利になる。' },
  { id: 'mB3JDeLX3fENhXLmHepZ_1', ans: 0,
    q: '金利上昇局面において、固定金利ローンは変動金利ローンより有利な返済方法である。',
    ex: '固定金利ローンは返済額が変わらないため、金利上昇局面では変動金利ローンより有利になる。' },
  { id: 'mB3JDeLX3fENhXLmHepZ_2', ans: 1,
    q: '金利上昇局面において、固定金利ローンと変動金利ローンの有利・不利に差はない。',
    ex: '金利上昇局面では固定金利ローンの方が返済額が安定し有利になるため、差がないとはいえない。' },
  { id: 'mB3JDeLX3fENhXLmHepZ_3', ans: 1,
    q: '金利上昇局面において、固定金利ローンが変動金利ローンより有利かどうかは、金利の上昇幅によって決まる。',
    ex: '金利上昇幅の大小にかかわらず、金利上昇局面では固定金利ローンの方が有利とされる。' },

  { id: '0q4aCowyWC2MMGZ9eBfy_0', ans: 1,
    q: '住宅ローンの借り換えを検討する際に重要な判断基準となるのは、新しい住宅ローン商品が市場に出たことである。',
    ex: '借り換えの判断基準は金利低下幅と手数料のバランスであり、新商品の有無自体は重要な判断基準とはならない。' },
  { id: '0q4aCowyWC2MMGZ9eBfy_1', ans: 0,
    q: '住宅ローンの借り換えを検討する際に重要な判断基準となるのは、金利低下幅と借り換え手数料のバランスである。',
    ex: '借り換えは金利低下による利息削減効果と手数料等のコストを比較して判断すべきものである。' },
  { id: '0q4aCowyWC2MMGZ9eBfy_2', ans: 1,
    q: '住宅ローンの借り換えを検討する際に重要な判断基準となるのは、返済期間の残日数である。',
    ex: '残存期間の長さも影響するが、単独ではなく金利低下幅や手数料とのバランスで判断すべき事項である。' },
  { id: '0q4aCowyWC2MMGZ9eBfy_3', ans: 1,
    q: '住宅ローンの借り換えを検討する際に重要な判断基準となるのは、金融機関の営業活動である。',
    ex: '借り換えの可否は金利低下幅と手数料のバランスで判断すべきであり、金融機関の営業活動は判断基準にならない。' },

  { id: 'HIFcjZ8ffE05rOg7xjtm_0', ans: 1,
    q: '教育ローンと奨学金（貸与型）を比較した場合、教育ローンの方が一般的に利息負担が少ない。',
    ex: '奨学金（貸与型、特に第二種）は教育ローンより低い金利が適用されることが多く、実際には奨学金の方が利息負担は少ない。' },
  { id: 'HIFcjZ8ffE05rOg7xjtm_1', ans: 0,
    q: '教育ローンと奨学金（貸与型）を比較した場合、奨学金（貸与型）の方が一般的に利息負担が少ない。',
    ex: '奨学金（貸与型）は教育ローンより低い金利が設定されることが多く、一般的に利息負担が少ない。' },
  { id: 'HIFcjZ8ffE05rOg7xjtm_2', ans: 1,
    q: '教育ローンと奨学金（貸与型）は、一般的に利息負担が同程度である。',
    ex: '奨学金（貸与型）は教育ローンより金利が低く設定されることが多いため、同程度とはいえない。' },
  { id: 'HIFcjZ8ffE05rOg7xjtm_3', ans: 1,
    q: '教育ローンと奨学金（貸与型）のどちらの利息負担が少ないかは、借入額によって決まる。',
    ex: '借入額の大小にかかわらず、奨学金（貸与型）の方が教育ローンより一般的に利息負担が少ない。' },

  { id: 'gy8rnjTMYSWUcJyLoi7Z_0', ans: 1,
    q: 'ローン返済における金利の計算方法として、単利計算のみが一般的に採用されている。',
    ex: '実際には残高に対する年利をもとに、実際の借入日数に応じた日割り計算が一般的に用いられる。' },
  { id: 'gy8rnjTMYSWUcJyLoi7Z_1', ans: 0,
    q: 'ローン返済における金利の計算方法として、残高に対する年利をもとにした日割りによる日数計算が一般的に採用されている。',
    ex: 'ローンの利息は通常、残高に対する年利から実際の借入日数に応じて日割りで計算される。' },
  { id: 'gy8rnjTMYSWUcJyLoi7Z_2', ans: 1,
    q: 'ローン返済における金利の計算方法として、借入残高にかかわらず毎月一定額の利息が一般的に採用されている。',
    ex: '実際には借入残高に応じて利息額は変動する日割り計算が一般的であり、毎月一定額の固定利息ではない。' },
  { id: 'gy8rnjTMYSWUcJyLoi7Z_3', ans: 1,
    q: 'ローン返済における金利の計算方法として、借入残高に関係なく一定額の利息が一般的に採用されている。',
    ex: '利息は借入残高に応じて日割りで計算されるため、残高に関係なく一定という説明は誤り。' },
];

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
    console.log(`  ${i + 1}. [${r.id}]  ans=${r.ans === 0 ? '○' : '×'}`);
    console.log(`      ${r.q}`);
  });

  if (dryRun) {
    console.log('\n--dry-run のため書き込みは行いません。');
    return;
  }

  const batch = db.batch();
  targets.forEach(r => {
    batch.update(db.collection('questions_ox').doc(r.id), {
      q: r.q,
      ans: r.ans,
      ex: r.ex,
      exclude: FieldValue.delete(),
      excludeReason: FieldValue.delete(),
      excludedAt: FieldValue.delete(),
    });
  });
  await batch.commit();

  console.log(`\n完了: ${targets.length}件を書き直し、出題対象に復帰させました`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
