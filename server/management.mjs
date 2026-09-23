import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import current from '../data/current-polls.json' with { type: 'json' };
import archive from '../data/polls-archive.json' with { type: 'json' };
import firms from '../data/pollsters.json' with { type: 'json' };
import baselineLive from '../data/live-results.json' with { type: 'json' };
import { checkRemotePolls } from './poll-check.mjs';

const DAY = 864e5;
const PAGES = new Set(['home','polls','2022','map','crossover','haredi','regions','demography','method','live','results']);
const uuid = /^[a-f0-9-]{36}$/;
const parties = Object.fromEntries(current.polls.flatMap(p => p.parties).reverse().map(p => [p.id,p]));
const equal = (a,b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(),createHash('sha256').update(String(b)).digest());
const sign = (value,secret) => createHmac('sha256',secret).update(value).digest('base64url');
const json = (value,status=200,headers={}) => Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail = (message,status=400) => Object.assign(new Error(message),{status});

export function validateManual(input, now=Date.now()) {
  if (!input || !['poll','sample'].includes(input.kind) || !firms.sourceMap[input.sourceId]) throw fail('בחרו סוג עדכון וכלי תקשורת.');
  const date = String(input.date || '');
  const timestamp = Date.parse(date+'T00:00:00Z');
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if (!/^2026-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10)!==date || date>today) throw fail('יש להזין תאריך פרסום תקין בשנת 2026, שאינו בעתיד.');
  let source;
  try { source=new URL(input.sourceUrl); } catch { throw fail('יש להזין קישור למקור.'); }
  if(source.protocol!=='https:' || source.username || source.password || source.href.length>1000) throw fail('יש להזין קישור HTTPS תקין למקור.');
  if(!Array.isArray(input.parties) || !input.parties.length || input.parties.length>80) throw fail('יש להזין תוצאות למפלגות.');
  const ids=new Set();
  const rows=input.parties.map(row=>{
    if(!row || !parties[row.id] || ids.has(row.id) || !Number.isInteger(row.mandates) || row.mandates<0 || row.mandates>120) throw fail('מפלגה כפולה, לא מוכרת או מספר מנדטים לא תקין.');
    ids.add(row.id);
    return {...parties[row.id], mandates:row.mandates};
  });
  if(rows.reduce((sum,p)=>sum+p.mandates,0)!==120) throw fail('סכום המנדטים חייב להיות 120.');
  return {id:`manual-${input.sourceId}-${date}`,date:date.split('-').reverse().join('.'),dateTimestamp:timestamp,publishedAt:now,
    sourceId:input.sourceId,channelHebrewName:firms.sourceMap[input.sourceId].outlet,sourceUrl:source.href,parties:rows};
}

