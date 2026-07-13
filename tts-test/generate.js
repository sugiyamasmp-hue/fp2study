require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// 話し方の指示や声質はここで調整できる
const MODEL = "gpt-4o-mini-tts";
const VOICE = "alloy"; // "nova" などに変更可能
const INSTRUCTIONS =
  "FPの先生のように、落ち着いたトーンで、聞き取りやすく間を取りながら話してください。";
const OUTPUT_FILE = path.join(__dirname, "output.mp3");

const DEFAULT_TEXT =
  "こんにちは。今日はファイナンシャルプランナーの試験対策として、資産運用の基本について解説します。";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("エラー: .env に OPENAI_API_KEY を設定してください（.env.example を参照）。");
    process.exit(1);
  }

  const text = process.argv.slice(2).join(" ") || DEFAULT_TEXT;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`音声を生成中... (model: ${MODEL}, voice: ${VOICE})`);
  console.log(`テキスト: ${text}`);

  // 生成に失敗したときに「前回のファイルが残っていて成功したように見える」事故を防ぐため、
  // 新しい音声が届く前に古いファイルを消しておく
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }

  const response = await client.audio.speech.create({
    model: MODEL,
    voice: VOICE,
    input: text,
    instructions: INSTRUCTIONS,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("生成された音声データが空でした（APIレスポンスが不正な可能性があります）。");
  }
  fs.writeFileSync(OUTPUT_FILE, buffer);

  const stat = fs.statSync(OUTPUT_FILE);
  console.log(`保存しました: ${OUTPUT_FILE} (${stat.size} bytes, ${stat.mtime.toISOString()})`);
}

main().catch((err) => {
  console.error("音声生成に失敗しました。");
  if (err && err.status) {
    console.error(`HTTPステータス: ${err.status}`);
  }
  if (err && err.error) {
    console.error("APIエラー詳細:", JSON.stringify(err.error, null, 2));
  } else if (err && err.message) {
    console.error("メッセージ:", err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
