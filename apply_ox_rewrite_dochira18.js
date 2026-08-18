/**
 * 「〜はどれか」型18問（audit_ox.jsで判定不能→flag_exclude_ox.jsで除外していたもの）を、
 * 単体で正誤判定できる記述文に書き直して questions_ox へ反映するワンオフスクリプト。
 *
 * 対象は以下5つの元設問から生成された計18件：
 *   Eb61PGNRaTMqVhRbfg8V（FPと社労士の業務範囲・元が2択×2件）
 *   kwyBKfC55BwssGvzW7LP（住宅ローン審査で重視されない要素×4件）
 *   rskO95MqAN2uTWwZKMlQ（損益通算できる損失×4件）
 *   uD38h0NEa6eRxhqAa98x（適格請求書の記載事項でないもの×4件）
 *   y1IaZqpFssvDkksrQYtI（多重債務のリスクが高いローン利用方法×4件）
 *
 * 比較表現タイプ20問と違い、これらは選択肢の意味自体は単体で判定できる。
 * 「〜はどれか。」という設問文が記述文の頭に残ったままなのが問題なので、
 * 設問文の述部と選択肢を1つの文に合成し直すだけでよい。ans は現状のままで正しい。
 * ただし ex は元の4択用のまま（「2. 正解。」等の選択肢番号参照を含むものがある）なので、
 * 各記述文に対応する単体解説に差し替える。
 *
 * 既存ドキュメント（docIDは変更しない）の q/ex を更新し、
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
  // 元が2択（適切/不適切）の問題。記述文が同一になるのを避けるため、
  // 「適切である」「不適切である」で対になる2問に振り分ける。
  { id: 'Eb61PGNRaTMqVhRbfg8V_0', ans: 1,
    q: '社会保険労務士の登録を受けていないFPが、年金の相談に来た顧客の求めに応じ、公的年金の裁定請求手続を代行して報酬を受け取ることは、適切である。',
    ex: '公的年金の裁定請求手続の代行は社会保険労務士の独占業務であり、登録を受けていないFPが報酬を得て行うことはできない。' },
  { id: 'Eb61PGNRaTMqVhRbfg8V_1', ans: 0,
    q: '社会保険労務士の登録を受けていないFPが、年金の相談に来た顧客の求めに応じ、公的年金の裁定請求手続を代行して報酬を受け取ることは、不適切である。',
    ex: '申請・請求手続の代行は社会保険労務士の独占業務であり、FPができるのは公的年金制度の一般的な説明までである。' },

  { id: 'kwyBKfC55BwssGvzW7LP_0', ans: 1,
    q: '住宅ローンの審査において、申込者の年収と返済能力は、一般的に重視されない要素である。',
    ex: '年収と返済能力は返済可能性を判断する中心的な材料であり、住宅ローン審査で最も重視される要素の一つである。' },
  { id: 'kwyBKfC55BwssGvzW7LP_1', ans: 1,
    q: '住宅ローンの審査において、担保となる物件の評価額は、一般的に重視されない要素である。',
    ex: '担保物件の評価額は返済不能となった場合の回収可能性を左右するため、住宅ローン審査で重視される。' },
  { id: 'kwyBKfC55BwssGvzW7LP_2', ans: 0,
    q: '住宅ローンの審査において、申込者の貯金残高の具体的な使途は、一般的に重視されない要素である。',
    ex: '審査で重視されるのは年収・返済能力、担保評価額、信用情報であり、貯金残高の使途まで問われることは通常ない。' },
  { id: 'kwyBKfC55BwssGvzW7LP_3', ans: 1,
    q: '住宅ローンの審査において、申込者の信用情報と過去の返済履歴は、一般的に重視されない要素である。',
    ex: '信用情報と過去の返済履歴は延滞リスクを判断する材料であり、住宅ローン審査で重視される。' },

  { id: 'rskO95MqAN2uTWwZKMlQ_0', ans: 1,
    q: '所得税において、不動産所得の金額の計算上生じた損失の金額のうち、不動産所得を生ずべき業務の用に供する土地の取得に要した負債の利子に相当する部分の金額は、他の所得の金額と損益通算することができる。',
    ex: '土地の取得に要した負債の利子に相当する部分の損失は、損益通算の対象から除外されている。' },
  { id: 'rskO95MqAN2uTWwZKMlQ_1', ans: 0,
    q: '所得税において、業務用車両を売却したことによる譲渡所得の金額の計算上生じた損失の金額は、他の所得の金額と損益通算することができる。',
    ex: '業務用車両は生活に通常必要でない資産に当たらず、その譲渡損失は総合課税の譲渡所得の損失として損益通算できる。' },
  { id: 'rskO95MqAN2uTWwZKMlQ_2', ans: 1,
    q: '所得税において、終身保険の解約返戻金を受け取ったことによる一時所得の金額の計算上生じた損失の金額は、他の所得の金額と損益通算することができる。',
    ex: '一時所得の計算上生じた損失は、給与所得など他の種類の所得と損益通算することはできない。' },
  { id: 'rskO95MqAN2uTWwZKMlQ_3', ans: 1,
    q: '所得税において、ゴルフ会員権を売却したことによる譲渡所得の金額の計算上生じた損失の金額は、他の所得の金額と損益通算することができる。',
    ex: 'ゴルフ会員権は生活に通常必要でない資産に当たり、その譲渡損失は損益通算の対象とならない。' },

  { id: 'uD38h0NEa6eRxhqAa98x_0', ans: 1,
    q: '消費税の適格請求書等保存方式（インボイス制度）において、適格請求書発行事業者の氏名または名称および登録番号は、適格請求書に必要とされる記載事項ではない。',
    ex: '発行事業者の氏名または名称および登録番号は、適格請求書に必ず記載しなければならない事項である。' },
  { id: 'uD38h0NEa6eRxhqAa98x_1', ans: 0,
    q: '消費税の適格請求書等保存方式（インボイス制度）において、適格請求書発行事業者の本店または主たる事務所の所在地は、適格請求書に必要とされる記載事項ではない。',
    ex: '適格請求書の記載事項に本店等の所在地は含まれておらず、記載は求められていない。' },
  { id: 'uD38h0NEa6eRxhqAa98x_2', ans: 1,
    q: '消費税の適格請求書等保存方式（インボイス制度）において、課税資産の譲渡等に係る資産または役務の内容は、適格請求書に必要とされる記載事項ではない。',
    ex: '課税資産の譲渡等に係る資産または役務の内容は、適格請求書の必須記載事項の一つである。' },
  { id: 'uD38h0NEa6eRxhqAa98x_3', ans: 1,
    q: '消費税の適格請求書等保存方式（インボイス制度）において、税率ごとに区分した消費税額等は、適格請求書に必要とされる記載事項ではない。',
    ex: '税率ごとに区分した消費税額等は、適格請求書の必須記載事項の一つである。' },

  { id: 'y1IaZqpFssvDkksrQYtI_0', ans: 1,
    q: 'ローンの利用方法のうち、目的別ローンを計画的に利用することは、多重債務に陥るリスクが高い。',
    ex: '使途と借入額が明確な目的別ローンを計画的に利用する方法は、返済管理がしやすく多重債務につながりにくい。' },
  { id: 'y1IaZqpFssvDkksrQYtI_1', ans: 0,
    q: 'ローンの利用方法のうち、カードローンの限度額をフルに使用して複数社から借入することは、多重債務に陥るリスクが高い。',
    ex: '複数社から限度額まで借り入れると返済負担が急増し、月々の返済が困難になる多重債務状態に陥りやすい。' },
  { id: 'y1IaZqpFssvDkksrQYtI_2', ans: 1,
    q: 'ローンの利用方法のうち、返済計画を立てて段階的に借入することは、多重債務に陥るリスクが高い。',
    ex: '返済計画に基づいて段階的に借り入れる方法は、返済能力の範囲内に借入を抑えられるためリスクは低い。' },
  { id: 'y1IaZqpFssvDkksrQYtI_3', ans: 1,
    q: 'ローンの利用方法のうち、金利の低い商品を選択して借入することは、多重債務に陥るリスクが高い。',
    ex: '金利の低い商品を選ぶこと自体は利息負担を抑える行動であり、多重債務の原因となるものではない。' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const refs = REWRITES.map(r => db.collection('questions_ox').doc(r.id));
  const snaps = await db.getAll(...refs);

  const missing = snaps.filter(s => !s.exists);
  if (missing.length) {
    console.log(`⚠ Firestoreに存在しないID: ${missing.map(s => s.id).join(', ')}`);
  }

  // ans は現状のままで正しいはずなので、食い違いがあれば書き込み前に止める
  const ansConflicts = REWRITES
    .map((r, i) => ({ r, snap: snaps[i] }))
    .filter(({ r, snap }) => snap.exists && Number(snap.data().ans) !== r.ans);
  if (ansConflicts.length) {
    console.log('⚠ 現在のansと書き直し後のansが食い違っています。確認してください:');
    ansConflicts.forEach(({ r, snap }) => {
      console.log(`   [${r.id}] Firestore=${snap.data().ans} / スクリプト=${r.ans}`);
    });
    console.log('');
  }

  const targets = REWRITES.filter((r, i) => snaps[i].exists);
  console.log(`更新対象: ${targets.length}件\n`);
  targets.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.id}]  ans=${r.ans === 0 ? '○' : '×'}`);
    console.log(`      ${r.q}`);
    console.log(`      解説: ${r.ex}`);
  });

  if (dryRun) {
    console.log('\n--dry-run のため書き込みは行いません。');
    return;
  }

  if (ansConflicts.length) {
    console.log('ansの食い違いが解消されていないため中止します。');
    process.exitCode = 1;
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
