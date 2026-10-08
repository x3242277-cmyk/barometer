const PARTY_BRIEFS = {
  likud:['הליכוד','מפלגה שהוקמה ב־1973 כאיחוד של תנועות ורשימות, ובהמשך הפכה למפלגה מאוחדת.'],
  shas:['מפלגת ש״ס','מפלגה חרדית ספרדית. שמה הרשמי הוא התאחדות הספרדים העולמית שומרי תורה.'],
  yahadut_hatora:['יהדות התורה','רשימה משותפת לאגודת ישראל ולדגל התורה, המייצגות קהילות חרדיות אשכנזיות.'],
  hademokratim:['הדמוקרטים','מפלגה שנוצרה מאיחוד מפלגת העבודה ומרצ.'],
  ndi:['ישראל ביתנו','מפלגה שהוקמה ב־1999 על ידי אביגדור ליברמן.'],
  ozma_yehudit:['עוצמה יהודית','מפלגה שהוקמה ב־2012, תחילה בשם עוצמה לישראל.'],
  reshima_meshutefet:['הרשימה המשותפת','מסגרת משותפת למפלגות שהוקמה לקראת בחירות 2015; הרכבה השתנה בין מערכות בחירות.'],
  yashar:['ישר!','רשימה פוליטית המזוהה עם גדי איזנקוט.'],
  beyahad:['ביחד','רשימה משותפת לבנט 2026 וליש עתיד, בראשות נפתלי בנט ויאיר לפיד.','https://www.idi.org.il/policy/parties-and-elections/parties/beyachad/'],
  ofer_vinter_party:['עמך ישראל','מפלגה בראשות עופר וינטר.','https://amchaisrael.co.il/'],
  zionut_datit:['הציונות הדתית','מפלגה דתית לאומית בראשות בצלאל סמוטריץ׳.','https://zionutdatit.org.il/על-המפלגה/'],
  raam:['United Arab List','רע״ם — הרשימה הערבית המאוחדת.','https://en.wikipedia.org/wiki/United_Arab_List']
};
function renderPartyProfile(rows) {
  const id=S.focusParty, box=$('#party-focus-summary');
  if(!id){box.hidden=true;return;}
  const values=rows.map(p=>pollValue(p,id)).filter(v=>v!==null), m=partyMeta(id), brief=PARTY_BRIEFS[id];
  box.hidden=false;
  box.innerHTML=`${S.leaders[id]?`<img class="profile-portrait" src="${esc(S.leaders[id])}" alt="איור נציגי ${esc(m.name)}">`:''}<div><p class="kicker">${esc(m.name)} · הסקרים שנבחרו</p><h2>${values.length?`<bdi dir="ltr">${Math.min(...values)}–${Math.max(...values)}</bdi> <span>מנדטים</span>`:'אין נתון בסינון הנוכחי'}</h2><p class="profile-count">ב־${values.length} סקרים בסינון הנוכחי</p>${brief?`<p>${esc(brief[1])}</p><a href="${esc(brief[2] || 'https://he.wikipedia.org/wiki/'+encodeURIComponent(brief[0]))}" target="_blank" rel="noopener">${brief[2]?'מקור ורקע על הרשימה':'רקע בוויקיפדיה'} ↗</a>`:'<p>שם והרכב הרשימה מוצגים בהתאם לסקרים.</p>'}</div>`;
}
function renderIconFilters() {
  const box=$('#icon-filters');
  const kinds=[['party','מפלגה'],['firm','מכון'],['outlet','כלי תקשורת']];
  const kind=S.iconFilter||'party', select=$('#poll-'+kind);
  box.innerHTML=`<div class="filter-modes" role="group" aria-label="סוג סינון">${kinds.map(([k,label])=>`<button type="button" data-filter-kind="${k}" aria-pressed="${kind===k}">סינון לפי ${label}</button>`).join('')}</div><div class="filter-icons" role="group" aria-label="אפשרויות סינון">${[...select.options].map(o=>{
    let logo='';
    if(kind==='party'&&o.value)logo=partyMeta(o.value).logo||S.leaders[o.value]||'';
    if(kind==='firm')logo=S.firms.firms.find(f=>f.id===o.value)?.logo||'';
    if(kind==='outlet')logo=S.firms.outletLogos[o.value]||'';
    return `<button type="button" data-filter-value="${esc(o.value)}" aria-pressed="${select.value===o.value}">${logo?`<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.hidden=true">`:`<span class="letter-icon" aria-hidden="true">${esc(o.value==='all'||!o.value?'הכל':o.text.slice(0,2))}</span>`}<span>${esc(o.text)}</span></button>`;
  }).join('')}</div>`;
}
function renderScenarioPanel(est) {
  const box=$('#scenario-panel'); if(!box)return;
  box.hidden=!est.scenario; if(!est.scenario)return;
  const t=est.scenario;
  box.innerHTML=`<p class="kicker">תרחיש הנחות</p><h3>מודל משולב לש״ס וליהדות התורה</h3><p>ש״ס ${r1(t.fixed.shas)}, יהדות התורה ${r1(t.fixed.yahadut_hatora)} לפי 25% דמוגרפיה, 25% גיאוגרפיה ו־50% סקרים מתוקנים; רע״ם לפי ממוצע הסקרים המשוקלל בלבד. יתר המפלגות מתחלקות ביתרת המנדטים לפי ממוצע המכונים המשוקלל, עם תיקון הטעות ההיסטורית בתוך כל גוש. העיגול נעשה בסוף, בחלוקת 120 המושבים ובהסכמי העודפים.</p><label>הרצפה: נקודות אחוז מתחת לממוצע המודלים<input type="range" id="scenario-deviation" min="0" max="5" step="0.1" value="${S.scenarioOptions?.deviationPoints??t.deviationPoints??0}"><output>${S.scenarioOptions?.deviationPoints??t.deviationPoints??0}</output></label><p>ההשלמה עד הרצפה: ${(t.demographic/1.2).toFixed(1)} נקודות אחוז. הסכום נשמר: 120.</p><p class="sec-note">${(t.deviationPoints??0)?`הרצפה נמוכה ב־${t.deviationPoints} נקודות אחוז מממוצע המודל הדמוגרפי והגיאוגרפי`:'הרצפה היא ממוצע המודל הדמוגרפי והגיאוגרפי'}: מאז 2020 מפלגות הקואליציה קיבלו תמיד יותר מממוצע המודלים (ב־2021 כמעט בדיוק). משלימים רק עד הרצפה, לאחר שמביאים בחשבון את תוספת החרדים נטו לגוש. הסקרים עשויים כבר לשקף שינוי דמוגרפי, ולכן השפעת התוספת תלויה בהנחות המודל. זו העברה בין משקלי רשימות, ואינה מדידה של אנשים שעברו צד. רשימות הימין המשתתפות בתוספת: הליכוד, עוצמה יהודית, הציונות הדתית, עמך ישראל ונעם; הרשימות הנגדיות: ישר!, ביחד, הדמוקרטים, ישראל ביתנו, כחול לבן והבית הציוני. ש״ס ויהדות התורה מקבלות את תוצאת המודל המשולב; רע״ם נשארת לפי הסקרים בלבד.</p><details><summary>משקל כל מכון בחישוב</summary><div class="tablewrap"><table><tr><th>מכון</th><th>משקל</th></tr>${S.series.map(s=>`<tr><td>${esc(s.meta.he||s.meta.firm||s.meta.id)}</td><td>${r1(100*firmWeight(s.meta)/S.series.reduce((n,x)=>n+firmWeight(x.meta),0))}%</td></tr>`).join('')}</table></div></details><a href="#/haredi">ההיסטוריה ובדיקת התחקיר ←</a>`;
  box.insertAdjacentHTML('beforeend','<p class="sec-note">התחזית כוללת הנחת שימור תמיכה למפלגות הקואליציה: בכל סקר שבו וינטר או הנדל/זליכה מקבלים לפחות 4 מנדטים, התמיכה שלהם נשמרת לגוש פעם אחת ומחולקת בין הליכוד, עוצמה יהודית והציונות הדתית. הסקרים המקוריים מוצגים כפי שפורסמו.</p>');
  const baseline=allocateSeats(forecast('weighted',HIDE_FROM_HOME).parties);
  box.insertAdjacentHTML('beforeend',`<div class="tablewrap"><table><caption>השוואה לממוצע הסקרים · מנדטים</caption><tr><th>מפלגה</th><th>ממוצע משוקלל</th><th>תרחיש</th><th>שינוי</th></tr>${Object.keys(est.parties).sort((a,b)=>est.parties[b]-est.parties[a]).map(id=>`<tr><th>${esc(partyMeta(id).name)}</th><td>${baseline[id]||0}</td><td>${est.parties[id]}</td><td><bdi>${est.parties[id]-(baseline[id]||0)}</bdi></td></tr>`).join('')}</table></div>`);
  $('#scenario-deviation').onchange=e=>{S.scenarioOptions={...S.scenarioOptions,deviationPoints:Number(e.target.value)};delete S.scenarioOptions.demographic;renderHome();};
}
function renderDemoComparison() {
  const order=['right','haredi','arab','center'], labels={right:'ימין',haredi:'חרדים',arab:'ערבים',center:'מרכז–שמאל'};
  const models=Array.from({length:S.demo.meta.years+1},(_,i)=>runDemoModel(i));
  const share=(m,c)=>100*(m.campVotes[c]||0)/m.campTotal;
  const column=(m,year,note)=>`<article class="year-column"><p class="kicker">${note}</p><h3>${year}</h3>${order.map(c=>`<div class="year-row"><span>${labels[c]}</span><b>${r1(share(m,c))}%</b><i style="--c:${S.demo.camps[c].color};--w:${share(m,c)}%"></i></div>`).join('')}</article>`;
  $('#demo-legend').innerHTML='';
  $('#demo-delta').innerHTML=`<h3>השינוי בחלק היחסי</h3>${order.map(c=>`<p>${labels[c]} <b dir="ltr">${r1(share(models.at(-1),c)-share(models[0],c))}</b> נקודות אחוז</p>`).join('')}<p>כל קבוצה גדלה לפי הנחותיה. ירידה בחלק היחסי אינה בהכרח ירידה במספר הקולות.</p>`;
}
function wireUpgrade() {
  document.addEventListener('click',e=>{
    const kind=e.target.closest('[data-filter-kind]');if(kind){S.iconFilter=kind.dataset.filterKind;renderIconFilters();$(`[data-filter-kind="${S.iconFilter}"]`)?.focus();}
    const value=e.target.closest('[data-filter-value]');if(value){const selected=value.dataset.filterValue,select=$('#poll-'+(S.iconFilter||'party'));select.value=selected;select.dispatchEvent(new Event('change',{bubbles:true}));$(`[data-filter-value="${CSS.escape(selected)}"]`)?.focus();}
  });
  const book='https://www.idi.org.il/media/27873/the-elections-in-israel-2022.pdf';
  const yearbook='https://www.idi.org.il/media/30357/statistical-report-on-ultra-orthodox-society-in-israel-2025-hebrew.pdf';
  $('#research-review').innerHTML=`<p>נבדקו ב־6.9.2026: המקורות עוסקים בגידול אוכלוסייה, בהצבעה ובמפלגות. הם אינם קובעים רצפה למספר המנדטים של אף רשימה, ואינם מכריעים בכמה בוחרים יכולים לעבור בין גושים.</p><ul><li><a href="${yearbook}">לי כהנר וגלעד מלאך — שנתון החברה החרדית 2025</a>: גידול אוכלוסייה שנתי של 4.2%; זה אינו כשלעצמו שיעור גידול בעלי זכות הבחירה.</li><li><a href="https://www.taubcenter.org.il/wp-content/uploads/2025/12/Demography-2025-ENG-2.pdf">אלכס וינרב — הדמוגרפיה בישראל 2025</a>: מסגרת לבחינת אוכלוסייה, פריון והגירה.</li><li><a href="${book}#page=344">נסים ליאון — ש״ס בהנהגת אריה דרעי</a>: מחקר על התפתחות המפלגה בשנים 2013–2022.</li><li><a href="${book}#page=370">גלעד מלאך — יהדות התורה וגידול האוכלוסייה</a>: בחינת הקשר בין צמיחה דמוגרפית לתוצאות המפלגה.</li><li><a href="${book}#page=114">ניר אטמור, חן פרידברג ולירן הרסגור — מי נהר לקלפיות?</a>: בחינת השתתפות בבחירות 2022.</li></ul><p>אלה מקורות רלוונטיים לנושא, והם אינם קובעים תחזית. המודל משתמש בציונים ההיסטוריים של האתר ובהנחות המוצהרות שלו, בנפרד.</p>`;
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',wireUpgrade);
