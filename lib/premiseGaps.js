/*
 * ○×問題の「前提データ欠落」検出。
 *
 * 4択1問 → ○×4問の機械展開（convert_to_ox.js など）では、選択肢の文だけを取り出して
 * 記述文にする。元の設問が〈財務データの表〉〈親族関係図〉〈債券の条件〉といった
 * 共通の前提資料を持っていた場合、その前提が落ちて記述文だけが残り、単体では
 * 正誤を判定できない問題になる。
 *
 *   例）4択：「Ｘ社とＹ社の下記＜財務データ＞に基づき、適切なものはどれか」
 *       ○×：「配当性向は、Ｘ社よりもＹ社の方が高い。」  ← 財務データが無く判定不能
 *
 * ここでは記述文の形から、その手の欠落を機械的に洗い出す。
 * 判定は5つのシグナルの組み合わせで、確度を high / medium の2段階に分ける。
 * 誤検出はゼロにできないので、最終判断は人間が原本（questions）を見て行うこと。
 */

// Ｘ社・Ｙ社・Ａさん など、共通の前提でしか定義されない主体のラベル。
// 「顧客から相談を受けたＦＰのＡさんは…」のように記述文中で定義されるものもあるので、
// このラベルの存在だけでは欠落と判定しない（後段の条件と組み合わせる）。
const ENTITY_LABEL = /[ＸＹＺＷＡ-Ｈ甲乙丙](?:社|銘柄|ファンド|投資信託|さん|氏)|[XYZWA-H]社|(?:上場株式|株式|債券|土地|建物)[ＸＹＺ甲乙]/g;

// 記述文中でその主体を定義している（＝前提が文内で完結している）と見なせる言い回し
const ENTITY_INTRODUCED = /(?:から|を受けた|である|とする|という|名義|所有する|勤務|加入|契約)/;

// 比較を表す言い回し
const COMPARISON = /より(?:も)?|と比較|に比べ|上回|下回|同額|同程度|いずれも|両社|両者|各社/;

// 「上記の資料」型の指示語。記述文の外を参照している時点で前提が欠けている
const DEICTIC_REFERENCE = /上記|下記|前述|後述|上表|下表|次の表|この表|上図|下図|別表|資料に|資料の|資料から|設例|＜[^＞]*データ|〈[^〉]*データ/;

// 「…は、30.0％である。」のような、値そのものを主張する末尾。
// 単位の直後に「である／となる」が来る形だけを拾う。
const VALUE_CLAIM = /[はが]、?\s*[▲△-]?[0-9０-９][0-9０-９,，.．]*\s*(?:％|%|パーセント|円|万円|億円|兆円|倍|㎡|平方メートル|年|カ月|か月)(?:程度)?(?:で|である|となる|とな)/;

// 値主張の主語（「配当性向は」の「配当性向」）を取り出す。クラスタ判定に使う
const VALUE_SUBJECT = /^(.{1,30}?)[はが]、?\s*[▲△-]?[0-9０-９][0-9０-９,，.．]*\s*(?:％|%|パーセント|円|万円|億円|兆円|倍|㎡|平方メートル|年|カ月|か月)/;

// 値主張だけで成り立つ短文の上限。これを超える文は自前で条件を書いている
// （例：「表面利率が0.5％、残存期間が10年の債券を…した場合の所有期間利回りは0.04％である」）
// ことが多く、前提欠落ではない
const BARE_CLAIM_MAX_LEN = 42;

function distinctEntities(text) {
  const found = String(text || '').match(ENTITY_LABEL) || [];
  return [...new Set(found)];
}

