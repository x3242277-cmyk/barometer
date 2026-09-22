/* Interactive calculation walkthrough. Source statuses reflect actual requests. */
(() => {
  const STEPS = [
    ["fetch", "מקור הנתונים", "מאיפה מגיעים הנתונים"],
    ["calib", "משקל המכונים", "לכל מכון יש משקל מוסבר"],
    ["analyze", "ניתוח", "מה משתנה בדרך לתחזית"],
    ["result", "התוצאה", "120 מנדטים, לפי המצב שבחרתם"]
  ];
  let stage = null, currentStep = "fetch", restoreFocus = null;
  const query = s => stage?.querySelector(s);
  const time = iso => new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  function close() {
    if (!stage) return;
    const previous = stage; stage = null; previous.close(); previous.remove();
    document.documentElement.classList.remove("show-open");
    restoreFocus?.focus();
  }
  function open() {
    if (!S.cur || !S.series.length) return;
    if (stage) close();
    restoreFocus = document.activeElement;
    stage = document.createElement("dialog"); stage.id = "pipeline-show"; stage.dir = "rtl";
    stage.setAttribute("aria-labelledby", "ps-title");
    stage.innerHTML = `<div class="ps-top"><span class="ps-brand">ברומטר · הצגת החישוב</span>
      <ol class="ps-steps">${STEPS.map(([key, label], i) => `<li data-step="${key}"><button type="button" data-go="${key}"><b>0${i + 1}</b>${label}</button></li>`).join("")}</ol>
      <button type="button" class="ps-close" aria-label="סגירה">✕</button></div>
      <div class="ps-body"><h2 id="ps-title" class="ps-title" tabindex="-1"></h2><div class="ps-stage"></div></div>
      <div class="ps-bottom"><button type="button" class="btn ghost ps-next">לשלב הבא ←</button><span class="ps-note"></span></div>`;
    document.body.appendChild(stage); stage.showModal(); document.documentElement.classList.add("show-open");
    query(".ps-close").addEventListener("click", close);
    stage.addEventListener("cancel", e => { e.preventDefault(); close(); });
    stage.addEventListener("click", e => { const go = e.target.closest("[data-go]"); if (go) show(go.dataset.go, true); });
    query(".ps-next").addEventListener("click", () => show(STEPS[(STEPS.findIndex(s => s[0] === currentStep) + 1) % STEPS.length][0], true));
    show("fetch");
  }
  function show(key, focus = false) {
    if (!stage) return;
    currentStep = key;
    stage.querySelectorAll(".ps-steps li").forEach(li => {
      li.classList.toggle("on", li.dataset.step === key);
      const button = li.querySelector("button");
      if (li.dataset.step === key) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    query(".ps-title").textContent = STEPS.find(s => s[0] === key)[2];
    query(".ps-next").textContent = key === "result" ? "חזרה למקורות" : "לשלב הבא ←";
    query(".ps-note").textContent = `${S.forecastPolls.length} סקרים בחישוב · נתונים מ־${time(S.cur.generatedAt)}`;
    ({ fetch: renderFetch, calib: renderCalib, analyze: renderAnalyze, result: renderResult })[key]();
    if (focus) query(".ps-title").focus();
  }
  function renderFetch() {
    const box = query(".ps-stage");
    const outlets = [...new Set(S.cur.polls.map(p => p.channelHebrewName))];
    box.innerHTML = `<p class="ps-caption">כלי התקשורת מפרסמים; מאגר <a href="https://www.skarim.org/" target="_blank" rel="noopener">סקרים ↗</a> מרכז את הפרסומים; תהליך איסוף אוטומטי שרץ פעמיים ביום קורא משם ומאמת תאריך, שיוך וסכום של 120 לפני שסקר נכנס לאתר. העמוד הזה מציג תמיד את מה שכבר נאסף ואומת — אין כאן שליפה חיה מהדפדפן שלכם.</p>
      <div class="ps-fetch-result" role="status"><b>${S.cur.polls.length} סקרים בבסיס הנתונים הנוכחי.</b> עדכון אחרון: ${esc(time(S.cur.generatedAt))}.</div>
      <p class="ps-caption">כלי תקשורת שכלולים בנתוני האתר כרגע — הלוגואים מציינים מפרסמים, לא בדיקות נפרדות.</p>
      <div class="ps-sources">${outlets.map(o => { const logo = S.firms.outletLogos[o]; return `<div class="ps-src done"><span class="ps-src-logo">${logo ? `<img src="${esc(logo)}" alt="">` : esc(o.slice(0, 3))}</span><b>${esc(o)}</b></div>`; }).join("")}</div>
      <p class="ps-caption">האיסוף עצמו ממשיך ברקע, בלי קשר למסך הזה — <a href="#/polls">לכל הסקרים ↙</a></p>`;
    query(".ps-stage a").addEventListener("click", close);
  }
  function renderCalib() {
    const firms = S.series.slice().sort((a, b) => firmScore(b.meta) - firmScore(a.meta));
    const allWeight = firms.reduce((t, s) => t + firmWeight(s.meta), 0) || 1;
    query(".ps-stage").innerHTML = `<div class="ps-firms">${firms.map(s => {
      const sc = firmScore(s.meta), grade = s.meta.calibrated ? gradeOf(sc) : { key: "none", label: "ללא דירוג · משקל ניטרלי" };
      return `<div class="ps-firm"><span class="ps-firm-logo">${s.meta.logo ? `<img src="${esc(s.meta.logo)}" alt="">` : esc(s.meta.short || "")}</span><div class="ps-firm-body"><b>${esc(s.meta.he)}</b><span class="grade ${grade.key}">${esc(grade.label)}</span><span>${r1(100 * firmWeight(s.meta) / allWeight)}% מהמשקל · ${s.polls.length} סקרים</span>${s.meta.calibrationFirm ? '<small>הציון מיוחס לצוות דירקט פולס לפי הגדרת האתר</small>' : ""}<i class="ps-bar"><u class="go" style="--v:${sc}%"></u></i></div><span class="ps-firm-score num">${r1(sc)}</span></div>`;
    }).join("")}</div><p class="ps-caption">60% דיוק בגושים · 30% דיוק במפלגות · 10% עקביות. הבסיס: ${S.calibrations.reduce((t, e) => t + e.polls, 0)} סקרי כיול משויכים ב־${S.elections.length} מערכות בחירות. זהו דירוג לפי מדדי האתר, לא הבטחה לדיוק בעתיד. <a href="#/2022">לפירוט הציונים ↗</a></p>`;
    query('.ps-caption a').addEventListener("click", close);
  }
  function renderAnalyze() {
    const phases = ["simple", "weighted", "scenario"].map(mode => allocateSeats(forecast(mode, HIDE_FROM_HOME).parties));
    const ids = [...new Set(phases.flatMap(p => Object.keys(p)))].sort((a, b) => (phases[2][b] || 0) - (phases[2][a] || 0));
    query(".ps-stage").innerHTML = `<p class="ps-caption">ממצעים תחילה בתוך כל מכון, ואז בין המכונים. העמודה האמצעית משוקללת לפי הציונים; באחרונה נוספות הנחות הברומטר. בכל עמודה מוצגת חלוקה ל־120 — לא תוצאות גולמיות של סקר.</p>
      <div class="tablewrap"><table class="ps-analysis"><thead><tr><th>מפלגה</th><th>ממוצע פשוט</th><th>משוקלל אמינות</th><th>תחזית הברומטר</th></tr></thead><tbody>${ids.map(id => `<tr><th scope="row">${esc(partyMeta(id).name)}</th>${phases.map(p => `<td class="num">${p[id] || 0}</td>`).join("")}</tr>`).join("")}<tr><th>סך הכול</th>${phases.map(p => `<td class="num">${Object.values(p).reduce((t, n) => t + n, 0)}</td>`).join("")}</tr></tbody></table></div>
      <p class="ps-caption">קיבוע ש״ס ${FIXED_SEATS.shas}, יהדות התורה ${FIXED_SEATS.yahadut_hatora}, רע״מ ${FIXED_SEATS.raam}; קירוב למאזן 2022 ותוספת דמוגרפית. אלה הנחות שנבחרו באתר, לא תיקונים שהוכחו בסקר. <a href="#/method">להסבר ולהנחות הנוכחיות ↗</a></p>`;
    query('.ps-stage a').addEventListener("click", close);
  }
  function renderResult() {
    const seats = allocateSeats(forecast(S.mode, HIDE_FROM_HOME).parties), totals = {};
    Object.entries(seats).forEach(([id, n]) => { const al = partyMeta(id).alignment; totals[al] = (totals[al] || 0) + n; });
    const items = Object.entries(totals).map(([key, count]) => ({ key, count, color: BLOCS[key].color, label: BLOCS[key].he }));
    query(".ps-stage").innerHTML = `<div class="ps-result"><p class="ps-caption">${S.mode === "weighted" ? "משוקלל אמינות" : "תחזית הברומטר"} · הנתונים הנוכחיים, לא תמונת ארכיון. רוב דורש 61; שיוך לגוש אינו התחייבות לקואליציה.</p><div class="ps-hemi">${hemicycleSVG(items, { aria: "חלוקת 120 המנדטים" })}</div><div class="ps-totals">${items.map(x => `<div style="--c:${x.color}"><b class="num">${x.count}</b><span>${esc(x.label)}</span></div>`).join("")}</div><div class="ps-actions"><a class="btn" href="#/">לתמונת המצב</a><a class="btn ghost" href="#/method">איך חישבנו</a></div></div>`;
    stage.querySelectorAll(".ps-actions a").forEach(a => a.addEventListener("click", close));
  }
  window.openPipelineShow = open;
  document.addEventListener("click", e => { if (e.target.closest("[data-open-show]")) { e.preventDefault(); open(); } });
})();
