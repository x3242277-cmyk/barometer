/* סימולציית שיטת החישוב (#/method): מהנתונים הגולמיים, דרך המודל הדמוגרפי, המודל הגיאוגרפי,
   ציוני האמינות של המכונים ו"כמה עברו צד", ועד תחזית הברומטר.
   כל מספר נשלף מהמצב החי של האתר (אותן פונקציות שמזינות את שאר העמודים) — שום דבר לא מוקלד.
   הכללים: לחיצה כדי להתחיל (לא ניגון אוטומטי), דבר אחד בכל רגע, ואפשר להשהות ולדלג בין שלבים. */
(() => {
  const STAGES = [
    { label: "שולפים נתונים", say: "שולפים את הנתונים: תוצאות 2022, יישובים, אוכלוסיות וסקרים" },
    { label: "המודל הדמוגרפי", say: "המודל הדמוגרפי: מי גדל מאז 2022, ומה זה עושה לחלק הגושים" },
    { label: "המודל הגיאוגרפי", say: "המודל הגיאוגרפי: כל יישוב ממשיך את הקו שלו עד 2026" },
    { label: "סקרים לפי דיוק עבר", say: "הסקרים: כל מכון נכנס לפי הדרגה שחושבה מבחירות קודמות" },
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
    const g = { start: right(f0), afterDemo: stepShare(["demography"]), afterTurn: stepShare(["demography", "turnout"]), end: geo26, geo22, seatsPts: (geo26 - right(f0)) * 1.2, seats22: right(f0) * 1.2, seats26: geo26 * 1.2, localities: Object.keys(T.loc).filter(c => c !== "99999").length };

    /* סקרים: הסקר האחרון של כל מכון, כמו בעמוד הסקרים מול 2022 */
    const rows = cb.rows.map(r => ({ meta: r.meta, share: r.share, left: r.left, arab: r.arab, seats: r.seats, date: r.date, delta: r.delta, score: firmScore(r.meta), grade: gradeOf(firmScore(r.meta)), w: firmWeight(r.meta) }))
      .sort((a, b) => b.w - a.w || b.score - a.score);
    const W = rows.reduce((s, r) => s + r.w, 0) || 1;
    const simpleAvg = rows.reduce((s, r) => s + r.share, 0) / (rows.length || 1);

    /* תחשיב הברומטר: מצב הגושים אחרי כל צעד של המנוע (אותה פונקציה של התחזית, צעד אחר צעד) */
    const scF = forecast("scenario", HIDE_FROM_HOME), wF = forecast("weighted", HIDE_FROM_HOME), sF = forecast("simple", HIDE_FROM_HOME);
    const sopt = S.scenarioOptions || {};
    const blocOf = parties => {
      const o = { right: 0, left: 0, arab: 0, other: 0 };
      Object.entries(parties).forEach(([id, v]) => { const al = partyMeta(id).alignment; if (isRightAt(id, v)) o.right += v; else if (al === "Arabs" || ARAB_FAMILY.has(normId(id))) o.arab += v; else o.left += v; });
      return o;
    };
    const norm = o => { const t = o.right + o.left + o.arab + o.other || 1; const k = 120 / t; return { right: o.right * k, left: o.left * k, arab: o.arab * k, other: o.other * k }; };
    const rawOpts = { ...sopt, rawFull: scF.rawFull };
    const dr = scF.structural, sgnS = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    const defs22 = S.hist?.blocs || BLOCS_2022;
    /* 2022 לפי שלושת הגושים: ימין וחרדים, ערבים (רע״ם, חד״ש־תע״ל, בל״ד), והשאר מרכז־שמאל */
    const bloc22 = p => { const b = histBlocs(p, defs22), a = (p.raam || 0) + (p.hadash_taal || 0) + (p.balad || 0); return { right: b.netanyahu, arab: a, left: 120 - b.netanyahu - a, other: 0 }; };
    const base22 = bloc22(S.hist?.actual || {});
    /* שינוי של d מנדטים לימין ולחרדים; השאר מתכווצים באותו יחס (סכום תמיד 120) */
    const shiftR = (b, d) => { const R = b.right + d, rest = b.left + b.arab || 1, k = (120 - R) / rest; return { right: R, left: b.left * k, arab: b.arab * k, other: 0 }; };
    const sg = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    /* נקודת המוצא של המודלים: 2022 בקולות נטו — חלק הגוש מהקולות כפול 120, לא המנדטים בפועל */
    const v22 = 120 * cb.rightShare0 / 100, votesCf = shiftR(base22, v22 - base22.right);
    const stepsCalc = [
      { key: "y22", title: "בחירות 2022", note: `התוצאה בפועל: ימין וחרדים ${base22.right} · מרכז־שמאל ${base22.left} · ערבים ${base22.arab}`, bloc: base22 },
      { key: "votes22", title: "2022 בקולות נטו", note: `ימין וחרדים קיבלו ${r1(cb.rightShare0)}% מקולות הרשימות שנספרות (מעל 1%). כפול 120: ${r1(v22)}. ההפרש מ־${base22.right} המנדטים בפועל נובע מקולות שנפלו מתחת לאחוז החסימה`, bloc: votesCf },
      ...(dr ? [
        { key: "demo", title: "המודל הדמוגרפי", note: `גידול האוכלוסייה בלבד, בלי אף סקר: ${r1(dr.demographic ?? 0)} מנדטים לימין ולחרדים (חלקם בקולות כפול 120, לפני אחוז החסימה)`, bloc: shiftR(base22, (dr.demographic ?? v22) - base22.right) },
        { key: "geo", title: "המודל הגיאוגרפי", note: `המשך הקו של כל יישוב: ${r1(dr.geographic ?? 0)} מנדטים לימין ולחרדים`, bloc: shiftR(base22, (dr.geographic ?? v22) - base22.right) },
        { key: "zero", title: "טווח הסטייה של שני המודלים", note: `החישוב בקולות נטו. ממוצע האומדנים ${r1(dr.mean)}. טווח של ${scF.scenario.deviationPercent ?? 2.5}% מטה (הירידה הגדולה ביותר בבדיקה לאחור של 4 הבחירות האחרונות) נותן קצה תחתון של ${r1(scF.scenario.structuralLowerBound ?? 0)}: אליו, ולא מעבר, תועלה התחזית אם היא נמוכה ממנו`, bloc: shiftR(base22, (scF.scenario.structuralLowerBound ?? v22) - base22.right) }
      ] : []),
      { key: "avg", title: "ממוצע הסקרים, משוקלל לפי דיוק עבר", note: "ממצעים כל מכון, ואז משקללים בין המכונים לפי הדרגה: 45 · 35 · 20. וינטר והנדל/זליכה נספרות לגוש הימין בכל סקר שבו הן מקבלות לפחות 4 מנדטים (התמיכה מחולקת בין הליכוד, עוצמה יהודית והציונות הדתית); בסקר שבו הן מקבלות פחות — לא", bloc: norm(blocOf(scF.rawFull)) },
      { key: "house", title: "תיקון הטעות הקבועה של כל מכון", note: "מזיז מנדטים בתוך הגוש בלבד, לא בין גושים", bloc: null },
      { key: "fixed", title: "המודל החרדי המשולב", note: `ש״ס ${r1(scF.scenario.fixed.shas)}, יהדות התורה ${r1(scF.scenario.fixed.yahadut_hatora)}: 25% דמוגרפיה, 25% גיאוגרפיה, 50% סקרים מתוקנים. רע״ם לפי ממוצע הסקרים המשוקלל בלבד`, bloc: norm(blocOf(scenarioForecast(scF.raw, { ...rawOpts, demographic: 0 }).parties)) },
      { key: "demoAdd", title: `הגידול הדמוגרפי מוסיף עכשיו +${scF.scenario.demographic.toFixed(2)} מנדטים`, note: `מאז 2022 המודלים מעריכים ${sg((dr?.demographic ?? v22) - v22)} (דמוגרפי) ו־${sg((dr?.geographic ?? g.start * 1.2) - g.start * 1.2)} (גיאוגרפי) בקולות נטו; הקצה התחתון של הטווח (${scF.scenario.deviationPercent ?? 2.5}%) הוא ${(scF.scenario.structuralLowerBound ?? 0).toFixed(2)}. המודל החרדי כבר הוסיף ${scF.scenario.harediBlocGain.toFixed(2)}, ולכן ההשלמה בפועל היא ${scF.scenario.demographic.toFixed(2)}`, bloc: norm(blocOf(scF.parties)) },
      { key: "final", title: "אחוז חסימה ובאדר־עופר: 120 מנדטים", note: "רשימה מתחת ל־3.25% לא מקבלת מושב; השאר מחולקים מנדט אחד־אחד, כולל הסכמי עודפים", bloc: null }
    ];
    const iHouse = stepsCalc.findIndex(s => s.key === "house");
    stepsCalc[iHouse].bloc = stepsCalc[iHouse - 1].bloc;           // התיקון זז בתוך הגושים בלבד
    const seats = allocateSeats(scF.parties), fin = blocOf(seats);
    stepsCalc[stepsCalc.length - 1].bloc = fin;
    /* הקשת: ימין וחרדים | הרשימות הערביות (ירוק, באמצע) | מרכז־שמאל */
    const armRank = p => p.al === "Right" || p.al === "Haredi" ? 0 : (p.al === "Arabs" || ARAB_FAMILY.has(normId(p.id))) ? 1 : 2;
    const partySeats = Object.entries(seats).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, name: partyMeta(id).name, color: partyHue(id), al: partyMeta(id).alignment }))
      .sort((a, b) => armRank(a) - armRank(b) || b.n - a.n);

    return {
      seatsRef: { demo: dr?.demographic ?? v22, geo: dr?.geographic ?? v22, polls: cb.seatsAvgBy.right }, cb, g, rows, W, simpleAvg, stepsCalc, fin, partySeats, simpleBloc: blocOf(allocateSeats(sF.parties)), weightedBloc: blocOf(allocateSeats(wF.parties)),
      sectors: S.demo.sectors.map(s => ({ id: s.id, name: s.name, e: s.eligible2022, growth: s.growth, turnout: s.turnout })),
      demo: { r22: cb.rightShare0, base: dr?.demographic != null ? dr.demographic / 1.2 : cb.rightShare0 + cb.growth, pts: dr?.demographic != null ? dr.demographic / 1.2 - cb.rightShare0 : cb.growth, seats: dr?.demographic ?? 0, years: S.demo.meta.years },
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
      ["ציוני הדיוק של המכונים", "ויקיפדיה · סקרי החודש שלפני בחירות 2020, 2021 ו־2022 מול התוצאה", S.stats.length, "מכונים עם ציון"]
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
    l1.innerHTML = `עד 2026 חלק הימין והחרדים עובר מ־<b>${pc(D.demo.r22)}</b> ל־<b>${pc(D.demo.base)}</b> מהקולות, כלומר <b>${r1(D.demo.seats)}</b> מתוך 120. זה האומדן הדמוגרפי, <b>בלי שום סקר</b>, והוא אחד משני האומדנים שקובעים את טווח הסטייה. החישוב נעשה בקולות נטו: חלק הגוש מכלל הקולות, ורק בסוף מתורגם למנדטים.`;
    st.ledger.demo = D.seatsRef.demo; ledger(); say(`האומדן הדמוגרפי: ${r1(D.seatsRef.demo)} מנדטים לימין ולחרדים (${pc(D.demo.base)} מהקולות)`);
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
    const g = D.g, rows = [["2022, מתוך ארבע הקבוצות", g.start, g.start], ["אחרי גידול מספר הבוחרים ביישובים", g.start, g.afterDemo], ["אחרי שיעורי ההצבעה", g.afterDemo, g.afterTurn], ["אחרי מגמת היישובים", g.afterTurn, g.end]];
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
    st.ledger.geo = D.seatsRef.geo; ledger(); say(`האומדן הגיאוגרפי: ${r1(D.seatsRef.geo)} מנדטים לימין ולחרדים (${pc(g.end)} מהקולות)`);
    await sleep(2200);
  }

  /* ---------- שלב 4: הסקרים, לפי אמינות ---------- */
  async function scenePolls() {
    const rows = D.rows, zero = D.cb.zeroSeats, sn = v => r1(v);
    /* מנדטים, לא אחוזים: ימין וחרדים | ערבים | מרכז־שמאל — סך הכול 120 בכל סקר */
    const seg = (v, cls) => `<i class="ms-pl-seg ${cls}" style="flex:${v}"><b dir="ltr">${v >= 3 ? sn(v) : ""}</b></i>`;
    setStage(`<div class="ms-polls"><div class="ms-pl-head"><span></span><span>מכון</span><span>דרגה</span><span class="ms-pl-axis">חלוקת 120 המנדטים בסקר האחרון <em class="k-r">ימין וחרדים</em><em class="k-a">ערבים</em><em class="k-l">מרכז־שמאל</em></span><span>משקל</span></div>
      <div class="ms-pl-rows">${rows.map((r, i) => `<div class="ms-pl-row" data-i="${i}">${logoBox(r.meta, 26)}<span class="ms-pl-n"><b>${esc(r.meta.he || r.meta.firm)}</b><small>${esc(r.date)}</small></span>
        <span class="ms-pl-g"><em class="grade ${r.grade.key}">${esc(r.grade.label)}</em><small>ציון ${r1(r.score)}</small></span>
        <div class="ms-pl-track"><span class="ms-pl-bar">${seg(r.seats.right, "r")}${seg(r.seats.arab, "a")}${seg(r.seats.left, "l")}</span><i class="ms-pl-exp" style="left:${zero / 120 * 100}%"></i></div>
        <span class="ms-pl-w"><i></i><b>${Math.round(100 * r.w / D.W)}%</b></span></div>`).join("")}</div>
      <div class="ms-pl-avg"><div class="k-r"><small>ימין וחרדים · ממוצע משוקלל, מנדטים</small><b dir="ltr" id="ms-pl-w">—</b></div><div class="k-a"><small>ערבים</small><b dir="ltr" id="ms-pl-a">—</b></div><div class="k-l"><small>מרכז־שמאל</small><b dir="ltr" id="ms-pl-l">—</b></div><p class="ms-note">הקו המקווקו: מה שהיה צפוי לימין ולחרדים בלי שאיש עובר צד (כ־${Math.round(zero)} מנדטים)</p></div></div>`);
    let sumW = 0, sumL = 0, sumA = 0, wS = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], row = stage.querySelector(`[data-i="${i}"]`);
      row.classList.add("is-on"); say(`${r.meta.he || r.meta.firm}: ימין וחרדים ${sn(r.seats.right)} · ערבים ${sn(r.seats.arab)} · מרכז־שמאל ${sn(r.seats.left)} מנדטים (${r.date})`);
      await sleep(380); row.classList.add("is-dot");
      await sleep(380); row.classList.add("is-tier"); row.querySelector(".ms-pl-w i").style.width = `${r.w / .45 * 100}%`;
      sumW += r.seats.right * r.w; sumL += r.seats.left * r.w; sumA += r.seats.arab * r.w; wS += r.w;
      stage.querySelector("#ms-pl-w").textContent = sn(sumW / wS); stage.querySelector("#ms-pl-l").textContent = sn(sumL / wS); stage.querySelector("#ms-pl-a").textContent = sn(sumA / wS);
      await sleep(430); row.classList.remove("is-on"); row.classList.add("is-done");
    }
    stage.querySelector(".ms-pl-avg").classList.add("is-fin");
    st.ledger.polls = D.seatsRef.polls; ledger(); say(`ממוצע הסקרים, משוקלל לפי דיוק עבר: ימין וחרדים ${sn(D.cb.seatsAvgBy.right)} · ערבים ${sn(D.cb.seatsAvgBy.arab)} · מרכז־שמאל ${sn(D.cb.seatsAvgBy.left)} מנדטים`);
    await sleep(2400);
  }

  /* ---------- שלב 5: כמה עברו צד ---------- */
  async function sceneSwitch() {
    const cb = D.cb, Z = Math.round(cb.zeroSeats), Pi = Math.round(cb.seatsAvgBy.right), Ai = Math.round(cb.seatsAvgBy.arab), gapN = Math.max(0, Z - Pi);
    const rows = [...D.rows].sort((a, b) => a.delta - b.delta), dMax = Math.max(1, ...rows.map(r => Math.abs(r.delta)));
    const sg = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    const sq = (cls, i) => `<i class="ms-sq ${cls}${i >= Pi && i < Z ? " gapq" : ""}"></i>`;
    const stripA = Array.from({ length: 120 }, (_, i) => sq(i < Z ? "r" : "n", i)).join("");
    const stripB = Array.from({ length: 120 }, (_, i) => sq(i < Pi ? "r" : i < Pi + Ai ? "a" : "l", i)).join("");
    setStage(`<div class="ms-two ms-sw2"><div class="ms-col">
        <div class="ms-st" id="ms-stA" hidden><h3>בלי שאף אחד עובר צד</h3><div class="ms-sqs">${stripA}</div><p class="ms-st-n"><b dir="ltr">${Z}</b> מנדטים לימין ולחרדים</p></div>
        <div class="ms-st" id="ms-stB" hidden><h3>מה שהסקרים אומרים</h3><div class="ms-sqs">${stripB}</div><p class="ms-st-n"><b dir="ltr">${Pi}</b> מנדטים לימין ולחרדים</p></div>
        <p class="ms-gapline" id="ms-gapline" hidden><b dir="ltr">${gapN}</b> מנדטים חסרים, כ־<b>${cb.kv(cb.votersAvg)}</b> מצביעים שעברו גוש או נשארו בבית</p></div>
      <div class="ms-col" id="ms-firmcol" hidden><h3>כל מכון: ימין וחרדים, מנדטים יותר או פחות מהצפי</h3><div class="ms-dv">${rows.map((r, i) => `<div class="ms-dv-row" data-i="${i}"><span>${esc(r.meta.he || r.meta.firm)}</span><div class="ms-dv-t"><i class="ms-mid"></i><i class="ms-dvb ${r.delta >= 0 ? "is-pos" : "is-neg"}" style="--w:${Math.abs(r.delta) / dMax * 48}%"></i></div><b dir="ltr">${sg(r.delta)}</b></div>`).join("")}</div>
        <p class="ms-key"><i style="background:#2563B0"></i>יותר מהצפי<i style="background:#C0392B"></i>פחות מהצפי<span>· הקו האמצעי: הצפי בלי מעבר צד (${Z})</span></p></div></div>`);
    const reveal = async (id, label, say1) => { const el = stage.querySelector(id); el.hidden = false; say(say1); const sqs = [...el.querySelectorAll(".ms-sq")]; sqs.forEach(e => e.style.opacity = 0); await tween(1100, p => { const n = Math.floor(sqs.length * p); sqs.forEach((e, k) => { e.style.opacity = k < n ? 1 : 0; }); }); };
    await reveal("#ms-stA", "A", `בלי שאף אחד עובר צד: כ־${Z} מנדטים לימין ולחרדים`);
    await sleep(900);
    await reveal("#ms-stB", "B", `ככה הסקרים רואים את זה: ${Pi} מנדטים`);
    await sleep(500);
    stage.querySelectorAll(".gapq").forEach(e => e.classList.add("is-gap"));
    const gl = stage.querySelector("#ms-gapline"); gl.hidden = false;
    say(`ההפרש: ${gapN} מנדטים, כ־${cb.kv(cb.votersAvg)} מצביעים`);
    await sleep(2200);
    stage.querySelector("#ms-firmcol").hidden = false; say("כל מכון נותן פער אחר");
    for (let i = 0; i < rows.length; i++) { stage.querySelector(`.ms-dv-row[data-i="${i}"]`).classList.add("is-in"); await sleep(380); }
    const up = rows.filter(r => r.delta > .05).length, dn = rows.filter(r => r.delta < -.05).length;
    st.ledger.switch = cb.deltaAvg; ledger(); say(`${up} מכונים מעל הצפי, ${dn} מתחתיו`);
    await sleep(2000);
  }

  /* ---------- שלב 6: תחשיב הברומטר ---------- */
  async function sceneCalc() {
    const steps = D.stepsCalc, MAX = 80, cols = [["right", "ימין וחרדים", R_COL()], ["arab", "ערבים", A_COL()], ["left", "מרכז־שמאל", L_COL()]];
    setStage(`<div class="ms-cv"><div class="ms-cv-chart"><div class="ms-cv-plots"><i class="ms-cv-line" style="bottom:${61 / MAX * 100}%"><span>61 · רוב</span></i>
        ${cols.map(([k, , c]) => `<div class="ms-cv-col" data-b="${k}" style="--c:${c}"><i class="ms-cv-ghost"></i><i class="ms-cv-bar"></i><div class="ms-cv-v"><b dir="ltr">0</b><em dir="ltr"></em></div></div>`).join("")}</div>
        <div class="ms-cv-names">${cols.map(([, n, c]) => `<span style="--c:${c}">${n}</span>`).join("")}</div></div>
      <div class="ms-cv-side" id="ms-cv-side"><div class="ms-cv-now"><span class="ms-cv-n" id="ms-cv-n">1</span><b id="ms-cv-t"></b><small id="ms-cv-s"></small></div>
        <ol class="ms-cv-steps" aria-label="התקדמות">${steps.map((s, i) => `<li data-i="${i}" title="${esc(s.title)}">${i + 1}</li>`).join("")}</ol>
        <div class="ms-hemi" id="ms-hemi" hidden></div></div></div>`);
    const colEl = k => stage.querySelector(`.ms-cv-col[data-b="${k}"]`);
    const paint = (from, to, p) => cols.forEach(([k]) => { const v = from ? lerp(from[k], to[k], p) : to[k] * p, c = colEl(k); c.style.setProperty("--h", `${v / MAX * 100}%`); c.querySelector("b").textContent = r1(v); });
    let prev = null;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], li = stage.querySelector(`li[data-i="${i}"]`), last = i === steps.length - 1;
      li.classList.add("is-on"); say(`שלב ${i + 1} מתוך ${steps.length}`);
      stage.querySelector("#ms-cv-n").textContent = i + 1; stage.querySelector("#ms-cv-t").textContent = s.title; stage.querySelector("#ms-cv-s").textContent = s.note;
      cols.forEach(([k]) => { const c = colEl(k); c.style.setProperty("--gh", prev ? `${prev[k] / MAX * 100}%` : "0%"); c.querySelector("em").textContent = ""; c.querySelector("em").className = ""; });
      await tween(i === 0 ? 1300 : 850, p => paint(prev, s.bloc, p));
      const ref = s.ref || prev;
      if (ref) cols.forEach(([k]) => { const d = s.bloc[k] - ref[k], em = colEl(k).querySelector("em"); if (Math.abs(d) >= .05) { em.textContent = `${d > 0 ? "▲" : "▼"} ${r1(Math.abs(d))}`; em.className = d > 0 ? "up" : "down"; } });
      if (last) {
        stage.querySelector("#ms-cv-side").classList.add("is-final");
        const hemi = stage.querySelector("#ms-hemi"); hemi.hidden = false;
        hemi.innerHTML = hemicycleSVG(D.partySeats.map(p => ({ color: p.color, count: p.n, label: `${p.name}: ${p.n}`, key: p.id })), { aria: "120 המנדטים" });
        const seatsEl = [...hemi.querySelectorAll(".hemi-seat")]; seatsEl.forEach(e => e.style.opacity = 0);
        await tween(2000, p => { const n = Math.floor(seatsEl.length * p); seatsEl.forEach((e, k) => { e.style.opacity = k < n ? 1 : 0; }); });
        hemi.insertAdjacentHTML("beforeend", `<p class="ms-result"><b>הברומטר:</b> ימין וחרדים <b>${D.fin.right}</b> · מרכז־שמאל <b>${D.fin.left}</b> · ערבים <b>${D.fin.arab}</b></p>`);
      } else await sleep(i < 2 ? 1500 : 1100);
      li.classList.remove("is-on"); li.classList.add("is-done"); prev = s.bloc;
    }
    st.ledger.final = D.fin.right; ledger(); say(`תחזית הברומטר: ימין וחרדים ${D.fin.right} · מרכז־שמאל ${D.fin.left} · ערבים ${D.fin.arab}`);
    await sleep(600);
  }

  /* ---------- מה כבר חושב — רצועת התוצאות ---------- */
  const CHIPS = [
    ["demo", "השוואה דמוגרפית, מנדטים לימין ולחרדים", v => r1(v), "ההשלמה מותנית בטווח הסטייה ובתיקון החרדים"],
    ["geo", "השוואה גיאוגרפית, מנדטים", v => r1(v), "ההשלמה מותנית בטווח הסטייה ובתיקון החרדים"],
    ["polls", "ממוצע הסקרים, מנדטים", v => r1(v), "משוקלל לפי דיוק עבר"],
    ["switch", "הפער מול הצפי, מנדטים", v => `${v >= 0 ? "+" : "−"}${r1(Math.abs(v))}`, "מדד לבדיקה, לא משנה מנדט"],
    ["final", "מנדטים לימין ולחרדים", v => String(v), "תחזית הברומטר"]
  ];
  function ledger() {
    const el = q(".ms-ledger"); if (!el) return;
    el.innerHTML = CHIPS.map(([k, n, f, tag]) => `<div class="ms-chip ${st.ledger[k] != null ? "is-on" : ""}" title="${esc(tag)}"><small>${esc(n)}</small><b dir="ltr">${st.ledger[k] != null ? esc(f(st.ledger[k])) : "—"}</b><em>${esc(tag)}</em></div>`).join("");
  }
  function fillLedgerUpTo(i) {
    st.ledger = {};
    if (i > 1) st.ledger.demo = D.seatsRef.demo;
    if (i > 2) st.ledger.geo = D.seatsRef.geo;
    if (i > 3) st.ledger.polls = D.seatsRef.polls;
    if (i > 4) st.ledger.switch = D.cb.deltaAvg;
  }

  /* ---------- בקרה ---------- */
  const SCENES = [sceneData, sceneDemo, sceneGeo, scenePolls, sceneSwitch, sceneCalc];
  const svg = d => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${d}</svg>`;
  const stroke = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const ICON = {
    play: svg(`<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>`),
    pause: svg(`<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>`),
    again: svg(stroke("M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4h-4")),
    right: svg(stroke("M9 5l7 7-7 7")),
    left: svg(stroke("M15 5l-7 7 7 7"))
  };
  const SPEEDS = [1, 2, 4];
  function paintNav() {
    root.querySelectorAll("[data-ms-stage]").forEach((b, i) => { b.classList.toggle("is-on", i === st.stage); b.classList.toggle("is-done", i < st.done + 1 && i !== st.stage); b.setAttribute("aria-current", i === st.stage ? "step" : "false"); });
    const play = q(".ms-play"), mode = st.stage < 0 ? "play" : st.finished ? "again" : st.paused ? "play" : "pause";
    const label = { play: st.stage < 0 ? "הפעלת הסימולציה" : "המשך", pause: "עצירה", again: "הצגה מחדש" }[mode];
    play.innerHTML = ICON[mode]; play.setAttribute("aria-label", label); play.title = label;
    q(".ms-speed").textContent = `${st.speed}×`;
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
    const logoSrc = document.querySelector(".masthead img.brand-logo")?.getAttribute("src") || "assets/logo-wordmark.png";
    root.innerHTML = `<div class="ms-bar"><div class="ms-title"><p class="kicker">סימולציה · בזמן אמת, מהנתונים של היום</p><h2>איך הברומטר מגיע למספר</h2></div>
    </div>
      <nav class="ms-nav" aria-label="שלבי הסימולציה">${STAGES.map((s, i) => `<button type="button" data-ms-stage="${i}"><span>${i + 1}</span>${s.label}</button>`).join("")}</nav>
      <p class="ms-say" aria-live="polite">לחצו על ״הפעלת הסימולציה״ כדי לראות את החישוב שלב אחר שלב, מהנתונים הגולמיים ועד תחזית הברומטר.</p>
      <div class="ms-main"><div class="ms-stagebox"><div class="ms-stage" id="ms-stage"><div class="ms-idle"><img class="ms-idle-logo" src="${logoSrc}" alt="" width="756" height="128">
          <p class="ms-idle-kicker">סימולציה · בזמן אמת, מהנתונים של היום</p>
          <h3 class="ms-idle-title">איך הברומטר מגיע למספר</h3>
          <p class="ms-idle-sub">שישה שלבים, כדקה: מהנתונים הגולמיים ועד תחזית הברומטר</p>
          <button type="button" class="ms-big-play"><span class="ms-big-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>הפעלת המודל</button>
          <p class="ms-idle-hint">אפשר לעצור ולדלג בכל רגע</p></div></div>
        <div class="ms-ctl" role="group" aria-label="בקרת הסימולציה"><button type="button" class="ms-prev" aria-label="לשלב הקודם" title="לשלב הקודם">${ICON.right}</button><button type="button" class="ms-play"></button><button type="button" class="ms-next" aria-label="לשלב הבא" title="לשלב הבא">${ICON.left}</button><span class="ms-count" dir="ltr" aria-hidden="true"></span><button type="button" class="ms-speed" aria-label="מהירות הסימולציה" title="מהירות הסימולציה"></button></div></div>
      <div class="ms-ledger" aria-label="מה כבר חושב"></div></div>`;
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
    q(".ms-speed").onclick = () => { st.speed = SPEEDS[(SPEEDS.indexOf(st.speed) + 1) % SPEEDS.length]; paintNav(); };
    paintNav();
    /* rAF לחלקלקות, וטיימר כגיבוי כשהדפדפן מקפיא פריימים (חלונית מוסתרת/מוטמעת); שניהם מחשבים לפי השעון, לכן אין ספירה כפולה */
    const loop = () => { tick(); st.raf = requestAnimationFrame(loop); };
    st.raf = requestAnimationFrame(loop); st.timer = setInterval(tick, 40);
    document.addEventListener("barometer:view", () => { if (S.view !== "home" && st.stage >= 0 && !st.paused) { st.paused = true; paintNav(); } });
    document.addEventListener("barometer:simulation-hidden", () => { if (st.stage >= 0 && !st.paused) { st.paused = true; paintNav(); } });
  }


  /* ---------- שאר העמוד: מספרים חיים לשני הסעיפים החדשים, תוכן עניינים, וכפתורי "הצגה בסימולציה" ---------- */
  function fillLive() {
    const chips = (id, items) => { const el = document.getElementById(id); if (el) el.innerHTML = items.map(([n, l]) => `<div><b class="num" dir="ltr">${n}</b><span>${esc(l)}</span></div>`).join(""); };
    const g = D.g, cb = D.cb, sg = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    chips("m-live-geo", [[fmt(g.localities), "יישובים בחישוב"], [pc(g.start), "ימין וחרדים ב־2022, מארבע הקבוצות"], [sg(g.afterDemo - g.start), "נקודות אחוז מגידול מספר הבוחרים ביישובים"], [sg(g.afterTurn - g.afterDemo), "נקודות אחוז משיעורי ההצבעה"], [sg(g.end - g.afterTurn), "נקודות אחוז ממגמת היישובים"], [pc(g.end), "הצפי ל־2026"], [sg(g.seatsPts), "הערכת מנדטים: שינוי לימין וחרדים"], [r1(g.seats26), `ימין וחרדים ב־2026, חלק הקולות כפול 120 (2022: ${r1(g.seats22)})`]]);
    const above = D.rows.filter(r => r.delta > .05).length, below = D.rows.filter(r => r.delta < -.05).length;
    chips("m-live-switch", [[sg(cb.deltaAvg), `הפער במנדטים (בלי מעבר צד: כ־${r1(cb.zeroSeats)})`], [`≈ ${cb.kv(cb.votersAvg)}`, "קולות"], [String(above), "מכונים מעל הצפי"], [String(below), "מכונים מתחתיו"]]);
  }
  function wireDoc() {
    const smooth = reduce() ? "auto" : "smooth";
    document.querySelectorAll(".mdoc-nav [data-go]").forEach(b => b.onclick = () => document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: smooth, block: "start" }));
    document.querySelectorAll(".msec-sim").forEach(b => b.onclick = () => {
      if (!st.ready) return;
      /* הסימולטור יושב בעמוד התחזית: עוברים אליו ומתחילים מהשלב שנבחר */
      if (S.view !== "home") location.hash = "#/forecast";
      setTimeout(() => { document.dispatchEvent(new CustomEvent('barometer:forecast-panel', {detail:'simulation'})); root.scrollIntoView({ behavior: smooth, block: "start" }); go(Number(b.dataset.sim)); }, 60);
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
  window.refreshMethodSim = async () => {
    if (!root || !st.ready) return;
    cancelAll(); st.ready = false;
    const heavy = await loadHeavy();
    D = collect(heavy); D.dots = localityDots(heavy.T, heavy.RES);
    st.stage = -1; st.done = -1; st.finished = false; st.paused = false; st.ledger = {};
    build(); st.ready = true; fillLive();
  };
  window.initMethodSim = init;
  if (S.cur) init();
})();
