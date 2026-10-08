/* Explicit counterfactual assumptions, separate from the unmodified poll average. */
/* שתי הרשימות החרדיות מחושבות במודל המשולב. אומדן רע״ם נשמר לפי ממוצע
   הסקרים המשוקלל, ללא קיבוע או תוספת, לפני חלוקת המושבים הסופית. */
function scenarioForecast(raw, options = {}) {
  const haredi = options.harediSeats || (typeof harediForecast === "function" ? harediForecast()?.parties : null);
  const fixed = { ...(haredi || { shas: raw.shas || 0, yahadut_hatora: raw.yahadut_hatora || 0 }),
    ...(Number.isFinite(raw.raam) && raw.raam > 0 ? { raam: raw.raam } : {}) };
  const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0);
  const REST = 120 - fixedSum;
  const rightIds = new Set(['likud','ozma_yehudit','zionut_datit','noam']);
  const leftIds = new Set(['yashar','beyahad','hademokratim','ndi','kahollavan','bait_zioni']);
  const rest = Object.fromEntries(Object.entries(raw).filter(([id,v]) => !(id in fixed) && Number.isFinite(v) && v > 0));
  const total = Object.values(rest).reduce((a,b)=>a+b,0);
  if (!total) {                                             // רק הרשימות הקבועות בסקרים — מותחים אותן ל-120
    const f = fixedSum > 0 ? 120 / fixedSum : 1;
    return {parties:Object.fromEntries(Object.entries(fixed).map(([id,v])=>[id,v*f])), fixed, demographic:0, demographicProposed:0, harediBlocGain:0, demographicCorrected:null};
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
  /* Compare net changes to the right bloc after normalising to 120. Only the
     part of the structural estimate not already supplied by Haredim is added. */
  const rawHaredi = (raw.shas || 0) + (raw.yahadut_hatora || 0);
  const rawRestRight = Object.entries(rest).reduce((n,[id,v])=>n+(rightIds.has(id)?v:0),0);
  const pollBaselineRight = rawHaredi + rawRestRight / total * (120 - rawHaredi - (fixed.raam || 0));
  const beforeDemographicRight = sum(rightIds) + (fixed.shas || 0) + (fixed.yahadut_hatora || 0);
  const harediBlocGain = Math.max(0, beforeDemographicRight - pollBaselineRight);
  /* הרצפה בנקודות אחוז מהמצביעים: ממוצע שני המודלים פחות deviationPoints נקודות.
     היחידה הפנימית היא חלק מתוך 120, ולכן נקודת אחוז אחת = 1.2. */
  const deviationPoints = Math.max(0,Math.min(50,options.deviationPoints ?? 1));
  const structuralRight = Number.isFinite(options.structuralRight) ? options.structuralRight : null;
  const structuralLowerBound = structuralRight == null ? null : structuralRight - deviationPoints * 1.2;
  const demographicProposed = structuralLowerBound == null
    ? Math.max(0,Math.min(6,options.demographic ?? 0))
    : Math.max(0,structuralLowerBound - pollBaselineRight);
  const demographic = transfer(Math.max(0, demographicProposed - harediBlocGain));
  /* התוצאה בשברי מנדטים (סכום 120); העיגול למנדטים שלמים נעשה בשלב האחרון,
     לפי כללי הבחירות (allocateSeats). */
  return {parties:{...p,...fixed}, fixed, demographic, demographicProposed, harediBlocGain, pollBaselineRight, beforeDemographicRight, structuralRight, structuralLowerBound, deviationPoints,
          demographicCorrected: options.demographicCorrected || null};
}
