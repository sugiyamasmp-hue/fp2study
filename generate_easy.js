const fs = require('fs');
const path = require('path');

const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 8;
const DATA_PATH = path.join(__dirname, 'questions_export.json');

const SYSTEM_PROMPT = `あなたはFP（ファイナンシャルプランナー）2級講座の講師です。
専門的で難解な試験問題の問題文を、FP学習を始めたばかりの初学者でも意味を理解できるように、やさしい言葉で言い換えます。
- 論点や問われている内容は変えないこと
- 専門用語は残してよいが、必要に応じて簡単な補足を加えること
- 1〜2文程度の自然な日本語にすること
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
      max_tokens: 4096,
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

async function generateBatch(items) {
  const input = items.map(({ id, q }) => ({ id, q }));
  const user = `次の問題文をそれぞれやさしく言い換えてください。
入力: ${JSON.stringify(input, null, 2)}

出力形式（JSON配列のみ、idの順序は入力と同じにすること）:
[{"id": "...", "easy": "やさしい言い換え"}, ...]`;

  const text = await callClaude(SYSTEM_PROMPT, user);
  return extractJsonArray(text);
}

async function main() {
  const questions = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const byId = new Map(questions.map(q => [q.id, q]));
  const targets = questions.filter(q => !q.easy);

  console.log(`対象: ${targets.length}件 / 全体: ${questions.length}件`);

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchNo = i / BATCH_SIZE + 1;
    console.log(`バッチ${batchNo}: ${batch.length}件処理中...`);

    try {
      const results = await generateBatch(batch);
      results.forEach(({ id, easy }) => {
        const target = byId.get(id);
        if (target && easy) target.easy = easy;
      });
      fs.writeFileSync(DATA_PATH, JSON.stringify(questions, null, 2));
      console.log(`  保存しました（バッチ${batchNo}）`);
    } catch (error) {
      console.error(`  失敗（バッチ${batchNo}）:`, error.message);
    }
  }

  const done = questions.filter(q => q.easy).length;
  console.log(`完了: easyフィールドあり ${done} / ${questions.length}`);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