function normalizeDigits(s) {
  return String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/*
 * 記述文1件を見て、前提データ欠落を疑わせるシグナルを返す。
 * クラスタ（同じ元設問から出た兄弟問題）を見ないと分からないものは analyzeGroup 側で足す。
 */
function detectSignals(statement) {
  const q = String(statement || '');
  const signals = [];
  const entities = distinctEntities(q);

  // S1 比較参照型：Ｘ社とＹ社など複数の主体を比較しているが、その中身が文内に無い
  if (entities.length >= 2 && COMPARISON.test(q) && !VALUE_CLAIM.test(q)) {
    signals.push('comparative-entities');
  }

  // S2 指示語参照型：「上記の資料」など文の外を参照している
  if (DEICTIC_REFERENCE.test(q)) {
    signals.push('deictic-reference');
  }

  // S3 宙に浮いた主体：主体ラベルはあるが、その主体を定義する言い回しが無い短文
  if (entities.length >= 1 && q.length <= BARE_CLAIM_MAX_LEN && !ENTITY_INTRODUCED.test(q.replace(/である。?$/, ''))) {
    signals.push('dangling-entity');
  }

  // S4 裸の値主張：短い文で値だけを断定していて、計算の入力が文内に無い
  if (VALUE_CLAIM.test(q) && q.length <= BARE_CLAIM_MAX_LEN) {
    signals.push('bare-value-claim');
  }

  return signals;
}

// 値主張の主語を返す（取れなければ null）
function valueSubject(statement) {
  const m = String(statement || '').match(VALUE_SUBJECT);
  return m ? m[1].replace(/^(?:その|当該|この)/, '').trim() : null;
}

/*
 * 同じ元設問から展開された兄弟問題のまとまり（＝4択1問ぶん）を見て判定する。
 * 「同じ主語について違う数値を主張する記述文が3件以上」揃っていれば、
 * それは数値を選ばせる4択であり、計算の前提となる資料が必ず存在したはず、と判断できる。
 * これが単体判定より確度が高いので high の根拠に使う。
 *
 * items: [{ id, q }]
 * 戻り値: { signals: string[], findings: [{ id, q, signals, tier }] }
 */
function analyzeGroup(items) {
  const groupSignals = [];

  const perItemSignals = new Map(items.map(it => [it.id, detectSignals(it.q)]));

  const subjects = new Map(); // 主語 → 主張された数値の集合
  for (const it of items) {
    // 値が「文末で断定されている」ものだけを数える。
    // 「合計所得金額が1,000万円を超える場合、配偶者控除の適用を受けることはできない」のように
    // 数値が条件として文中に出るだけの知識問題を数値選択型と誤認しないため。
    if (!perItemSignals.get(it.id).includes('bare-value-claim')) continue;
    const subj = valueSubject(it.q);
    if (!subj) continue;
    const num = normalizeDigits(it.q).match(/[0-9][0-9,.]*/);
    if (!num) continue;
    if (!subjects.has(subj)) subjects.set(subj, new Set());
    subjects.get(subj).add(num[0]);
  }
  // 同じ主語で異なる数値が3つ以上 ＝ 数値選択型の4択
  const numericChoice = [...subjects.values()].some(set => set.size >= 3);
  if (numericChoice) groupSignals.push('numeric-choice-cluster');

  const findings = items.map(it => {
    const signals = perItemSignals.get(it.id).concat(groupSignals);
    let tier = null;
    if (signals.some(s => s === 'comparative-entities' || s === 'deictic-reference' ||
                          s === 'dangling-entity' || s === 'numeric-choice-cluster')) {
      tier = 'high';
    } else if (signals.length) {
      tier = 'medium';
    }
    return { ...it, signals, tier };
  });

  return { signals: groupSignals, findings };
}

/*
 * 全件をまとめて解析する。
 * items: [{ id, groupId, q, ... }]  groupId は元設問（sourceId など）
 * 戻り値: 疑いのある件だけを tier 付きで返す（groupId 昇順・元の並び順）
 */
function analyzeAll(items) {
  const groups = new Map();
  for (const it of items) {
    const key = it.groupId || it.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const out = [];
  for (const [groupId, members] of groups) {
    const { findings } = analyzeGroup(members);
    for (const f of findings) {
      if (f.tier) out.push({ ...f, groupId });
    }
  }
  return out;
}

const SIGNAL_LABELS = {
  'comparative-entities': '比較参照（Ｘ社とＹ社など）',
  'deictic-reference': '指示語参照（上記・資料など）',
  'dangling-entity': '宙に浮いた主体ラベル',
  'bare-value-claim': '裸の値主張',
  'numeric-choice-cluster': '数値選択型4択の兄弟（同一主語で3値以上）',
};

module.exports = {
  detectSignals,
  valueSubject,
  analyzeGroup,
  analyzeAll,
  distinctEntities,
  SIGNAL_LABELS,
};
