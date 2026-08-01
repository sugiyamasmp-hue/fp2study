const fs = require('fs');
const path = require('path');

// 2024年（令和6年）FP試験関連法改正の数値変更一覧
// 出典: https://passdori.com/2024-kaisei/
//
// keywords: この語が同じ設問（q/opts/ex/easy）内に共起した場合のみ
//           マッチを採用する（誤検知防止のための文脈ゲート）。
const NUMERIC_REVISIONS = [
  { label: '国民年金保険料（月額）', oldValue: '16,520円', newValue: '16,980円', keywords: ['国民年金保険料'] },
  { label: '老齢基礎年金（68歳以下・満額）', oldValue: '795,000円', newValue: '816,000円', keywords: ['老齢基礎年金', '基礎年金', '満額'] },
  { label: '老齢基礎年金（69歳以上・満額）', oldValue: '792,600円', newValue: '813,700円', keywords: ['老齢基礎年金', '基礎年金', '満額'] },
  { label: '配偶者加給年金額', oldValue: '228,700円', newValue: '234,800円', keywords: ['配偶者加給年金', '加給年金'] },
  { label: '子の加給年金額（第1・2子）', oldValue: '228,700円', newValue: '234,800円', keywords: ['子の加給年金', '加給年金'] },
  { label: '子の加給年金額（第3子以降）', oldValue: '76,200円', newValue: '78,300円', keywords: ['加給年金', '第3子'] },
  { label: '定額部分単価（68歳以下）', oldValue: '1,657円', newValue: '1,701円', keywords: ['定額部分'] },
  { label: '定額部分単価（69歳以上）', oldValue: '1,652円', newValue: '1,696円', keywords: ['定額部分'] },
  { label: '中高齢寡婦加算額', oldValue: '596,300円', newValue: '612,000円', keywords: ['中高齢寡婦加算'] },
  { label: '障害厚生年金3級最低保障額（68歳以下）', oldValue: '596,300円', newValue: '612,000円', keywords: ['障害厚生年金', '最低保障額'] },
  { label: '障害厚生年金3級最低保障額（69歳以上）', oldValue: '594,500円', newValue: '610,300円', keywords: ['障害厚生年金', '最低保障額'] },
  { label: '年金生活者支援給付金（月額）', oldValue: '5,140円', newValue: '5,310円', keywords: ['年金生活者支援給付金'] },
  { label: '在職老齢年金の支給停止調整額', oldValue: '48万円', newValue: '50万円', keywords: ['在職老齢年金', '支給停止調整額', '支給停止'] },
  { label: '住宅ローン控除限度額（認定住宅）', oldValue: '4,500万円', newValue: '5,000万円', keywords: ['住宅ローン控除', '認定住宅'] },
  { label: '住宅ローン控除限度額（ZEH省エネ）', oldValue: '3,500万円', newValue: '4,500万円', keywords: ['住宅ローン控除', 'ZEH'] },
  { label: '住宅ローン控除限度額（省エネ基準）', oldValue: '3,000万円', newValue: '4,000万円', keywords: ['住宅ローン控除', '省エネ基準'] },
  { label: '交際費（飲食代）の基準額', oldValue: '5,000円', newValue: '10,000円', keywords: ['交際費', '飲食', '一人当たり'] },
  { label: '社会保険の適用事業所規模', oldValue: '101人以上', newValue: '51人以上', keywords: ['社会保険', '特定適用事業所', '短時間労働者'] },
  { label: '児童手当の支給対象年齢', oldValue: '15歳', newValue: '18歳', keywords: ['児童手当'] },
  { label: '企業型DCの拠出限度額', oldValue: '27,500円', newValue: '55,000円', keywords: ['企業型', '確定拠出年金', 'DC'] },
];

// 制度改正の内容が「旧数値→新数値の単純置換」ではないもの（新設・料率の階層追加など）。
// 自動置換の対象にはせず、関連キーワードを含む設問だけを目視確認用にリストアップする。
const TOPIC_ONLY_REVISIONS = [
  { label: '扶養親族に係る定額減税', keywords: ['定額減税'] },
  { label: '空家等の媒介報酬特例', keywords: ['空家', '低廉'] },
  { label: '教育訓練給付金の給付率追加', keywords: ['特定一般教育訓練給付金', '専門実践教育訓練給付金'] },
  { label: 'iDeCo拠出限度額の統一', keywords: ['iDeCo', 'イデコ', '個人型確定拠出年金'] },
];

