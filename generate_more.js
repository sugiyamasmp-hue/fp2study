const fs = require('fs');
const path = require('path');

const MODEL = 'claude-haiku-4-5-20251001';
const PER_CATEGORY = 10;
const EXAMPLES_PER_CATEGORY = 3;
const SOURCE_PATH = path.join(__dirname, 'questions_export.json');
const OUTPUT_PATH = path.join(__dirname, 'questions_generated.json');

const SYSTEM_PROMPT = `あなたはFP（ファイナンシャルプランナー）2級試験の問題作成者です。
既存の問題を参考にして、同じ分野・同じ形式・同程度の難易度の新規問題を作成します。
- 4択（opts）。正解は0〜3のインデックス（ans、0始まり）
- 既存問題の文章をそのまま使わず、内容や数値や論点を変えたオリジナル問題にすること
- 解説（ex）には正解の理由と、できれば誤りの選択肢が誤りである理由も簡潔に含めること
- 出力は必ずJSON配列のみ。説明文やコードブロックは付けないこと`;

async function callClaude(system, user) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Anthropic API error: ' + JSON.stringify(data));
  return data.content?.[0]?.text || '';
}

function extractJsonArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

function isValidQuestion(item) {
  return item && typeof item.q === 'string' && item.q &&
    Array.isArray(item.opts) && item.opts.length === 4 &&
    Number.isInteger(item.ans) && item.ans >= 0 && item.ans <= 3 &&
    typeof item.ex === 'string' && item.ex;
}

async function generateForCategory(cat, examples) {
  const user = `分野「${cat}」の既存問題例:
${JSON.stringify(examples, null, 2)}

上記を参考に、同じ分野で新しい問題を${PER_CATEGORY}問作成してください。

出力形式（JSON配列のみ、ちょうど${PER_CATEGORY}件）:
[{"q": "...", "opts": ["...", "...", "...", "..."], "ans": 0, "ex": "...", "cat": "${cat}"}, ...]`;

  const text = await callClaude(SYSTEM_PROMPT, user);
  const result = extractJsonArray(text);
  if (!Array.isArray(result)) throw new Error('JSON配列ではありません');
  return result.filter(isValidQuestion).map(item => ({ ...item, cat }));
}

function groupByCategory(questions) {
  const byCat = new Map();
  questions.forEach(q => {
    if (!q.cat) return;
    if (!byCat.has(q.cat)) byCat.set(q.cat, []);
    byCat.get(q.cat).push(q);
  });
  return byCat;
}

async function main() {
  const questions = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));
  const byCat = groupByCategory(questions);

  const generated = [];
  for (const [cat, docs] of byCat) {
    const examples = docs.slice(0, EXAMPLES_PER_CATEGORY).map(({ q, opts, ans, ex }) => ({ q, opts, ans, ex }));
    console.log(`「${cat}」(参考${examples.length}件) 生成中...`);

    try {
      const items = await generateForCategory(cat, examples);
      console.log(`  ${items.length}件生成`);
      generated.push(...items);
    } catch (error) {
      console.error(`  失敗: ${error.message}`);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(generated, null, 2));
  console.log(`合計 ${generated.length}件 を ${OUTPUT_PATH} に保存しました`);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
