/* Anonymous visit metrics. No IP, referrer, party selection or persistent visitor identifier. */
(() => {
  if(typeof window==='undefined'||location.protocol==='file:')return;
  const pages=new Set(['home','polls','2022','haredi','regions','demography','method','live','results']);
  const current=()=>{const p=location.hash.replace(/^#\/?/,'')||'home';return pages.has(p)?p:'home';};
  const endpoint='/api/analytics/event';
  let enabled=false, page=current(), view=crypto.randomUUID(), seq=0, seconds=0, last=performance.now(), activity=last;
  // One random id per browsing session, not a claim to count unique people.
  let session;
  try{session=sessionStorage.getItem('barometer-session')||crypto.randomUUID();sessionStorage.setItem('barometer-session',session);}catch{session=crypto.randomUUID();}
  function tick(){const now=performance.now();if(!document.hidden&&now-activity<60000)seconds+=Math.min(5,(now-last)/1000);last=now;}
  function send(){if(!enabled)return;tick();const body=JSON.stringify({session,view,page,seq:++seq,seconds:Math.round(seconds)});navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));}
  fetch('/api/analytics/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.enabled){enabled=true;seconds=0;last=performance.now();send();}}).catch(()=>{});
  ['pointerdown','keydown','scroll','pointermove'].forEach(name=>addEventListener(name,()=>{tick();activity=performance.now();},{passive:true}));
  addEventListener('hashchange',()=>{const next=current();if(next===page)return;send();page=next;view=crypto.randomUUID();seq=0;seconds=0;last=activity=performance.now();send();});
  document.addEventListener('visibilitychange',()=>{send();last=performance.now();if(!document.hidden)activity=last;});
  addEventListener('pagehide',send);setInterval(tick,1000);setInterval(send,15000);
})();
