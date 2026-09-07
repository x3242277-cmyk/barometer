/* Explicit counterfactual assumptions, separate from the unmodified poll average. */
function scenarioForecast(raw, options = {}) {
  const fixed = {shas:11, yahadut_hatora:8};
  const rightIds = new Set(['likud','ozma_yehudit','zionut_datit','ofer_vinter_party','noam']);
  const leftIds = new Set(['yashar','beyahad','hademokratim','ndi','kahollavan','bait_zioni']);
  const rest = Object.fromEntries(Object.entries(raw).filter(([id,v]) => !(id in fixed) && Number.isFinite(v) && v > 0));
  const total = Object.values(rest).reduce((a,b)=>a+b,0);
  if (!total) throw new Error('אין סקרים לחישוב התרחיש');
  const p = Object.fromEntries(Object.entries(rest).map(([id,v])=>[id, v/total*101]));
  const sum = ids => Object.entries(p).reduce((n,[id,v])=>n+(ids.has(id)?v:0),0);
  const blend = Math.min(1,Math.max(0,options.blend ?? 0.5));
  const transfer = requested => {
    const from = requested >= 0 ? leftIds : rightIds, to = requested >= 0 ? rightIds : leftIds;
    const a=sum(from), b=sum(to), amount=Math.min(Math.abs(requested),a);
    if (!a || !b) return 0;
    Object.keys(p).forEach(id=>{if(from.has(id))p[id]-=amount*p[id]/a;else if(to.has(id))p[id]+=amount*p[id]/b;});
    return Math.sign(requested)*amount;
  };
  /* עוגן הגושים ותוספת ש״ס/יה״ת הן אותה הנחה — "הימין חזק מהסקרים" — ואסור
     לספור אותה פעמיים. מחשבים את ההזזה הימינה הכוללת הרצויה (חצי הדרך למאזן
     64 של 2022), ומחסירים ממנה את מה שקיבוע 11/8 כבר תרם. העוגן משלים רק את
     היתרה. 64 = ליכוד + ציונות דתית + ש״ס + יה״ת ב-2022. */
  const rawSum = Object.values(raw).reduce((s,v)=>s+(Number.isFinite(v)&&v>0?v:0),0);
  const k = rawSum ? 120/rawSum : 1;                       // נרמול הסקרים ל-120
  const pollShasUtj = k*((raw.shas||0)+(raw.yahadut_hatora||0));
  const pollRight = k*(sum(rightIds)/101)*total + pollShasUtj;
  const fixGain = 19 - pollShasUtj;                        // מה שקיבוע 11/8 כבר הוסיף לימין
  const wantMove = Math.max(0,(64-pollRight)*blend);       // ההזזה הימינה הכוללת הרצויה
  const anchorSeats = Math.max(0, wantMove - fixGain);     // העוגן משלים רק את היתרה
  const initialRight = pollRight;
  const anchor = transfer(anchorSeats*101/120);
  const demographic = transfer(Math.max(-6,Math.min(6,options.demographic ?? 2)));
  return {parties:{...largestRemainder(p,101),...fixed}, initialRight, anchor, demographic, blend};
}