const SOURCE_FILES = [
  'questions_export.json',
  'questions_generated.json',
  'questions_generated_excluded.json',
  'questions_generated_reviewed.json',
];

const TEXT_FIELDS = ['q', 'opts', 'ex', 'easy'];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 数値の前後に他の数字が続かないことを保証する境界付きパターンを作る。
// 例: 「40万円」が「240万円」の部分文字列として誤マッチしないようにする。
function buildBoundaryPattern(value) {
  return new RegExp(`(?<![\\d,])${escapeRegExp(value)}(?!\\d)`, 'g');
}

function getQuestionText(item) {
  return TEXT_FIELDS.map((f) => {
    const v = item[f];
    if (Array.isArray(v)) return v.join('\n');
    return v || '';
  }).join('\n');
}

function loadFile(file) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Array.isArray(data) ? data : Object.values(data);
}

function findMatches(text, pattern) {
  const out = [];
  let m;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text))) {
    out.push({ index: m.index, matched: m[0] });
  }
  return out;
}

function excerpt(text, index, len, contextRadius = 25) {
  const start = Math.max(0, index - contextRadius);
  const end = Math.min(text.length, index + len + contextRadius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function main() {
  const numericHits = [];
  const topicHits = [];

  for (const file of SOURCE_FILES) {
    const items = loadFile(file);
    for (const item of items) {
      const text = getQuestionText(item);
      if (!text) continue;

      for (const rev of NUMERIC_REVISIONS) {
        const pattern = buildBoundaryPattern(rev.oldValue);
        const matches = findMatches(text, pattern);
        if (matches.length === 0) continue;

        const hasContext = rev.keywords.some((k) => text.includes(k));
        if (!hasContext) continue; // 文脈キーワードがない場合は無関係な同一数値とみなしスキップ

        for (const m of matches) {
          numericHits.push({
            file,
            id: item.id || '(no id)',
            cat: item.cat || '',
            label: rev.label,
            oldValue: rev.oldValue,
            newValue: rev.newValue,
            matchedKeyword: rev.keywords.find((k) => text.includes(k)),
            excerpt: excerpt(text, m.index, m.matched.length),
          });
        }
      }

      for (const rev of TOPIC_ONLY_REVISIONS) {
        const hit = rev.keywords.find((k) => text.includes(k));
        if (!hit) continue;
        topicHits.push({
          file,
          id: item.id || '(no id)',
          cat: item.cat || '',
          label: rev.label,
          matchedKeyword: hit,
          excerpt: excerpt(text, text.indexOf(hit), hit.length),
        });
      }
    }
  }

  const lines = [];
  lines.push('# 2024年（令和6年）法改正 数値チェック レビューリスト');
  lines.push('');
  lines.push(`生成日時: ${new Date().toISOString()}`);
  lines.push(`対象ファイル: ${SOURCE_FILES.join(', ')}`);
  lines.push('');
  lines.push('## 数値の置換候補（旧数値の記載あり・要確認）');
  lines.push('');
  if (numericHits.length === 0) {
    lines.push('該当なし');
  } else {
    lines.push('| ファイル | ID | カテゴリ | 項目 | 旧数値 | 改正後 | 一致キーワード | 抜粋 |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const h of numericHits) {
      lines.push(`| ${h.file} | ${h.id} | ${h.cat} | ${h.label} | ${h.oldValue} | ${h.newValue} | ${h.matchedKeyword} | ${h.excerpt.replace(/\|/g, '\\|')} |`);
    }
  }
  lines.push('');
  lines.push('## 構造が変わった改正項目への言及（自動置換対象外・目視確認のみ）');
  lines.push('');
  if (topicHits.length === 0) {
    lines.push('該当なし');
  } else {
    lines.push('| ファイル | ID | カテゴリ | 項目 | 一致キーワード | 抜粋 |');
    lines.push('|---|---|---|---|---|---|');
    for (const h of topicHits) {
      lines.push(`| ${h.file} | ${h.id} | ${h.cat} | ${h.label} | ${h.matchedKeyword} | ${h.excerpt.replace(/\|/g, '\\|')} |`);
    }
  }

  const outPath = path.join(__dirname, '2024-kaisei-review.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');

  console.log(`数値置換候補: ${numericHits.length} 件`);
  console.log(`構造変更の言及: ${topicHits.length} 件`);
  console.log(`レビューリストを書き出しました: ${outPath}`);
}

main();
