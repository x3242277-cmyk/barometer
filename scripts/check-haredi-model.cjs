const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const now = Date.parse('2026-10-08T12:00:00+03:00');
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const c = vm.createContext({ console, Intl, Date: TestDate });
for (const f of ['scenario', 'app', 'poll-tracker']) vm.runInContext(fs.readFileSync('assets/'+f+'.js','utf8'),c);
const read = name => JSON.parse(fs.readFileSync('data/'+name+'.json','utf8'));
c.fixture = { hist: read('historical-polls'), hist2021: read('historical-polls-2021'), hist2020: read('historical-polls-2020'), demo: read('demographics'), haredi: read('haredi'), firms: read('pollsters'), current: read('current-polls'), trends: read('trends') };
c.assert = assert;
vm.runInContext(`
Object.assign(S,{hist:fixture.hist,demo:fixture.demo,haredi:fixture.haredi,firms:fixture.firms,cur:fixture.current,trendsNat:fixture.trends.national});
S.elections=[[2022,fixture.hist],[2021,fixture.hist2021],[2020,fixture.hist2020]].map(([year,data])=>({year,data,stats:scoreFirms(data)}));
S.stats=combineCalibrations(S.elections); S.house=houseEffects(S.elections); S.houseIndustry=houseIndustry(S.house);
S.forecastPolls=recentForForecast(S.cur.polls); S.series=buildSeries(S.forecastPolls); S.seriesScenario=buildSeries(S.forecastPolls.map(correctWithinBlocs));
const model=harediForecast();
assert.ok(model); assert.equal(model.geoTotal,18);
assert.equal(model.components.shas.geographic,11); assert.equal(model.components.yahadut_hatora.geographic,7);
for(const id of ['shas','yahadut_hatora']) {
 const x=model.components[id];
 assert.ok(Math.abs(x.combined-(.25*x.demographic+.25*x.geographic+.5*x.polls))<1e-12);
}
const direct=model.rows.find(x=>x.firm==='Direct Polls'), next=model.rows.find(x=>x.firm==='Next Data');
if(direct&&next) { assert.equal(direct.parties.shas.correction,next.parties.shas.correction); assert.equal(direct.calibrationFirm,next.calibrationFirm); }
const midgam=model.rows.find(x=>x.firm==='Midgam');
if(midgam) { assert.equal(midgam.parties.shas.years,3); assert.ok(Math.abs(midgam.parties.shas.correction-1.25)<1e-12); }
for(const row of model.rows)for(const id of ['shas','yahadut_hatora']) {
 const p=row.parties[id];
 if(p.years)assert.ok(Math.abs(p.correction+p.meanError*p.years/(p.years+1))<1e-12);
 else assert.equal(p.correction,-S.houseIndustry[id==='shas'?'shas':'utj']*.5);
}
assert.ok(Math.abs(model.rows.reduce((n,r)=>n+r.weight,0)-1)<1e-12);
const before=JSON.stringify(model.parties); S.harGrowth=6;S.harTurnout=60;S.harWasted=10;
assert.equal(JSON.stringify(harediForecast().parties),before); S.harGrowth=null;S.harTurnout=null;S.harWasted=null;
for(const poll of S.forecastPolls) {
 const corrected=correctWithinBlocs(poll);
 for(const id of ['shas','yahadut_hatora'])assert.equal(corrected.parties.find(p=>p.id===id)?.mandates,poll.parties.find(p=>p.id===id)?.mandates);
}
const weighted=forecast('weighted',HIDE_FROM_HOME);
for(const id of ['shas','yahadut_hatora'])assert.ok(Math.abs(weighted.parties[id]-model.components[id].rawPolls)<1e-12);
for(const blend of [0,.5,1])for(const demographic of [-6,0,2,6]) {
 const result=scenarioForecast(weighted.raw,{harediSeats:model.parties,blend,demographic});
 assert.equal(result.parties.shas,model.parties.shas);assert.equal(result.parties.yahadut_hatora,model.parties.yahadut_hatora);
 assert.ok(Math.abs(Object.values(result.parties).reduce((a,b)=>a+b,0)-120)<1e-8);
 const allocated=allocateSeats(result.parties);
 assert.equal(Object.values(allocated).reduce((a,b)=>a+b,0),120);
 assert.ok(Object.values(allocated).every(x=>Number.isInteger(x)&&x>=0));
}
const changed=S.series[0], was=changed.parties.shas, weight=model.rows[0].weight;
changed.parties.shas+=1;assert.ok(Math.abs(harediForecast().parties.shas-model.parties.shas-.5*weight)<1e-12);changed.parties.shas=was;
assert.equal(ELECTION_RULES.surplusAgreements.length,5);
assert.ok(ELECTION_RULES.surplusAgreements.some(([a,b])=>a==='reshima_meshutefet'&&b==='raam'));
assert.ok(ELECTION_RULES.surplusAgreements.some(([a,b])=>a==='yashar'&&b==='hademokratim'));
assert.ok(ELECTION_RULES.surplusAgreements.some(([a,b])=>a==='beyahad'&&b==='ndi'));
assert.ok(ELECTION_RULES.surplusAgreements.every(pair=>!pair.includes('ozma_yehudit')));
const votes={likud:25,zionut_datit:6,shas:10,yahadut_hatora:8,yashar:22,hademokratim:9,beyahad:12,ndi:8,reshima_meshutefet:7,raam:5,ozma_yehudit:8,tiny:1};
assert.equal(allocateSeats(votes).tiny,undefined);
assert.equal(activeAgreements({shas:10}).length,0);
console.log(JSON.stringify({parties:model.parties,total:model.total,components:model.components,polls:model.polls,firms:model.rows.length},null,2));
`,c);
console.log('Passed: dynamic 25/25/50 model, per-party historical correction, shared calibration, fallback, reliability weights, no double correction, calculator isolation, polling response, agreements and 120 seats.');
