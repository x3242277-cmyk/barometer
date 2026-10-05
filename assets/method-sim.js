/* סימולציית שיטת החישוב (#/method): מהנתונים הגולמיים, דרך המודל הדמוגרפי, המודל הגיאוגרפי,
   ציוני האמינות של המכונים ו"כמה עברו צד", ועד תחזית הברומטר.
   כל מספר נשלף מהמצב החי של האתר (אותן פונקציות שמזינות את שאר העמודים) — שום דבר לא מוקלד.
   הכללים: לחיצה כדי להתחיל (לא ניגון אוטומטי), דבר אחד בכל רגע, ואפשר להשהות ולדלג בין שלבים. */
(() => {
  const STAGES = [
    { label: "שולפים נתונים", say: "שולפים את הנתונים: תוצאות 2022, יישובים, אוכלוסיות וסקרים" },
    { label: "המודל הדמוגרפי", say: "המודל הדמוגרפי: מי גדל מאז 2022, ומה זה עושה לחלק הגושים" },
    { label: "המודל הגיאוגרפי", say: "המודל הגיאוגרפי: כל יישוב ממשיך את הקו שלו עד 2026" },
    { label: "סקרים לפי אמינות", say: "הסקרים: כל מכון נכנס לפי הדרגה שהרוויח בבחירות הקודמות" },
    { label: "כמה עברו צד", say: "כמה עברו צד: הפער בין הסקרים לצפי של שני המודלים" },
    { label: "תחשיב הברומטר", say: "תחשיב הברומטר: מהממוצע המשוקלל ל־120 מנדטים" }
  ];
  const CANCEL = Symbol("cancel");
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { finished: false, run: 0, stage: -1, paused: false, speed: 1, t: 0, last: 0, queue: [], done: -1, started: false, raf: 0, ready: false, ledger: {} };
  let root, stage, D;
  const q = s => root.querySelector(s);
  const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const R_COL = () => BLOCS.Right.color, L_COL = () => BLOCS.Left.color, A_COL = () => BLOCS.Arabs.color;

  /* ---------- שעון משלנו: עוצר בהשהיה, מואץ במהירות, ומתבטל בדילוג בין שלבים ---------- */
  function tick() {
    const now = performance.now(), dt = Math.min(64, now - (st.last || now)); st.last = now;
    if (st.stage >= 0 && !st.paused) {
      st.t += dt * st.speed;
      for (const it of [...st.queue]) {
        const p = it.ms <= 0 ? 1 : Math.min(1, (st.t - it.at) / it.ms);
        if (it.fn) it.fn(it.ease ? ease(p) : p);
        if (p >= 1) { st.queue.splice(st.queue.indexOf(it), 1); it.res(); }
      }
    }
  }
  function wait(ms, fn, withEase = true) {
    const run = st.run, k = reduce() ? .15 : 1;
    return new Promise((res, rej) => {
      if (run !== st.run) return rej(CANCEL);
      st.queue.push({ at: st.t, ms: ms * k, fn, ease: withEase, res, rej, run });
    });
  }
  const sleep = ms => wait(ms);
  const tween = (ms, fn) => wait(ms, fn, true);
  function cancelAll() { st.run++; const old = st.queue.splice(0); old.forEach(it => it.rej?.(CANCEL)); }
  const lerp = (a, b, p) => a + (b - a) * p;

  /* ---------- נתונים חיים ---------- */
  const getData = async path => {
    const inline = window.__BAROMETER_DATA__?.[path];
    if (inline) return inline;
    const r = await fetch(path); if (!r.ok) throw new Error(path); return r.json();
  };

  async function loadHeavy() {
    const [T, RES] = await Promise.all([getData("data/trends.json"), getData("data/results-2022.json").catch(() => null)]);
    return { T, RES };
  }

  /* חלק הימין והחרדים בכל יישוב ב־2022 ובתחזית 2026 (אותו חישוב כמו תחזית המפה: מגמת היישוב בעוצמת ברירת המחדל) */
  function localityDots(T, RES) {
    const last = T.meta.elections.length - 1, lam = T.national.defaultTrend ?? 0, pos = new Map();
    (RES?.localities || []).forEach(l => { if (l.x && l.y) pos.set(String(l.c), [l.x, l.y]); });
    const out = [];
    for (const [c, L] of Object.entries(T.loc)) {
      const p = pos.get(c); if (!p) continue;
      const g4 = L.g.slice(last * 5, last * 5 + 4).reduce((a, b) => a + b, 0); if (!L.v[last] || !g4) continue;
      const at = l => { const sh = [0, 1, 2, 3].map(j => Math.max(0, L.g[last * 5 + j] / g4 + l * L.tr[j] / 100)), n = sh.reduce((a, b) => a + b, 0) || 1; return 100 * (sh[0] + sh[1]) / n; };
      out.push({ x: p[0], y: p[1], size: L.f[2], r0: at(0), r1: at(lam) });
    }
    return out;
  }

  function collect(heavy) {
    const cb = crossoverBase(), T = heavy.T, n = T.national;
    const four = a => a.slice(0, 4).reduce((s, x) => s + x, 0);
    const right = a => 100 * (a[0] + a[1]) / four(a);
    const geo22 = right(n.series[n.series.length - 1]), geo26 = right(n.f26);
    /* החלקים של 2022 מתוך ארבע הקבוצות = התחזית פחות שלושת הצעדים (דמוגרפיה, הצבעה, מגמה) */
    const f0 = n.f26.map((x, i) => x - n.steps.demography[i] - n.steps.turnout[i] - n.steps.trend[i]);
    const stepShare = (extra) => right(f0.map((x, i) => x + extra.reduce((s, e) => s + n.steps[e][i], 0)));
    const g = { start: right(f0), afterDemo: stepShare(["demography"]), afterTurn: stepShare(["demography", "turnout"]), end: geo26, geo22, localities: Object.keys(T.loc).filter(c => c !== "99999").length };

    /* סקרים: הסקר האחרון של כל מכון, כמו בעמוד הסקרים מול 2022 */
    const rows = cb.rows.map(r => ({ meta: r.meta, share: r.share, date: r.date, delta: r.delta, score: firmScore(r.meta), grade: gradeOf(firmScore(r.meta)), w: firmWeight(r.meta) }))
      .sort((a, b) => b.w - a.w || b.score - a.score);
    const W = rows.reduce((s, r) => s + r.w, 0) || 1;
    const simpleAvg = rows.reduce((s, r) => s + r.share, 0) / (rows.length || 1);

    /* תחשיב הברומטר: מצב הגושים אחרי כל צעד של המנוע (אותה פונקציה של התחזית, צעד אחר צעד) */
    const scF = forecast("scenario", HIDE_FROM_HOME), wF = forecast("weighted", HIDE_FROM_HOME), sF = forecast("simple", HIDE_FROM_HOME);
    const sopt = S.scenarioOptions || {};
    const blocOf = parties => {
      const o = { right: 0, left: 0, arab: 0, other: 0 };
      Object.entries(parties).forEach(([id, v]) => { const al = partyMeta(id).alignment; if (al === "Right" || al === "Haredi") o.right += v; else if (al === "Left") o.left += v; else if (al === "Arabs") o.arab += v; else o.other += v; });
      return o;
    };
    const norm = o => { const t = o.right + o.left + o.arab + o.other || 1; const k = 120 / t; return { right: o.right * k, left: o.left * k, arab: o.arab * k, other: o.other * k }; };
    const rawOpts = { ...sopt, rawFull: scF.rawFull };
    const dr = scF.drift, sgnS = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    const stepsCalc = [
      { key: "avg", title: "ממוצע משוקלל לפי אמינות", note: "ממצעים כל מכון, ואז משקללים בין המכונים לפי הדרגה: 45 · 35 · 20", bloc: norm(blocOf(allocateSeats(wF.parties))) },
      { key: "house", title: "תיקון הטעות הקבועה של כל מכון", note: "מזיז מנדטים בתוך הגוש בלבד, לא בין גושים", bloc: null },
      { key: "fixed", title: "ש״ס, יהדות התורה ורע״ם: מספר קבוע", note: `ש״ס ${FIXED_SEATS.shas}, יהדות התורה ${FIXED_SEATS.yahadut_hatora}, רע״ם ${FIXED_SEATS.raam} במקום ממוצע הסקרים: מדגם קטן מודד מגזרים סגורים נמוך מדי`, bloc: norm(blocOf(scenarioForecast(scF.raw, { ...rawOpts, blend: 0, demographic: 0 }).parties)) },
      { key: "anchor", title: "קירוב למאזן 2022", note: `היעד הוא 62 לגוש הימין והחרדים (לא 64), בחצי הדרך · הוזזו ${r1(scF.scenario?.anchor ?? 0)} מנדטים`, bloc: norm(blocOf(scenarioForecast(scF.raw, { ...rawOpts, blend: sopt.blend ?? .5, demographic: 0 }).parties)) },
      { key: "demo", title: "תוספת דמוגרפית: ממוצע שני המודלים", note: dr ? `המודל הדמוגרפי ${sgnS(dr.demographic ?? 0)} והגיאוגרפי ${sgnS(dr.geographic ?? 0)} מנדטים. הממוצע, מעוגל לרבע מנדט: ${sgnS(dr.seats)}` : "אין מודל טעון, ולכן נשארת ברירת המחדל", bloc: norm(blocOf(scF.parties)) },
      { key: "final", title: "אחוז חסימה ובאדר־עופר: 120 מנדטים", note: "רשימה מתחת ל־3.25% לא מקבלת מושב; השאר מחולקים מנדט אחד־אחד, כולל הסכמי עודפים", bloc: null }
    ];
    stepsCalc[1].bloc = stepsCalc[0].bloc;                         // התיקון זז בתוך הגושים בלבד
    const seats = allocateSeats(scF.parties), fin = blocOf(seats);
    stepsCalc[5].bloc = fin;
    const partySeats = Object.entries(seats).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, name: partyMeta(id).name, color: partyHue(id), al: partyMeta(id).alignment }))
      .sort((a, b) => ({ Right: 0, Haredi: 0, Unknown: 1, Left: 2, Arabs: 3 }[a.al] ?? 1) - ({ Right: 0, Haredi: 0, Unknown: 1, Left: 2, Arabs: 3 }[b.al] ?? 1) || b.n - a.n);

    return {
      cb, g, rows, W, simpleAvg, stepsCalc, fin, partySeats, simpleBloc: blocOf(allocateSeats(sF.parties)), weightedBloc: blocOf(allocateSeats(wF.parties)),
      sectors: S.demo.sectors.map(s => ({ id: s.id, name: s.name, e: s.eligible2022, growth: s.growth, turnout: s.turnout })),
      demo: { r22: cb.rightShare0, base: cb.base, pts: cb.growth, seats: demoDriftSeats() ?? 0, years: S.demo.meta.years },
      nVotes: S.regions.national.valid
    };
  }

  /* ---------- בסיס התצוגה ---------- */
  const pc = v => `${r1(v)}%`;
  const split = (v, cls = "") => `<div class="ms-split ${cls}"><span style="flex:${v};background:${R_COL()}"><b dir="ltr">${pc(v)}</b></span><span style="flex:${100 - v};background:${L_COL()}"><b dir="ltr">${pc(100 - v)}</b></span><i class="ms-half"></i></div>`;
  function say(text) { const el = q(".ms-say"); el.textContent = text; el.classList.remove("is-in"); void el.offsetWidth; el.classList.add("is-in"); }
  const setStage = html => { stage.innerHTML = html; };
  const countTo = (el, to, f = fmt) => p => { el.textContent = f(to * p); };

  /* ---------- שלב 1: שולפים נתונים — מקור אחד בכל פעם ---------- */
  async function sceneData() {
    const outlets = new Set((S.forecastPolls || []).map(p => p.channelHebrewName)).size, firmsN = new Set((S.forecastPolls || []).map(p => firmOf(p.sourceId).firm)).size;
    const eligible = D.sectors.reduce((s, x) => s + x.e, 0);
    const srcs = [
      ["תוצאות הבחירות 2022", "ועדת הבחירות המרכזית · הכנסת ה־25", D.nVotes, "קולות כשרים"],
      ["תוצאות לפי יישובים", "ועדת הבחירות · ספטמבר 2019 עד 2022 · ארבע מערכות", D.g.localities, "יישובים"],
      ["אוכלוסיות ובעלי זכות בחירה", "מרכז טאוב · המכון הישראלי לדמוקרטיה · פנקס הבוחרים", eligible, "בעלי זכות בחירה ב־5 קבוצות"],
      ["סקרי מנדטים", `${outlets} כלי תקשורת · ${firmsN} מכונים · ${FORECAST_MAX_AGE_DAYS} הימים האחרונים`, (S.forecastPolls || []).length, "סקרים"],
      ["ציוני הדיוק של המכונים", "סקרי החודש שלפני 2020, 2021 ו־2022 מול התוצאה", S.stats.length, "מכונים עם ציון"]
    ];
    setStage(`<div class="ms-src">${srcs.map(([n, d, v, u], i) => `<div class="ms-src-row" data-i="${i}"><span class="ms-src-n">${i + 1}</span><div class="ms-src-t"><b>${esc(n)}</b><small>${esc(d)}</small></div><div class="ms-src-bar"><i></i></div><div class="ms-src-v"><b class="num">0</b><small>${esc(u)}</small></div><span class="ms-src-ok" aria-hidden="true">✓</span></div>`).join("")}</div>
      <p class="ms-foot" id="ms-data-foot"></p>`);
    for (let i = 0; i < srcs.length; i++) {
      const row = stage.querySelector(`[data-i="${i}"]`), bar = row.querySelector(".ms-src-bar i"), num = row.querySelector(".ms-src-v b");
      row.classList.add("is-on"); say(`שולפים: ${srcs[i][0]}`);
      await tween(1100, p => { bar.style.width = `${p * 100}%`; num.textContent = fmt(srcs[i][2] * p); });
      row.classList.remove("is-on"); row.classList.add("is-ok");
      await sleep(260);
    }
    stage.querySelector("#ms-data-foot").textContent = "הנתונים בפנים. עכשיו שני מודלים שלא מסתכלים על אף סקר, ואז הסקרים.";
    say("הנתונים נקלטו"); await sleep(1200);
  }

  /* ---------- שלב 2: המודל הדמוגרפי ---------- */
  async function sceneDemo() {
    const max = Math.max(...D.sectors.map(s => s.e));
    const growth = s => s.e * Math.pow(1 + s.growth, D.demo.years);
    const gmax = Math.max(...D.sectors.map(growth));
    setStage(`<div class="ms-two">
      <div class="ms-col"><h3>חמש אוכלוסיות, ארבע שנים קדימה</h3>
        <div class="ms-sec">${D.sectors.map((s, i) => `<div class="ms-sec-row" data-i="${i}"><b>${esc(s.name)}</b>
          <div class="ms-sec-bar"><i class="a" style="width:0"></i><i class="b" style="width:0"></i></div>
          <span class="ms-sec-g" dir="ltr">+${r1(s.growth * 100)}% בשנה</span><span class="ms-sec-t">הצבעה ${Math.round(s.turnout * 100)}%</span></div>`).join("")}</div>
        <p class="ms-key"><i class="a"></i>בעלי זכות בחירה 2022 <i class="b"></i>תוספת עד 2026</p></div>
      <div class="ms-col ms-res"><h3>מה זה עושה לחלק הגושים</h3>
        <div class="ms-big" id="ms-demo-n"><small>הימין והחרדים, מכלל הקולות</small><b dir="ltr">${pc(D.demo.r22)}</b></div>
        <div class="ms-bar-wrap" id="ms-demo-bar" hidden>${split(D.demo.r22)}</div>
        <p class="ms-key" id="ms-demo-key" hidden><i style="background:${R_COL()}"></i>ימין וחרדים<i style="background:${L_COL()}"></i>יתר הרשימות: מרכז–שמאל והרשימות הערביות</p>
        <p class="ms-line" id="ms-demo-l1" hidden></p></div></div>`);
    for (let i = 0; i < D.sectors.length; i++) {
      const s = D.sectors[i], row = stage.querySelector(`[data-i="${i}"]`), a = row.querySelector(".a"), b = row.querySelector(".b");
      row.classList.add("is-on"); say(`${s.name}: ${fmt(s.e)} בעלי זכות בחירה ב־2022, גדלים ב־${r1(s.growth * 100)}% בשנה`);
      await tween(620, p => { a.style.width = `${s.e / gmax * 100 * p}%`; });
      await tween(560, p => { b.style.width = `${(growth(s) - s.e) / gmax * 100 * p}%`; b.style.insetInlineStart = `${s.e / gmax * 100}%`; });
      row.classList.remove("is-on"); await sleep(120);
    }
    say("כל קבוצה מצביעה בדיוק כמו ב־2022. משתנה רק גודלה ושיעור ההצבעה שלה");
    stage.querySelector("#ms-demo-bar").hidden = false; stage.querySelector("#ms-demo-key").hidden = false;
    const bar = stage.querySelector("#ms-demo-bar"), big = stage.querySelector("#ms-demo-n b");
    await sleep(900);
    await tween(1500, p => { const v = lerp(D.demo.r22, D.demo.base, p); bar.innerHTML = split(v); big.textContent = pc(v); });
    const l1 = stage.querySelector("#ms-demo-l1"); l1.hidden = false;
    l1.innerHTML = `עד 2026 חלק הימין והחרדים ${D.demo.pts >= 0 ? "עולה" : "יורד"} בערך <b>${pointsHe(D.demo.pts)}</b>, כ־<b>${r1(Math.abs(D.demo.seats))}</b> מנדטים. זה הצפי הדמוגרפי, <b>בלי שום סקר</b>.`;
    st.ledger.demo = D.demo.base; ledger(); say(`הצפי הדמוגרפי: ${pc(D.demo.base)} לימין ולחרדים`);
    await sleep(2200);
  }

  /* ---------- שלב 3: המודל הגיאוגרפי — 1,200 יישובים ---------- */
  function mix(p) { /* p: חלק הימין והחרדים ביישוב, 0–100 → צבע בין שני הגושים דרך אפור ב־50 */
    const t = Math.max(0, Math.min(1, (p - 25) / 50)), a = hex(L_COL()), b = hex(R_COL()), m = [236, 233, 226];
    const c = t < .5 ? a.map((x, i) => lerp(x, m[i], t * 2)) : m.map((x, i) => lerp(x, b[i], (t - .5) * 2));
    return `rgb(${c.map(Math.round).join(",")})`;
  }
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  async function sceneGeo() {
    const dots = D.dots.length ? D.dots : [];
    setStage(`<div class="ms-two ms-geo">
      <div class="ms-col ms-map"><canvas id="ms-cv" aria-label="מפת היישובים: צבע כל יישוב לפי חלק הימין והחרדים בו"></canvas>
        <div class="ms-map-key"><span><i style="background:${L_COL()}"></i>יתר הרשימות</span><span class="ms-grad" style="background:linear-gradient(90deg,${L_COL()},#ece9e2,${R_COL()})"></span><span><i style="background:${R_COL()}"></i>ימין וחרדים</span></div></div>
      <div class="ms-col ms-res"><h3 id="ms-geo-h">כל יישוב ממשיך את הקו שלו</h3>
        <div class="ms-big"><small id="ms-geo-small">יישובים שנטענו</small><b id="ms-geo-n" dir="ltr">0</b></div>
        <div class="ms-wf" id="ms-wf" hidden></div></div></div>`);
    const cv = stage.querySelector("#ms-cv"), box = cv.parentElement;
    const W = Math.max(280, box.clientWidth), H = Math.max(280, Math.min(520, box.clientHeight || 460)), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    const cx = cv.getContext("2d"); cx.scale(dpr, dpr);
    const lons = dots.map(d => d.x), lats = dots.map(d => d.y), k = Math.cos(31.5 * Math.PI / 180);
    const x0 = Math.min(...lons), x1 = Math.max(...lons), y0 = Math.min(...lats), y1 = Math.max(...lats);
    const sc = Math.min((W - 24) / ((x1 - x0) * k), (H - 24) / (y1 - y0));
    const ox = (W - (x1 - x0) * k * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    const P = dots.map(d => ({ px: ox + (d.x - x0) * k * sc, py: oy + (y1 - d.y) * sc, r: Math.min(11, Math.max(1.6, Math.sqrt(d.size) / 15 * Math.min(1.2, sc / 450))), d }));
    P.sort((a, b) => b.r - a.r);
    const num = stage.querySelector("#ms-geo-n"), small = stage.querySelector("#ms-geo-small");
    if (!P.length) { say("אין נתוני יישובים לתצוגה"); return; }
    say("1. מציבים כל יישוב על המפה וצובעים אותו לפי איך הצביע ב־2022");
    let shown = 0;
    await tween(2200, p => { shown = Math.floor(P.length * p); cx.clearRect(0, 0, W, H); P.forEach((o, i) => { if (i >= shown) return; cx.beginPath(); cx.arc(o.px, o.py, o.r, 0, 6.2832); cx.fillStyle = mix(o.d.r0); cx.fill(); }); num.textContent = fmt(D.g.localities * p); });
    num.textContent = fmt(D.g.localities);
    await sleep(700);
    say("2. מושכים את הקו של כל יישוב דרך ארבע הבחירות מ־2019, ומעדכנים לפי גידולו והצבעתו");
    small.textContent = "יישובים שהוסטו לפי מגמתם";
    let flipped = 0; const sign = o => o.d.r0 >= 50 !== (o.d.r1 >= 50);
    const total = P.length, nFlip = P.filter(sign).length;
    await tween(3000, p => {
      const upto = p * total; let f = 0;
      cx.clearRect(0, 0, W, H);
      P.forEach((o, i) => { const done = i < upto, v = done ? o.d.r1 : o.d.r0; if (done && sign(o)) f++; cx.beginPath(); cx.arc(o.px, o.py, o.r + (done && sign(o) && (upto - i) < 30 ? 1.2 : 0), 0, 6.2832); cx.fillStyle = mix(v); cx.fill(); });
      flipped = f; num.textContent = fmt(D.g.localities * p);
      small.textContent = `יישובים שהוסטו · ${fmt(f)} חצו את קו ה־50%`;
    });
    num.textContent = fmt(D.g.localities); small.textContent = `יישובים שהוסטו · ${fmt(nFlip)} חצו את קו ה־50%`;
    await sleep(500);
    say("3. מסכמים את כל היישובים: דמוגרפיה, הצבעה ומגמה");
    const wf = stage.querySelector("#ms-wf"); wf.hidden = false;
    const g = D.g, rows = [["2022, מתוך ארבע הקבוצות", g.start, g.start], ["אחרי הגידול הדמוגרפי", g.start, g.afterDemo], ["אחרי שיעורי ההצבעה", g.afterDemo, g.afterTurn], ["אחרי מגמת היישובים", g.afterTurn, g.end]];
    const dmin = Math.min(...rows.flatMap(r => [r[1], r[2]])) - 1.2, dmax = Math.max(...rows.flatMap(r => [r[1], r[2]])) + 1.2;
    wf.innerHTML = `<div class="ms-wf-in">${rows.map(([n]) => `<div class="ms-wf-row"><span>${n}</span><div class="ms-wf-t"><i class="ms-wf-b"></i></div><b dir="ltr">&nbsp;</b></div>`).join("")}</div>`;
    const pos = v => (v - dmin) / (dmax - dmin) * 100;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], el = wf.querySelectorAll(".ms-wf-row")[i], bar = el.querySelector(".ms-wf-b"), val = el.querySelector("b");
      el.classList.add("is-on");
      if (i > 0) bar.classList.add(r[2] >= r[1] ? "is-up" : "is-down");
      await tween(i === 0 ? 600 : 700, p => {
        if (i === 0) { bar.style.left = "0"; bar.style.width = `${pos(r[2]) * p}%`; val.textContent = pc(r[2]); return; }
        const v = lerp(r[1], r[2], p), lo = Math.min(r[1], v), hi = Math.max(r[1], v);
        bar.style.left = `${pos(lo)}%`; bar.style.width = `${pos(hi) - pos(lo)}%`;
        val.textContent = `${pc(v)}  ${r[2] - r[1] >= 0 ? "+" : "−"}${r1(Math.abs(v - r[1]))}`;
      });
      el.classList.remove("is-on");
    }
    st.ledger.geo = g.end; ledger(); say(`הצפי הגיאוגרפי: ${pc(g.end)} לימין ולחרדים`);
    await sleep(2200);
  }

  /* ---------- שלב 4: הסקרים, לפי אמינות ---------- */
  async function scenePolls() {
    const rows = D.rows, lo = Math.floor(Math.min(...rows.map(r => r.share), D.demo.base) - 2), hi = Math.ceil(Math.max(...rows.map(r => r.share), D.demo.base) + 2);
    const pos = v => (v - lo) / (hi - lo) * 100;
    setStage(`<div class="ms-polls"><div class="ms-pl-head"><span></span><span>מכון</span><span>דרגה</span><span class="ms-pl-axis">חלק הימין והחרדים בסקר האחרון <small dir="ltr">${lo}% — ${hi}%</small></span><span>משקל</span></div>
      <div class="ms-pl-rows">${rows.map((r, i) => `<div class="ms-pl-row" data-i="${i}">${logoBox(r.meta, 26)}<span class="ms-pl-n"><b>${esc(r.meta.he || r.meta.firm)}</b><small>${esc(r.date)}</small></span>
        <span class="ms-pl-g"><em class="grade ${r.grade.key}">${esc(r.grade.label)}</em><small>ציון ${r1(r.score)}</small></span>
        <div class="ms-pl-track"><i class="ms-pl-exp" style="left:${pos(D.demo.base)}%"></i><i class="ms-pl-dot" style="left:${pos(r.share)}%"></i><b class="ms-pl-v" dir="ltr" style="left:${pos(r.share)}%">${pc(r.share)}</b></div>
        <span class="ms-pl-w"><i></i><b>${Math.round(100 * r.w / D.W)}%</b></span></div>`).join("")}</div>
      <div class="ms-pl-avg"><div><small>ממוצע פשוט</small><b dir="ltr" id="ms-pl-s">—</b></div><div><small>ממוצע משוקלל לפי אמינות</small><b dir="ltr" id="ms-pl-w">—</b></div><p class="ms-note">הקו המקווקו: הצפי הדמוגרפי (${pc(D.demo.base)})</p></div></div>`);
    let sumS = 0, sumW = 0, wS = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], row = stage.querySelector(`[data-i="${i}"]`);
      row.classList.add("is-on"); say(`${r.meta.he || r.meta.firm}: ${pc(r.share)} לגוש הימין והחרדים (${r.date})`);
      await sleep(380); row.classList.add("is-dot");
      await sleep(380); row.classList.add("is-tier"); row.querySelector(".ms-pl-w i").style.width = `${r.w / .45 * 100}%`;
      sumS += r.share; sumW += r.share * r.w; wS += r.w;
      stage.querySelector("#ms-pl-s").textContent = pc(sumS / (i + 1)); stage.querySelector("#ms-pl-w").textContent = pc(sumW / wS);
      await sleep(430); row.classList.remove("is-on"); row.classList.add("is-done");
    }
    stage.querySelector(".ms-pl-avg").classList.add("is-fin");
    st.ledger.polls = D.cb.shareAvg; ledger(); say(`ממוצע הסקרים, משוקלל לפי אמינות: ${pc(D.cb.shareAvg)}`);
    await sleep(2400);
  }

  /* ---------- שלב 5: כמה עברו צד ---------- */
  async function sceneSwitch() {
    const cb = D.cb, rows = [...D.rows].sort((a, b) => a.delta - b.delta);
    const refs = [["2022 בפועל", cb.rightShare0, "ms-c22"], ["צפי דמוגרפי", cb.base, "ms-cdemo"], ["צפי גיאוגרפי", D.g.end, "ms-cgeo"], ["ממוצע הסקרים, משוקלל", cb.shareAvg, "ms-cpoll"]];
    const lo = Math.floor(Math.min(...refs.map(r => r[1])) - 1.5), hi = Math.ceil(Math.max(...refs.map(r => r[1])) + 1.5), pos = v => (v - lo) / (hi - lo) * 100;
    const dMax = Math.max(1, ...rows.map(r => Math.abs(r.delta)));
    setStage(`<div class="ms-two ms-sw"><div class="ms-col"><h3>חלק הימין והחרדים מהקולות</h3>
        <div class="ms-ax"><div class="ms-ax-line"></div>${refs.map(([n, v, c], i) => `<div class="ms-ax-m ${c}" data-r="${i}" style="left:${pos(v)}%;--lvl:${i}"><span><b dir="ltr">${pc(v)}</b>${n}</span><i></i></div>`).join("")}
        <div class="ms-ax-gap" id="ms-gap" hidden></div></div>
        <p class="ms-line" id="ms-sw-l" hidden></p></div>
      <div class="ms-col"><h3>כל מכון מול הצפי הדמוגרפי</h3><div class="ms-dv">${rows.map((r, i) => `<div class="ms-dv-row" data-i="${i}"><span>${esc(r.meta.he || r.meta.firm)}</span><div class="ms-dv-t"><i class="ms-mid"></i><i class="ms-dvb ${r.delta >= 0 ? "is-pos" : "is-neg"}" style="--w:${Math.abs(r.delta) / dMax * 48}%"></i></div><b dir="ltr">${r.delta >= 0 ? "+" : "−"}${r1(Math.abs(r.delta))}</b></div>`).join("")}</div>
        <p class="ms-key"><i style="background:#2563B0"></i>יותר מהצפי לימין ולחרדים<i style="background:#C0392B"></i>פחות מהצפי<span>· הקו האמצעי: הצפי הדמוגרפי</span></p></div></div>`);
    for (let i = 0; i < refs.length; i++) {
      const m = stage.querySelector(`[data-r="${i}"]`); say(`${refs[i][0]}: ${pc(refs[i][1])}`);
      m.classList.add("is-in"); await sleep(1000);
    }
    const gap = stage.querySelector("#ms-gap"), a = cb.base, b = cb.shareAvg;
    gap.hidden = false; gap.style.left = `${pos(Math.min(a, b))}%`; gap.style.width = `${Math.abs(pos(a) - pos(b))}%`;
    gap.innerHTML = `<span dir="ltr">${b - a >= 0 ? "+" : "−"}${r1(Math.abs(b - a))}</span>`;
    say("הפער בין הסקרים לצפי הדמוגרפי הוא מה ש״עבר צד״, או נשאר בבית");
    await sleep(900);
    const l = stage.querySelector("#ms-sw-l"); l.hidden = false;
    const geoGap = b - D.g.end;
    l.innerHTML = `חלק הימין והחרדים בממוצע הסקרים <b>${b >= a ? "גבוה" : "נמוך"} ב־${pointsHe(b - a)}</b> מהצפי הדמוגרפי (כ־<b>${cb.kv(cb.votersAvg)}</b> קולות), ו<b>${geoGap >= 0 ? "גבוה" : "נמוך"} ב־${pointsHe(geoGap)}</b> מהצפי הגיאוגרפי. באותו שיעור, בכיוון ההפוך, זה חלקן של יתר הרשימות. <small>אומדן לגודל הפער בתמיכה, לא ספירה של אנשים.</small>`;
    await sleep(900);
    say("ובכל מכון בנפרד");
    for (let i = 0; i < rows.length; i++) { stage.querySelector(`.ms-dv-row[data-i="${i}"]`).classList.add("is-in"); await sleep(380); }
    const up = rows.filter(r => r.delta > .05).length, dn = rows.filter(r => r.delta < -.05).length;
    st.ledger.switch = b - a; ledger(); say(`${up} מכונים מעל הצפי הדמוגרפי, ${dn} מתחתיו`);
    await sleep(2400);
  }

  /* ---------- שלב 6: תחשיב הברומטר ---------- */
  async function sceneCalc() {
    const steps = D.stepsCalc;
    setStage(`<div class="ms-two ms-calc"><div class="ms-col"><ol class="ms-cl">${steps.map((s, i) => `<li data-i="${i}"><b>${esc(s.title)}</b><small>${esc(s.note)}</small></li>`).join("")}</ol></div>
      <div class="ms-col ms-res"><div class="ms-bls">
        <div class="ms-bl" data-b="right"><span><i style="background:${R_COL()}"></i>ימין וחרדים</span><div class="ms-bl-t"><i class="ms-bl-f" style="background:${R_COL()}"></i><i class="ms-61"></i></div><b dir="ltr">0</b></div>
        <div class="ms-bl" data-b="left"><span><i style="background:${L_COL()}"></i>מרכז–שמאל</span><div class="ms-bl-t"><i class="ms-bl-f" style="background:${L_COL()}"></i><i class="ms-61"></i></div><b dir="ltr">0</b></div>
        <div class="ms-bl" data-b="arab"><span><i style="background:${A_COL()}"></i>רשימות ערביות</span><div class="ms-bl-t"><i class="ms-bl-f" style="background:${A_COL()}"></i><i class="ms-61"></i></div><b dir="ltr">0</b></div>
        <p class="ms-note">המנדטים בשברים עד הצעד האחרון; 61 הוא הרוב</p></div>
        <div class="ms-hemi" id="ms-hemi" hidden></div></div></div>`);
    const set = (bloc, from, p) => ["right", "left", "arab"].forEach(k => {
      const row = stage.querySelector(`[data-b="${k}"]`), v = from ? lerp(from[k], bloc[k], p) : bloc[k] * p;
      row.querySelector(".ms-bl-f").style.width = `${v / 70 * 100}%`; row.querySelector("b").textContent = r1(v);
    });
    let prev = null;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], li = stage.querySelector(`li[data-i="${i}"]`);
      li.classList.add("is-on"); say(s.title);
      if (i === steps.length - 1) {
        await tween(900, p => set(s.bloc, prev, p));
        const hemi = stage.querySelector("#ms-hemi"); hemi.hidden = false;
        hemi.innerHTML = hemicycleSVG(D.partySeats.map(p => ({ color: p.color, count: p.n, label: `${p.name}: ${p.n}`, key: p.id })), { aria: "120 המנדטים" }) ;
        const seatsEl = [...hemi.querySelectorAll(".hemi-seat")]; seatsEl.forEach(e => e.style.opacity = 0);
        await tween(2200, p => { const n = Math.floor(seatsEl.length * p); seatsEl.forEach((e, k) => { e.style.opacity = k < n ? 1 : 0; }); });
        hemi.insertAdjacentHTML("beforeend", `<p class="ms-result"><b>הברומטר:</b> ימין וחרדים <b>${D.fin.right}</b> · מרכז–שמאל <b>${D.fin.left}</b> · ערבים <b>${D.fin.arab}</b></p>`);
      } else {
        await tween(i === 0 ? 1400 : 900, p => set(s.bloc, prev, p));
        await sleep(i === 1 ? 1100 : 600);
      }
      li.classList.remove("is-on"); li.classList.add("is-done"); prev = s.bloc;
    }
    st.ledger.final = D.fin.right; ledger(); say(`תחזית הברומטר: ${D.fin.right} · ${D.fin.left} · ${D.fin.arab}`);
    await sleep(600);
  }

  /* ---------- מה כבר חושב — רצועת התוצאות ---------- */
  const CHIPS = [
    ["demo", "צפי דמוגרפי", v => pc(v), "נכנס לחישוב: חצי מהתוספת הדמוגרפית"],
    ["geo", "צפי גיאוגרפי", v => pc(v), "נכנס לחישוב: חצי מהתוספת הדמוגרפית"],
    ["polls", "ממוצע הסקרים, משוקלל", v => pc(v), "נכנס לחישוב"],
    ["switch", "הפער מול הצפי הדמוגרפי, נקודות אחוז", v => `${v >= 0 ? "+" : "−"}${r1(Math.abs(v))}`, "מדד לבדיקה, לא משנה מנדט"],
    ["final", "מנדטים לימין ולחרדים", v => String(v), "תחזית הברומטר"]
  ];
  function ledger() {
    const el = q(".ms-ledger"); if (!el) return;
    el.innerHTML = CHIPS.map(([k, n, f, tag]) => `<div class="ms-chip ${st.ledger[k] != null ? "is-on" : ""}" title="${esc(tag)}"><small>${esc(n)}</small><b dir="ltr">${st.ledger[k] != null ? esc(f(st.ledger[k])) : "—"}</b><em>${esc(tag)}</em></div>`).join("");
  }
  function fillLedgerUpTo(i) {
    st.ledger = {};
    if (i > 1) st.ledger.demo = D.demo.base;
    if (i > 2) st.ledger.geo = D.g.end;
    if (i > 3) st.ledger.polls = D.cb.shareAvg;
    if (i > 4) st.ledger.switch = D.cb.shareAvg - D.cb.base;
  }

  /* ---------- בקרה ---------- */
  const SCENES = [sceneData, sceneDemo, sceneGeo, scenePolls, sceneSwitch, sceneCalc];
  function paintNav() {
    root.querySelectorAll("[data-ms-stage]").forEach((b, i) => { b.classList.toggle("is-on", i === st.stage); b.classList.toggle("is-done", i < st.done + 1 && i !== st.stage); b.setAttribute("aria-current", i === st.stage ? "step" : "false"); });
    const play = q(".ms-play"); play.textContent = st.stage < 0 ? "הפעלת הסימולציה" : st.finished ? "הצגה מחדש ↻" : st.paused ? "המשך" : "השהיה";
    q(".ms-prev").disabled = st.stage <= 0; q(".ms-next").disabled = st.stage < 0 || st.stage >= STAGES.length - 1;
    root.classList.toggle("is-running", st.stage >= 0);
  }
  async function go(i) {
    cancelAll(); const run = st.run;
    st.stage = i; st.paused = false; st.t = 0; fillLedgerUpTo(i); ledger(); paintNav();
    q(".ms-count").textContent = `${i + 1} / ${STAGES.length}`;
    try {
      await SCENES[i]();
      if (run !== st.run) return;
      st.done = Math.max(st.done, i);
      if (i < STAGES.length - 1) go(i + 1);
      else { st.finished = true; paintNav(); }
    } catch (e) { if (e !== CANCEL) { console.error(e); setStage(`<p class="ms-foot">לא הצלחנו להציג את השלב הזה.</p>`); } }
  }

  function build() {
    root.innerHTML = `<div class="ms-bar"><div class="ms-title"><p class="kicker">סימולציה · בזמן אמת, מהנתונים של היום</p><h2>איך הברומטר מגיע למספר</h2></div>
      <div class="ms-ctl"><button type="button" class="ms-play">הפעלת הסימולציה</button><button type="button" class="ms-prev" aria-label="לשלב הקודם">→</button><button type="button" class="ms-next" aria-label="לשלב הבא">←</button><span class="ms-count" dir="ltr" aria-hidden="true"></span>
        <label class="ms-speed">מהירות <select aria-label="מהירות הסימולציה"><option value="1">רגילה</option><option value="2">כפולה</option><option value="4">מהירה מאוד</option></select></label></div></div>
      <nav class="ms-nav" aria-label="שלבי הסימולציה">${STAGES.map((s, i) => `<button type="button" data-ms-stage="${i}"><span>${i + 1}</span>${s.label}</button>`).join("")}</nav>
      <p class="ms-say" aria-live="polite">לחצו על ״הפעלת הסימולציה״ כדי לראות את החישוב שלב אחר שלב, מהנתונים הגולמיים ועד תחזית הברומטר.</p>
      <div class="ms-stage" id="ms-stage"><div class="ms-idle"><button type="button" class="ms-big-play">▶ הפעלת הסימולציה</button><p>שישה שלבים, כדקה · אפשר להשהות ולדלג בכל רגע</p></div></div>
      <div class="ms-ledger" aria-label="מה כבר חושב"></div>`;
    stage = q("#ms-stage"); ledger();
    q(".ms-big-play").onclick = () => { if (st.ready) go(0); };
    q(".ms-play").onclick = () => {
      if (st.stage < 0) return st.ready && go(0);
      if (st.finished) { st.finished = false; return go(0); }
      st.paused = !st.paused; paintNav();
    };
    q(".ms-prev").onclick = () => go(Math.max(0, st.stage - 1));
    q(".ms-next").onclick = () => go(Math.min(STAGES.length - 1, st.stage + 1));
    root.querySelectorAll("[data-ms-stage]").forEach(b => b.onclick = () => st.ready && go(Number(b.dataset.msStage)));
    q(".ms-speed select").onchange = e => { st.speed = Number(e.target.value); };
    paintNav();
    /* rAF לחלקלקות, וטיימר כגיבוי כשהדפדפן מקפיא פריימים (חלונית מוסתרת/מוטמעת); שניהם מחשבים לפי השעון, לכן אין ספירה כפולה */
    const loop = () => { tick(); st.raf = requestAnimationFrame(loop); };
    st.raf = requestAnimationFrame(loop); st.timer = setInterval(tick, 40);
    document.addEventListener("barometer:view", () => { if (S.view !== "method" && st.stage >= 0 && !st.paused) { st.paused = true; paintNav(); } });
  }


  /* ---------- שאר העמוד: מספרים חיים לשני הסעיפים החדשים, תוכן עניינים, וכפתורי "הצגה בסימולציה" ---------- */
  function fillLive() {
    const chips = (id, items) => { const el = document.getElementById(id); if (el) el.innerHTML = items.map(([n, l]) => `<div><b class="num" dir="ltr">${n}</b><span>${esc(l)}</span></div>`).join(""); };
    const g = D.g, cb = D.cb, sg = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    chips("m-live-geo", [[fmt(g.localities), "יישובים בחישוב"], [pc(g.start), "ימין וחרדים ב־2022, מארבע הקבוצות"], [sg(g.afterDemo - g.start), "נקודות אחוז מהגידול הדמוגרפי"], [sg(g.afterTurn - g.afterDemo), "נקודות אחוז משיעורי ההצבעה"], [sg(g.end - g.afterTurn), "נקודות אחוז ממגמת היישובים"], [pc(g.end), "הצפי ל־2026"]]);
    const above = D.rows.filter(r => r.delta > .05).length, below = D.rows.filter(r => r.delta < -.05).length;
    chips("m-live-switch", [[sg(cb.shareAvg - cb.base), "הפער מול הצפי הדמוגרפי, נקודות אחוז"], [`≈ ${cb.kv(cb.votersAvg)}`, "קולות"], [sg(cb.shareAvg - g.end), "הפער מול הצפי הגיאוגרפי, נקודות אחוז"], [String(above), "מכונים מעל הצפי הדמוגרפי"], [String(below), "מכונים מתחתיו"]]);
  }
  function wireDoc() {
    const smooth = reduce() ? "auto" : "smooth";
    document.querySelectorAll(".mdoc-nav [data-go]").forEach(b => b.onclick = () => document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: smooth, block: "start" }));
    document.querySelectorAll(".msec-sim").forEach(b => b.onclick = () => {
      if (!st.ready) return;
      root.scrollIntoView({ behavior: smooth, block: "start" });
      go(Number(b.dataset.sim));
    });
    const secs = [...document.querySelectorAll(".msec")];
    if (secs.length && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting) return;
        document.querySelectorAll(".mdoc-nav [data-go]").forEach(b => b.classList.toggle("is-on", b.dataset.go === e.target.id));
      }), { rootMargin: "-25% 0px -65% 0px" });
      secs.forEach(s => io.observe(s));
    }
  }

  async function init() {
    if (root) return;
    const el = document.querySelector("#method-sim");
    if (!el || !S.cur || !S.demo || !S.stats) return;
    root = el;
    build();
    wireDoc();
    try { const heavy = await loadHeavy(); D = collect(heavy); D.dots = localityDots(heavy.T, heavy.RES); st.ready = true; root.classList.add("is-ready"); fillLive(); }
    catch (e) { console.error(e); q(".ms-idle p").textContent = "הסימולציה לא נטענה כרגע"; }
  }
  window.initMethodSim = init;
})();
