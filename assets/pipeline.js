/* An inline, six-step explanation of the actual forecast calculations. */
(() => {
  const labels=['2022','מרצ עוברת','סקר אחד','ממוצע','דיוק המכונים','התחזית'];
  const duration=8500;
  let root,steps=[],at=0,elapsed=0,last=0,raf=0,playing=false,started=false,observed=false;
  const q=s=>root.querySelector(s);
  const rightIds=new Set(['Right','Haredi']);
  function blocValues(parties,historical=false){
    let right=0,left=0,other=0;
    for(const [id,seats] of Object.entries(parties)){
      const bloc=historical?(S.hist.blocs.netanyahu.includes(id)?'Right':'Left'):partyMeta(id).alignment;
      if(rightIds.has(bloc))right+=seats;else if(['Left','Arabs'].includes(bloc))left+=seats;else other+=seats;
    }
    return {right,left,other};
  }
  function buildSteps(){
    const poll=S.forecastPolls[Math.floor(Math.random()*S.forecastPolls.length)];
    const pollParties=Object.fromEntries(poll.parties.map(p=>[p.id,p.mandates]));
    const simple=forecast('simple',HIDE_FROM_HOME),weighted=forecast('weighted',HIDE_FROM_HOME),scenario=forecast('scenario',HIDE_FROM_HOME);
    const firms=S.series.length,featured=firmOf(poll.sourceId).meta;
    return [
      {title:'מה קרה ב־2022?',caption:'תוצאות אמת',detail:'זו נקודת המוצא. גוש הימין והחרדים קיבל 64 מנדטים.',...blocValues(S.hist.actual,true),key:'64',keyLabel:'מנדטים לימין ולחרדים',link:'#/map',linkLabel:'לתוצאות הבחירות'},
      {title:'מה אם מרצ הייתה עוברת?',caption:'בדיקת תרחיש קצה',detail:'בתחשיב ההיפותטי מרצ עוברת את אחוז החסימה. מאזן הגושים משתנה ל־62 מול 58.',...blocValues(COUNTERFACTUAL,true),key:'62 : 58',keyLabel:'בתרחיש מרצ',link:'#/2022',linkLabel:'לבדיקת התרחיש'},
      {title:'מה אומר סקר אחד?',caption:`${poll.channelHebrewName} · ${poll.date}`,detail:`הנה סקר של ${featured.he}. סקר יחיד נותן צילום רגעי; מיד נראה מה קורה כשמחברים את המדידות.`,...blocValues(pollParties),key:poll.channelHebrewName,keyLabel:featured.he,link:poll.sourceUrl||'#/polls',linkLabel:'לסקר המקורי'},
      {title:'מה מראה הממוצע?',caption:`${firms} מכונים בחישוב`,detail:'ממצעים את הסקרים בתוך כל מכון, ואז נותנים לכל מכון חלק שווה.',...blocValues(allocateSeats(simple.parties)),key:String(firms),keyLabel:'מכונים בחישוב',link:'#/polls',linkLabel:'לסקרים ולממוצע'},
      {title:'למי נותנים יותר משקל?',caption:'דירוג לפי בחירות קודמות',detail:'דיוק המכונים בעבר קובע את מדרגת המשקל שלהם: 45, 35 או 20. כך מתקבל הממוצע המשוקלל.',...blocValues(allocateSeats(weighted.parties)),key:'45 · 35 · 20',keyLabel:'יחסי המשקל לפי דרגה',link:'#/2022',linkLabel:'לציוני המכונים'},
      {title:'מה משתנה בתחזית הברומטר?',caption:'בדיקת דמוגרפיה ואחוז חסימה',detail:'בודקים את השפעת אחוז החסימה, משווים ל־2022 ומתקנים את ההנחה הדמוגרפית לפי גידול והצבעה בכל אוכלוסייה.',...blocValues(allocateSeats(scenario.parties)),key:'120',keyLabel:'מנדטים בתחזית',link:'#/method',linkLabel:'לכל שיטת החישוב'}
    ];
  }
  function renderStep(n,user=false){
    at=n;elapsed=0;
    if(user)pause();
    const step=steps[n];
    q('.story-count').textContent=`${n+1} / ${steps.length}`;
    q('.story-kicker').textContent=step.caption;
    q('.story-title').textContent=step.title;
    q('.story-description').textContent=step.detail;
    q('.story-key').textContent=step.key;
    q('.story-key-label').textContent=step.keyLabel;
    const link=q('.story-link');link.href=step.link;link.textContent=step.linkLabel+' ↗';link.target=step.link.startsWith('http')?'_blank':'';link.rel=step.link.startsWith('http')?'noopener':'';
    q('.story-other').textContent=step.other?`${step.other} מנדטים ברשימות ללא שיוך לגוש מוצגים בנפרד.`:'שני הגרפים יחד מציגים את כל 120 המנדטים.';
    for(const [bloc,value] of [['right',step.right],['left',step.left]]){
      q(`.story-${bloc} .story-number`).textContent=value;
      q(`.story-${bloc} .story-bar-fill`).style.width=`${Math.min(100,value/70*100)}%`;
    }
    root.querySelectorAll('[data-story-step]').forEach((button,i)=>{button.classList.toggle('on',i===n);button.setAttribute('aria-current',i===n?'step':'false');});
    q('.story-prev').disabled=n===0;q('.story-next').disabled=n===steps.length-1;
    q('.story-progress-fill').style.width='0%';updatePlay();
  }
  function updatePlay(){const b=q('.story-play');b.textContent=playing?'השהיה':'הפעלה';b.setAttribute('aria-pressed',String(playing));}
  function pause(){playing=false;updatePlay();}
  function tick(now){if(!root)return;const delta=Math.min(100,now-last||0);last=now;
    if(playing&&!document.hidden){elapsed+=delta;if(elapsed>=duration){if(at<steps.length-1)renderStep(at+1);else{elapsed=duration;pause();}}}
    q('.story-progress-fill').style.width=`${elapsed/duration*100}%`;
    raf=requestAnimationFrame(tick);
  }
  function init(){
    if(root||!S.cur||!S.forecastPolls?.length)return;
    root=document.querySelector('#home-story');if(!root)return;
    steps=buildSteps();
    const participants=S.series.map(s=>`<span class="story-source"><b>${esc(s.meta.he)}</b><small>${[...new Set(s.polls.map(p=>p.channelHebrewName))].map(esc).join(' · ')}</small></span>`).join('');
    root.innerHTML=`<div class="story-head"><div><p class="kicker">מאחורי תמונת המצב</p><h2>כך נבנית התמונה הגדולה</h2><p>שש בדיקות, מאותם נתונים ועד לתחזית. בכל שלב רואים מה השתנה בגושים.</p></div><span class="story-count"></span></div>
      <nav class="story-steps" aria-label="שלבי ההסבר">${labels.map((label,i)=>`<button type="button" data-story-step="${i}"><span>0${i+1}</span>${label}</button>`).join('')}</nav>
      <div class="story-layout"><div class="story-narrative" aria-live="polite"><p class="story-kicker"></p><h3 class="story-title"></h3><p class="story-description"></p><div class="story-stat"><b class="story-key"></b><span class="story-key-label"></span></div><a class="story-link" href="#/method"></a></div>
      <div class="story-graphs" aria-label="מאזן הגושים"><div class="story-graph story-right"><div><span>ימין וחרדים</span><b class="story-number"></b></div><div class="story-bar"><i class="story-bar-fill"></i><span class="story-majority" aria-label="קו הרוב: 61"></span></div></div><div class="story-graph story-left"><div><span>מרכז־שמאל וערבים</span><b class="story-number"></b></div><div class="story-bar"><i class="story-bar-fill"></i><span class="story-majority" aria-label="קו הרוב: 61"></span></div></div><p class="story-scale">אותו סולם בשני הגרפים · הקו מסמן 61 מנדטים</p><p class="story-other"></p></div></div>
      <div class="story-controls"><button type="button" class="story-prev">→ קודם</button><button type="button" class="story-play" aria-pressed="false">הפעלה</button><button type="button" class="story-next">הבא ←</button><div class="story-progress" aria-hidden="true"><i class="story-progress-fill"></i></div></div>
      <details class="story-sources"><summary>הערוצים והמכונים שבחישוב הנוכחי</summary><div>${participants}</div></details><a class="story-method-link" href="#/method">השיטה המלאה והמקורות ↗</a>`;
    root.querySelectorAll('[data-story-step]').forEach((button,i)=>button.onclick=()=>renderStep(i,true));
    q('.story-prev').onclick=()=>renderStep(Math.max(0,at-1),true);q('.story-next').onclick=()=>renderStep(Math.min(steps.length-1,at+1),true);
    q('.story-play').onclick=()=>{if(at===steps.length-1&&elapsed>=duration)renderStep(0);playing=!playing;updatePlay();};
    q('.story-sources').addEventListener('toggle',e=>{if(e.target.open)pause();});
    renderStep(0);raf=requestAnimationFrame(tick);
    if('IntersectionObserver' in window){new IntersectionObserver(entries=>{if(!observed&&entries[0].isIntersecting){observed=true;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){playing=true;updatePlay();}}},{root:document.querySelector('#view-home'),threshold:.45}).observe(root);}
  }
  window.initPipelineStory=init;
  if(S.cur) init();
  document.addEventListener('click',e=>{if(!e.target.closest('[data-open-show]'))return;e.preventDefault();init();document.querySelector('#home-method-section')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});if(root){renderStep(0);playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;updatePlay();}});
})();
