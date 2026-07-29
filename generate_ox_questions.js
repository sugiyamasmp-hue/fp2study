const fs = require('fs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 4択問題（questions）の各選択肢を、単独で意味が通る○×問題に書き直して
// questions_ox コレクションへ保存する。convert_to_ox.js（選択肢の文章をそのまま
// 問題文にするだけで、問題文側にしかない主語・前提を補わない）の後継として、
// 1問ずつClaude APIに元の問題文＋4択をまとめて渡し、書き直させる。
//
// 使い方:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   export FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=...
//
//   node generate_ox_questions.js             # 全件処理し、questions_ox へ直接保存
//   node generate_ox_questions.js --limit=5   # 先頭5件だけ処理（動作確認用）
//   node generate_ox_questions.js --dry-run   # Firestoreへは保存せず、
//                                              # questions_ox_dry_run.json に書き出す
//                                              # （内容確認後、node import_ox.js
//                                              #  questions_ox_dry_run.json で反映可能）

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
const REQUEST_INTERVAL_MS = 300;
const DRY_RUN_OUTPUT_PATH = path.join(__dirname, 'questions_ox_dry_run.json');
const OPTION_LABELS = ['①', '②', '③', '④', '⑤', '⑥'];

const SYSTEM_PROMPT = `あなたはFP（ファイナンシャルプランナー）2級試験の問題作成者です。
4択問題の各選択肢を、独立した○×一問一答に書き換えます。

- 問題文にある主語・前提（制度名や状況設定など）が選択肢側に書かれていない場合は、
  その選択肢の文章に補って、その1文だけを読んでも意味が完結するように書き直すこと
  （内容の意味・正誤は変えないこと）
- 解説も、選択肢番号（①②③④など）や「正解は～」に一切言及せず、
  その記述単体を読んで正誤の理由が分かるように100字程度で書き直すこと
- ans は、書き直した記述文そのものがFPの知識として実際に正しいかどうかで判定すること。
  元の問題文が「適切なものはどれか」型か「不適切なものはどれか」型かに関わらず、
  記述文自体の正誤で true / false を判定すること
  （「不適切なものはどれか」型の問題では、出題上の正解選択肢は事実として誤った記述なので false になる）
- 出力は必ず次のJSON配列（選択肢の順番通り）のみとし、他の文章を含めないこと：
  [{"stmt":"単独で意味が通る記述文","ans":true or false,"ex":"単独で通じる解説文"}, ...]`;

function buildUserPrompt(q) {
  const opts = q.opts.map((opt, i) => `${OPTION_LABELS[i]}${opt}`).join('\n');
  const correctLabel = OPTION_LABELS[q.ans] || '';
  return `以下はFP2級の4択問題です。
問題文：${q.q}
選択肢：
${opts}
出題上の「正解」：${correctLabel}${q.opts[q.ans] ?? ''}
元の解説：${q.ex || '(なし)'}

この${q.opts.length}つの選択肢を、それぞれ独立した○×一問一答として書き直してください。`;
}

async function callClaude(user) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
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

function normalizeAns(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

function normalizeItem(item) {
  const stmt = typeof item?.stmt === 'string' ? item.stmt.trim() : '';
  const ex = typeof item?.ex === 'string' ? item.ex.trim() : '';
  const ans = normalizeAns(item?.ans);
  if (!stmt || !ex || ans === undefined) return null;
  return { stmt, ans, ex };
}

async function generateOxSet(q) {
  const text = await callClaude(buildUserPrompt(q));
  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed) || parsed.length !== q.opts.length) {
    throw new Error(`期待した件数(${q.opts.length}件)のJSON配列が返りませんでした`);
  }

  const normalized = parsed.map(normalizeItem);
  if (normalized.some(item => item === null)) {
    throw new Error('JSONの形式が不正です（stmt/ans/exが揃っていない項目があります）');
  }
  return normalized;
}

function buildOxDocs(q, generated) {
  return generated.map((item, i) => ({
    id: `${q.id}_${i}`,
    cat: q.cat,
    q: item.stmt,
    opts: ['○', '×'],
    ans: item.ans ? 0 : 1,
    ex: item.ex,
    sourceId: q.id,
    sourceOptionIndex: i,
  }));
}

async function fetchQuestions() {
  const snapshot = await db.collection('questions').get();
  const questions = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (Array.isArray(data.opts) && data.opts.length > 0 && data.ans !== undefined && data.q) {
      questions.push({
        id: doc.id,
        q: data.q,
        opts: data.opts,
        ans: Number(data.ans),
        ex: data.ex || '',
        cat: data.cat,
      });
    }
  });
  return questions;
}

async function saveOxDocs(docs) {
  const batch = db.batch();
  docs.forEach(({ id, ...data }) => {
    batch.set(db.collection('questions_ox').doc(id), data);
  });
  await batch.commit();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  return {
    limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
    dryRun: args.includes('--dry-run'),
  };
}

async function main() {
  const { limit, dryRun } = parseArgs();
  const allQuestions = await fetchQuestions();
  const questions = limit ? allQuestions.slice(0, limit) : allQuestions;

  console.log(`元の問題数: ${allQuestions.length}件${limit ? `（うち今回処理: ${questions.length}件）` : ''}`);
  if (dryRun) console.log(`※ --dry-run: Firestoreへは保存せず、${DRY_RUN_OUTPUT_PATH} に書き出します`);

  const dryRunDocs = [];
  const errors = [];
  let successCount = 0;

  for (const [index, q] of questions.entries()) {
    console.log(`[${index + 1}/${questions.length}] ${q.id} 処理中...`);
    try {
      const generated = await generateOxSet(q);
      const docs = buildOxDocs(q, generated);

      if (dryRun) {
        dryRunDocs.push(...docs);
      } else {
        await saveOxDocs(docs);
      }
      successCount++;
    } catch (error) {
      errors.push({ id: q.id, message: error.message });
      console.error(`  失敗 [${q.id}]: ${error.message}`);
    }

    if (index < questions.length - 1) await sleep(REQUEST_INTERVAL_MS);
  }

  if (dryRun) {
    fs.writeFileSync(DRY_RUN_OUTPUT_PATH, JSON.stringify(dryRunDocs, null, 2));
    console.log(`確認用ファイルを書き出しました: ${DRY_RUN_OUTPUT_PATH}`);
  }

  console.log('---');
  console.log(`元の問題数: ${allQuestions.length}件`);
  console.log(`生成成功数: ${successCount}件`);
  console.log(`エラー数: ${errors.length}件`);
  if (errors.length > 0) {
    console.log('エラー一覧:');
    errors.forEach(e => console.log(`  - ${e.id}: ${e.message}`));
  }
}

main().catch(error => {
  console.error('致命的エラー:', error);
  process.exit(1);
});
