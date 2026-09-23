const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({console,Intl,Date,Math});
for(const name of ['scenario','app'])vm.runInContext(fs.readFileSync(`assets/${name}.js`,'utf8'),ctx);
ctx.document={addEventListener(){}};ctx.window={};ctx.matchMedia=()=>({matches:false});
const source=fs.readFileSync('assets/pipeline.js','utf8').replace('window.initPipelineStory=init;','window.storyStagesForAudit=buildSteps;window.initPipelineStory=init;');
vm.runInContext(source,ctx);
ctx.fixtures=Object.fromEntries(['current-polls','historical-polls','historical-polls-2021','historical-polls-2020','pollsters','demographics'].map(name=>[name,JSON.parse(fs.readFileSync(`data/${name}.json`,'utf8'))]));
const steps=vm.runInContext(`
S.cur=fixtures['current-polls'];S.hist=fixtures['historical-polls'];S.firms=fixtures.pollsters;S.demo=fixtures.demographics;
S.elections=[2022,2021,2020].map(year=>({year,stats:scoreFirms(fixtures[year===2022?'historical-polls':'historical-polls-'+year])}));
S.stats=combineCalibrations(S.elections);S.forecastPolls=recentForForecast(S.cur.polls);S.series=buildSeries(S.forecastPolls);
window.storyStagesForAudit();`,ctx);
assert.equal(steps.length,6);
assert.equal(steps[0].right,64);assert.equal(steps[1].right,62);
for(const step of steps)assert.equal(step.right+step.left+step.other,120,`${step.title}: incomplete bloc total`);
assert(steps[2].detail.includes('סקר'));assert(steps[4].detail.includes('45'));
console.log('Passed: all six story scenes use a complete 120-seat split, including the real 2022 and Meretz counterfactual values.');
