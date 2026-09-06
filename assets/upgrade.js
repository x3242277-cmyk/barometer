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
  box.innerHTML=`${S.leaders[id]?`<img class="profile-portrait" src="${esc(S.leaders[id])}" alt="איור נציגי ${esc(m.name)}">`:''}<div><p class="kicker">${esc(m.name)} · הסקרים שנבחרו</p><h2>${values.length?`<bdi dir="ltr">${Math.min(...values)}–${Math.max(...values)}</bdi> <span>מנדטים</span>`:'אין נתון בסינון הנוכחי'}</h2><p class="profile-count">ב־${values.length} סקרים בסינון הנוכחי</p>${brief?`<p>${esc(brief[1])}</p><a href="${esc(brief[2] || 'https://he.wikipedia.org/wiki/'+encodeURIComponent(brief[0]))}" target="_blank" rel="noopener">${brief[2]?'מקור ורקע על הרשימה':'רקע בוויקיפדיה'} ↗</a>`:'<p>שם והרכב הרשימה כפי שמופיעים בסקרים. תקציר אנציקלופדי מאומת טרם צורף.</p>'}</div>`;
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
  box.innerHTML=`<p class="kicker">תרחיש הנחות · אינו תחזית מאומתת</p><h3>19 מנדטים קבועים. 101 לפי הסקרים וההנחות.</h3><p>ש״ס 11 ויהדות התורה 8. שאר המפלגות מחולקות לפי ממוצע המכונים המשוקלל בציון ההיסטורי שבאתר, ואז מוחלים התיקונים הבאים. לא הוכח שההנחות משפרות חיזוי.</p><div class="grid g2"><label>קירוב למאזן 2022 (64 לרשימות הגוש דאז)<input type="range" id="scenario-blend" min="0" max="100" step="5" value="${t.blend*100}"><output>${Math.round(t.blend*100)}% מהפער</output></label><label>תוספת דמוגרפית משוערת לגוש, במנדטים<input type="range" id="scenario-demographic" min="-6" max="6" step="0.25" value="${S.scenarioOptions?.demographic??2}"><output>${S.scenarioOptions?.demographic??2}</output></label></div><p>הקירוב שינה ${r1(t.anchor)} מנדטים; ההנחה הדמוגרפית שינתה ${r1(t.demographic)}. הסכום נשמר: 120.</p><p class="sec-note">ברירות המחדל 50% ו־2 הן הנחות תרחיש, לא אומדנים ממחקר. הסקרים עשויים כבר לכלול שינוי דמוגרפי, ולכן קיימת אפשרות לספירה כפולה. ההעברה היא בין משקלי רשימות, ואינה עדות למעבר אנשים. ברשימות העוגן: ליכוד, עוצמה יהודית, ציונות דתית, עמך ישראל ונעם; מקורות/יעדים נגדיים: ישר, ביחד, הדמוקרטים, ישראל ביתנו, כחול לבן והבית הציוני. ש״ס ויהדות התורה נשארות קבועות.</p><details><summary>משקל כל מכון בחישוב</summary><div class="tablewrap"><table><tr><th>מכון</th><th>משקל</th></tr>${S.series.map(s=>`<tr><td>${esc(s.meta.he||s.meta.firm||s.meta.id)}</td><td>${r1(100*firmScore(s.meta)/S.series.reduce((n,x)=>n+firmScore(x.meta),0))}%</td></tr>`).join('')}</table></div></details><a href="#/haredi">ההיסטוריה ובדיקת התחקיר ←</a>`;
  const baseline=largestRemainder(est.raw);
  box.insertAdjacentHTML('beforeend',`<div class="tablewrap"><table><caption>השוואה לממוצע הסקרים · מנדטים</caption><tr><th>מפלגה</th><th>ממוצע משוקלל</th><th>תרחיש</th><th>שינוי</th></tr>${Object.keys(est.parties).sort((a,b)=>est.parties[b]-est.parties[a]).map(id=>`<tr><th>${esc(partyMeta(id).name)}</th><td>${baseline[id]||0}</td><td>${est.parties[id]}</td><td><bdi>${est.parties[id]-(baseline[id]||0)}</bdi></td></tr>`).join('')}</table></div>`);
  $('#scenario-blend').onchange=e=>{S.scenarioOptions={...S.scenarioOptions,blend:Number(e.target.value)/100};renderHome();};
  $('#scenario-demographic').onchange=e=>{S.scenarioOptions={...S.scenarioOptions,demographic:Number(e.target.value)};renderHome();};
}
function renderDemoComparison() {
  const order=['right','haredi','arab','center'], labels={right:'ימין',haredi:'חרדים',arab:'ערבים',center:'מרכז–שמאל'};
  const models=Array.from({length:S.demo.meta.years+1},(_,i)=>runDemoModel(i));
  const share=(m,c)=>100*(m.campVotes[c]||0)/m.campTotal;
  const column=(m,year,note)=>`<article class="year-column"><p class="kicker">${note}</p><h3>${year}</h3>${order.map(c=>`<div class="year-row"><span>${labels[c]}</span><b>${r1(share(m,c))}%</b><i style="--c:${S.demo.camps[c].color};--w:${share(m,c)}%"></i></div>`).join('')}</article>`;
  $('#demo-share-chart').innerHTML=`<div class="year-comparison">${column(models[0],2022,'בסיס קבוע · תוצאות 2022')}${column(models.at(-1),2026,'תרחיש · לפי ההנחות שנבחרו')}</div>`;
  $('#demo-legend').innerHTML='';
  $('#demo-delta').innerHTML=`<h3>השינוי בחלק היחסי</h3>${order.map(c=>`<p>${labels[c]} <b dir="ltr">${r1(share(models.at(-1),c)-share(models[0],c))}</b> נקודות אחוז</p>`).join('')}<p>כל קבוצה גדלה לפי הנחותיה. ירידה בחלק היחסי אינה בהכרח ירידה במספר הקולות.</p>`;
  let chart=$('#demo-annual');if(!chart){$('#demo-share-chart').closest('.split').insertAdjacentHTML('afterend','<div id="demo-annual" class="card pad annual-chart"></div>');chart=$('#demo-annual');}
  const x=i=>60+i*170,y=v=>245-v*4;
  chart.innerHTML=`<h3>מסלול התרחיש: 2022–2026</h3><p>2022 הוא בסיס החישוב; 2023–2026 הן נקודות במודל, לא תוצאות שנמדדו.</p><svg viewBox="0 0 800 290" role="img" aria-label="שינוי בשיעור הקולות לפי קבוצה, נתונים מלאים בטבלה"><g font-size="13" fill="#46515e">${[0,10,20,30,40,50].map(v=>`<path d="M60 ${y(v)}H760" stroke="#e4dfd4"/><text x="35" y="${y(v)+4}">${v}%</text>`).join('')}${models.map((m,i)=>`<text x="${x(i)}" y="275" text-anchor="middle">${2022+i}</text>`).join('')}</g>${order.map(c=>`<polyline points="${models.map((m,i)=>`${x(i)},${y(share(m,c))}`).join(' ')}" fill="none" stroke="${S.demo.camps[c].color}" stroke-width="3"/>${models.map((m,i)=>`<circle cx="${x(i)}" cy="${y(share(m,c))}" r="4" fill="${S.demo.camps[c].color}"/>`).join('')}`).join('')}</svg><div class="tablewrap"><table><caption>שיעור הקולות במודל (%)</caption><tr><th>קבוצה</th>${models.map((_,i)=>`<th>${2022+i}</th>`).join('')}</tr>${order.map(c=>`<tr><th><i class="legend-dot" style="background:${S.demo.camps[c].color}"></i>${labels[c]}</th>${models.map(m=>`<td>${r1(share(m,c))}%</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function wireUpgrade() {
  document.addEventListener('click',e=>{
    const kind=e.target.closest('[data-filter-kind]');if(kind){S.iconFilter=kind.dataset.filterKind;renderIconFilters();$(`[data-filter-kind="${S.iconFilter}"]`)?.focus();}
    const value=e.target.closest('[data-filter-value]');if(value){const selected=value.dataset.filterValue,select=$('#poll-'+(S.iconFilter||'party'));select.value=selected;select.dispatchEvent(new Event('change',{bubbles:true}));$(`[data-filter-value="${CSS.escape(selected)}"]`)?.focus();}
  });
  const book='https://www.idi.org.il/media/27873/the-elections-in-israel-2022.pdf';
  const yearbook='https://www.idi.org.il/media/30357/statistical-report-on-ultra-orthodox-society-in-israel-2025-hebrew.pdf';
  $('#research-review').innerHTML=`<p>בדיקה ב־6.9.2026: המקורות עוסקים בגידול אוכלוסייה, בהצבעה ובמפלגות. לא נמצאה בהם הוכחה לרצפת 8 ו־11, למעבר בלתי אפשרי של חצי מיליון בוחרים, או להעברת 2–3 מנדטים אוטומטית.</p><ul><li><a href="${yearbook}">לי כהנר וגלעד מלאך — שנתון החברה החרדית 2025</a>: גידול אוכלוסייה שנתי של 4.2%; זה אינו כשלעצמו שיעור גידול בעלי זכות הבחירה.</li><li><a href="https://www.taubcenter.org.il/wp-content/uploads/2025/12/Demography-2025-ENG-2.pdf">אלכס וינרב — הדמוגרפיה בישראל 2025</a>: מסגרת לבחינת אוכלוסייה, פריון והגירה.</li><li><a href="${book}#page=344">נסים ליאון — ש״ס בהנהגת אריה דרעי</a>: מחקר על התפתחות המפלגה בשנים 2013–2022.</li><li><a href="${book}#page=370">גלעד מלאך — יהדות התורה וגידול האוכלוסייה</a>: בחינת הקשר בין צמיחה דמוגרפית לתוצאות המפלגה.</li><li><a href="${book}#page=114">ניר אטמור, חן פרידברג ולירן הרסגור — מי נהר לקלפיות?</a>: בחינת השתתפות בבחירות 2022.</li></ul><p>אלה שבעה חוקרים רלוונטיים, ולא שבעה תומכים בתחזית שנקבעה מראש. בתחקיר שסופק יש ערבוב בין אוכלוסייה לבוחרים, משקלי מכונים ללא אסמכתה וסיכון לכפל ספירה של ממוצע לצד הסקרים שיצרו אותו. לכן משקלי התחקיר לא הועתקו. המודל משתמש בציונים ההיסטוריים של האתר ובהנחות המוצהרות בנפרד.</p>`;
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',wireUpgrade);
