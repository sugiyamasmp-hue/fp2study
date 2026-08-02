/**
 * questions_ox の設問文（q）が○×問題として成立しているかの棚卸しスクリプト。
 *
 * 背景:
 *   ○×問題は4択の原本から選択肢を1つずつ切り出して作られており、設問文は
 *   `${原本の設問文}\n${選択肢テキスト}` の形になっている（migrate_fix_ox_q.js）。
 *   このため原本の「〜次の記述のうち、最も不適切なものはどれか。」という
 *   4択専用の指示文が残り、記述を1つしか出さない○×では設問として破綻する。
 *
 *   この指示文は lib/oxExplanation.js の sanitizeOxQuestion が「表示直前」に
 *   取り除くため、既知の言い回しならデータを触らなくても画面上は解消している。
 *   データ側を書き換えないのは、questions（4択の原本）との対応を
 *   migrate_fix_ox_q.js / audit_ox.js が `q === `${source.q}\n${optText}`` で
 *   検証しているため（書き換えると次回実行時に差し戻される）。
 *
 * このスクリプトで分かること:
 *   1. 表示時の整形で解消済みの件数（対応不要。件数だけ把握する）
 *   2. 整形後もなお○×として成立していない疑いのある問題（要対応）
 *        - 未知の言い回しの指示文が残っている（sanitizeOxQuestion の拡張が必要）
 *        - 下線部・空欄・選択肢番号など、単独では答えられない参照が残っている
 *        - 図表や＜資料＞を参照しているが本文に資料が無い
 *        - 整形後の本文が極端に短い
 *
 * 既定は読み取り専用。--apply を付けたときだけ、自動修復が不可能な問題
 *（下線部・空欄・資料参照など、文言を書き直さないと○×にできないもの）に
 * exclude: true を立てる（flag_exclude_ox.js と同じ手法。データは消さず出題対象から外すだけ）。
 * 未知の言い回しの指示文が残っているだけのものには exclude を立てない
 *（正規表現を足せば救えるため。レポートを見て lib/oxExplanation.js を直すこと）。
 *
 * 使い方:
 *   node audit_ox_stem.js                      … Firestoreを読んでレポートのみ
 *   node audit_ox_stem.js --json out.json      … 全件の判定結果をJSONへ書き出す
 *   node audit_ox_stem.js --apply              … 修復不能な問題に exclude: true を立てる
 *   node audit_ox_stem.js --from export.json   … Firestoreの代わりにJSONを読む（認証情報が無い環境用）
 */

const fs = require('fs');
const { sanitizeOxQuestion } = require('./lib/oxExplanation');

const BATCH_LIMIT = 500;
const OX_OPTS = ['○', '×'];

// ---- ○×として成立していない疑いの検出ルール --------------------------------
// severity: 'fixable' … 正規表現を足せば表示時に救える（exclude は立てない）
//           'review'  … 自動判定しきれない。目視で確認する（exclude は立てない）
//           'broken'  … 文言を書き直さない限り○×にできない（--apply で exclude）
//
// on:       'shown'    … 表示時の整形を通したあとの本文を見る
//           'original' … 整形前の全文を見る。整形で消える設問指示文の中にある
//                        「＜資料＞を参照」等は、消えても設問が資料に依存する事実は
//                        変わらないため、元の全文で判定する必要がある
const RULES = [
  {
    key: 'instruction-left',
    label: '4択・複数解答形式の指示文が残っている（未知の言い回し）',
    severity: 'fixable',
    on: 'shown',
    hint: 'lib/oxExplanation.js の CHOICE_INSTRUCTION_RE に言い回しを追加する',
    test: s => /どれか|いくつあるか/.test(s)
      || /次の(記述|うち|文章|各文)/.test(s)
      || /(正誤を判定|正誤を答え)/.test(s)
      || /(答えなさい|選びなさい|答えよ|選べ)/.test(s),
  },
  {
    key: 'underline-ref',
    label: '下線部を参照している',
    severity: 'broken',
    on: 'original',
    hint: '下線が画面に無いため単独では答えられない',
    test: s => /下線/.test(s),
  },
  {
    key: 'blank-ref',
    label: '空欄（①②…）を参照している',
    severity: 'broken',
    on: 'original',
    hint: '穴埋め形式は○×に変換できない',
    test: s => /空欄|[（(]\s*[①-⑳]\s*[）)]/.test(s),
  },
  {
    key: 'option-number-ref',
    label: '選択肢番号を参照している',
    severity: 'broken',
    on: 'shown',
    hint: '○×では選択肢番号が存在しない',
    test: s => /(?:選択肢|上記|下記)\s*[0-9０-９]|[0-9０-９]\s*(?:番|つ目)の(?:選択肢|記述)/.test(s),
  },
  {
    key: 'too-short',
    label: '整形後の本文が極端に短い',
    severity: 'broken',
    on: 'shown',
    hint: '設問として成立していない可能性が高い',
    test: s => s.replace(/\s/g, '').length < 10,
  },
  {
    key: 'material-ref',
    label: '資料・図表を参照している',
    severity: 'review',
    on: 'original',
    hint: '資料が設問文に含まれていれば問題ない。含まれていなければ答えられないので目視で確認する',
    // 「年次のデータ」「月次の表」のような複合語を「次の〜」と誤って拾わないよう、
    // 「次」の直前が期間を表す語でないことを確認する
    test: s => /(＜資料＞|<資料>|(?:下記|上記|(?<![年月今前当翌回半])次)の(?:＜?資料＞?|図|表|データ))/.test(s),
  },
];

