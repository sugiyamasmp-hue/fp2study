# 2025年5月学科試験 ○×版（236問）投入スペック（Claude Code用）

## 対象データ

`gakka_202505_ox_cleaned.json`（236件）
※元240件から、単体判定不能な4件（財務諸表を伴う問10）を除外済み

## 投入先

`questions_ox` コレクション

## 投入前に実施した品質修正

1. **ジャンル名の表記統一**：Groq出力の「リスク管理」を、既存コレクションと同じ「リスク管理・保険」に修正済み
2. **問10（財務分析）の4件を除外**：元の設問に付随する貸借対照表の数値がstatementに含まれておらず、単体で正誤判定できないため。除外分は`gakka_202505_ox_excluded.json`に保存（将来、表データを文中に埋め込む形で書き直して再投入する候補）

## フィールドマッピング

| JSON側 | Firestore側 | 備考 |
|---|---|---|
| （新規採番） | ドキュメントID | 自動採番でよい |
| `source_question_id` | `source_question_id` | 元の4択問題（`questions`コレクション）のIDと紐付け |
| `genre` | `genre` | 修正済み・既存6ジャンル表記に統一 |
| `statement` | `stmt` | ※既存 `questions_ox` のフィールド名規則に合わせること（要確認） |
| `ans` | `ans` | true/false |
| `explanation` | `ex` | ※既存フィールド名規則に合わせること（要確認） |
| `comparative` | （任意）`needs_review` 等 | comparative:true の7件は要人間チェック対象としてフラグ保持推奨 |

**⚠️ Claude Codeへ：既存の`questions_ox`コレクションの実際のフィールド名（`stmt`/`ans`等）を先に確認し、それに合わせてマッピングしてください。**

## comparative:true の7件（要人間チェック）

投入はするが、以下は「他の選択肢との比較」を前提にした表現が残っている可能性があるため、浩之さんの目視確認を推奨：

- gakka_202505_09（住宅ローン返済方法の比較・2件）
- gakka_202505_12（収入保障保険／低解約返戻金型の比較・2件）
- gakka_202505_13（保証期間付終身年金の男女比較）
- gakka_202505_19（限定告知型医療保険の比較）
- gakka_202505_24（債券の償還期間の比較）

## 投入手順

1. `questions_ox` コレクションの既存フィールド名規則を確認
2. 236件を新規ドキュメントとして追加
3. 投入後、`audit_ox.js` を実行し、正誤判定に問題がないか確認
4. 管理画面等でジャンル別件数が想定通り増えているか確認：
   - ライフプランニング・社会保険：+36
   - リスク管理・保険：+40
   - 金融資産運用：+40
   - タックスプランニング：+40
   - 不動産：+40
   - 相続・事業承継：+40
   - 合計：+236問

## 保留事項

- 除外した4件（問10・財務分析）は、貸借対照表の数値をstatement文中に埋め込む形で書き直せば投入可能。別タスクとして後日対応

---

# 実施結果（Claude Code追記）

## 既存 `questions_ox` の実際のフィールド名

`convert_to_ox.js` / `audit_ox.js` / `api/questions.js` を確認したところ、実際のフィールド名は
スペック表の想定（`stmt` 等）とは異なっていた。**実データに合わせて以下のマッピングで投入する。**

| JSON側 | Firestore側 | 備考 |
|---|---|---|
| `genre` | `cat` | `stmt`ではなく`cat`。`lib/categoryDomains.js` の6分野表記と一致することを検証済み |
| `statement` | `q` | |
| `ans`（true/false） | `ans`（**0/1**） | `questions_ox` の `ans` は `opts` の添字。**○=0 / ×=1** |
| `explanation` | `ex` | |
| `source_question_id` | `sourceId` | 既存の命名規則に合わせた |
| （出現順 0〜3） | `sourceOptionIndex` | |
| `comparative: true` | `needs_review: true` | 7件のみ付与 |
| — | `opts: ['○','×']` | 固定 |
| — | `exam: '2025年5月学科試験'` | 出典 |
| — | `standalone: true` | 下記参照 |

ドキュメントIDは `${source_question_id}_${出現順}`（例: `gakka_202505_01_0`）。
`convert_to_ox.js` と同じ決定的な採番なので、再実行しても重複せず上書きになる。

## `standalone: true` を追加した理由

既存の○×は `convert_to_ox.js` が `questions`（4択の原本）を機械展開したもので、
`audit_ox.js` / `fix_ox_ans.js` / `migrate_fix_ox_q.js` は `sourceId` で原本を引き当てて
設問文や正誤を検算・上書きする作りになっている。

今回の236問は最初から単体で成立する記述文として書かれており、`questions` に原本が存在しない。
そのままだと `audit_ox.js` が236件すべてを「原本が引けない ← 自動判定不可」として警告扱いし、
将来 `questions` に同じIDの原本が入った場合は `migrate_fix_ox_q.js` が `q` を上書きして
記述文を壊す危険がある。そのため `standalone: true` を立て、上記3スクリプト側で対象外にした。
`audit_ox.js` では「単体作成の○×（4択原本なし） ← 検算対象外（正常）」として別枠で数える。

## 実行手順

```bash
node import_gakka_202505_ox.js --dry-run   # 検証・件数確認のみ（Firestoreに接続しない）
node import_gakka_202505_ox.js             # 投入（要 FIREBASE_* 環境変数）
node audit_ox.js                           # 投入後の棚卸し
```

`--dry-run` の結果（検証OK・ジャンル別件数はスペックの想定と完全一致）:

```
ライフプランニング・社会保険    36 件  ✅   リスク管理・保険  40 件  ✅
金融資産運用                    40 件  ✅   タックスプランニング  40 件  ✅
不動産                          40 件  ✅   相続・事業承継  40 件  ✅
合計 236 件 / 正解の内訳: ○ 125件 × 111件 / needs_review 7件
```

## データファイルの置き場所

- `monndai/gakka_202505_ox_cleaned.json`（投入する236件）
- `monndai/gakka_202505_ox_excluded.json`（保留中の4件・問10）
