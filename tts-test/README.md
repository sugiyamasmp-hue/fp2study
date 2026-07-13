# tts-test

OpenAI の TTS API（`gpt-4o-mini-tts`）を試すためのスタンドアロンスクリプトです。
fp2study 本体には組み込まれていない、独立したフォルダで完結します。

## 使い方

1. 依存パッケージをインストール

   ```bash
   npm install
   ```

2. `.env` を用意し、`OPENAI_API_KEY` を設定

   ```bash
   cp .env.example .env
   # .env を開いて OPENAI_API_KEY=sk-... を実際のキーに書き換える
   ```

3. スクリプトを実行

   ```bash
   node generate.js "読み上げたいテキストをここに入力"
   ```

   引数を省略するとサンプルのデフォルトテキストが使われます。

生成された音声は `output.mp3` として保存されます。

## カスタマイズ

`generate.js` 内の以下の変数を編集することで挙動を変更できます。

- `VOICE`: 声質（デフォルトは `alloy`。`nova` などに変更可能）
- `INSTRUCTIONS`: 話し方の指示（トーン、間の取り方など）
- `MODEL`: 使用するモデル（デフォルト `gpt-4o-mini-tts`）
