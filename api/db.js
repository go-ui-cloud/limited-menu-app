import { neon } from '@neondatabase/serverless'

let readyPromise

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) {
    const err = new Error('DATABASE_URL が設定されていません。VercelでNeon/Postgresを接続してください。')
    err.code = 'DB_NOT_CONFIGURED'
    throw err
  }
  return neon(url)
}

export async function ensureDb() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS limited_menu_products (
          id BIGSERIAL PRIMARY KEY,
          store TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          price TEXT,
          image TEXT,
          start_date TEXT,
          end_date TEXT,
          url TEXT NOT NULL,
          source_type TEXT,
          source_name TEXT,
          limited_evidence TEXT,
          evidence_score INTEGER NOT NULL DEFAULT 0,
          verified_limited BOOLEAN NOT NULL DEFAULT FALSE,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(store, title)
        )
      `
      // V1.4からの既存DBにも安全に列追加。既存行は未確認(FALSE)のためV1.5では表示されない。
      await sql`ALTER TABLE limited_menu_products ADD COLUMN IF NOT EXISTS limited_evidence TEXT`
      await sql`ALTER TABLE limited_menu_products ADD COLUMN IF NOT EXISTS evidence_score INTEGER NOT NULL DEFAULT 0`
      await sql`ALTER TABLE limited_menu_products ADD COLUMN IF NOT EXISTS verified_limited BOOLEAN NOT NULL DEFAULT FALSE`
      await sql`
        CREATE TABLE IF NOT EXISTS limited_menu_stores (
          id BIGSERIAL PRIMARY KEY,
          category TEXT NOT NULL,
          store TEXT NOT NULL UNIQUE,
          domain TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS limited_menu_products_last_seen_idx ON limited_menu_products(last_seen_at)`
      await sql`CREATE INDEX IF NOT EXISTS limited_menu_products_store_idx ON limited_menu_products(store)`
      await sql`CREATE INDEX IF NOT EXISTS limited_menu_products_verified_idx ON limited_menu_products(verified_limited)`
      return true
    })().catch(e => {
      readyPromise = undefined
      throw e
    })
  }
  return readyPromise
}

export async function purgeExpired(sql) {
  await sql`DELETE FROM limited_menu_products WHERE last_seen_at < NOW() - INTERVAL '14 days'`
}

export function rowToProduct(r) {
  return {
    store: r.store,
    category: r.category,
    title: r.title,
    price: r.price,
    image: r.image,
    startDate: r.start_date,
    endDate: r.end_date,
    url: r.url,
    sourceType: r.source_type,
    sourceName: r.source_name,
    limitedEvidence: r.limited_evidence,
    evidenceScore: r.evidence_score,
    verifiedLimited: r.verified_limited,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    updatedAt: r.updated_at
  }
}
