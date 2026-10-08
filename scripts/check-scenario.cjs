const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=vm.createContext({console,Intl,Date,assert});
for(const f of ['scenario','app'])vm.runInContext(fs.readFileSync(`assets/${f}.js`,'utf8'),c);
c.demo=JSON.parse(fs.readFileSync('data/demographics.json','utf8'));
vm.runInContext(`
S.demo=demo;
const baseline=JSON.stringify(runDemoModel(0));
if(histBlocs(runDemoModel(0).seats,BLOCS_2022).netanyahu!==64)throw Error('Actual 2022 allocation changed');
const projection=demoBlocProjection();
if(Math.abs(projection.right2022-120*projection.share2022/100)>1e-9||Math.abs(projection.right2026-120*projection.share2026/100)>1e-9)throw Error('Demographic projection must be vote share x 120, not a seat anchor');
if(Math.abs(projection.right2022-58.93)>0.01||Math.abs(projection.right2026-60.10)>0.01)throw Error('Demographic projection: expected 58.93 to 60.10');
if(Math.abs(projection.netVotes-projection.driftPoints/100*runDemoModel(demo.meta.years).campTotal)>1e-6)throw Error('Net votes must be the share change times 2026 votes');
if(Math.abs(projection.right2022+projection.other2022-120)>1e-9||Math.abs(projection.right2026+projection.other2026-120)>1e-9)throw Error('Demographic projection seat total');
if(Math.abs(demoBlocProjection(0).right2026-projection.right2022)>1e-9)throw Error('Zero demographic drift changed the 2022 vote-share baseline');
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
const overlapRaw={likud:24,ozma_yehudit:8,zionut_datit:10,shas:7,yahadut_hatora:7,yashar:30,beyahad:10,hademokratim:10,ndi:8,raam:6};
const harediOptions={shas:10,yahadut_hatora:8};
const harediOnly=scenarioForecast(overlapRaw,{harediSeats:harediOptions,demographic:0});
const covered=scenarioForecast(overlapRaw,{harediSeats:harediOptions,demographic:harediOnly.harediBlocGain*.5});
assert.equal(covered.demographic,0,'structural growth already covered by the Haredi correction was added again');
assert.deepEqual(covered.parties,harediOnly.parties);
const excess=scenarioForecast(overlapRaw,{harediSeats:harediOptions,demographic:harediOnly.harediBlocGain+1});
assert.ok(Math.abs(excess.demographic-1)<1e-9,'only the uncovered remainder should be added');
const rawHarediFull=overlapRaw.shas+overlapRaw.yahadut_hatora;
assert.ok(harediOnly.harediBlocGain<harediOptions.shas+harediOptions.yahadut_hatora-rawHarediFull,'bloc gain must account for the 120-seat adjustment');
const target=harediOnly.beforeDemographicRight+3;
const band=scenarioForecast(overlapRaw,{harediSeats:harediOptions,structuralRight:target,deviationPercent:1.5});
assert.ok(Math.abs(band.structuralLowerBound-target*.985)<1e-9,'1.5% must be relative to the structural support estimate');
assert.ok(Math.abs(band.demographic-(target*.985-harediOnly.beforeDemographicRight))<1e-9,'lift only the gap left after Haredim');
const within=scenarioForecast(overlapRaw,{harediSeats:harediOptions,structuralRight:harediOnly.beforeDemographicRight,deviationPercent:1.5});
assert.deepEqual(within.parties,harediOnly.parties,'support already above the lower bound must stay unchanged');
const noBand=scenarioForecast(overlapRaw,{harediSeats:harediOptions,structuralRight:target,deviationPercent:0});
assert.ok(Math.abs(noBand.demographic-3)<1e-9,'the configurable zero-error case must lift exactly to the model estimate');
for(const result of [band,within,noBand]){
 assert.equal(result.parties.shas,harediOptions.shas);assert.equal(result.parties.yahadut_hatora,harediOptions.yahadut_hatora);assert.equal(result.parties.raam,overlapRaw.raam);
 assert.ok(Math.abs(Object.values(result.parties).reduce((sum,n)=>sum+n,0)-120)<1e-9);
}
/* baderOfer: a pair counts once, threshold drops small lists */
const bo=allocateSeats({likud:30,zionut_datit:10,shas:10.5,yahadut_hatora:7.8,raam:4.8,hadash_taal:5,reshima_meshutefet:4,beyahad:20,yashar:16,hademokratim:8,tiny:2});
if(Object.values(bo).reduce((a,b)=>a+b,0)!==120)throw Error('allocateSeats total');
if(bo.tiny)throw Error('threshold not applied');
`,c);
console.log('Passed: modeled Haredi inputs, Bader-Ofer 120 seats, parameter extremes, absent donor groups, immutable 2022 baseline, demographic controls, and the vote-share (net votes) demographic projection 58.9 to 60.1.');
