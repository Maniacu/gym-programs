/* Smart Trainer: deterministic recommendations, program provenance/diffs and personal
 * exercise response tracking. AI explains or proposes changes; this layer owns the
 * numbers so the same workout data always produces the same recommendation. */

function activeProgramInfo(){
  const custom=state.customPrograms&&state.customPrograms[activeProg], remote=state.remoteProgramMeta&&state.remoteProgramMeta[activeProg];
  if(custom)return {source:custom.source==="coach"?"AI custom":"Custom",revision:custom.revision||1,basedOn:custom.basedOn||null,changedAt:custom.updatedAt||custom.createdAt||null};
  if(remote)return {source:"Online",revision:remote.revision||remote.version||"online",basedOn:remote.basedOn||null,changedAt:remote.published||remote.appliedAt||null};
  return {source:"Built in",revision:(window.APP_VERSION||(typeof appVer==="function"?appVer():"3.31")),basedOn:null,changedAt:null};
}
function programExerciseRows(prog){ const out=[]; (prog&&prog.days||[]).forEach(d=>(d.ex||[]).forEach(e=>{const o=e.opts&&e.opts[0];if(o)out.push({day:d.day,name:o.n,reps:o.r});})); return out; }
function programDiffSummary(a,b){
  const aa=programExerciseRows(a),bb=programExerciseRows(b), key=x=>x.day+"|"+x.name.toLowerCase();
  const am={};aa.forEach(x=>am[key(x)]=x); const bm={};bb.forEach(x=>bm[key(x)]=x);
  const added=bb.filter(x=>!am[key(x)]),removed=aa.filter(x=>!bm[key(x)]),changed=bb.filter(x=>am[key(x)]&&am[key(x)].reps!==x.reps);
  return {added:added,removed:removed,changed:changed,total:added.length+removed.length+changed.length};
}
function activeProgramBadgeHTML(){ const p=PROGRAMS[activeProg],i=activeProgramInfo(),base=i.basedOn&&PROGRAMS[i.basedOn],d=base?programDiffSummary(base,p):null;
  return "<button class='programIdentity' data-home='programinfo' style='width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px 13px;color:var(--txt)'><b>"+esc((p&&p.name)||"Program")+"</b><br><small style='color:var(--muted)'>"+esc(i.source)+" · revision "+esc(String(i.revision))+(d?" · "+d.total+" difference"+(d.total===1?"":"s")+" from default":"")+"</small></button>";
}
function openProgramIdentity(){ const p=PROGRAMS[activeProg],i=activeProgramInfo(),base=i.basedOn&&PROGRAMS[i.basedOn],d=base?programDiffSummary(base,p):null;
  document.getElementById("detTitle").textContent="Active program";
  let h="<div class='insight'><b>"+esc(p.name)+"</b><br>Source: "+esc(i.source)+" · Revision "+esc(String(i.revision))+(i.changedAt?"<br>Changed: "+esc(new Date(i.changedAt).toLocaleString()):"")+"</div>";
  if(d)h+="<p><b>Compared with "+esc(base.name)+":</b> "+d.added.length+" added, "+d.removed.length+" removed, "+d.changed.length+" rep-range change"+(d.changed.length===1?"":"s")+".</p>"+
    "<div style='font-size:13px;color:var(--muted)'>"+d.added.slice(0,6).map(x=>"+ "+esc(x.day+" "+x.name)).join("<br>")+((d.added.length&&d.removed.length)?"<br>":"")+d.removed.slice(0,6).map(x=>"− "+esc(x.day+" "+x.name)).join("<br>")+"</div>";
  h+="<div class='btnrow'>"+(base?"<button id='piDefault'>Use default</button>":"")+"<button class='ghost' id='piSnap'>Save snapshot</button></div>"+(state.lastProgramUndo?"<div class='btnrow'><button class='ghost' id='piUndo'>Undo last program change</button></div>":"");
  document.getElementById("detBody").innerHTML=h; document.getElementById("piSnap").onclick=()=>{snapshotProgram("Manual snapshot");toast("Snapshot saved");};
  const def=document.getElementById("piDefault");if(def)def.onclick=()=>{detDlg.close();setProgram(i.basedOn);};
  const undo=document.getElementById("piUndo");if(undo)undo.onclick=()=>undoProgramChange(); detDlg.showModal();
}
function rememberProgramUndo(reason){ if(!activeProg||!PROGRAMS[activeProg])return; state.lastProgramUndo={id:activeProg,reason:reason||"change",at:new Date().toISOString(),prog:JSON.parse(JSON.stringify(PROGRAMS[activeProg])),meta:activeProgramInfo()}; }
function undoProgramChange(){ const u=state.lastProgramUndo;if(!u){toast("Nothing to undo");return;} const wasCustom=BUILTIN_PROGRAM_IDS.indexOf(u.id)===-1;const id=saveCustomProgram(u.prog,{source:"undo",basedOn:(u.meta&&u.meta.basedOn)||(!wasCustom?u.id:null),overwriteCustomId:wasCustom?u.id:null}); delete state.lastProgramUndo;activeProg=id;state.programId=id;save();buildActive();detDlg.close();nav("plan");toast("Program restored"); }

