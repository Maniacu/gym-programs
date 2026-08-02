/* Session logging engine: the sets grid, coach tabs (info/drop-set/superset), auto
 * drop-sets/supersets, weight steppers, rest timer, bench-angle sensor, and finishing a
 * workout. This is the single largest/most complex file — every render is a full
 * `innerHTML` replace of the card content, then listeners are bound directly onto the
 * fresh elements (not event delegation): each dynamically-inserted section (minirow,
 * ttquick bar, exactions) wires its own listeners immediately after insertion, so there
 * is no "forgot to rebind" risk in practice — every insertion point already binds
 * correctly today, so keeping this proven pattern was judged lower-risk than a
 * speculative rewrite to delegated events this late in the rewrite. */

/* rest-timer duration heuristic based on the exercise's rep range, scaled by the user's
   rest-style preference (short/standard/long) so heavy compounds and pump work each get
   sensible-but-personalizable rest. gymRestStyle: "short"=×0.7, "standard"=×1, "long"=×1.3. */
const REST_STYLE={short:0.7,standard:1,long:1.3};
function restStyle(){ const s=localStorage.getItem("gymRestStyle"); return REST_STYLE[s]?s:"standard"; }
function restAutoStart(){ return localStorage.getItem("gymRestAuto")!=="0"; } // default on
function restBaseFor(opt){
  const r=String((opt&&opt.r)||"");
  if(/sec|45s|\d+s/i.test(r))return 60;
  if(/amrap|max/i.test(r))return 120;
  const lo=repLo(r)||10;
  return lo<=6?150:lo<=10?120:75;
}
function restFor(opt){ return Math.max(20,Math.round(restBaseFor(opt)*REST_STYLE[restStyle()]/5)*5); }

/* ---------- session slot access (today's in-progress numbers for exercise index `ei`) ---------- */
function logDay(){ return logCustom?logCustom:PROGRAM[curDay]; }
function logId(ei){ return logCustom? (logCustom.key+"_"+ei) : id(curDay,ei); }
function logRec(ei){
  const k=logId(ei),r=(state.slots[k]=state.slots[k]||{}),o=logOpt(ei);
  const ref=exerciseIdentityFor(o.n,o.exerciseId||o.libId,state);
  r.exerciseId=ref.exerciseId;r.libId=ref.libId;r.exerciseName=ref.name;return r;
}
function logOpt(ei){
  const ex=logDay().ex[ei],r=state.slots[logId(ei)]||{},today=todayStr();
  if(r.todaySwap&&r.todaySwap.date===today)return {exerciseId:r.todaySwap.exerciseId||null,libId:r.todaySwap.libId||r.todaySwap.id||null,
    n:r.todaySwap.n,r:ex.opts[0].r,cue:r.todaySwap.cue||"Tap the photo to view this exercise.",img:r.todaySwap.img,eq:r.todaySwap.eq};
  if(r.todayOpt&&r.todayOpt.date===today){
    const oi=Math.max(0,Math.min(+r.todayOpt.index||0,ex.opts.length-1));return ex.opts[oi];
  }
  return effOpt(logId(ei),ex);
}
function slotLog(ei){ return exLog(logOpt(ei).n); }
function slotLast(ei){ const f=slotLog(ei); return f.length?f[f.length-1]:null; }
function logGetSets(ei){ const r=logRec(ei), today=todayStr();
  // Rebuild a fresh grid whenever the stored sets are from an earlier day, so a new
  // session never shows last time's entered weights/reps/checkmarks.
  if(!r.sets||r._sd!==today){ const opt=logOpt(ei), exo=logDay().ex[ei], tot=targetSets(opt.r);
    r.sets=Array.from({length:tot},()=>({w:null,r:null,done:false}));
    // AUTO WARM-UP + recommended loads: when last session's top weight for this exercise
    // is known, prefill every working set with the app's recommended next load and prepend
    // ONE ramp set — 70% x5 of LAST session's weight. Warm-ups never count toward
    // volume/PRs/completion (type:"warm" — see requiredSets/finishWorkout); tap a row's 🔥
    // to remove it, or "+ Warm-up" to add another. First-ever sessions and timed/bodyweight
    // moves are skipped (no previous load to ramp from).
    // One set, not two, at the user's request. The 70% single is kept rather than the old
    // 50% x8 opener: with only one ramp set it has to sit close enough to the working load
    // to actually prime it, and a 50% set would leave too big a jump to the first work set.
    const ll=slotLast(ei);
    if(ll&&ll.w&&!isTimedExercise(opt)){
      const sug=advancedNextFromLog(opt,ll,progRule(ei)), workW=(sug&&sug.kg)||ll.w;
      r.sets.forEach(s=>{ s.w=workW; });
      r.sets.unshift({w:round25(ll.w*0.7),r:5,done:false,type:"warm"});
    }
    // Chest/biceps/triceps isolation finishers get their drop set included automatically as
    // the last row, right after the final working set - no manual "add" step, and it can
    // never land anywhere but directly under the set it drops from.
    if(exo&&dropAutoMuscle(exo.m,opt)) r.sets.push({w:null,r:null,done:false,drop:true});
    r._sd=today;
    if(r.ss&&Array.isArray(r.ss.sets))r.ss.sets.forEach(s=>{s.w=null;s.r=null;s.done=false;}); }
  return r.sets; }
function logBest(ei){ let b=0; logGetSets(ei).forEach(x=>{if(x.w&&x.w>b)b=x.w;}); slotLog(ei).forEach(l=>{if(l.w>b)b=l.w;}); return b; }
/* Rep-based "best" for exercises nobody ever loads with weight (bodyweight core work
   like Hanging Leg Raise) — logBest() stays strictly weight-based since the warm-up %
   and plate calculators both key off it, so this is a separate display-only fallback. */
function logBestReps(ei){ let b=0; logGetSets(ei).forEach(x=>{if(!x.w&&x.r>b)b=x.r;}); slotLog(ei).forEach(l=>{ if(!l.w&&l.r>b)b=l.r; }); return b; }
function log1RM(ei){ let b=0; logGetSets(ei).forEach(x=>{if(x.w&&x.r){const e=x.w*(1+x.r/30);if(e>b)b=e;}}); return Math.round(b); }
/* +/- weight stepper: nudge a set's weight to the next real weight for THIS exercise —
   a user-configured machine stack/increment if set (see openSetupMemory), otherwise the
   equipment-type default (dumbbells 2 kg, machines 5 kg, bars & cables 2.5 kg). */
function stepWeight(ei,i,dir){ const sets=logGetSets(ei), s=sets[i]; if(!s)return;
  const opt=logOpt(ei), cfg=weightCfgFor(opt.n), useCfg=cfg&&cfg.unit===unit, cur=s.w!=null?toDisp(s.w):0;
  let next;
  if(useCfg&&Array.isArray(cfg.list)&&cfg.list.length){ const L=cfg.list.slice().sort((a,b)=>a-b);
    if(dir>0){ next=L.find(v=>v>cur+0.001); if(next==null)next=L[L.length-1]; }
    else { next=null; for(let k=L.length-1;k>=0;k--){ if(L[k]<cur-0.001){next=L[k];break;} } if(next==null)next=L[0]; }
  } else { const st=(useCfg&&cfg.step>0)?cfg.step:eqStepDisp(opt); next=Math.max(0,cur+dir*st); }
  s.w=toKg(next); save(); renderLog(); }
/* Snap a suggested kg load to the exercise's real available weights (list or increment),
   so the "Use X" button and prefills also land on loadable numbers. No-op if unconfigured. */
function snapKgToExercise(opt,kg){ if(kg==null)return kg; const cfg=weightCfgFor(opt&&opt.n); if(!(cfg&&cfg.unit===unit))return kg;
  const disp=toDisp(kg); let snapped;
  if(Array.isArray(cfg.list)&&cfg.list.length)snapped=cfg.list.reduce((a,b)=>Math.abs(b-disp)<Math.abs(a-disp)?b:a);
  else if(cfg.step>0)snapped=Math.max(0,Math.round(disp/cfg.step)*cfg.step);
  else return kg;
  return toKg(snapped); }

function openLog(){ const day=logDay();
  document.getElementById("logTitle").textContent=logCustom?day.name:(day.day+" · "+day.title);
  document.getElementById("logSub").textContent=logCustom?"Custom workout":day.sub;
  _logFocusEi=null;
  ensureSession(); renderLog(); document.getElementById("logView").classList.add("on"); native("keepAwake",true);
}
function closeLog(){ document.getElementById("logView").classList.remove("on"); hideTimer(); stopSetWatch(); native0("sessionNotifyCancel"); native("keepAwake",false); syncWatchClosed(); renderPlan(); }

/* ---------- drop-set / superset auto-recommendation ---------- */
function isIsolation(o){ const n=(o.n||"").toLowerCase(), eq=(o.eq||"").toLowerCase();
  if(/bench press|squat|deadlift|barbell row|bent over.*row|overhead press|military|pull-?up|chin-?up|dips|romanian/.test(n)) return false;
  return /raise|fly|flye|curl|extension|pushdown|pec|lateral|leg curl|leg extension|calf|crunch|kickback|pullover|cross|reverse|shrug|press machine|pulldown|skull/.test(n)||eq==="cable"||eq==="machine"; }
/* Chest, biceps and triceps isolation moves are the classic drop-set finishers — short
   lever arms, low joint/systemic fatigue cost, fast recovery. Used to auto-surface the
   drop-set finisher card without the user having to configure anything per exercise. */
function dropAutoMuscle(m,opt){ return (m==="Chest"||m==="Biceps"||m==="Triceps")&&isIsolation(opt); }
/* "Coach tabs": info / drop set / superset - one segmented control + a single panel,
   instead of up to 3 separately-stacked boxes. _coachTab remembers which tab is selected
   per exercise index (transient UI state, not persisted). */
let _coachTab={};
function lastPerformanceHTML(ei){
  const log=slotLog(ei);
  if(!log.length)return "<div class='lastbox'><b>First tracked session</b><br><span class='muted'>Log this exercise once and the app will show last time, PR and trend here.</span></div>";
  const last=log[log.length-1], prev=log.length>1?log[log.length-2]:null;
  const delta=prev&&last.e&&prev.e?last.e-prev.e:null;
  const trend=delta==null?"":(" | "+(delta>=0?"+":"")+delta+" est 1RM vs previous");
  return "<div class='lastbox'><b>Last time:</b> "+toDisp(last.w)+" "+unit+" x "+(last.r||"-")+" | 1RM ~ "+toDisp(last.e)+" "+unit+trend+"<br><span class='muted'>Use this to beat one small target, not every set.</span></div>";
}
function coachPanelHTML(ei,exo,dropAuto,dropCount,ssPartner){
  const tabs=[{key:"info",label:"Info"}];
  if(dropAuto)tabs.push({key:"drop",label:"Drop set"});
  if(ssPartner)tabs.push({key:"superset",label:"Superset"});
  let active=_coachTab[ei]||"info";
  if(!tabs.some(t=>t.key===active))active="info";
  const panels={
    info:lastPerformanceHTML(ei),
    drop:"<div class='dropauto'><span>💧 <b>"+(dropCount?"Drop-set finisher included":"Drop-set finisher recommended")+"</b><br>"+(dropCount?("It's already added as your last set below — push to failure, then drop the weight about 25% and rep out."+(dropCount>1?" ("+dropCount+" stacked.)":"")):(exo.m+" isolation work responds well to a lighter finisher set right after your last one."))+"</span><button data-a='autodrop'>"+(dropCount?"+ Add another":"+ Add drop-set")+"</button></div>",
    superset:ssPartner?("<div class='superauto'><span>⚡ <b>Superset suggestion</b><br>Pair with "+esc(ssPartner.n)+" to keep intensity high with less total rest time.</span><button data-a='autoss'>+ Add superset</button></div>"):""
  };
  const tabBar=tabs.length>1?("<div class='coachtabs'>"+tabs.map(t=>"<button data-a='coachtab' data-tab='"+t.key+"' class='"+(t.key===active?"on":"")+"'>"+t.label+"</button>").join("")+"</div>"):"";
  return tabBar+panels[active];
}
const SS_PARTNER={Biceps:"Triceps Pushdown",Triceps:"Hammer Curls",Chest:"Seated Cable Rows",Back:"Cable Crossover",Shoulders:"Reverse Machine Flyes",Legs:"Lying Leg Curls",Core:"Plank",
  /* Traps pair with a horizontal push for the same antagonist reason Back does. */
  Traps:"Cable Crossover"};
function supersetPartner(m){ const nm=SS_PARTNER[m]; if(!nm)return null; let x=LIB.find(e=>e.n===nm)||(typeof aiResolveEx==="function"?aiResolveEx(nm,null):null); return x?{exerciseId:x.id,libId:x.id,m:x.m,n:x.n,img:x.img,cue:x.cue,eq:x.eq}:null; }
/* Insert the drop set right after the set it drops FROM, instead of appending it to the
   very end of the list — otherwise it lands below still-empty planned sets and reads as
   a disconnected extra row rather than a lighter finisher nested under your last set. */
function lastDoneIndex(sets){ for(let i=sets.length-1;i>=0;i--) if(sets[i].done) return i; return sets.length-1; }
function addDropsetAfter(ei,afterIdx){
  const sets=logGetSets(ei); if(afterIdx==null||afterIdx<0)afterIdx=sets.length-1;
  const base=sets[afterIdx]||{w:null}, w=base.w?round25(base.w*0.75):null;
  sets.splice(afterIdx+1,0,{w:w,r:null,done:false,drop:true});
  save(); renderLog(); toast("💧 Drop-set added under your last set — hit failure, then rep out lighter");
}
function addDropset(ei){ addDropsetAfter(ei,lastDoneIndex(logGetSets(ei))); }
/* Inserts a genuine extra set (tagged type:"warm") ahead of the prescribed work sets,
   instead of requiring one of the working sets to be re-tagged (which would eat into
   the working-set count). Defaults to ~50% of the first set's weight (or the
   suggested next weight if the first set hasn't been filled in yet) so there's
   something sensible to adjust rather than a blank field. finishWorkout()/requiredSets()
   already exclude type:"warm" from volume/PR/completion — see 00-util.js. */
