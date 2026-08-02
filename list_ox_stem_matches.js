/**
 * questions_ox の設問文に「最も不適切」「最も適切」を含むドキュメントを全件リストアップする
 * 読み取り専用スクリプト。
 *
 * これらは4択の設問指示文（「〜次の記述のうち、最も不適切なものはどれか。」）の名残りで、
 * 記述を1つしか出さない○×では設問として破綻する。
 *
 * 重要な見分け方:
 *   lib/oxExplanation.js の sanitizeOxQuestion が表示直前にこの指示文を取り除くため、
 *   ヒットしたドキュメントがそのまま画面で壊れて見えるとは限らない。そこでこのスクリプトは
 *   ヒットを2つに分けて出す。
 *
 *     [解消済み] 整形で指示文ごと消えるため、画面上は正常に見えている（データ修正は不要）
 *     [未解消]   整形後も文言が残る＝実際に画面で壊れている（要対応）
 *
 * 注意: 設問文のフィールドは questions_ox では q。stmt は index.html が表示用に
 *       作っているフロント側だけの名前で、Firestore には存在しない。
 *       念のため stmt / statement / text もフォールバックとして探す。
 *
 * 使い方:
 *   node list_ox_stem_matches.js                    … Firestoreを検索して一覧表示
 *   node list_ox_stem_matches.js --json out.json    … ヒット全件をJSONへ書き出す
 *   node list_ox_stem_matches.js --csv out.csv      … 表計算で確認したいとき
 *   node list_ox_stem_matches.js --from export.json … JSONを直接読む（認証情報が無い環境用）
 *   node list_ox_stem_matches.js --pattern "どれか" … 検索語を差し替える（正規表現）
 */

const fs = require('fs');
const { sanitizeOxQuestion } = require('./lib/oxExplanation');

const DEFAULT_PATTERN = '最も不適切|最も適切';
const Q_FIELDS = ['q', 'stmt', 'statement', 'text'];
const OX_OPTS = ['○', '×'];

function initDb() {
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
  return getFirestore();
}

const line = ch => ch.repeat(74);
const oneLine = s => String(s || '').replace(/\n/g, ' ⏎ ');
const truncate = (s, n) => (oneLine(s).length > n ? oneLine(s).slice(0, n) + '…' : oneLine(s));

// 設問文がどのフィールドに入っているかはコレクションによって違うため、最初に見つかったものを使う
function questionFieldOf(doc) {
  return Q_FIELDS.find(f => typeof doc[f] === 'string' && doc[f].length > 0) || null;
}

async function loadDocs(fromPath) {
  if (fromPath) {
    const raw = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.questions || []);
  }
  const snap = await initDb().collection('questions_ox').get();
  const docs = [];
  snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
  return docs;
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const fromPath = argValue('--from');
  const jsonOut = argValue('--json');
  const csvOut = argValue('--csv');
  const pattern = argValue('--pattern') || DEFAULT_PATTERN;
  const re = new RegExp(pattern);

  const docs = await loadDocs(fromPath);

  console.log(line('═'));
  console.log(`questions_ox 検索: /${pattern}/`);
  console.log(line('═'));
  console.log(`  総件数: ${docs.length}件` + (fromPath ? `（${fromPath} から読み込み）` : ''));

  const hits = [];
  let noField = 0;

  for (const doc of docs) {
    const field = questionFieldOf(doc);
    if (!field) { noField++; continue; }
    const original = doc[field];
    if (!re.test(original)) continue;

    const opts = Array.isArray(doc.opts) ? doc.opts : OX_OPTS;
    const shown = String(sanitizeOxQuestion(original, opts) || '');
    hits.push({
      id: doc.id,
      cat: doc.cat || '',
      field,
      excluded: doc.exclude === true,
      standalone: doc.standalone === true,
      sourceId: doc.sourceId || '',
      resolved: !re.test(shown),   // 整形後に文言が消えていれば画面上は解消済み
      original,
      shown,
    });
  }

  if (noField) console.log(`  ※ 設問文フィールド（${Q_FIELDS.join('/')}）が見つからないもの: ${noField}件`);
  console.log(`  ヒット: ${hits.length}件\n`);

  if (hits.length === 0) {
    console.log('  該当するドキュメントはありませんでした。');
    return;
  }

  const unresolved = hits.filter(h => !h.resolved);
  const resolved = hits.filter(h => h.resolved);

  const dump = (title, list, showBoth) => {
    console.log(line('─'));
    console.log(title);
    console.log(line('─'));
    if (!list.length) { console.log('  なし\n'); return; }
    list.forEach((h, i) => {
      const tags = [h.excluded ? '除外済み' : null, h.standalone ? '単体作成' : null]
        .filter(Boolean).join(' ');
      console.log(`  ${String(i + 1).padStart(3)}. [${h.id}] (${h.cat})${tags ? '  ' + tags : ''}`);
      console.log(`       元: ${truncate(h.original, 96)}`);
      if (showBoth) console.log(`       表示: ${truncate(h.shown, 96)}`);
    });
    console.log('');
  };

  dump(`【要対応】整形後も文言が残る＝実際に画面で壊れている: ${unresolved.length}件`, unresolved, true);
  dump(`【解消済み】表示時の整形で消えるため画面上は正常: ${resolved.length}件`, resolved, true);

  console.log(line('─'));
  console.log('【内訳】');
  console.log(line('─'));

  const byPhrase = {};
  hits.forEach(h => {
    (h.original.match(new RegExp(pattern, 'g')) || []).forEach(m => {
      byPhrase[m] = (byPhrase[m] || 0) + 1;
    });
  });
  console.log('  文言別（延べ）:');
  Object.entries(byPhrase).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`    ${k}: ${v}件`));

  const byCat = {};
  hits.forEach(h => { byCat[h.cat || '(未設定)'] = (byCat[h.cat || '(未設定)'] || 0) + 1; });
  console.log('  ジャンル別:');
  Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`    ${k}: ${v}件`));

  console.log('  状態別:');
  console.log(`    要対応（整形後も残る）: ${unresolved.length}件`);
  console.log(`    解消済み（整形で消える）: ${resolved.length}件`);
  console.log(`    うち exclude:true 済み : ${hits.filter(h => h.excluded).length}件`);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(hits, null, 2));
    console.log(`\n  ヒット全件を ${jsonOut} へ書き出しました。`);
  }
  if (csvOut) {
    const esc = v => '"' + String(v).replace(/"/g, '""').replace(/\n/g, '\\n') + '"';
    const rows = [['id', 'cat', 'field', 'resolved', 'excluded', 'standalone', 'sourceId', 'original', 'shown']];
    hits.forEach(h => rows.push([h.id, h.cat, h.field, h.resolved, h.excluded, h.standalone, h.sourceId, h.original, h.shown]));
    fs.writeFileSync(csvOut, '﻿' + rows.map(r => r.map(esc).join(',')).join('\n'));
    console.log(`  ヒット全件を ${csvOut} へ書き出しました（Excelで開けるBOM付きUTF-8）。`);
  }

  console.log('\n  ※ このスクリプトは書き込みを一切行いません。');
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