function exerciseFeedbackRows(name){
  let row=null;try{if(typeof exerciseDataFor==="function")row=exerciseDataFor(name,null,false);}catch(e){}
  if(row&&Array.isArray(row.feedback))return row.feedback;
  return (state.exerciseFeedback&&state.exerciseFeedback[name])||[];
}
function exerciseResponse(name){ const a=exerciseFeedbackRows(name); if(!a.length)return null; const keys=["feel","comfort","stability","enjoyment"],out={count:a.length};keys.forEach(k=>out[k]=Math.round(a.reduce((s,x)=>s+(+x[k]||3),0)/a.length*10)/10);return out; }
function exerciseRatingHTML(name){ const r=exerciseResponse(name);return "<div class='insight' style='margin-top:12px'><b>Your exercise fit</b><br>"+(r?("Muscle feel "+r.feel+"/5 · Comfort "+r.comfort+"/5 · Stability "+r.stability+"/5<br><small>Based on "+r.count+" rating"+(r.count===1?"":"s")+"</small>"):"Not rated yet")+"</div><div class='btnrow'><button id='rateExercise'>Rate this exercise</button></div>"; }
function openExerciseRating(name){ document.getElementById("detTitle").textContent="Rate "+name; const labels={feel:"Target muscle",comfort:"Joint comfort",stability:"Stability",enjoyment:"Enjoyment"}; document.getElementById("detBody").innerHTML=Object.keys(labels).map(k=>"<div class='fld'><label>"+labels[k]+"</label><div class='segm smartRate' data-k='"+k+"'>"+[1,2,3,4,5].map(v=>"<button data-v='"+v+"'"+(v===3?" class='on'":"")+">"+v+"</button>").join("")+"</div></div>").join("")+"<div class='btnrow'><button id='saveExerciseRating'>Save rating</button></div>"; document.querySelectorAll(".smartRate button").forEach(b=>b.onclick=()=>{b.parentNode.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");}); document.getElementById("saveExerciseRating").onclick=()=>{const identity=smartExerciseIdentity(name),x={date:todayStr(),name:name,exerciseId:identity.exerciseId,libId:identity.libId};document.querySelectorAll(".smartRate").forEach(g=>x[g.dataset.k]=+(g.querySelector(".on")||{}).dataset.v||3);const next=exerciseFeedbackRows(name).concat([x]).slice(-24);let row=null;try{if(typeof exerciseDataFor==="function")row=exerciseDataFor(name,identity.exerciseId,true);}catch(e){}if(row)row.feedback=next;state.exerciseFeedback=state.exerciseFeedback||{};state.exerciseFeedback[name]=next;save();detDlg.close();toast("Exercise rating saved");};detDlg.showModal(); }
function openWorkoutExerciseRatings(names){document.getElementById("detTitle").textContent="Exercise feedback";document.getElementById("detBody").innerHTML="<p style='color:var(--muted)'>Rate only exercises you want the trainer to learn from.</p>"+(names||[]).map(n=>{const r=exerciseResponse(n);return "<div class='hitem'><div><div class='d'>"+esc(n)+"</div><div class='m'>"+(r?("Comfort "+r.comfort+"/5 · "+r.count+" ratings"):"Not rated")+"</div></div><div class='v'><button data-rate-name='"+escAttr(n)+"'>Rate</button></div></div>";}).join("");document.querySelectorAll("[data-rate-name]").forEach(b=>b.onclick=()=>openExerciseRating(b.dataset.rateName));detDlg.showModal();}


/* Weekly stimulus per muscle, with partial credit for assisting muscles.
   Delegates to the shared contribution model rather than repeating a cruder set of name
   regexes. The old local rules matched /press|dip/ against the bare name with no muscle
   check, so "Leg Press" added phantom triceps and shoulder volume, and a shoulder press
   counted itself as its own assistant (1.35x). It also read opts[0] — the raw program
   entry — so every active swap was ignored; curOpt reflects what is actually trained. */
function fractionalVolumeAudit(){
  const out={};
  PROGRAM.forEach((d,di)=>d.ex.forEach((e,ei)=>{
    const o=curOpt(di,ei),sets=targetSets(o.r),contrib=smartMuscleContributions(o.n,e.m);
    Object.keys(contrib).forEach(m=>{ out[m]=(out[m]||0)+sets*(+contrib[m]||0); });
  }));
  Object.keys(out).forEach(m=>{ out[m]=Math.round(out[m]*10)/10; });
  return out;
}

/* ===== Adaptive Trainer v2 =====
 * One deterministic engine now owns recovery, exercise fit, prescriptions and
 * schedule repair. The online coach receives these facts and explains them; it does
 * not invent a second, conflicting set of numbers. */
/* Same list the rest of the app uses (MUSCLES, 00-util.js) — aliased rather than copied so
   the engine and the UI can never disagree about which muscles exist again. */
const SMART_MUSCLES=MUSCLES;

function smartClamp(n,lo,hi){ return Math.max(lo,Math.min(hi,n)); }
function smartDateAge(date){
  if(!date)return 999;
  const a=new Date(date+"T12:00:00"),b=new Date(todayStr()+"T12:00:00");
  return Math.max(0,Math.round((b-a)/864e5));
}
function recentExerciseTrend(name){
  /* Exercise history is stored oldest -> newest. */
  const h=exLog(name).slice(-4);
  if(!h.length)return null;
  const last=h[h.length-1],prev=h.length>1?h[h.length-2]:null;
  const target=last.e||0,old=prev&&(prev.e||0);
  return {last:last,previous:prev,e1Change:old?Math.round((target-old)/old*100):0,count:h.length};
}

/* Rich set history is preferred over a single "top set". Older backups only contain
   `s:[[weight,reps]]`; those still work, but carry less confidence because their RIR and
   set type are unknown. */
function smartHistorySets(entry){
  if(!entry)return [];
  if(Array.isArray(entry.sx)&&entry.sx.length){
    return entry.sx.filter(s=>s&&s.type!=="warm"&&s.type!=="drop"&&s.type!=="t40")
      .map(s=>({w:+s.w||0,r:+s.r||0,rir:s.rir==null?null:+s.rir,type:s.type||"work",rich:true}));
  }
  if(Array.isArray(entry.s)&&entry.s.length){
    return entry.s.map((s,i)=>({w:+s[0]||0,r:+s[1]||0,rir:i===0&&entry.rir!=null?+entry.rir:null,type:"work",rich:false}));
  }
  if(entry.r||entry.w)return [{w:+entry.w||0,r:+entry.r||0,rir:entry.rir==null?null:+entry.rir,type:"work",rich:false}];
  return [];
}
function smartSetAssessment(opt,entry){
  const sets=smartHistorySets(entry),lo=repLo(opt.r)||8,hi=repHi(opt.r)||Math.max(lo,12),planned=targetSets(opt.r)||3;
  const valid=sets.filter(s=>s.r>0),rirs=valid.map(s=>s.rir).filter(x=>x!=null&&isFinite(x));
  const weights=valid.map(s=>s.w).filter(x=>x>0),full=valid.length>=planned;
  const minReps=valid.length?Math.min.apply(null,valid.map(s=>s.r)):0;
  const maxReps=valid.length?Math.max.apply(null,valid.map(s=>s.r)):0;
  const avgRir=rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:null;
  return {
    sets:valid,planned:planned,full:full,lo:lo,hi:hi,minReps:minReps,maxReps:maxReps,
    allInRange:full&&valid.slice(0,planned).every(s=>s.r>=lo&&s.r<=hi),
    allAtTop:full&&valid.slice(0,planned).every(s=>s.r>=hi),
    anyBelow:valid.some(s=>s.r<lo),hardMiss:valid.some(s=>s.r<lo&&s.rir!=null&&s.rir<=1),
    failure:valid.some(s=>s.rir===0),avgRir:avgRir,rirCount:rirs.length,
    allRirKnown:full&&valid.slice(0,planned).every(s=>s.rir!=null&&isFinite(s.rir)),
    minRir:rirs.length?Math.min.apply(null,rirs):null,maxRir:rirs.length?Math.max.apply(null,rirs):null,
    sameLoad:weights.length<2||Math.max.apply(null,weights)-Math.min.apply(null,weights)<=.01,
    mainLoad:weights.length?Math.max.apply(null,weights):(entry&&+entry.w||0),
    rich:sets.some(s=>s.rich)
  };
}
function smartConfiguredRule(opt,slotHint){
  const body=/body only|none/i.test((opt&&opt.eq)||"")||/amrap|sec|\d+s|max/i.test((opt&&opt.r)||"");
  if(body)return "body";
  try{
    if(slotHint&&slotHint.di>=0&&slotHint.ei>=0){
      const hinted=state.slots&&state.slots[id(slotHint.di,slotHint.ei)],hintRule=hinted&&hinted.rule;
      if(["double","topback","fixed","body"].indexOf(hintRule)>=0)return hintRule;
    }
    for(let di=0;di<PROGRAM.length;di++)for(let ei=0;ei<PROGRAM[di].ex.length;ei++){
      const o=curOpt(di,ei),same=typeof sameEx==="function"?sameEx(o.n,opt.n):String(o.n).toLowerCase()===String(opt.n).toLowerCase();
      if(!same)continue;
      const slot=state.slots&&state.slots[id(di,ei)],rule=slot&&slot.rule;
      if(["double","topback","fixed","body"].indexOf(rule)>=0)return rule;
    }
  }catch(e){}
  return "double";
}
/* Outcome and substitution events are scanned once per state revision and indexed by
   exercise, instead of re-walking the whole event log for every candidate. Ranking
   scores 100+ candidates per render and the event log now grows with every workout, so
   the naive scan was O(candidates x events) on each keystroke of the swap search box. */
/* Validity token for anything derived from the event log. Combines the array IDENTITY
   (so replacing the list invalidates), its length (so appends invalidate) and the
   persistence revision (so any saved change invalidates). Length plus revision alone is
   not sufficient: clearing the log and refilling it to the same size would silently
   reuse a stale cache, which is exactly the kind of bug that makes a learning system
   quietly report yesterday's answer forever. */
let _eventEpoch={arr:null,len:-1,rev:-1,tick:0};
function smartEventEpoch(){
  const arr=state.recommendationEvents||null,len=arr?arr.length:0,rev=state.persistenceRevision||0;
  if(_eventEpoch.arr!==arr||_eventEpoch.len!==len||_eventEpoch.rev!==rev)
    _eventEpoch={arr:arr,len:len,rev:rev,tick:_eventEpoch.tick+1};
  return _eventEpoch.tick;
}
let _eventIndex={key:-1,outcomes:null,subs:null};
function smartEventIndex(){
  const key=smartEventEpoch();
  if(_eventIndex.key===key&&_eventIndex.outcomes)return _eventIndex;
  const outcomes={byName:{},byId:{}},subs={away:{},to:{}};
  (state.recommendationEvents||[]).forEach(ev=>{
    if(!ev||!ev.data)return;
    if(ev.type==="exercise_substitution"){
      const b=String(ev.data.before||"").toLowerCase(),a=String(ev.data.after||"").toLowerCase();
      if(b)subs.away[b]=(subs.away[b]||0)+1;
      if(a)subs.to[a]=(subs.to[a]||0)+1;
      return;
    }
    if(ev.type!=="workout_outcome"||!Array.isArray(ev.data.exercises))return;
    /* Shadow rows (the plan was never accepted) still calibrate, but at half weight —
       the user was not aiming at those targets, so a miss is weaker evidence. */
    const weight=ev.data.accepted===false?.5:1;
    ev.data.exercises.forEach(x=>{
      if(!x||!x.actual)return;
      const row=Object.assign({__w:weight},x),n=String(x.name||"").toLowerCase();
      if(n)(outcomes.byName[n]=outcomes.byName[n]||[]).push(row);
      if(x.exerciseId)(outcomes.byId[x.exerciseId]=outcomes.byId[x.exerciseId]||[]).push(row);
    });
  });
  _eventIndex={key:key,outcomes:outcomes,subs:subs};
  return _eventIndex;
}
function smartOutcomeRows(name){
  const idx=smartEventIndex().outcomes,identity=smartExerciseIdentity(name);
  const byId=(identity.exerciseId&&idx.byId[identity.exerciseId])||[];
  const byName=idx.byName[String(name||"").toLowerCase()]||[];
  if(!byId.length)return byName.slice(0,12);
  if(!byName.length)return byId.slice(0,12);
  const seen=new Set(byId),merged=byId.concat(byName.filter(r=>!seen.has(r)));
  return merged.slice(0,12);
}
let _learnMemo={key:-1,map:{}};
function smartExerciseLearning(name){
  const memoKey=smartEventEpoch();
  if(_learnMemo.key!==memoKey)_learnMemo={key:memoKey,map:{}};
  if(_learnMemo.map[name])return _learnMemo.map[name];
  const rows=smartOutcomeRows(name),out={count:rows.length,met:0,exceeded:0,under:0,incomplete:0,rirError:0,loadErrorPct:0,
    calibrationErrorPct:null,calibrationScore:null,biasPct:0,confidence:0};
  _learnMemo.map[name]=out;
  if(!rows.length)return out;
  let rirN=0,loadN=0,calibrationTotal=0,calibrationN=0;
  rows.forEach(x=>{
    if(x.result==="exceeded")out.exceeded++;else if(x.result==="met")out.met++;else if(x.actual&&x.actual.complete)out.under++;else out.incomplete++;
    if(x.error&&isFinite(+x.error.rir)){out.rirError+=+x.error.rir;rirN++;}
    if(x.error&&isFinite(+x.error.loadPct)){out.loadErrorPct+=+x.error.loadPct;loadN++;}
    if(x.actual&&x.actual.complete&&x.error){
      let parts=0,error=0;
      if(isFinite(+x.error.e1Pct)){error+=Math.min(50,Math.abs(+x.error.e1Pct));parts++;}
      if(isFinite(+x.error.rir)){error+=Math.min(40,Math.abs(+x.error.rir)*10);parts++;}
      if(parts){calibrationTotal+=error/parts;calibrationN++;}
    }
  });
  if(rirN)out.rirError=Math.round(out.rirError/rirN*10)/10;
  if(loadN)out.loadErrorPct=Math.round(out.loadErrorPct/loadN*10)/10;
  const completed=Math.max(1,out.met+out.exceeded+out.under),success=(out.met+out.exceeded)/completed;
  if(rows.length>=2&&out.exceeded>=2&&out.rirError>=.5)out.biasPct=2.5;
  if(rows.length>=2&&out.under>=Math.ceil(rows.length*.6)&&out.rirError<=0)out.biasPct=-2.5;
  out.successRate=Math.round(success*100);
  if(calibrationN){
    out.calibrationErrorPct=Math.round(calibrationTotal/calibrationN*10)/10;
    out.calibrationScore=smartClamp(Math.round(100-out.calibrationErrorPct*1.5),0,100);
  }
  /* Effective sample size counts shadow rows as half, so confidence reflects how much
     the user actually followed the plan, not just how many workouts they logged. */
  out.effectiveN=Math.round(rows.reduce((a,x)=>a+(x.__w==null?1:x.__w),0)*10)/10;
  out.confidence=smartClamp(22+out.effectiveN*9+(out.calibrationScore==null?0:(out.calibrationScore-50)*.18),0,92);
  return out;
}
/* ===== Tier 2: passive behavioural fit =====
 * The star ratings (comfort / muscle feel / stability) are the intended personalisation
 * input and carry the largest weight in exerciseSelectionScore — but they need the user
 * to open a dialog and score four sliders after training, so in practice they stay empty
 * and the strongest term in the ranking sits at zero forever.
 * These functions reconstruct the same information from what the user already does:
 * what they swap away from, whether the load actually goes up, and how repeatable the
 * movement is for them. Zero extra taps. */
function smartSubstitutionCounts(name){
  const subs=smartEventIndex().subs,nl=String(name||"").toLowerCase();
  return {away:subs.away[nl]||0,to:subs.to[nl]||0};
}
/* Least-squares slope of e1RM across sessions, expressed as percent of the mean per
   session so a 60kg row and an 8kg lateral raise are directly comparable. */
function smartProgressSlope(name){
  const h=exLog(name).filter(x=>x&&+x.e>0);
  if(h.length<3)return {slopePct:null,n:h.length};
  const ys=h.map(x=>+x.e),n=ys.length,mean=ys.reduce((a,b)=>a+b,0)/n,xm=(n-1)/2;
  let num=0,den=0;
  ys.forEach((y,i)=>{ num+=(i-xm)*(y-mean); den+=(i-xm)*(i-xm); });
  if(!den||!mean)return {slopePct:null,n:n};
  return {slopePct:Math.round(num/den/mean*1000)/10,n:n};
}
/* Mean within-session coefficient of variation of working reps. A movement the user
   cannot stabilise produces scattered reps at the same load — the passive equivalent of
   a low "stability" rating. */
function smartRepConsistency(name){
  const cvs=[];
  exLog(name).slice(-6).forEach(e=>{
    const sets=smartHistorySets(e).filter(s=>s.r>0);
    if(sets.length<2)return;
    const r=sets.map(s=>s.r),m=r.reduce((a,b)=>a+b,0)/r.length;
    if(!m)return;
    cvs.push(Math.sqrt(r.reduce((a,b)=>a+(b-m)*(b-m),0)/r.length)/m);
  });
  if(!cvs.length)return null;
  return Math.round(cvs.reduce((a,b)=>a+b,0)/cvs.length*1000)/10;
}
/* Ranking scores every candidate in the swap list, and that list re-renders on each
   keystroke of the search box, so this has to be cheap. Results are cached per exercise
   and dropped whenever state changes (persistenceRevision bumps on every save), which
   keeps a full 100+ candidate re-score in the low milliseconds. */
let _behaveMemo={key:-1,map:{}};
function smartBehavioralFit(name){
  const memoKey=smartEventEpoch();
  if(_behaveMemo.key!==memoKey)_behaveMemo={key:memoKey,map:{}};
  const hit=_behaveMemo.map[name];
  if(hit)return hit;
  const sub=smartSubstitutionCounts(name),slope=smartProgressSlope(name),cv=smartRepConsistency(name);
  const sessions=exLog(name).length,reasons=[];
  let adjust=0,evidence=0;
  if(sub.away){ adjust-=Math.min(12,sub.away*6); evidence+=sub.away; reasons.push("you keep swapping this out"); }
  if(sub.to){ adjust+=Math.min(8,sub.to*4); evidence+=sub.to; reasons.push("you picked this yourself"); }
  if(slope.slopePct!=null){
    evidence+=slope.n;
    if(slope.slopePct>=1.5){ adjust+=7; reasons.push("load is climbing on this one"); }
    else if(slope.slopePct<=-1.5){ adjust-=7; reasons.push("output is sliding here"); }
    else if(slope.n>=4&&Math.abs(slope.slopePct)<.4){ adjust-=4; reasons.push("stalled for several sessions"); }
  }
  if(cv!=null){
    evidence+=1;
    if(cv>=25){ adjust-=5; reasons.push("reps are inconsistent for you"); }
    else if(cv<=8&&sessions>=3){ adjust+=3; reasons.push("very repeatable for you"); }
  }
  const out={adjust:smartClamp(Math.round(adjust),-18,14),reasons:reasons,sessions:sessions,
    swapAway:sub.away,swapTo:sub.to,slopePct:slope.slopePct,repCV:cv,
    confidence:smartClamp(Math.round(evidence*11),0,90)};
  _behaveMemo.map[name]=out;
  return out;
}
/* ===== Tier 3: personal volume response =====
 * Generic guidance says roughly 10-20 hard sets per muscle per week, but the productive
 * range is individual and drifts with training age. Every ingredient for measuring it
 * first-hand is already in the log: how many sets each muscle got in a given week, and
 * whether the loads on that muscle's lifts went up afterwards. Correlating the two
 * yields THIS user's response curve rather than a population average.
 * Deliberately conservative — it reports "still learning" until several weeks exist,
 * because a correlation over three points is noise with a decimal point. */
function smartWeekKey(dateStr){
  const t=new Date(String(dateStr)+"T12:00:00");
  if(isNaN(t))return null;
  t.setDate(t.getDate()-((t.getDay()+6)%7));      // ISO week start (Monday)
  return localDateStr(t);
}
function smartVolumeHistory(muscle){
  /* weekKey -> {sets, gains:[per-exercise % e1RM change vs that lift's previous session]} */
  const weeks={},prevE={};
  const rows=[];
  Object.keys(state.history||{}).forEach(key=>{
    (state.history[key]||[]).forEach(e=>{ if(e&&e.d)rows.push(e); });
  });
  rows.sort((a,b)=>String(a.d).localeCompare(String(b.d)));
  rows.forEach(e=>{
    const name=e.n||e.exerciseName||"",contrib=smartMuscleContributions(name,e.m);
    const share=+contrib[muscle]||0;
    if(share<=0)return;
    const wk=smartWeekKey(e.d);
    if(!wk)return;
    const bucket=weeks[wk]||(weeks[wk]={sets:0,gains:[]});
    const working=smartHistorySets(e).filter(s=>s.r>0);
    bucket.sets+=(working.length||1)*share;
    const id=e.exerciseId||name;
    const e1=+e.e||0;
    if(e1>0){
      if(prevE[id]>0)bucket.gains.push((e1-prevE[id])/prevE[id]*100);
      prevE[id]=e1;
    }
  });
  return Object.keys(weeks).sort().map(w=>({
    week:w,sets:Math.round(weeks[w].sets*10)/10,
    gainPct:weeks[w].gains.length?Math.round(weeks[w].gains.reduce((a,b)=>a+b,0)/weeks[w].gains.length*10)/10:null
  }));
}
function smartVolumeResponse(muscle){
  const hist=smartVolumeHistory(muscle);
  const usable=hist.filter(w=>w.gainPct!=null&&w.sets>0);
  const planned=(typeof fractionalVolumeAudit==="function"?fractionalVolumeAudit():{})[muscle]||0;
  const out={muscle:muscle,weeks:usable.length,plannedSets:Math.round(planned*10)/10,
    bestSets:null,corr:null,direction:"hold",confidence:0,note:"",history:hist};
  if(usable.length<4){
    out.note="Still learning your response - needs "+(4-usable.length)+" more logged week"+(4-usable.length===1?"":"s")+".";
    out.confidence=usable.length*12;
    return out;
  }
  const xs=usable.map(w=>w.sets),ys=usable.map(w=>w.gainPct),n=xs.length;
  const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){ const dx=xs[i]-mx,dy=ys[i]-my; sxy+=dx*dy; sxx+=dx*dx; syy+=dy*dy; }
  out.corr=(sxx&&syy)?Math.round(sxy/Math.sqrt(sxx*syy)*100)/100:null;
  /* Best observed band = the volume in the weeks that actually produced the most gain. */
  const ranked=usable.slice().sort((a,b)=>b.gainPct-a.gainPct);
  const top=ranked.slice(0,Math.max(1,Math.round(n/2)));
  out.bestSets=Math.round(top.reduce((a,w)=>a+w.sets,0)/top.length*10)/10;
  /* Compare like with like. bestSets counts sets the user actually LOGGED, while
     plannedSets counts what the program prescribes across a full week — sessions get
     missed and exercises get skipped, so planned is systematically higher and the two
     are not comparable. The recommendation is therefore anchored to recent observed
     volume; planned is carried only as context for the UI. */
  out.recentSets=Math.round(usable.slice(-2).reduce((a,w)=>a+w.sets,0)/Math.min(2,usable.length)*10)/10;
  out.confidence=smartClamp(Math.round(28+usable.length*9+(out.corr==null?0:Math.abs(out.corr)*22)),0,88);
  const m=muscle.toLowerCase(),gap=out.bestSets-out.recentSets;
  /* The correlation sign leads: it is the only term that says whether MORE volume has
     actually bought this user more progress. Sorting by gain alone would happily
     recommend cutting volume off the back of a strongly positive relationship. */
  if(out.corr!=null&&out.corr>=.35){
    if(gap>=2){ out.direction="add"; out.note="More "+m+" volume has tracked with more progress for you, and your best weeks ran "+out.bestSets+" sets vs the "+out.recentSets+" you have been doing."; }
    else { out.direction="hold"; out.note="More "+m+" volume has tracked with more progress, and you are already near your best observed load ("+out.bestSets+" sets)."; }
  }else if(out.corr!=null&&out.corr<=-.35){
    if(out.recentSets-out.bestSets>=2){ out.direction="reduce"; out.note="Extra "+m+" sets have not bought progress - your best weeks averaged "+out.bestSets+", you are running "+out.recentSets+"."; }
    else { out.direction="hold"; out.note="Adding "+m+" volume has not helped, but you are not currently overshooting ("+out.recentSets+" sets)."; }
  }else if(gap>=3){
    out.direction="add"; out.note="Your best "+m+" weeks averaged "+out.bestSets+" sets against the "+out.recentSets+" you have logged lately.";
  }else if(gap<=-3){
    out.direction="reduce"; out.note="Your best "+m+" weeks averaged "+out.bestSets+" sets, below the "+out.recentSets+" you have logged lately.";
  }else{
    out.direction="hold"; out.note="Your recent "+out.recentSets+" "+m+" sets sits in the range that has been working ("+out.bestSets+").";
  }
  return out;
}
/* ===== Tier 4/5: explore-vs-exploit selection with a commitment window =====
 * Ranking exercises purely by "who looks best right now" is what produces exercise
 * hopping: a movement gets two sessions, has not visibly moved yet, and loses to a
 * shinier option — so nothing is ever run long enough to actually progress. That is a
 * classic multi-armed bandit failure, and it is the mechanism behind a stalled muscle
 * despite plenty of hard work.
 * Two terms fix it. An exploration bonus makes genuinely untried movements attractive in
 * proportion to how much variety the user asked for, and a commitment window protects an
 * exercise that has not yet had a fair trial from being swapped out early. */
const SMART_MIN_EVAL_SESSIONS=3;
function smartVariability(){
  const v=(profile&&profile.exerciseVariability)||(state.profile&&state.profile.exerciseVariability);
  return v==="consistent"||v==="variable"?v:"balanced";
}
function smartExplorationTemp(){
  const v=smartVariability();
  return v==="consistent"?0:v==="variable"?11:5;
}
/* Optimism under uncertainty: an arm with no data is worth a look, and the bonus decays
   as evidence accumulates. Scaled by the user's variability preference, so "More
   consistent" turns exploration off entirely. */
function smartExplorationBonus(name){
  const temp=smartExplorationTemp();
  if(!temp)return 0;
  const sessions=smartBehavioralFit(name).sessions;
  return Math.round(temp*(1-Math.min(1,sessions/4)));
}
function smartCommitmentStatus(name){
  const b=smartBehavioralFit(name),sessions=b.sessions;
  const stalled=b.slopePct!=null&&b.slopePct<=.3;
  return {sessions:sessions,slopePct:b.slopePct,
    underEvaluated:sessions>0&&sessions<SMART_MIN_EVAL_SESSIONS,
    remaining:Math.max(0,SMART_MIN_EVAL_SESSIONS-sessions),
    progressing:b.slopePct!=null&&b.slopePct>.3,
    earnedSwap:sessions>=SMART_MIN_EVAL_SESSIONS&&stalled};
}
/* Plain-language reason shown in the swap dialog when the engine would rather the user
   stayed put — an explanation, never a block. Pain or equipment always overrides. */
function smartCommitmentNotice(name){
  const c=smartCommitmentStatus(name);
  if(c.progressing&&c.sessions>=2)
    return {level:"keep",text:"This lift is still adding load for you - swapping now restarts progress from scratch."};
  if(c.underEvaluated)
    return {level:"early",text:"Only "+c.sessions+" session"+(c.sessions===1?"":"s")+" logged. Give it "+c.remaining+" more before judging it - two sessions cannot show a trend."};
  if(c.earnedSwap)
    return {level:"swap",text:"This one has had a fair trial ("+c.sessions+" sessions) and has stopped moving - a change is justified."};
  return null;
}
function smartNormalizeMuscle(label){
  const s=String(label||"").toLowerCase();
  if(/rear.*delt/.test(s))return "Rear delts";
  if(/chest|pec/.test(s))return "Chest";
  if(/bicep/.test(s))return "Biceps";
  if(/tricep/.test(s))return "Triceps";
  if(/shoulder|delt/.test(s))return "Shoulders";
  /* Traps is its own recovery/volume unit — it is trained and fatigues separately from
     the lats. Must precede the back rule, which would otherwise swallow it. */
  if(/\btrap/.test(s))return "Traps";
  if(/lat|back|rhomboid|erector/.test(s))return "Back";
  if(/quad|hamstring|glute|calf|adduct|abduct|leg/.test(s))return "Legs";
  if(/core|abdominal|oblique|\babs\b/.test(s))return "Core";
  return SMART_MUSCLES.indexOf(label)>=0?label:null;
}
/* Structured trainer metadata for the movements the shipped programs use most often.
   This overlay is intentionally conservative: an unknown library item is labelled
   "other/unknown" instead of guessing joints or skill from a persuasive exercise name.
   Pattern rules only cover well-defined movement families and exact rows win. */
const SMART_EXERCISE_META_EXACT=[
  ["flat dumbbell press",{movement:"horizontal press",joints:["shoulder","elbow"],stability:"medium",skill:"medium",progressionType:"double",anchorEligible:true,contributions:{Chest:1,Triceps:.45,Shoulders:.34}}],
  ["flat dumbbell bench press",{movement:"horizontal press",joints:["shoulder","elbow"],stability:"medium",skill:"medium",progressionType:"double",anchorEligible:true,contributions:{Chest:1,Triceps:.45,Shoulders:.34}}],
  ["incline dumbbell press",{movement:"incline press",joints:["shoulder","elbow"],stability:"medium",skill:"medium",progressionType:"double",anchorEligible:true,contributions:{Chest:1,Triceps:.42,Shoulders:.4}}],
  ["barbell bench press",{movement:"horizontal press",joints:["shoulder","elbow"],stability:"medium",skill:"high",progressionType:"double",anchorEligible:true,contributions:{Chest:1,Triceps:.45,Shoulders:.34}}],
  ["converging chest press machine",{movement:"horizontal press",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Chest:1,Triceps:.42,Shoulders:.3}}],
  ["weighted chest dips",{movement:"dip",joints:["shoulder","elbow"],stability:"low",skill:"high",progressionType:"double",anchorEligible:false,contributions:{Chest:1,Triceps:.55,Shoulders:.32}}],
  ["cable chest fly",{movement:"chest fly",joints:["shoulder"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Chest:1,Shoulders:.12}}],
  ["lat pulldown",{movement:"vertical pull",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Back:1,Biceps:.43,"Rear delts":.2}}],
  ["wide-grip lat pulldown",{movement:"vertical pull",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Back:1,Biceps:.43,"Rear delts":.2}}],
  ["pull-up",{movement:"vertical pull",joints:["shoulder","elbow"],stability:"low",skill:"high",progressionType:"body",anchorEligible:true,contributions:{Back:1,Biceps:.48,"Rear delts":.2}}],
  ["chest-supported / t-bar row",{movement:"horizontal pull",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Back:1,Biceps:.43,"Rear delts":.3}}],
  ["chest-supported row",{movement:"horizontal pull",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Back:1,Biceps:.43,"Rear delts":.3}}],
  ["seated cable rows",{movement:"horizontal pull",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Back:1,Biceps:.43,"Rear delts":.26}}],
  ["one-arm dumbbell row",{movement:"horizontal pull",joints:["shoulder","elbow"],stability:"medium",skill:"medium",progressionType:"double",anchorEligible:true,contributions:{Back:1,Biceps:.43,"Rear delts":.26}}],
  ["seated dumbbell shoulder press",{movement:"vertical press",joints:["shoulder","elbow"],stability:"medium",skill:"medium",progressionType:"double",anchorEligible:true,contributions:{Shoulders:1,Triceps:.42,Chest:.12}}],
  ["machine shoulder press",{movement:"vertical press",joints:["shoulder","elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Shoulders:1,Triceps:.42,Chest:.12}}],
  ["cable lateral raise",{movement:"shoulder abduction",joints:["shoulder"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Shoulders:1}}],
  ["lean-away cable lateral raise",{movement:"shoulder abduction",joints:["shoulder"],stability:"high",skill:"medium",progressionType:"double",anchorEligible:false,contributions:{Shoulders:1}}],
  ["machine lateral raise",{movement:"shoulder abduction",joints:["shoulder"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Shoulders:1}}],
  ["face pull",{movement:"rear-delt pull",joints:["shoulder","elbow"],stability:"high",skill:"medium",progressionType:"double",anchorEligible:false,contributions:{"Rear delts":1,Back:.28,Biceps:.15}}],
  ["hack squat",{movement:"squat",joints:["hip","knee"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Legs:1,Core:.12}}],
  ["barbell back squat",{movement:"squat",joints:["hip","knee","spine"],stability:"low",skill:"high",progressionType:"double",anchorEligible:true,contributions:{Legs:1,Core:.25,Back:.12}}],
  ["leg press",{movement:"squat",joints:["hip","knee"],stability:"high",skill:"low",progressionType:"double",anchorEligible:true,contributions:{Legs:1,Core:.08}}],
  ["bulgarian split squat",{movement:"single-leg squat",joints:["hip","knee"],stability:"low",skill:"high",progressionType:"double",anchorEligible:true,contributions:{Legs:1,Core:.18}}],
  ["romanian deadlift",{movement:"hinge",joints:["hip","spine"],stability:"medium",skill:"high",progressionType:"double",anchorEligible:true,contributions:{Legs:1,Back:.25,Core:.15}}],
  ["lying leg curl",{movement:"knee flexion",joints:["knee"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Legs:1}}],
  ["leg extension",{movement:"knee extension",joints:["knee"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Legs:1}}],
  ["ez-bar bicep curl",{movement:"elbow flexion",joints:["elbow"],stability:"medium",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Biceps:1}}],
  ["incline dumbbell curl",{movement:"elbow flexion",joints:["elbow","shoulder"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Biceps:1}}],
  ["dumbbell hammer curl",{movement:"elbow flexion",joints:["elbow"],stability:"medium",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Biceps:1}}],
  ["tricep rope pushdown",{movement:"elbow extension",joints:["elbow"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Triceps:1}}],
  ["overhead cable tricep extension",{movement:"elbow extension",joints:["elbow","shoulder"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Triceps:1}}],
  ["hanging leg raise",{movement:"trunk flexion",joints:["hip","spine"],stability:"low",skill:"medium",progressionType:"body",anchorEligible:false,contributions:{Core:1}}],
  ["cable crunch",{movement:"trunk flexion",joints:["spine"],stability:"high",skill:"low",progressionType:"double",anchorEligible:false,contributions:{Core:1}}]
].reduce((out,row)=>{out[row[0]]=row[1];return out;},{});
const SMART_EXERCISE_META_RULES=[
  {re:/\b(chest|bench).*press|\bpress.*chest/,movement:"horizontal press",joints:["shoulder","elbow"],stability:"medium",skill:"medium",anchorEligible:true},
  {re:/\b(row|rows)\b/,movement:"horizontal pull",joints:["shoulder","elbow"],stability:"medium",skill:"medium",anchorEligible:true},
  {re:/pulldown|pull-up|chin-up/,movement:"vertical pull",joints:["shoulder","elbow"],stability:"medium",skill:"medium",anchorEligible:true},
  {re:/shoulder press|overhead press|military press/,movement:"vertical press",joints:["shoulder","elbow"],stability:"medium",skill:"medium",anchorEligible:true},
  {re:/lateral raise/,movement:"shoulder abduction",joints:["shoulder"],stability:"medium",skill:"low",anchorEligible:false},
  {re:/rear delt|reverse fly|reverse flye|face pull/,movement:"rear-delt pull",joints:["shoulder","elbow"],stability:"medium",skill:"medium",anchorEligible:false},
  {re:/split squat|lunge/,movement:"single-leg squat",joints:["hip","knee"],stability:"low",skill:"high",anchorEligible:true},
  {re:/hack squat|leg press|\bsquat\b/,movement:"squat",joints:["hip","knee"],stability:"medium",skill:"medium",anchorEligible:true},
  {re:/romanian|deadlift|\brdl\b|good morning/,movement:"hinge",joints:["hip","spine"],stability:"medium",skill:"high",anchorEligible:true},
  {re:/leg curl/,movement:"knee flexion",joints:["knee"],stability:"high",skill:"low",anchorEligible:false},
  {re:/leg extension/,movement:"knee extension",joints:["knee"],stability:"high",skill:"low",anchorEligible:false},
  {re:/curl/,movement:"elbow flexion",joints:["elbow"],stability:"medium",skill:"low",anchorEligible:false},
  {re:/pushdown|tricep.*extension|skull crusher/,movement:"elbow extension",joints:["elbow"],stability:"medium",skill:"low",anchorEligible:false},
  {re:/crunch|leg raise|plank/,movement:"trunk",joints:["spine"],stability:"medium",skill:"low",anchorEligible:false}
];
function smartExerciseIdentity(name,suppliedId){
  try{
    const x=typeof exerciseIdentityFor==="function"?exerciseIdentityFor(name,suppliedId):null;
    if(x)return {exerciseId:x.exerciseId||null,libId:x.libId||null};
  }catch(e){}
  return {exerciseId:null,libId:suppliedId||null};
}
function smartExerciseMetadata(ex,primary){
  if(typeof ex==="string")ex={n:ex};
  ex=ex||{};
  const name=String(ex.n||"").trim(),key=name.toLowerCase();
  let row=SMART_EXERCISE_META_EXACT[key],source="exact";
  if(!row){
    const found=SMART_EXERCISE_META_RULES.find(x=>x.re.test(key));
    if(found){row=found;source="movement-family";}
  }
  const timed=/sec|\d+s|hold|plank/i.test(String(ex.r||"")),body=/body only|none/i.test(String(ex.eq||""));
  const p=smartNormalizeMuscle(primary||ex.m||ex.pm),contrib={};
  if(row&&row.contributions)Object.keys(row.contributions).forEach(m=>contrib[m]=row.contributions[m]);
  if(p&&!contrib[p])contrib[p]=1;
  const identity=smartExerciseIdentity(name,ex.libId||ex.id);
  return {
    name:name,exerciseId:identity.exerciseId,libId:identity.libId,
    movement:row?row.movement:"other",joints:row?(row.joints||[]).slice():[],
    stability:row?row.stability:"unknown",skill:row?row.skill:"unknown",
    progressionType:row&&row.progressionType?row.progressionType:(timed?"time":body?"body":"double"),
    contributions:contrib,anchorEligible:!!(row&&row.anchorEligible),source:row?source:"safe-fallback",
    known:!!row
  };
}
/* Fractional fatigue credit keeps a chest press from pretending it did nothing to
   triceps/front delts, and a row from pretending it did nothing to biceps/rear delts. */
