const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=vm.createContext({console,Intl,Date});
for(const f of ['scenario','app'])vm.runInContext(fs.readFileSync(`assets/${f}.js`,'utf8'),c);
c.demo=JSON.parse(fs.readFileSync('data/demographics.json','utf8'));
vm.runInContext(`
S.demo=demo;
const baseline=JSON.stringify(runDemoModel(0));
S.demoOverrides.haredi={growth:0.06,turnout:0.5};
if(baseline!==JSON.stringify(runDemoModel(0)))throw Error('2022 baseline changed');
if(runDemoModel(4).votes.utj===runDemoModel(0).votes.utj)throw Error('2026 controls had no effect');
for(const blend of [0,.5,1])for(const demographic of [-6,0,2,6]){
 const r=scenarioForecast({likud:24,shas:7,yahadut_hatora:7,beyahad:20,yashar:20,hademokratim:12,ozma_yehudit:8,ndi:8,raam:6,reshima_meshutefet:8},{blend,demographic});
 if(r.parties.shas!==11||r.parties.yahadut_hatora!==8)throw Error('Fixed assumptions changed');
 if(Object.values(r.parties).reduce((a,b)=>a+b,0)!==120)throw Error('Seat total');
 if(Object.values(r.parties).some(x=>x<0||!Number.isInteger(x)))throw Error('Invalid seats');
}
for(const raw of [{likud:120},{beyahad:120},{shas:10,raam:110}]){
const r=scenarioForecast(raw);if(Object.values(r.parties).reduce((a,b)=>a+b,0)!==120)throw Error('Missing donor group broke total');}
`,c);
console.log('Passed: fixed 8/11, 120 seats, parameter extremes, absent donor groups, immutable 2022 baseline, demographic controls.');