function initDb() {
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
  return { db: getFirestore(), FieldValue };
}

function line(ch) { return ch.repeat(64); }

function truncate(s, n) {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/* 1問を判定する。表示時の整形（sanitizeOxQuestion）を通したうえでルールを当てる */
function classify(doc) {
  const original = String(doc.q || '');
  const opts = Array.isArray(doc.opts) ? doc.opts : OX_OPTS;
  const shown = String(sanitizeOxQuestion(original, opts) || '');

  const findings = RULES.filter(r => r.test(r.on === 'original' ? original : shown));
  const sanitized = shown !== original;

  return {
    id: doc.id,
    cat: doc.cat || '',
    standalone: doc.standalone === true,
    excluded: doc.exclude === true,
    sanitized,                                   // 表示時の整形が効いたか
    findings: findings.map(f => f.key),
    broken: findings.some(f => f.severity === 'broken'),
    fixable: findings.some(f => f.severity === 'fixable'),
    review: findings.some(f => f.severity === 'review'),
    original,
    shown,
  };
}

async function loadDocs(fromPath) {
  if (fromPath) {
    const raw = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.questions || []);
    return { docs: arr.map(d => ({ ...d, ref: null })), db: null, FieldValue: null };
  }
  const { db, FieldValue } = initDb();
  const snap = await db.collection('questions_ox').get();
  const docs = [];
  snap.forEach(doc => docs.push({ id: doc.id, ref: doc.ref, ...doc.data() }));
  return { docs, db, FieldValue };
}