function smartMuscleContributions(name,primary){
  const out={},p=smartNormalizeMuscle(primary)||primary,n=String(name||"").toLowerCase();
  if(p)out[p]=1;
  const meta=smartExerciseMetadata({n:name},primary);
  Object.keys(meta.contributions||{}).forEach(m=>out[m]=Math.max(out[m]||0,+meta.contributions[m]||0));
  let lib=null;
  try{lib=(typeof LIB!=="undefined"&&LIB)?LIB.find(x=>String(x.n).toLowerCase()===n):null;}catch(e){}
  String((lib&&lib.sm)||"").split(/[,;/+]/).forEach(raw=>{
    const m=smartNormalizeMuscle(raw);if(m&&m!==p)out[m]=Math.max(out[m]||0,.28);
  });
  const add=(m,v)=>{if(m!==p)out[m]=Math.max(out[m]||0,v);};
  if(/bench|chest press|push-?up|\bdip\b|incline.*press|decline.*press/.test(n)){add("Triceps",.45);add("Shoulders",.34);}
  if(/shoulder press|overhead press|military press|arnold press/.test(n)){add("Triceps",.42);add("Chest",.12);}
  if(/row|pulldown|pull-?up|chin-?up/.test(n)){add("Biceps",.43);add("Rear delts",.24);add("Traps",.22);}
  if(/shrug|y-?raise|t-?raise|kelso|upright row/.test(n))add("Traps",.9);
  if(/deadlift|rack pull|farmer|carry/.test(n))add("Traps",.35);
  if(/fly|flye|crossover|face pull|reverse pec/.test(n))add("Shoulders",.18);
  if(/deadlift|romanian|\brdl\b|good morning/.test(n)){add("Back",.25);add("Core",.15);}
  if(/squat|leg press|hack|lunge|split squat/.test(n))add("Core",.12);
  return out;
}
/* A workoutHistory detail[] entry's `sets` has carried two shapes over this app's life:
   the rich per-set array written today, and a plain working-set count in records from
   before per-set logging existed (still reachable through an old backup import). Calling
   an array method on the number form throws, and because that throw travels all the way
   out of renderPlan, a single legacy record used to blank the entire Train tab. Normalise
   in one place so no caller has to know which shape it holds. */
function smartWorkSets(entry){
  const rich=(entry&&Array.isArray(entry.sets))?entry.sets:[];
  return rich.filter(s=>s&&s.type!=="warm"&&s.type!=="drop"&&s.type!=="t40");
}
function smartWorkSetCount(entry){
  if(entry&&Array.isArray(entry.sets))return smartWorkSets(entry).length;
  const legacy=+(entry&&entry.sets); // legacy shape: the count itself
  return isFinite(legacy)&&legacy>0?legacy:0;
}
function smartWorkoutMuscleDose(workout,mus){
  if(workout&&Array.isArray(workout.detail)&&workout.detail.length){
    return workout.detail.reduce((sum,d)=>
      sum+smartWorkSetCount(d)*(smartMuscleContributions(d.n,d.m)[mus]||0),0);
  }
  return workout&&workout.m?(+workout.m[mus]||0):0;
}
function smartWeeklyMuscleSets(){
  const cut=localDateStr(new Date(Date.now()-6*864e5)),out={};
  (state.workoutHistory||[]).filter(w=>w&&w.date>=cut).forEach(w=>{
    SMART_MUSCLES.forEach(m=>{const dose=smartWorkoutMuscleDose(w,m);if(dose)out[m]=(out[m]||0)+dose;});
  });
  Object.keys(out).forEach(m=>out[m]=Math.round(out[m]*10)/10);
  return out;
}
function smartRecoveryLearning(mus){
  const rows=[];
  (state.recommendationEvents||[]).forEach(ev=>{
    if(!ev||!ev.data)return;
    if(ev.type==="recovery_correction"&&ev.data.muscle===mus&&isFinite(+ev.data.error)){
      rows.push({error:+ev.data.error,quality:1});
    }else if(ev.type==="workout_outcome"&&Array.isArray(ev.data.exercises)){
      ev.data.exercises.forEach(x=>{
        if(!x||!x.target||!x.actual)return;
        const credit=smartMuscleContributions(x.name,x.muscle)[mus]||0;
        if(!credit)return;
        /* Underperforming a target despite high predicted recovery is a negative
           prediction error; exceeding a conservative target is a smaller positive one. */
        let error=0;
        if(x.result==="under"&&x.actual.complete&&x.target.recovery>=65&&(x.actual.avgRir==null||x.actual.avgRir<=x.target.rir))error=-12;
        else if(x.result==="exceeded")error=7;
        if(error)rows.push({error:error,quality:Math.max(.2,credit*.65)});
      });
    }
  });
  const use=rows.slice(0,12);
  if(!use.length)return {count:0,error:0,windowFactor:1};
  let weighted=0,weight=0;
  use.forEach((row,i)=>{const w=Math.pow(.82,i)*row.quality;weighted+=row.error*w;weight+=w;});
  const error=weighted/weight;
  return {count:use.length,error:Math.round(error),windowFactor:smartClamp(1-error/100,.78,1.32)};
}
function smartExercisePlateau(name){
  const h=exLog(name).filter(x=>x&&(x.e>0||x.r>0)).slice(-6);
  if(h.length<4)return {plateau:false,count:h.length,changePct:null};
  const first=h.slice(0,Math.ceil(h.length/2)),last=h.slice(Math.floor(h.length/2));
  const score=x=>x.e||x.r||0,bestA=Math.max.apply(null,first.map(score)),bestB=Math.max.apply(null,last.map(score));
  const change=bestA?((bestB-bestA)/bestA*100):0;
  const misses=last.filter(x=>{const a=smartSetAssessment({r:"3 x 8-12"},x);return a.hardMiss;}).length;
  return {plateau:change>=-2&&change<1.5&&misses<2,count:h.length,changePct:Math.round(change*10)/10,declining:change<=-4};
}
/* Adaptive block length is evidence-driven but bounded: four weeks when fatigue/output
   is deteriorating, six by default, and up to eight while performance is still rising. */
function smartMesocycleStatus(){
  const sessions=(state.workoutHistory||[]).filter(x=>x&&(!x.programId||x.programId===activeProg));
  const start=(state.smartMesocycle&&state.smartMesocycle.programId===activeProg&&state.smartMesocycle.start)||
    state.phaseStart||(sessions.length?sessions[sessions.length-1].date:todayStr());
  const elapsed=Math.max(1,Math.floor((Date.now()-new Date(start+"T12:00:00").getTime())/(7*864e5))+1);
  const names=[];
  sessions.slice(0,12).forEach(w=>(w.detail||[]).forEach(d=>{if(names.indexOf(d.n)<0)names.push(d.n);}));
  const trends=names.map(n=>recentExerciseTrend(n)).filter(t=>t&&t.count>=2);
  const rising=trends.filter(t=>t.e1Change>=2).length,falling=trends.filter(t=>t.e1Change<=-4).length;
  const plateaus=names.map(n=>({name:n,data:smartExercisePlateau(n)})).filter(x=>x.data.plateau);
  const recentFeel=sessions.slice(0,3).map(x=>+x.feel).filter(Boolean);
  const rough=recentFeel.filter(x=>x<=2).length;
  const recentPost=sessions.slice(0,3).map(x=>x.postFeedback).filter(Boolean);
  const highFatigue=recentPost.filter(x=>+x.fatigue>=4).length;
  const jointFlags=recentPost.filter(x=>+x.jointPain>=3).length;
  const outcomeRows=(state.recommendationEvents||[]).filter(x=>x&&x.type==="workout_outcome").slice(0,4);
  let under=0,total=0;outcomeRows.forEach(ev=>(ev.data&&ev.data.exercises||[]).forEach(x=>{if(x.actual&&x.actual.complete){total++;if(x.result==="under")under++;}}));
  const ready=typeof readinessScore==="function"?readinessScore():null;
  let fatigueSignals=(rough>=2?2:rough)+(highFatigue>=2?1:0)+(jointFlags?1:0)+
    (falling>Math.max(1,trends.length*.4)?1:0)+(total>=4&&under/total>.55?1:0)+(ready!=null&&ready<=2?1:0);
  if(plateaus.length>=Math.max(2,Math.ceil(names.length*.45))&&(falling>0||total>=4&&under/total>.45))fatigueSignals++;
  let targetWeeks=6;
  if(fatigueSignals>=2)targetWeeks=4;
  else if(trends.length>=3&&rising/trends.length>=.55&&falling===0)targetWeeks=8;
  else if(sessions.length<5)targetWeeks=4;
  const cycleWeek=((elapsed-1)%targetWeeks)+1;
  const earlyDeload=fatigueSignals>=3&&cycleWeek>=3;
  const deload=earlyDeload||cycleWeek===targetWeeks;
  const phase=deload?"DELOAD":cycleWeek===1?"BASE":cycleWeek>=Math.max(3,targetWeeks-2)?"OVERLOAD":"BUILD";
  const reason=deload?(earlyDeload?"Repeated fatigue and missed targets triggered an early deload.":"Planned fatigue-management week."):
    targetWeeks===8?"Performance is rising, so the productive block can continue.":targetWeeks===4&&fatigueSignals?"A shorter block limits accumulating fatigue.":"Normal evidence-based build phase.";
  return {
    start:start,week:elapsed,cycleWeek:cycleWeek,targetWeeks:targetWeeks,phase:phase,deload:deload,
    earlyDeload:earlyDeload,loadFactor:deload?.9:1,setFactor:deload?.65:1,rirFloor:deload?3:1,
    fatigueSignals:fatigueSignals,plateaus:plateaus.slice(0,6).map(x=>x.name),reason:reason,
    confidence:trends.length>=4?"high":sessions.length>=4?"medium":"low"
  };
}

