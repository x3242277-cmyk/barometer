import assert from 'node:assert/strict';
import {createManagementHandler,validateManual} from '../server/management.mjs';
const databases=new Map();
function getStore({name}){if(!databases.has(name))databases.set(name,new Map());const map=databases.get(name);return {
 async get(k){return map.get(k)?.data??null},async getWithMetadata(k){return map.get(k)??null},
 async setJSON(k,data,options={}){const old=map.get(k);if(options.onlyIfNew&&old||options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return {modified:false};map.set(k,{data:structuredClone(data),etag:String(Number(old?.etag||0)+1)});return {modified:true}},
 list({prefix=''}){return {[Symbol.asyncIterator]:async function*(){yield {blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}}},async delete(k){map.delete(k)}
};}
let now=Date.parse('2026-09-23T10:00:00Z');const token='abcdefghijklm';
const handle=createManagementHandler({getStore,secret:()=>token,clock:()=>now,remote:async()=>({status:'error',scope:{missingPages:1}})});
const origin='https://test.example';let cookie='';
async function req(path,input,options={}){const r=await handle(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{Origin:options.origin||origin,Cookie:options.anonymous?'':cookie},body:input===undefined?undefined:JSON.stringify(input)}));return {status:r.status,data:await r.json(),headers:r.headers};}
assert.equal((await req('/api/admin/state')).status,401);
assert.equal((await req('/api/admin/session',{token:'wrong'})).status,401);
assert.equal((await req('/api/admin/session',{token},{origin:'https://evil.example'})).status,403);
const login=await req('/api/admin/session',{token});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
const config=(await req('/api/admin/state')).data;assert(config.parties.length);
const draft={kind:'poll',sourceId:'channel_12',date:'2026-09-23',sourceUrl:'https://news.example/poll',parties:[{id:'likud',mandates:60},{id:'yashar',mandates:60}]};
assert.throws(()=>validateManual({...draft,parties:[{id:'likud',mandates:119}]},now));assert.throws(()=>validateManual({...draft,date:'2026-09-24'},now));assert.throws(()=>validateManual({...draft,sourceUrl:'javascript:alert(1)'},now));
assert.equal((await req('/api/admin/save',draft,{origin:'https://evil.example'})).status,403);
assert.equal((await req('/api/admin/save',draft)).status,200);assert.equal((await req('/api/admin/save',draft)).status,409);
const feed=(await req('/api/content/current-polls.json',undefined,{anonymous:true})).data;assert.equal(feed.polls[0].date,'23.09.2026');assert.equal(feed.polls[0].parties.reduce((s,p)=>s+p.mandates,0),120);
assert.equal((await req('/data/current-polls.json',undefined,{anonymous:true})).data.polls[0].date,'23.09.2026');
assert.equal((await req('/api/admin/refresh',{})).status,502);assert.equal((await req('/api/content/current-polls.json')).data.polls[0].date,'23.09.2026');
assert.equal((await req('/api/admin/save',{...draft,kind:'sample'})).status,200);
assert.equal((await req('/api/admin/save',{...draft,kind:'sample',sourceId:'kan_news'})).status,200);
const liveFeed=(await req('/api/content/live-results.json',undefined,{anonymous:true})).data;
assert.equal(liveFeed.sample.parties.length,2);
assert.equal(liveFeed.samples.channel_12.parties.length,2);
assert.equal(liveFeed.samples.kan_news.parties.length,2);
assert.equal(Object.keys(liveFeed.samples).length,2);
const event={session:'12345678-1234-1234-1234-123456789012',view:'87654321-4321-4321-4321-210987654321',page:'polls',seq:1,seconds:0};
assert.equal((await req('/api/analytics/event',event,{anonymous:true})).status,200);now+=5000;
await req('/api/analytics/event',{...event,seq:2,seconds:5});await req('/api/analytics/event',event);
const report=(await req('/api/analytics/summary')).data;assert.equal(report.views,1);assert.equal(report.seconds,5);assert.equal(report.sessions,1);
assert.equal((await req('/api/analytics/summary',undefined,{anonymous:true})).status,401);assert.equal((await req('/api/analytics/event',{...event,page:'secret-choice'})).status,400);
now+=9*3600e3;assert.equal((await req('/api/admin/state')).status,401);
console.log('Passed: private login, expiry, cross-origin rejection, poll validation, duplicate prevention, persistent public feed, failed-source preservation, separate channel samples, private analytics and cumulative-event deduplication.');
