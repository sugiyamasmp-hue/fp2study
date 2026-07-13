require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// 話し方の指示や声質はここで調整できる
const MODEL = "gpt-4o-mini-tts";
const VOICES = ["nova", "alloy", "echo"]; // 聞き比べたい声のプリセット
const INSTRUCTIONS =
  "FPの先生のように、落ち着いたトーンで、聞き取りやすく間を取りながら話してください。";

const DEFAULT_TEXT =
  "こんにちは。今日はファイナンシャルプランナーの試験対策として、資産運用の基本について解説します。";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("エラー: .env に OPENAI_API_KEY を設定してください（.env.example を参照）。");
    process.exit(1);
  }

  const text = process.argv.slice(2).join(" ") || DEFAULT_TEXT;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`テキスト: ${text}`);

  const results = [];

  for (const voice of VOICES) {
    const outputFile = path.join(__dirname, `output_${voice}.mp3`);
    console.log(`音声を生成中... (model: ${MODEL}, voice: ${voice})`);

    const response = await client.audio.speech.create({
      model: MODEL,
      voice,
      input: text,
      instructions: INSTRUCTIONS,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputFile, buffer);

    results.push({ voice, outputFile });
  }

  console.log("\n生成結果一覧:");
  for (const { voice, outputFile } of results) {
    console.log(`${voice} → ${path.basename(outputFile)} 生成完了`);
  }
}

main().catch((err) => {
  console.error("音声生成に失敗しました:", err);
  process.exit(1);
});
