/**
 * questions_ox の「前提データ欠落」棚卸しスクリプト（読み取り専用）
 *
 * 4択1問 → ○×4問の機械展開では、元の設問が持っていた共通の前提資料
 * （財務データの表・親族関係図・債券の条件など）が落ちて、記述文だけが残る。
 * すると「配当性向は、Ｘ社よりもＹ社の方が高い。」のように単体では判定不能な
 * ○×問題ができあがる。このスクリプトはその手の問題を洗い出す。
 *
 * 判定ロジックは lib/premiseGaps.js。確度は high / medium の2段階。
 *
 * 出力：
 *   1. 疑いのある記述文の一覧（元設問 sourceId ごとにまとめ、確度・シグナル付き）
 *   2. 各 sourceId について questions（4択の原本）の設問文をそのまま表示
 *      → 前提文がどこへ消えたのかを目で確認できる
 *   3. シグナル別・ジャンル別の件数サマリ
 *
 * 使い方：
 *   node audit_ox_premise.js                    # Firestore の questions_ox を全件走査
 *   node audit_ox_premise.js --tier=high        # 確度 high のみ
 *   node audit_ox_premise.js --json=out.json    # 結果をJSONにも書き出す
 *   node audit_ox_premise.js --file=monndai/maru_batsu_all_960.json
 *                                               # 認証情報なしでローカルJSONを走査
 *
 * Firestore モードには FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY が必要。書き込みは一切行わない。
 */

const fs = require('fs');
const path = require('path');
const { analyzeAll, SIGNAL_LABELS } = require('./lib/premiseGaps');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name, def) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : def;
  };
  return {
    file: get('file', ''),
    tier: get('tier', 'all'),
    jsonOut: get('json', ''),
    limit: Number(get('limit', 0)) || 0,
  };
}

function line(char = '─', n = 72) {
  return char.repeat(n);
}

// 全角は2桁ぶんの幅として揃える（padEnd は文字数で数えるため日本語ラベルが崩れる）
function padVisual(s, width) {
  const str = String(s);
  const w = [...str].reduce((n, c) => n + (/[　-鿿＀-｠]/.test(c) ? 2 : 1), 0);
  return str + ' '.repeat(Math.max(0, width - w));
}

function truncate(s, n) {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return [...t].length > n ? [...t].slice(0, n).join('') + '…' : t;
}

// ─────────────────────────────────────────────────────────────
// 入力の読み込み
// ─────────────────────────────────────────────────────────────

/*
 * ローカルJSONを読む。monndai/ 配下のダンプはファイルごとにキー名が違うので吸収する。
 *   maru_batsu_*.json          … { id, q, ans, ex, cat }         groupId は id の "-N" を落としたもの
 *   gakka_202505_ox_*.json     … { source_question_id, statement, ans, explanation, genre }
 */
function loadFromFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const items = Array.isArray(raw) ? raw : (raw.questions || []);

  // source_question_id 形式のダンプには id が無い。import_gakka_202505_ox.js と同じ
  // 「元設問ごとの出現順」で採番して、Firestore 上の実ドキュメントIDと一致させる
  const seenPerSource = new Map();

  return items.map((x) => {
    const q = x.q !== undefined ? x.q : x.statement;
    let id = x.id !== undefined ? String(x.id) : null;
    if (id === null) {
      const src = String(x.source_question_id);
      const n = seenPerSource.get(src) || 0;
      seenPerSource.set(src, n + 1);
      id = `${src}_${n}`;
    }
    const groupId = x.source_question_id !== undefined
      ? String(x.source_question_id)
      : (x.sourceId !== undefined ? String(x.sourceId) : id.replace(/[-_]\d+$/, ''));
    return {
      id,
      groupId,
      q: String(q || ''),
      cat: x.cat || x.genre || '',
      ex: x.ex || x.explanation || '',
      ans: x.ans,
    };
  });
}

async function loadFromFirestore() {
  const { db } = require('./lib/db');

  const fetchAll = async (name) => {
    const snap = await db.collection(name).get();
    const out = [];
    snap.forEach(doc => out.push({ id: doc.id, ...doc.data() }));
    return out;
  };

  const [oxDocs, sourceDocs] = await Promise.all([
    fetchAll('questions_ox'),
    fetchAll('questions'),
  ]);

  const items = oxDocs.map(d => ({
    id: d.id,
    // sourceId が無い場合はドキュメントIDの末尾 "_N" を落として元設問を推定する
    groupId: d.sourceId || String(d.id).replace(/_\d+$/, ''),
    q: String(d.q || ''),
    cat: d.cat || '',
    ex: d.ex || '',
    ans: d.ans,
    exclude: !!d.exclude,
    standalone: !!d.standalone,
    needsReview: !!d.needs_review,
  }));

  return { items, sourceById: new Map(sourceDocs.map(d => [d.id, d])), oxTotal: oxDocs.length };
}

// ─────────────────────────────────────────────────────────────
// レポート
// ─────────────────────────────────────────────────────────────

