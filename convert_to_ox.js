const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, 'questions_export.json');
const OUTPUT_PATH = path.join(__dirname, 'questions_ox_generated.json');

// 「不適切なものはどれか」型は ans が誤り選択肢を指す（他の3つは正しい記述）ため、極性が逆になる
const INAPPROPRIATE_PATTERN = /不適切|誤ってい|誤りは|正しくない|適切でない/;

// 「適切」「不適切」など、選択肢自体がラベルのみで文章として成立しないものは変換対象外
const BARE_LABEL_OPTS = ['適切', '不適切', '正しい', '誤り', '正しくない'];

// 4択1問 → ○×4問。元のidと選択肢indexから決定的なIDを作るので、再実行しても重複せず上書きされる
function buildOxQuestions(q) {
  const correctIdx = Number(q.ans);
  const isInappropriateType = INAPPROPRIATE_PATTERN.test(q.q);

  return q.opts.map((optText, i) => {
    const isMarkedOption = i === correctIdx;
    const isTrueStatement = isInappropriateType ? !isMarkedOption : isMarkedOption;

    return {
      id: `${q.id}_${i}`,
      cat: q.cat,
      q: optText,
      opts: ['○', '×'],
      ans: isTrueStatement ? 0 : 1,
      ex: q.ex || '',
      sourceId: q.id,
      sourceOptionIndex: i,
    };
  });
}

function isConvertible(q) {
  if (!Array.isArray(q.opts) || q.ans === undefined) return false;
  if (q.opts.every(opt => BARE_LABEL_OPTS.includes(opt))) return false;
  return true;
}

function main() {
  const questions = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));

  const oxQuestions = [];
  questions.forEach(q => {
    if (!isConvertible(q)) return;
    oxQuestions.push(...buildOxQuestions(q));
  });

  console.log(`元の4択問題: ${questions.length}件 → ○×問題: ${oxQuestions.length}件 に変換`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(oxQuestions, null, 2));
  console.log(`完了: ${OUTPUT_PATH} に保存しました（内容を確認後、import_ox.js で反映してください）`);
}

main();