function addWarmup(ei){
  const sets=logGetSets(ei), first=sets[0]||{}, next=logNext(ei);
  const target=first.w||(next&&next.kg)||null, w=target?round25(target*0.5):null;
  sets.unshift({w:w,r:null,done:false,type:"warm"});
  save(); renderLog(); toast("Warm-up set added");
}
function addSupersetAuto(ei,m){ const p=supersetPartner(m); if(!p){toast("No superset partner for this");return;} logRec(ei).ss={exerciseId:p.exerciseId,libId:p.libId,exerciseName:p.n,m:p.m,n:p.n,img:p.img,cue:p.cue,eq:p.eq,sets:[{w:null,r:null,done:false}]}; save(); renderLog(); toast("⚡ Superset added: "+p.n); }

/* ---------- progression rule + next-weight suggestion ---------- */
const PROG_RULES={double:"Double progression",topback:"Top set + back-offs",fixed:"Fixed load",body:"Bodyweight / timed"};
function progRule(ei){ const o=logOpt(ei), r=state.slots[logId(ei)]||{}; if(r.rule)return r.rule; if(/body only|none/i.test(o.eq||"")||/amrap|sec|45s|max/i.test(o.r||""))return "body"; return "double"; }
function cycleProgRule(ei){ const a=Object.keys(PROG_RULES), cur=progRule(ei), n=a[(a.indexOf(cur)+1)%a.length]; state.slots[logId(ei)]=state.slots[logId(ei)]||{}; state.slots[logId(ei)].rule=n; save(); renderLog(); toast("Progression: "+PROG_RULES[n]); }
function fatigueNote(ei){ const log=slotLog(ei).slice(-4); if(log.length<3)return ""; const last=log[log.length-1], prev=log.slice(0,-1), best=Math.max(...prev.map(x=>x.e||0)); if(best&&last.e<best*.95)return "Output dipped vs recent best - consider a lighter day."; if(log.slice(-3).every(x=>(x.e||0)<=best))return "Stalled recently - add reps first, then load, or deload 5-10%."; return ""; }
/** Next-weight suggestion, reading RIR/reps from the last logged set (via slotLast,
 *  which is already name-keyed history, so swaps/reorders never break this). */
function advancedNextFromLog(opt,ll,rule){
  const hi=repHi(opt.r), lo=repLo(opt.r)||Math.max(1,hi-4), rir=ll.rir;
  const st=eqStepKg(opt), inc=w=>roundStep(w+st,st); // equipment-real increments
  if(rule==="fixed")return {kg:ll.w,why:"Fixed load: keep the weight and make reps cleaner."};
  if(rule==="body")return {kg:ll.w,why:"Bodyweight/timed: add reps, seconds, tempo, or range."};
  if(rir===0&&ll.r&&ll.r<lo)return {kg:roundStep(ll.w*.95,st),why:"0 RIR below the target range - reduce 5% and rebuild."};
  if(rir===0)return {kg:ll.w,why:"True hard set. Repeat the load until reps climb."};
  if(rir!=null&&rir>=3&&ll.r&&ll.r>=hi-1)return {kg:inc(ll.w),why:"Too much in reserve near the top range - add weight."};
  if(rir!=null&&rir>=3)return {kg:ll.w,why:"Add 1-2 reps before load; last set had "+rir+" RIR."};
  if(rule==="topback")return {kg:(ll.r&&ll.r>=hi)?inc(ll.w):ll.w,why:"Top set first; back-off sets at about 90%."};
  if(ll.r&&ll.r>=hi)return {kg:inc(ll.w),why:"Top of rep range hit - add weight."};
  return {kg:ll.w,why:"Repeat "+toDisp(ll.w)+" "+unit+" and beat "+(ll.r||"")+" reps."};
}
function logNext(ei){
  const ll=slotLast(ei); // history filtered to THIS exercise (handles swaps/reorders)
  if(!ll||!ll.w)return null;
  const opt=logOpt(ei), s=advancedNextFromLog(opt,ll,progRule(ei));
  if(s&&s.kg!=null)s.kg=snapKgToExercise(opt,s.kg); // land the suggestion on a real machine weight
  return s;
}
/* ---------- calibration / assessment set (Fitbod-style) ----------
   For an exercise with NO history, there's nothing to suggest a load from. So the user
   does ONE feel-out set (weight, reps, and — key — an RIR), taps Calibrate, and the app
   estimates a working weight for the target rep range at ~2 RIR and fills the rest of the
   sets with it. Turns "what do I even start with?" into one guided set. */
function calibrateFromSet(ei){
  const sets=logGetSets(ei), first=sets.find(s=>setTypeOf(s)!=="warm"&&s.w>0&&s.r>0);
  if(!first){ toast("Do one set first — enter weight, reps, and tap RIR"); return; }
  const opt=logOpt(ei), rir=(first.rir!=null?first.rir:2), rtf=first.r+rir; // reps-to-failure
  const e1=first.w*(1+rtf/30);                                   // est. 1RM from that set
  const targetRtf=midReps(opt.r)+2;                             // aim ~2 RIR at the mid of the range
  let work=roundStep(e1/(1+targetRtf/30),eqStepKg(opt));
  const snapped=snapKgToExercise(opt,work); if(snapped!=null)work=snapped;
  work=Math.max(work,eqStepKg(opt));
  sets.forEach(s=>{ if(setTypeOf(s)!=="warm"&&!s.done&&s!==first)s.w=work; });
  save(); renderLog(); toast("Working weight ≈ "+toDisp(work)+" "+unit+" — tweak if it feels off");
}

/* ---------- live workout notification (silent, ongoing; native side in MainActivity) ---------- */
function updateSessionNotification(){
  try{
    const day=logDay(); if(!day)return;
    let cur=null,next=null,doneEx=0,totEx=0;
    day.ex.forEach((exo,ei)=>{
      if(skipState(ei))return;
      totEx++;
      const finished=isExerciseDone(logGetSets(ei));
      if(finished){doneEx++;return;}
      if(!cur)cur=logOpt(ei).n; else if(!next)next=logOpt(ei).n;
    });
    const title=(logCustom?day.name:day.title)+" · "+doneEx+"/"+totEx+" done";
    const text=cur?("Now: "+cur+(next?"  →  Next: "+next:"")):"All exercises done — hit Finish 💪";
    native("sessionNotify",title,text);
  }catch(e){}
}

/* ---------- Wear OS companion ----------
 * The watch renders whatever snapshot it last received, so this is published on every log
 * render — the same cadence as the session notification. Weights go over in kg regardless
 * of the user's display unit, with the unit alongside, so the watch does no conversion of
 * its own and the two can never disagree about what "34" means. */
function watchSessionPayload(){
  const day=logDay(); if(!day)return null;
  const ex=day.ex.map((exo,ei)=>{
    if(skipState(ei))return null;
    const opt=logOpt(ei);
    /* `bw` distinguishes a genuine bodyweight movement from a loaded one whose weight
       simply hasn't been entered yet — both arrive as w:0, and without this the watch
       labelled every un-filled set "body". */
    return {n:opt.n,m:exo.m||"",t:opt.r||"",bw:/body only|none/i.test(opt.eq||""),
      s:logGetSets(ei).map(s=>({w:+s.w||0,r:+s.r||0,d:!!s.done,ty:setTypeOf(s)}))};
  }).filter(Boolean);
  return {v:1,active:true,unit:unit,title:(logCustom?day.name:(day.day+" · "+day.title)),
    idx:Math.max(0,Math.min(_logFocusEi||0,ex.length-1)),
    restEndsAt:restEnd||0, ex:ex};
}
function syncWatch(){
  try{
    const payload=watchSessionPayload();
    if(payload)native("syncWatch",JSON.stringify(payload));
  }catch(e){}
}
function syncWatchClosed(){ try{ native("syncWatch",JSON.stringify({v:1,active:false,ex:[]})); }catch(e){} }

/* Applies a tap made on the watch. Actions are absolute assignments, never increments, so
 * a batch buffered while the phone was pocketed replays safely in any grouping. */
window.__watchAction=function(json){
  try{
    const a=typeof json==="string"?JSON.parse(json):json;
    if(!a||!a.a)return;
    if(!document.getElementById("logView").classList.contains("on"))return;
    if(a.a==="focus"){ setLogFocus(+a.ei||0); return; }
    if(a.a==="setDone"){
      const sets=logGetSets(+a.ei||0), s=sets[+a.si];
      if(!s)return;
      s.done=!!a.v;
      save(); renderLog();
      if(s.done&&typeof startTimer==="function"){ const o=logOpt(+a.ei||0); startTimer(restFor(o)); }
    }
  }catch(e){}
};

/* ---------- per-set stopwatch (timed exercises: planks/holds/carries) ---------- */
let _setWatch=null; // {btn,start,int} — at most one running at a time
function stopSetWatch(){ if(_setWatch){ clearInterval(_setWatch.int); try{_setWatch.btn.classList.remove("on");_setWatch.btn.textContent="▶";}catch(e){} _setWatch=null; } }

/* ---------- set-type tags (work / warm-up / failure / drop / 40s / partials) ----------
   "40s" is CBum's constant-tension timed set (logs SECONDS via the ▶ stopwatch).
   "PART" = lengthened partials: after full-rep failure, 3-5 half-reps from the deep stretch
   — one of the highest-value intensifiers for isolation work. It counts as a work set,
   logs the full-rep count normally (partials are bonus reps past failure), and sets RIR 0
   so the next-weight logic knows the set was taken beyond failure. */
function setTypeOf(s){ return s&&s.type?s.type:(s&&s.drop?"drop":"work"); }
const SET_TAGS=["work","warm","fail","drop","t40","lp"];
const SET_TAG_LABEL={work:"WORK",warm:"WARM",fail:"FAIL",drop:"DROP",t40:"40S",lp:"PART"};
function cycleSetTag(ei,si){
  const s=logGetSets(ei)[si]; if(!s)return;
  const cur=setTypeOf(s), next=SET_TAGS[(SET_TAGS.indexOf(cur)+1)%SET_TAGS.length];
  if(next==="work")delete s.type; else s.type=next;
  s.drop=next==="drop";
  if(next==="fail"||next==="lp")s.rir=0; // failure and partials are both taken to/past failure
  if(next==="t40")toast("40s set: slow constant-tension reps for ~40 seconds — use the ▶ stopwatch");
  if(next==="lp")toast("Lengthened partials: full reps to failure, then 3-5 half-reps from the deep stretch");
  save(); renderLog();
}
/* Chest/back/delt/arm isolation is where lengthened partials pay off most (safe deep
   stretch, low joint cost). Used to surface the one-tap "add partials" finisher. */
function partialsWorthIt(o,m){ return isIsolation(o)&&!isTimedExercise(o); }
/* Mark this exercise's last completed (or last) work set as a lengthened-partials set. */
function addPartialsToLast(ei){
  const sets=logGetSets(ei);
  let idx=-1; for(let i=sets.length-1;i>=0;i--){ if(setTypeOf(sets[i])!=="warm"&&!sets[i].drop){ if(sets[i].done){idx=i;break;} if(idx<0)idx=i; } }
  if(idx<0){ toast("No working set to add partials to"); return; }
  sets[idx].type="lp"; sets[idx].drop=false; sets[idx].rir=0;
  save(); renderLog(); toast("Last set → lengthened partials. Push full reps to failure, then 3-5 stretch partials.");
}
function installSetTags(){
  document.querySelectorAll("#logBody .ex").forEach((card,ei)=>{
    const head=[...card.querySelectorAll(".sethead")].find(h=>h.querySelector(".e"));
    if(head&&!head.querySelector(".tg")){
      const tg=document.createElement("span"); tg.className="tg"; tg.textContent="type";
      head.insertBefore(tg,head.children[1]||null);
    }
    card.querySelectorAll(".setrow").forEach(row=>{
      const ok=row.querySelector(".ok[data-i]");
      if(!ok||row.querySelector(".settag"))return;
      const si=+ok.dataset.i, s=logGetSets(ei)[si], type=setTypeOf(s);
      const b=document.createElement("button");
      b.className="settag "+type;
      b.textContent=SET_TAG_LABEL[type]||"WORK";
      b.title="Tap to cycle: work, warm-up, failure, drop, 40s, partials";
      b.onclick=()=>cycleSetTag(ei,si);
      row.insertBefore(b,row.children[1]||null);
    });
  });
}

