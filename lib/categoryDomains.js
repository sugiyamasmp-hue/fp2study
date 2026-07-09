// FP2級試験の6分野（ユーザー指定の名称）と、Firestore上の実際の問題cat値との対応表。
// questions/questions_ox の cat は模擬試験名や旧分類名など細かく分かれているため、
// 進捗集計ではこの6分野に丸めて記録する。
const DOMAINS = [
  'ライフ・社会保険',
  'タックスプランニング',
  'リスク管理・保険',
  '金融資産運用',
  '不動産',
  '相続・事業承継',
];

const EXACT_MAP = {
  'ライフ・社会保険': 'ライフ・社会保険',
  '社会保険': 'ライフ・社会保険',
  'ライフプランニング': 'ライフ・社会保険',
  '年金': 'ライフ・社会保険',
  '職業倫理・関連法規': 'ライフ・社会保険',
  '模擬試験_ライフプラン': 'ライフ・社会保険',
  '模擬試験_公的年金': 'ライフ・社会保険',
  '模擬試験_公的医療保険': 'ライフ・社会保険',
  '模擬試験_労災保険': 'ライフ・社会保険',

  'タックス': 'タックスプランニング',
  'タックスプランニング': 'タックスプランニング',
  '模擬試験_タックス': 'タックスプランニング',
  '模擬試験_法人税': 'タックスプランニング',

  '保険': 'リスク管理・保険',
  'リスク管理・保険': 'リスク管理・保険',

  '金融資産運用': '金融資産運用',
  '金融資産': '金融資産運用',
  '模擬試験_投資信託': '金融資産運用',
  '模擬試験_株式指標': '金融資産運用',
  '模擬試験_債券': '金融資産運用',

  '不動産': '不動産',

  '相続・事業承継': '相続・事業承継',
  '模擬試験_相続税': '相続・事業承継',
};

// 未知のcat値が来た場合のキーワードによるフォールバック分類
function fallbackMap(cat) {
  if (!cat) return null;
  if (cat.includes('相続') || cat.includes('事業承継')) return '相続・事業承継';
  if (cat.includes('不動産')) return '不動産';
  if (cat.includes('金融') || cat.includes('投資') || cat.includes('株式') || cat.includes('債券')) return '金融資産運用';
  if (cat.includes('タックス') || cat.includes('税')) return 'タックスプランニング';
  if (cat.includes('保険') && !cat.includes('社会保険')) return 'リスク管理・保険';
  return 'ライフ・社会保険';
}

function mapCategoryToDomain(cat) {
  return EXACT_MAP[cat] || fallbackMap(cat);
}

module.exports = { DOMAINS, mapCategoryToDomain };
