import { ensureDb, getSql } from './db.js'

const DOMAIN_RE=/^[a-z0-9.-]+(?:\/[a-z0-9_\/-]+)?$/i

export default async function handler(req,res){
  try{
    await ensureDb()
    const sql=getSql()
    if(req.method==='GET'){
      const rows=await sql`SELECT category, store, domain, created_at FROM limited_menu_stores ORDER BY created_at ASC`
      return res.status(200).json({stores:rows.map(r=>[r.category,r.store,r.domain])})
    }
    if(req.method==='POST'){
      const category=String(req.body?.category||'').trim()
      const store=String(req.body?.store||'').trim()
      const domain=String(req.body?.domain||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'')
      if(!category||!store||!DOMAIN_RE.test(domain))return res.status(400).json({error:'店舗名・カテゴリ・公式サイトのドメインを確認してください。'})
      await sql`
        INSERT INTO limited_menu_stores (category,store,domain)
        VALUES (${category},${store},${domain})
        ON CONFLICT (store) DO UPDATE SET category=EXCLUDED.category, domain=EXCLUDED.domain
      `
      return res.status(200).json({ok:true,store:[category,store,domain]})
    }
    res.setHeader('Allow','GET, POST')
    return res.status(405).json({error:'GET/POST only'})
  }catch(e){
    const msg=e?.code==='DB_NOT_CONFIGURED'?e.message:'データベース処理に失敗しました。'
    return res.status(e?.code==='DB_NOT_CONFIGURED'?503:500).json({error:msg,detail:String(e?.message||e).slice(0,240)})
  }
}