/* ---------- quick-context bar: copy previous / note / setup / rotate ---------- */
function rotationHint(name){
  const n=(name||"").toLowerCase();
  if(n.includes("skull"))return "Rotation: if elbows ache, swap to overhead cable extension for 2-4 weeks.";
  if(n.includes("close-grip"))return "Rotation: if wrists/elbows complain, use dip machine or rope pushdowns.";
  if(n.includes("shrug"))return "Rotation: DB shrug -> machine shrug -> cable shrug every 4-6 weeks.";
  if(n.includes("curl"))return "Rotation: alternate EZ, incline DB, and cable curls by block.";
  return "";
}
function rotationOptionsFor(name){
  const n=(name||"").toLowerCase();
  if(n.includes("skull"))return ["Overhead Cable Tricep Extension","Tricep Rope Pushdown","Cable Rope Overhead Triceps Extension"];
  if(n.includes("close-grip"))return ["Dip Machine","Tricep Rope Pushdown","Triceps Pushdown - V-Bar Attachment"];
  if(n.includes("shrug"))return ["Cable Shrugs","Leverage Shrug","Barbell Shrug"];
  if(n.includes("curl"))return ["Cable Curl","EZ-Bar Preacher Curl","Dumbbell Hammer Curl"];
  if(n.includes("flye")||n.includes("rear delt"))return ["Reverse Machine Flyes","Face Pull","Bent Over Dumbbell Rear Delt Raise With Head On Bench"];
  return [];
}
function openRotationPlanner(){
  const items=[];
  // Iterate the BUILT program (PROGRAM), not PROGRAMS[activeProg].days: buildActive()
  // reorders each day by priority and injects emphasis exercises, so raw-days indexes
  // pointed openSwapPlan at the wrong slot whenever the order differed. curOpt also
  // reflects any active swap, so the planner shows what's actually being trained.
  PROGRAM.forEach((d,di)=>d.ex.forEach((e,ei)=>{ const o=curOpt(di,ei), hint=rotationHint(o.n), opts=rotationOptionsFor(o.n); if(hint||opts.length)items.push({di,ei,day:d.day,name:o.n,hint,opts}); }));
  document.getElementById("detTitle").textContent="Rotation planner";
  document.getElementById("detBody").innerHTML=items.length?items.map(x=>"<div class='hitem'><div><div class='d'>"+x.day+" · "+esc(x.name)+"</div><div class='m'>"+esc(x.hint||"Good rotation candidate")+"<br>"+(x.opts.length?"Try: "+x.opts.map(esc).join(", "):"")+"</div></div><div class='v'><button data-d='"+x.di+"' data-e='"+x.ei+"'>Swap</button></div></div>").join(""):"<p style='color:var(--muted)'>No obvious rotation candidates right now.</p>";
  document.querySelectorAll("#detBody [data-d]").forEach(b=>b.onclick=()=>{detDlg.close();openSwapPlan(+b.dataset.d,+b.dataset.e);});
  detDlg.showModal();
}
function openSetupMemory(name){
  const cur=setupFor(name)||{}, wc=weightCfgFor(name)||{}, wcUnit=(wc.unit===unit);
  const stepVal=(wcUnit&&wc.step>0)?wc.step:"", listVal=(wcUnit&&Array.isArray(wc.list))?wc.list.join(", "):"";
  document.getElementById("detTitle").textContent="Setup & weights";
  document.getElementById("detBody").innerHTML="<p style='color:var(--muted)'>"+esc(name)+"</p><div class='fld'><label>Seat / bench</label><input id='su_seat' value='"+escAttr(cur.seat||"")+"'></div><div class='fld'><label>Grip / handle</label><input id='su_grip' value='"+escAttr(cur.grip||"")+"'></div><div class='fld'><label>Pin / plates</label><input id='su_pin' value='"+escAttr(cur.pin||"")+"'></div><div class='fld'><label>Cue</label><input id='su_cue' value='"+escAttr(cur.cue||"")+"'></div>"+
    "<h3 style='margin:16px 2px 6px'>Machine weights <span style='color:var(--muted);font-weight:400;font-size:12px'>("+unit+")</span></h3><p style='color:var(--muted);font-size:12px;margin:0 0 10px'>Make the +/− stepper match this machine's real jumps. Set an increment, or list the exact stack for odd machines.</p>"+
    "<div class='fld'><label>Increment (e.g. "+(unit==="lb"?"10":"5")+" for a "+(unit==="lb"?"10 lb":"5 kg")+" stack)</label><input id='su_step' inputmode='decimal' placeholder='auto ("+eqStepDisp({eq:""})+")' value='"+escAttr(stepVal)+"'></div>"+
    "<div class='fld'><label>Or exact weights, comma-separated</label><input id='su_list' inputmode='decimal' placeholder='e.g. 5, 10, 20, 35, 50' value='"+escAttr(listVal)+"'></div>"+
    "<div class='btnrow'><button id='su_save'>Save</button></div>";
  document.getElementById("su_save").onclick=()=>{
    setSetupFor(name,{seat:su_seat.value,grip:su_grip.value,pin:su_pin.value,cue:su_cue.value});
    const list=(document.getElementById("su_list").value.match(/[\d.]+/g)||[]).map(Number).filter(v=>v>0);
    const step=+document.getElementById("su_step").value||0;
    setWeightCfgFor(name, (list.length||step>0)?{step:step,list:list.length?list:null,unit:unit}:null);
    save(); detDlg.close(); toast("Saved");
  };
  detDlg.showModal();
}
function enhanceLogCard(card,ei){
  if(card.dataset.v3)return;
  card.dataset.v3="1";
  const opt=logOpt(ei), mem=setupFor(opt.n)||{}, rot=rotationHint(opt.n);
  const bar=document.createElement("div");
  bar.className="minirow";
  bar.innerHTML="<button data-v3='copy'>Copy previous</button><button data-v3='note'>Exercise note</button><button data-v3='setup'>Setup</button><button data-v3='coach' class='coachAsk'>Ask trainer</button>"+(rot?"<button data-v3='rotate'>Rotate</button>":"");
  card.insertBefore(bar,card.children[1]||null);
  const ctx=document.createElement("div");
  ctx.className="setup";
  ctx.innerHTML="<b>Quick context</b><br>"+(mem.seat||mem.grip||mem.pin||mem.cue?esc([mem.seat,mem.grip,mem.pin,mem.cue].filter(Boolean).join(" | ")):"No setup saved.")+(rot?"<br>"+esc(rot):"");
  card.insertBefore(ctx,bar.nextSibling);
  bar.querySelector("[data-v3=copy]").onclick=()=>{ const sets=logGetSets(ei), ll=slotLast(ei); if(!ll){toast("No previous set");return;} sets.forEach(s=>{s.w=ll.w;s.r=ll.r;}); save(); renderLog(); };
  bar.querySelector("[data-v3=note]").onclick=()=>openDetail(opt);
  bar.querySelector("[data-v3=setup]").onclick=()=>openSetupMemory(opt.n);
  bar.querySelector("[data-v3=coach]").onclick=()=>askCoachForExercise(ei);
  const rb=bar.querySelector("[data-v3=rotate]"); if(rb)rb.onclick=()=>openSwap(ei);
}
function askCoachForExercise(ei){
  const opt=logOpt(ei), sets=logGetSets(ei), past=slotLog(ei).slice(-8);
  const today=sets.map((s,i)=>({set:i+1,kg:s.w,reps:s.r,rir:s.rir,done:!!s.done,type:setTypeOf(s)}));
  const history=past.map(x=>({kg:x.w,reps:x.r,rir:x.rir,date:x.date||x.d}));
  openChat();
  sendChat("Coach me on "+opt.n+" right now. Target is "+opt.r+". Today's sets: "+JSON.stringify(today)+". Recent history: "+JSON.stringify(history)+". Tell me the exact next-set load/reps/RIR, one form cue, and whether I should keep, add, or remove a set. Keep it brief.");
}
function installLogRestTimer(m){
  if(m.dataset.cleanRest)return;
  m.dataset.cleanRest="1";
  m.addEventListener("click",e=>{
    if(!e.target.classList.contains("ok")||!e.target.dataset.i)return;
    const card=e.target.closest(".ex"), cards=[...m.querySelectorAll(".ex")], ei=cards.indexOf(card), si=+e.target.dataset.i;
    if(ei<0)return;
    setTimeout(()=>{ const s=logGetSets(ei)[si]; if(s&&s.done&&setTypeOf(s)!=="warm"&&restAutoStart())startTimer(restFor(logOpt(ei))); },90);
  },true);
}

/* ---------- session summary + quick-fill actions ---------- */
function logSessionSummaryHTML(){
  const day=logDay(); let done=0,total=0,vol=0,rir=[],warm=0;
  day.ex.forEach((_,ei)=>logGetSets(ei).forEach(s=>{
    const type=setTypeOf(s);
    if(type==="warm"){ warm++; return; }
    // Drop sets are optional finishers: include their completed load in session volume,
    // but never inflate the prescribed working-set total or completion percentage.
    if(type==="drop"){
      if(s.done&&s.w&&s.r)vol+=s.w*s.r;
      return;
    }
    total++;
    if(s.done){done++; if(s.w&&s.r&&type!=="t40")vol+=s.w*s.r; if(s.rir!=null)rir.push(s.rir);}
  }));
  const pct=total?Math.round(done/total*100):0, ar=avg(rir);
  const effort=ar==null?"Tap RIR after hard sets for smarter progression.":(ar<=1?"Hard session. Recovery matters tomorrow.":ar>=3?"Plenty in reserve. You can push load/reps.":"Good hypertrophy effort.");
  return "<div class='logcoach' role='status' aria-live='polite'><b>"+pct+"% complete</b> | "+done+"/"+total+" work sets"+(warm?" | "+warm+" warm-up":"")+" | "+volDisp(vol).toLocaleString()+" "+unit+" volume<br>"+effort+"</div>";
}

/* ---------- focused workout navigator ----------
   The live view keeps every exercise mounted so the existing per-card listeners and
   index-based slot mapping remain reliable, but only the selected card is visible in
   focused mode. The compact queue is the one place to jump, see status, or reorder. */
let _logFocusEi=null;
let _logFocused=localStorage.getItem("gymLogFocused")!=="0";
function logActiveIndexes(){
  const day=logDay(), out=[];
  if(day)day.ex.forEach((_,ei)=>{if(!skipState(ei))out.push(ei);});
  return out;
}
function logFirstPending(){
  const active=logActiveIndexes();
  return active.find(ei=>!isExerciseDone(logGetSets(ei)))!=null
    ? active.find(ei=>!isExerciseDone(logGetSets(ei)))
    : (active[0]!=null?active[0]:0);
}
function normalizeLogFocus(){
  const active=logActiveIndexes();
  if(!active.length){_logFocusEi=0;return;}
  if(_logFocusEi==null||active.indexOf(_logFocusEi)<0)_logFocusEi=logFirstPending();
}
function setLogFocus(ei){
  if(logActiveIndexes().indexOf(ei)<0)return;
  _logFocusEi=ei;_logFocused=true;localStorage.setItem("gymLogFocused","1");renderLog();
  setTimeout(()=>{const x=document.querySelector("#logBody .ex[data-ei='"+ei+"']");if(x)x.scrollIntoView({block:"start",behavior:"smooth"});},20);
}
function moveLogFocus(dir){
  normalizeLogFocus();
  const active=logActiveIndexes(), pos=active.indexOf(_logFocusEi);
  if(pos<0||!active.length)return;
  const ordered=[];
  for(let n=1;n<=active.length;n++)ordered.push(active[(pos+n*dir+active.length*3)%active.length]);
  const pending=ordered.find(ei=>!isExerciseDone(logGetSets(ei)));
  _logFocusEi=pending!=null?pending:ordered[0];
  renderLog();
}
function advanceLogFocusAfter(ei){
  if(!_logFocused)return;
  const active=logActiveIndexes(), pos=active.indexOf(ei);
  if(pos<0)return;
  for(let n=1;n<=active.length;n++){
    const next=active[(pos+n)%active.length];
    if(!isExerciseDone(logGetSets(next))){_logFocusEi=next;return;}
  }
}
function toggleLogFocus(){
  _logFocused=!_logFocused;
  localStorage.setItem("gymLogFocused",_logFocused?"1":"0");
  renderLog();
}
function logFocusNavigatorHTML(){
  normalizeLogFocus();
  const day=logDay(), active=logActiveIndexes(), done=active.filter(ei=>isExerciseDone(logGetSets(ei))).length;
  const queue=active.map((ei,pos)=>{
    const o=logOpt(ei), complete=isExerciseDone(logGetSets(ei)), selected=ei===_logFocusEi;
    return "<button class='logQueueItem"+(complete?" done":"")+(selected?" on":"")+"' data-logq='"+ei+"' aria-label='"+escAttr((complete?"Completed: ":"Exercise "+(pos+1)+": ")+o.n)+"' aria-pressed='"+(selected?"true":"false")+"'><span>"+(complete?"✓":(pos+1))+"</span><b>"+esc(o.n)+"</b></button>";
  }).join("");
  return "<section class='logFocusNav' aria-label='Workout exercise navigator'>"+
    "<div class='logFocusTop'><div><span>EXERCISE QUEUE</span><b>"+done+" of "+active.length+" complete</b></div><button data-lognav='mode' aria-pressed='"+(_logFocused?"true":"false")+"'>"+(_logFocused?"Show all":"Focus one")+"</button></div>"+
    "<div class='logQueue' role='list'>"+queue+"</div>"+
    "<div class='logFocusActions'><button data-lognav='prev' aria-label='Previous exercise'>‹ Previous</button><button data-lognav='reorder' aria-label='Reorder workout exercises'>Reorder</button><button data-lognav='next' aria-label='Next incomplete exercise'>Next ›</button></div></section>";
}
function bindLogFocusNavigator(m){
  m.querySelectorAll("[data-logq]").forEach(b=>b.onclick=()=>setLogFocus(+b.dataset.logq));
  const mode=m.querySelector("[data-lognav=mode]");if(mode)mode.onclick=toggleLogFocus;
  const prev=m.querySelector("[data-lognav=prev]");if(prev)prev.onclick=()=>moveLogFocus(-1);
  const next=m.querySelector("[data-lognav=next]");if(next)next.onclick=()=>moveLogFocus(1);
  const reorder=m.querySelector("[data-lognav=reorder]");if(reorder)reorder.onclick=()=>openDayEditor(curDay);
}
function addLogQuickActions(){
  document.querySelectorAll("#logBody .ex").forEach((card,ei)=>{
    if(card.querySelector(".ttquick"))return;
    const bar=document.createElement("div"); bar.className="ttquick";
    bar.innerHTML="<button data-tt='fill'>Fill target</button><button data-tt='rep'>+1 rep all</button><button data-tt='easy'>Mark 2 RIR</button><button data-tt='deload'>-5% load</button>";
    const top=card.querySelector(".extop"); if(top)top.insertAdjacentElement("afterend",bar);
    bar.querySelector("[data-tt=fill]").onclick=()=>{ const sug=logNext(ei), sets=logGetSets(ei), reps=midReps(logOpt(ei).r); sets.forEach(s=>{ if(s.w==null&&sug)s.w=sug.kg; if(s.r==null)s.r=reps; }); save(); renderLog(); };
    bar.querySelector("[data-tt=rep]").onclick=()=>{ logGetSets(ei).forEach(s=>{ if(s.r!=null)s.r++; }); save(); renderLog(); };
    bar.querySelector("[data-tt=easy]").onclick=()=>{ logGetSets(ei).forEach(s=>{ if(s.done)s.rir=2; }); save(); renderLog(); };
    bar.querySelector("[data-tt=deload]").onclick=()=>{ logGetSets(ei).forEach(s=>{ if(s.w)s.w=round25(s.w*.95); }); save(); renderLog(); };
  });
}

/* ---------- "feeling strong" bonus picker ----------
   User-driven: tap the button, PICK the muscle you feel like working, and the app shows
   that muscle's weekly status plus which REGIONS (upper chest, biceps long head, ...)
   haven't been touched in the last 7 days — then offers finisher exercises that fill
   exactly those gaps. Guardrails: a muscle at ~10 sets today or near its weekly ceiling
   is flagged "covered" (extra sets would be junk volume), and a logged low-readiness day
   swaps the whole feature for a recover-instead message. Added exercises are 2x12-15,
   tagged with today's date, and expire after today — a one-off top-up, never a silent
   permanent program change. */
