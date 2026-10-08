const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=vm.createContext({console,Intl,Date});
for(const f of ['scenario','app'])vm.runInContext(fs.readFileSync(`assets/${f}.js`,'utf8'),c);
c.demo=JSON.parse(fs.readFileSync('data/demographics.json','utf8'));
vm.runInContext(`
S.demo=demo;
const baseline=JSON.stringify(runDemoModel(0));
if(histBlocs(runDemoModel(0).seats,BLOCS_2022).netanyahu!==64)throw Error('Actual 2022 allocation changed');
const projection=demoBlocProjection();
if(projection.right2022!==62||projection.right2026!==63)throw Error('Demographic projection must use the Meretz counterfactual: 62 to 63');
if(projection.right2022+projection.other2022!==120||projection.right2026+projection.other2026!==120)throw Error('Demographic projection seat total');
if(demoBlocProjection(0).right2026!==62)throw Error('Zero demographic drift changed the counterfactual baseline');
S.demoOverrides.haredi={growth:0.06,turnout:0.5};
if(baseline!==JSON.stringify(runDemoModel(0)))throw Error('2022 baseline changed');
if(runDemoModel(4).votes.utj===runDemoModel(0).votes.utj)throw Error('2026 controls had no effect');
for(const demographic of [-6,0,2,6]){
 const r=scenarioForecast({likud:24,shas:7,yahadut_hatora:7,beyahad:20,yashar:20,hademokratim:12,ozma_yehudit:8,ndi:8,raam:6,reshima_meshutefet:8},{harediSeats:{shas:10,yahadut_hatora:7.7},demographic});
 if(r.parties.shas!==10||r.parties.yahadut_hatora!==7.7||r.parties.raam!==6)throw Error('Modeled or poll-only inputs changed');
 if(Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-120)>1e-6)throw Error('Seat total');
 const seats=allocateSeats(r.parties);
 if(Object.values(seats).reduce((a,b)=>a+b,0)!==120)throw Error('Bader-Ofer seat total');
 if(Object.values(seats).some(x=>x<0||!Number.isInteger(x)))throw Error('Invalid seats');
 if(![10,11].includes(seats.shas)||![7,8].includes(seats.yahadut_hatora)||![5,6,7].includes(seats.raam))throw Error('Party allocation outside expected rounding');
}
for(const raw of [{likud:120},{beyahad:120},{shas:10,raam:110}]){
const r=scenarioForecast(raw);if(Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-120)>1e-6)throw Error('Missing donor group broke total');}
for(const support of [4,5,6,7,8]) {
 const raw={likud:24,shas:7,yahadut_hatora:7,beyahad:20,yashar:20,hademokratim:12,ozma_yehudit:8,ndi:8,raam:support,reshima_meshutefet:8};
 const r=scenarioForecast(raw,{harediSeats:{shas:10,yahadut_hatora:7.7},demographic:6});
 if(r.parties.raam!==support)throw Error('Raam stopped following the polls');
}
if('raam' in scenarioForecast({likud:50,yashar:50}).parties)throw Error('Raam was injected without polling support');
for(const likud of [20,40]){
 const raw={likud,ozma_yehudit:8,zionut_datit:10,shas:10,yahadut_hatora:8,yashar:60-likud,beyahad:10,hademokratim:6,ndi:4,raam:4};
 const r=scenarioForecast(raw,{harediSeats:{shas:10,yahadut_hatora:8},demographic:0});
 for(const [id,v] of Object.entries(raw))if(Math.abs(r.parties[id]-v)>1e-9)throw Error('A hidden bloc target changed the poll-only scenario');
 if('anchor' in r||'blend' in r)throw Error('Removed bloc adjustment is still exposed');
 const shifted=scenarioForecast(raw,{harediSeats:{shas:10,yahadut_hatora:8},demographic:1.5});
 const right=p=>['likud','ozma_yehudit','zionut_datit','shas','yahadut_hatora'].reduce((n,id)=>n+p[id],0);
 if(Math.abs(right(shifted.parties)-right(r.parties)-1.5)>1e-9)throw Error('The retained demographic addition changed');
}
/* baderOfer: a pair counts once, threshold drops small lists */
const bo=allocateSeats({likud:30,zionut_datit:10,shas:10.5,yahadut_hatora:7.8,raam:4.8,hadash_taal:5,reshima_meshutefet:4,beyahad:20,yashar:16,hademokratim:8,tiny:2});
if(Object.values(bo).reduce((a,b)=>a+b,0)!==120)throw Error('allocateSeats total');
if(bo.tiny)throw Error('threshold not applied');
`,c);
console.log('Passed: modeled Haredi inputs, Bader-Ofer 120 seats, parameter extremes, absent donor groups, immutable 2022 baseline, demographic controls, and the 62-to-63 Meretz counterfactual projection.');
