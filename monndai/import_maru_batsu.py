"""
maru_batsu_questions.json を Firestore に一括登録するスクリプト

使い方:
  1. pip install firebase-admin
  2. Firebaseコンソール → プロジェクト設定 → サービスアカウント → 新しい秘密鍵を生成
     → ダウンロードしたJSONを serviceAccountKey.json という名前でこのフォルダに置く
  3. python import_maru_batsu.py

※ Claude Codeに投げる場合はこのまま
  「maru_batsu_questions.json をFirestoreの maru_batsu_questions コレクションに
   import_maru_batsu.py を使って一括登録して」でOK
"""

import json
import sys
import os
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_KEY = "serviceAccountKey.json"
COLLECTION_NAME = "maru_batsu_questions"   # ← 既存コレクションと被らない専用名
JSON_FILE = "maru_batsu_all_960.json"


def init_firebase():
    if not os.path.exists(SERVICE_ACCOUNT_KEY):
        print(f"エラー: {SERVICE_ACCOUNT_KEY} が見つかりません")
        print("Firebaseコンソール → プロジェクト設定 → サービスアカウント → 鍵を生成")
        sys.exit(1)
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def load_questions(json_file):
    if not os.path.exists(json_file):
        print(f"エラー: {json_file} が見つかりません")
        sys.exit(1)
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"✅ {len(data)}問 読み込みました")
    return data


def import_questions(db, questions):
    collection = db.collection(COLLECTION_NAME)
    success = 0
    for q in questions:
        try:
            doc_id = q["id"]  # 例: "問1-1" をそのままドキュメントIDに使用
            collection.document(doc_id).set(q)
            success += 1
            print(f"  → {doc_id} ({q['cat']}) 登録完了")
        except Exception as e:
            print(f"  ✗ {q.get('id', '?')} エラー: {e}")
    print(f"\n🎉 完了: {success}/{len(questions)}問 登録しました")
    print(f"コレクション名: {COLLECTION_NAME}")


if __name__ == "__main__":
    print(f"📂 ファイル: {JSON_FILE}")
    print(f"🔥 コレクション: {COLLECTION_NAME}")
    print("-" * 40)

    db = init_firebase()
    questions = load_questions(JSON_FILE)
    import_questions(db, questions)
