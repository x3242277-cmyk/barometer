const fs=require('fs'),vm=require('vm');
const ctx=vm.createContext({console,Intl,Date});
// Substitute only inside the isolated audit VM; production weights are unchanged.
for(const name of ['scenario','app'])vm.runInContext(fs.readFileSync(`assets/${name}.js`,'utf8').replace('const firmWeight =','let firmWeight ='),ctx);
ctx.data=Object.fromEntries(['current-polls','historical-polls','historical-polls-2021','historical-polls-2020','pollsters','demographics'].map(f=>[f,JSON.parse(fs.readFileSync(`data/${f}.json`,'utf8'))]));
const result=vm.runInContext(`
S.cur=data['current-polls'];S.hist=data['historical-polls'];S.firms=data.pollsters;S.demo=data.demographics;
S.elections=[2022,2021,2020].map(year=>({year,stats:scoreFirms(data[year===2022?'historical-polls':'historical-polls-'+year])}));
S.stats=combineCalibrations(S.elections);S.forecastPolls=recentForForecast(S.cur.polls);S.series=buildSeries(S.forecastPolls);
const totals=p=>Object.entries(p).reduce((o,[id,n])=>{const b=partyMeta(id).alignment;o[b]=(o[b]||0)+n;return o;},{});
const snap=mode=>{const f=forecast(mode,HIDE_FROM_HOME),seats=allocateSeats(f.parties);return {raw:totals(f.rawFull),beforeRounding:totals(f.parties),blocs:totals(seats),seats,assumptions:f.scenario};};
const weighted=snap('weighted'),scenario=snap('scenario'),simple=snap('simple');
const original=firmWeight,W=S.series.reduce((s,f)=>s+firmWeight(f.meta),0);
const firms=S.series.map(s=>({name:s.meta.he,score:firmScore(s.meta),tier:gradeOf(firmScore(s.meta)).key,weight:firmWeight(s.meta),share:100*firmWeight(s.meta)/W,polls:s.polls.length,calibrated:s.meta.calibrated}));
firmWeight=()=>1;const equalScenario=snap('scenario');firmWeight=original;
const powerTests=[1,2,3].map(power=>{firmWeight=m=>original(m)**power;const r={power,weighted:snap('weighted'),scenario:snap('scenario')};firmWeight=original;return r;});
JSON.stringify({at:new Date().toISOString(),polls:S.forecastPolls.length,firms,simple,weighted,scenario,equalScenario,powerTests},null,2);
`,ctx);
console.log(result);
