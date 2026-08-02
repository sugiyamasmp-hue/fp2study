// ○×問題は元の4択問題（questions）から選択肢1つずつを切り出して生成しているため
// （convert_to_ox.js）、設問文・解説の両方に「4択だったころの名残り」が残っている。
// ○×形式では選択肢が1つしか画面に出ないためこれらは意味を成さず、ユーザーを混乱させる。
// データ側は原本との対応を保つためそのままにし、表示直前にここで取り除く。

// 解説（ex）は原本の4択解説をそのまま流用しているため「3が不適切。」のように
// 元の選択肢番号を参照する一文が残る。
const OX_OPTION_REFERENCE_RE = /^(?:選択肢)?[0-9０-９]+(?:番)?(?:が|は)(?:適切|不適切|正しい|誤り|正解|不正解)[^。．]*[。．]\s*/;

// 設問文（q）は `${原本の設問文}\n${選択肢テキスト}` で組み立てられている（migrate_fix_ox_q.js）。
// 原本の設問文には「〜次の記述のうち、最も不適切なものはどれか。」という4択専用の指示文が
// 含まれ、記述を1つしか出さない○×では設問として破綻する（「どれか」と訊かれても選べない）。
// この指示文の一文だけを落とし、シナリオや前提条件（「なお、〜」等）は残す。
//
// 記述そのもの（「〜任意後見受任者となった。」のような平叙文）を誤って消さないよう、
// 設問の指示文にしか現れない形だけを対象にする。
// 該当する言い回しは audit_ox_stem.js で棚卸しできる（未知の形が出たらここへ足す）。
const CHOICE_INSTRUCTION_RES = [
  // 「〜のうち、最も不適切なものはどれか。」「〜適切なものはいくつあるか。」
  // 適切／正しい／誤り系のキーワードと「どれか／いくつあるか」の両方を含む文のみ。
  /^[^。．]*(?:適切|適当|正しい|誤(?:り|っ)|妥当)[^。．]*(?:どれか|いくつあるか)[。．]?$/,
  // 「以下の各文について、正誤を判定しなさい。」「次の設問に答えなさい。」
  // 命令形で終わる文は設問の指示であり、○×の記述本文（平叙文）には現れない。
  // 「〜してください、とは規定されていない。」のように命令形が文の途中に現れる
  // 平叙文を巻き込まないよう、指示形が文末に来るものだけを対象にする。
  /^[^。．]*(?:正誤|適切|正しい|誤|記述|各文|設問|問い)[^。．]*(?:なさい|せよ|ください)[。．]?$/,
];

function isChoiceInstruction(sentence) {
  return CHOICE_INSTRUCTION_RES.some(re => re.test(sentence));
}

function isOxOptions(opts) {
  return Array.isArray(opts) && opts.length === 2 && opts[0] === '○' && opts[1] === '×';
}

// 1行を「。」区切りの文へ分ける（区切り文字は各文の末尾に残す）
function splitSentences(line) {
  return line.match(/[^。．]*[。．]|[^。．]+/g) || [];
}

function sanitizeOxExplanation(ex, opts) {
  if (!ex || !isOxOptions(opts)) return ex;
  return ex.replace(OX_OPTION_REFERENCE_RE, '');
}

function sanitizeOxQuestion(q, opts) {
  if (!q || !isOxOptions(opts)) return q;

  const cleaned = String(q)
    .split('\n')
    .map(line => splitSentences(line).filter(s => !isChoiceInstruction(s.trim())).join(''))
    .filter(line => line.trim() !== '')
    .join('\n')
    .trim();

  // 指示文しか無く全部消えてしまう場合は、無言で空にせず元の設問文を返す
  return cleaned || q;
}

module.exports = { sanitizeOxExplanation, sanitizeOxQuestion, isOxOptions };