/* Completed hard sets create fatigue; it decays over a personalized muscle window.
   Manual correction is first-class because a phone cannot feel local soreness. */
function recoveryWindowDays(mus){
  if(mus==="Legs"||mus==="Back")return 3.5;
  if(mus==="Chest"||mus==="Shoulders")return 3;
  /* Traps tolerate frequent work and recover fast — mostly light isolation and shrugs. */
  if(mus==="Traps")return 2;
  return 2.5;
}
/* Health observations are kept as one de-duplicated sample per source timestamp. That
   lets the phone build a personal 14-day baseline (rolling over at 28 days) without
   pretending that repeatedly opening the app created new measurements. */
function smartHealthSamples(){
  try{
    const rows=JSON.parse(localStorage.getItem("gymHealthRecoverySamples")||"[]");
    return Array.isArray(rows)?rows:[];
  }catch(e){return [];}
}
function smartCacheHealthObservation(h){
  if(!h||!h.ok||!h.readAt)return smartHealthSamples();
  const rows=smartHealthSamples(),signature=[
    +h.sleepEndEpochMs||0,+h.restingHeartRateEpochMs||0,+h.hrvEpochMs||0,
    isFinite(+h.sleepHours)?+h.sleepHours:"",isFinite(+h.restingHeartRate)?+h.restingHeartRate:"",
    isFinite(+h.hrvRmssd)?+h.hrvRmssd:""
  ].join("|");
  if(!rows.some(x=>x.signature===signature)){
    rows.push({
      date:localDateStr(new Date(+h.readAt)),readAt:+h.readAt,signature:signature,
      sleepHours:isFinite(+h.sleepHours)?+h.sleepHours:null,sleepAt:+h.sleepEndEpochMs||null,
      restingHeartRate:isFinite(+h.restingHeartRate)?+h.restingHeartRate:null,rhrAt:+h.restingHeartRateEpochMs||null,
      hrvRmssd:isFinite(+h.hrvRmssd)?+h.hrvRmssd:null,hrvAt:+h.hrvEpochMs||null
    });
    const cut=Date.now()-35*864e5,trim=rows.filter(x=>(+x.readAt||0)>=cut).slice(-80);
    try{localStorage.setItem("gymHealthRecoverySamples",JSON.stringify(trim));}catch(e){}
    return trim;
  }
  return rows;
}
function smartMedian(vals){
  vals=(vals||[]).filter(v=>isFinite(+v)).map(Number).sort((a,b)=>a-b);
  if(!vals.length)return null;
  const m=Math.floor(vals.length/2);
  return vals.length%2?vals[m]:(vals[m-1]+vals[m])/2;
}
function smartMetricBaseline(rows,key){
  const vals=rows.map(x=>x[key]).filter(v=>v!=null&&isFinite(+v)).map(Number),median=smartMedian(vals);
  if(median==null)return {n:0,median:null,mad:null};
  const mad=smartMedian(vals.map(v=>Math.abs(v-median)));
  return {n:vals.length,median:Math.round(median*10)/10,mad:Math.round((mad||0)*10)/10};
}
function smartHealthBaseline(rows){
  const cut=Date.now()-28*864e5,use=(rows||smartHealthSamples()).filter(x=>(+x.readAt||0)>=cut);
  const dates=[...new Set(use.map(x=>x.date).filter(Boolean))].sort();
  const span=dates.length>1?Math.round((new Date(dates[dates.length-1]+"T12:00:00")-new Date(dates[0]+"T12:00:00"))/864e5)+1:dates.length;
  /* Ten distinct measurement days spanning at least fourteen calendar days is enough
     to use trends conservatively; fourteen days remains the visible calibration goal. */
  const ready=dates.length>=10&&span>=14;
  return {
    ready:ready,days:dates.length,spanDays:span,targetDays:14,windowDays:28,
    sleep:smartMetricBaseline(use,"sleepHours"),rhr:smartMetricBaseline(use,"restingHeartRate"),
    hrv:smartMetricBaseline(use,"hrvRmssd")
  };
}
/* Optional Health Connect observations are deliberately a one-way brake rather than an
   automatic green light. HR/HRV only influence a target after a personal baseline is
   ready, and even then their combined effect is capped at a small reversible change. */
function smartHealthSnapshot(){
  let h={};try{if(typeof nativeHealthRecovery==="function")h=nativeHealthRecovery()||{};}catch(e){}
  const rows=smartCacheHealthObservation(h),baseline=smartHealthBaseline(rows);
  const now=Date.now(),readAt=+h.readAt||0,sleepAt=+h.sleepEndEpochMs||0,rhrAt=+h.restingHeartRateEpochMs||0,hrvAt=+h.hrvEpochMs||0;
  const age=at=>at?Math.max(0,(now-at)/36e5):null,readAge=age(readAt),sleepAge=age(sleepAt),rhrAge=age(rhrAt),hrvAge=age(hrvAt);
  const current=!!(h.ok&&readAt&&readAge<=36),sleepCurrent=!!(current&&sleepAt&&sleepAge<=36&&isFinite(+h.sleepHours));
  const rhrCurrent=!!(current&&rhrAt&&rhrAge<=36&&isFinite(+h.restingHeartRate));
  const hrvCurrent=!!(current&&hrvAt&&hrvAge<=36&&isFinite(+h.hrvRmssd));
  let modifier=0;const reasons=[];
  if(sleepCurrent&&+h.sleepHours<5.5){modifier-=8;reasons.push("Health Connect recorded only "+h.sleepHours+" hours of recent sleep.");}
  else if(sleepCurrent&&+h.sleepHours<6.5){modifier-=4;reasons.push("Recent sleep was "+h.sleepHours+" hours, so the trainer is slightly conservative.");}
  else if(sleepCurrent&&baseline.ready&&baseline.sleep.n>=8&&+h.sleepHours<=baseline.sleep.median-1.25){
    modifier-=2;reasons.push("Sleep was well below your "+baseline.windowDays+"-day personal baseline.");
  }
  let trendBrake=0;
  if(baseline.ready&&rhrCurrent&&baseline.rhr.n>=8){
    const threshold=Math.max(5,(baseline.rhr.mad||0)*2.5);
    if(+h.restingHeartRate>=baseline.rhr.median+threshold){trendBrake-=2;reasons.push("Resting heart rate is above your personal baseline.");}
  }
  if(baseline.ready&&hrvCurrent&&baseline.hrv.n>=8){
    const threshold=Math.max(baseline.hrv.median*.12,(baseline.hrv.mad||0)*2.5);
    if(+h.hrvRmssd<=baseline.hrv.median-threshold){trendBrake-=2;reasons.push("HRV is below your personal baseline.");}
  }
  modifier+=Math.max(-4,trendBrake);
  modifier=Math.max(-10,modifier);
  return {
    connected:!!h.ok,current:current,source:h.source||null,readAgeHours:readAge==null?null:Math.round(readAge*10)/10,
    sleepHours:isFinite(+h.sleepHours)?+h.sleepHours:null,sleepAgeHours:sleepAge==null?null:Math.round(sleepAge*10)/10,
    restingHeartRate:isFinite(+h.restingHeartRate)?+h.restingHeartRate:null,rhrAgeHours:rhrAge==null?null:Math.round(rhrAge*10)/10,
    hrvRmssd:isFinite(+h.hrvRmssd)?+h.hrvRmssd:null,hrvAgeHours:hrvAge==null?null:Math.round(hrvAge*10)/10,
    scoreModifier:modifier,reason:reasons.join(" "),reasons:reasons,baseline:baseline,
    interpretation:baseline.ready?
      "Sleep, resting HR and HRV are compared with your personal baseline and can only make a small conservative adjustment.":
      "Sleep can apply a small brake. Resting HR and HRV stay context-only until the 14-day personal baseline is ready."
  };
}
function smartPreWorkoutFeedback(){
  const r=state.readiness;
  if(!r||r.date!==todayStr())return null;
  const jointPain=r.jointPain!=null?+r.jointPain:(r.joints!=null?6-(+r.joints):1);
  return {
    date:r.date,sleep:smartClamp(+r.sleep||3,1,5),energy:smartClamp(+r.energy||3,1,5),
    soreness:smartClamp(+r.sore||1,1,5),jointPain:smartClamp(jointPain||1,1,5),
    redFlags:Array.isArray(r.redFlags)?r.redFlags.slice(0,6):[],note:String(r.note||"").slice(0,120)
  };
}
function smartSafetyAssessment(feedback){
  const f=feedback||smartPreWorkoutFeedback();
  if(!f)return {level:"unknown",hold:false,modify:false,reason:"No pre-workout body check is saved.",guidance:"Start conservatively and stop any movement that causes pain."};
  if(f.redFlags&&f.redFlags.length)return {
    level:"stop",hold:true,modify:true,reason:"You selected a stop-training warning sign: "+f.redFlags.join(", ")+".",
    guidance:"Do not start this workout. This app cannot diagnose symptoms; seek appropriate medical assessment, urgently for severe or sudden symptoms."
  };
  if(f.jointPain>=4)return {
    level:"stop",hold:true,modify:true,reason:"You reported high joint pain today.",
    guidance:"Do not train through it. Use rest or a clearly pain-free movement and seek a qualified clinician if pain is severe, worsening or persistent."
  };
  if(f.jointPain===3)return {
    level:"modify",hold:false,modify:true,reason:"You reported moderate joint discomfort today.",
    guidance:"Avoid aggravating ranges and loads, keep effort controlled, and stop if discomfort increases."
  };
  if(f.soreness>=5||f.energy<=1)return {
    level:"modify",hold:false,modify:true,reason:f.soreness>=5?"Soreness is very high today.":"Energy is very low today.",
    guidance:"Use a lighter session or recovery day. Stop if technique or symptoms deteriorate."
  };
  return {level:"clear",hold:false,modify:false,reason:"No training red flag was reported.",guidance:"Normal training is reasonable; pain still overrides the app."};
}
function smartFeedbackTrend(mus){
  const rows=(state.workoutHistory||[]).filter(w=>w&&w.postFeedback&&(!mus||smartWorkoutMuscleDose(w,mus)>0)).slice(0,6);
  const val=k=>{const a=rows.map(x=>+x.postFeedback[k]).filter(x=>isFinite(x)&&x>0);return a.length?Math.round(a.reduce((s,n)=>s+n,0)/a.length*10)/10:null;};
  return {count:rows.length,stimulus:val("stimulus"),fatigue:val("fatigue"),jointPain:val("jointPain"),rows:rows};
}
function smartPostWorkoutFeedback(workout,feedback){
  if(!workout||!feedback)return null;
  const clean={
    stimulus:smartClamp(+feedback.stimulus||3,1,5),
    fatigue:smartClamp(+feedback.fatigue||3,1,5),
    jointPain:smartClamp(+feedback.jointPain||1,1,5),
    at:new Date().toISOString()
  };
  workout.postFeedback=clean;
  const data={workoutId:workout.id||null,stimulus:clean.stimulus,fatigue:clean.fatigue,jointPain:clean.jointPain,
    safety:smartSafetyAssessment({jointPain:clean.jointPain,soreness:1,energy:3}).level};
  const prior=(state.recommendationEvents||[]).find(ev=>ev&&ev.type==="post_workout_feedback"&&ev.data&&
    data.workoutId&&ev.data.workoutId===data.workoutId);
  if(prior){prior.at=new Date().toISOString();prior.data=data;}
  else recordRecommendationEvent("post_workout_feedback",data);
  return clean;
}
function muscleRecovery(mus){
  const overrides=state.recoveryOverrides||{},ov=overrides[mus];
  if(ov&&smartDateAge(ov.date)<=1&&isFinite(+ov.score)){
    const manual=smartClamp(Math.round(+ov.score),0,100);
    return {muscle:mus,score:manual,scoreLow:manual,scoreHigh:manual,range:{low:manual,high:manual},
      status:manual>=80?"Ready":manual>=55?"Recovering":"Fatigued",lastDate:null,lastSets:0,
      confidence:"manual",confidencePct:100,manual:true};
  }
  const rows=(state.workoutHistory||[]).map(x=>({workout:x,dose:smartWorkoutMuscleDose(x,mus)})).filter(x=>x.workout&&x.workout.date&&x.dose>0);
  const learned=smartRecoveryLearning(mus),win=recoveryWindowDays(mus)*learned.windowFactor;
  let fatigue=0,recentCount=0;
  rows.forEach(row=>{
    const x=row.workout;
    const age=smartDateAge(x.date);
    if(age>7)return;
    recentCount++;
    const sets=row.dose;
    const sessionLoad=Math.min(78,sets*6.8);
    const post=x.postFeedback||{},feelFactor=post.fatigue>=4?1.14:post.fatigue<=2?.94:(x.feel&&x.feel<=2?1.12:x.feel>=4?.94:1);
    /* deliberately keeps t40 rows (constant-tension sets carry a real RIR), so this
       filter stays wider than smartWorkSets — only the array guard is shared. */
    const rich=(x.detail||[]).filter(d=>(smartMuscleContributions(d.n,d.m)[mus]||0)>0)
      .reduce((a,d)=>a.concat((Array.isArray(d.sets)?d.sets:[]).filter(s=>s&&s.type!=="drop"&&s.type!=="warm")),[]);
    const rirs=rich.map(s=>s.rir).filter(r=>r!=null),avgRir=rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:null;
    const effortFactor=avgRir==null?1:avgRir<=1?1.12:avgRir>=3?.88:1;
    fatigue+=sessionLoad*feelFactor*effortFactor*Math.pow(Math.max(0,1-age/win),1.22);
  });
  /* Corrections are observed minus predicted. Apply only half of the learned error:
     enough to personalize, never enough for one subjective check to dominate. */
  const corrected=100-fatigue+learned.error*.5;
  const score=smartClamp(Math.round(corrected),0,100),count28=rows.filter(x=>smartDateAge(x.workout.date)<=28).length;
  const confidence=count28>=5||learned.count>=3?"high":count28>=2?"medium":"low";
  const confidencePct=confidence==="high"?84:confidence==="medium"?66:42;
  const spread=confidence==="high"?6:confidence==="medium"?10:16;
  const low=smartClamp(Math.round(score-spread),0,100),high=smartClamp(Math.round(score+spread),0,100);
  return {
    muscle:mus,score:score,scoreLow:low,scoreHigh:high,range:{low:low,high:high},
    status:score>=80?"Ready":score>=55?"Recovering":"Fatigued",
    lastDate:rows.length?rows[0].workout.date:null,lastSets:rows.length?Math.round(rows[0].dose*10)/10:0,
    confidence:confidence,confidencePct:confidencePct,manual:false,recentSessions:recentCount,
    recoveryDays:Math.round(win*10)/10,predictionError:learned.error,
    directAndSecondary:true
  };
}
function allMuscleRecovery(){ const out={};SMART_MUSCLES.forEach(m=>out[m]=muscleRecovery(m));return out; }
function overallRecovery(){
  const all=allMuscleRecovery(),vals=SMART_MUSCLES.map(m=>all[m].score);
  const muscle=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  const check=typeof readinessScore==="function"?readinessScore():null;
  const health=smartHealthSnapshot();
  const score=smartClamp((check==null?muscle:Math.round(muscle*.72+(check/5*100)*.28))+health.scoreModifier,0,100);
  const lows=SMART_MUSCLES.map(m=>all[m].scoreLow),highs=SMART_MUSCLES.map(m=>all[m].scoreHigh);
  let low=Math.round(lows.reduce((a,b)=>a+b,0)/lows.length),high=Math.round(highs.reduce((a,b)=>a+b,0)/highs.length);
  if(check!=null){low=Math.round(low*.72+(check/5*100)*.28);high=Math.round(high*.72+(check/5*100)*.28);}
  low=smartClamp(low+health.scoreModifier,0,100);high=smartClamp(high+health.scoreModifier,0,100);
  return {score:smartClamp(score,0,100),scoreLow:smartClamp(low,0,100),scoreHigh:smartClamp(high,0,100),
    range:{low:smartClamp(low,0,100),high:smartClamp(high,0,100)},muscleScore:muscle,checkIn:check,
    health:health,status:score>=80?"Ready to train":score>=58?"Train with control":"Recovery first"};
}
/* Reads the state colours from CSS rather than hardcoding them, so the body map, the dots
   and the recovery bars can never drift from the palette the rest of the app uses — this
   used to return the old green accent and stayed green through a full retheme. */
