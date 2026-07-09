const { HIROYUKI_PROFILE, CHARACTERS } = require('../lib/characters');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, system, character } = req.body;

    // character が指定されていればサーバー側の正式なキャラ設定を使い、
    // 未指定の場合は従来どおりクライアントが渡す system をそのまま使う（通常クイズモードとの互換用）
    const charPrompt = character ? CHARACTERS[character] : undefined;
    const systemPrompt = [HIROYUKI_PROFILE, charPrompt, system].filter(Boolean).join('\n\n');

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
        messages: messages || [],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({ reply: 'APIエラー: ' + JSON.stringify(data) });
    }

    const reply = data?.content?.[0]?.text || '回答を取得できへんかった！';
    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(200).json({ reply: 'エラー詳細: ' + error.message });
  }
}
