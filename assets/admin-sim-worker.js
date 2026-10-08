/* סימולטור התחזית באזור הניהול. מריץ את מנוע התחזית של האתר (scenario.js + app.js, בלי DOM)
   על הסקרים החיים, אחרי שינוי מבוקש לכל כלי תקשורת: x מנדטים עוברים בסקרים שלו מרשימות
   האופוזיציה (לא הערביות) לרשימות הקואליציה, באופן יחסי. x שלילי מעביר בכיוון ההפוך.
   כל השאר — שקלול המכונים, תיקון הטעות הקבועה, כלל וינטר והנדל/זליכה, המודל החרדי, הרצפה
   וחלוקת 120 המושבים — זהה לתחזית שבאתר. */
const version = new URL(self.location.href).searchParams.get("v") || "";
importScripts("scenario.js?v=" + version, "app.js?v=" + version);

const get = name => fetch("../data/" + name + ".json", { cache: "no-store" }).then(r => {
  if (!r.ok) throw Error("לא נטען " + name);
  return r.json();
});
let polls = [];
const ready = Promise.all(["current-polls", "historical-polls", "historical-polls-2021", "historical-polls-2020", "pollsters", "demographics", "haredi", "trends"].map(get))
  .then(([cur, h22, h21, h20, firms, demo, haredi, trends]) => {
    polls = cur.polls;
    S.hist = h22; S.firms = firms; S.demo = demo; S.haredi = haredi; S.trendsNat = trends.national;
    S.elections = [[2022, h22], [2021, h21], [2020, h20]].map(([year, data]) => ({ year, data, stats: scoreFirms(data) }));
    S.stats = combineCalibrations(S.elections);
    S.house = houseEffects(S.elections);
    S.houseIndustry = houseIndustry(S.house);
  });

function shifted(shifts) {
  return polls.map(p => {
    const x = shifts[p.sourceId] || 0;
    if (!x) return p;
    const C = p.parties.filter(q => q.alignment === "Coalition").reduce((t, q) => t + q.mandates, 0);
    const O = p.parties.filter(q => q.alignment === "Opposition").reduce((t, q) => t + q.mandates, 0);
    if (!C || !O) return p;
    const move = Math.max(-C, Math.min(O, x));
    return { ...p, parties: p.parties.map(q => q.alignment === "Coalition" ? { ...q, mandates: q.mandates + move * q.mandates / C }
      : q.alignment === "Opposition" ? { ...q, mandates: q.mandates - move * q.mandates / O } : q) };
  });
}

function run(shifts = {}) {
  S.cur = { polls: shifted(shifts) };
  S.forecastPolls = recentForForecast(S.cur.polls);
  S.series = buildWeightedSeries(S.forecastPolls);
  S.seriesScenario = buildScenarioSeries(S.forecastPolls);
  if (!S.forecastPolls.length) throw Error("אין סקרים בחלון התחזית.");
  const joint = S.forecastPolls.some(p => p.parties.some(x => normId(x.id) === "reshima_meshutefet" && x.mandates > 0));
  const sc = forecast("scenario", joint ? HIDE_FROM_HOME : new Set());
  const seats = allocateSeats(sc.parties), blocs = { Right: 0, Left: 0, Arabs: 0 };
  Object.entries(seats).forEach(([id, n]) => { const al = partyMeta(id).alignment; blocs[al] = (blocs[al] || 0) + n; });
  const sumR = p => Object.entries(p).reduce((t, [id, v]) => t + (isRightAt(id, v) ? v : 0), 0);
  const pollRight = p => p.parties.reduce((t, x) => t + (isRightAt(normId(x.id), x.mandates) ? x.mandates : 0), 0);
  return {
    coalition: blocs.Right || 0, centerLeft: blocs.Left || 0, arab: blocs.Arabs || 0,
    coalitionShare: sumR(sc.parties) / 1.2,
    pollsShare: (sumR(sc.parties) - (sc.scenario?.demographic || 0)) / 1.2,
    floorShare: (sc.scenario?.structuralLowerBound ?? 0) / 1.2,
    lift: (sc.scenario?.demographic || 0) / 1.2,
    parties: Object.entries(seats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, name: partyMeta(id).name, seats: n, coalition: partyMeta(id).alignment === "Right" })),
    window: S.forecastPolls.map(p => ({ sourceId: p.sourceId, outlet: p.channelHebrewName, firm: firmOf(p.sourceId).meta?.he || firmOf(p.sourceId).firm || "", date: p.date, coalition: Math.round(pollRight(p) * 10) / 10 }))
  };
}

self.onmessage = async ({ data }) => {
  try {
    await ready;
    if (data.type === "run") self.postMessage({ id: data.id, result: run(data.shifts || {}) });
    else if (data.type === "table") {
      const others = data.others || [], steps = data.steps || [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
      const rows = steps.map(x => ({ shift: x, ...run(Object.fromEntries(others.map(id => [id, x]))) }));
      self.postMessage({ id: data.id, rows });
    }
  } catch (e) { self.postMessage({ id: data.id, error: e.message || String(e) }); }
};
