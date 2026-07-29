const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, 'questions_export.json');
const OUTPUT_PATH = path.join(__dirname, 'questions_ox_generated.json');

// 4択1問 → ○×4問。元のidと選択肢indexから決定的なIDを作るので、再実行しても重複せず上書きされる
function buildOxQuestions(q) {
  const correctIdx = Number(q.ans);

  return q.opts.map((optText, i) => ({
    id: `${q.id}_${i}`,
    cat: q.cat,
    q: optText,
    opts: ['○', '×'],
    ans: i === correctIdx ? 0 : 1,
    ex: q.ex || '',
    sourceId: q.id,
    sourceOptionIndex: i,
  }));
}

function main() {
  const questions = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));

  const oxQuestions = [];
  questions.forEach(q => {
    if (!Array.isArray(q.opts) || q.ans === undefined) return;
    oxQuestions.push(...buildOxQuestions(q));
  });

  console.log(`元の4択問題: ${questions.length}件 → ○×問題: ${oxQuestions.length}件 に変換`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(oxQuestions, null, 2));
  console.log(`完了: ${OUTPUT_PATH} に保存しました（内容を確認後、import_ox.js で反映してください）`);
}

main();
