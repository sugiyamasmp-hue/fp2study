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

const db = getFirestore();
const MODEL = 'claude-haiku-4-5-20251001';
const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥'];

function buildPrompt(q, oxAnswers) {
  const optsText = q.opts
    .map((opt, i) => `${CIRCLED_NUMBERS[i]}（${oxAnswers[i] === 0 ? '正しい' : '誤り'}）${opt}`)
    .join('\n');

  return `以下はFP2級の4択問題から作られた○×一問一答です。各選択肢の正誤は判定済みで、カッコ内に示しています。
元の問題：${q.q}
選択肢：
${optsText}
元の解説：${q.ex || ''}

上記①〜${CIRCLED_NUMBERS[q.opts.length - 1]}それぞれの記述について、示された正誤（変更しないこと）に沿って、
その記述単体を読んだだけで意味が通るように、なぜ正しい／誤りなのかを100字程度で説明してください。
選択肢番号（①②③④など）や「元の問題」への言及は一切しないこと。

出力形式（JSON配列、①→${CIRCLED_NUMBERS[q.opts.length - 1]}の順で${q.opts.length}件）：
["...", "...", ...]
出力はJSON配列のみ、他の文章は含めないこと。`;
}

async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
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

async function main() {
  const snapshot = await db.collection('questions').get();
  const questions = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!Array.isArray(data.opts) || data.ans === undefined) return;
    questions.push({ id: doc.id, ...data });
  });

  console.log(`元の問題数: ${questions.length}件`);

  let successCount = 0;
  const errors = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const progress = `[${i + 1}/${questions.length}] ${q.id}`;

    try {
      const oxRefs = q.opts.map((_, idx) => db.collection('questions_ox').doc(`${q.id}_${idx}`));
      const oxDocs = await db.getAll(...oxRefs);

      if (oxDocs.some(doc => !doc.exists)) {
        throw new Error('対応する questions_ox ドキュメントが存在しません（convert_to_ox.js未反映の可能性）');
      }
      const oxAnswers = oxDocs.map(doc => doc.data().ans);

      const explanations = extractJsonArray(await callClaude(buildPrompt(q, oxAnswers)));

      if (!Array.isArray(explanations) || explanations.length !== q.opts.length) {
        throw new Error(`解説の件数が選択肢数(${q.opts.length})と一致しません`);
      }

      const batch = db.batch();
      explanations.forEach((ex, idx) => {
        batch.update(oxRefs[idx], { ex: String(ex) });
      });
      await batch.commit();

      successCount++;
      console.log(`${progress} 完了`);
    } catch (error) {
      errors.push({ id: q.id, message: error.message });
      console.error(`${progress} 失敗: ${error.message}`);
    }
  }

  console.log(`\n完了: 元の問題数 ${questions.length}件 / 生成成功 ${successCount}件 / エラー ${errors.length}件`);
  if (errors.length > 0) {
    console.log('\nエラー一覧:');
    errors.forEach(e => console.log(`  ${e.id}: ${e.message}`));
  }
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