function recoveryColorFor(mus){
  const n=muscleRecovery(mus).score;
  const token=n>=80?"--success-txt":n>=55?"--warn-txt":"--fail-txt";
  try{
    const v=getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if(v)return v;
  }catch(e){}
  return n>=80?"#8fd9a0":n>=55?"#f5c97e":"#f09384"; // headless/test fallback
}
function dayRecovery(di){
  if(di<0||!PROGRAM[di])return overallRecovery();
  const weights={};
  PROGRAM[di].ex.forEach((e,ei)=>{
    const c=smartMuscleContributions(curOpt(di,ei).n,e.m);
    Object.keys(c).forEach(m=>weights[m]=Math.max(weights[m]||0,c[m]));
  });
  const mus=Object.keys(weights),den=mus.reduce((a,m)=>a+weights[m],0)||1;
  const muscle=mus.length?Math.round(mus.reduce((a,m)=>a+muscleRecovery(m).score*weights[m],0)/den):100;
  const check=typeof readinessScore==="function"?readinessScore():null;
  const health=smartHealthSnapshot();
  const score=smartClamp((check==null?muscle:Math.round(muscle*.7+(check/5*100)*.3))+health.scoreModifier,0,100);
  let low=mus.length?Math.round(mus.reduce((a,m)=>a+muscleRecovery(m).scoreLow*weights[m],0)/den):100;
  let high=mus.length?Math.round(mus.reduce((a,m)=>a+muscleRecovery(m).scoreHigh*weights[m],0)/den):100;
  if(check!=null){low=Math.round(low*.7+(check/5*100)*.3);high=Math.round(high*.7+(check/5*100)*.3);}
  low=smartClamp(low+health.scoreModifier,0,100);high=smartClamp(high+health.scoreModifier,0,100);
  return {score:smartClamp(score,0,100),scoreLow:smartClamp(low,0,100),scoreHigh:smartClamp(high,0,100),
    range:{low:smartClamp(low,0,100),high:smartClamp(high,0,100)},muscleScore:muscle,checkIn:check,
    health:health,status:score>=78?"Ready":score>=55?"Controlled":"Recover"};
}
function setRecoveryOverride(mus,score){
  state.recoveryOverrides=state.recoveryOverrides||{};
  if(score==null)delete state.recoveryOverrides[mus];
  else {
    const observed=smartClamp(Math.round(+score||0),0,100),existing=state.recoveryOverrides[mus];
    if(!(existing&&smartDateAge(existing.date)<=1)){
      const predicted=muscleRecovery(mus).score;
      recordRecommendationEvent("recovery_correction",{muscle:mus,predicted:predicted,observed:observed,error:observed-predicted});
    }
    state.recoveryOverrides[mus]={date:todayStr(),score:observed};
  }
  save();
}

/* User preference and post-workout ratings influence every future candidate list. */
function exercisePreference(name){
  try{const row=typeof exerciseDataFor==="function"?exerciseDataFor(name,null,false):null;if(row&&row.preference)return row.preference;}catch(e){}
  return ((state.exercisePreferences||{})[name]||"neutral");
}
function recordRecommendationEvent(type,data){
  state.recommendationEvents=state.recommendationEvents||[];
  state.recommendationEvents.unshift({date:todayStr(),at:new Date().toISOString(),type:type,data:data||{}});
  /* Keep enough compact outcomes for year-scale calibration. SQLite-backed builds can
     retain more, but a thousand events already prevents the old two-month amnesia. */
  state.recommendationEvents=state.recommendationEvents.slice(0,1000);
}
function setExercisePreference(name,pref){
  if(["more","less","never","neutral"].indexOf(pref)<0)return;
  const identity=smartExerciseIdentity(name);let row=null;
  try{if(typeof exerciseDataFor==="function")row=exerciseDataFor(name,identity.exerciseId,true);}catch(e){}
  if(row){if(pref==="neutral")delete row.preference;else row.preference=pref;}
  state.exercisePreferences=state.exercisePreferences||{};
  if(pref==="neutral")delete state.exercisePreferences[name];else state.exercisePreferences[name]=pref;
  recordRecommendationEvent("preference",{exercise:name,exerciseId:identity.exerciseId,libId:identity.libId,value:pref});
  save();
}
function exercisePreferenceHTML(name){
  const p=exercisePreference(name);
  return "<div class='prefBlock'><div><b>Trainer preference</b><small>Changes future swaps and recommendations</small></div><div class='prefButtons'>"+
    [["more","More often"],["less","Less often"],["never","Never"]].map(x=>"<button data-pref='"+x[0]+"' class='"+(p===x[0]?"on":"")+"'>"+x[1]+"</button>").join("")+
    "</div></div>";
}
function bindExercisePreferenceControls(name){
  document.querySelectorAll("#detBody [data-pref]").forEach(b=>b.onclick=()=>{
    const next=exercisePreference(name)===b.dataset.pref?"neutral":b.dataset.pref;
    setExercisePreference(name,next);
    document.querySelectorAll("#detBody [data-pref]").forEach(x=>x.classList.toggle("on",x.dataset.pref===next));
    toast(next==="neutral"?"Preference cleared":next==="never"?"Hidden from smart suggestions":next==="more"?"Trainer will favor this":"Trainer will rotate this less");
  });
}
function equipmentFitScore(ex){
  const eq=((ex&&ex.eq)||"").toLowerCase(),mode=(profile&&profile.equip)||"full";
  if(mode==="full")return 12;
  if(mode==="db")return /dumbbell|body|none|band|bench/.test(eq)?12:-32;
  return /body|none|band|dumbbell|kettlebell/.test(eq)?10:-38;
}
function exerciseSelectionScore(ex,mus,currentName){
  const pref=exercisePreference(ex.n),fit=exerciseResponse(ex.n),hist=exLog(ex.n),trend=recentExerciseTrend(ex.n),learn=smartExerciseLearning(ex.n);
  const knowledge=typeof exerciseKnowledge==="function"?exerciseKnowledge(ex):null;
  const metadata=smartExerciseMetadata(ex,mus);
  const allowed=typeof profileExerciseAllowed==="function"?profileExerciseAllowed(ex):{ok:true,reason:""};
  let score=58+equipmentFitScore(ex);
  const reasons=[];
  if(!allowed.ok){score-=100;reasons.push(allowed.reason);}
  if(knowledge){
    if(knowledge.hypertrophy){score+=6;reasons.push("measurable hypertrophy movement");}
    else {score-=55;reasons.push("not primarily a muscle-growth exercise");}
    score+=(knowledge.stability-60)*.08;
    if(knowledge.stability>=80)reasons.push("stable loading");
    // Loading the muscle at its lengthened position is the strongest single hypertrophy
    // signal (RP/Israetel); reward it so "best" swaps prefer stretch-loaded movements.
    if(isFinite(+knowledge.lengthened)){ score+=(knowledge.lengthened-60)*.14;
      if(knowledge.lengthened>=80)reasons.push("loads the stretched position"); }
    if(knowledge.jointStress>=60){score-=14;reasons.push("higher joint-stress option");}
    if(knowledge.skill>=80&&(profile&&profile.trainingExperience)!=="advanced"){score-=18;reasons.push("high skill demand");}
    const pains=((profile&&profile.painAreas)||[]).join(" ").toLowerCase(),joints=metadata.joints||[];
    if(/shoulder/.test(pains)&&joints.indexOf("shoulder")>=0){score-=22;reasons.push("shoulder constraint");}
    if(/elbow/.test(pains)&&joints.indexOf("elbow")>=0){score-=18;reasons.push("elbow constraint");}
    if(/knee/.test(pains)&&joints.indexOf("knee")>=0){score-=22;reasons.push("knee constraint");}
    if(/lower back/.test(pains)&&(joints.indexOf("spine")>=0||knowledge.axialFatigue>=65)){score-=24;reasons.push("lower-back constraint");}
  }
  if(pref==="never"){score-=100;reasons.push("marked never");}
  else if(pref==="more"){score+=17;reasons.push("you want it more often");}
  else if(pref==="less"){score-=13;reasons.push("you want it less often");}
  if(fit){
    score+=(fit.comfort-3)*5+(fit.stability-3)*3+(fit.feel-3)*4;
    if(fit.comfort>=4)reasons.push("good joint comfort");
    if(fit.feel>=4)reasons.push("strong muscle feel");
    if(fit.comfort<=2)reasons.push("low comfort history");
  }
  /* Behaviour-derived fit. An explicit rating is the better signal when it exists, so
     inferred evidence is damped to a third once the user has actually rated this lift;
     on its own it carries full weight, which is what keeps ranking personal for the
     (normal) case where nobody fills in rating sliders. */
  const behave=smartBehavioralFit(ex.n);
  if(behave.adjust){
    score+=fit?behave.adjust/3:behave.adjust;
    if(behave.reasons.length)reasons.push(behave.reasons[0]);
  }
  if(hist.length){score+=Math.min(8,hist.length*1.5);reasons.push("known history");}
  if(trend&&trend.count>=2&&trend.e1Change>2){score+=5;reasons.push("progressing");}
  if(trend&&trend.count>=3&&trend.e1Change<-5){score-=8;reasons.push("recent output down");}
  if(learn.count>=2&&learn.successRate>=75){score+=6;reasons.push("smart targets work well for you");}
  if(learn.count>=2&&learn.under>=Math.ceil(learn.count*.6)){score-=5;reasons.push("targets often underperformed");}
  if(currentName&&sameEx(ex.n,currentName)){
    if(metadata.anchorEligible){score+=16;reasons.push("keeps your block anchor stable");}
    else score-=8;
    /* Commitment window: defend the incumbent while it is still earning its place, so a
       lift that is working (or simply has not been run long enough to tell) is not
       traded away for a better-looking unknown. This is the anti-hopping term. */
    const commit=smartCommitmentStatus(ex.n);
    if(commit.progressing){score+=14;reasons.push("still adding load - worth keeping");}
    else if(commit.underEvaluated){score+=10;reasons.push("needs "+commit.remaining+" more session"+(commit.remaining===1?"":"s")+" for a fair trial");}
    else if(commit.earnedSwap){score-=10;reasons.push("has had a fair trial and stalled");}
  }else{
    /* Exploration bonus applies only to alternatives, never to the incumbent. */
    const explore=smartExplorationBonus(ex.n);
    if(explore){score+=explore;if(explore>=4)reasons.push("untested option worth trying");}
  }
  if(typeof riskyExercise==="function"&&riskyExercise(ex)){score-=30;reasons.push("joint-risk caution");}
  return {score:smartClamp(Math.round(score),0,100),reasons:reasons,preference:pref,
    learnedOutcomes:learn.count,successRate:learn.successRate==null?null:learn.successRate};
}
function sortSmartCandidates(list,mus,currentName){
  return (list||[]).map((o,i)=>({row:o,fit:exerciseSelectionScore(o.x||o,mus,currentName),index:i}))
    .sort((a,b)=>(b.fit.score-a.fit.score)||(a.index-b.index)).map(x=>{x.row.smartFit=x.fit;return x.row;});
}

/* ===== Coverage-gap detection =====
 * The scorer above picks the best exercise for a target; this finds the targets that
 * aren't being trained at all. For each muscle the active program trains, it checks the
 * evidence-based "essential" regions (each muscle's key heads + a lengthened/stretch-
 * loaded movement — the strongest growth signal) against what the week actually covers,
 * using exFor's region labels + the knowledge base's `lengthened` flag. Returns the gaps,
 * priority muscles first, so the plan and the coach can recommend exactly what's missing. */
const SMART_COVERAGE_TARGETS={
  Chest:[{k:"Upper chest (incline)",re:/upper|incline|clavicular/},{k:"A chest fly / stretch",re:/fly|flye|crossover|pec deck|squeeze/,stretch:true}],
  Back:[{k:"Vertical pull (width)",re:/width|pulldown|pull[-\s]?ups?|chin/},{k:"Horizontal pull (thickness)",re:/thickness|\brow/},{k:"Lat stretch isolation",re:/stretch isolation|straight-?arm|pullover/,stretch:true},{k:"Lower back / erectors",re:/erector|lower back|back extension|hyperextension|good morning/}],
  Traps:[{k:"Upper traps (shrug)",re:/upper trap|shrug/},{k:"Mid traps (retraction)",re:/mid traps|retraction|kelso|t-?raise/},{k:"Lower traps (Y-raise)",re:/lower trap|y-?raise/}],
  Biceps:[{k:"Long head (stretch)",re:/long head|incline curl/,stretch:true},{k:"Short head (peak)",re:/short head|peak|preacher|spider|concentration/},{k:"Brachialis (hammer)",re:/brachialis|hammer/}],
  /* The triceps has three heads, so a two-target list could never report the muscle
     honestly. The long head is the one that genuinely needs its own movement (it crosses
     the shoulder, so only overhead/behind-the-head work loads it at length); the medial
     head is a bystander in most extensions but is emphasised by underhand grips, close
     grips and full lockouts — hence the broad pattern, which stays quiet for any program
     that already presses or dips. */
  Triceps:[{k:"Long head (overhead stretch)",re:/long head|overhead|skull/,stretch:true},{k:"Lateral head (pushdown)",re:/lateral|pushdown|pressdown/},{k:"Medial head (underhand / lockout)",re:/medial|reverse.?grip|underhand|supinated|close-?grip|diamond|all three|\bdip/}],
  Shoulders:[{k:"Side delts (width)",re:/side delt|lateral raise/}],
  "Rear delts":[{k:"Direct rear-delt work",re:/rear delt|reverse|face pull/}],
  Legs:[{k:"Quads",re:/quad/},{k:"Hamstrings (stretch/hinge)",re:/hamstring|romanian|\brdl\b/,stretch:true},{k:"Calves",re:/calf|calves|calv/}]
};
function smartCoverageGaps(){
  const byM={};
  PROGRAM.forEach((d,di)=>d.ex.forEach((e,ei)=>{ const o=curOpt(di,ei),m=e.m; if(!m)return;
    const b=byM[m]||(byM[m]={hay:"",stretch:false});
    b.hay+=" "+String(exFor(o,m)||"").toLowerCase()+" "+String(o.n||"").toLowerCase();
    try{ if(typeof exerciseKnowledge==="function"){ const k=exerciseKnowledge(o); if(k&&+k.lengthened>=80)b.stretch=true; } }catch(_){}
  }));
  const pr=(typeof getPriority==="function"?getPriority():[]),gaps=[];
  Object.keys(SMART_COVERAGE_TARGETS).forEach(m=>{ const b=byM[m]; if(!b)return; // untrained muscle isn't a "gap", it's just off-plan
    SMART_COVERAGE_TARGETS[m].forEach(t=>{ const covered=t.re.test(b.hay)||(t.stretch&&b.stretch);
      if(!covered)gaps.push({muscle:m,label:t.k,stretch:!!t.stretch,re:t.re,priority:pr.indexOf(m)>=0&&pr.indexOf(m)<3}); }); });
  gaps.sort((a,b)=>(b.priority?1:0)-(a.priority?1:0));
  return gaps;
}
/* The single best library exercise (by exerciseSelectionScore, extra-rewarding stretch
   when the gap is a stretch region) that would fill a given gap with your equipment. */
function smartBestForGap(gap){
  let pool=[];
  try{ pool=LIB.filter(x=>libMuscleOf(x)===gap.muscle && gap.re.test(String(exFor(x,x.m)||"").toLowerCase()+" "+String(x.n).toLowerCase())); }catch(e){ return null; }
  if(!pool.length)return null;
  let best=null,bs=-1;
  pool.forEach(x=>{ let s=exerciseSelectionScore(x,gap.muscle,"").score;
    if(gap.stretch){ try{ if(+exerciseKnowledge(x).lengthened>=80)s+=12; }catch(_){} }
    if(s>bs){ bs=s; best=x; } });
  return best;
}
/* Renders the learned per-muscle volume response. Muscles still gathering data are shown
   as "learning" rather than hidden, so it is obvious the model is measuring rather than
   guessing — and obvious what it still needs. */
function volumeResponseHTML(){
  const rows=SMART_MUSCLES.map(m=>smartVolumeResponse(m))
    .filter(r=>r.weeks>0||r.plannedSets>0)
    .sort((a,b)=>(b.weeks-a.weeks)||(b.confidence-a.confidence));
  if(!rows.length)return "<div class='insight'><b>Volume response</b><br>Log a few weeks of training and this will learn how much work each muscle actually needs.</div>";
  const tag={add:"ADD",reduce:"TRIM",hold:"OK"};
  const body=rows.slice(0,9).map(r=>{
    const learning=r.weeks<4;
    const right=learning?"learning":(tag[r.direction]+" · "+r.confidence+"%");
    return "<div class='hitem'><div><div class='d'>"+esc(r.muscle)+"</div><div class='m'>"+esc(r.note)+"</div></div>"+
      "<div class='v' style='font-size:12px;max-width:38%'>"+esc(right)+"</div></div>";
  }).join("");
  return "<div class='insight' style='margin-bottom:10px'><b>Measured from your own log</b><br>"+
    "<small style='color:var(--muted)'>Compares how many sets each muscle actually got each week with how the loads on that muscle moved afterwards. Needs 4 logged weeks per muscle before it will commit to a direction.</small></div>"+body;
}
function smartCoverageHTML(){
  const gaps=smartCoverageGaps();
  if(!gaps.length)return "<div class='insight'><b>Coverage ✓</b><br>Every muscle you train hits its key regions, including a stretch-loaded movement.</div>";
  const rows=gaps.slice(0,6).map(g=>{ const best=smartBestForGap(g);
    return "<div class='hitem'><div><div class='d'>"+(g.priority?"🎯 ":"")+esc(g.muscle+" · "+g.label)+"</div><div class='m'>"+(best?"Best fit: "+esc(best.n):"No match with your equipment")+"</div></div></div>"; }).join("");
  return "<div class='insight'><b>Coverage gaps</b><br>Evidence-based regions your program doesn't train yet — with the best exercise to fill each. 🎯 = a priority muscle.</div>"+
    rows+"<div class='btnrow'><button onclick='coverageAskCoach()'>Ask coach to add these</button></div>";
}
function coverageAskCoach(){
  const gaps=smartCoverageGaps().slice(0,6).map(g=>{ const b=smartBestForGap(g); return g.muscle+" "+g.label+(b?" (e.g. "+b.n+")":""); });
  if(!gaps.length){ toast("No coverage gaps — nice work"); return; }
  if(typeof openChat==="function")openChat();
  if(typeof sendChat==="function")sendChat("My program has these coverage gaps: "+gaps.join("; ")+". Add the single best exercise for each into the most appropriate day of my current program, grouped with its muscle, keeping weekly volume sensible. Use replace/add actions — don't rebuild the whole program.");
}

