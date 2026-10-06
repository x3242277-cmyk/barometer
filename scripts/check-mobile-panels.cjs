/* Exercise phone panels and inspect text against its actual card, including
   intermediate animation frames. Run with the same Playwright setup as check-mobile.cjs. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out='.mobile-audit'; fs.mkdirSync(out,{recursive:true});
const issues=[], checks=[];
let page, visit=0;
async function go(route){await page.goto((process.env.MOBILE_TEST_URL||'http://localhost:8000')+'/?mobileqa='+ (++visit) +'#/'+route);await page.waitForFunction(()=>getComputedStyle(document.querySelector('#app-loading')).display==='none');await page.waitForTimeout(300);}
async function frames(selector){
 const bad=await page.locator(selector).evaluateAll(cards=>{
  const result=[];
  for(const card of cards){
   if(!card.checkVisibility({visibilityProperty:true}))continue;
   const box=card.getBoundingClientRect(), scrollsY=['auto','scroll'].includes(getComputedStyle(card).overflowY);
   const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
   for(let text=walker.nextNode();text;text=walker.nextNode()){
    const e=text.parentElement;
    if(!text.textContent.trim()||!e.checkVisibility({visibilityProperty:true})||e.closest('svg,select,option,[aria-hidden=true],.sr-only,.ec-live,.mobile-record-table thead')||(e.closest('details:not([open])')&&!e.closest('summary')))continue;
    let scroller=false;for(let p=e;p&&p!==card;p=p.parentElement){if(['auto','scroll'].includes(getComputedStyle(p).overflowX)){scroller=true;break;}}
    if(scroller)continue;
    const range=document.createRange();range.selectNodeContents(text);
    for(const r of range.getClientRects())if(r.width>0&&(r.left<box.left-2||r.right>box.right+2||(!scrollsY&&(r.top<box.top-2||r.bottom>box.bottom+2)))){
     result.push({card:card.id||card.className,text:text.textContent.trim().slice(0,50),x:Math.round(r.left-box.left),y:Math.round(r.top-box.top)});break;
    }
   }
  }return result;
 });
 assert.equal(bad.length,0,JSON.stringify(bad.slice(0,12)));
}
async function check(name,fn){try{await fn();checks.push(name);}catch(e){issues.push(name+': '+e.message);console.log(issues.at(-1));await page.screenshot({path:out+'/panel-failure-'+issues.length+'.png'}).catch(()=>{});}}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await page.addInitScript(()=>{localStorage.setItem('barometer-analytics-choice','no');sessionStorage.setItem('modelRunSeen','1');});
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  await check(width+' forecast panels and coalition',async()=>{
   await go('forecast');await page.locator('[data-mobile-forecast=parties]').tap();await frames('.fs-side');
   await page.locator('[data-mobile-forecast=coalition]').tap();
   for(const party of await page.locator('[data-ec-party]').all())await party.tap();
   await frames('.ec-panel,.ec-party');await page.locator('.ec-reset').tap();
   await page.locator('[data-mobile-forecast=overview]').tap();assert.equal(await page.locator('.fs-center .election-visual').isVisible(),true);
  });
  await check(width+' six simulation stages and animated values',async()=>{
   await page.locator('[data-mobile-forecast=simulation]').tap();await page.locator('.ms-big-play').tap();
   await page.locator('[data-mobile-fold="simulation-results"] > summary').tap();
   for(let i=0;i<6;i++){
    await page.locator(`[data-ms-stage="${i}"]`).tap();
    for(let t=0;t<4;t++){await page.waitForTimeout(230);await frames('#ms-stage,.ms-src-row,.ms-cv-now,.ms-chip');}
    await page.locator('.ms-play').tap();
    if(width===390)await page.locator('#method-sim').screenshot({path:out+`/scene-${i}-complete.png`});
   }
   await page.locator('[data-ms-stage="5"]').tap();
   for(let t=0;t<16;t++){await page.waitForTimeout(280);await frames('#ms-stage,.ms-cv-now');}
   await page.waitForSelector('#ms-hemi:not([hidden])');
   await frames('#ms-stage');
   await page.locator('[data-mobile-forecast=overview]').tap();
  });
  await check(width+' all demographic records and live sliders',async()=>{
   await go('demography');
   for(const tab of await page.locator('[data-dm-tab]').all()){
    await tab.tap();await frames('.dm-panel:not([hidden]) .mobile-record-table tbody tr,.dm-panel:not([hidden]) .dm-lead');
   }
   await page.locator('[data-dm-tab=assume]').tap();
   for(const slider of await page.locator('#demo-controls input[type=range]').all()){
    await slider.evaluate(e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));});
   }
   await frames('#demo-controls .mobile-record-table tbody tr');
  });
  await check(width+' rankings and complete poll cards',async()=>{
   await go('2022');await frames('.acc-pod,.acc-row:not(.acc-cols)');
   await page.locator('.accuracy-open').first().tap();await frames('#dlg');await page.locator('#dlg .dclose').tap();
   await go('polls/list');await frames('.poll-result-card');
   await go('polls/crossover');await frames('.cx2 .tr-card');
  });
  await check(width+' expanded method, calculator and gap steps',async()=>{
   await go('method');
   await page.locator('#view-method .mobile-disclosure').evaluateAll(ds=>ds.forEach(d=>d.open=true));
   await frames('#view-method .msec-body');
   await page.locator('.msec-sim').nth(5).tap();await page.waitForTimeout(500);
   assert.equal(await page.locator('#ms-stage').isVisible(),true);
   await go('haredi');await frames('#haredi-calc,.h-party');
   await go('polls/gap');await page.locator('[data-gap-pick=hi]').tap();
   await page.locator('[data-gap-floor="3"]').tap();
   await frames('.gap-floor-body');
  });
  await check(width+' map panels, search and forecast assumptions',async()=>{
   await go('map');await page.waitForSelector('#r22-map svg');
   await page.locator('[data-mobile-fold="map-controls"] > summary').tap();
   for(const mode of ['cities','regions','national']){
    const button=page.locator(`#r22-side [data-mode="${mode}"]`);
    if(await button.count())await button.tap();
    for(const panel of ['map','list','detail']){
     await page.locator(`[data-mobile-map="${panel}"]`).tap();await frames('.r22-side,.r22-kpi,.r22-bars');
    }
   }
   await page.locator('#r22-years [data-year="2026"]').tap();await page.waitForTimeout(1500);
   await frames('.r22-side,.r22-kpi,.r22-bars');
  });
 }
 fs.writeFileSync(out+'/panel-checks.json',JSON.stringify({checks,issues},null,2));console.log(JSON.stringify({passed:checks.length,issues}));await browser.close();if(issues.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
