const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',value:'all',options:[{},{}],insertAdjacentHTML(){}});
  return elements.get(id);
};
const context = vm.createContext({console, Intl, Date, setInterval(){}, clearInterval(){}});
vm.runInContext(fs.readFileSync('assets/explore.js','utf8'),context);
vm.runInContext(fs.readFileSync('assets/app.js','utf8'),context);
vm.runInContext('renderIconFilters=()=>{};renderPartyProfile=()=>{};',context);
context.document = {querySelector:element};
context.fixtures = Object.fromEntries(['current-polls','historical-polls','pollsters'].map(f=>[f,JSON.parse(fs.readFileSync('data/'+f+'.json','utf8'))]));
vm.runInContext(`S.cur=fixtures['current-polls'];S.hist=fixtures['historical-polls'];S.firms=fixtures.pollsters;S.stats=scoreFirms(S.hist);S.series=buildSeries(S.cur.polls);renderFirmCards=()=>{};renderPolls();`,context);
assert.equal((element('#polls-cards').innerHTML.match(/class="poll-result-card"/g)||[]).length,new Set(context.fixtures['current-polls'].polls.map(p=>p.channelHebrewName)).size);
assert(!element('#polls-cards').hidden);
vm.runInContext(`for(const mode of ['weighted','simple']) {const f=forecast(mode);if(JSON.stringify(f.raw)!==JSON.stringify(f.parties))throw Error('Party-specific adjustment');if(Object.values(largestRemainder(f.parties)).reduce((a,b)=>a+b,0)!==120)throw Error('Seat total');}`,context);
element('#poll-firm').value='missing';
vm.runInContext('renderPolls()',context);
assert(element('#polls-cards').innerHTML.includes('לא נמצאו'));
assert(element('#trend-box').innerHTML.includes('אין סקרים'));
element('#poll-firm').value='all';
vm.runInContext(`S.cur.polls=[{...S.cur.polls[0],parties:[{id:'likud',name:'הליכוד',mandates:0,alignment:'Coalition'}]},{...S.cur.polls[1],parties:[{id:'shas',name:'ש״ס',mandates:5,alignment:'Coalition'}]}];renderPolls();`,context);
assert(element('#polls-cards').innerHTML.includes('>5</b>'), 'a listed party lost its seat count');
console.log('Passed: one card per outlet, both forecast modes total 120 without floors, empty filters, zero versus missing.');

vm.runInContext(`
const sample={id:'now',sourceId:'channel_14',channelHebrewName:'ערוץ 14',date:'03.09.2026',parties:[{id:'likud',name:'הליכוד',mandates:20}]};
const older={...sample,id:'older',date:'01.09.2026',parties:[{id:'likud',name:'הליכוד',mandates:19}]};
const wrongFirm={...sample,id:'wrong',date:'02.09.2026',sourceId:'different-firm'};
if(previousComparablePoll(sample,[wrongFirm,older])!==older)throw Error('Compared different firms');
if(comparablePartyValue(sample,older,'likud')!==19)throw Error('Valid comparable party rejected');
if(comparablePartyValue(sample,{...older,parties:[]},'likud')!==null)throw Error('Missing treated as zero');
if(comparablePartyValue(sample,{...older,parties:[{id:'likud',name:'Different alliance',mandates:19}]},'likud')!==null)throw Error('Changed list compared');
S.compareIds=null;S.firms=fixtures.pollsters;renderComparison([sample,older,wrongFirm],['likud']);
`,context);
assert(element('#compare-table').innerHTML.includes('20'));
assert(!element('#compare-table').innerHTML.includes('>19<'), 'two polls of the same firm both shown; only the latest should be');
assert(element('#compare-status').textContent.startsWith('2'));
assert(element('#compare-picker').innerHTML.includes('מכונים'), 'comparison still offers individual polls');
console.log('Passed: same-firm comparison, changed alliances, missing versus zero, selected poll comparison.');

