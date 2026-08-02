const fs = require('fs');
const path = require('path');

const DIR = process.argv[2];
const EXPECTED = 180;
const REQUIRED = ['id','genre','stmt','stmt_before','ans','ex','ex_before','source_question_id'];

// 3. 選択肢番号への言及パターン
const CHOICE_PATTERNS = [
  { name: '「Nは」', re: /[1-4１-４]は/g },
  { name: '「Nが」', re: /[1-4１-４]が/g },
  { name: '「N番」', re: /[1-4１-４]番/g },
  { name: '「選択肢」', re: /選択肢/g },
  { name: '「が不適切」', re: /が不適切/g },
  { name: '「が正解」', re: /が正解/g },
  { name: '「N. 不適切/適切」', re: /[1-4１-４]\s*[.．、]\s*(不適切|適切|正しい|誤り)/g },
  { name: '「Nも正しい」', re: /[1-4１-４]も(正しい|誤り|同様)/g },
  { name: '「（N）」', re: /[（(][1-4１-４][）)]/g },
];

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
const parseErrors = [];
const all = [];
const perFile = {};

for (const f of files) {
  const p = path.join(DIR, f);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    parseErrors.push({ file: f, error: e.message });
    continue;
  }
  if (!Array.isArray(data)) { parseErrors.push({ file: f, error: 'top-level is not an array' }); continue; }
  perFile[f] = data.length;
  data.forEach((item, i) => all.push({ file: f, index: i, item }));
}

console.log('='.repeat(70));
console.log('1. JSON パース');
console.log('='.repeat(70));
if (parseErrors.length === 0) {
  console.log('OK: 全 ' + files.length + ' ファイルが正常にパースできました');
} else {
  parseErrors.forEach(e => console.log('NG: ' + e.file + ' -> ' + e.error));
}
files.forEach(f => console.log('  - ' + f + ' : ' + (perFile[f] ?? 'PARSE ERROR') + ' 件'));

console.log('');
console.log('='.repeat(70));
console.log('2. 必須フィールド');
console.log('='.repeat(70));
const missingRows = [];
for (const { file, index, item } of all) {
  const miss = REQUIRED.filter(k => !(k in item) || item[k] === null || item[k] === undefined || (typeof item[k] === 'string' && item[k].trim() === ''));
  if (miss.length) missingRows.push({ file, index, id: item.id, miss });
}
if (!missingRows.length) console.log('OK: 全 ' + all.length + ' 件に8フィールドすべてが存在');
else missingRows.forEach(r => console.log('NG: [' + r.file + ' #' + r.index + '] id=' + r.id + ' 欠落: ' + r.miss.join(', ')));

// ans 値チェック（おまけ）
const badAns = all.filter(({item}) => item.ans !== 0 && item.ans !== 1);
if (badAns.length) {
  console.log('※ ans が 0/1 以外: ' + badAns.length + ' 件');
  badAns.forEach(({item}) => console.log('   id=' + item.id + ' ans=' + JSON.stringify(item.ans)));
}
// id 重複
const idCount = {};
all.forEach(({item}) => idCount[item.id] = (idCount[item.id]||0)+1);
const dupIds = Object.entries(idCount).filter(([,c]) => c > 1);
if (dupIds.length) {
  console.log('※ id 重複: ' + dupIds.map(([k,c]) => k + '(' + c + ')').join(', '));
} else {
  console.log('※ id 重複なし');
}

console.log('');
console.log('='.repeat(70));
console.log('3. stmt / ex に残る選択肢番号への言及');
console.log('='.repeat(70));
const choiceHits = [];
for (const { file, item } of all) {
  for (const field of ['stmt','ex']) {
    const v = item[field];
    if (typeof v !== 'string') continue;
    const hits = [];
    for (const p of CHOICE_PATTERNS) {
      p.re.lastIndex = 0;
      const m = v.match(p.re);
      if (m) hits.push(p.name + ' -> ' + [...new Set(m)].join('/'));
    }
    if (hits.length) choiceHits.push({ file, id: item.id, field, hits, text: v });
  }
}
if (!choiceHits.length) console.log('OK: 該当なし');
else {
  console.log('NG: ' + choiceHits.length + ' 箇所');
  choiceHits.forEach(h => {
    console.log('---');
    console.log(' id=' + h.id + '  field=' + h.field + '  file=' + h.file);
    console.log(' 検出: ' + h.hits.join(' | '));
    console.log(' 本文: ' + h.text.replace(/\n/g,'\\n').slice(0, 200));
  });
}

