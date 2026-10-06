/* First-party usage measurement starts only after an explicit choice. */
(() => {
  if(typeof window==='undefined'||location.protocol==='file:')return;
  const choiceKey='barometer-analytics-choice';
  const routes=new Set(['home','forecast','polls','polls/list','polls/gap','polls/channels','polls/firms','polls/parties','2022','map','haredi','demography','method','live','results']);
  const current=()=>{const route=location.hash.replace(/^#\/?/,'')||'home';return routes.has(route)?route:'home';};
  const endpoint='/api/analytics/event';
  const consent=()=>{try{return localStorage.getItem(choiceKey)==='yes'}catch{return false}};
  let enabled=false,started=false,page=current(),view='',seq=0,seconds=0,last=performance.now(),activity=last,session='';
  const notice=document.createElement('aside');
  notice.className='analytics-consent';notice.setAttribute('aria-label','בחירת מדידת שימוש');
  notice.innerHTML='<div class="analytics-consent-inner"><p>נא אשרו את מדיניות הפרטיות. <a href="privacy.html">למדיניות הפרטיות</a></p><div class="analytics-consent-actions"><button type="button" data-choice="no">לא מאשר</button><button type="button" data-choice="yes">מאשר</button></div></div>';
  const stored=()=>{try{return localStorage.getItem(choiceKey)}catch{return null}};
  notice.hidden=stored()==='yes'||stored()==='no';
  document.body.append(notice);
  notice.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
    try{localStorage.setItem(choiceKey,button.dataset.choice)}catch{}
    notice.hidden=true;
    if(button.dataset.choice==='yes')start();
  }));
  function tick(){const now=performance.now();if(!document.hidden&&now-activity<60000)seconds+=Math.min(5,(now-last)/1000);last=now;}
  function send(){if(!enabled||!consent())return;tick();const body=JSON.stringify({session,view,page,seq:++seq,seconds:Math.round(seconds)});navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));}
  function start(){
    if(started||!consent())return;
    started=true;page=current();view=crypto.randomUUID();seq=0;seconds=0;last=activity=performance.now();
    try{session=sessionStorage.getItem('barometer-session')||crypto.randomUUID();sessionStorage.setItem('barometer-session',session)}catch{session=crypto.randomUUID()}
    fetch('/api/analytics/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.enabled&&consent()){enabled=true;seconds=0;last=performance.now();send()}}).catch(()=>{});
  }
  if(consent())start();
  ['pointerdown','keydown','scroll','pointermove'].forEach(name=>addEventListener(name,()=>{if(!enabled)return;tick();activity=performance.now()},{passive:true}));
  addEventListener('hashchange',()=>{const next=current();if(next===page)return;send();page=next;view=crypto.randomUUID();seq=0;seconds=0;last=activity=performance.now();send()});
  addEventListener('storage',event=>{if(event.key!==choiceKey)return;if(!consent()){enabled=false;started=false;notice.hidden=stored()==='no'}else{notice.hidden=true;start()}});
  document.addEventListener('visibilitychange',()=>{send();last=performance.now();if(!document.hidden)activity=last});
  addEventListener('pagehide',send);setInterval(()=>{if(enabled)tick()},1000);setInterval(send,15000);
})();
