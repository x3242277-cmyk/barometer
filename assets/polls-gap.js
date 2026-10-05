/* למה הסקרים חלוקים? — הלשונית הראשונה בכל הסקרים.
   פותחים בשני הסקרים הקיצוניים של השבועיים האחרונים (הכי הרבה והכי מעט מנדטים
   לגוש הימין והחרדים), שואלים מי מהם קרוב יותר לאמת, ואז מפרקים את הפער:
   באיזו רשימה הוא נוצר, איך כל אחד מהמכונים טעה בשלוש הבחירות האחרונות,
   ואיפה הם יושבים מול שאר הסקרים ומול תחזית הברומטר.
   הכול מחושב מהנתונים החיים של האתר; אין כאן טענה על כוונות של מכון. */
const GAP_WINDOW_DAYS = 14, GAP_MAJORITY = 61, GAP_ROWS = 4;
const GAP_MINUS = "−";
const gapSigned = v => Math.abs(v) < 0.05 ? "0" : `${v < 0 ? GAP_MINUS : "+"}${trFmt(Math.abs(v))}`;

/* הסקר הגבוה והנמוך ביותר לגוש; בשוויון — החדש יותר */
function gapPick(pool, rightOf) {
  const t = p => parsePollDate(p);
  return {
    hi: [...pool].sort((a, b) => rightOf(b) - rightOf(a) || t(b) - t(a))[0],
    lo: [...pool].sort((a, b) => rightOf(a) - rightOf(b) || t(b) - t(a))[0]
  };
}

