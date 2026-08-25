# 期間限定グルメ V1.4

V1.4では、取得した商品情報と追加店舗をブラウザのlocalStorageではなくPostgresデータベースに保存します。

## 変更点

- 商品データをDBへ保存
- 最後に確認できた日から14日を超えた商品は自動削除
- 同じ店舗・同じ商品名を再取得した場合は価格、日付、画像、引用元を更新
- 新しい情報が取得できなかった場合でも、14日以内の既存データは残す
- 追加した店舗もDBに保存し、別端末でも共有
- `GET /api/products` で現在のDBキャッシュを取得可能
- 更新は店舗ごとにPOSTし、1店舗の失敗で全体が止まらない

## Vercelで必要な設定

この版はデータベース接続が必須です。Vercel Marketplace/Storageから Neon Postgres をプロジェクトに接続し、VercelのEnvironment Variablesに `DATABASE_URL` が作成されていることを確認してください。

Neonの接続によって `POSTGRES_URL` だけが作られた場合もコード側で利用できます。

設定後は再デプロイしてください。初回APIアクセス時に以下のテーブルを自動作成します。

- `limited_menu_products`
- `limited_menu_stores`

手動でSQLを流す必要はありません。

## 重要

DB未接続の場合、画面には `DATABASE_URL が設定されていません` と表示され、商品更新は行われません。
