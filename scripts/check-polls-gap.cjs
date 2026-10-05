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

/* מי צדק בפעם הקודמת: כמה מדידות מתחת לתוצאה, ומי משני המכונים היה קרוב יותר */
const recRows = [
  { key: "2022", dots: [{ firm: "A", err: -2 }, { firm: "B", err: -4 }, { firm: "C", err: -3 }] },
  { key: "2021", dots: [{ firm: "A", err: -1 }, { firm: "B", err: -5 }] },
  { key: "2020", dots: [{ firm: "A", err: 0.5 }, { firm: "C", err: -1 }] }
];
const stats = JSON.parse(run(`JSON.stringify(gapRecordStats(${JSON.stringify(recRows)},"A","B"))`));
assert.equal(stats.total, 7, "every firm-election measurement is counted");
assert.equal(stats.below, 6, "only measurements below the result are counted as below");
assert.equal(stats.compared, 2, "only elections in which both firms were measured are compared");
assert.equal(stats.hiCloser, 2, "the closer firm is the one with the smaller absolute error");
assert.equal(JSON.parse(run(`JSON.stringify(gapRecordStats(${JSON.stringify(recRows)},"A","Z"))`)).compared, 0, "a firm with no record is never compared");

/* מי היה קרוב יותר — גם כשהמרחקים שווים (אף אחד לא נספר כקרוב יותר) */
const tie = JSON.parse(run(`JSON.stringify(gapRecordStats([{key:"x",dots:[{firm:"A",err:-2},{firm:"B",err:2}]}],"A","B"))`));
assert.equal(tie.hiCloser + tie.loCloser, 0, "equal distances must not be reported as one being closer");
assert.equal(stats.loCloser, 0, "the farther firm is never counted as closer");

/* הגרלה: שני סקרים שונים, ואם אפשר משני ערוצים שונים */
run(`const gsrc=[{id:"a",channelHebrewName:"X"},{id:"b",channelHebrewName:"X"},{id:"c",channelHebrewName:"Y"}];`);
for (const r of [0, 0.34, 0.67, 0.99]) {
  const pair = JSON.parse(run(`JSON.stringify(gapRandomPair(gsrc,()=>${r}))`));
  assert.notEqual(pair[0].id, pair[1].id, "a random pair must be two different polls");
  assert.notEqual(pair[0].channelHebrewName, pair[1].channelHebrewName, "a random pair must use two outlets when possible");
}
assert.equal(run("gapRandomPair([{id:\"a\",channelHebrewName:\"X\"}])"), null, "one poll cannot make a pair");

/* נקודות קרובות עוברות לנתיב אחר; רחוקות נשארות באותו נתיב */
assert.equal(JSON.stringify(run("gapLanes([10, 11, 12, 30, 31])")), "[0,1,2,0,1]", "close dots must fan out into lanes");
assert.equal(JSON.stringify(run("gapLanes([10, 10.5, 11, 11.5, 12])")), "[0,1,2,2,2]", "overflow stays in the last lane instead of adding rows");
assert.equal(JSON.stringify(run("gapLanes([5, 40, 80])")), "[0,0,0]", "far dots share a lane");

/* הסימן: מינוס אמיתי, ואפס בלי סימן */
assert.equal(run('gapSigned(-3.9)'),'−3.9');
assert.equal(run('gapSigned(0.5)'),'+0.5');
assert.equal(run('gapSigned(0)'),'0');
console.log('Passed: extremes with newest-wins ties, party differences ordered and non-zero, last-time record stats and ties, random pairs, dot lanes, signed numbers.');
