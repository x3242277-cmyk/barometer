const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const context = vm.createContext({ console, Intl, Date, setInterval(){}, clearInterval(){} });
for (const f of ['explore.js','poll-tracker.js','polls-workspace.js','app.js']) vm.runInContext(fs.readFileSync('assets/'+f,'utf8'),context);
context.fixtures = Object.fromEntries(['current-polls','polls-archive','pollsters'].map(f=>[f,JSON.parse(fs.readFileSync('data/'+f+'.json','utf8'))]));
vm.runInContext(`S.cur=fixtures['current-polls'];S.pollsArchive=fixtures['polls-archive'];S.firms=fixtures.pollsters;S.trackRange='all';`,context);
const run = source => vm.runInContext(source,context);
run(`
const workspaceFixture = (id,date,source,value) => ({id,date,dateTimestamp:Date.parse(date),sourceId:source,channelHebrewName:source==='channel_14'?'ערוץ 14':'מעריב',parties:value===null?[]:[{id:'likud',name:'הליכוד',mandates:value,alignment:'Coalition'}]});
const fixtureRows = [workspaceFixture('a','2026-09-01','channel_14',24),workspaceFixture('b','2026-09-02','channel_14',null),workspaceFixture('c','2026-09-03','channel_14',0),workspaceFixture('d','2026-09-01','maariv',20)];
const fixtureModel={polls:fixtureRows,parties:[{id:'likud',name:'הליכוד',color:'#245fa6'}]};
const fixtureState={mode:'channels',selected:[{key:'ערוץ 14',label:'ערוץ 14'}],metric:'likud',view:'timeline'};
`);
const series=run('explorerLines(fixtureModel,fixtureState)[0].points');
assert.equal(series.length,2,'omitted party was manufactured as a zero measurement');
assert.equal(series[1].v,0,'an explicit zero measurement disappeared');
assert.equal(series[0].v,24,'channel comparison included another channel');
const firms = run(`explorerLines(fixtureModel,{...fixtureState,mode:'firms',selected:[{key:'Next Data',label:'נקסט דאטה'}]})[0].points`);
assert.equal(firms[0].v,24,'institute attribution selected the wrong surveys');
run(`const sameDate=[workspaceFixture('e','2026-09-01','channel_14',24),workspaceFixture('f','2026-09-01','channel_14',28),workspaceFixture('g','2026-09-01','maariv',12)];`);
assert.equal(run(`explorerLines({...fixtureModel,polls:sameDate},{mode:'parties',selected:[{key:'likud',label:'הליכוד'}],view:'timeline'})[0].points[0].v`),19,'daily party average did not give each institute equal weight');
/* מפלגות לפי בסיס המספרים (ממוצע / משוקלל / תחזית): נקודה אחת ביום, והאחרונה גוברת; רשימה חסרה = 0 */
run(`const partyM={now:{t:Date.parse("2026-10-03T12:00:00Z")},basis:"baro",series:[
  {t:Date.parse("2026-10-02T06:00:00Z"),parties:{likud:20},n:5,firms:4},
  {t:Date.parse("2026-10-02T18:00:00Z"),parties:{likud:22},n:5,firms:4},
  {t:Date.parse("2026-10-03T12:00:00Z"),parties:{},n:6,firms:5}]};
const partyLines=explorerPartyLines(partyM,{selected:[{key:"likud",label:"הליכוד"}]});`);
assert.equal(run("partyLines[0].points.length"),2,"a forecast series must keep one point per day");
assert.equal(run("partyLines[0].points[0].v"),22,"the last snapshot of the day wins");
assert.equal(run("partyLines[0].points[1].v"),0,"a list absent from the series counts as 0, like everywhere else on the site");
assert.equal(run("explorerLinesFor({polls:[]},partyM,{mode:\"parties\",selected:[{key:\"likud\",label:\"x\"}]})[0].points.length"),2,"the parties lens must follow the chosen basis");
assert.equal(run("Object.keys(TRACK_BASES).join()"),"avg,weighted,baro","basis order: average, reliability-weighted, Barometer forecast");
run(`S.exploreView='table';S.exSources=['ערוץ 14'];S.exSubjects=['likud'];`);
assert.equal(run('explorerState(fixtureModel).view'),'table','selected comparison view was lost');
const table=run(`explorerChart(fixtureModel,fixtureState).table`);
assert(table.includes('ex-data-table')&&table.includes('3.9'),'table does not show the actual measurement dates');
assert(!table.includes('class="tr-hit"'),'table rendered the chart instead');
run(`S.exploreView='chart';`);
const empty=run(`explorerChart(fixtureModel,{...fixtureState,selected:[]}).svg`);
assert(empty.includes('ex-empty'),'empty selection crashed or manufactured a series');
run(`const changed=[fixtureRows[0],{...fixtureRows[2],parties:[{id:'likud',name:'רשימה משותפת אחרת',mandates:28,alignment:'Coalition'}]}];`);
const changedHTML=run(`explorerChart({...fixtureModel,polls:changed},fixtureState).svg`);
const path=changedHTML.match(/class="tr-line[^"]*"[^>]+d="([^"]+)"/)[1];
assert.equal((path.match(/M/g)||[]).length,2,'changed alliances are connected into a continuous trend');
assert.equal((path.match(/L/g)||[]).length,0,'line implies a comparable change across different list definitions');
run(`S.leaders={};const realP=trackerModel();`);
/* ברירת מחדל: ממוצע הסקרים של הגושים; מימין מקורות (הברומטר + ערוצים), משמאל נושאים (המנורה + מפלגות) */
const scenarios={
  'default (blocs average)':`S.exSources=[];S.exSubjects=['blocs'];`,
  'Barometer blocs':`S.exSources=['baro'];S.exSubjects=['blocs'];`,
  'one party average':`S.exSources=[];S.exSubjects=['likud'];`,
  'channel × party':`S.exSources=['ערוץ 14'];S.exSubjects=['likud','shas'];`,
  'channel + Barometer × blocs':`S.exSources=['ערוץ 14','baro'];S.exSubjects=['blocs'];`
};
for(const [name,setup] of Object.entries(scenarios)) {
  run(`S.exploreView='chart';${setup}`);
  const html=run('renderExplorerHTML(realP,realP,realP)');
  assert(html.includes('ex-logo-button')&&html.includes('aria-label=')&&html.includes('data-ex-src=')&&html.includes('data-ex-sub='),'missing accessible two-row logo picker in '+name);
  assert(html.includes('data-ex-sub="blocs"')&&html.includes('knesset-emblem.svg'),'Knesset emblem (blocs) icon missing in '+name);
  assert(!html.includes('data-ex-lens'),'the institutes/channels lens selector came back in '+name);
  assert(!/NaN|undefined/.test(html),'invalid value rendered in '+name);
}
run(`S.exSources=[];S.exSubjects=['blocs'];S.exploreView='chart';renderExplorerHTML(realP,realP,realP)`);
assert.equal(run('S.explorer.state.overview'),true,'default view must be the blocs average');
run(`S.exSources=['ערוץ 14','כאן 11'];S.exSubjects=['likud','shas','noam'];renderExplorerHTML(realP,realP,realP)`);
assert(run('explorerLineCount(S.explorer.state.sources,S.explorer.state.subjects)')>=1,'line counter broke');
assert.equal(run(`explorerLineCount(['a','b'],['blocs'])`),4,'bloc subject should count two lines (both blocs) per source');
assert.equal(run(`explorerLineCount([],['x','y'])`),2,'no source means one aggregated source');
run(`S.exSources=[];S.exSubjects=['blocs'];`);
const gallery=run('feedCardHTML(realP.polls.at(-1),realP.polls,true)');
assert(gallery.includes(' open')&&gallery.includes('data-feed-poll='),'gallery card is not expanded or has no individual expansion');
assert(gallery.includes('מקור'),'gallery lost the original source link');
run(`const feedFixture={...fixtureRows[0],id:'feed-new',date:'04.10.2026',dateTimestamp:Date.parse('2026-10-04'),parties:[
  {id:'likud',name:'הליכוד',mandates:60,alignment:'Coalition'},
  {id:'beyahad',name:'ביחד',mandates:46,alignment:'Opposition'},
  {id:'raam',name:'רע״ם',mandates:6,alignment:'Opposition'},
  {id:'reshima_meshutefet',name:'הרשימה המשותפת',mandates:8,alignment:'Arabs'},
  {id:'noam',name:'רשימה מתחת לסף',mandates:0,alignment:'Coalition'}]};
const oldFeed={...feedFixture,id:'feed-old',date:'03.10.2026',dateTimestamp:Date.parse('2026-10-03')};`);
assert.equal(run(`alignOf({id:'raam',alignment:'Opposition'})`),'Arabs','source alignment overrode the permanent Ra’am classification');
assert.equal(run(`partyMeta('raam').alignment`),'Arabs','Ra’am metadata does not use Arab classification');
assert.equal(run(`sideOf('raam')`),'mid','Ra’am remained in the center-left party column');
assert.equal(run('pollVector(feedFixture).blocs.Arabs'),14,'Ra’am was omitted from Arab poll totals');
assert.equal(run('pollVector(feedFixture).blocs.Left'),46,'Ra’am remained in center-left poll totals');
assert.equal(run('buildSeries([feedFixture])[0].blocs.Arabs'),14,'weighted series does not use the Arab classification');
const filteredFeed=run('feedCardHTML(feedFixture,[oldFeed,feedFixture],true)');
assert(!filteredFeed.includes('רשימה מתחת לסף'),'latest poll feed still displays a zero-seat list');
const galleryFeed=run('feedCardHTML(feedFixture,[oldFeed,feedFixture],true,true)');
assert(galleryFeed.includes('feed-below')&&galleryFeed.includes('רשימה מתחת לסף'),'the full-screen poll must also list parties below the threshold');
assert(filteredFeed.includes('רע״ם')&&filteredFeed.includes('הרשימה המשותפת'),'passing Arab lists disappeared from the feed');
const feedBox={innerHTML:'',seen:[],opened:[],querySelectorAll(selector){return (selector.includes(':has(')?this.opened:this.seen).map(id=>({dataset:{feedId:id}}));}};
const feedNodes={'#polls-feed':feedBox,'#polls-stats':{},'#feed-all':{}};
context.document={querySelector:selector=>feedNodes[selector]};
run(`S.forecastHistory={weekly:[{date:'2026-10-05',week:'2026-10-05',seats:{likud:120}}]};renderPollFeed({polls:[oldFeed,feedFixture]});`);
const isOpen=id=>new RegExp('data-feed-id="'+id+'"><details[^>]* open').test(feedBox.innerHTML);
assert(isOpen('feed-new'),'latest actual poll did not open on first render');
assert(!isOpen('feed-old'),'an older poll opened by default');
assert(!isOpen('barometer-2026-10-05'),'a weekly forecast opened instead of the latest survey');
feedBox.seen=['feed-new','feed-old','barometer-2026-10-05'];
run('renderPollFeed({polls:[oldFeed,feedFixture]})');
assert(!isOpen('feed-new'),'rerender reopened a survey the user had closed');
feedBox.opened=['feed-old'];
run(`renderPollFeed({polls:[oldFeed,feedFixture,{...feedFixture,id:'feed-newer',date:'06.10.2026',dateTimestamp:Date.parse('2026-10-06')}]})`);
assert(isOpen('feed-newer'),'newly arrived latest survey did not open');
assert(isOpen('feed-old'),'rerender lost a survey the user had opened');
console.log('Passed: survey aggregation, comparable trends, table dates, two-row logo pickers (sources and subjects), source cards, permanent Arab classification for Ra’am, hidden zero-seat lists and latest-poll expansion with preserved user choices.');
