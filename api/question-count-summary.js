const { db } = require('../lib/db');
const { DOMAINS, mapCategoryToDomain } = require('../lib/categoryDomains');
const { REQUIRED_COUNTS, ROUNDS, ROUND_SIZE_BY_DOMAIN } = require('../lib/questionRequirements');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const counts = {};
    DOMAINS.forEach(d => { counts[d] = 0; });

    const snapshot = await db.collection('questions').get();
    snapshot.forEach(doc => {
      const domain = mapCategoryToDomain(doc.data().cat);
      if (domain && counts[domain] !== undefined) counts[domain] += 1;
    });

    const [jitsugiSnap, casesSnap] = await Promise.all([
      db.collection('questions_jitsugi').count().get().catch(() => null),
      db.collection('cases').count().get().catch(() => null),
    ]);

    const genres = DOMAINS.map(domain => {
      const current = counts[domain] || 0;
      const required = REQUIRED_COUNTS[domain] || 0;
      const shortage = Math.max(0, required - current);
      return { domain, current, required, shortage, ok: shortage === 0 };
    });

    return res.status(200).json({
      genres,
      rounds: ROUNDS,
      roundSizeByDomain: ROUND_SIZE_BY_DOMAIN,
      extra: {
        jitsugi: jitsugiSnap ? jitsugiSnap.data().count : null,
        cases: casesSnap ? casesSnap.data().count : null,
      },
    });
  } catch (error) {
    return res.status(200).json({ genres: [], error: error.message });
  }
};
