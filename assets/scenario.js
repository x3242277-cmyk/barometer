/* Explicit counterfactual assumptions, separate from the unmodified poll average. */
/* שתי הרשימות החרדיות מחושבות במודל המשולב. אומדן רע״ם נשמר לפי ממוצע
   הסקרים המשוקלל, ללא קיבוע או תוספת, לפני חלוקת המושבים הסופית. */
function scenarioForecast(raw, options = {}) {
  const haredi = options.harediSeats || (typeof harediForecast === "function" ? harediForecast()?.parties : null);
  const fixed = { ...(haredi || { shas: raw.shas || 0, yahadut_hatora: raw.yahadut_hatora || 0 }),
    ...(Number.isFinite(raw.raam) && raw.raam > 0 ? { raam: raw.raam } : {}) };
  const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0);
  const REST = 120 - fixedSum;
  const rightIds = new Set(['likud','ozma_yehudit','zionut_datit','ofer_vinter_party','noam']);
  const leftIds = new Set(['yashar','beyahad','hademokratim','ndi','kahollavan','bait_zioni']);
  const rest = Object.fromEntries(Object.entries(raw).filter(([id,v]) => !(id in fixed) && Number.isFinite(v) && v > 0));
  const total = Object.values(rest).reduce((a,b)=>a+b,0);
  if (!total) {                                             // רק הרשימות הקבועות בסקרים — מותחים אותן ל-120
    const f = fixedSum > 0 ? 120 / fixedSum : 1;
    return {parties:Object.fromEntries(Object.entries(fixed).map(([id,v])=>[id,v*f])), fixed, demographic:0, demographicCorrected:null};
  }
  const p = Object.fromEntries(Object.entries(rest).map(([id,v])=>[id, v/total*REST]));
  const sum = ids => Object.entries(p).reduce((n,[id,v])=>n+(ids.has(id)?v:0),0);
  const transfer = requested => {
    const from = requested >= 0 ? leftIds : rightIds, to = requested >= 0 ? rightIds : leftIds;
    const a=sum(from), b=sum(to), amount=Math.min(Math.abs(requested),a);
    if (!a || !b) return 0;
    Object.keys(p).forEach(id=>{if(from.has(id))p[id]-=amount*p[id]/a;else if(to.has(id))p[id]+=amount*p[id]/b;});
    return Math.sign(requested)*amount;
  };
  const demographic = transfer(Math.max(-6,Math.min(6,options.demographic ?? 2)));
  /* התוצאה בשברי מנדטים (סכום 120); העיגול למנדטים שלמים נעשה בשלב האחרון,
     לפי כללי הבחירות (allocateSeats). */
  return {parties:{...p,...fixed}, fixed, demographic,
          demographicCorrected: options.demographicCorrected || null};
}
