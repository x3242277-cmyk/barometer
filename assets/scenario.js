/* Explicit counterfactual assumptions, separate from the unmodified poll average. */
/* הרשימות הקבועות של "תחזית הברומטר" — בשברי מנדטים, לפני חלוקת המנדטים
   בשיטת באדר-עופר (שם הן מתעגלות יחד עם כל השאר). */
const FIXED_SEATS = { shas: 10.5, yahadut_hatora: 7.8, raam: 4.8 };
function scenarioForecast(raw, options = {}) {
  const fixed = { ...FIXED_SEATS };
  const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0);
  const REST = 120 - fixedSum;                              // 96.9 מנדטים לשאר הרשימות
  const rightIds = new Set(['likud','ozma_yehudit','zionut_datit','ofer_vinter_party','noam']);
  const leftIds = new Set(['yashar','beyahad','hademokratim','ndi','kahollavan','bait_zioni']);
  const rest = Object.fromEntries(Object.entries(raw).filter(([id,v]) => !(id in fixed) && Number.isFinite(v) && v > 0));
  const total = Object.values(rest).reduce((a,b)=>a+b,0);
  if (!total) {                                             // רק הרשימות הקבועות בסקרים — מותחים אותן ל-120
    const f = 120 / fixedSum;
    return {parties:Object.fromEntries(Object.entries(fixed).map(([id,v])=>[id,v*f])), fixed, initialRight:0, anchor:0, demographic:0, blend:Math.min(1,Math.max(0,options.blend ?? 0.5)), demographicCorrected:null};
  }
  const p = Object.fromEntries(Object.entries(rest).map(([id,v])=>[id, v/total*REST]));
  const sum = ids => Object.entries(p).reduce((n,[id,v])=>n+(ids.has(id)?v:0),0);
  const blend = Math.min(1,Math.max(0,options.blend ?? 0.5));
  const transfer = requested => {
    const from = requested >= 0 ? leftIds : rightIds, to = requested >= 0 ? rightIds : leftIds;
    const a=sum(from), b=sum(to), amount=Math.min(Math.abs(requested),a);
    if (!a || !b) return 0;
    Object.keys(p).forEach(id=>{if(from.has(id))p[id]-=amount*p[id]/a;else if(to.has(id))p[id]+=amount*p[id]/b;});
    return Math.sign(requested)*amount;
  };
  /* עוגן הגושים וקיבוע ש״ס/יה״ת הן אותה הנחה — "הימין חזק מהסקרים" — ואסור
     לספור אותה פעמיים. מחשבים את ההזזה הימינה הכוללת הרצויה (חצי הדרך למאזן
     64 של 2022), ומחסירים ממנה את מה שהקיבוע כבר תרם. העוגן משלים רק את
     היתרה. 64 = ליכוד + ציונות דתית + ש״ס + יה״ת ב-2022. */
  const rawSum = Object.values(raw).reduce((s,v)=>s+(Number.isFinite(v)&&v>0?v:0),0);
  const k = rawSum ? 120/rawSum : 1;                       // נרמול הסקרים ל-120
  const pollShasUtj = k*((raw.shas||0)+(raw.yahadut_hatora||0));
  const pollRight = k*(sum(rightIds)/REST)*total + pollShasUtj;
  const fixGain = (fixed.shas + fixed.yahadut_hatora) - pollShasUtj;   // מה שהקיבוע כבר הוסיף לימין
  const wantMove = Math.max(0,(64-pollRight)*blend);       // ההזזה הימינה הכוללת הרצויה
  const anchorSeats = Math.max(0, wantMove - fixGain);     // העוגן משלים רק את היתרה
  const initialRight = pollRight;
  const anchor = transfer(anchorSeats*REST/120);
  const demographic = transfer(Math.max(-6,Math.min(6,options.demographic ?? 2)));
  /* התוצאה בשברי מנדטים (סכום 120); העיגול למנדטים שלמים נעשה בשלב האחרון,
     לפי כללי הבחירות (allocateSeats). */
  return {parties:{...p,...fixed}, fixed, initialRight, anchor, demographic, blend,
          demographicCorrected: options.demographicCorrected || null};
}
