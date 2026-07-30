const path = require('path');
const ExcelJS = require('exceljs');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { sanitizeOxExplanation } = require('./lib/oxExplanation');

// questions_ox の中身を Excel に書き出すだけの目視チェック用スクリプト。
// 解説（ex）は Firestore には4択時代の原文がそのまま残っており、api/questions.js と
// api/camp.js が表示直前に sanitizeOxExplanation を通している。ここでも同じ関数を通すことで、
// 「実際に画面に出る解説文」から選択肢番号への参照が取り切れているかを確認できる。
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

const COLUMNS = [
  { header: 'sourceId', key: 'sourceId', width: 22 },
  { header: 'sourceOptionIndex', key: 'sourceOptionIndex', width: 18 },
  { header: 'q', key: 'q', width: 70 },
  { header: 'ans', key: 'ans', width: 6 },
  { header: 'ex', key: 'ex', width: 70 },
];

function toRow(doc) {
  const data = doc.data();
  return {
    sourceId: data.sourceId ?? '',
    sourceOptionIndex: data.sourceOptionIndex ?? '',
    q: data.q ?? '',
    // ans は opts のインデックス（0=○ / 1=×）なので、表示用の記号に直す
    ans: Array.isArray(data.opts) ? (data.opts[data.ans] ?? data.ans ?? '') : (data.ans ?? ''),
    ex: sanitizeOxExplanation(data.ex ?? '', data.opts) ?? '',
  };
}

function compareRows(a, b) {
  // numeric: true で q2 が q10 より前に来るようにする（同じ設問の○×4問が並ぶ）
  const bySource = String(a.sourceId).localeCompare(String(b.sourceId), 'ja', { numeric: true });
  if (bySource !== 0) return bySource;
  return Number(a.sourceOptionIndex) - Number(b.sourceOptionIndex);
}

function buildSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('ox_review');
  sheet.columns = COLUMNS;

  sheet.getRow(1).font = { bold: true };
  // ヘッダー行を固定して、下までスクロールしても列が分かるようにする
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach(row => sheet.addRow(row));

  // q と ex は長文なので折り返して全文を読めるようにする
  ['q', 'ex'].forEach(key => {
    sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' };
  });

  return sheet;
}

async function main() {
  const outputPath = process.argv[2] || path.join(__dirname, 'ox_review.xlsx');

  const snap = await db.collection('questions_ox').get();
  console.log(`questions_ox: ${snap.size}件 読み込みました`);

  const rows = [];
  snap.forEach(doc => rows.push(toRow(doc)));
  rows.sort(compareRows);

  const workbook = new ExcelJS.Workbook();
  buildSheet(workbook, rows);
  await workbook.xlsx.writeFile(outputPath);

  console.log(`完了: ${outputPath} に ${rows.length}件 書き出しました`);
}

module.exports = { toRow, compareRows, buildSheet, COLUMNS };

if (require.main === module) {
  main().then(() => process.exit(0)).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