export function createManagementHandler({getStore,secret=()=>process.env.BAROMETER_ADMIN_TOKEN,remote=checkRemotePolls,clock=Date.now}={}) {
  const content=()=>getStore({name:'barometer-content',consistency:'strong'});
  const usage=()=>getStore({name:'barometer-usage',consistency:'strong'});
  function admin(request) {
    const key=secret();
    if(!key || key.length<13) return false;
    const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)barometer-admin=([^;]+)/)?.[1]||'';
    const [expires,signature]=cookie.split('.');
    return /^\d+$/.test(expires||'') && Number(expires)>clock() && Number(expires)<=clock()+8*3600e3 && equal(signature,sign(expires,key));
  }
  async function body(request,max=32768) {
    if(Number(request.headers.get('content-length'))>max) throw fail('הבקשה גדולה מדי.',413);
    const raw=await request.text();
    if(Buffer.byteLength(raw)>max) throw fail('הבקשה גדולה מדי.',413);
    try{return JSON.parse(raw);}catch{throw fail('תוכן הבקשה אינו תקין.');}
  }
  async function storedPolls() {
    const store=content(),blobs=[];
    for await(const page of store.list({prefix:'polls/',paginate:true})) blobs.push(...page.blobs);
    return (await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
  }
  async function mergedPolls() {
    const extra=await storedPolls();
    const map=new Map([...archive.polls,...current.polls].map(p=>[p.id,p]));
    // One entry per publisher and day, including manual records and later imports.
    for(const p of extra) {
      for(const [id,old] of map) if(old.sourceId===p.sourceId && old.dateTimestamp===p.dateTimestamp) map.delete(id);
      map.set(p.id,p);
    }
    return [...map.values()].sort((a,b)=>b.dateTimestamp-a.dateTimestamp || b.publishedAt-a.publishedAt);
  }
  async function summary() {
    const store=usage(),blobs=[],floor=clock()-90*DAY;
    for await(const page of store.list({prefix:'visits/',paginate:true})) blobs.push(...page.blobs);
    const fresh=blobs.filter(b=>Date.parse(b.key.split('/')[1])+DAY>=floor);
    // Remove expired first-party records, independently of visits to specific pages.
    await Promise.all(blobs.filter(b=>Date.parse(b.key.split('/')[1])+DAY<floor).map(b=>store.delete(b.key)));
    const rows=[];
    for(let i=0;i<fresh.length;i+=100) rows.push(...(await Promise.all(fresh.slice(i,i+100).map(b=>store.get(b.key,{type:'json'})))).filter(Boolean));
    const sessions=new Set(),pages=new Map(),days=new Map();let seconds=0;
    for(const row of rows) {
      sessions.add(row.session);seconds+=row.seconds;
      for(const [map,key] of [[pages,row.page],[days,row.day]]) {
        const r=map.get(key)||{views:0,sessions:new Set(),seconds:0};
        r.views++;r.sessions.add(row.session);r.seconds+=row.seconds;map.set(key,r);
      }
    }
    return {sessions:sessions.size,views:rows.length,seconds,
      pages:[...pages].map(([page,p])=>({...p,page,sessions:p.sessions.size,average:Math.round(p.seconds/p.views)})).sort((a,b)=>b.views-a.views),
      days:[...days].map(([day,p])=>({...p,day,sessions:p.sessions.size})).sort((a,b)=>b.day.localeCompare(a.day))};
  }
  return async function handle(request) {
    try {
      const url=new URL(request.url),path=url.pathname,now=clock();
      if(request.method==='POST' && request.headers.get('origin')!==url.origin) return json({error:'מקור בקשה לא מורשה.'},403);
      if(path==='/api/admin/session' && request.method==='POST') {
        const key=secret();
        if(!key || key.length<13) return json({error:'יש להגדיר ב־Netlify את BAROMETER_ADMIN_TOKEN עם סיסמה באורך 13 תווים לפחות, ואז לפרסם מחדש.'},503);
        const input=await body(request,2048);
        if(!equal(input.token||'',key)) return json({error:'מפתח הניהול אינו נכון.'},401);
        const expires=String(now+8*3600e3);
        return json({ok:true},200,{'Set-Cookie':`barometer-admin=${expires}.${sign(expires,key)}; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
      }
      if(path==='/api/admin/logout' && request.method==='POST') return json({ok:true},200,{'Set-Cookie':'barometer-admin=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
      if(path==='/api/analytics/status' && request.method==='GET') return json({enabled:true});
      if(path==='/api/analytics/event' && request.method==='POST') {
        const input=await body(request,1024);
        if(!input || !uuid.test(input.session||'') || !uuid.test(input.view||'') || !PAGES.has(input.page) || !Number.isInteger(input.seq) || input.seq<1 || input.seq>100000 || !Number.isInteger(input.seconds) || input.seconds<0 || input.seconds>86400) throw fail('אירוע לא תקין.');
        const day=new Date(now).toISOString().slice(0,10),key=`visits/${day}/${input.view}`,store=usage();
        for(let attempt=0;attempt<3;attempt++) {
          const existing=await store.getWithMetadata(key,{type:'json'}),old=existing?.data;
          if(old && (old.session!==input.session || old.page!==input.page)) throw fail('אירוע לא תואם.');
          if(old && old.seq>=input.seq) return json({ok:true});
          const record={session:input.session,view:input.view,page:input.page,seq:input.seq,day,started:old?.started||now,seconds:old?Math.max(old.seconds,Math.min(input.seconds,Math.floor((now-old.started)/1000)+5)):Math.min(input.seconds,5)};
          const {modified}=await store.setJSON(key,record,existing?{onlyIfMatch:existing.etag}:{onlyIfNew:true});
          if(modified) return json({ok:true});
        }
        return json({error:'יש לנסות שוב.'},409);
      }
      const publicFile=/^\/(?:api\/content|data)\//.test(path)?path.split('/').pop():null;
      if(publicFile && request.method==='GET') {
        try {
        if(publicFile==='live-results.json') {
          const store=content(),blobs=[];
          for await(const page of store.list({prefix:'live/samples/',paginate:true})) blobs.push(...page.blobs);
          const saved=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
          const legacy=await store.get('live/sample',{type:'json'});
          if(legacy?.sourceId && !saved.some(s=>s.sourceId===legacy.sourceId)) saved.push(legacy);
          const samples=Object.fromEntries(saved.filter(s=>firms.sourceMap[s.sourceId]).map(s=>[s.sourceId,s]));
          const sample=saved.sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0))[0]||legacy;
          return json(sample?{...baselineLive,status:'sample',updatedAt:sample.publishedAt,sourceName:sample.sourceName,statusText:'המדגם האחרון שפורסם',sample,samples}:{...baselineLive,samples:{}});
        }
        if(!['current-polls.json','polls-archive.json'].includes(publicFile)) return json({},404);
        const all=await mergedPolls();
        const generatedAt=new Date(Math.max(Date.parse(current.generatedAt),...all.map(p=>Number(p.publishedAt)||0))).toISOString();
        if(publicFile==='polls-archive.json') return json({updatedAt:generatedAt,polls:all});
        const counts=new Map();
        const shown=all.filter(p=>p.dateTimestamp>=Date.parse('2026-08-01')&&new Date(p.dateTimestamp).getUTCFullYear()===2026).filter(p=>{const key=p.channelHebrewName,n=(counts.get(key)||0)+1;counts.set(key,n);return n<=4;});
        return json({...current,generatedAt,polls:shown});
        } catch(error) {
          console.error('Live storage unavailable:',error.message);
          const fallback={'current-polls.json':current,'polls-archive.json':archive,'live-results.json':baselineLive}[publicFile];
          return fallback?json(fallback,200,{'X-Barometer-Data-Status':'fallback'}):json({},404);
        }
      }
      if(!admin(request)) return json({error:'נדרשת כניסה לניהול.'},401);
      if(path==='/api/analytics/summary' && request.method==='GET') return json(await summary());
      if(path==='/api/admin/state' && request.method==='GET') {
        const polls=await mergedPolls();
        return json({generatedAt:current.generatedAt,latestPollDate:polls[0]?.dateTimestamp,outlets:firms.sourceMap,firms:firms.firms.map(f=>({id:f.id,he:f.he})),parties:Object.values(parties),lastCheck:await content().get('last-check',{type:'json'})});
      }
      if(path==='/api/admin/save' && request.method==='POST') {
        const input=await body(request),poll=validateManual(input,now),store=content();
        if(input.kind==='sample') {
          await store.setJSON(`live/samples/${poll.sourceId}`,{sourceId:poll.sourceId,parties:poll.parties,publishedAt:new Date(now).toISOString(),sourceName:poll.channelHebrewName,sourceUrl:poll.sourceUrl});
          return json({message:'המדגם נשמר לערוץ הזה. חלוקת הגושים שלו תוצג בליל הבחירות החל מ־22:00, שעון ישראל.'});
        }
        const all=await mergedPolls();
        if(all.some(p=>p.sourceId===poll.sourceId&&p.dateTimestamp===poll.dateTimestamp)) throw fail('כבר קיים סקר של כלי התקשורת בתאריך הזה. לא נוצרה כפילות.',409);
        const {modified}=await store.setJSON(`polls/${poll.sourceId}-${input.date}`,poll,{onlyIfNew:true});
        if(!modified) throw fail('הסקר כבר נשמר.',409);
        return json({message:'הסקר נשמר ופורסם באתר. רעננו את תמונת המצב להצגת התחזית המעודכנת.'});
      }
      if(path==='/api/admin/refresh' && request.method==='POST') {
        const result=await remote();
        const store=content();
        await store.setJSON('last-check',{at:new Date(now).toISOString(),status:result.status,scope:result.scope});
        if(result.status==='error') throw fail('מקור הסקרים לא החזיר נתונים תקינים. הנתונים הקיימים נשמרו. אפשר להזין סקר ידנית.',502);
        let added=0;const all=await mergedPolls();
        for(const poll of result.polls) {
          if(all.some(p=>p.id===poll.id || p.sourceId===poll.sourceId&&p.dateTimestamp===poll.dateTimestamp)) continue;
          const key=`polls/${poll.sourceId}-${new Date(poll.dateTimestamp).toISOString().slice(0,10)}`;
          if((await store.setJSON(key,poll,{onlyIfNew:true})).modified) added++;
        }
        return json({message:`נוספו ${added} סקרים.${result.status==='partial'?' חלק מהמקורות לא היו זמינים; הבדיקה אינה מלאה.':''}`,partial:result.status==='partial'});
      }
      return json({error:'פעולה לא נתמכת.'},404);
    } catch(error) {
      if(!error.status) console.error('Management request failed:',error.message);
      return json({error:error.status?error.message:'השירות לא זמין כרגע. הנתונים הקיימים לא נמחקו.'},error.status||503);
    }
  };
}
