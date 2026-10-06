/* Run with Playwright available (PLAYWRIGHT_MODULE may point to a bundled copy).
   Uses the local dev server. No live data is changed by these checks. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.MOBILE_TEST_URL || 'http://localhost:8000';
const routes = ['', 'forecast', 'forecast/coalition', 'polls', 'polls/list', 'polls/channels', 'polls/firms', 'polls/parties', 'polls/gap', 'polls/crossover', '2022', 'demography', 'map', 'method', 'haredi', 'live', 'results'];
const out = path.resolve('.mobile-audit'); fs.mkdirSync(out,{recursive:true});
const issues = [], checks = [];
let page;
async function check(name, fn) {
 if(process.env.MOBILE_ACTIONS_ONLY && /px /.test(name))return;
 try { await fn(); checks.push(name); }
 catch(e) { issues.push(`${name}: ${e.message}`); await page.screenshot({path:path.join(out,'failure-'+issues.length+'.png')}).catch(()=>{}); }
}
async function go(route) {
 await page.goto(`${base}/#/${route}`);
 await page.waitForFunction(()=>document.querySelector('#app-loading')?.hidden || getComputedStyle(document.querySelector('#app-loading')).display==='none');
 await page.waitForTimeout(route==='map'?1200:250);
}
async function fits(selector) {
 const problems = await page.locator(selector).evaluateAll(elements=>elements.filter(e=>{
  if(!e.checkVisibility({visibilityProperty:true}))return false;
  const r=e.getBoundingClientRect();return r.left < -1 || r.right>innerWidth+1;
 }).map(e=>e.id||e.className?.baseVal||e.className));
 assert.deepEqual(problems,[],`content outside viewport: ${problems.join(',')}`);
}
(async()=>{
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
 page = await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('barometer-analytics-choice','no');sessionStorage.setItem('modelRunSeen','1');});
 for(const width of [320,360,390,430,768,1366]) {
  await page.setViewportSize({width,height:width===1366?768:844});
  for(const route of routes) await check(`${width}px ${route||'landing'}`,async()=>{
   await go(route);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'horizontal page scroll');
   await fits('.view.on > .wrap, .masthead-in, .view.on .acc-row');
   if(width===390)await page.screenshot({path:path.join(out,(route||'landing').replaceAll('/','-')+'-verified.png')});
  });
 }
 await page.setViewportSize({width:390,height:844});
 await check('navigation: open, focus, close, route',async()=>{
  await go(''); await page.locator('.mobile-menu-toggle').tap();
  assert.equal(await page.locator('#mobile-menu').evaluate(e=>e.open),true);
  assert.equal(await page.evaluate(()=>document.querySelector('#mobile-menu').contains(document.activeElement)),true);
  assert.equal(await page.locator('#mobile-menu').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(13, 32, 52)','menu background contrast');
  await fits('#mobile-menu');
  await page.screenshot({path:path.join(out,'menu-verified.png')});
  await page.locator('#mobile-menu a[href="#/map"]').tap();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#mobile-menu').evaluate(e=>e.open),false);
  assert.equal(await page.locator('#view-map').evaluate(e=>e.classList.contains('on')),true);
  await page.locator('.mobile-menu-toggle').tap();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('.mobile-menu-toggle').getAttribute('aria-expanded')==='false');
 });
 await check('forecast modes, history, party sheet',async()=>{
  await go('forecast');assert.equal(await page.locator('.fs-run').count(),0);
  await page.locator('.home-switch [data-mode="weighted"]').tap();
  assert.equal(await page.locator('.home-switch [data-mode="weighted"]').getAttribute('aria-pressed'),'true');
  await page.locator('.home-switch [data-mode="scenario"]').tap();
  const options=await page.locator('#home-history option').evaluateAll(xs=>xs.map(x=>x.value));
  if(options.length>1){await page.locator('#home-history').selectOption(options[1]);await page.locator('#home-history').selectOption('current');}
  await page.locator('[data-mobile-forecast="parties"]').tap();
  await page.locator('.fs-row').first().tap();
  await page.waitForTimeout(200);assert.equal(await page.locator('#view-polls').evaluate(e=>e.classList.contains('on')),true);
  assert.match(await page.locator('#poll-tracker .ex-key').first().textContent(),/הליכוד/);
 });
 await check('coalition selection, live total, reset',async()=>{
  await go('forecast/coalition');
  const buttons=page.locator('[data-ec-party]');
  const mandates=await buttons.first().evaluate(e=>Number(e.querySelector('.ec-party-seats').textContent));
  await buttons.first().tap();
  assert.equal(await page.locator('.ec-total').textContent(),String(mandates));
  assert.match(await page.locator('.ec-mobile-total').textContent(),new RegExp(`^${mandates} / 61`));
  await page.locator('.ec-reset').tap();assert.equal(await page.locator('.ec-total').textContent(),'0');
 });
 await check('poll explorer filters preserve state, chart/table, touch tooltip',async()=>{
  await go('polls');
  await page.locator('[data-mobile-fold="explorer"] > summary').tap();
  await fits('.ex-pickers,.ex-picker,.ex-picker-icons');
  await page.locator('[data-ex-src="baro"]').tap();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-mobile-fold="explorer"]').evaluate(e=>e.open),true);
  assert.equal(await page.locator('[data-ex-src="baro"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-ex-sub="likud"]').tap();await page.waitForTimeout(100);
  await page.locator('[data-mobile-fold="explorer"] > summary').tap();
  await page.locator('[data-ex-view="table"]').tap();assert.equal(await page.locator('.ex-data-table').isVisible(),true);
  await page.locator('[data-ex-view="chart"]').tap();
  await page.locator('.tr-hit').tap();assert.equal(await page.locator('.tr-tip').isVisible(),true);
  await page.screenshot({path:path.join(out,'poll-chart-verified.png')});
 });
 await check('poll list cards, table, expanded poll sheet',async()=>{
  await go('polls/list');
  await page.locator('[data-pollview="table"]').tap();assert.equal(await page.locator('#polls-table').isVisible(),true);
  await page.locator('[data-pollview="cards"]').tap();
  await fits('#polls-cards .poll-result-card');
  await go('polls');
  const detail=page.locator('#polls-feed-list .feed-item').first();
  if(await detail.count() && !await detail.evaluate(e=>e.open))await detail.locator('summary').tap();
  const enlarge=page.locator('.polls-feed [data-feed-poll]').first();
  await enlarge.tap();await fits('#poll-gallery');assert.equal(await page.locator('#poll-gallery').evaluate(e=>e.open),true);
  await page.screenshot({path:path.join(out,'poll-sheet-verified.png')});await page.locator('[data-gallery-close]').tap();
 });
 await check('accuracy ranking and detail sheet',async()=>{
  await go('2022');await fits('#rank-list .acc-row,#rank-list .accuracy-contributions');
  await page.locator('.accuracy-open').first().tap();
  assert.equal(await page.locator('#dlg').evaluate(e=>e.open),true);await fits('#dlg');
  await page.screenshot({path:path.join(out,'accuracy-sheet-verified.png')});await page.locator('#dlg .dclose').tap();
 });
 await check('demography: every tab and assumption slider',async()=>{
  await go('demography');
  for(const tab of await page.locator('[data-dm-tab]').all()){
   const panel=await tab.getAttribute('aria-controls');await tab.tap();assert.equal(await page.locator('#'+panel).isVisible(),true);
   await fits('#'+panel);
  }
  await page.locator('[data-dm-tab="assume"]').tap();
  const sliders=page.locator('#dm-p-assume input[type="range"]');assert.ok(await sliders.count());
  await sliders.first().evaluate(e=>{e.value=Number(e.value)+Number(e.step||1);e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(100);assert.ok(await page.locator('#dm-verdict').textContent());
 });
 await check('map: modes, search, filters, panels and zoom',async()=>{
  await go('map');await page.waitForSelector('#r22-map svg');
  await page.locator('#r22-side [data-mode="cities"]').tap();
  await page.locator('[data-mobile-fold="map-controls"] > summary').tap();
  await page.locator('#r22-find').fill('ירושלים');await page.locator('#r22-find').dispatchEvent('change');
  await page.waitForTimeout(150);assert.match(await page.locator('#r22-kpi').textContent(),/ירושלים/);
  await page.locator('[data-mobile-map="list"]').tap();assert.equal(await page.locator('.r22-table').isVisible(),true);
  await page.locator('[data-mobile-map="detail"]').tap();assert.equal(await page.locator('.r22-bars').isVisible(),true);
  await page.locator('[data-mobile-map="map"]').tap();await page.waitForTimeout(300);
  const old=await page.locator('#r22-map svg').getAttribute('viewBox');
  await page.locator('[data-zoom="in"]').tap();assert.notEqual(await page.locator('#r22-map svg').getAttribute('viewBox'),old);
  await page.locator('[data-zoom="reset"]').tap();
  await page.locator('.mobile-map-pan').tap();assert.equal(await page.locator('.mobile-map-pan').getAttribute('aria-pressed'),'true');
  await page.locator('.mobile-map-pan').tap();
  await page.screenshot({path:path.join(out,'map-controls-verified.png')});
 });
 await check('map: forecast year and assumptions',async()=>{
  await page.locator('#r22-years [data-year="2026"]').tap();await page.waitForTimeout(1600);
  assert.match(await page.locator('#r22-heading').textContent(),/2026/);
  const sliders=page.locator('#r22-side input[type="range"]');assert.ok(await sliders.count());
  await sliders.first().evaluate(e=>{e.value=Number(e.value)+1;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(150);await fits('#r22-side');
 });
 await check('map: touch drag and pinch, cancellation recovery',async()=>{
  await go('map');await page.locator('.mobile-map-pan').tap();
  await page.locator('#r22-map').scrollIntoViewIfNeeded();
  const cdp=await context.newCDPSession(page), box=await page.locator('#r22-map svg').boundingBox();
  const old=await page.locator('#r22-map svg').getAttribute('viewBox');
  const x=box.x+box.width*.5,y=box.y+box.height*.5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y},{x:x+30,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-55,y},{x:x+55,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await page.locator('#r22-map svg').getAttribute('viewBox'),old);
  assert.equal(await page.locator('#r22-map').evaluate(e=>e.classList.contains('dragging')),false);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+20,y:y+20}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await page.locator('#r22-map').evaluate(e=>e.classList.contains('dragging')),false);
  await cdp.detach();await page.locator('.mobile-map-pan').tap();
 });
 await check('simulation: all six stages fit the phone and can be paused',async()=>{
  await go('forecast');await page.locator('[data-mobile-forecast="simulation"]').tap();await page.locator('#method-sim .ms-big-play').tap();
  for(let i=0;i<6;i++){
   await page.locator(`[data-ms-stage="${i}"]`).tap();await page.waitForTimeout(150);
   await page.locator('.ms-play').tap();
   await fits('#ms-stage,.ms-sec-row,.ms-wf-row,.ms-src-row,.ms-pl-row,.ms-cl');
   await page.locator('#method-sim').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`simulation-${i}-verified.png`)});
  }
 });
 await check('poll gap: select a poll and reveal its explanation',async()=>{
  await go('polls/gap');await page.locator('[data-gap-pick="hi"]').tap();
  await page.waitForTimeout(150);await fits('.gap-floor-body,.gap-poll');
  const steps=page.locator('[data-gap-floor]').filter({visible:true});
  if(await steps.count()){await steps.first().tap();await page.waitForTimeout(100);await fits('.gap-floor-body');}
 });
 await check('haredi: editable assumptions and reset',async()=>{
  await go('haredi');
  const start=await page.locator('#har-growth').inputValue();
  await page.locator('#har-growth').evaluate(e=>{e.value=Number(e.value)+1;e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.notEqual(await page.locator('#har-growth').inputValue(),start);
  await page.locator('#har-reset').tap();assert.equal(await page.locator('#har-growth').inputValue(),start);
  await fits('#haredi-calc');
 });
 await check('mobile menu has no print action',async()=>{
  await go('forecast');await page.locator('.mobile-menu-toggle').tap();
  assert.equal(await page.locator('#mobile-menu button.mobile-menu-link').count(),0);
  assert.equal(await page.locator('#mobile-menu').getByText('הדפסה').count()+await page.locator('#mobile-menu').getByText('הדפסת').count(),0);
  await page.locator('.mobile-menu-close').tap();
 });
 await check('simulation fits one phone screen in every stage',async()=>{
  await go('forecast');await page.locator('[data-mobile-forecast=simulation]').tap();await page.waitForTimeout(300);
  // The start button pulses, so Playwright never sees it as stable for a tap.
  await page.evaluate(()=>document.querySelector('#method-sim .ms-big-play')?.click());
  await page.waitForTimeout(300);
  for(let i=0;i<6;i++){
   await page.locator('#method-sim [data-ms-stage]').nth(i).tap();await page.waitForTimeout(2500);
   const r=await page.evaluate(()=>{const st=document.querySelector('#ms-stage'),box=document.querySelector('#method-sim .ms-stagebox').getBoundingClientRect();return {over:st.scrollHeight-st.clientHeight,bottom:box.bottom,h:innerHeight};});
   assert.ok(r.over<=1&&r.bottom<=r.h,`stage ${i+1}: ${JSON.stringify(r)}`);
  }
 });
 await check('landscape phone: navigation and map panels',async()=>{
  await page.setViewportSize({width:844,height:390});await go('map');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.locator('.mobile-menu-toggle').tap();await fits('#mobile-menu');
  await page.locator('.mobile-menu-close').tap();
  await page.setViewportSize({width:390,height:844});
 });
 await check('standalone info and management screens',async()=>{
  for(const file of ['about.html','privacy.html','analytics.html']){
   await page.goto(`${base}/${file}`);await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,file+' overflow');
   await page.screenshot({path:path.join(out,file.replace('.html','')+'-verified.png')});
  }
 });
 await check('management: mobile form and review with isolated test data',async()=>{
  const parties=[...new Map(JSON.parse(fs.readFileSync('data/current-polls.json','utf8')).polls.flatMap(p=>p.parties).map(p=>[p.id,{id:p.id,name:p.name}])).values()];
  await page.route('**/api/admin/**',route=>route.fulfill({json:{generatedAt:new Date().toISOString(),latestPollDate:'2026-10-05',outlets:{channel_12:{outlet:'חדשות 12',firm:'midgam'}},firms:[{id:'midgam',he:'מדגם'}],parties}}));
  await page.route('**/api/analytics/summary',route=>route.fulfill({json:{sessions:12,views:34,seconds:600,pages:[{page:'forecast',views:34,sessions:12,seconds:600,average:18}],days:[]}}));
  await page.goto(`${base}/analytics.html`);await page.waitForSelector('#dashboard:not([hidden])');
  await page.locator('#entry-source').selectOption('channel_12');
  await page.locator('#entry-url').fill('https://example.test/poll');
  await page.locator('#party-inputs input').first().fill('120');
  await page.locator('#review-entry').tap();assert.equal(await page.locator('#review').isVisible(),true);
  await page.screenshot({path:path.join(out,'management-review-verified.png')});
  await page.locator('#edit-entry').tap();assert.equal(await page.locator('#poll-form').isVisible(),true);
  await fits('.admin-card,.admin-fields,.party-inputs');
  await page.setViewportSize({width:320,height:844});await fits('.admin-card,.admin-fields,.party-inputs');
  await page.screenshot({path:path.join(out,'management-form-verified.png')});
  await page.unroute('**/api/admin/**');await page.unroute('**/api/analytics/summary');
 });
 assert.deepEqual(errors,[],'browser errors');
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,issues,errors},null,2));
 console.log(JSON.stringify({passed:checks.length,issues,errors}));
 await browser.close();if(issues.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
