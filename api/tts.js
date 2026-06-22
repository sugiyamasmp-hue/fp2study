module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: 'text は必須です' });

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: voice || 'alloy',
        input: String(text).slice(0, 4096),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'TTS APIエラー: ' + errText });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buffer);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
