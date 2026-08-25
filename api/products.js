import { ensureDb, getSql, purgeExpired, rowToProduct } from './db.js'
const BASE=[
 ['バーガー','マクドナルド','mcdonalds.co.jp'],['バーガー','ケンタッキー','kfc.co.jp'],['バーガー','モス','mos.jp'],['バーガー','バーガーキング','burgerking.co.jp'],['スイーツ・カフェ','ミスド','misterdonut.jp'],['寿司','スシロー','akindo-sushiro.co.jp'],['寿司','はま寿司','hama-sushi.co.jp'],['寿司','くら寿司','kurasushi.co.jp'],['丼・定食','松屋','matsuyafoods.co.jp'],['丼・定食','松のや','matsuyafoods.co.jp'],['丼・定食','かつや','arclandservice.co.jp/katsuya'],['ピザ','ドミノピザ','dominos.jp'],['ピザ','ピザハット','pizzahut.jp'],['ピザ','ピザーラ','pizza-la.co.jp'],['スイーツ・カフェ','スターバックス','starbucks.co.jp'],['カレー','ココイチ','ichibanya.co.jp'],['麺','丸亀製麺','marugame.com'],['スイーツ・カフェ','31アイス','31ice.co.jp'],['弁当','ほっともっと','hottomotto.com'],['丼・定食','すき家','sukiya.jp'],['丼・定食','吉野家','yoshinoya.com']
]
const UA={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','accept-language':'ja-JP,ja;q=0.9,en;q=0.5'}
const LIMITED_RE=/(期間限定|季節限定|数量限定|限定販売|限定メニュー|限定商品|新発売|新商品|新登場|発売開始|販売開始|登場)/
const BAD_TITLE_RE=/(検索結果|ニュース一覧|新着情報一覧|トップページ|ホームページ)$/
const decode=s=>(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;|&#160;/g,' ')
const text=s=>decode(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
function meta(h,p){const esc=p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const re of [new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,'i')]){const m=re.exec(h);if(m)return decode(m[1])}return null}
function parseDate(t=''){let m=t.match(/(20\d{2})[年\/.-]\s*(\d{1,2})[月\/.-]\s*(\d{1,2})日?/);if(m)return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;m=t.match(/(\d{1,2})月\s*(\d{1,2})日/);if(m){const n=new Date(),mo=+m[1];let y=n.getFullYear();if(n.getMonth()>=9&&mo<=2)y++;else if(n.getMonth()<=1&&mo>=11)y--;return`${y}-${String(mo).padStart(2,'0')}-${m[2].padStart(2,'0')}`}return null}
function hostOf(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch{return''}}
function officialHost(c){return c[2].split('/')[0].replace(/^www\./,'')}
function isOfficial(url,c){const wanted=officialHost(c),h=hostOf(url);return h===wanted||h.endsWith('.'+wanted)}
function cleanTitle(t=''){return text(t).replace(/^PR[:：]?\s*/i,'').replace(/\s*[|｜]\s*[^|｜]{1,45}$/,'').trim().slice(0,140)}
function pickDate(all,kind){const patterns=kind==='end'?[/(:?販売終了|提供終了|終了予定|販売期間)[^。\n]{0,120}(?:20\d{2}年)?\s*\d{1,2}月\s*\d{1,2}日/,/(?:〜|～|から)[^。\n]{0,80}(?:20\d{2}年)?\s*\d{1,2}月\s*\d{1,2}日(?:まで|迄)/]:[/(?:販売開始|発売開始|発売|販売|提供開始|提供|登場)[^。\n]{0,120}(?:20\d{2}年)?\s*\d{1,2}月\s*\d{1,2}日/,/(?:20\d{2}年)?\s*\d{1,2}月\s*\d{1,2}日[^。\n]{0,80}(?:発売|販売開始|より販売|から販売|より発売)/];for(const re of patterns){const m=all.match(re);if(m){const d=parseDate(m[0]);if(d)return d}}return null}
function pickPrice(all){for(const re of [/(?:税込(?:価格)?|税込み)\s*[:：]?\s*[￥¥]?\s*([0-9]{2,5}(?:,[0-9]{3})?)\s*円?/,/[￥¥]\s*([0-9]{2,5}(?:,[0-9]{3})?)(?:\s*円)?\s*[（(]?税込[）)]?/,/([0-9]{2,5}(?:,[0-9]{3})?)\s*円\s*[（(]税込[）)]/]){const m=all.match(re);if(m)return`${m[1]}円（税込）`}const plain=all.match(/[￥¥]?\s*([0-9]{2,5}(?:,[0-9]{3})?)\s*円/);return plain?`${plain[1]}円（税込表記不明）`:null}
function extract(h,url,c,official){const rawTitle=meta(h,'og:title')||meta(h,'twitter:title')||((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');const title=cleanTitle(rawTitle);const desc=text(meta(h,'og:description')||meta(h,'twitter:description')||meta(h,'description')||'');const body=text(h).slice(0,90000);const all=`${title} ${desc} ${body}`;if(!LIMITED_RE.test(all)||!title||title.length<4||BAD_TITLE_RE.test(title))return null;if(!official&&!all.includes(c[1]))return null;const startDate=pickDate(all,'start'),endDate=pickDate(all,'end'),price=pickPrice(all);let image=meta(h,'og:image')||meta(h,'twitter:image')||null;try{if(image)image=new URL(image,url).href}catch{image=null}if(image&&!/^https?:\/\//i.test(image))image=null;const sourceName=official?`${c[1]} 公式サイト`:(text(meta(h,'og:site_name'))||hostOf(url)||'ニュースサイト');return{store:c[1],category:c[0],title,price,image,startDate,endDate,url,sourceType:official?'official':'news',sourceName}}
function normalizeSearchUrl(u){u=decode(u||'');try{const x=new URL(u,'https://duckduckgo.com');if(x.hostname.includes('duckduckgo.com'))u=x.searchParams.get('uddg')||u}catch{}try{u=decodeURIComponent(u)}catch{}return/^https?:\/\//i.test(u)?u:null}
function ddgLinks(h){const out=[];for(const re of [/class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)/gi,/href=["']([^"']+)["'][^>]+class=["'][^"']*result__a/gi])for(const m of h.matchAll(re)){const u=normalizeSearchUrl(m[1]);if(u&&!out.includes(u))out.push(u)}return out}
function rssLinks(xml){const out=[];for(const m of xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi)){const u=decode(m[1]).trim();if(/^https?:\/\//.test(u)&&!out.includes(u))out.push(u)}return out}
async function searchDuck(q){try{const r=await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,{headers:UA,signal:AbortSignal.timeout(4000)});return r.ok?ddgLinks(await r.text()):[]}catch{return[]}}
async function searchBingRss(q){try{const r=await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`,{headers:UA,signal:AbortSignal.timeout(4000)});return r.ok?rssLinks(await r.text()):[]}catch{return[]}}
async function search(q){const [a,b]=await Promise.all([searchDuck(q),searchBingRss(q)]);return[...new Set([...a,...b])]}
async function fetchProduct(u,c,official){try{const r=await fetch(u,{headers:UA,redirect:'follow',signal:AbortSignal.timeout(4500)});if(!r.ok)return null;const type=(r.headers.get('content-type')||'').toLowerCase();if(type&&!type.includes('text/html')&&!type.includes('application/xhtml'))return null;return extract(await r.text(),r.url,c,official)}catch{return null}}
async function one(c){const d={store:c[1],officialLinks:0,newsLinks:0,officialProducts:0,newsProducts:0,status:'ok'};try{const officialQuery=`site:${officialHost(c)} ${c[1]} 期間限定 OR 新商品 OR 新発売`;const officialLinks=(await search(officialQuery)).filter(u=>isOfficial(u,c)).slice(0,4);d.officialLinks=officialLinks.length;const officialProducts=(await Promise.all(officialLinks.map(u=>fetchProduct(u,c,true)))).filter(Boolean).slice(0,3);d.officialProducts=officialProducts.length;let out=[...officialProducts];if(out.length<3){const newsQueries=[`${c[1]} 期間限定 新商品 発売 価格`,`${c[1]} 新発売 限定メニュー`];const newsLinks=[...new Set((await Promise.all(newsQueries.map(search))).flat())].filter(u=>!isOfficial(u,c)).slice(0,6);d.newsLinks=newsLinks.length;const newsProducts=(await Promise.all(newsLinks.map(u=>fetchProduct(u,c,false)))).filter(Boolean);d.newsProducts=newsProducts.length;out.push(...newsProducts)}if(!out.length)d.status='no-products';return{products:out.slice(0,5),diagnostic:d}}catch(e){d.status='error';d.error=String(e?.message||e).slice(0,180);return{products:[],diagnostic:d}}}
async function cachedProducts(sql, requested=[]){
  await purgeExpired(sql)
  let rows
  if(requested.length===1){
    rows=await sql`SELECT * FROM limited_menu_products WHERE last_seen_at >= NOW() - INTERVAL '14 days' AND store=${requested[0]} ORDER BY start_date DESC NULLS LAST, updated_at DESC`
  }else{
    rows=await sql`SELECT * FROM limited_menu_products WHERE last_seen_at >= NOW() - INTERVAL '14 days' ORDER BY start_date DESC NULLS LAST, updated_at DESC`
  }
  return rows.map(rowToProduct)
}
async function saveFresh(sql,products){
  for(const p of products){
    await sql`
      INSERT INTO limited_menu_products
      (store,category,title,price,image,start_date,end_date,url,source_type,source_name,first_seen_at,last_seen_at,updated_at)
      VALUES (${p.store},${p.category},${p.title},${p.price||null},${p.image||null},${p.startDate||null},${p.endDate||null},${p.url},${p.sourceType||null},${p.sourceName||null},NOW(),NOW(),NOW())
      ON CONFLICT (store,title) DO UPDATE SET
        category=EXCLUDED.category,
        price=COALESCE(EXCLUDED.price,limited_menu_products.price),
        image=COALESCE(EXCLUDED.image,limited_menu_products.image),
        start_date=COALESCE(EXCLUDED.start_date,limited_menu_products.start_date),
        end_date=COALESCE(EXCLUDED.end_date,limited_menu_products.end_date),
        url=EXCLUDED.url,
        source_type=COALESCE(EXCLUDED.source_type,limited_menu_products.source_type),
        source_name=COALESCE(EXCLUDED.source_name,limited_menu_products.source_name),
        last_seen_at=NOW(),
        updated_at=NOW()
    `
  }
}
export default async function handler(req,res){
  try{
    await ensureDb()
    const sql=getSql()
    if(req.method==='GET'){
      const products=await cachedProducts(sql,[])
      const stamp=products.reduce((m,p)=>Math.max(m,new Date(p.updatedAt||0).getTime()||0),0)
      res.setHeader('Cache-Control','no-store, max-age=0')
      return res.status(200).json({version:'1.4',products,updatedAt:stamp?new Date(stamp).toISOString():null,storage:'database',ttlDays:14})
    }
    if(req.method!=='POST'){
      res.setHeader('Allow','GET, POST')
      return res.status(405).json({error:'GET/POST only'})
    }
    const dbStores=await sql`SELECT category,store,domain FROM limited_menu_stores ORDER BY created_at ASC`
    const extras=dbStores.map(r=>[r.category,r.store,r.domain])
    let stores=[...BASE,...extras].slice(0,60)
    const requested=Array.isArray(req.body?.storeNames)?req.body.storeNames.filter(Boolean):[]
    if(requested.length)stores=stores.filter(x=>requested.includes(x[1]))
    if(!stores.length)return res.status(400).json({error:'store not found'})
    const settled=await Promise.all(stores.map(one))
    const results=settled.flatMap(x=>x.products)
    const diagnostics=settled.map(x=>x.diagnostic)
    const seen=new Set()
    const fresh=results.filter(p=>{
      if(!p||!p.title||!p.url)return false
      const key=`${p.store}|${p.title}`.toLowerCase()
      if(seen.has(key))return false
      seen.add(key);return true
    })
    await saveFresh(sql,fresh)
    const products=await cachedProducts(sql,requested)
    res.setHeader('Cache-Control','no-store, max-age=0')
    return res.status(200).json({version:'1.4',products,freshCount:fresh.length,updatedAt:new Date().toISOString(),storage:'database',ttlDays:14,diagnostics,warning:fresh.length?'':'今回新しい取得結果はありません。データベース内の14日以内の情報を表示します。'})
  }catch(e){
    const msg=e?.code==='DB_NOT_CONFIGURED'?e.message:'商品取得またはデータベース保存に失敗しました。'
    return res.status(e?.code==='DB_NOT_CONFIGURED'?503:500).json({error:msg,detail:String(e?.message||e).slice(0,300)})
  }
}
