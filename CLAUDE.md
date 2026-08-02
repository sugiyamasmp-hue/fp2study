# fp2study

FP2級の学習アプリ。フロントは `index.html` 単体、バックエンドは Vercel Serverless Functions（`api/`）、
データストアは Firestore（`lib/db.js` 経由）。

## api/ にファイルを追加するときの制約

**Vercel Hobbyプランは1デプロイあたり Serverless Function 12個まで。`api/*.js` の1ファイル = 1関数。**

上限を超えると本番デプロイが `Error` で落ちる（過去に2回発生：25eafc6, および今回）。
新しいエンドポイントを足す前に `ls api/*.js | wc -l` を必ず確認し、12個に達していたら
新規ファイルを作らず既存のハンドラにクエリパラメータで相乗りさせる。

統合済みの例：

| エンドポイント | 振り分け |
| --- | --- |
| `api/questions.js` | `source=sukima` / `source=jitsugi` / 未指定=通常演習 |
| `api/camp.js` | `method` + `action` |
| `api/mock-exam.js` | `action` |
| `api/cases.js` | `id` の有無で一覧/詳細 |