/* A missed workout is offered as an explicit overlay for today. It never rewrites the
   saved weekdays and is never silently accepted. */
function rollingWorkoutIndex(){
  const h=(state.workoutHistory||[]).find(x=>x.programId===activeProg&&x.dayKey);
  if(!h)return 0;
  const i=PROGRAM.findIndex(d=>d.key===h.dayKey);
  return i<0?0:(i+1)%PROGRAM.length;
}
function scheduleOverrideIndex(){
  const ov=(state.scheduleOverrides||{})[todayStr()];
  if(!ov||ov.programId!==activeProg)return -1;
  return PROGRAM.findIndex(d=>d.key===ov.dayKey);
}
function datedScheduleOverrideIndex(){
  const ov=(state.calendarPlanOverrides||{})[todayStr()];
  if(!ov||ov.programId!==activeProg)return null;
  if(ov.rest)return -1;
  const i=PROGRAM.findIndex(d=>d.key===ov.dayKey);
  return i<0?null:i;
}
function effectiveDayIndex(wd){
  if(wd===todayWeekday()){
    const dated=datedScheduleOverrideIndex();if(dated!==null)return dated;
    const oi=scheduleOverrideIndex();if(oi>=0)return oi;
  }
  return dayForWeekday(wd);
}
function smartScheduleRecommendation(wd){
  wd=wd||todayWeekday();
  const scheduled=dayForWeekday(wd),override=scheduleOverrideIndex();
  if(wd!==todayWeekday())return {scheduled:scheduled,effective:scheduled,suggested:-1,repair:false,reason:"Selected date"};
  const dated=datedScheduleOverrideIndex();
  if(dated!==null)return {scheduled:scheduled,effective:dated,suggested:-1,repair:false,overridden:true,
    reason:dated<0?"This date was set as a recovery day for this week only.":"This workout was rescheduled for today without changing the permanent program."};
  if(override>=0)return {scheduled:scheduled,effective:override,suggested:override,repair:false,overridden:true,reason:"Catch-up workout chosen for today"};
  const latest=(state.workoutHistory||[]).find(x=>x.programId===activeProg&&x.dayKey),next=rollingWorkoutIndex();
  const completedToday=(state.workoutHistory||[]).some(x=>x.date===todayStr()&&x.programId===activeProg);
  if(!latest||smartDateAge(latest.date)>7||completedToday||next===scheduled){
    return {scheduled:scheduled,effective:scheduled,suggested:-1,repair:false,reason:scheduled>=0?"On schedule":"Recovery day"};
  }
  const nextRec=dayRecovery(next).score,scheduledRec=scheduled>=0?dayRecovery(scheduled).score:0;
  let reason=scheduled<0?"You have an unfinished workout in the rolling queue.":"Your last completed workout leaves a different session next in sequence.";
  if(nextRec<45)reason+=" Its target muscles are still fatigued, so recovery may be better.";
  else if(scheduled>=0&&nextRec>scheduledRec+15)reason+=" The catch-up session is also better recovered.";
  return {scheduled:scheduled,effective:scheduled,suggested:next,repair:true,reason:reason,recovery:nextRec};
}
function acceptScheduleRepair(di){
  if(di<0||!PROGRAM[di])return;
  state.scheduleOverrides=state.scheduleOverrides||{};
  state.scheduleOverrides[todayStr()]={programId:activeProg,dayKey:PROGRAM[di].key,createdAt:new Date().toISOString()};
  recordRecommendationEvent("schedule_accept",{dayKey:PROGRAM[di].key});
  save();selWeekday=todayWeekday();renderPlan();toast(PROGRAM[di].title+" set for today");
}
function clearScheduleRepair(){
  if(state.scheduleOverrides)delete state.scheduleOverrides[todayStr()];
  recordRecommendationEvent("schedule_keep",{weekday:todayWeekday()});
  save();renderPlan();toast("Original schedule restored");
}

/* Exact load / rep / set / RIR prescription. It can consume completed sets from the
   active workout, so the next-set advice changes immediately instead of waiting for
   the next finished session. */
