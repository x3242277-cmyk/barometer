(() => {
  const form=document.querySelector('#inline-admin');if(!form)return;
  const trigger=form.querySelector('#admin-trigger'),label=form.querySelector('#admin-password'),input=label.querySelector('input'),submit=form.querySelector('#admin-submit'),status=document.querySelector('#admin-inline-status');
  const open=()=>{trigger.hidden=true;trigger.setAttribute('aria-expanded','true');label.hidden=false;submit.hidden=false;input.disabled=false;input.focus();};
  const close=()=>{input.value='';input.disabled=true;label.hidden=true;submit.hidden=true;trigger.hidden=false;trigger.setAttribute('aria-expanded','false');status.textContent='';trigger.focus();};
  trigger.addEventListener('click',open);
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!input.value)return;submit.disabled=true;status.textContent='בודק כניסה…';
    try{
      const r=await fetch('/api/admin/session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:input.value})});
      let data={};try{data=await r.json();}catch{}
      if(!r.ok){status.textContent=r.status===503?'הכניסה לניהול עדיין לא הופעלה.':r.status===401?'סיסמה לא נכונה.':data.error||'הכניסה לא הושלמה.';input.select();return;}
      input.value='';location.assign('analytics.html');
    }catch{status.textContent='אין כרגע חיבור למערכת הניהול.';}
    finally{submit.disabled=false;}
  });
})();