context.fixtures['current-polls'] = JSON.parse(fs.readFileSync('data/current-polls.json','utf8'));
vm.runInContext(`
S.cur=fixtures['current-polls'];S.hist=fixtures['historical-polls'];S.series=buildSeries(S.cur.polls);
S.focusParty='';S.compareIds=null;S.pollView='cards';renderPolls();
if(barScale(24)!==25||barScale(25)!==30||barScale(0)!==25)throw Error('Bar scale not stepped in fives above the maximum');
`,context);
const cards = element('#polls-cards').innerHTML.split('<article').slice(1);
for (const card of cards) {
  /* הכרטיס מחולק לשתי עמודות גוש — הסדר היורד נבדק בכל עמודה בנפרד. */
  const columns = card.split('<ol class="poll-list">').slice(1);
  assert.equal(columns.length, 2, 'poll card is not split into two bloc columns');
  const all = [];
  for (const col of columns) {
    const seats = [...col.matchAll(/<\/button><b>(\d+|—)<\/b>/g)].map(m => m[1] === '—' ? -1 : +m[1]);
    assert.deepEqual(seats, [...seats].sort((a,b) => b-a), 'bloc column not ordered by mandates, high to low');
    all.push(...seats);
  }
  assert(all.length, 'poll card listed no parties');
}
vm.runInContext(`S.pollView='compare';S.compareIds=null;renderPolls();`, context);
const compared = [...element('#compare-table').innerHTML.matchAll(/<td>(\d+|—)<\/td>/g)].map(m => m[1] === '—' ? 0 : +m[1]);
const perRow = [];
for (let i = 0; i < compared.length; i += 2) perRow.push(compared[i] + compared[i+1]);
assert.deepEqual(perRow, [...perRow].sort((a,b) => b-a), 'comparison rows not ordered by mandates, high to low');
const est = vm.runInContext(`const e=forecast('weighted');renderForecastOverview(e,largestRemainder(e.parties));$('#forecast-bars').innerHTML`, context);
const barSeats = [...est.matchAll(/<strong>(\d+)<\/strong>/g)].map(m => +m[1]);
assert.deepEqual(barSeats, [...barSeats].sort((a,b) => b-a), 'forecast bars not ordered by mandates, high to low');
const widths = [...est.matchAll(/width:([\d.]+)%/g)].map(m => +m[1]);
assert(Math.max(...widths) > 75 && Math.max(...widths) <= 100, 'longest bar does not fill the track proportionally');
assert(est.includes('--rows:' + Math.ceil(barSeats.length / 2)), 'bar columns not split so each reads top to bottom');
console.log('Passed: mandate order in cards, comparison and forecast bars; one shared bar scale.');

vm.runInContext(`
const many = [];
for (const [ch, n] of [['ערוץ א',6],['ערוץ ב',2],['ערוץ ג',1]])
  for (let i = 0; i < n; i++) many.push({ id: ch+i, date: String(20-i).padStart(2,'0')+'.08.2026', dateTimestamp: Date.parse('2026-08-'+String(20-i).padStart(2,'0')),
    channelHebrewName: ch, sourceId: 'maariv', parties: [{id:'likud',name:'הליכוד',mandates:20+i,alignment:'Coalition'}] });
many.push({ id:'old', date:'20.08.2025', dateTimestamp: Date.parse('2025-08-20'), channelHebrewName:'ערוץ א', sourceId:'maariv', parties:[{id:'likud',name:'הליכוד',mandates:9,alignment:'Coalition'}] });
const sel = selectDisplayPolls(many);
if (sel.some(p => p.date.endsWith('2025'))) throw Error('Poll from another year kept');
const per = {}; sel.forEach(p => per[p.channelHebrewName] = (per[p.channelHebrewName]||0)+1);
if (per['ערוץ א'] !== 4 || per['ערוץ ב'] !== 2 || per['ערוץ ג'] !== 1) throw Error('Per-outlet cap wrong: '+JSON.stringify(per));
if (sel.filter(p=>p.channelHebrewName==='ערוץ א').some(p=>p.id==='ערוץ א4'||p.id==='ערוץ א5')) throw Error('Kept older polls over newer ones');
`, context);
console.log('Passed: election-year filter, four newest polls per outlet, older ones pushed out.');

context.fixtures['current-polls'] = JSON.parse(fs.readFileSync('data/current-polls.json','utf8'));
vm.runInContext(`S.cur=fixtures['current-polls'];S.pollView='cards';S.cardPoll={};S.focusParty='';S.compareIds=null;renderPolls();`, context);
const polls = context.fixtures['current-polls'].polls;
const outlets = new Set(polls.map(p => p.channelHebrewName));
const cardHTML = element('#polls-cards').innerHTML;
assert.equal((cardHTML.match(/class="poll-result-card"/g)||[]).length, outlets.size, 'one card per outlet');
const repeated = [...outlets].find(o => polls.filter(p => p.channelHebrewName === o).length > 1);
const others = polls.filter(p => p.channelHebrewName === repeated).sort((a,b) => b.dateTimestamp - a.dateTimestamp);
assert(cardHTML.includes(`data-card-outlet="${repeated}"`), 'repeated outlet offers no date picker');
assert(cardHTML.includes(`value="${others[0].id}" selected`), "card does not default to the outlet's newest poll");
vm.runInContext(`S.cardPoll=${JSON.stringify({[repeated]: others[1].id})};renderPolls();`, context);
const switched = element('#polls-cards').innerHTML;
assert(switched.includes(`value="${others[1].id}" selected`), 'picking another date did not switch the card');
assert.equal((switched.match(/class="poll-result-card"/g)||[]).length, outlets.size, 'switching a date changed the number of cards');
assert(!switched.includes('polls-table'), 'table view still rendered');
const order = h => [...h.matchAll(/data-card-outlet="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(order(switched), order(cardHTML), 'switching a date moved the card out of place');
console.log("Passed: a card per outlet, its date picker switches to that outlet's other polls only.");