function printOriginal(source) {
  if (!source) {
    console.log('      （questions に原本が見つかりません。standalone な○×か、別経路で投入されたもの）');
    return;
  }
  console.log('      ── questions（4択の原本） ──');
  // convert_to_ox.js は q を「設問文\n選択肢文」で作るため、原本の q には前提文が残っている
  String(source.q || '').split('\n').forEach(l => console.log(`      | ${l}`));
  if (Array.isArray(source.opts)) {
    source.opts.forEach((o, i) => {
      const mark = i === Number(source.ans) ? '✔' : ' ';
      console.log(`      | ${mark} ${i + 1}. ${truncate(o, 90)}`);
    });
  }
  if (source.ex) console.log(`      | 解説: ${truncate(source.ex, 140)}`);
}

function main() {
  const opts = parseArgs();

  const run = opts.file
    ? Promise.resolve({
        items: loadFromFile(path.resolve(opts.file)),
        sourceById: new Map(),
        oxTotal: null,
        label: opts.file,
      })
    : loadFromFirestore().then(r => ({ ...r, label: 'Firestore: questions_ox' }));

  return run.then(({ items, sourceById, oxTotal, label }) => {
    console.log(`対象: ${label}`);
    console.log(`読み込み: ${items.length} 件（読み取りのみ・書き込みなし）\n`);

    let findings = analyzeAll(items);
    if (opts.tier !== 'all') findings = findings.filter(f => f.tier === opts.tier);

    const byGroup = new Map();
    for (const f of findings) {
      if (!byGroup.has(f.groupId)) byGroup.set(f.groupId, []);
      byGroup.get(f.groupId).push(f);
    }

    /* ============================================================
       1. 疑いのある記述文（元設問ごと）
       ============================================================ */
    console.log(line('═'));
    console.log('【1】前提データ欠落が疑われる○×問題');
    console.log(line('═'));

    if (byGroup.size === 0) {
      console.log('  該当なし\n');
    }

    let shown = 0;
    for (const [groupId, members] of byGroup) {
      if (opts.limit && shown >= opts.limit) {
        console.log(`  …（--limit=${opts.limit} により以降を省略。全 ${byGroup.size} グループ）\n`);
        break;
      }
      shown++;

      const worst = members.some(m => m.tier === 'high') ? 'high' : 'medium';
      const cat = members[0].cat || '(cat未設定)';
      console.log(`\n  [${worst.toUpperCase()}] sourceId: ${groupId}   （${cat}）  ${members.length}件`);
      console.log(`  ${line('┈', 68)}`);

      for (const m of members) {
        const flags = [
          m.exclude ? 'exclude済' : null,
          m.standalone ? 'standalone' : null,
          m.needsReview ? 'needs_review' : null,
        ].filter(Boolean);
        const ansMark = m.ans === 0 ? '○' : (m.ans === 1 ? '×' : '?');
        console.log(`    ${m.id}  [${ansMark}]${flags.length ? ' {' + flags.join(',') + '}' : ''}`);
        console.log(`      ${m.q}`);
        console.log(`      シグナル: ${m.signals.map(s => SIGNAL_LABELS[s] || s).join(' / ')}`);
        if (m.ex) console.log(`      解説: ${truncate(m.ex, 120)}`);
      }

      if (sourceById.size) printOriginal(sourceById.get(groupId));
    }
    console.log('');

    /* ============================================================
       2. サマリ
       ============================================================ */
    const bySignal = new Map();
    const byCat = new Map();
    const byTier = { high: 0, medium: 0 };
    for (const f of findings) {
      byTier[f.tier]++;
      for (const s of new Set(f.signals)) bySignal.set(s, (bySignal.get(s) || 0) + 1);
      const c = f.cat || '(cat未設定)';
      byCat.set(c, (byCat.get(c) || 0) + 1);
    }

    console.log(line('═'));
    console.log('【2】サマリ');
    console.log(line('═'));
    console.log(`  母数            : ${items.length} 件${oxTotal !== null ? `（questions_ox 全件）` : ''}`);
    console.log(`  疑いあり        : ${findings.length} 件 / ${byGroup.size} グループ（元設問）`);
    console.log(`    確度 high     : ${byTier.high} 件`);
    console.log(`    確度 medium   : ${byTier.medium} 件`);
    console.log('');
    console.log('  シグナル別:');
    for (const [s, n] of [...bySignal.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${padVisual(SIGNAL_LABELS[s] || s, 46)} ${String(n).padStart(4)} 件`);
    }
    console.log('');
    console.log('  ジャンル別:');
    for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${padVisual(c, 28)} ${String(n).padStart(4)} 件`);
    }
    console.log('');

    if (opts.jsonOut) {
      const outPath = path.resolve(opts.jsonOut);
      fs.writeFileSync(outPath, JSON.stringify(findings, null, 2), 'utf-8');
      console.log(`結果を ${outPath} に書き出しました（${findings.length}件）`);
    }
  });
}

main().then(() => process.exit(0)).catch(error => {
  console.error('エラー:', error.message);
  if (!process.env.FIREBASE_PROJECT_ID && !process.argv.some(a => a.startsWith('--file='))) {
    console.error('\nFIREBASE_PROJECT_ID などの環境変数が未設定です。');
    console.error('認証情報なしで試す場合は --file=monndai/maru_batsu_all_960.json を指定してください。');
  }
  process.exit(1);
});
