// ○×問題は元の4択問題（questions）から選択肢1つずつを切り出して生成しているが（convert_to_ox.js）、
// 解説（ex）は原本の4択解説をそのまま流用しているため「3が不適切。」のように元の選択肢番号を
// 参照する一文が残ってしまう。○×形式では選択肢番号が画面に存在しないため、この一文は意味を成さず
// ユーザーを混乱させる（元の4択の名残り）。表示直前にこの参照を取り除く。
const OX_OPTION_REFERENCE_RE = /^(?:選択肢)?[0-9０-９]+(?:番)?(?:が|は)(?:適切|不適切|正しい|誤り|正解|不正解)[^。．]*[。．]\s*/;

function isOxOptions(opts) {
  return Array.isArray(opts) && opts.length === 2 && opts[0] === '○' && opts[1] === '×';
}

function sanitizeOxExplanation(ex, opts) {
  if (!ex || !isOxOptions(opts)) return ex;
  return ex.replace(OX_OPTION_REFERENCE_RE, '');
}

module.exports = { sanitizeOxExplanation, isOxOptions };