console.log('');
console.log('='.repeat(70));
console.log('3b. stmt が変換されず stmt_before と同一（リード文が残存）');
console.log('='.repeat(70));
const sameStmt = all.filter(({item}) => item.stmt === item.stmt_before);
const leadIn = all.filter(({item}) => typeof item.stmt === 'string' && (item.stmt.includes('\n') || /どれか。?$/.test(item.stmt.split('\n')[0])));
console.log('stmt === stmt_before : ' + sameStmt.length + ' 件');
sameStmt.forEach(({file,item}) => console.log('  - ' + item.id + ' (' + file + ')'));
console.log('stmt に改行（リード文＋選択肢）が残存 : ' + leadIn.length + ' 件');

console.log('');
console.log('='.repeat(70));
console.log('4. 件数');
console.log('='.repeat(70));
console.log('合計: ' + all.length + ' 件 / 期待値 ' + EXPECTED + ' 件 -> ' + (all.length === EXPECTED ? 'OK' : 'NG (差分 ' + (all.length - EXPECTED) + ')'));

console.log('');
console.log('='.repeat(70));
console.log('5. source_question_id ごとの ex / ex_before 一致（使い回しルール）');
console.log('='.repeat(70));
const groups = {};
for (const { file, item } of all) {
  (groups[item.source_question_id] ||= []).push({ file, item });
}
const groupIssues = [];
for (const [sqid, rows] of Object.entries(groups)) {
  const exSet = new Set(rows.map(r => r.item.ex));
  const exbSet = new Set(rows.map(r => r.item.ex_before));
  if (exSet.size > 1 || exbSet.size > 1) {
    groupIssues.push({ sqid, rows, exSet, exbSet });
  }
}
console.log('source_question_id グループ数: ' + Object.keys(groups).length);
const sizes = {};
Object.values(groups).forEach(r => sizes[r.length] = (sizes[r.length]||0)+1);
console.log('グループサイズ分布: ' + Object.entries(sizes).sort().map(([k,v]) => k+'問x'+v+'グループ').join(', '));
if (!groupIssues.length) console.log('OK: 全グループで ex / ex_before が一致');
else {
  console.log('NG: ' + groupIssues.length + ' グループで不一致');
  groupIssues.forEach(g => {
    console.log('---');
    console.log(' source_question_id=' + g.sqid + ' (' + g.rows.length + '件)');
    if (g.exSet.size > 1) {
      console.log('  ex が ' + g.exSet.size + ' 種類:');
      [...g.exSet].forEach((v,i) => {
        const ids = g.rows.filter(r => r.item.ex === v).map(r => r.item.id);
        console.log('   [' + (i+1) + '] ' + ids.join(', '));
        console.log('       ' + v.replace(/\n/g,'\\n').slice(0,160));
      });
    }
    if (g.exbSet.size > 1) {
      console.log('  ex_before が ' + g.exbSet.size + ' 種類:');
      [...g.exbSet].forEach((v,i) => {
        const ids = g.rows.filter(r => r.item.ex_before === v).map(r => r.item.id);
        console.log('   [' + (i+1) + '] ' + ids.join(', '));
        console.log('       ' + v.replace(/\n/g,'\\n').slice(0,160));
      });
    }
  });
}

console.log('');
console.log('='.repeat(70));
console.log('付録: グループが4問未満（分割の取りこぼし疑い）');
console.log('='.repeat(70));
Object.entries(groups).filter(([,r]) => r.length !== 4).forEach(([k,r]) => {
  console.log('  ' + k + ': ' + r.length + '件 -> ' + r.map(x=>x.item.id.split('_').pop()).sort().join(',') + '  (' + r[0].file + ')');
});
