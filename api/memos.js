const { db, FieldValue } = require('../lib/db');
const { DEFAULT_GENRE, MAX_CONTENT_LENGTH, isValidGenre } = require('../lib/memoGenres');

// 学習メモのCRUDを1関数に集約（Vercel Hobbyプランの関数数上限対策。cases.js と同じ方針）。
//   GET    /api/memos        … 一覧取得（createdAt降順）
//   POST   /api/memos        … 新規作成 { genre, content }
//   PUT    /api/memos?id=X   … 更新 { genre?, content? }
//   DELETE /api/memos?id=X   … 削除
//
// 検索（キーワード・ジャンル・日付範囲）はクライアント側で行う想定のため、
// 一覧は絞り込みなしで返す。件数が数百件規模のうちは全件返しで十分。
const LIST_LIMIT = 500;

// Firestore Timestamp を JSON で扱えるISO文字列に変換する。
// serverTimestamp() は書き込み直後の一瞬だけ null になり得るため、その場合も null を返す。
function toISO(ts) {
  if (!ts || typeof ts.toDate !== 'function') return null;
  return ts.toDate().toISOString();
}

function serializeMemo(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    genre: d.genre || DEFAULT_GENRE,
    content: d.content || '',
    createdAt: toISO(d.createdAt),
    updatedAt: toISO(d.updatedAt),
  };
}

// 本文とジャンルの検証。エラー時は文字列（エラーメッセージ）を返す。
function validateContent(content) {
  if (typeof content !== 'string') return 'content は文字列で指定してください';
  const trimmed = content.trim();
  if (!trimmed) return 'メモ本文が空です';
  if (trimmed.length > MAX_CONTENT_LENGTH) return `メモ本文は${MAX_CONTENT_LENGTH}文字以内で入力してください`;
  return null;
}

async function handleList(req, res) {
  const snapshot = await db.collection('memos')
    .orderBy('createdAt', 'desc')
    .limit(LIST_LIMIT)
    .get();
  return res.status(200).json({ memos: snapshot.docs.map(serializeMemo) });
}

async function handleCreate(req, res) {
  const body = req.body || {};
  const genre = isValidGenre(body.genre) ? body.genre : DEFAULT_GENRE;
  const contentError = validateContent(body.content);
  if (contentError) return res.status(400).json({ error: contentError });

  const ref = await db.collection('memos').add({
    genre,
    content: body.content.trim(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return res.status(200).json({ ok: true, id: ref.id });
}

async function handleUpdate(req, res, id) {
  const body = req.body || {};
  const updates = { updatedAt: FieldValue.serverTimestamp() };

  if (body.genre !== undefined) {
    if (!isValidGenre(body.genre)) return res.status(400).json({ error: '不正なジャンルです' });
    updates.genre = body.genre;
  }
  if (body.content !== undefined) {
    const contentError = validateContent(body.content);
    if (contentError) return res.status(400).json({ error: contentError });
    updates.content = body.content.trim();
  }

  const ref = db.collection('memos').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'メモが見つかりません' });

  await ref.update(updates);
  return res.status(200).json({ ok: true, id });
}

async function handleDelete(req, res, id) {
  await db.collection('memos').doc(id).delete();
  return res.status(200).json({ ok: true, id });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { id } = req.query;

    if (req.method === 'GET') return await handleList(req, res);
    if (req.method === 'POST') return await handleCreate(req, res);
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id は必須です' });
      return await handleUpdate(req, res, id);
    }
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id は必須です' });
      return await handleDelete(req, res, id);
    }
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return res.status(500).json({ error: error.message, memos: [] });
  }
};
