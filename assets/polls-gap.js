/* למה הסקרים חלוקים? — הלשונית הראשונה בכל הסקרים.
   פותחים בשני סקרים — כברירת מחדל הקיצוניים של השבועיים האחרונים (הכי הרבה והכי
   מעט מנדטים לגוש הימין והחרדים) — עם הפער ביניהם במנדטים, במצביעים ובאחוזים,
   ושואלים מי מהם קרוב יותר לאמת. אחרי הבחירה מפרקים את הפער (באיזו רשימה הוא
   נוצר, ואיפה שני הסקרים יושבים מול שאר הסקרים ומול תחזית הברומטר), מזמינים
   לבדוק מי צדק בפעם הקודמת (כל מכון מול התוצאה האמיתית בשלוש הבחירות האחרונות),
   ובסוף מזמינים את הצופה לחקור בעצמו. אפשר להחליף כל אחד מהסקרים או להגריל זוג.
   "hi" ו־"lo" הם שני הכרטיסים (הימני, כחול, והשמאלי, אדום) — לא בהכרח הגבוה והנמוך.
   הכול מחושב מהנתונים החיים של האתר; אין כאן טענה על כוונות של מכון. */
const GAP_WINDOW_DAYS = 14, GAP_MAJORITY = 61, GAP_ROWS = 4;
const GAP_MINUS = "−";
const gapSigned = v => Math.abs(v) < 0.05 ? "0" : `${v < 0 ? GAP_MINUS : "+"}${trFmt(Math.abs(v))}`;

