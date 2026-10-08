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
for(const blend of [0,.5,1])for(const demographic of [-6,0,2,6]){
 const r=scenarioForecast({likud:24,shas:7,yahadut_hatora:7,beyahad:20,yashar:20,hademokratim:12,ozma_yehudit:8,ndi:8,raam:6,reshima_meshutefet:8},{harediSeats:{shas:10,yahadut_hatora:7.7},blend,demographic});
 if(r.parties.shas!==10||r.parties.yahadut_hatora!==7.7||r.parties.raam!==4.8)throw Error('Modeled inputs changed');
 if(Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-120)>1e-6)throw Error('Seat total');
 const seats=allocateSeats(r.parties);
 if(Object.values(seats).reduce((a,b)=>a+b,0)!==120)throw Error('Bader-Ofer seat total');
 if(Object.values(seats).some(x=>x<0||!Number.isInteger(x)))throw Error('Invalid seats');
 if(![10,11].includes(seats.shas)||![7,8].includes(seats.yahadut_hatora)||![4,5].includes(seats.raam))throw Error('Fixed lists rounded wrongly');
}
for(const raw of [{likud:120},{beyahad:120},{shas:10,raam:110}]){
const r=scenarioForecast(raw);if(Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-120)>1e-6)throw Error('Missing donor group broke total');}
/* baderOfer: a pair counts once, threshold drops small lists */
const bo=allocateSeats({likud:30,zionut_datit:10,shas:10.5,yahadut_hatora:7.8,raam:4.8,hadash_taal:5,reshima_meshutefet:4,beyahad:20,yashar:16,hademokratim:8,tiny:2});
if(Object.values(bo).reduce((a,b)=>a+b,0)!==120)throw Error('allocateSeats total');
if(bo.tiny)throw Error('threshold not applied');
`,c);
console.log('Passed: modeled Haredi inputs, Bader-Ofer 120 seats, parameter extremes, absent donor groups, immutable 2022 baseline, demographic controls, and the 62-to-63 Meretz counterfactual projection.');
