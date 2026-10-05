const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const context = vm.createContext({ console, Intl, Date, setInterval(){}, clearInterval(){} });
for (const f of ['explore.js','poll-tracker.js','polls-workspace.js','polls-gap.js','app.js']) vm.runInContext(fs.readFileSync('assets/'+f,'utf8'),context);
context.fixtures = Object.fromEntries(['current-polls','polls-archive','pollsters'].map(f=>[f,JSON.parse(fs.readFileSync('data/'+f+'.json','utf8'))]));
vm.runInContext(`S.cur=fixtures['current-polls'];S.pollsArchive=fixtures['polls-archive'];S.firms=fixtures.pollsters;`,context);
const run = source => vm.runInContext(source,context);

/* שני הקצוות: הגבוה והנמוך; בשוויון — הסקר החדש יותר */
run(`const gp = (id,date,right) => ({id,date,dateTimestamp:Date.parse(date),right});
const gpool = [gp('a','2026-10-01',60),gp('b','2026-10-02',60),gp('c','2026-09-30',49),gp('d','2026-10-03',49),gp('e','2026-10-01',55)];
const gext = gapPick(gpool,p=>p.right);`);
assert.equal(run('gext.hi.id'),'b','tie at the top must go to the newer poll');
assert.equal(run('gext.lo.id'),'d','tie at the bottom must go to the newer poll');
assert.equal(run('gpool.length'),5,'the pool must not be mutated');

/* הפירוק: מהפער הגדול לקטן, בלי רשימות שבהן אין הפרש */
const rows = run(`gapParties({parties:{likud:32,shas:10,utj:7,yesh_atid:21}},{parties:{likud:18,shas:6,utj:7,yesh_atid:22,raam:4}})`);
assert.deepEqual(Array.from(rows,r=>r.id),['likud','shas','raam','yesh_atid'],'rows must be ordered by the size of the difference');
assert.equal(rows[0].d,14,'the difference is high minus low');
assert(!rows.some(r=>r.id==='utj'),'a list with no difference must not appear');

/* ניסוח ההיסטוריה */
const sum = r => run(`gapRunsSummary(${JSON.stringify(r)})`);
assert.equal(sum([]),'אין למכון היסטוריית כיול');
assert.equal(sum([{err:-1},{err:-2},{err:-3}]),'פחות מהתוצאה בכל 3 מערכות הבחירות');
assert.equal(sum([{err:1},{err:2}]),'יותר מהתוצאה בכל 2 מערכות הבחירות');
assert.equal(sum([{err:0.5},{err:-1},{err:-2}]),'פחות מהתוצאה ב־2 מתוך 3 מערכות בחירות');

/* הסימן: מינוס אמיתי, ואפס בלי סימן */
assert.equal(run('gapSigned(-3.9)'),'−3.9');
assert.equal(run('gapSigned(0.5)'),'+0.5');
assert.equal(run('gapSigned(0)'),'0');
console.log('Passed: extremes with newest-wins ties, party differences ordered and non-zero, history wording, signed numbers.');