async function main() {
  const argv = process.argv;
  const apply = argv.includes('--apply');
  const jsonIdx = argv.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
  const fromIdx = argv.indexOf('--from');
  const fromPath = fromIdx >= 0 ? argv[fromIdx + 1] : null;

  const { docs, db, FieldValue } = await loadDocs(fromPath);
  console.log(line('═'));
  console.log('questions_ox 設問文の棚卸し');
  console.log(line('═'));
  console.log(`  総件数: ${docs.length}件` + (fromPath ? `（${fromPath} から読み込み）` : ''));

  // 設問文のフィールド名は questions_ox では必ず q。投入前の中間ファイル
  // （statement / text 等）を --from に渡すと全件が「本文が空」と判定され、
  // --apply で全部除外しかねないため、ここで止める。
  const noQ = docs.filter(d => !d.q);
  if (docs.length > 0 && noQ.length === docs.length) {
    const sample = docs[0] || {};
    const candidates = Object.keys(sample).filter(k => typeof sample[k] === 'string' && sample[k].length > 20);
    console.error('\n  中止: どのドキュメントにも設問文（q）がありません。');
    console.error('  questions_ox の形式ではないファイルを読み込んでいる可能性があります。');
    if (candidates.length) console.error(`  このファイルの設問文らしきフィールド: ${candidates.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (noQ.length > 0) {
    console.log(`  ※ 設問文（q）が空のドキュメントが ${noQ.length}件あります`);
  }

  const results = docs.map(classify);
  const live = results.filter(r => !r.excluded);
  const generated = live.filter(r => !r.standalone);
  const standalone = live.filter(r => r.standalone);

  console.log(`  うち出題対象: ${live.length}件`
    + `（4択から生成: ${generated.length}件 / 単体で作成: ${standalone.length}件）`);
  console.log(`  除外済み(exclude:true): ${results.length - live.length}件`);

  console.log('\n' + line('─'));
  console.log('【1】表示時の整形で解消済み（対応不要）');
  console.log(line('─'));
  const sanitized = live.filter(r => r.sanitized && r.findings.length === 0);
  console.log(`  ${sanitized.length}件`);
  if (sanitized.length) {
    console.log('  例:');
    sanitized.slice(0, 3).forEach(r => {
      console.log(`    [${r.id}]`);
      console.log(`      修正前: ${truncate(r.original, 76)}`);
      console.log(`      修正後: ${truncate(r.shown, 76)}`);
    });
  }

  console.log('\n' + line('─'));
  console.log('【2】要対応（整形後もなお○×として成立していない疑い）');
  console.log(line('─'));
  const needsWork = live.filter(r => r.findings.length > 0);
  console.log(`  ${needsWork.length}件\n`);

  for (const rule of RULES) {
    const hit = needsWork.filter(r => r.findings.includes(rule.key));
    if (!hit.length) continue;
    const mark = rule.severity === 'broken' ? '要書き直し'
      : rule.severity === 'review' ? '目視確認'
      : '正規表現で救える';
    console.log(`  ● ${rule.label}: ${hit.length}件  [${mark}]`);
    console.log(`      → ${rule.hint}`);
    hit.slice(0, 3).forEach(r => {
      console.log(`      [${r.id}] (${r.cat})`);
      console.log(`        ${truncate(r.shown, 74)}`);
    });
    console.log('');
  }

  if (!needsWork.length) {
    console.log('  該当なし。すべての設問が○×として成立しています。\n');
  }

  const brokenDocs = needsWork.filter(r => r.broken);
  const fixableOnly = needsWork.filter(r => r.fixable && !r.broken);
  const reviewOnly = needsWork.filter(r => r.review && !r.broken && !r.fixable);

  console.log(line('─'));
  console.log('【まとめ】');
  console.log(line('─'));
  console.log(`  対応不要（整形で解消）           : ${sanitized.length}件`);
  console.log(`  正規表現の追加で救える           : ${fixableOnly.length}件`);
  console.log(`  目視確認が必要                   : ${reviewOnly.length}件`);
  console.log(`  文言の書き直しが必要（除外対象） : ${brokenDocs.length}件`);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
    console.log(`\n  全件の判定結果を ${jsonOut} へ書き出しました。`);
  }

  if (!apply) {
    console.log('\n  読み取りのみで終了しました。');
    if (brokenDocs.length) {
      console.log('  --apply を付けて実行すると、書き直しが必要な'
        + `${brokenDocs.length}件に exclude: true を立てて出題対象から外します。`);
    }
    return;
  }

  if (!db) {
    console.log('\n  --from 指定時は書き込めません（--apply を無視しました）。');
    return;
  }
  if (!brokenDocs.length) {
    console.log('\n  除外対象がないため書き込みは行いません。');
    return;
  }

  const refById = new Map(docs.map(d => [d.id, d.ref]));
  let written = 0;
  for (let i = 0; i < brokenDocs.length; i += BATCH_LIMIT) {
    const chunk = brokenDocs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(r => batch.update(refById.get(r.id), {
      exclude: true,
      excludeReason: 'ox-stem:' + r.findings.join(','),
      excludedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    written += chunk.length;
    console.log(`  ${written} / ${brokenDocs.length} 件書き込み済み`);
  }
  console.log(`\n完了: ${written}件に exclude: true を設定しました`);
}

main().then(() => process.exit(process.exitCode || 0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