let _bonusMus=null;
function bonusMuscleStatus(mus){
  const wk=weeklyMuscleSets(), day=logDay();
  const todayM=day?day.ex.reduce((a,e,ei)=>a+((e.m===mus&&!skipState(ei))?targetSets(logOpt(ei).r):0),0):0;
  const weekly=(wk[mus]||0)+todayM, t=PLAN_TARGETS[mus]||[8,18], fresh=daysSinceTrained(mus);
  return {weekly:weekly,t:t,fresh:fresh,todayM:todayM,capped:todayM>=10||weekly>=t[1]-1};
}
function bonusRegionInfo(mus){
  const pool=LIB.filter(x=>libMuscleOf(x)===mus), regions=regionChips(pool);
  const cut=localDateStr(new Date(Date.now()-6*864e5)), covered=new Set();
  // regions hit in the last 7 days of logged history + everything in today's plan
  Object.keys(state.history||{}).forEach(n=>(state.history[n]||[]).forEach(l=>{ if(l.d>=cut)covered.add(exFor({n:n},l.m||mus)); }));
  const day=logDay(); if(day)day.ex.forEach((e,ei)=>{ if(!skipState(ei))covered.add(exFor(logOpt(ei),e.m)); });
  return {regions:regions,missing:regions.filter(r=>!covered.has(r)),pool:pool};
}
function openBonusPicker(){ _bonusMus=null; renderBonusPicker(); detDlg.showModal(); }
function renderBonusPicker(){
  const MUS=["Chest","Back","Shoulders","Rear delts","Biceps","Triceps","Legs","Core","Traps","Forearms"];
  if(!_bonusMus){
    document.getElementById("detTitle").textContent="⚡ What do you feel like working?";
    document.getElementById("detBody").innerHTML="<p style='color:var(--muted);margin-top:0'>Pick a muscle — you'll see what's missing this week, and anything you add is for today only (2 sets, finisher style).</p>"+
      MUS.map(mus=>{ const st=bonusMuscleStatus(mus);
        const stTxt=st.weekly+"/"+st.t[1]+" sets this week"+(st.fresh!=null?" · "+(st.fresh===0?"trained today":st.fresh+"d fresh"):" · not trained yet");
        const flag=st.capped?"<span style='color:var(--muted);font-size:12px;font-weight:700'>covered ✓</span>":(st.weekly<st.t[0]?"<span style='color:var(--gold);font-size:12px;font-weight:700'>needs work</span>":"<span style='color:var(--accent);font-size:12px;font-weight:700'>has room</span>");
        return "<div class='opt' data-bm='"+mus+"'><div class='o'><div class='t'>"+mus+"</div><div class='s'>"+stTxt+"</div></div>"+flag+"</div>"; }).join("");
    document.querySelectorAll("#detBody [data-bm]").forEach(b=>b.onclick=()=>{ _bonusMus=b.dataset.bm; renderBonusPicker(); });
  } else {
    const mus=_bonusMus, st=bonusMuscleStatus(mus), ri=bonusRegionInfo(mus), day=logDay();
    document.getElementById("detTitle").textContent="⚡ Bonus "+mus.toLowerCase()+" work";
    let h="<button class='ghost' id='bnBack' style='margin-bottom:10px;background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:8px 12px;font-weight:700'>‹ All muscles</button>";
    h+="<p style='margin:0 0 6px'><b>"+mus+"</b> — "+st.weekly+"/"+st.t[1]+" weekly sets"+(st.fresh!=null?", last trained "+(st.fresh===0?"today":st.fresh+" day"+(st.fresh>1?"s":"")+" ago"):"")+"</p>";
    if(st.capped){
      h+="<div class='loadwarn'>"+mus+" is already well covered this week — extra sets now would mostly cost recovery, not build muscle. Pick a muscle marked \"needs work\" instead.</div>";
    } else {
      if(ri.missing.length)h+="<p style='color:var(--gold);font-size:13px;margin:0 0 8px'>Not trained this week: "+ri.missing.slice(0,3).map(esc).join(" · ")+"</p>";
      else h+="<p style='color:var(--muted);font-size:13px;margin:0 0 8px'>All regions touched this week — these add clean extra volume:</p>";
      const inToday=n=>!!(day&&day.ex.some((e,ei)=>sameEx(logOpt(ei).n,n)));
      const regs=(ri.missing.length?ri.missing:ri.regions).slice(0,4), seen={}, sugs=[];
      regs.forEach(rg=>{
        const cand=ri.pool.find(x=>exFor(x,x.m)===rg&&isIsolation(x)&&!seen[x.id]&&!inToday(x.n))
                 ||ri.pool.find(x=>exFor(x,x.m)===rg&&!seen[x.id]&&!inToday(x.n));
        if(cand){ seen[cand.id]=1; sugs.push({rg:rg,x:cand}); }
      });
      h+=sugs.length?sugs.map(s=>"<div style='display:flex;align-items:center;gap:9px;margin-top:9px'><img src='"+escAttr(s.x.img)+"' style='width:44px;height:44px;border-radius:9px;object-fit:cover' onerror=\"this.style.visibility='hidden'\"><div style='flex:1;min-width:0'><div style='font-weight:700;font-size:14px'>"+esc(s.x.n)+"</div><div style='color:var(--muted);font-size:12px'>"+esc(s.rg)+" · "+esc(s.x.eq)+"</div></div><button data-bonus='"+escAttr(s.x.id)+"' style='background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:8px 12px;font-weight:700;flex:0 0 auto'>+ Add</button></div>").join("")
        :"<p style='color:var(--muted)'>Nothing suitable found that isn't already in today's session.</p>";
    }
    document.getElementById("detBody").innerHTML=h;
    const bk=document.getElementById("bnBack"); if(bk)bk.onclick=()=>{ _bonusMus=null; renderBonusPicker(); };
    document.querySelectorAll("#detBody [data-bonus]").forEach(b=>b.onclick=()=>{ addBonusExercise(b.dataset.bonus); renderBonusPicker(); });
  }
}
function addBonusExercise(lid){
  const x=LIB.find(e=>e.id===lid); if(!x)return;
  const exObj={m:x.m,opts:[{exerciseId:x.id,libId:x.id,n:x.n,r:"2 x 12-15",cue:x.cue,img:x.img,eq:x.eq}],__bonusDate:todayStr()};
  if(logCustom){ logCustom.ex.push(exObj); save(); }
  else { const key=activeProg+"_"+PROGRAM[curDay].key; state.extraExercises=state.extraExercises||{}; (state.extraExercises[key]=state.extraExercises[key]||[]).push(exObj); save(); buildActive(); }
  renderLog(); toast("Added "+x.n+" — 2 finisher sets, today only");
}

/* ---------- skip / remove exercise for today ---------- */
function skipState(ei){ const r=state.slots[logId(ei)]||{}; if(r.removedDate===todayStr())return "removed"; if(r.skipDate===todayStr())return "skipped"; return ""; }
function clearExerciseHold(ei){ const r=logRec(ei); delete r.skipDate; delete r.removedDate; save(); renderLog(); }
function skipExerciseToday(ei){ const r=logRec(ei); r.skipDate=todayStr(); delete r.removedDate; save(); hideTimer(); renderLog(); toast("Skipped today"); }
function removeExerciseToday(ei){
  const exo=logDay().ex[ei], opt=logOpt(ei);
  if(logCustom||exo.__user){ removeExtra(exo); return; }
  const r=logRec(ei); r.removedDate=todayStr(); delete r.skipDate; save(); hideTimer(); renderLog(); toast("Removed from today");
}
function installExerciseActions(){
  document.querySelectorAll("#logBody .ex").forEach((card,ei)=>{
    const stateNow=skipState(ei), top=card.querySelector(".extop");
    if(stateNow){
      card.classList.add(stateNow);
      if(!card.querySelector(".skipbox")){
        top.insertAdjacentHTML("afterend","<div class='skipbox'><span><b>"+(stateNow==="removed"?"Removed today":"Skipped today")+"</b><br>This exercise will not count in this workout.</span><button data-act='undo'>Undo</button></div>");
        card.querySelector("[data-act=undo]").onclick=function(){ clearExerciseHold(ei); };
      }
      return;
    }
    if(card.querySelector(".exactions"))return;
    const exo=logDay().ex[ei], removeText=(logCustom||exo.__user)?"Remove":"Remove today";
    const anchor=card.querySelector(".lastbox")||card.querySelector(".ttquick")||top;
    anchor.insertAdjacentHTML("afterend","<div class='exactions'><button data-act='skip'>Skip today</button><button data-act='remove'>"+removeText+"</button></div>");
    card.querySelector("[data-act=skip]").onclick=function(){ skipExerciseToday(ei); };
    card.querySelector("[data-act=remove]").onclick=function(){ if(confirm(removeText+"?"))removeExerciseToday(ei); };
  });
}

/* ---------- day editor: reorder / remove / add exercises for a program day ----------
   The saved order is authoritative: saving sets day.userOrder, which makes buildActive()
   skip its priority auto-sort for that day (otherwise a manual order would silently snap
   back on the next rebuild). Editing a BUILT-IN program bakes the built day (incl. any
   emphasis/extra exercises) into a fresh custom copy via the saveCustomProgram contract;
   editing a custom program updates it in place and remaps today's slot records (typed
   weights, swaps, skip flags) so they follow their exercise through the reorder. */
let _dayEdit=null,_addForDayEdit=false;
function openDayEditor(di){
  if(logCustom){ editCustom(logCustom.index); return; } // custom workouts already have their own editor
  const day=PROGRAM[di]; if(!day)return;
  _dayEdit={di:di,key:day.key,day:day.day,title:day.title,
    list:day.ex.map((e,ei)=>({m:e.m,opts:JSON.parse(JSON.stringify(e.opts)),origIdx:ei}))};
  renderDayEditor(); detDlg.showModal();
}
function renderDayEditor(){
  const d=_dayEdit; if(!d)return;
  document.getElementById("detTitle").textContent="Edit "+d.day+" · "+d.title;
  const rows=d.list.map((e,i)=>{ const o=e.opts[0];
    return "<div class='opt' data-de-row='"+i+"'><span data-dh='"+i+"' style='font-size:17px;padding:4px 8px 4px 2px;color:var(--muted);touch-action:none'>☰</span><img src='"+escAttr(o.img||"")+"' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(o.n)+"</div><div class='s'>"+esc(e.m+" · "+(o.r||""))+"</div></div>"+
      "<button data-de='up' data-i='"+i+"'"+(i===0?" disabled":"")+">↑</button><button data-de='down' data-i='"+i+"'"+(i===d.list.length-1?" disabled":"")+">↓</button><button data-de='rm' data-i='"+i+"'>✕</button></div>"; }).join("");
  document.getElementById("detBody").innerHTML="<p style='color:var(--muted);margin-top:0'>Drag ☰ (or tap ↑ ↓) to reorder, ✕ to remove, then Save. The order you set sticks — automatic sorting is turned off for this day.</p>"+rows+
    "<div class='btnrow'><button class='s' id='deAdd'>＋ Add exercise</button><button id='deSave'>Save day</button></div>";
  document.querySelectorAll("#detBody [data-de]").forEach(b=>b.onclick=()=>{
    const i=+b.dataset.i,a=b.dataset.de;
    if(a==="up"&&i>0){ const t=d.list[i-1];d.list[i-1]=d.list[i];d.list[i]=t; }
    else if(a==="down"&&i<d.list.length-1){ const t=d.list[i+1];d.list[i+1]=d.list[i];d.list[i]=t; }
    else if(a==="rm"){ if(!confirm("Remove \""+d.list[i].opts[0].n+"\" from this day?"))return; d.list.splice(i,1); }
    renderDayEditor();
  });
  document.getElementById("deAdd").onclick=()=>{ openAddEx(); _addForDayEdit=true; };
  document.getElementById("deSave").onclick=saveDayEdit;
  // touch drag on the ☰ handle: dim the row while dragging, move once on release to
  // whichever row the finger ends over (mid-drag re-rendering would kill the gesture)
  document.querySelectorAll("#detBody [data-dh]").forEach(h=>{
    let fromIdx=null,lastY=null;
    h.ontouchstart=ev=>{ fromIdx=+h.dataset.dh; lastY=ev.touches[0].clientY; const rw=h.closest(".opt"); if(rw)rw.style.opacity=".45"; ev.preventDefault(); };
    h.ontouchmove=ev=>{ lastY=ev.touches[0].clientY; ev.preventDefault(); };
    h.ontouchend=()=>{ if(fromIdx==null)return;
      const rowsEls=[...document.querySelectorAll("#detBody [data-de-row]")];
      let to=rowsEls.findIndex(r=>{ const b=r.getBoundingClientRect(); return lastY>=b.top&&lastY<=b.bottom; });
      if(to<0)to=lastY<(rowsEls[0]?rowsEls[0].getBoundingClientRect().top:0)?0:d.list.length-1;
      if(to!==fromIdx){ const it=d.list.splice(fromIdx,1)[0]; d.list.splice(to,0,it); }
      fromIdx=null; renderDayEditor(); };
  });
}
function saveDayEdit(){
  const d=_dayEdit; if(!d)return;
  if(!d.list.length){ toast("Keep at least one exercise"); return; }
  const pid=activeProg, isCustom=BUILTIN_PROGRAM_IDS.indexOf(pid)===-1&&!!(state.customPrograms&&state.customPrograms[pid]);
  if(typeof rememberProgramUndo==="function")rememberProgramUndo("day edit");
  const newProg=JSON.parse(JSON.stringify(PROGRAMS[pid]));
  const dIdx=newProg.days.findIndex(x=>x.key===d.key);
  if(dIdx<0){ toast("Could not find this day in the program"); return; }
  newProg.days[dIdx].ex=d.list.map(x=>({m:x.m,opts:x.opts}));
  newProg.days[dIdx].mus=[...new Set(d.list.map(x=>x.m))];
  newProg.days[dIdx].userOrder=true;
  const newId=saveCustomProgram(newProg,{basedOn:isCustom?((state.customPrograms[pid]||{}).basedOn||null):pid,source:"manual",diff:DIFF[pid],icon:PROG_ICON[pid],overwriteCustomId:isCustom?pid:null});
  // any per-day extras are baked into the saved day now — drop them so they can't double up
  if(state.extraExercises){ delete state.extraExercises[pid+"_"+d.key]; delete state.extraExercises[newId+"_"+d.key]; }
  if(newId===pid){
    // in-place edit: permute today's slot records (typed weights, swaps, skip flags)
    // to the exercises' new indexes; records of removed exercises are dropped
    const prefix=pid+"_"+d.key+"_", old={};
    Object.keys(state.slots).forEach(k=>{ if(k.indexOf(prefix)===0){ old[k]=state.slots[k]; delete state.slots[k]; } });
    d.list.forEach((x,n)=>{ if(x.origIdx>=0&&old[prefix+x.origIdx])state.slots[prefix+n]=old[prefix+x.origIdx]; });
  }
  activeProg=newId; state.programId=newId;
  _dayEdit=null; save(); buildActive(); detDlg.close();
  if(document.getElementById("logView").classList.contains("on"))renderLog(); else renderPlan();
  toast(newId===pid?"Day updated ✓":"Saved as your own copy of the program");
}