function smartConfidence(history,hasRir,outcomeEvidence){
  const n=(history||[]).length,learn=outcomeEvidence&&typeof outcomeEvidence==="object"?outcomeEvidence:null;
  const outcomes=learn?(+learn.count||0):(+outcomeEvidence||0);
  const rich=(history||[]).filter(x=>smartHistorySets(x).some(s=>s.rich)).length;
  const evidenceScore=smartClamp((n>=6?66:n>=3?54:n?34:18)+(hasRir?14:0)+Math.min(12,rich*2)+Math.min(10,outcomes*2),0,94);
  let score=evidenceScore,calibrated=false;
  if(learn&&outcomes>=2&&learn.calibrationScore!=null){
    /* Once actual-vs-predicted error exists, confidence is calibrated by accuracy rather
       than rising merely because more sessions were logged. Early samples are blended
       gently; six outcomes can carry most of the decision. */
    const weight=Math.min(.68,.18+outcomes*.085);
    score=smartClamp(Math.round(evidenceScore*(1-weight)+learn.calibrationScore*weight),0,96);
    calibrated=true;
  }
  const spread=score>=75?7:score>=48?13:21;
  return {
    score:score,level:score>=75?"high":score>=48?"medium":"low",
    label:score>=75?(calibrated?"High - calibrated":"High confidence"):score>=48?(calibrated?"Calibrating well":"Learning"):n?"Early estimate":"Calibration needed",
    range:{low:smartClamp(score-spread,0,100),high:smartClamp(score+spread,0,100)},
    uncertainty:spread,evidence:{sessions:n,richSessions:rich,outcomes:outcomes,hasRir:!!hasRir,
      calibrated:calibrated,calibrationErrorPct:learn&&learn.calibrationErrorPct!=null?learn.calibrationErrorPct:null,
      calibrationScore:learn&&learn.calibrationScore!=null?learn.calibrationScore:null}
  };
}
function smartRoundLoad(opt,kg){
  if(kg==null||!isFinite(kg)||kg<=0)return null;
  let out=roundStep(kg,typeof eqStepKg==="function"?eqStepKg(opt):2.5);
  if(typeof snapKgToExercise==="function"){const s=snapKgToExercise(opt,out);if(s!=null)out=s;}
  return out;
}
function smartAllSetProgression(opt,history,rule){
  history=history||[];rule=rule||smartConfiguredRule(opt);
  const last=history.length?history[history.length-1]:null,assessment=smartSetAssessment(opt,last);
  const step=typeof eqStepKg==="function"?eqStepKg(opt):2.5,lo=assessment.lo,hi=assessment.hi,planned=assessment.planned;
  let kg=assessment.mainLoad||(last&&+last.w)||null,decision="calibrate",earned=false,why="No reliable load history yet - start with a feel-out set.";
  const repTargets=[];
  if(last){
    if(rule==="fixed"){decision="fixed";why="Fixed-load rule: keep the load and improve reps, RIR or control.";}
    else if(rule==="body"){decision="body";why="Bodyweight/timed rule: progress reps, seconds, range or tempo before external load.";}
    else if(!assessment.rich&&!Array.isArray(last.s)){
      /* A legacy top-set record cannot prove that every set earned a load increase.
         It remains readable, but never earns progression by itself. */
      kg=last.w||kg;decision="legacy";
      why="Older history has no complete set list. Keep the load once, record every set and RIR, then progress from complete evidence.";
    }else if(rule==="topback"){
      const top=assessment.sets[0],backs=assessment.sets.slice(1,planned);
      earned=!!(assessment.full&&assessment.allRirKnown&&top&&top.r>=hi&&top.rir>=1&&backs.every(s=>s.r>=lo&&s.rir>=1));
      if(earned){kg=(top.w||kg)+step;decision="increase";why="Top set reached the ceiling and every back-off set stayed in range.";}
      else if(assessment.hardMiss){kg=kg?kg*.95:kg;decision="reduce";why="A prescribed set missed the range at 0-1 RIR - reduce 5% and rebuild.";}
      else {decision="hold";why=assessment.full&&!assessment.allRirKnown?"Keep the load and record RIR on every working set before progressing.":"Keep the top load until the top set and every back-off set meet their targets.";}
    }else{
      /* Double progression is earned only by the complete working-set prescription.
         One excellent top set can no longer hide two missed back-off sets. */
      earned=assessment.full&&assessment.allAtTop&&assessment.allRirKnown&&!assessment.failure&&assessment.minRir>=1&&assessment.sameLoad;
      if(earned){kg=kg?kg+step:kg;decision="increase";why="All "+planned+" working sets reached "+hi+" reps with at least 1 RIR - load earned.";}
      else if(assessment.hardMiss){kg=kg?kg*.95:kg;decision="reduce";why="At least one working set fell below "+lo+" reps at 0-1 RIR - reduce 5%.";}
      else if(!assessment.full){decision="hold";why="Keep the load: only "+assessment.sets.length+" of "+planned+" prescribed sets were logged.";}
      else if(!assessment.sameLoad){kg=Math.min.apply(null,assessment.sets.slice(0,planned).map(s=>s.w).filter(Boolean));decision="hold";why="Working-set loads varied. Repeat the lowest common load across every set before progressing.";}
      else if(!assessment.allRirKnown){decision="hold";why="Keep the load and record RIR on every working set before progressing.";}
      else {decision="hold";why="Keep the load and add reps until every working set reaches "+hi+".";}
    }
    for(let i=0;i<planned;i++){
      const prior=assessment.sets[i]||assessment.sets[assessment.sets.length-1];
      repTargets.push(decision==="increase"?lo:smartClamp(prior&&prior.r?prior.r+(prior.r<hi?1:0):lo,lo,hi));
    }
  }else for(let i=0;i<planned;i++)repTargets.push(lo);
  return {kg:kg,rule:rule,decision:decision,earned:earned,why:why,assessment:assessment,repTargets:repTargets};
}
function smartLoadConfidenceRange(opt,kg,confidence){
  if(kg==null)return {low:null,high:null,label:"Needs calibration"};
  const step=typeof eqStepKg==="function"?eqStepKg(opt):2.5,steps=confidence.level==="high"?1:confidence.level==="medium"?2:3;
  const low=smartRoundLoad(opt,Math.max(step,kg-step*steps)),high=smartRoundLoad(opt,kg+step*steps);
  return {low:low,high:high,label:toDisp(low)+"-"+toDisp(high)+" "+unit};
}
function smartAnchorStatus(slotHint,opt){
  const meta=smartExerciseMetadata(opt,slotHint&&slotHint.muscle),eligible=!!meta.anchorEligible;
  if(!eligible||!slotHint||slotHint.di==null||slotHint.ei==null)return {eligible:eligible,tracked:false,week:0,minWeeks:4,maxWeeks:8,canRotate:true};
  const key=id(slotHint.di,slotHint.ei),row=state.exerciseAnchors&&state.exerciseAnchors[key];
  const same=row&&((row.exerciseId&&meta.exerciseId&&row.exerciseId===meta.exerciseId)||String(row.name||"").toLowerCase()===String(opt.n||"").toLowerCase());
  const since=same&&row.since?row.since:smartMesocycleStatus().start;
  const days=Math.max(0,Math.floor((Date.now()-new Date(since+"T12:00:00").getTime())/864e5)),week=Math.max(1,Math.floor(days/7)+1);
  return {
    eligible:true,tracked:!!same,key:key,name:opt.n,since:since,week:week,minWeeks:4,maxWeeks:8,
    canRotate:week>=4,review:week>=8,
    message:week<4?"Anchor week "+week+"/4 - keep it stable unless pain or equipment requires a change.":
      week>=8?"Anchor week "+week+" - review it, but keep it while performance is moving.":"Anchor week "+week+"/8 - stable comparison movement."
  };
}
function recordSmartAnchor(slotHint,opt,reason){
  const status=smartAnchorStatus(slotHint,opt);
  if(!status.eligible||!slotHint)return status;
  const key=id(slotHint.di,slotHint.ei),identity=smartExerciseIdentity(opt.n,opt.libId||opt.id);
  state.exerciseAnchors=state.exerciseAnchors||{};
  const prev=state.exerciseAnchors[key],same=prev&&((prev.exerciseId&&identity.exerciseId&&prev.exerciseId===identity.exerciseId)||String(prev.name||"").toLowerCase()===String(opt.n||"").toLowerCase());
  if(!same)state.exerciseAnchors[key]={
    name:opt.n,exerciseId:identity.exerciseId,libId:identity.libId,since:todayStr(),
    programId:activeProg,dayKey:PROGRAM[slotHint.di]&&PROGRAM[slotHint.di].key,reason:reason||"program anchor"
  };
  return smartAnchorStatus(slotHint,opt);
}
function resetSmartAnchorForSlot(slotKey,opt,reason){
  if(!slotKey||!opt)return;
  const identity=smartExerciseIdentity(opt.n,opt.libId||opt.id);
  state.exerciseAnchors=state.exerciseAnchors||{};
  state.exerciseAnchors[slotKey]={
    name:opt.n,exerciseId:identity.exerciseId,libId:identity.libId,since:todayStr(),
    programId:activeProg,reason:reason||"future substitution"
  };
}
function smartPreferredAnchorCandidate(mus,pool){
  const candidates=[];
  PROGRAM.forEach((day,di)=>day.ex.forEach((e,ei)=>{
    if(e.m!==mus)return;
    const opt=curOpt(di,ei),status=smartAnchorStatus({di:di,ei:ei,muscle:e.m},opt);
    if(!status.eligible||status.review||smartExercisePlateau(opt.n).declining)return;
    const identity=smartExerciseIdentity(opt.n,opt.libId||opt.id);
    const hit=(pool||[]).find(x=>(identity.exerciseId&&smartExerciseIdentity(x.n,x.id).exerciseId===identity.exerciseId)||sameEx(x.n,opt.n));
    if(hit)candidates.push({exercise:hit,status:status});
  }));
  candidates.sort((a,b)=>a.status.week-b.status.week);
  return candidates.length?candidates[0]:null;
}
function smartTargetChanges(before,after){
  const out=[],push=(field,label,a,b)=>{if(String(a)!==String(b))out.push({field:field,label:label,before:a,after:b});};
  push("load","Load",before.load,after.load);
  push("reps","Reps",before.reps,after.reps);
  push("sets","Sets",before.sets,after.sets);
  push("rir","RIR",before.rir,after.rir);
  return out;
}
function smartTargetDiffText(target){
  if(!target||!target.changes||!target.changes.length)return "No target change";
  return target.changes.map(x=>x.label+": "+x.before+" -> "+x.after).join(" | ");
}
function capabilityRecommendation(opt,mus,liveSets,slotHint){
  opt=opt||{};mus=mus||opt.m||"";
  const history=exLog(opt.n).slice(-8),last=history.length?history[history.length-1]:null;
  const trend=recentExerciseTrend(opt.n),rec=muscleRecovery(mus),check=typeof readinessScore==="function"?readinessScore():null;
  const lo=repLo(opt.r)||8,hi=repHi(opt.r)||Math.max(lo,12);
  const isolation=typeof isIsolation==="function"?isIsolation(opt):/curl|raise|fly|flye|extension|pushdown|crunch/i.test(opt.n||"");
  const rule=smartConfiguredRule(opt,slotHint),progression=smartAllSetProgression(opt,history,rule);
  const learn=smartExerciseLearning(opt.n),meso=smartMesocycleStatus(),plateau=smartExercisePlateau(opt.n);
  const health=smartHealthSnapshot(),pre=smartPreWorkoutFeedback(),safety=smartSafetyAssessment(pre),feedback=smartFeedbackTrend(mus);
  const metadata=smartExerciseMetadata(opt,mus),anchor=smartAnchorStatus(Object.assign({muscle:mus},slotHint||{}),opt);
  const equipStep=typeof eqStepKg==="function"?eqStepKg(opt):2.5;
  const plannedSets=targetSets(opt.r)||3,baseRir=isolation?1:2,baseKg=smartRoundLoad(opt,(progression.assessment&&progression.assessment.mainLoad)||(last&&+last.w)||progression.kg);
  let sets=plannedSets,rir=baseRir,kg=progression.kg;
  const reasons=[progression.why],pref=exercisePreference(opt.n);
  if(learn.count>=2&&learn.biasPct<0&&progression.decision!=="reduce"){
    kg=kg?Math.max(equipStep,kg-equipStep):kg;rir=Math.max(rir,2);reasons.push("Your recent target outcomes were consistently harder than predicted.");
  }else if(learn.count>=2&&learn.biasPct>0){
    rir=Math.max(1,rir-1);reasons.push("Recent targets were consistently easier than predicted, so the effort target is tighter.");
  }
  if(trend&&trend.count>=3&&trend.e1Change<=-5&&progression.decision!=="reduce"){kg=kg?kg*.975:kg;rir=Math.max(rir,3);reasons.push("Recent estimated strength is down.");}
  if(rec.score<40){kg=kg?kg*.9:kg;sets=Math.max(2,sets-1);rir=3;reasons.push(mus+" recovery is only "+rec.score+"%.");}
  else if(rec.score<60){kg=kg?kg*.95:kg;sets=Math.max(2,sets-(isolation?1:0));rir=Math.max(rir,2);reasons.push(mus+" is still recovering ("+rec.score+"%).");}
  if(check!=null&&check<=2){kg=kg?kg*.95:kg;sets=Math.max(2,sets-1);rir=3;reasons.push("Today's readiness check is low.");}
  if(feedback.count>=2&&feedback.fatigue>=4){
    sets=Math.max(2,sets-1);rir=Math.max(rir,2);reasons.push("Your recent post-workout checks show high fatigue.");
  }
  if(feedback.count&&feedback.jointPain>=3){
    rir=Math.max(rir,3);reasons.push("Recent sessions included joint discomfort; use only a comfortable range.");
  }
  if(safety.level==="modify"){
    kg=kg?kg*.95:kg;sets=Math.max(2,sets-1);rir=Math.max(rir,3);reasons.unshift(safety.reason+" "+safety.guidance);
  }
  if(health.scoreModifier<0){rir=Math.max(rir,2);reasons.push(health.reason);}
  if(meso.deload){
    kg=kg?kg*meso.loadFactor:kg;sets=Math.max(2,Math.ceil(sets*meso.setFactor));rir=Math.max(rir,meso.rirFloor);
    reasons.unshift(meso.reason);
  }else if(plateau.plateau){
    reasons.push("Output has plateaued across "+plateau.count+" tracked sessions; finish the rep goal before adding load.");
  }
  const wk=smartWeeklyMuscleSets();
  const limits=typeof PLAN_TARGETS!=="undefined"&&PLAN_TARGETS[mus]?PLAN_TARGETS[mus]:[8,18];
  if((wk[mus]||0)>=limits[1]){sets=Math.max(2,sets-1);rir=Math.max(2,rir);reasons.push("Weekly "+mus.toLowerCase()+" volume is already high.");}
  else if(meso.phase==="OVERLOAD"&&rec.score>=80&&learn.count>=2&&learn.successRate>=75&&(wk[mus]||0)<limits[0]){
    sets=Math.min(sets+1,(targetSets(opt.r)||3)+1);reasons.push("Good recovery and successful targets support one evidence-based overload set.");
  }
  const live=typeof requiredSets==="function"?requiredSets(liveSets||[]).filter(s=>s.done):[];
  if(live.length){
    const s=live[live.length-1],step=typeof eqStepKg==="function"?eqStepKg(opt):2.5;
    if(s.w)kg=s.w;
    if(s.rir===0&&s.r<lo){kg=kg?kg*.95:kg;reasons.unshift("Last set hit failure below range - reduce the next set.");}
    else if(s.rir!=null&&s.rir>=4&&s.r>=hi&&live.length===1){kg=kg?kg+step:kg;reasons.unshift("The first live set was clearly underloaded - add the smallest load.");}
    else if(s.r>=lo)reasons.unshift("Live set is on target - keep the load and repeat clean reps.");
  }
  if(pref==="never")reasons.unshift("You marked this exercise Never - swap it before starting.");
  else if(pref==="less")reasons.push("You asked to see this exercise less often.");
  kg=smartRoundLoad(opt,kg);
  if(safety.hold){kg=null;sets=plannedSets;rir=Math.max(3,rir);reasons.unshift(safety.reason+" "+safety.guidance);}
  const hasRir=history.some(x=>smartHistorySets(x).some(s=>s.rir!=null)),conf=smartConfidence(history,hasRir,learn),reps=lo===hi?String(lo):(lo+"-"+hi);
  const loadText=safety.hold?"No automatic load":kg!=null?(toDisp(kg)+" "+unit):(/body|none/i.test(opt.eq||"")?"Bodyweight":"Calibrate first");
  const repTargets=(progression.repTargets||[]).slice(0,sets);
  while(repTargets.length<sets)repTargets.push(lo);
  const loadTargetsKg=[];
  for(let i=0;i<sets;i++)loadTargetsKg.push(kg==null?null:smartRoundLoad(opt,rule==="topback"&&i>0?kg*.9:kg));
  const loadRange=smartLoadConfidenceRange(opt,kg,conf);
  const before={
    loadKg:baseKg,load:baseKg!=null?(toDisp(baseKg)+" "+unit):(/body|none/i.test(opt.eq||"")?"Bodyweight":"Uncalibrated"),
    reps:reps,sets:plannedSets,rir:baseRir
  };
  const after={loadKg:kg,load:loadText,reps:reps,sets:sets,rir:rir};
  const changes=smartTargetChanges(before,after);
  const identity=smartExerciseIdentity(opt.n,opt.libId||opt.id);
  return {
    name:opt.n,exerciseId:identity.exerciseId,libId:identity.libId,muscle:mus,loadKg:kg,load:loadText,reps:reps,sets:sets,rir:rir,
    target:sets+" x "+reps+" @ "+loadText+" | "+rir+" RIR",
    advice:loadText+" x "+reps+" | "+sets+" sets | "+rir+" RIR",
    why:reasons[0]||"Matches your current plan and recovery.",reasons:reasons.slice(0,4),
    confidence:conf,recovery:rec.score,recoveryRange:rec.range,preference:pref,live:live.length>0,
    progression:{rule:rule,decision:progression.decision,earned:progression.earned,allSets:progression.assessment},
    repTargets:repTargets,loadTargetsKg:loadTargetsKg,loadRangeKg:loadRange,
    learnedOutcomes:{count:learn.count,successRate:learn.successRate,biasPct:learn.biasPct,
      calibrationErrorPct:learn.calibrationErrorPct,calibrationScore:learn.calibrationScore},
    mesocycle:{week:meso.cycleWeek,totalWeeks:meso.targetWeeks,phase:meso.phase,deload:meso.deload},
    plateau:plateau.plateau,metadata:metadata,anchor:anchor,safety:safety,safetyHold:!!safety.hold,
    before:before,after:after,changes:changes,changed:changes.length>0,
    evidence:{
      historySessions:history.length,richSessions:conf.evidence.richSessions,outcomes:learn.count,
      calibrationErrorPct:learn.calibrationErrorPct,recovery:rec.score,weeklyEffectiveSets:wk[mus]||0,
      preWorkout:pre,postWorkoutTrend:{count:feedback.count,stimulus:feedback.stimulus,fatigue:feedback.fatigue,jointPain:feedback.jointPain},
      healthBaselineDays:health.baseline&&health.baseline.days||0
    }
  };
}
function adaptiveSessionPlan(di){
  const rolled=di<0;
  if(rolled)di=rollingWorkoutIndex();
  if(di<0||!PROGRAM[di])return {dayIndex:-1,mode:"REST",summary:"Recovery day.",items:[],confidence:{level:"low",label:"No session"}};
  const dr=dayRecovery(di),items=[],meso=smartMesocycleStatus(),safety=smartSafetyAssessment();
  let mode=safety.hold?"STOP":meso.deload?"DELOAD":dr.score<48?"RECOVER":dr.score>=80?"BUILD":"CONTROL";
  PROGRAM[di].ex.forEach((e,ei)=>items.push(capabilityRecommendation(curOpt(di,ei),e.m,null,{di:di,ei:ei})));
  const evidence=items.reduce((a,x)=>a.concat(exLog(x.name).slice(-2)),[]);
  const outcomeCount=items.reduce((a,x)=>a+(x.learnedOutcomes&&x.learnedOutcomes.count||0),0);
  const calibrated=items.filter(x=>x.learnedOutcomes&&x.learnedOutcomes.calibrationScore!=null);
  const sessionLearning={count:outcomeCount,calibrationScore:calibrated.length?
    Math.round(calibrated.reduce((a,x)=>a+x.learnedOutcomes.calibrationScore,0)/calibrated.length):null,
    calibrationErrorPct:calibrated.length?
      Math.round(calibrated.reduce((a,x)=>a+(x.learnedOutcomes.calibrationErrorPct||0),0)/calibrated.length*10)/10:null};
  const confidence=smartConfidence(evidence,items.some(x=>x.confidence.evidence&&x.confidence.evidence.hasRir),sessionLearning);
  const changed=items.filter(x=>x.changed).length;
  const summary=(rolled?("Next in your rolling schedule: "+PROGRAM[di].day+" - "+PROGRAM[di].title+". "):"")+
    (mode==="STOP"?safety.reason+" "+safety.guidance:mode==="DELOAD"?meso.reason:mode==="RECOVER"?"Recovery is low: reduce fatigue while keeping useful movement quality.":mode==="BUILD"?"Recovery supports a productive session. Progress only lifts whose complete set prescription earned it.":"Train normally, keep clean reps, and adjust only where the data says to.");
  return {dayIndex:di,mode:mode,summary:summary,items:items,recovery:dr.score,recoveryRange:dr.range,
    changed:changed,confidence:confidence,mesocycle:meso,safety:safety};
}
function saveSmartSession(di,p,accepted){
  p=p||adaptiveSessionPlan(di);
  (p.items||[]).forEach((x,ei)=>{
    if(PROGRAM[di]&&PROGRAM[di].ex[ei])recordSmartAnchor({di:di,ei:ei,muscle:PROGRAM[di].ex[ei].m},curOpt(di,ei),"mesocycle anchor");
  });
  state.smartSession={date:todayStr(),programId:activeProg,dayKey:PROGRAM[di]&&PROGRAM[di].key,mode:p.mode,
    recovery:p.recovery,recoveryRange:p.recoveryRange,mesocycle:p.mesocycle,
    items:p.items,accepted:!!accepted,createdAt:new Date().toISOString()};
  /* Store a compact decision record, not the full prescription objects. Each entry used
     to carry every item verbatim (~5.5 KB), so a 300-entry cap meant ~1.6 MB of state
     that gets serialised on every single save. The live plan already lives in
     state.smartSession; this list only needs to answer "what did it decide, and when". */
  state.coachDecisions=state.coachDecisions||[];
  state.coachDecisions.unshift({date:todayStr(),programId:activeProg,dayKey:PROGRAM[di]&&PROGRAM[di].key,mode:p.mode,
    summary:p.summary,recovery:p.recovery,mesocycle:p.mesocycle&&{week:p.mesocycle.cycleWeek,phase:p.mesocycle.phase},
    accepted:!!accepted,
    items:(p.items||[]).map(x=>({name:x.name,loadKg:x.loadKg,reps:x.reps,sets:x.sets,rir:x.rir,
      decision:x.progression&&x.progression.decision}))});
  state.coachDecisions=state.coachDecisions.slice(0,200);
  recordRecommendationEvent(accepted?"plan_accept":"plan_preview",{dayKey:PROGRAM[di]&&PROGRAM[di].key,mode:p.mode,
    recovery:p.recovery,mesocycle:p.mesocycle&&{week:p.mesocycle.cycleWeek,totalWeeks:p.mesocycle.targetWeeks,phase:p.mesocycle.phase},
    safety:p.safety&&p.safety.level,targets:(p.items||[]).map(x=>({exercise:x.name,exerciseId:x.exerciseId||null,libId:x.libId||null,
      decision:x.progression&&x.progression.decision,rule:x.progression&&x.progression.rule,
      before:x.before,after:x.after,changes:x.changes,confidence:x.confidence&&x.confidence.score}))});
  save();
}
function smartTargetFor(di,ei,liveSets){
  if(di<0||!PROGRAM[di]||!PROGRAM[di].ex[ei])return null;
  return capabilityRecommendation(curOpt(di,ei),PROGRAM[di].ex[ei].m,liveSets,{di:di,ei:ei});
}
function applySmartPrescription(ei,target){
  if(!target||typeof logGetSets!=="function")return false;
  if(target.safetyHold){toast("Smart targets are paused by your safety check");return false;}
  const sets=logGetSets(ei),r=logRec(ei),work=()=>requiredSets(sets);
  r.smartUndo={
    date:todayStr(),exercise:target.name,exerciseId:target.exerciseId||null,
    sets:JSON.parse(JSON.stringify(sets)),targetRir:r.targetRir,smartTargetDate:r.smartTargetDate,
    smartTarget:r.smartTarget?JSON.parse(JSON.stringify(r.smartTarget)):null
  };
  while(work().length<target.sets)sets.push({w:null,r:null,done:false});
  while(work().length>target.sets){
    let ix=-1;
    for(let i=sets.length-1;i>=0;i--){if(!sets[i].done&&!sets[i].drop&&sets[i].type!=="warm"){ix=i;break;}}
    if(ix<0)break;
    sets.splice(ix,1);
  }
  requiredSets(sets).forEach((s,i)=>{if(!s.done){
    const targetLoad=target.loadTargetsKg&&target.loadTargetsKg[i]!=null?target.loadTargetsKg[i]:target.loadKg;
    if(targetLoad!=null)s.w=targetLoad;
    s.r=target.repTargets&&target.repTargets[i]!=null?target.repTargets[i]:(repLo(target.reps)||midReps(target.reps));
  }});
  r.targetRir=target.rir;r.smartTargetDate=todayStr();
  r.smartTarget={loadKg:target.loadKg,reps:target.reps,sets:target.sets,rir:target.rir,
    repTargets:target.repTargets,loadTargetsKg:target.loadTargetsKg,
    rule:target.progression&&target.progression.rule,decision:target.progression&&target.progression.decision,
    before:target.before,after:target.after,changes:target.changes,evidence:target.evidence,confidence:target.confidence};
  recordRecommendationEvent("target_apply",{exercise:target.name,exerciseId:target.exerciseId||null,libId:target.libId||null,
    loadKg:target.loadKg,reps:target.reps,sets:target.sets,rir:target.rir,
    rule:target.progression&&target.progression.rule,decision:target.progression&&target.progression.decision,
    mesocycle:target.mesocycle,before:target.before,after:target.after,changes:target.changes,
    evidence:target.evidence,confidence:target.confidence&&{score:target.confidence.score,label:target.confidence.label,
      calibrationErrorPct:target.confidence.evidence&&target.confidence.evidence.calibrationErrorPct}});
  save();
  return true;
}
function undoSmartPrescription(ei){
  if(typeof logRec!=="function")return false;
  const r=logRec(ei),u=r.smartUndo;
  if(!u||u.date!==todayStr()){toast("No smart target change to undo");return false;}
  r.sets=JSON.parse(JSON.stringify(u.sets||[]));
  if(u.targetRir==null)delete r.targetRir;else r.targetRir=u.targetRir;
  if(u.smartTargetDate==null)delete r.smartTargetDate;else r.smartTargetDate=u.smartTargetDate;
  if(u.smartTarget==null)delete r.smartTarget;else r.smartTarget=JSON.parse(JSON.stringify(u.smartTarget));
  delete r.smartUndo;
  recordRecommendationEvent("target_undo",{exercise:u.exercise,exerciseId:u.exerciseId||null});
  save();if(typeof renderLog==="function")renderLog();toast("Smart target restored");return true;
}
function applySmartWorkout(di,p){
  if(di<0||!PROGRAM[di])return;
  p=p||adaptiveSessionPlan(di);
  if(p.safety&&p.safety.hold){toast("Workout targets are paused by your safety check");return;}
  saveSmartSession(di,p,true);
  curDay=di;logCustom=null;detDlg.close();openLog();
  p.items.forEach((x,ei)=>applySmartPrescription(ei,x));
  renderLog();toast("Smart targets applied - adjust anything that feels wrong");
}
function openWorkoutWithoutSmartTargets(di){
  if(di<0||!PROGRAM[di])return;
  const p=adaptiveSessionPlan(di);
  saveSmartSession(di,p,false);
  curDay=di;logCustom=null;detDlg.close();openLog();
  toast("No smart loads applied - pain and symptoms override the app");
}
/* Every logged workout produces an outcome row, not just the ones where the user tapped
   "apply smart targets". When the plan was not accepted the saved items are still a
   complete prediction of what the engine WOULD have prescribed, so comparing them with
   what actually happened is a free calibration sample (a shadow prediction). Those rows
   are tagged accepted:false and counted at half weight when learning, because the user
   was not trying to hit them. Without this the learning layer never receives any data. */