/* הסקר האחרון של כל צירוף מכון + ערוץ בחלון הזמן, מהחדש לישן */
function gapSources(pool) {
  const seen = new Set();
  return [...pool].sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0))
    .filter(p => { const k = `${p.channelHebrewName}|${firmOf(p.sourceId).firm}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/* הסקר הגבוה והנמוך ביותר לגוש; בשוויון — החדש יותר */
function gapPick(pool, rightOf) {
  const t = p => parsePollDate(p);
  return {
    hi: [...pool].sort((a, b) => rightOf(b) - rightOf(a) || t(b) - t(a))[0],
    lo: [...pool].sort((a, b) => rightOf(a) - rightOf(b) || t(b) - t(a))[0]
  };
}

/* הגרלה: שני סקרים שונים, ואם אפשר משני ערוצים שונים */
function gapRandomPair(sources, rnd = Math.random) {
  if (sources.length < 2) return null;
  const first = sources[Math.floor(rnd() * sources.length)];
  const others = sources.filter(p => p !== first), apart = others.filter(p => p.channelHebrewName !== first.channelHebrewName);
  const list = apart.length ? apart : others;
  return [first, list[Math.floor(rnd() * list.length)]];
}

/* הרשימות שבהן שני הסקרים נבדלים ביותר, מהפער הגדול לקטן */
function gapParties(vHi, vLo) {
  const ids = [...new Set([...Object.keys(vHi.parties), ...Object.keys(vLo.parties)])];
  return ids.map(id => ({ id, name: NAME_OVERRIDE[id] || partyMeta(id).name, right: partyMeta(id).alignment === "Right", hi: vHi.parties[id] || 0, lo: vLo.parties[id] || 0 }))
    .map(r => ({ ...r, d: r.hi - r.lo })).filter(r => r.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
}

/* לכל מערכת בחירות: ההפרש של כל מכון בגוש נתניהו — ממוצע סקרי 30 הימים שלפני הבחירות פחות התוצאה */
function gapRecordRows(elections) {
  return elections.map(e => {
    const defs = e.data.blocs || BLOCS_2022, actual = histBlocs(e.data.actual, defs).netanyahu, by = {};
    e.data.polls.filter(p => p.firm).forEach(p => (by[p.firm] ||= []).push(histBlocs(p.p, defs).netanyahu));
    return { key: e.key, name: e.election, actual, dots: Object.entries(by).map(([firm, v]) => ({ firm, err: avg(v) - actual, n: v.length })) };
  });
}

/* כמה מדידות מתחת לתוצאה, ומי משני המכונים היה קרוב יותר בבחירות שבהן נמדדו שניהם */
function gapRecordStats(rows, hiId, loId) {
  const dots = rows.flatMap(r => r.dots), find = (r, id) => r.dots.find(d => d.firm === id);
  const both = rows.filter(r => find(r, hiId) && find(r, loId));
  return { total: dots.length, below: dots.filter(d => d.err < -0.05).length, compared: both.length,
    hiCloser: both.filter(r => Math.abs(find(r, hiId).err) < Math.abs(find(r, loId).err)).length,
    loCloser: both.filter(r => Math.abs(find(r, loId).err) < Math.abs(find(r, hiId).err)).length };
}

/* נקודות שקרובות מדי זו לזו (באחוזי רוחב) עוברות לנתיב אחר, כדי שלא יסתירו */
function gapLanes(xs, minGap = 2.2, maxLane = 2) {
  const lanes = [];
  return xs.map(x => {
    let k = lanes.findIndex(l => l.every(v => Math.abs(v - x) >= minGap));
    if (k < 0) k = lanes.length <= maxLane ? lanes.length : maxLane;
    (lanes[k] ||= []).push(x);
    return k;
  });
}

/* sel = { a, b } — מזהי הסקרים שהצופה בחר; בלעדיו (או אם אינם תקפים) — שני הקצוות */
function pollGapModel(sel) {
  const P = trackerModel();
  if (!P || !S.house) return null;
  const rightOf = p => P.vec.get(p.id).blocs.Right;
  const last = Math.max(...P.polls.map(parsePollDate));
  let pool = P.polls.filter(p => parsePollDate(p) >= last - GAP_WINDOW_DAYS * DAY_MS);
  if (pool.length < 4) pool = P.polls.filter(p => parsePollDate(p) >= last - 30 * DAY_MS);
  const sources = gapSources(pool);
  if (sources.length < 2) return null;
  const byId = new Map(sources.map(p => [p.id, p]));
  let hi = sel && byId.get(sel.a), lo = sel && byId.get(sel.b);
  const custom = !!(hi && lo && hi !== lo);
  if (!custom) ({ hi, lo } = gapPick(sources, rightOf));
  if (hi.id === lo.id) return null;
  const side = p => {
    const meta = firmOf(p.sourceId).meta, v = P.vec.get(p.id);
    const heir = meta.calibrationFirm && meta.calibrationFirm !== meta.id ? S.firms.firms.find(x => x.id === meta.calibrationFirm) : null;
    return { p, v, meta, heir, right: v.blocs.Right, outlet: p.channelHebrewName };
  };
  const vals = sources.map(rightOf).sort((a, b) => a - b), diff = rightOf(hi) - rightOf(lo), gap = Math.abs(diff);
  let baro = null, people = null;
  try { const m = basisModel(P, "baro"); if (m.basis === "baro") baro = m.now.blocs.Right; } catch { /* בלי תחזית חיה */ }
  /* מנדט = 1/120 מהקולות שמתורגמים למנדטים; מצביעים לפי המספר הצפוי ב־2026, כמו ב"כמה עברו צד" */
  try { if (S.regions) { const c = crossoverBase(); people = { voters: c.votersOf(100 * gap / 120), perSeat: c.votersOf(100 / 120), kv: c.kv }; } } catch { /* בלי המרה למצביעים */ }
  return { hi: side(hi), lo: side(lo), custom, sources, diff, gap, pct: 100 * gap / 120, people, n: sources.length, vals, median: (vals[(vals.length - 1) >> 1] + vals[vals.length >> 1]) / 2, baro, parties: gapParties(P.vec.get(hi.id), P.vec.get(lo.id)),
    options: sources.map(p => ({ id: p.id, label: `${p.channelHebrewName} · ${firmOf(p.sourceId).meta.he} · ${trDay(parsePollDate(p))}` })) };
}

/* ---------- ציור ---------- */
const gapInfo = text => `<span class="tr-info" tabindex="0" role="note" title="${esc(text)}" aria-label="${esc(text)}">ⓘ</span>`;
const GAP_PEOPLE_NOTE = "מנדט הוא 1/120 מהקולות שמתורגמים למנדטים. המצביעים מחושבים לפי מספר המצביעים הצפוי ב־2026, באותה הנחה כמו בלשונית \"כמה עברו צד\". זה אומדן של גודל הפער, לא ספירה של אנשים.";
const gapPctText = m => `${trFmt(Math.round(m.pct * 10) / 10)}%`;
const GAP_INVITE = [
  ["trend", "#/polls/trend", "מבט כולל ומגמות", "איך הגושים והמפלגות זזו מאז אוגוסט"],
  ["list", "#/polls/list", "כל סקר בנפרד", "כל הסקרים בטבלה אחת, מהחדש לישן"],
  ["cross", "#/crossover", "כמה עברו צד", "כמה מצביעים זזו מאז 2022"],
  ["acc", "#/2022", "דיוק המכונים", "הציון והראיות לכל מכון"]
];

function gapCard(s, kind, picked, m) {
  const other = kind === "hi" ? m.lo : m.hi;
  const bar = ["Right", "Unknown", "Arabs", "Left"].filter(k => s.v.blocs[k] > 0)
    .map(k => `<span style="flex:${s.v.blocs[k]};background:${BLOCS[k].color}">${s.v.blocs[k] >= 7 ? s.v.blocs[k] : ""}</span>`).join("");
  const win = s.right >= GAP_MAJORITY;
  return `<article class="tr-card gap-poll gap-${kind}${picked === kind ? " is-picked" : ""}">
    <header>${outletLogo(s.outlet)}<label class="gap-choose"><span class="sr-only">${kind === "hi" ? "הסקר הימני" : "הסקר השמאלי"} — החלפה</span><select data-gap-side="${kind}">${m.options.map(o =>
      `<option value="${esc(o.id)}"${o.id === s.p.id ? " selected" : ""}${o.id === other.p.id ? " disabled" : ""}>${esc(o.label)}</option>`).join("")}</select></label></header>
    <div class="gap-num"><b dir="ltr">${s.right}</b><span>מנדטים לגוש<br>הימין והחרדים</span></div>
    <div class="gap-bar" role="img" aria-label="${esc(["Right", "Unknown", "Arabs", "Left"].filter(k => s.v.blocs[k] > 0).map(k => `${BLOCS[k].he} ${s.v.blocs[k]}`).join(", "))}">${bar}<i class="gap-61" title="${GAP_MAJORITY}"></i></div>
    <p class="gap-verdict ${win ? "yes" : "no"}">${win ? `יש רוב · ${s.right - GAP_MAJORITY} מעל ${GAP_MAJORITY}` : `אין רוב · חסרים ${GAP_MAJORITY - s.right}`}</p></article>`;
}

/* הפער במנדטים, ובאנשים: כך וכך מצביעים, כך וכך אחוז מהם */
function gapDiff(m, cta) {
  const p = m.people;
  return `<div class="gap-diff"><b>${m.gap}</b><span>מנדטים<br>הפרש</span>
    <div class="gap-people" title="${esc(GAP_PEOPLE_NOTE)}">${p ? `<strong dir="ltr">≈ ${p.kv(p.voters)}</strong><span>מצביעים</span>` : ""}<em dir="ltr">${gapPctText(m)}</em><span>מהמצביעים</span></div>${cta ? `<button type="button" class="gap-cta" data-gap-stage="record" aria-label="ומי צדק בפעם הקודמת?"><span>ומי צדק</span><b>בפעם הקודמת?</b><i aria-hidden="true">←</i></button><small class="gap-cta-hint">מול שלוש הבחירות האחרונות</small>` : ""}</div>`;
}

function gapParts(m) {
  const rows = m.parties.slice(0, GAP_ROWS);
  if (!rows.length) return `<div class="tr-card gap-parts"><h3>המנדטים זהים בכל הרשימות</h3></div>`;
  const top = rows[0], max = Math.max(...rows.flatMap(r => [r.hi, r.lo]), 1);
  const inBloc = top.right && Math.sign(top.d) === Math.sign(m.diff);
  return `<div class="tr-card gap-parts">
    <h3>${esc(top.name)}: <span dir="ltr">${top.hi}</span> מול <span dir="ltr">${top.lo}</span></h3>
    <p>${inBloc ? `${Math.abs(top.d)} מתוך ${m.gap} המנדטים שמפרידים בין הסקרים נמצאים ברשימה אחת.` : `זה ההפרש הגדול ביותר בין שני הסקרים.`}</p>
    <table><thead><tr><th scope="col"><span class="sr-only">רשימה</span></th><th scope="col">${esc(m.hi.outlet)}</th><th scope="col">${esc(m.lo.outlet)}</th></tr></thead><tbody>${rows.map((r, i) =>
      `<tr${i ? "" : ' class="is-top"'}><th scope="row">${esc(r.name)}</th><td><span class="gap-b" style="--w:${(100 * r.hi / max).toFixed(1)}%"><b>${r.hi}</b></span></td><td><span class="gap-b" style="--w:${(100 * r.lo / max).toFixed(1)}%"><b>${r.lo}</b></span></td></tr>`).join("")}</tbody></table></div>`;
}

function gapScale(m) {
  const marks = [...m.vals, GAP_MAJORITY, ...(m.baro == null ? [] : [m.baro])];
  const from = Math.floor((Math.min(...marks) - 1) / 5) * 5, to = Math.ceil((Math.max(...marks) + 1) / 5) * 5;
  const x = v => (100 * (v - from) / (to - from)).toFixed(2);
  const seen = {}, dots = m.vals.map(v => { const k = seen[v] = (seen[v] || 0) + 1; return `<i class="gap-dot" style="left:${x(v)}%;bottom:${22 + (k - 1) * 11}px"></i>`; }).join("");
  const ticks = []; for (let v = from; v <= to; v += 5) ticks.push(v);
  const flag = (s, cls) => `<span class="gap-flag ${cls}" style="left:${x(s.right)}%"><b dir="ltr">${s.right}</b> ${esc(s.outlet)}</span><i class="gap-pin ${cls}" style="left:${x(s.right)}%"></i>`;
  return `<div class="tr-card gap-scale">
    <h3>${m.n} סקרים אחרונים · החציון <span dir="ltr">${trFmt(m.median)}</span></h3>
    <p>${m.baro == null ? "כל נקודה היא סקר אחרון של מכון בערוץ." : `כל נקודה היא סקר אחרון של מכון בערוץ. תחזית הברומטר: <b>${m.baro}</b> — משוקללת לפי דיוק המכונים בעבר ${gapInfo("סקרי 8 הימים האחרונים משוקללים לפי ציון הדיוק של כל מכון, עם תיקון הטעות הקבועה שלו ועם חלוקת המנדטים לפי כללי הבחירות.")}`}</p>
    <div class="gap-plot" dir="ltr" role="img" aria-label="${esc(`סקרים לפי מנדטים לגוש הימין: ${m.hi.outlet} ${m.hi.right}, ${m.lo.outlet} ${m.lo.right}, החציון ${trFmt(m.median)}${m.baro == null ? "" : `, תחזית הברומטר ${m.baro}`}`)}">
      <i class="gap-maj" style="left:${x(GAP_MAJORITY)}%"><em>${GAP_MAJORITY} · רוב</em></i>
      ${dots}${flag(m.hi, "hi")}${m.lo.right === m.hi.right ? "" : flag(m.lo, "lo")}
      <div class="gap-axis">${ticks.map(v => `<span style="left:${x(v)}%">${v}</span>`).join("")}</div>
      ${m.baro == null ? "" : `<i class="gap-baro" style="left:${x(m.baro)}%"><em>הברומטר ${m.baro}</em></i>`}
    </div></div>`;
}

/* מי צדק בפעם הקודמת: שורה לכל מערכת בחירות, נקודה לכל מכון, וקו אחד — התוצאה האמיתית */
function gapRecord(m) {
  const rows = gapRecordRows(S.elections || []);
  if (!rows.length) return "";
  const nameOf = id => (S.firms.firms.find(f => f.id === id) || {}).he || id;
  const hiId = calibrationId(m.hi.meta), loId = calibrationId(m.lo.meta), same = hiId === loId;
  const st = gapRecordStats(rows, hiId, loId), errs = rows.flatMap(r => r.dots.map(d => d.err));
  const from = Math.floor(Math.min(...errs, -1) - 0.5), to = Math.ceil(Math.max(...errs, 0) + 1.5);
  const x = v => 100 * (v - from) / (to - from);
  const ticks = []; for (let v = Math.ceil(from / 2) * 2; v <= to; v += 2) ticks.push(v);
  const label = (id, s) => `${nameOf(id)}${s.heir ? ` (היום ${s.meta.he})` : ""}`;
  const hiName = label(hiId, m.hi), loName = label(loId, m.lo);
  const rowHTML = r => {
    const role = d => d.firm === hiId ? "hi" : d.firm === loId && !same ? "lo" : "";
    const ordered = [...r.dots.filter(d => role(d)), ...r.dots.filter(d => !role(d)).sort((a, b) => a.err - b.err)];
    const lanes = gapLanes(ordered.map(d => x(d.err)));
    return `<div class="gap-rec-row"><div class="gap-rec-label"><b>${esc(r.name)}</b><small>${r.key} · התוצאה: ${r.actual}</small></div>
      <div class="gap-rec-plot" dir="ltr"><i class="gap-rec-zero" style="left:${x(0).toFixed(2)}%"></i>${ordered.map((d, i) => {
        const cls = role(d), left = x(d.err).toFixed(2), top = 24 + lanes[i] * 10;
        return `<i class="gap-rec-dot ${cls}" style="left:${left}%;top:${top}px" title="${esc(nameOf(d.firm))}: ${gapSigned(d.err)}"></i>` +
          (cls ? `<span class="gap-rec-flag ${cls}" style="left:${left}%">${esc(nameOf(d.firm))} <b dir="ltr">${gapSigned(d.err)}</b></span>` : "");
      }).join("")}</div></div>`;
  };
  const both = st.compared === 1 ? "בבחירות שבהן נמדדו שניהם" : `בכל ${st.compared} הבחירות`;
  const closer = same ? `שני הסקרים הם של אותו מכון — ${hiName}.`
    : !st.compared ? ""
    : st.hiCloser === st.compared ? `${hiName} היה קרוב יותר לתוצאה מ${loName} ${both}.`
    : st.loCloser === st.compared ? `${loName} היה קרוב יותר לתוצאה מ${hiName} ${both}.`
    : !st.hiCloser && !st.loCloser ? `${hiName} ו${loName} סטו מהתוצאה באותה מידה.`
    : `${hiName} היה קרוב יותר לתוצאה מ${loName} ב־${st.hiCloser} מתוך ${st.compared} בחירות.`;
  const what = "כל נקודה היא מכון: ההפרש בין ממוצע הסקרים שלו ב־30 הימים שלפני הבחירות לבין מספר המנדטים שקיבל גוש נתניהו.";
  const how = `${what} מינוס — המכון נתן לגוש פחות ממה שקיבל. המכונים והבחירות לפי ארכיון הסקרים של האתר; במכון עם סקר אחד או שניים הממוצע מבוסס על מעט נתונים.`;
  return `<div class="tr-card gap-record">
    <h3>${st.below} מתוך ${st.total} מדידות של מכונים היו מתחת לתוצאה האמיתית ${gapInfo(how)}</h3>
    <p class="gap-rec-sub">${what}</p>
    <div class="gap-rec-plotwrap">
      <div class="gap-rec-row gap-rec-caption"><div></div><div dir="ltr"><span>← פחות מהתוצאה</span><span>יותר מהתוצאה →</span></div></div>
      ${rows.map(rowHTML).join("")}
      <div class="gap-rec-row gap-rec-axis"><div></div><div dir="ltr">${ticks.map(v => `<span class="${v === 0 ? "is-zero" : ""}" style="left:${x(v).toFixed(2)}%">${v === 0 ? "0 = התוצאה" : gapSigned(v)}</span>`).join("")}</div></div>
    </div>
    ${closer ? `<p class="gap-rec-foot"><b>${closer}</b>${same ? "" : " קרוב יותר בעבר אינו מבטיח שהוא צודק היום."}</p>` : ""}</div>`;
}

function gapInvite() {
  return `<div class="gap-invite"><div class="gap-invite-head"><b>עכשיו תורכם — פתחו את הנתונים וחקרו בעצמכם</b><button type="button" class="gap-back" data-gap-stage="parts">→ חזרה לפירוק הפער</button></div>
    <nav class="gap-invite-links" aria-label="המשך לחקור">${GAP_INVITE.map(([t, href, title, line]) => `<a class="gap-go" href="${href}" data-polls-go="${t}"><b>${title}</b><span>${line}</span></a>`).join("")}</nav></div>`;
}

function renderPollGap() {
  const box = document.querySelector("#poll-gap"); if (!box) return;
  const m = pollGapModel(S.gapSel);
  if (!m) { box.innerHTML = '<p class="gap-empty">עוד אין מספיק סקרים אחרונים כדי להשוות ביניהם.</p>'; return; }
  const picked = S.gapPick || null, revealed = !!picked, record = revealed && S.gapStage === "record";
  box.classList.toggle("is-revealed", revealed);
  box.classList.toggle("is-record", record);
  box.classList.toggle("is-parts", revealed && !record);
  const label = { hi: m.hi.outlet, lo: m.lo.outlet, none: "אף אחד מהם" }[picked];
  const people = m.gap === 0 ? "" : m.people ? `כל מנדט שווה בערך <b>${fmt(Math.round(m.people.perSeat / 1000) * 1000)}</b> מצביעים, כך ש־${m.gap} מנדטים הם כ־<b>${m.people.kv(m.people.voters)}</b> איש — <b>${gapPctText(m)}</b> מהמצביעים. ${gapInfo(GAP_PEOPLE_NOTE)}` : `${m.gap} מנדטים הם <b>${gapPctText(m)}</b> מהמצביעים.`;
  box.innerHTML = `
    <div class="gap-head"><div class="gap-head-text"><h2>${m.gap ? `<span dir="ltr">${m.gap}</span> מנדטים בין שני סקרים מהשבועיים האחרונים` : `שני הסקרים נותנים לגוש אותו מספר מנדטים`}</h2>
      ${people ? `<p class="gap-lead">${people}</p>` : ""}
      <p class="gap-note">${m.custom ? "הסקרים שבחרת" : "הקיצוני ביותר לכל כיוון"}, מתוך ${m.n} סקרים אחרונים (אחד לכל מכון וערוץ). המספרים — מנדטים לגוש הימין והחרדים; ${GAP_MAJORITY} הוא רוב.</p>
      ${revealed ? `<p class="gap-picked">הניחוש שלך: <b>${esc(label)}</b> <button type="button" class="gap-redo" data-gap-pick="reset">לנחש שוב</button></p>` : ""}</div>
      <div class="gap-tools"><button type="button" class="gap-tool" data-gap-random>⇄ הגרילו שני סקרים</button>${m.custom ? `<button type="button" class="gap-tool" data-gap-extremes>חזרה לקיצוניים</button>` : ""}</div></div>
    <div class="gap-board">${gapCard(m.hi, "hi", picked, m)}${gapDiff(m, revealed && !record)}${gapCard(m.lo, "lo", picked, m)}
      ${!revealed ? `<div class="gap-ask"><p>מי מהם קרוב יותר לאמת?</p><div class="gap-choices" role="group" aria-label="בחירה">
          <button type="button" data-gap-pick="hi">${esc(m.hi.outlet)} · <span dir="ltr">${m.hi.right}</span></button>
          <button type="button" data-gap-pick="lo">${esc(m.lo.outlet)} · <span dir="ltr">${m.lo.right}</span></button>
          <button type="button" data-gap-pick="none">אף אחד מהם</button></div></div>`
      : record ? gapRecord(m) : `${gapParts(m)}${gapScale(m)}`}</div>
    ${record ? gapInvite() : ""}`;
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  /* בחירה חדשה של סקרים פותחת את השאלה מחדש */
  const restart = sel => { S.gapSel = sel; S.gapPick = null; S.gapStage = "parts"; renderPollGap(); };
  document.addEventListener("click", e => {
    const pick = e.target.closest("[data-gap-pick]"), stage = e.target.closest("[data-gap-stage]");
    if (e.target.closest("[data-gap-random]")) {
      const m = pollGapModel(S.gapSel), pair = m && gapRandomPair(m.sources);
      if (pair) restart({ a: pair[0].id, b: pair[1].id });
      document.querySelector("[data-gap-random]")?.focus();
      return;
    }
    if (e.target.closest("[data-gap-extremes]")) { restart(null); document.querySelector("[data-gap-random]")?.focus(); return; }
    if (!pick && !stage) return;
    if (pick) { S.gapPick = pick.dataset.gapPick === "reset" ? null : pick.dataset.gapPick; S.gapStage = "parts"; }
    else S.gapStage = stage.dataset.gapStage;
    renderPollGap();
    document.querySelector(stage ? (S.gapStage === "record" ? ".gap-back" : ".gap-cta") : S.gapPick ? ".gap-redo" : "[data-gap-pick]")?.focus();
  });
  document.addEventListener("change", e => {
    const sel = e.target.closest?.("[data-gap-side]"); if (!sel) return;
    const val = k => document.querySelector(`[data-gap-side="${k}"]`).value;
    restart({ a: val("hi"), b: val("lo") });
    document.querySelector(`[data-gap-side="${sel.dataset.gapSide}"]`)?.focus();
  });
});
