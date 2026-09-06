const names={home:'תמונת מצב',polls:'סקרים',2022:'דיוק המכונים',haredi:'תרחיש חרדי',demography:'דמוגרפיה',regions:'מפת ההצבעה',method:'שיטת החישוב',live:'ליל הבחירות',results:'תוצאות אמת'};
document.querySelector('#login').onsubmit=async e=>{
 e.preventDefault();const status=document.querySelector('#status');status.textContent='טוען…';
 try{const r=await fetch('/api/analytics/summary',{headers:{Authorization:'Bearer '+document.querySelector('#token').value},cache:'no-store'});if(!r.ok)throw Error(r.status===401?'מפתח הניהול אינו תקין':'שרת המדידה אינו פעיל בכתובת הזאת');const d=await r.json();
 document.querySelector('#stats').innerHTML=[[d.sessions,'ביקורים'],[d.views,'פתיחות דפים'],[Math.round(d.seconds/60),'דקות פעילות']].map(([v,t])=>`<div><b>${Number(v)}</b><span>${t}</span></div>`).join('');
 document.querySelector('#pages').innerHTML=d.pages.map(p=>`<tr><th>${names[p.page]||'אחר'}</th><td>${Number(p.views)}</td><td>${Number(p.sessions)}</td><td>${Math.round(p.seconds/60)} דקות</td><td>${Number(p.average)} שניות</td></tr>`).join('');
 document.querySelector('#days').innerHTML=d.days.map(p=>`<tr><td>${p.day.replace(/[^\d-]/g,'')}</td><td>${Number(p.sessions)}</td><td>${Number(p.views)}</td><td>${Math.round(p.seconds/60)}</td></tr>`).join('');status.textContent=d.views?'עודכן עכשיו':'טרם נאספה פעילות. הנתונים יופיעו לאחר ביקורים באתר.';
 }catch(err){status.textContent=err.message;}
};