function recordRecommendationOutcome(detail){
  const ss=state.smartSession;
  if(!ss||ss.date!==todayStr())return;
  const exercises=(detail||[]).map(x=>{
    const identity=smartExerciseIdentity(x.n,x.exerciseId||x.libId);
    const target=(ss.items||[]).find(t=>(identity.exerciseId&&t.exerciseId&&identity.exerciseId===t.exerciseId)||
      String(t.name||"").toLowerCase()===String(x.n||"").toLowerCase())||null;
    const actualSets=smartWorkSets(x);
    const reps=actualSets.map(s=>+s.r||0).filter(Boolean),loads=actualSets.map(s=>+s.w||0).filter(Boolean);
    const rirs=actualSets.map(s=>s.rir).filter(r=>r!=null&&isFinite(+r)).map(Number);
    const lo=target?repLo(target.reps)||0:0,hi=target?repHi(target.reps)||lo:0;
    const avgRir=rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:null;
    const avgLoad=loads.length?loads.reduce((a,b)=>a+b,0)/loads.length:0;
    const bestE1=actualSets.reduce((best,s)=>s.w&&s.r?Math.max(best,s.w*(1+s.r/30)):best,0);
    const expectedReps=target&&target.repTargets&&target.repTargets.length?
      target.repTargets.reduce((a,b)=>a+b,0)/target.repTargets.length:(lo&&hi?(lo+hi)/2:0);
    const expectedE1=target&&target.loadKg&&expectedReps?target.loadKg*(1+expectedReps/30):0;
    const complete=target?actualSets.length>=target.sets:actualSets.length>0;
    const allInRange=!!(target&&complete&&actualSets.slice(0,target.sets).every(s=>(+s.r||0)>=lo&&(+s.r||0)<=hi));
    const allAtTop=!!(target&&complete&&actualSets.slice(0,target.sets).every(s=>(+s.r||0)>=hi));
    let result="under";
    if(target&&complete&&((allAtTop&&(avgRir==null||avgRir>=target.rir))||
      (allInRange&&avgRir!=null&&avgRir>=target.rir+1.5)||
      (allInRange&&target.loadKg&&avgLoad>=target.loadKg*1.04)))result="exceeded";
    else if(target&&complete&&allInRange&&(avgRir==null||Math.abs(avgRir-target.rir)<=1.5))result="met";
    const targetLoad=target&&target.loadKg||0;
    return {
      name:x.n,exerciseId:identity.exerciseId,libId:identity.libId,muscle:x.m,
      target:target?{loadKg:target.loadKg,reps:target.reps,sets:target.sets,rir:target.rir,
        repTargets:target.repTargets,loadTargetsKg:target.loadTargetsKg,
        rule:target.progression&&target.progression.rule,decision:target.progression&&target.progression.decision,
        recovery:target.recovery,recoveryRange:target.recoveryRange,mesocycle:target.mesocycle,
        before:target.before,after:target.after,changes:target.changes,
        confidence:target.confidence&&target.confidence.score,evidence:target.evidence}:null,
      actual:{sets:actualSets.length,reps:reps,avgLoadKg:Math.round(avgLoad*100)/100,
        avgRir:avgRir==null?null:Math.round(avgRir*10)/10,bestE1Kg:Math.round(bestE1*10)/10,
        complete:complete,allInRange:allInRange,allAtTop:allAtTop},
      error:{loadPct:targetLoad?Math.round((avgLoad-targetLoad)/targetLoad*1000)/10:null,
        rir:target&&avgRir!=null?Math.round((avgRir-target.rir)*10)/10:null,
        e1Pct:expectedE1?Math.round((bestE1-expectedE1)/expectedE1*1000)/10:null},
      result:result
    };
  });
  const completed=exercises.filter(x=>x.actual.complete).length,met=exercises.filter(x=>x.result==="met"||x.result==="exceeded").length;
  recordRecommendationEvent("workout_outcome",{
    dayKey:ss.dayKey,mode:ss.mode,createdAt:ss.createdAt,completedAt:new Date().toISOString(),
    accepted:!!ss.accepted,
    adherence:exercises.length?Math.round(completed/exercises.length*100):0,
    targetSuccess:exercises.length?Math.round(met/exercises.length*100):0,
    exercises:exercises
  });
}
function adaptiveBriefHTML(di){
  if(di<0)return "";
  const p=adaptiveSessionPlan(di),i=activeProgramInfo();
  return "<section class='smartBrief ciDecision"+(p.safety&&p.safety.hold?" safetyHold":"")+"'><div class='ciAiMark'>"+(p.safety&&p.safety.hold?"!":"AI")+"</div><div class='ciDecisionCopy'><div class='ciDecisionTop'><b>"+(p.safety&&p.safety.hold?"Safety pause":"Trainer adjustment")+"</b><span>"+esc(p.mode)+"</span></div><p>"+esc(p.summary)+"</p><small>"+p.recovery+"% recovery (likely "+p.recoveryRange.low+"-"+p.recoveryRange.high+"%) | "+p.confidence.label+" | block "+p.mesocycle.cycleWeek+"/"+p.mesocycle.targetWeeks+"</small></div><button data-home='smartplan'>Review</button><button class='ghost ciProgramSource' data-home='programinfo'>"+esc(i.source)+" r"+esc(String(i.revision))+"</button></section>";
}
function smartTargetEvidenceText(x){
  const e=x&&x.evidence||{},bits=[];
  bits.push((e.historySessions||0)+" logged session"+((e.historySessions||0)===1?"":"s"));
  if(e.outcomes)bits.push(e.outcomes+" checked outcome"+(e.outcomes===1?"":"s"));
  if(e.calibrationErrorPct!=null)bits.push("prediction error "+e.calibrationErrorPct+"%");
  bits.push((e.recovery==null?"-":e.recovery)+"% muscle recovery");
  return bits.join(" | ");
}
function openAdaptivePlan(di){
  const p=adaptiveSessionPlan(di);
  document.getElementById("detTitle").textContent="Smart session";
  document.getElementById("detBody").innerHTML="<div class='smartPlanHero'><span>"+esc(p.mode)+"</span><b>"+p.recovery+"% ready</b><p>Likely range "+p.recoveryRange.low+"-"+p.recoveryRange.high+"% | Block week "+p.mesocycle.cycleWeek+"/"+p.mesocycle.targetWeeks+"</p><p>"+esc(p.summary)+"</p></div>"+
    p.items.map((x,ei)=>"<div class='smartTargetRow"+(x.changed?" changed":"")+(x.safetyHold?" safetyHold":"")+"'><div><b>"+esc(x.name)+"</b>"+
      (x.changed?"<small class='smartBeforeAfter'>"+esc(smartTargetDiffText(x))+"</small>":"<small>No numerical change from the base target</small>")+
      "<small>"+esc(x.why)+"</small><small class='smartEvidence'>Evidence: "+esc(smartTargetEvidenceText(x))+"</small>"+
      (x.anchor&&x.anchor.eligible?"<small class='smartAnchor'>"+esc(x.anchor.message)+"</small>":"")+
      (p.safety&&p.safety.modify&&!p.safety.hold?"<button class='ghost smartSafeSwap' data-safe-swap='"+ei+"'>Choose a today-only alternative</button>":"")+
      "</div><div><strong>"+esc(x.load)+" x "+esc(x.reps)+"</strong><small>"+x.sets+" sets | "+x.rir+" RIR</small><small>"+esc(x.confidence.label)+" ("+x.confidence.score+"/100)</small></div></div>").join("")+
    (p.safety&&p.safety.hold?
      "<div class='safetyStop'><b>Smart application is blocked</b><p>"+esc(p.safety.guidance)+"</p><small>This is safety guidance, not a diagnosis.</small></div><div class='btnrow'><button id='closeSmartPlan'>Return to recovery</button></div>":
      "<div class='btnrow'><button id='acceptSmartPlan'>Apply &amp; start</button></div>")+
    "<p class='smartFinePrint'>Every changed target shows its before/after values, evidence and calibrated confidence. After applying, each exercise has an Undo button. Pain and symptoms always override the app.</p>";
  const accept=document.getElementById("acceptSmartPlan");if(accept)accept.onclick=()=>applySmartWorkout(di,p);
  const close=document.getElementById("closeSmartPlan");if(close)close.onclick=()=>{detDlg.close();nav("recovery");};
  document.querySelectorAll("#detBody [data-safe-swap]").forEach(b=>b.onclick=()=>{detDlg.close();openSwapPlan(di,+b.dataset.safeSwap,"today");});
  saveSmartSession(di,p,false);
  detDlg.showModal();
}
function smartMuscleGrowthScorecard(muscle,weeks){
  weeks=smartClamp(Math.round(+weeks||smartMesocycleStatus().targetWeeks||6),4,8);
  const cutDate=new Date();cutDate.setDate(cutDate.getDate()-(weeks*7-1));
  const cut=localDateStr(cutDate),workouts=(state.workoutHistory||[]).filter(w=>w&&w.date>=cut&&smartWorkoutMuscleDose(w,muscle)>0);
  let effectiveSets=0,actualSets=0,plannedSets=0;
  workouts.forEach(w=>{
    effectiveSets+=smartWorkoutMuscleDose(w,muscle);
    if(Array.isArray(w.detail))w.detail.forEach(d=>{
      const credit=smartMuscleContributions(d.n,d.m)[muscle]||0;if(!credit)return;
      actualSets+=smartWorkSetCount(d)*credit;
      plannedSets+=(+d.plannedSets||targetSets(d.target||"")||0)*credit;
    });
  });
  const perExercise={};
  Object.keys(state.history||{}).forEach(k=>(state.history[k]||[]).forEach(x=>{
    if(!x||x.d<cut||(smartMuscleContributions(x.n||k,x.m)[muscle]||0)<.7)return;
    const score=+x.e||+x.r||0;if(!score)return;
    const identity=x.exerciseId||smartExerciseIdentity(x.n||k,x.libId).exerciseId||k;
    (perExercise[identity]=perExercise[identity]||[]).push({d:x.d,score:score});
  }));
  const trends=Object.keys(perExercise).map(k=>{
    const a=perExercise[k].sort((x,y)=>String(x.d).localeCompare(String(y.d)));if(a.length<2||!a[0].score)return null;
    return smartClamp((a[a.length-1].score-a[0].score)/a[0].score*100,-30,30);
  }).filter(x=>x!=null);
  const trend=trends.length?Math.round(trends.reduce((a,b)=>a+b,0)/trends.length*10)/10:null;
  const feedback=smartFeedbackTrend(muscle),weekly=Math.round(effectiveSets/weeks*10)/10;
  const target=typeof PLAN_TARGETS!=="undefined"&&PLAN_TARGETS[muscle]?PLAN_TARGETS[muscle]:[8,18];
  const adherence=plannedSets?Math.round(actualSets/plannedSets*100):null;
  const enoughVolume=weekly>=target[0]*.75&&weekly<=target[1]*1.1;
  const highFatigue=feedback.count>=2&&feedback.fatigue>=4;
  const jointFlag=feedback.count&&feedback.jointPain>=3;
  let status="Learning",working=null,action="Keep the same exercises and log every working set and RIR.";
  if(jointFlag){status="Protect";working=false;action="Use pain-free alternatives and seek qualified help if discomfort persists or worsens.";}
  else if(highFatigue&&trend!=null&&trend<1){status="Recover";working=false;action="Hold volume and load for one week; improve recovery before adding work.";}
  else if(trend!=null&&trend>=1.5&&enoughVolume&&(adherence==null||adherence>=70)){status="Working";working=true;action="Keep the current dose and anchors; progress reps before load.";}
  else if(weekly<target[0]*.75){status="Under-dosed";working=false;action=adherence!=null&&adherence<70?"Complete more of the planned sets before adding volume.":"Add at most one weekly set after a well-recovered session.";}
  else if(trend!=null&&trend<=-3){status="Regressing";working=false;action="Review fatigue, technique and recovery; do not automatically add volume.";}
  else if(trend!=null&&Math.abs(trend)<1&&workouts.length>=Math.max(4,weeks)){status="Plateau";working=false;action="Change one variable only: rep target, load step or one exercise after the anchor review.";}
  else if(trend!=null){status="Probably working";working=true;action="Keep the plan stable until the block has enough comparable sessions.";}
  if(feedback.count>=2&&feedback.stimulus<=2&&feedback.fatigue>=4){
    status="Low return";working=false;action="Improve exercise fit or execution; more sets are unlikely to fix low stimulus plus high fatigue.";
  }
  const confidenceScore=smartClamp(Math.round(18+Math.min(42,workouts.length*6)+Math.min(24,trends.length*8)+Math.min(16,feedback.count*4)),0,96);
  return {
    muscle:muscle,weeks:weeks,status:status,isWorking:working,action:action,
    effectiveSets:Math.round(effectiveSets*10)/10,weeklySets:weekly,targetWeekly:target.slice(),
    sessions:workouts.length,adherence:adherence,strengthTrendPct:trend,
    stimulus:feedback.stimulus,fatigue:feedback.fatigue,jointPain:feedback.jointPain,
    confidence:{score:confidenceScore,label:confidenceScore>=75?"High":confidenceScore>=48?"Learning":"Low"},
    evidence:[
      workouts.length+" relevant session"+(workouts.length===1?"":"s")+" in "+weeks+" weeks",
      weekly+" effective sets/week",
      trend==null?"strength trend not ready":((trend>=0?"+":"")+trend+"% comparable performance trend"),
      adherence==null?"planned-set adherence unavailable":adherence+"% planned-set adherence",
      feedback.count?feedback.count+" post-workout check"+(feedback.count===1?"":"s"):"no post-workout checks yet"
    ]
  };
}
function smartMuscleGrowthScorecards(weeks){
  const span=smartClamp(Math.round(+weeks||smartMesocycleStatus().targetWeeks||6),4,8);
  return SMART_MUSCLES.map(m=>smartMuscleGrowthScorecard(m,span));
}
function trainerContextSnapshot(di){
  if(di==null){const wd=selWeekday||todayWeekday();di=effectiveDayIndex(wd);}
  const rec=allMuscleRecovery(),p=di>=0?adaptiveSessionPlan(di):null,sch=smartScheduleRecommendation(todayWeekday()),meso=smartMesocycleStatus();
  const decisions=(state.recommendationEvents||[]).slice(0,8).map(ev=>{
    if(ev.type!=="workout_outcome")return {date:ev.date,type:ev.type,data:ev.data};
    return {date:ev.date,type:ev.type,adherence:ev.data&&ev.data.adherence,targetSuccess:ev.data&&ev.data.targetSuccess,
      exercises:(ev.data&&ev.data.exercises||[]).map(x=>({exercise:x.name,result:x.result,
        reps:x.actual&&x.actual.reps,avgRir:x.actual&&x.actual.avgRir,error:x.error}))};
  });
  return {
    date:todayStr(),readiness:state.readiness&&state.readiness.date===todayStr()?state.readiness:null,
    preWorkoutFeedback:smartPreWorkoutFeedback(),safety:smartSafetyAssessment(),postWorkoutTrend:smartFeedbackTrend(),
    overallRecovery:overallRecovery(),healthConnect:smartHealthSnapshot(),muscleRecovery:SMART_MUSCLES.map(m=>({muscle:m,score:rec[m].score,
      range:rec[m].range,confidence:rec[m].confidence,recoveryDays:rec[m].recoveryDays,predictionError:rec[m].predictionError})),
    mesocycle:meso,muscleGrowthScorecards:smartMuscleGrowthScorecards(meso.targetWeeks),
    weeklySets:typeof weeklyMuscleSets==="function"?weeklyMuscleSets():{},effectiveWeeklySets:smartWeeklyMuscleSets(),
    schedule:{scheduled:sch.scheduled>=0?PROGRAM[sch.scheduled].title:"Rest",suggested:sch.suggested>=0?PROGRAM[sch.suggested].title:null,reason:sch.reason},
    session:p?{day:PROGRAM[di].day,title:PROGRAM[di].title,mode:p.mode,recovery:p.recovery,recoveryRange:p.recoveryRange,
      targets:p.items.map(x=>({exercise:x.name,load:x.load,loadRange:x.loadRangeKg,reps:x.reps,repTargets:x.repTargets,
        exerciseId:x.exerciseId,libId:x.libId,sets:x.sets,rir:x.rir,why:x.why,reasons:x.reasons,
        before:x.before,after:x.after,changes:x.changes,evidence:x.evidence,metadata:x.metadata,anchor:x.anchor,safety:x.safety,
        confidence:x.confidence.level,confidenceScore:x.confidence.score,confidenceRange:x.confidence.range,
        progression:x.progression&&{rule:x.progression.rule,decision:x.progression.decision,earned:x.progression.earned,
          allSetsAtTop:x.progression.allSets&&x.progression.allSets.allAtTop,
          allRirKnown:x.progression.allSets&&x.progression.allSets.allRirKnown},
        learnedOutcomes:x.learnedOutcomes,mesocycle:x.mesocycle}))}:null,
    recentWorkouts:(state.workoutHistory||[]).slice(0,6).map(x=>({date:x.date,title:x.title,sets:x.sets,feel:x.feel,note:x.note,muscles:x.m})),
    preferences:state.exercisePreferences||{},recentDecisions:decisions,
    // Region-level gaps the program doesn't train yet (incl. missing stretch-loaded work),
    // each with the best library exercise to fill it — so the coach recommends specifics.
    coverageGaps:(typeof smartCoverageGaps==="function"?smartCoverageGaps():[]).slice(0,8).map(g=>{
      const b=typeof smartBestForGap==="function"?smartBestForGap(g):null;
      return {muscle:g.muscle,missing:g.label,stretch:g.stretch,priority:g.priority,bestFit:b?b.n:null};
    }),
    /* Learned, measured-from-this-user signals. Given to the coach so it argues from the
       user's own response data instead of restating textbook volume guidance. */
    volumeResponse:SMART_MUSCLES.map(m=>{
      const r=smartVolumeResponse(m);
      return r.weeks<4?null:{muscle:m,recentSets:r.recentSets,bestSets:r.bestSets,
        correlation:r.corr,advice:r.direction,confidence:r.confidence};
    }).filter(Boolean),
    exerciseVariability:smartVariability(),
    commitmentWatch:(PROGRAM[di]?PROGRAM[di].ex:[]).map((e,ei)=>{
      const n=curOpt(di,ei).n,c=smartCommitmentStatus(n);
      return (c.progressing||c.underEvaluated||c.earnedSwap)?
        {exercise:n,sessions:c.sessions,trendPct:c.slopePct,
         status:c.progressing?"progressing - keep":c.underEvaluated?"needs a fair trial":"stalled after fair trial"}:null;
    }).filter(Boolean)
  };
}