/* הרשימות שבהן שני הסקרים נבדלים ביותר, מהפער הגדול לקטן */
function gapParties(vHi, vLo) {
  const ids = [...new Set([...Object.keys(vHi.parties), ...Object.keys(vLo.parties)])];
  return ids.map(id => ({ id, name: NAME_OVERRIDE[id] || partyMeta(id).name, right: partyMeta(id).alignment === "Right", hi: vHi.parties[id] || 0, lo: vLo.parties[id] || 0 }))
    .map(r => ({ ...r, d: r.hi - r.lo })).filter(r => r.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
}

function gapRunsSummary(runs) {
  const n = runs.length, below = runs.filter(r => r.err < -0.05).length, above = runs.filter(r => r.err > 0.05).length;
  if (!n) return "אין למכון היסטוריית כיול";
  if (below === n) return n === 1 ? "פחות מהתוצאה בבחירות שבהן נמדד" : `פחות מהתוצאה בכל ${n} מערכות הבחירות`;
  if (above === n) return n === 1 ? "יותר מהתוצאה בבחירות שבהן נמדד" : `יותר מהתוצאה בכל ${n} מערכות הבחירות`;
  return `פחות מהתוצאה ב־${below} מתוך ${n} מערכות בחירות`;
}

function pollGapModel() {
  const P = trackerModel();
  if (!P || !S.house) return null;
  const rightOf = p => P.vec.get(p.id).blocs.Right;
  const last = Math.max(...P.polls.map(parsePollDate));
  let pool = P.polls.filter(p => parsePollDate(p) >= last - GAP_WINDOW_DAYS * DAY_MS);
  if (pool.length < 4) pool = P.polls.filter(p => parsePollDate(p) >= last - 30 * DAY_MS);
  if (pool.length < 2) return null;
  const { hi, lo } = gapPick(pool, rightOf);
  if (hi.id === lo.id) return null;
  const side = p => {
    const meta = firmOf(p.sourceId).meta, v = P.vec.get(p.id);
    const heir = meta.calibrationFirm && meta.calibrationFirm !== meta.id ? S.firms.firms.find(x => x.id === meta.calibrationFirm) : null;
    return { p, v, meta, heir, right: v.blocs.Right, outlet: p.channelHebrewName, runs: houseOf(meta)?.bloc.runs || [] };
  };
  const vals = pool.map(rightOf).sort((a, b) => a - b);
  let baro = null;
  try { const m = basisModel(P, "baro"); if (m.basis === "baro") baro = m.now.blocs.Right; } catch { /* בלי תחזית חיה */ }
  return { hi: side(hi), lo: side(lo), gap: rightOf(hi) - rightOf(lo), n: pool.length, vals, median: (vals[(vals.length - 1) >> 1] + vals[vals.length >> 1]) / 2, baro, parties: gapParties(P.vec.get(hi.id), P.vec.get(lo.id)) };
}

/* ---------- ציור ---------- */
const gapInfo = text => `<span class="tr-info" tabindex="0" role="note" title="${esc(text)}" aria-label="${esc(text)}">ⓘ</span>`;

function gapCard(s, kind, picked, revealed) {
  const bar = ["Right", "Unknown", "Arabs", "Left"].filter(k => s.v.blocs[k] > 0)
    .map(k => `<span style="flex:${s.v.blocs[k]};background:${BLOCS[k].color}">${s.v.blocs[k] >= 7 ? s.v.blocs[k] : ""}</span>`).join("");
  const win = s.right >= GAP_MAJORITY;
  const verdict = win ? `יש רוב · ${s.right - GAP_MAJORITY} מעל ${GAP_MAJORITY}` : `אין רוב · חסרים ${GAP_MAJORITY - s.right}`;
  const hist = !revealed ? "" : `<div class="gap-hist">
      <p>ההפרש מהתוצאה האמיתית בגוש הימין, בשלוש הבחירות האחרונות${s.heir ? ` · נתוני ${esc(s.heir.he)}` : ""} ${gapInfo("ההפרש בין ממוצע הסקרים של המכון ב־30 הימים שלפני כל בחירות לבין התוצאה האמיתית של גוש נתניהו, במנדטים. מינוס — נתן לגוש פחות ממה שקיבל." + (s.heir ? ` ${s.meta.he} ממשיך את ${s.heir.he}, ולכן מוצגת ההיסטוריה של ${s.heir.he}.` : ""))}</p>
      <ul>${s.runs.map(r => `<li class="${r.err < -0.05 ? "low" : r.err > 0.05 ? "high" : ""}"><b dir="ltr">${gapSigned(r.err)}</b><small>${r.year}</small></li>`).join("")}</ul>
      <strong>${gapRunsSummary(s.runs)}</strong></div>`;
  return `<article class="tr-card gap-poll gap-${kind}${picked === kind ? " is-picked" : ""}">
    <header>${outletLogo(s.outlet)}<span><b>${esc(s.outlet)}</b><small>${esc(s.meta.he)} · ${trDay(parsePollDate(s.p))}</small></span></header>
    <div class="gap-num"><b dir="ltr">${s.right}</b><span>מנדטים לגוש<br>הימין והחרדים</span></div>
    <div class="gap-bar" role="img" aria-label="${esc(["Right", "Unknown", "Arabs", "Left"].filter(k => s.v.blocs[k] > 0).map(k => `${BLOCS[k].he} ${s.v.blocs[k]}`).join(", "))}">${bar}<i class="gap-61" title="${GAP_MAJORITY}"></i></div>
    <p class="gap-verdict ${win ? "yes" : "no"}">${verdict}</p>${hist}</article>`;
}

function gapParts(m) {
  const rows = m.parties.slice(0, GAP_ROWS), top = rows[0], max = Math.max(...rows.flatMap(r => [r.hi, r.lo]), 1);
  const inBloc = top.right && Math.sign(top.d) === Math.sign(m.gap);
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
    <h3>${m.n} סקרים בשבועיים האחרונים · החציון <span dir="ltr">${trFmt(m.median)}</span></h3>
    <p>${m.baro == null ? "כל נקודה היא סקר." : `כל נקודה היא סקר. תחזית הברומטר: <b>${m.baro}</b> — משוקללת לפי דיוק המכונים בעבר ${gapInfo("סקרי 8 הימים האחרונים משוקללים לפי ציון הדיוק של כל מכון, עם תיקון הטעות הקבועה שלו ועם חלוקת המנדטים לפי כללי הבחירות.")}`}</p>
    <div class="gap-plot" dir="ltr" role="img" aria-label="${esc(`סקרים לפי מנדטים לגוש הימין: ${m.lo.outlet} ${m.lo.right}, ${m.hi.outlet} ${m.hi.right}, החציון ${trFmt(m.median)}${m.baro == null ? "" : `, תחזית הברומטר ${m.baro}`}`)}">
      <i class="gap-maj" style="left:${x(GAP_MAJORITY)}%"><em>${GAP_MAJORITY} · רוב</em></i>
      ${dots}${flag(m.hi, "hi")}${flag(m.lo, "lo")}
      <div class="gap-axis">${ticks.map(v => `<span style="left:${x(v)}%">${v}</span>`).join("")}</div>
      ${m.baro == null ? "" : `<i class="gap-baro" style="left:${x(m.baro)}%"><em>הברומטר ${m.baro}</em></i>`}
    </div>
    <a class="gap-more" href="#/polls/trend" data-polls-go="trend" data-ex-mode="overview">לכל הסקרים והמגמות ←</a></div>`;
}

function renderPollGap() {
  const box = document.querySelector("#poll-gap"); if (!box) return;
  const m = pollGapModel();
  if (!m) { box.innerHTML = '<p class="gap-empty">עוד אין מספיק סקרים אחרונים כדי להשוות ביניהם.</p>'; return; }
  const picked = S.gapPick || null, revealed = !!picked;
  box.classList.toggle("is-revealed", revealed);
  const label = { hi: m.hi.outlet, lo: m.lo.outlet, none: "אף אחד מהם" }[picked];
  box.innerHTML = `
    <div class="gap-head"><h2><span dir="ltr">${m.gap}</span> מנדטים בין שני סקרים מהשבועיים האחרונים</h2>
      <p>הקיצוני ביותר לכל כיוון, מתוך ${m.n} סקרים. המספרים — מנדטים לגוש הימין והחרדים; ${GAP_MAJORITY} הוא רוב.</p></div>
    <div class="gap-duel">${gapCard(m.hi, "hi", picked, revealed)}<div class="gap-diff" aria-hidden="true"><b>${m.gap}</b><span>מנדטים<br>הפרש</span></div>${gapCard(m.lo, "lo", picked, revealed)}</div>
    ${revealed ? `<p class="gap-picked">הניחוש שלך: <b>${esc(label)}</b>. הנה מה שאפשר לדעת <button type="button" class="gap-redo" data-gap-pick="reset">לנחש שוב</button></p>
      <div class="gap-reveal">${gapParts(m)}${gapScale(m)}</div>`
    : `<div class="gap-ask"><p>מי מהם קרוב יותר לאמת?</p><div class="gap-choices" role="group" aria-label="בחירה">
        <button type="button" data-gap-pick="hi">${esc(m.hi.outlet)} · <span dir="ltr">${m.hi.right}</span></button>
        <button type="button" data-gap-pick="lo">${esc(m.lo.outlet)} · <span dir="ltr">${m.lo.right}</span></button>
        <button type="button" data-gap-pick="none">אף אחד מהם</button></div></div>`}`;
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-gap-pick]"); if (!b) return;
    S.gapPick = b.dataset.gapPick === "reset" ? null : b.dataset.gapPick;
    renderPollGap();
    document.querySelector(S.gapPick ? ".gap-redo" : "[data-gap-pick]")?.focus();
  });
});
