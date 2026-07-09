const { db, todayJST } = require('../lib/db');
const { DOMAINS } = require('../lib/categoryDomains');
const { HIROYUKI_PROFILE, CHARACTERS } = require('../lib/characters');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { character } = req.body;
    const charPrompt = CHARACTERS[character];
    if (!charPrompt) return res.status(400).json({ error: 'character が不正です' });

    const today = todayJST();
    const progressSnap = await db.collection('user_progress').doc('main').get();
    const p = progressSnap.exists ? progressSnap.data() : {};
    const isToday = p.todayDate === today;
    const todayAnswered = isToday ? (p.todayAnswered || 0) : 0;
    const todayCorrect = isToday ? (p.todayCorrect || 0) : 0;

    const domainSnaps = await Promise.all(
      DOMAINS.map(d => db.collection('category_progress').doc(d).get())
    );
    const categories = DOMAINS.map((domain, i) => {
      const d = domainSnaps[i].exists ? domainSnaps[i].data() : { answered: 0, correct: 0 };
      const answered = d.answered || 0;
      const correct = d.correct || 0;
      const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
      return { domain, answered, accuracy };
    });

    if (categories.every(c => c.answered === 0) && todayAnswered === 0) {
      return res.status(200).json({ reply: null, noData: true });
    }

    const statsText = [
      `今日解いた問題数：${todayAnswered}問（正答率${todayAnswered > 0 ? Math.round(todayCorrect / todayAnswered * 100) : 0}%）`,
      `連続学習日数：${(p.lastAnsweredDate === today) ? (p.currentStreak || 0) : 0}日`,
      '分野別正答率：',
      ...categories.map(c => `・${c.domain}：${c.answered > 0 ? c.accuracy + '%（' + c.answered + '問）' : '未挑戦'}`),
    ].join('\n');

    const systemPrompt = [
      HIROYUKI_PROFILE,
      charPrompt,
      '以下は生徒（浩之）のFP2級学習データです。このデータをもとに、あなたのキャラクターの口調のまま、'
        + '①弱点になっている分野の指摘　②良くできている点を褒める　③次に取り組むべき具体的な提案　'
        + 'の3点を含めて300字程度でアドバイスしてください。',
      statsText,
    ].join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: '学習データを分析して、アドバイスをください。' }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(200).json({ reply: 'APIエラー: ' + JSON.stringify(data) });
    }

    const reply = data?.content?.[0]?.text || '分析結果を取得できへんかった！';
    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(200).json({ reply: 'エラー詳細: ' + error.message });
  }
};