/* ---------- add exercise to today (also used for a manual superset pick) ---------- */
let _addMuscle="",_addRegion="",_ssTarget=null;
function openAddEx(ssEi){ _ssTarget=(typeof ssEi==="number")?ssEi:null; _addMuscle=""; _addRegion=""; _addForDayEdit=false; // day editor re-arms this AFTER calling
  document.getElementById("detTitle").textContent=_ssTarget!=null?("⚡ Superset with "+logOpt(_ssTarget).n):("Add exercise to "+(logCustom?logCustom.name:(PROGRAM[curDay].day+" · "+PROGRAM[curDay].title)));
  renderAddEx(""); detDlg.showModal(); }
/* Two-level filter, same as the swap dialog: muscle chip first (incl. Rear delts /
   Traps / Forearms, which x.m alone can't distinguish), then a region chip row —
   e.g. Biceps → "Biceps long head (stretch)" — from exFor's head-level labels. */
function renderAddEx(q){ const ql=q.toLowerCase(), MUS=MUSCLE_PICKER;
  let pool=LIB.filter(x=>!_addMuscle||libMuscleOf(x)===_addMuscle);
  const regions=_addMuscle?regionChips(pool):[];
  if(_addMuscle&&_addRegion)pool=pool.filter(x=>exFor(x,x.m)===_addRegion);
  const lib=pool.filter(x=>!q||x.n.toLowerCase().includes(ql));
  let h="<input id='aeq' value=\""+q.replace(/"/g,"&quot;")+"\" placeholder='Search exercises…' style='width:100%;height:44px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:0 12px;margin-bottom:10px;font-size:15px'>";
  h+="<div class='msel'>"+MUS.map(mm=>"<button class='mm"+(_addMuscle===mm?" on":"")+"' data-m='"+escAttr(mm)+"'>"+esc(mm)+"</button>").join("")+"</div>";
  if(regions.length)h+="<div class='msel'>"+regions.map(rg=>"<button class='mm"+(_addRegion===rg?" on":"")+"' data-rg='"+escAttr(rg)+"'>"+esc(rg)+"</button>").join("")+"</div>";
  h+=lib.slice(0,120).map(x=>"<div class='opt' data-id='"+x.id+"'><img src='"+x.img+"' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(x.n)+"</div><div class='s'>"+esc((exFor(x,x.m)||x.m)+" · "+x.eq)+"</div></div></div>").join("")||"<div style='color:var(--muted);padding:8px'>No matches.</div>";
  document.getElementById("detBody").innerHTML=h;
  const inp=document.getElementById("aeq"); inp.oninput=()=>{ const v=inp.value,ss=inp.selectionStart; renderAddEx(v); const n=document.getElementById("aeq"); n.focus(); try{n.setSelectionRange(ss,ss);}catch(e){} };
  document.querySelectorAll("#detBody .mm[data-m]").forEach(b=>b.onclick=()=>{ _addMuscle=_addMuscle===b.dataset.m?"":b.dataset.m; _addRegion=""; renderAddEx(document.getElementById("aeq").value); });
  document.querySelectorAll("#detBody .mm[data-rg]").forEach(b=>b.onclick=()=>{ _addRegion=_addRegion===b.dataset.rg?"":b.dataset.rg; renderAddEx(document.getElementById("aeq").value); });
  document.querySelectorAll("#detBody .opt[data-id]").forEach(el=>el.onclick=()=>addExToDay(el.dataset.id));
}
function addExToDay(lid){ const x=LIB.find(e=>e.id===lid); if(!x)return;
  if(_addForDayEdit&&_dayEdit){ // picked from inside the day editor: into its list, not the day
    _addForDayEdit=false;
    _dayEdit.list.push({m:x.m,opts:[{exerciseId:x.id,libId:x.id,n:x.n,r:"3 x 8-12",cue:x.cue,img:x.img,eq:x.eq}],origIdx:-1});
    renderDayEditor(); toast("Added "+x.n+" — move it where you want, then Save");
    return;
  }
  if(_ssTarget!=null){ logRec(_ssTarget).ss={exerciseId:x.id,libId:x.id,exerciseName:x.n,m:x.m,n:x.n,img:x.img,cue:x.cue,eq:x.eq,sets:[{w:null,r:null,done:false}]}; save(); _ssTarget=null; detDlg.close(); renderLog(); toast("⚡ Superset added: "+x.n); return; }
  const exObj={m:x.m,opts:[{exerciseId:x.id,libId:x.id,n:x.n,r:"3 x 8-12",cue:x.cue,img:x.img,eq:x.eq}]};
  if(logCustom){ logCustom.ex.push(exObj); save(); }
  else { const key=activeProg+"_"+PROGRAM[curDay].key; state.extraExercises=state.extraExercises||{}; state.extraExercises[key]=state.extraExercises[key]||[]; state.extraExercises[key].push(exObj); save(); buildActive(); }
  detDlg.close(); renderLog();
  const wk=progWeeklySets()[x.m]||0; if(!logCustom&&wk>20) toast("Added — ⚠️ "+x.m+" now "+wk+" sets/week (over the ~20 max)"); else toast("Added "+x.n);
}
function removeExtra(exo){ if(logCustom){ const i=logCustom.ex.indexOf(exo); if(i>=0){logCustom.ex.splice(i,1);save();} renderLog(); return; }
  const key=activeProg+"_"+PROGRAM[curDay].key, arr=state.extraExercises&&state.extraExercises[key];
  if(arr){ const i=arr.findIndex(e=>e.opts[0].n===exo.opts[0].n); if(i>=0)arr.splice(i,1); save(); buildActive(); } renderLog(); toast("Removed"); }

/* ---------- warm-up calc / plate calculator / progress chart ---------- */
function toggleWarm(card,opt,w){ const el=card.querySelector("[data-warm]");
  if(el.classList.contains("on")){el.classList.remove("on");return;}
  if(!w){el.innerHTML="Enter a working weight first.";el.classList.add("on");return;}
  const sets=[["Empty bar",20,10],["~50%",round25(w*.5),8],["~70%",round25(w*.7),5],["~85%",round25(w*.85),3]].filter(s=>s[1]>0&&s[1]<w);
  el.innerHTML="<b style='color:var(--gold)'>Warm-up before "+toDisp(w)+" "+unit+":</b>"+sets.map((s,i)=>"<div>"+(i+1)+". "+s[0]+" — <b>"+toDisp(s[1])+" "+unit+"</b> × "+s[2]+"</div>").join(""); el.classList.add("on"); }
const PLATE_SETS={kg:{plates:[25,20,15,10,5,2.5,1.25]},lb:{plates:[45,35,25,10,5,2.5]}};
/* Selectable bar type — a trap bar (~25 kg) or EZ bar (~10 kg) loads very differently
   from a 20 kg barbell; the last choice is remembered across opens. */
const BAR_TYPES={kg:[["Barbell",20],["Trap bar",25],["EZ bar",10],["Smith",8]],lb:[["Barbell",45],["Trap bar",55],["EZ bar",25],["Smith",18]]};
const PCOL={45:"#c0392b",35:"#16a085",25:"#c0392b",20:"#2563eb",15:"#d4a017",10:"#27ae60",5:"#7f8c8d","2.5":"#444","1.25":"#888"};
/* w arrives in kg (internal). Show the bar/plates in the user's selected unit. */
function openPlate(wKg){ const b=document.getElementById("plateBody"), cfg=PLATE_SETS[unit]||PLATE_SETS.kg, PLATES=cfg.plates;
  const bars=BAR_TYPES[unit]||BAR_TYPES.kg;
  let bi=+(localStorage.getItem("gymBar")||0); if(!(bi>=0&&bi<bars.length))bi=0;
  const BAR=bars[bi][1];
  const barSel="<div class='segm' style='margin-bottom:12px'>"+bars.map((bt,i)=>"<button data-bar='"+i+"' class='"+(i===bi?"on":"")+"' style='height:38px;font-size:12px'>"+bt[0]+"<br>"+bt[1]+"</button>").join("")+"</div>";
  if(wKg==null||wKg===""||!(+wKg>0)){b.innerHTML=barSel+"<p>Enter a working weight first.</p>";}
  else{
    const w=toDisp(wKg);
    let per=(w-BAR)/2,html=barSel+"<p>"+bars[bi][0]+" "+BAR+" "+unit+" · target <b>"+w+" "+unit+"</b><br><span style='color:var(--muted)'>Each side:</span></p>";
    if(w<BAR)html+="<p>Below the empty bar — use a lighter bar or dumbbells.</p>"; else if(per<=0)html+="<p>Just the empty bar.</p>";
    else{ let rem=per,ch=""; PLATES.forEach(p=>{let c=0;while(rem>=p-0.001){rem=Math.round((rem-p)*100)/100;c++;}for(let i=0;i<c;i++)ch+="<span class='plate' style='background:"+(PCOL[p]||"#555")+"'>"+p+"</span>";}); html+="<div style='line-height:2.4'>"+ch+"</div>"; if(rem>0.01)html+="<p style='color:var(--muted)'>(+"+rem+" "+unit+" not makeable)</p>"; }
    b.innerHTML=html;
  }
  b.querySelectorAll("[data-bar]").forEach(bb=>bb.onclick=()=>{ localStorage.setItem("gymBar",bb.dataset.bar); openPlate(wKg); });
  if(!plateDlg.open)plateDlg.showModal(); }
function openChartLog(ei){ const log=slotLog(ei), opt=logOpt(ei);
  document.getElementById("chartTitle").textContent=opt.n;
  if(!log.length){ document.getElementById("chartBody").innerHTML="<p style='color:var(--muted)'>No history yet. Finish a workout to start your progress curve.</p>"; chartDlg.showModal(); return; }
  // Timed exercises chart seconds; bodyweight/reps-only chart reps; else top weight.
  const isTimed=log.every(l=>l.t), bodyweight=!isTimed&&log.every(l=>!l.w);
  const vals=log.slice(-12).map(l=>(isTimed||bodyweight)?(l.r||0):toDisp(l.w)), W=340,H=180,pad=28,max=Math.max(10,...vals);
  const x=i=>pad+i*(W-2*pad)/Math.max(1,vals.length-1), y=v=>H-pad-(v/max)*(H-2*pad);
  let pts=vals.map((v,i)=>x(i).toFixed(0)+","+y(v).toFixed(0)).join(" "), dots=vals.map((v,i)=>"<circle cx='"+x(i).toFixed(0)+"' cy='"+y(v).toFixed(0)+"' r='4' fill='var(--gold)'/>").join("");
  document.getElementById("chartBody").innerHTML="<svg viewBox='0 0 "+W+" "+H+"' style='width:100%'><polyline points='"+pts+"' fill='none' stroke='var(--accent)' stroke-width='2.5'/>"+dots+"</svg><p style='color:var(--muted)'>"+(isTimed?"Longest hold per session (seconds).":bodyweight?"Reps per session (bodyweight).":"Top weight per session ("+unit+").")+"</p>"; chartDlg.showModal(); }

/* ---------- bench-angle level (device motion/orientation sensor) ---------- */
function angleTarget(name){ const n=(name||"").toLowerCase();
  if(/low-incline|low incline/.test(n))return {target:30,lo:20,hi:30,label:"Bench 20-30°"};
  if(/incline/.test(n))return {target:30,lo:25,hi:35,label:"Bench ~30°"};
  if(/shoulder press|military|arnold|overhead press/.test(n))return {target:85,lo:75,hi:90,label:"Bench 75-90°"};
  return null; }
let lvlTarget=30,lvlObj=null,lvlAngle=0,lvlHad=false,lvlHit=false; const PIV={x:30,y:118},RAD=150;
function polar(d){ const a=d*Math.PI/180; return {x:PIV.x+RAD*Math.cos(a),y:PIV.y-RAD*Math.sin(a)}; }
function buildGauge(){ let o="M "+polar(0).x.toFixed(1)+" "+polar(0).y.toFixed(1); for(let d=0;d<=90;d+=3){const p=polar(d);o+=" L "+p.x.toFixed(1)+" "+p.y.toFixed(1);} document.getElementById("lvlArc").setAttribute("d",o);
  let t=""; [0,15,30,45,60,75,90].forEach(d=>{const i1=RAD-10,ax=PIV.x+i1*Math.cos(d*Math.PI/180),ay=PIV.y-i1*Math.sin(d*Math.PI/180),b=polar(d); t+="<line x1='"+ax.toFixed(1)+"' y1='"+ay.toFixed(1)+"' x2='"+b.x.toFixed(1)+"' y2='"+b.y.toFixed(1)+"' stroke='#55555f' stroke-width='2'/>"; const tx=PIV.x+(RAD+12)*Math.cos(d*Math.PI/180),ty=PIV.y-(RAD+12)*Math.sin(d*Math.PI/180); t+="<text x='"+tx.toFixed(1)+"' y='"+(ty+4).toFixed(1)+"' fill='#7a7a84' font-size='9' text-anchor='middle'>"+d+"</text>";}); document.getElementById("lvlTicks").innerHTML=t; }
function setNeedle(d){ const p=polar(Math.max(0,Math.min(90,d))); const n=document.getElementById("lvlNeedle"); n.setAttribute("x2",p.x.toFixed(1)); n.setAttribute("y2",p.y.toFixed(1)); }
function setTarget(d){ const p=polar(d),t=document.getElementById("lvlTarget"); t.setAttribute("x2",p.x.toFixed(1)); t.setAttribute("y2",p.y.toFixed(1)); }
function refreshTgt(){ document.getElementById("tVal").textContent=lvlTarget; setTarget(lvlTarget); }
/* Target − / + buttons in the level dialog (static HTML in index.html — bind once here;
   they were shipped unwired, so the target could never actually be changed). A manual
   adjustment clears any exercise-derived target range so the hit test follows the number
   the user picked (±2°) instead of the old exercise's lo/hi band. */
(function(){
  const d=document.getElementById("tDec"), i=document.getElementById("tInc");
  const adj=delta=>{ lvlTarget=Math.max(0,Math.min(90,lvlTarget+delta)); lvlObj=null; lvlHit=false; refreshTgt(); };
  if(d)d.onclick=()=>adj(-5);
  if(i)i.onclick=()=>adj(5);
})();
function onMotion(e){ const a=e.accelerationIncludingGravity; if(!a||a.z==null||(a.x===0&&a.y===0&&a.z===0))return; lvlHad=true; const ang=Math.atan2(Math.hypot(a.x,a.y),Math.abs(a.z))*180/Math.PI; lvlAngle=lvlAngle*.82+ang*.18; updLvl(); }
function onOrient(e){ if(lvlHad||e.beta==null)return; let a=Math.abs(e.beta); if(a>90)a=180-a; lvlAngle=lvlAngle*.82+a*.18; updLvl(); }
function updLvl(){ const a=Math.round(lvlAngle); document.getElementById("lvlAngle").textContent=a; setNeedle(lvlAngle);
  const st=document.getElementById("lvlStatus"); const lbl=a<6?"Flat":a<25?"Low incline":a<50?"Incline":a<78?"Steep":"Upright";
  const hit=lvlObj?(a>=lvlObj.lo&&a<=lvlObj.hi):(Math.abs(a-lvlTarget)<=2);
  if(hit){st.textContent="✓ "+lbl+" — perfect!";st.style.color="var(--accent)"; if(!lvlHit){buzz([30,40,30]);lvlHit=true;}} else {st.textContent=lbl+" · target "+lvlTarget+"°";st.style.color="var(--muted)";lvlHit=false;} }
function openLevel(t){ lvlObj=t||null; lvlTarget=t?t.target:30; lvlHit=false; document.getElementById("lvlMsg").textContent=""; document.getElementById("lvlStatus").textContent="Reading sensor…"; buildGauge(); refreshTgt(); setNeedle(0); document.getElementById("lvlAngle").textContent="--"; lvlDlg.showModal(); startMotion(); }
function closeLevel(){ window.removeEventListener("devicemotion",onMotion); window.removeEventListener("deviceorientation",onOrient); lvlDlg.close(); }
function startMotion(){ lvlHad=false; const add=()=>{window.addEventListener("devicemotion",onMotion);window.addEventListener("deviceorientation",onOrient);};
  try{ if(typeof DeviceMotionEvent!=="undefined"&&typeof DeviceMotionEvent.requestPermission==="function"){ DeviceMotionEvent.requestPermission().then(s=>{s==="granted"?add():document.getElementById("lvlMsg").textContent="Motion permission denied.";}).catch(()=>add()); } else add(); }catch(e){add();}
  setTimeout(()=>{ if(!lvlHad)document.getElementById("lvlMsg").textContent="If the angle isn't moving, your device may not expose the motion sensor."; },1800); }

/* ---------- main render ---------- */
function renderLog(){
  stopSetWatch(); // full innerHTML rebuild below would orphan a running stopwatch's button
  const day=logDay(), m=document.getElementById("logBody"); m.innerHTML="";
  normalizeLogFocus();
  if(!m.querySelector(".logcoach"))m.insertAdjacentHTML("afterbegin",logSessionSummaryHTML());
  m.insertAdjacentHTML("beforeend",logFocusNavigatorHTML());
  const dayTot=day.ex.reduce((a,e,ei)=>a+targetSets(logOpt(ei).r),0);
  if(dayTot>24){ const w=document.createElement("div"); w.className="loadwarn"; w.innerHTML="⚠️ Long session — <b>"+dayTot+" working sets</b>. ~20–24 hard sets is plenty for one day; consider trimming or moving some to another day."; m.appendChild(w); }
  // Per-muscle session cap (Remmert meta / RP + Ethier): growth per set tapers past
  // ~11 sets for one muscle in a single session — better spent on another day.
  { const musDay={}; day.ex.forEach((e,ei)=>{ if(!skipState(ei))musDay[e.m]=(musDay[e.m]||0)+targetSets(logOpt(ei).r); });
    const over=Object.keys(musDay).filter(k=>musDay[k]>sessionSetCap(k));
    if(over.length){ const w=document.createElement("div"); w.className="loadwarn"; w.innerHTML="⚠️ <b>"+over.map(k=>k+" has "+musDay[k]+" sets").join(", ")+"</b> today — per-session gains taper past ~"+over.map(k=>sessionSetCap(k)).join("/")+" sets; moving the extras to another day grows more."; m.appendChild(w); } }
  let focusFound=false;
  day.ex.forEach((exo,ei)=>{
    const opt=logOpt(ei), sets=logGetSets(ei), reqSets=requiredSets(sets), tot=reqSets.length, done=reqSets.filter(x=>x.done).length;
    const timed=isTimedExercise(opt); // planks/holds/carries: log seconds, not reps
    const angT=angleTarget(opt.n), sug=logNext(ei), smart=capabilityRecommendation(opt,exo.m,sets), best=logBest(ei), bestReps=best?0:logBestReps(ei), rm=log1RM(ei), fat=fatigueNote(ei), rule=progRule(ei);
    const complete=done>=tot&&tot>0;
    const isCurrent=_logFocused?ei===_logFocusEi:true;
    if(!_logFocused&&done<tot&&!focusFound)focusFound=true;
    const card=document.createElement("div");
    card.dataset.ei=ei;
    card.className="ex "+(isCurrent?"current":("log-focus-hidden "+(complete?"done":"upcoming")))+(!_logFocused&&complete?" complete":"");
    card.setAttribute("aria-label",(complete?"Completed exercise: ":"Exercise: ")+opt.n);
    if(isCurrent)card.setAttribute("aria-current","step");
    let rows="<div class='sethead'><span class='a'>#</span><span class='b'>weight ("+unit+")</span><span class='c'>"+(timed?"secs":"reps")+"</span><span class='e'>"+(timed?"⏱":"RIR")+"</span><span class='d'>✓</span></div>";
    let __wn=0; // work sets number 1..N regardless of how many warm-up rows precede them
    const llGhost=slotLast(ei), ghosts=(llGhost&&Array.isArray(llGhost.s))?llGhost.s:null; // per-set "beat this" targets from last session
    sets.forEach((s,i)=>{
      const isWork=!s.drop&&s.type!=="warm";
      const no=s.drop?"💧":s.type==="warm"?"🔥":(++__wn);
      const g=(isWork&&ghosts&&ghosts[__wn-1])?ghosts[__wn-1]:null; // last session's same-numbered work set
      const rowTimed=timed||s.type==="t40"; // t40 rows log seconds via the stopwatch too
      rows+="<div class='setrow"+(s.drop?" drop":s.type==="warm"?" warmset":"")+"'><span class='no'"+(s.drop?" data-dropx='"+i+"' title='tap to remove this drop set'":s.type==="warm"?" data-warmx='"+i+"' title='tap to remove this warm-up set'":"")+">"+no+"</span>"+
      "<div class='wstep'><button class='stp dn' data-a='wstep' data-i='"+i+"' data-dir='-1' aria-label='Decrease set "+(i+1)+" weight'>−</button>"+
      "<input class='sw' data-i='"+i+"' inputmode='decimal' aria-label='"+escAttr(opt.n+" set "+(i+1)+" weight in "+unit)+"' value='"+(s.w!=null?toDisp(s.w):"")+"' placeholder='"+(g&&g[0]?toDisp(g[0]):unit)+"'"+(g&&g[0]?" title='last time'":"")+">"+
      "<button class='stp up' data-a='wstep' data-i='"+i+"' data-dir='1' aria-label='Increase set "+(i+1)+" weight'>+</button></div>"+
      "<span class='x'>"+(rowTimed?"for":"×")+"</span><input class='sr' data-i='"+i+"' inputmode='numeric' aria-label='"+escAttr(opt.n+" set "+(i+1)+" "+(rowTimed?"seconds":"repetitions"))+"' value='"+(s.r!=null?s.r:"")+"' placeholder='"+(rowTimed?"secs":(g&&g[1]?g[1]:"reps"))+"'"+(!rowTimed&&g&&g[1]?" title='last time'":"")+">"+
      (rowTimed?"<button class='rir swatch' data-sw='"+i+"' title='stopwatch: tap to start, tap to stop &amp; fill'>▶</button>"
            :"<button class='rir"+(s.rir!=null?" on":"")+"' data-i='"+i+"' aria-label='"+escAttr(opt.n+" set "+(i+1)+" reps in reserve")+"' title='reps in reserve'>"+(s.rir!=null?s.rir:"–")+"</button>")+
      "<button class='ok"+(s.done?" on":"")+"' data-i='"+i+"' aria-label='"+escAttr((s.done?"Mark incomplete: ":"Complete: ")+opt.n+" set "+(i+1))+"' aria-pressed='"+(s.done?"true":"false")+"'>✓</button></div>"; });
    const slotState=state.slots[logId(ei)]||{},swapped=slotState.swap||(slotState.todaySwap&&slotState.todaySwap.date===todayStr())||(slotState.todayOpt&&slotState.todayOpt.date===todayStr());
    const ssr=logRec(ei).ss;
    let ssHtml="";
    if(ssr){ ssHtml="<div class='ssblock'><div class='sshd'>⚡ SUPERSET · "+ssr.n+"<button data-a='ssrm'>remove</button></div>"+
      "<div class='sethead'><span class='a'>#</span><span class='b'>weight ("+unit+")</span><span class='c'>reps</span><span class='d'>✓</span></div>"+
      ssr.sets.map((s,i)=>"<div class='setrow'><span class='no'>"+(i+1)+"</span><input class='ssw' data-i='"+i+"' inputmode='decimal' value='"+(s.w!=null?toDisp(s.w):"")+"' placeholder='"+unit+"'><span class='x'>×</span><input class='ssrp' data-i='"+i+"' inputmode='numeric' value='"+(s.r!=null?s.r:"")+"' placeholder='reps'><button class='ok"+(s.done?" on":"")+"' data-ssok='"+i+"'>✓</button></div>").join("")+
      "<div class='setadj'><button data-a='ssdel'>– set</button><button data-a='ssadd'>+ set</button></div></div>"; }
    const dropAuto=dropAutoMuscle(exo.m,opt), dropCount=sets.filter(x=>x.drop).length;
    const ssPartner=(!ssr&&isIsolation(opt))?supersetPartner(exo.m):null;
    const coachHtml=coachPanelHTML(ei,exo,dropAuto,dropCount,ssPartner);
    let intsugBtns=(dropAuto?"":"<button data-a='dodrop'>💧 Add dropset</button>")+(partialsWorthIt(opt,exo.m)?"<button data-a='dopart'>⅓ Lengthened partials</button>":"");
    const intsugHtml=(isIsolation(opt)&&intsugBtns)?("<div class='intsug'>💪 Intensifier — "+intsugBtns+"</div>"):"";
    const undoReady=logRec(ei).smartUndo&&logRec(ei).smartUndo.date===todayStr();
    const smartDiff=smart.changed?"<p class='smartBeforeAfter'>"+esc(smartTargetDiffText(smart))+"</p>":"<p class='smartBeforeAfter'>No numerical change from base target</p>";
    const smartEvidence="<small class='smartEvidence'>Evidence: "+esc(smartTargetEvidenceText(smart))+"</small>";
    const smartAnchor=smart.anchor&&smart.anchor.eligible?"<small class='smartAnchor'>"+esc(smart.anchor.message)+"</small>":"";
    const smartAction=smart.safetyHold?"<button data-a='safeswap'>Choose pain-free swap</button>":
      (smart.loadKg!=null?"<button data-a='usesmart'>Apply target</button>":"<button data-a='calib'>Calibrate</button>")+
      (undoReady?"<button class='ghost' data-a='undotarget'>Undo</button>":"");
    card.innerHTML="<div class='extop'><img src='"+opt.img+"' alt='' data-a='img' onerror=\"this.style.visibility='hidden'\"><div class='meta'><div class='nm' data-a='img'>"+opt.n+"</div><div class='rp' style='color:var(--accent2);font-weight:600'>"+exFor(opt,exo.m)+"</div><div class='rp'>Target: "+opt.r+(swapped?" · swapped":"")+(exo.__user?" · added":"")+" · tap photo for how-to</div></div>"+(exo.__user?"<button class='swap' data-a='rmx' aria-label='Remove "+escAttr(opt.n)+"' style='border-color:#6b3030;color:#e08080'>🗑</button>":"")+"<button class='swap' data-a='ss' title='add superset' aria-label='Add a superset to "+escAttr(opt.n)+"'>⚡</button><button class='swap' data-a='swap' aria-label='Swap "+escAttr(opt.n)+"'>⇄</button></div>"+
      "<div class='smartLiveTarget"+(smart.live?" live":"")+(smart.safetyHold?" safetyHold":"")+"'><div class='smartLiveHead'><span><i></i>"+(smart.safetyHold?"SAFETY PAUSE":"SMART TARGET")+"</span><small>"+esc(smart.confidence.label)+" "+smart.confidence.score+"/100</small></div><div class='smartLivePrescription'><strong>"+esc(smart.load)+" <em>×</em> "+esc(smart.reps)+"</strong><span>"+smart.sets+" sets · "+smart.rir+" RIR</span></div>"+smartDiff+"<p>"+esc(smart.why)+"</p>"+smartEvidence+smartAnchor+"<div class='smartLiveFoot'><span style='--rec-color:"+recoveryColorFor(exo.m)+"'>"+smart.recovery+"% "+esc(exo.m)+" recovery</span><div>"+smartAction+"</div></div></div>"+rows+coachHtml+ssHtml+
      "<div class='setadj'><button data-a='del'>– set</button><button data-a='add'>+ set</button><button data-a='addwarm' class='ghost'>+ Warm-up</button></div>"+
      "<div class='chips'><span class='chip' data-a='rule'>"+PROG_RULES[rule]+"</span><span class='chip'>1RM ~ <b>"+(rm?toDisp(rm):"–")+"</b> "+unit+"</span><span class='chip' data-a='tempo'>⏱ 3-1-1</span><span class='chip' data-a='warm'>Warm-up ▾</span><span class='chip' data-a='plate'>⚏ Plates</span><span class='chip gold' data-a='chart'>📈 Progress</span>"+(angT?"<span class='chip' data-a='angle' style='border-color:#2e6b46;color:#7fe0a8'>📐 "+angT.label+"</span>":"")+"</div>"+
      "<div class='warm' data-warm></div>"+
      intsugHtml+
      "<div class='rp' style='margin-top:9px;color:var(--muted);font-size:12px'>Best: <b style='color:var(--accent)'>"+(best?toDisp(best)+" "+unit:bestReps?bestReps+(timed?"s hold":" reps"):"—")+"</b> · "+done+"/"+tot+" sets</div>";
    // Stall-buster: a stalled exercise offers one-tap alternatives from the SAME muscle
    // region (e.g. stalled incline curls -> other long-head-stretch curls) via the swap
    // dialog pre-filtered to that region.
    const warmBox=card.querySelector("[data-warm]"); if(fat&&warmBox)warmBox.insertAdjacentHTML("beforebegin","<div class='loadwarn' style='margin-top:9px'>"+fat+(/Stalled|deload/i.test(fat)?" <button data-a='stallswap' style='margin-left:6px;background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700'>Rotate ▸</button>":"")+"</div>");
    const sswB=card.querySelector("[data-a=stallswap]"); if(sswB)sswB.onclick=()=>openSwapRegion(ei);
    // saveSoon, not save: this runs on EVERY keystroke in the weight/reps inputs, and a
    // synchronous stringify of the whole state (megabytes once photos exist) per keypress
    // visibly janks typing. State is mutated in memory immediately; the write coalesces.
    function commit(){ saveSoon(); const b=logBest(ei); card.querySelector(".rp b").textContent=b?toDisp(b)+" "+unit:(logBestReps(ei)?logBestReps(ei)+(timed?"s hold":" reps"):"—"); }
    card.querySelectorAll(".sw").forEach(inp=>inp.oninput=()=>{ sets[+inp.dataset.i].w=toKg(inp.value); commit(); });
    card.querySelectorAll("[data-a=wstep]").forEach(b=>b.onclick=()=>stepWeight(ei,+b.dataset.i,+b.dataset.dir));
    card.querySelectorAll(".sr").forEach(inp=>inp.oninput=()=>{ const v=parseInt(inp.value); sets[+inp.dataset.i].r=isNaN(v)?null:v; commit(); });
    card.querySelectorAll(".ok").forEach(b=>b.onclick=()=>{ const s=sets[+b.dataset.i]; s.done=!s.done; save(); buzz(20);
      const reqDone=isExerciseDone(sets);           // required (non-drop, non-warm) sets complete
      const dropsPending=sets.some(x=>x.drop&&!x.done); // an unfinished drop set still to do
      if(reqDone&&!s.drop&&s.done){ toast("Exercise done ✅"); buzz([20,40,20]);
        // one gentle nudge per session: RIR powers the load suggestions, and it's mostly untracked
        if(!window.__rirNudged&&!timed&&sets.every(x=>x.rir==null)){ window.__rirNudged=true; setTimeout(()=>toast("Tip: tap the – circle after a hard set to log RIR — it sharpens your weight suggestions"),1700); } }
      // Advance to the next exercise ONLY once everything — including drop sets — is done, so
      // finishing your last working set no longer skips past a pending drop set.
      if(s.done&&reqDone&&!dropsPending)advanceLogFocusAfter(ei);
      renderLog(); });
    card.querySelectorAll(".rir[data-i]").forEach(b=>b.onclick=()=>{ const s=sets[+b.dataset.i],o=[null,4,3,2,1,0]; s.rir=o[(o.indexOf(s.rir==null?null:s.rir)+1)%o.length]; save(); renderLog(); });
    // tap a drop row's 💧 (or a warm-up row's 🔥) to remove just that row — before this,
    // the only visible "remove" was the 🗑 that deletes the whole added exercise
    card.querySelectorAll("[data-dropx],[data-warmx]").forEach(el=>el.onclick=()=>{ const i=+(el.dataset.dropx!=null?el.dataset.dropx:el.dataset.warmx); sets.splice(i,1); save(); renderLog(); toast(el.dataset.dropx!=null?"Drop set removed":"Warm-up set removed"); });
    // per-set stopwatch on timed exercises: tap to start counting, tap again to stop and fill the secs field
    card.querySelectorAll(".swatch").forEach(b=>b.onclick=()=>{
      const i=+b.dataset.sw;
      if(_setWatch&&_setWatch.btn===b){ // stop: write elapsed secs into this set
        const secs=Math.max(1,Math.round((Date.now()-_setWatch.start)/1000));
        stopSetWatch(); sets[i].r=secs; save(); renderLog(); buzz(20); return;
      }
      stopSetWatch(); // stop any watch running on another row first
      _setWatch={btn:b,start:Date.now(),int:setInterval(()=>{ b.textContent=Math.round((Date.now()-_setWatch.start)/1000)+"s"; },500)};
      b.classList.add("on"); b.textContent="0s";
    });
    const tp=card.querySelector("[data-a=tempo]"); if(tp)tp.onclick=()=>toast("Tempo 3-1-1: lower 3s · 1s stretch · lift 1s");
    const ruleB=card.querySelector("[data-a=rule]"); if(ruleB)ruleB.onclick=()=>cycleProgRule(ei);
    const addB=card.querySelector("[data-a=add]"); if(addB)addB.onclick=()=>{ const l=sets[sets.length-1]||{w:null}; sets.push({w:l.w,r:null,done:false}); save(); renderLog(); };
    const delB=card.querySelector("[data-a=del]"); if(delB)delB.onclick=()=>{ if(sets.length>1){sets.pop();save();renderLog();} };
    const awB=card.querySelector("[data-a=addwarm]"); if(awB)awB.onclick=()=>addWarmup(ei);
    card.querySelectorAll("[data-a=img]").forEach(el=>el.onclick=()=>openDetail(opt));
    const sw=card.querySelector("[data-a=swap]"); if(sw)sw.onclick=()=>openSwap(ei);
    // Confirm before removing: this deletes the ADDED EXERCISE itself (permanently), and
    // the 🗑 sits next to ⚡ — users tapping it to undo a drop/superset lost the exercise.
    const rmx=card.querySelector("[data-a=rmx]"); if(rmx)rmx.onclick=()=>{ if(confirm("Remove the exercise \""+opt.n+"\" from this workout? (To remove just a drop set, tap its 💧; a superset has its own remove button.)"))removeExtra(exo); };
    const ssBtn=card.querySelector("[data-a=ss]"); if(ssBtn)ssBtn.onclick=()=>openAddEx(ei);
    const ddB=card.querySelector("[data-a=dodrop]"); if(ddB)ddB.onclick=()=>addDropset(ei);
    const dpB=card.querySelector("[data-a=dopart]"); if(dpB)dpB.onclick=()=>addPartialsToLast(ei);
    const adB=card.querySelector("[data-a=autodrop]"); if(adB)adB.onclick=()=>addDropset(ei);
    const dsB=card.querySelector("[data-a=doss]"); if(dsB)dsB.onclick=()=>addSupersetAuto(ei,exo.m);
    const asB=card.querySelector("[data-a=autoss]"); if(asB)asB.onclick=()=>addSupersetAuto(ei,exo.m);
    card.querySelectorAll("[data-a=coachtab]").forEach(b=>b.onclick=()=>{ _coachTab[ei]=b.dataset.tab; renderLog(); });
    if(ssr){
      card.querySelectorAll(".ssw").forEach(inp=>inp.oninput=()=>{ ssr.sets[+inp.dataset.i].w=toKg(inp.value); save(); });
      card.querySelectorAll(".ssrp").forEach(inp=>inp.oninput=()=>{ const v=parseInt(inp.value); ssr.sets[+inp.dataset.i].r=isNaN(v)?null:v; save(); });
      card.querySelectorAll("[data-ssok]").forEach(b=>b.onclick=()=>{ const s=ssr.sets[+b.dataset.ssok]; s.done=!s.done; save(); buzz(20); renderLog(); });
      const ssa=card.querySelector("[data-a=ssadd]"); if(ssa)ssa.onclick=()=>{ const l=ssr.sets[ssr.sets.length-1]||{w:null}; ssr.sets.push({w:l.w,r:null,done:false}); save(); renderLog(); };
      const ssd=card.querySelector("[data-a=ssdel]"); if(ssd)ssd.onclick=()=>{ if(ssr.sets.length>1){ssr.sets.pop();save();renderLog();} };
      const ssrmB=card.querySelector("[data-a=ssrm]"); if(ssrmB)ssrmB.onclick=()=>{ delete logRec(ei).ss; save(); renderLog(); toast("Superset removed"); };
    }
    const us=card.querySelector("[data-a=use]"); if(us&&sug)us.onclick=()=>{ sets.forEach(s=>{if(s.w==null)s.w=sug.kg;}); save(); renderLog(); };
    const ust=card.querySelector("[data-a=usesmart]"); if(ust)ust.onclick=()=>{applySmartPrescription(ei,smart);renderLog();toast("Target applied · aim for "+smart.rir+" RIR");};
    const unt=card.querySelector("[data-a=undotarget]");if(unt)unt.onclick=()=>undoSmartPrescription(ei);
    const safeSwap=card.querySelector("[data-a=safeswap]");if(safeSwap)safeSwap.onclick=()=>openSwap(ei,"today");
    const cb=card.querySelector("[data-a=calib]"); if(cb)cb.onclick=()=>calibrateFromSet(ei);
    card.querySelector("[data-a=warm]").onclick=()=>toggleWarm(card,opt,logBest(ei));
    card.querySelector("[data-a=plate]").onclick=()=>openPlate(logBest(ei));
    card.querySelector("[data-a=chart]").onclick=()=>openChartLog(ei);
    const ang=card.querySelector("[data-a=angle]"); if(ang&&angT)ang.onclick=()=>openLevel(angT);
    m.appendChild(card);
    enhanceLogCard(card,ei);
  });
  // "Feeling strong?" bonus entry — user-driven picker (choose muscle -> see what's
  // missing this week -> add today-only finishers). Low readiness swaps it for a
  // recover-instead note. NOT class "ex": the per-exercise binders iterate "#logBody
  // .ex" by index and a non-exercise card with that class breaks them all.
  { const rs=readinessScore();
    if(rs!=null&&rs<=2){
      const bc=document.createElement("div"); bc.className="loadwarn";
      bc.innerHTML="🔋 <b>Low readiness today</b> — extra volume won't help on a low battery. Hit the plan, then recover.";
      m.appendChild(bc);
    } else {
      const bb=document.createElement("button"); bb.className="addexbtn";
      bb.textContent="⚡ Feeling strong? Choose a muscle for bonus work";
      bb.onclick=openBonusPicker;
      m.appendChild(bb);
    }
  }
  const addExBtn=document.createElement("button"); addExBtn.className="addexbtn"; addExBtn.textContent="＋ Add exercise to this day";
  addExBtn.onclick=()=>openAddEx(); m.appendChild(addExBtn);
  bindLogFocusNavigator(m);
  installLogRestTimer(m);
  addLogQuickActions();
  installSetTags();
  installExerciseActions();
  updateSessionNotification();
  syncWatch();
}

/* Called from the live workout notification's "✓ Set done" action button (native
 * SessionActionReceiver -> evaluateJavascript): marks the next pending work set of the
 * current session done, starts the rest timer, and refreshes the notification — so a
 * set can be logged without pulling the app back to the foreground. */
function notifSetDone(){
  try{
    const day=logDay(); if(!day)return;
    for(let ei=0;ei<day.ex.length;ei++){
      if(skipState(ei))continue;
      const sets=logGetSets(ei);
      for(let i=0;i<sets.length;i++){
        const s=sets[i];
        if(!s.done&&setTypeOf(s)!=="warm"){
          s.done=true; save(); buzz(20);
          startTimer(restFor(logOpt(ei)));
          if(document.getElementById("logView").classList.contains("on"))renderLog();
          else updateSessionNotification();
          return;
        }
      }
    }
    updateSessionNotification();
  }catch(e){}
}

/* ---------- rest timer ---------- */
let restEnd=0,restInt=null,restBuzzed=false,__restAC=null;
/* Audible two-tone chime when rest ends, via WebAudio (no asset needed). The
   AudioContext is created/resumed inside startTimer — a user-gesture context (the set
   checkmark tap) — so the WebView's autoplay policy allows it to sound later. */
function restBeep(){ try{
  __restAC=__restAC||new (window.AudioContext||window.webkitAudioContext)();
  if(__restAC.state==="suspended")__restAC.resume();
  const t0=__restAC.currentTime;
  [[880,0],[880,.24],[1318,.48]].forEach(([f,dt])=>{
    const o=__restAC.createOscillator(),g=__restAC.createGain();
    o.type="sine"; o.frequency.value=f; o.connect(g); g.connect(__restAC.destination);
    g.gain.setValueAtTime(.001,t0+dt); g.gain.exponentialRampToValueAtTime(.5,t0+dt+.02); g.gain.exponentialRampToValueAtTime(.001,t0+dt+.2);
    o.start(t0+dt); o.stop(t0+dt+.22);
  });
}catch(e){} }
function startTimer(sec){ sec=sec||90; restEnd=Date.now()+sec*1000; restBuzzed=false;
  try{ __restAC=__restAC||new (window.AudioContext||window.webkitAudioContext)(); if(__restAC.state==="suspended")__restAC.resume(); }catch(e){}
  const t=document.getElementById("timer"); t.classList.add("on"); t.classList.remove("open");
  updTimer(); clearInterval(restInt);
  restInt=setInterval(updTimer,250); native("scheduleRest",sec); }
function updTimer(){ const left=Math.round((restEnd-Date.now())/1000); const el=document.getElementById("timerT"); if(el)el.textContent=fmt(Math.max(0,left));
  if(left<=0&&!restBuzzed){ restBuzzed=true; clearInterval(restInt); buzz([60,50,60]); restBeep(); toast("Rest over — go!"); native0("cancelRest"); setTimeout(hideTimer,1200); } }
function hideTimer(){ const t=document.getElementById("timer"); t.classList.remove("on"); t.classList.remove("open"); clearInterval(restInt); native0("cancelRest"); }
/* Chip interactions: tap the pill to reveal +15s / Skip (auto-collapses after 5s);
   the buttons themselves act without collapsing side effects. These buttons were
   UNWIRED dead HTML from the rewrite until now — Skip literally did nothing. */
(function(){
  const t=document.getElementById("timer"); if(!t)return;
  t.onclick=e=>{ if(e.target&&e.target.tagName==="BUTTON")return;
    const open=t.classList.toggle("open");
    clearTimeout(t._oc); if(open)t._oc=setTimeout(()=>t.classList.remove("open"),5000); };
  const reArm=()=>native("scheduleRest",Math.max(1,Math.round((restEnd-Date.now())/1000)));
  const a=document.getElementById("timerAdd"); if(a)a.onclick=()=>{ restEnd+=15000; restBuzzed=false; updTimer();
    // re-arm the native alarm too, or the system "Rest over" notification still fires at
    // the ORIGINAL time — 15s early, even while the in-app timer is still counting
    reArm(); };
  const sub=document.getElementById("timerSub"); if(sub)sub.onclick=()=>{ restEnd=Math.max(Date.now()+1000,restEnd-15000); restBuzzed=false; updTimer(); reArm(); };
  const s=document.getElementById("timerSkip"); if(s)s.onclick=()=>hideTimer();
})();

/* ---------- finishing a workout ---------- */
function tickFinish(){ let s=sess(); const b=document.getElementById("finishBtn"); if(!b)return;
  if(s&&staleSess(s)){localStorage.removeItem("gymSess");s=null;}
  const secs=s?Math.floor((Date.now()-s.start)/1000):0;
  b.textContent=s?("Finish · "+fmt(secs)):"Finish Workout ✓";
  const c=document.getElementById("sessClock"); if(c)c.textContent=s?("⏱ "+fmt(secs)):"⏱ 0:00"; }
function confetti(){
  if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const c=["#22e07c","#f0c44a","#e0573e","#3b82f6","#fff"]; for(let i=0;i<26;i++){ const d=document.createElement("div"); d.className="confetti"; d.style.left=Math.random()*100+"vw"; d.style.background=c[i%c.length]; document.body.appendChild(d); const du=900+Math.random()*900; d.animate([{top:"-12px",opacity:1},{top:"100vh",opacity:.9}],{duration:du,easing:"cubic-bezier(.3,.6,.5,1)"}); setTimeout(()=>d.remove(),du); }
}
function finishWorkout(){
  const day=logDay(), s=sess(), finishedAt=new Date().toISOString();
  const workoutId="wo_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
  let vol=0,setsDone=0,exDone=0,prs=0,plannedSets=0,plannedEx=0; const musSets={},detail=[];
  // Guard against accidental taps (the rest timer's Skip floats above this button):
  // confirm BEFORE the mutating scan below, since finishing clears every set grid.
  { let anyLogged=false,unfinished=0,activeTot=0;
    day.ex.forEach((exo,ei)=>{ if(skipState(ei))return; activeTot++; const st=logGetSets(ei); if(st.some(x=>x.done))anyLogged=true; if(!isExerciseDone(st))unfinished++; });
    if(anyLogged&&unfinished>0&&!confirm("Finish workout? "+(activeTot-unfinished)+" of "+activeTot+" exercises complete."))return; }
  hideTimer();
  day.ex.forEach((exo,ei)=>{
    if(skipState(ei))return; // skipped / removed-today exercises don't count
    const sets=logGetSets(ei), done=sets.filter(x=>x.done);
    const exercisePlannedSets=requiredSets(sets).length;
    plannedSets+=exercisePlannedSets;plannedEx++;
    const workDone=done.filter(x=>setTypeOf(x)!=="warm");
    const opt=logOpt(ei),timed=isTimedExercise(opt); // r holds SECONDS: no tonnage, no e1RM
    const r=logRec(ei),nm=opt.n,identity=exerciseIdentityFor(nm,opt.exerciseId||opt.libId,state);
    const richSets=workDone.map(x=>({w:x.w||0,r:x.r||0,rir:x.rir!=null?x.rir:null,type:setTypeOf(x)}));
    // Preserve the whole plan, including unfinished exercises, for adherence and edits.
    detail.push({exerciseId:identity.exerciseId,libId:identity.libId,exerciseName:identity.name,
      n:nm,m:exo.m,target:opt.r,plannedSets:exercisePlannedSets,sets:richSets});
    if(done.length){ let top=0,topR=null,topRir=null,topReps=0; workDone.forEach(x=>{ const t40=x.type==="t40";
        // t40 rows hold SECONDS, not reps: they count as done sets but are excluded from
        // tonnage and top-set/e1RM selection (weight × seconds isn't volume).
        if(!timed&&!t40&&x.w&&x.r)vol+=x.w*x.r;
        if(!t40&&x.w&&(x.w>top||(x.w===top&&(x.r||0)>(topR||0)))){top=x.w;topR=x.r;topRir=(x.rir!=null?x.rir:null);}
        if(!t40&&x.r&&x.r>topReps)topReps=x.r; });
      setsDone+=workDone.length; if(isExerciseDone(sets))exDone++;
      if(exo.m&&workDone.length)musSets[exo.m]=(musSets[exo.m]||0)+workDone.length;
      const prevBest=exLog(nm).reduce((a,l)=>Math.max(a,l.w||0),0);
      // per-set list (weight, reps) powers next session's "beat this" ghost placeholders
      const setList=workDone.filter(x=>x.type!=="t40").map(x=>[x.w||0,x.r||0]);
      // Timed exercise (plank/hold/carry): PR = longest hold, weight is a tie-breaker.
      if(timed){ let tTop=0,tW=0; workDone.forEach(x=>{ if(x.r&&x.r>tTop){tTop=x.r;tW=x.w||0;} });
        if(tTop>0){ pushExLog(nm,{exerciseId:identity.exerciseId,libId:identity.libId,d:todayStr(),w:tW,r:tTop,rir:null,e:0,n:nm,m:exo.m,t:1,sessionId:workoutId,sx:richSets},identity.exerciseId); if(maybeSetPR(nm,tW,tTop,0,todayStr(),true))prs++; } }
      else if(top>0){ const e1=Math.round(top*(1+(topR||midReps(logOpt(ei).r))/30)); pushExLog(nm,{exerciseId:identity.exerciseId,libId:identity.libId,d:todayStr(),w:top,r:topR,rir:topRir,e:e1,n:nm,m:exo.m,s:setList,sx:richSets,sessionId:workoutId},identity.exerciseId); if(top>prevBest&&prevBest>0)prs++;
        maybeSetPR(nm,top,topR,e1,todayStr()); }
      // No weight was ever entered (bodyweight core work etc.) — track progress by reps
      // instead, so exercises like Hanging Leg Raise still build history/PRs.
      else if(topReps>0){ pushExLog(nm,{exerciseId:identity.exerciseId,libId:identity.libId,d:todayStr(),w:0,r:topReps,rir:null,e:0,n:nm,m:exo.m,s:setList,sx:richSets,sessionId:workoutId},identity.exerciseId); if(maybeSetPR(nm,0,topReps,0,todayStr()))prs++; }
    }
    const ssr=logRec(ei).ss; // superset finisher sets
    if(ssr&&ssr.sets){ const sd=ssr.sets.filter(x=>x.done); if(sd.length){ let st=0,sr=null,srir=null; sd.forEach(x=>{ if(x.w&&x.r)vol+=x.w*x.r; if(x.w&&(x.w>st||(x.w===st&&(x.r||0)>(sr||0)))){st=x.w;sr=x.r;srir=x.rir!=null?x.rir:null;} }); setsDone+=sd.length; if(ssr.m)musSets[ssr.m]=(musSets[ssr.m]||0)+sd.length;
      const ssRich=sd.map(x=>({w:x.w||0,r:x.r||0,rir:x.rir!=null?x.rir:null,type:"work"})),ssPlanned=ssr.sets.length;
      const ssIdentity=exerciseIdentityFor(ssr.n,ssr.exerciseId||ssr.libId,state);
      detail.push({exerciseId:ssIdentity.exerciseId,libId:ssIdentity.libId,exerciseName:ssIdentity.name,n:ssr.n,m:ssr.m,target:ssPlanned+" x 8-15",plannedSets:ssPlanned,sets:ssRich,kind:"superset"});plannedSets+=ssPlanned;plannedEx++;
      if(st>0&&ssr.n){ const e1=Math.round(st*(1+(sr||10)/30)); pushExLog(ssr.n,{exerciseId:ssIdentity.exerciseId,libId:ssIdentity.libId,d:todayStr(),w:st,r:sr,rir:srir,e:e1,n:ssr.n,m:ssr.m,s:ssRich.map(x=>[x.w,x.r]),sx:ssRich,sessionId:workoutId},ssIdentity.exerciseId); if(maybeSetPR(ssr.n,st,sr,e1,todayStr()))prs++; }
      ssr.sets.forEach(x=>{x.done=false;x.w=null;x.r=null;}); } }
  });
  if(setsDone===0){ if(s&&confirm("No sets logged. Discard timer?"))localStorage.removeItem("gymSess"); else toast("Log a set first"); tickFinish(); return; }
  // The finish is now committed: clear every active grid, including unfinished exercises,
  // so starting another workout on the same date cannot inherit this session's draft.
  day.ex.forEach((_,ei)=>{if(!skipState(ei)){const r=logRec(ei);delete r.sets;delete r.todaySwap;delete r.todayOpt;delete r.smartUndo;}});
  vol=Math.round(vol); const dur=s?Math.floor((Date.now()-s.start)/1000):0;
  state.workoutHistory=state.workoutHistory||[];
  state.workoutHistory.unshift({id:workoutId,finishedAt:finishedAt,date:todayStr(),title:(logCustom?day.name:(day.day+" · "+day.title)),programId:logCustom?null:activeProg,dayKey:logCustom?null:day.key,vol:vol,sets:setsDone,plannedSets:plannedSets,ex:exDone,plannedEx:plannedEx,dur:dur,prs:prs,m:musSets,detail:detail});
  if(typeof recordRecommendationOutcome==="function")recordRecommendationOutcome(detail);
  // Keep years of sessions for long-term volume/recovery analysis. The generous cap is
  // only a corruption/storage guard, not a rolling "recent history" window.
  state.workoutHistory=state.workoutHistory.slice(0,2000); save(); autoBackup(); native("keepAwake",false); native0("sessionNotifyCancel"); native0("markWorkoutDoneToday"); localStorage.removeItem("gymSess"); syncWidgetInfo(); syncWatchClosed();
  native("logHealthWorkout",(logCustom?day.name:(day.day+" · "+day.title)),(s?s.start:Date.now()-dur*1000),Date.now());
  const activeCount=day.ex.filter((_,ei)=>!skipState(ei)).length;
  const postScale=(key,left,right)=>"<div class='fld postCheck'><label>"+left+" <small>"+right+"</small></label><div class='segm' data-post='"+key+"'>"+[1,2,3,4,5].map(n=>"<button data-v='"+n+"'>"+n+"</button>").join("")+"</div></div>";
  document.getElementById("sumBody").innerHTML="<div class='stat3'><div class='s'><b>"+fmt(dur)+"</b><span>duration</span></div><div class='s'><b>"+setsDone+"</b><span>sets</span></div><div class='s'><b>"+volDisp(vol).toLocaleString()+"</b><span>"+unit+" vol</span></div></div>"+
    "<p>You finished <b>"+exDone+"/"+activeCount+"</b> exercises.</p>"+(prs?"<p style='color:var(--gold)'>🏆 "+prs+" personal record"+(prs>1?"s":"")+"!</p>":"")+
    "<h3 style='margin:14px 0 4px'>5-second trainer check</h3><p class='smartFinePrint' style='margin-top:0'>Three taps teach the next workout.</p>"+
    postScale("stimulus","Target-muscle stimulus","weak → excellent")+postScale("fatigue","Whole-session fatigue","fresh → drained")+postScale("jointPain","Joint pain","none → severe")+
    "<div id='postSafety' class='safetyStop' style='display:none'><b>Do not train through joint pain</b><p>If it is severe, worsening or persistent, seek a qualified clinician. This app cannot diagnose it.</p></div>"+
    "<div class='fld'><label>Session note (optional)</label><input id='finNote' maxlength='140' placeholder='e.g. elbow niggle on skullcrushers' style='text-align:left;font-weight:500;padding:0 12px'></div>"+
    "<div class='btnrow'><button id='rateWorkoutExercises'>Rate exercises</button></div><p style='color:var(--muted)'>Saved to history. Recover well!</p>";
  const postDraft={};
  document.querySelectorAll("#sumBody [data-post] button").forEach(b=>b.onclick=()=>{
    const group=b.parentElement;group.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");
    postDraft[group.dataset.post]=+b.dataset.v;
    const warn=document.getElementById("postSafety");if(warn)warn.style.display=postDraft.jointPain>=3?"block":"none";
    if(postDraft.stimulus&&postDraft.fatigue&&postDraft.jointPain){
      if(typeof smartPostWorkoutFeedback==="function")smartPostWorkoutFeedback(state.workoutHistory[0],postDraft);
      state.workoutHistory[0].feel=smartClamp(Math.round((postDraft.stimulus+(6-postDraft.fatigue))/2),1,5);
      save();toast("Trainer learned from this session");
    }
  });
  const fn=document.getElementById("finNote"); if(fn)fn.onchange=()=>{ state.workoutHistory[0].note=safeText(fn.value,140); save(); };
  const re=document.getElementById("rateWorkoutExercises"); if(re)re.onclick=()=>{ const names=day.ex.filter((_,ei)=>!skipState(ei)).map((_,ei)=>logOpt(ei).n); sumDlg.close(); openWorkoutExerciseRatings(names); };
  buzz([30,40,30,40,80]); confetti(); sumDlg.showModal(); document.getElementById("logView").classList.remove("on"); nav("stats");
}
