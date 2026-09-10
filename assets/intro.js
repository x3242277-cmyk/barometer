/* Presentation only: forecasts and their source data are never mutated. */
(() => {
  let frame = 0, token = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const home = document.querySelector('#view-home');
  home.dataset.stage = 'intro';
  home.insertAdjacentHTML('afterbegin', `<section id="home-intro" class="intro-shell" aria-labelledby="intro-title">
    <div class="intro-grid" aria-hidden="true"></div>
    <div class="intro-copy"><p class="intro-kicker"><i></i> ברומטר / מאחורי המספרים</p>
    <h1 id="intro-title">מהסקרים.<br>דרך הנתונים.<br><em>לתמונה הגדולה.</em></h1>
    <p class="intro-lead">כמה מנדטים יקבל כל גוש? בואו לראות איך הנתונים הופכים לתחזית — צעד אחר צעד.</p>
    <button class="intro-start" type="button">חשבו את התחזית <span>←</span></button>
    <span class="intro-duration">כ־30 שניות · אפשר לדלג בכל רגע</span>
    <p class="intro-disclosure">הנתונים, המשקלים וההנחות — הכול פתוח, שלב אחר שלב.</p></div>
    <div class="intro-visual"><div class="intro-chart-top"><span>מסקר בודד לתחזית משוקללת</span><span dir="ltr">DATA → INSIGHT</span></div>
    <svg viewBox="0 0 600 200" role="img" aria-label="איור של קווי נתונים, ללא ערכים מספריים"><path class="chart-line" d="M0 160L40 145 80 160 120 100 160 120 200 85 240 105 280 65 320 85 360 45 400 68 440 40 480 55 530 25 600 38"/><path class="chart-line second" d="M0 50L40 65 80 55 120 90 160 70 200 115 240 92 280 130 320 110 360 145 400 122 440 148 480 135 530 163 600 150"/></svg>
    <div class="intro-method"><article><b>01</b><div><h2>מודדים את המודדים</h2><p>כיול אמינות המכונים מול תוצאות האמת של 2022.</p></div></article><article><b>02</b><div><h2>נותנים לכל סקר משקל</h2><p>ממוצע לכל מכון, חלון עדכני ושקלול לפי אמינות.</p></div></article><article><b>03</b><div><h2>מרכיבים את התמונה</h2><p>הנחות תרחיש, אחוז חסימה וחלוקה ל־120 מושבים.</p></div></article></div></div>
    <div class="intro-bottom"><span id="intro-data">טוען נתונים…</span><button class="intro-skip" type="button">ישר לתוצאה ↗</button></div></section>
    <section id="intro-running" aria-label="שלבי החישוב"><div class="run-top"><span class="intro-kicker">בתוך החישוב <span id="run-step"></span></span><button class="intro-skip" type="button">דלג לתוצאה ←</button></div><div class="run-main"><div aria-live="polite" aria-atomic="true"><h2 id="run-title"></h2><p id="run-detail"></p></div><b id="run-percent" aria-hidden="true">0%</b></div><div id="run-data" class="run-data" aria-label="נתונים בשלב הנוכחי" tabindex="0"></div><div class="run-track"><i></i></div><p class="run-note">ערכי ביניים · המספרים מתעדכנים עד להשלמת החישוב</p></section>`);
  const finish = (focus = true) => { token++; cancelAnimationFrame(frame); renderHome(); home.dataset.stage = S.homeStage = 'result'; window.scrollTo({top:0,behavior:'instant'}); if(focus) { $('#verdict-head').tabIndex=-1; $('#verdict-head').focus({preventScroll:true}); } };
  const enter = () => {
    token++; cancelAnimationFrame(frame);
    if (S.view !== 'home') return;
    S.homeHistory='current'; renderHome(); window.scrollTo({top:0,behavior:'instant'});
    $('#intro-data').textContent=`עודכן ${new Date(S.cur.generatedAt).toLocaleString('he-IL')} · ${S.cur.polls.length} סקרים · ${S.series.length} מכונים בחישוב`;
    home.dataset.stage = S.homeStage = reduced.matches ? 'result' : 'intro';
  };
  function stages() {
    const simple=forecast('simple',HIDE_FROM_HOME), weighted=forecast('weighted',HIDE_FROM_HOME), final=forecast(S.mode,HIDE_FROM_HOME);
    const nat=S.regions.national;
    const counted=nat.parties.filter(p=>p.pct>=CROSS_MIN_SHARE), total=counted.reduce((n,p)=>n+p.votes,0);
    const rightIds=new Set((S.hist.blocs||BLOCS_2022).netanyahu);
    const base=100*counted.filter(p=>rightIds.has(p.id)).reduce((n,p)=>n+p.votes,0)/total;
    const shifts=S.series.map(s=>{const ids=Object.keys(s.parties).filter(id=>100*s.parties[id]/120>=CROSS_MIN_SHARE);const sum=ids.reduce((n,id)=>n+s.parties[id],0)||1;const share=100*ids.filter(id=>partyMeta(id).alignment==='Right').reduce((n,id)=>n+s.parties[id],0)/sum;return {name:s.meta.he,delta:share-base,voters:Math.abs(share-base)*total/100};}).sort((a,b)=>b.voters-a.voters);
    const wild=shifts[0];
    const dataRows = [
      S.cur.polls.map(p=>[`${p.channelHebrewName || p.sourceId} · ${heDate(parsePollDate(p))}`,p.parties.map(x=>`${x.name}: ${x.mandates}`).join(' · ')]),
      [['בעלי זכות בחירה',fmt(nat.eligible)],['מצביעים',fmt(nat.voted)],['קולות כשרים',fmt(nat.valid)],['קולות פסולים',fmt(nat.invalid)],...nat.parties.map(p=>[p.name,`${fmt(p.votes)} קולות · ${p.pct}%`])],
      S.series.map(s=>[s.meta.he,`${r1(firmScore(s.meta))} נקודות · משקל ${(firmScore(s.meta)/100).toFixed(3)}${s.meta.calibrated?'':' · ניטרלי'}`]),
      S.forecastPolls.map(p=>[p.channelHebrewName || p.sourceId,heDate(parsePollDate(p))]),
      Object.entries(simple.rawFull).map(([id,v])=>[partyMeta(id).name,`${r1(v)} מנדטים לפני חסימה`]),
      Object.entries(weighted.rawFull).map(([id,v])=>[partyMeta(id).name,`${r1(v)} מנדטים לפני חסימה`]),
      shifts.map(x=>[x.name,`${r1(x.delta)} נקודות אחוז · כ־${fmt(x.voters)} מצביעים במונחי 2022`]),
      [...S.demo.sectors.map(x=>[x.name,`${r1(x.growth*100)}% גידול שנתי · הנחת המודל הדמוגרפי הנפרד`]),['התוספת בתרחיש הראשי',final.scenario?`${r1(final.scenario.demographic)} מנדטים`:'ללא תוספת']],
      Object.entries(largestRemainder(final.parties)).map(([id,v])=>[partyMeta(id).name,`${v} מנדטים`])
    ];
    const steps = [
      ['טוענים את נתוני הסקרים',`${S.cur.polls.length} סקרים · skarim.org · ${[...new Set(S.cur.polls.map(p=>p.channelHebrewName).filter(Boolean))].join(' · ')}`,null],
      ['חוזרים לתוצאות האמת',`${fmt(nat.valid)} קולות כשרים · ${nat.turnout}% הצבעה · ${nat.source.name}`,null],
      ['מכיילים את אמינות המכונים',S.series.map(s=>`${s.meta.he}: ${r1(firmScore(s.meta))}${s.meta.calibrated?'':' (משקל ניטרלי)'}`).join(' · '),null],
      ['בוחרים את חלון הנתונים',`${S.forecastPolls.length} מתוך ${S.cur.polls.length} סקרים · ${S.series.length} מכונים. חלון של ${FORECAST_MAX_AGE_DAYS} ימים; כשאין שלושה מכונים, משתמשים בחלון המלא.`,null],
      ['מתחילים מממוצע פשוט','משקל שווה לכל מכון, לאחר מיצוע הסקרים שלו. המספרים מציגים תמיכה במונחי מנדטים לפני חסימה ועיגול.',simple.rawFull],
      ['משקללים לפי אמינות','ציון האמינות של כל מכון קובע את משקלו. ערכי הביניים יכולים לעלות וגם לרדת.',weighted.rawFull],
      ['בוחנים את הפער בין הגושים',wild?`${wild.name}: פער שקול לכ־${fmt(wild.voters)} מצביעים מול 2022 (${r1(Math.abs(wild.delta))} נקודות אחוז). זו השוואה חשבונית, לא מדידה של מעבר מצביעים ולא הוכחה לטעות בסקר.`:'אין נתונים להשוואה.',weighted.rawFull],
      ['מוסיפים את הנחות התרחיש',final.scenario?`תוספת דמוגרפית במודל: ${r1(final.scenario.demographic)} מנדטים · עוגן 2022: ${r1(final.scenario.anchor)} · ש״ס ${final.parties.shas}, יהדות התורה ${final.parties.yahadut_hatora}. אלה הנחות התרחיש המשמשות בתחזית.`:'במצב משוקלל אמינות לא מופעלות הנחות התרחיש.',final.parties],
      ['אחוז החסימה. התמונה הסופית.',`סף של ${nat.threshold}% וחלוקה ל־120 מושבים. ${Object.entries(final.below).map(([id,v])=>`${partyMeta(id).name}: ${r1(v)}%`).join(' · ')}`,largestRemainder(final.parties)]
    ];
    return steps.map((step,i)=>[...step,dataRows[i]]);
  }
  $('.intro-start').addEventListener('click',()=>{
    if(reduced.matches) return finish();
    const steps=stages(), mine=++token, start=performance.now(); let active=-1, previous={}, transition=0;
    home.dataset.stage=S.homeStage='running';
    const cards=$$('.hcard',home); cards.forEach(c=>{$('.hcard-seat',c).textContent='—';c.disabled=true;c.setAttribute('aria-label',partyMeta(c.dataset.focusParty).name+' — ערך ביניים');});
    $('#intro-running .intro-skip').focus({preventScroll:true});
    function tick(now){
      if(mine!==token)return;
      const elapsed=now-start, idx=Math.min(steps.length-1,Math.floor(elapsed/(30000/steps.length)));
      if(elapsed>=30000)return finish();
      if(idx!==active){ previous=Object.fromEntries(cards.map(c=>[c.dataset.focusParty,parseFloat($('.hcard-seat',c).textContent)||0]));active=idx;transition=now;$('#run-title').textContent=steps[idx][0];$('#run-detail').textContent=steps[idx][1];$('#run-data').innerHTML=steps[idx][3].map(([name,value])=>'<div><b>'+esc(name)+'</b><span>'+esc(value)+'</span></div>').join('');$('#run-step').textContent=`/ ${idx+1} מתוך ${steps.length}`; }
      const progress=elapsed/30000*100;$('#run-percent').textContent=`${Math.floor(progress)}%`;$('.run-track i').style.width=`${progress}%`;
      const values=steps[idx][2], t=Math.min(1,(now-transition)/900), eased=1-Math.pow(1-t,3);
      if(values)cards.forEach(c=>{const id=c.dataset.focusParty;$('.hcard-seat',c).textContent=(previous[id]+((values[id]||0)-previous[id])*eased).toFixed(idx===steps.length-1&&t===1?0:1);});
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  });
  $$('.intro-skip').forEach(b=>b.addEventListener('click',()=>finish()));
  document.addEventListener('barometer:view',enter);
  document.addEventListener('click',e=>{const a=e.target.closest('a[href="#/"]');if(a&&S.cur&&S.view==='home')enter();});
  reduced.addEventListener('change',()=>{if(reduced.matches&&S.cur&&S.view==='home')finish(false);});
  window.addEventListener('beforeprint',()=>{if(S.cur&&S.view==='home')finish(false);});
  const controls=$('.home-forecast-controls');
  controls.insertAdjacentHTML('beforeend','<div class="intro-result-links"><a href="#/method">לשיטת החישוב</a><button type="button" id="intro-replay">חישוב מחדש ↻</button></div>');
  $('#intro-replay').addEventListener('click',enter);
})();
