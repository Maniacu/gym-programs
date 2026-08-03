/* Today tab: the home hero, week calendar, muscle freshness, workout preview, and the
 * handful of dialogs launched from here (readiness check, shape goals, weekly review). */
const FULLDAY={MON:"Monday",TUE:"Tuesday",WED:"Wednesday",THU:"Thursday",FRI:"Friday",SAT:"Saturday",SUN:"Sunday"};
const SHAPE_GOALS=[
  ["upperChest","Upper chest","Chest"],
  ["vTaper","V-taper","Back"],
  ["traps","Traps/frame","Back"],
  ["wideDelts","Wider shoulders","Shoulders"],
  ["arms","Arms","Biceps"],
  ["core","Tighter core","Core"]
];

function weekDates(){ const t=new Date(), idx=(t.getDay()+6)%7, mon=new Date(t); mon.setDate(t.getDate()-idx);
  return WDAYS.map((wd,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return {wd:wd,date:d.getDate(),iso:localDateStr(d)}; }); }
/* Only trust a slot's set grid if it was built TODAY (r._sd) — logGetSets() rebuilds
   stale grids lazily when the log view opens, but these home-screen readers run before
   that, and an abandoned session from yesterday otherwise shows as today's progress. */
function dayProgress(di){ if(di<0)return 0; const tdy=todayStr(); let done=0,tot=0; PROGRAM[di].ex.forEach((_,ei)=>{ const r=state.slots[id(di,ei)], ts=targetSets(curOpt(di,ei).r), req=r&&r.sets&&r._sd===tdy?requiredSets(r.sets):null;
  tot+=(req?req.length:ts); done+=(req?req.filter(x=>x.done).length:0); }); return tot?Math.round(done/tot*100):0; }
function greeting(){ const h=new Date().getHours(); return h<12?"Good morning":h<18?"Good afternoon":"Good evening"; }
function startDay(di){ const safety=typeof smartSafetyAssessment==="function"?smartSafetyAssessment():null;if(di>=0&&safety&&safety.hold){openAdaptivePlan(di);return;} curDay=di; logCustom=null; if(di>=0)saveSmartSession(di,adaptiveSessionPlan(di),false); openLog(); }
function coach(){ openChat(); }

function resumeSession(){ const t=activeSession(); if(!t){toast("No workout to resume");return;}
  if(t.type==="custom"){ // find by stable id first — the stored index goes stale if a workout was deleted meanwhile
    const cw=state.customWorkouts||[]; let idx=cw.findIndex(w=>w.id&&w.id===t.key); if(idx<0&&cw[t.index]&&!cw[t.index].id)idx=t.index;
    const w=cw[idx]; if(!w){discardSession();toast("Custom workout no longer exists");return;} logCustom=Object.assign({index:idx,key:t.key},w); }
  else { if(t.program&&PROGRAMS[t.program]&&t.program!==activeProg){activeProg=t.program;state.programId=t.program;buildActive();} curDay=Math.min(t.day||0,PROGRAM.length-1); logCustom=null; }
  openLog();
}
function discardSession(){
  const t=activeSession();
  if(t){
    const prefix=t.type==="custom"?(t.key+"_"):((t.program||activeProg)+"_"+t.key+"_");
    const keys=Object.keys(state.slots||{}).filter(k=>k.indexOf(prefix)===0);
    const hasGrid=keys.some(k=>state.slots[k]&&Array.isArray(state.slots[k].sets));
    if(hasGrid&&!confirm("Clear this workout draft and its entered sets? Your exercise swaps and settings will stay."))return;
    keys.forEach(k=>{
      const r=state.slots[k];if(!r)return;
      delete r.sets;delete r._sd;delete r.targetRir;delete r.smartTargetDate;
      if(r.ss&&Array.isArray(r.ss.sets))r.ss.sets.forEach(s=>{s.w=null;s.r=null;s.rir=null;s.done=false;});
    });
  }
  if(state.smartSession&&state.smartSession.date===todayStr())delete state.smartSession;
  localStorage.removeItem("gymSess");save();renderPlan();toast("Workout draft cleared");
}

/* ---------- readiness / phase tracking ---------- */
function readinessScore(){ const r=state.readiness; if(!r||r.date!==todayStr())return null; const pain=r.jointPain!=null?+r.jointPain:6-(+r.joints||3); return Math.round((+r.sleep+(+r.energy)+(6-pain)+(6-(+r.sore)))/4); }
function readinessPlan(){ const safety=typeof smartSafetyAssessment==="function"?smartSafetyAssessment():null;if(safety&&safety.hold)return "Workout paused: review the safety guidance."; const s=readinessScore(); if(!s)return "Check saved"; if(s<=2)return "Low readiness: reduce load 5-10% or skip final isolation."; if(s===3)return "Moderate: keep load, chase clean reps."; return "Good readiness: normal session."; }
function openReadiness(){
  const prev=Object.assign({sleep:3,energy:3,sore:2,jointPain:1,redFlags:[]},state.readiness||{});
  if(prev.jointPain==null)prev.jointPain=6-(+prev.joints||3);
  const opts=[["sleep","Sleep quality","poor","great"],["energy","Energy","empty","strong"],["sore","Muscle soreness","none","very sore"],["jointPain","Joint pain","none","severe"]];
  const flags=[["chest pain","Chest pain or pressure"],["dizziness/fainting","Dizziness or fainting"],["unusual severe breathlessness","Unusual severe breathlessness"],["hot/swollen joint","A hot or swollen joint"]];
  document.getElementById("detTitle").textContent="5-second body check";
  document.getElementById("detBody").innerHTML="<p class='smartFinePrint' style='margin-top:0'>Tap four ratings. This guides a conservative session; it is not a medical diagnosis.</p>"+
    opts.map(o=>"<p style='font-weight:800;margin-bottom:5px'>"+o[1]+" <small style='float:right;color:var(--muted)'>"+o[2]+" -> "+o[3]+"</small></p><div class='readgrid' data-k='"+o[0]+"'>"+[1,2,3,4,5].map(n=>"<button class='"+(+prev[o[0]]===n?"on":"")+"' data-v='"+n+"'>"+n+"</button>").join("")+"</div>").join("")+
    "<details class='safetyFlags'><summary>Stop-training warning signs</summary><p>Select any that are present now.</p>"+flags.map(x=>"<label><input type='checkbox' data-red-flag='"+escAttr(x[0])+"'"+((prev.redFlags||[]).indexOf(x[0])>=0?" checked":"")+"> "+esc(x[1])+"</label>").join("")+
    "<small>Do not start a workout with these symptoms. Seek appropriate medical assessment, urgently for severe or sudden symptoms.</small></details>"+
    "<div class='fld'><label>Body note (optional)</label><input id='readyNote' maxlength='120' value='"+escAttr(prev.note||"")+"' placeholder='Where or what feels different?'></div>"+
    "<div class='btnrow'><button id='rSave'>Save check</button></div>";
  document.querySelectorAll(".readgrid button").forEach(b=>b.onclick=()=>{ const g=b.parentElement; g.querySelectorAll("button").forEach(x=>x.classList.remove("on")); b.classList.add("on"); });
  document.getElementById("rSave").onclick=()=>{ const r={date:todayStr()}; document.querySelectorAll(".readgrid").forEach(g=>{ const on=g.querySelector(".on"); r[g.dataset.k]=on?+on.dataset.v:3; });r.joints=6-r.jointPain;r.redFlags=[...document.querySelectorAll("[data-red-flag]:checked")].map(x=>x.dataset.redFlag);r.note=safeText(document.getElementById("readyNote").value,120); state.readiness=r; if(typeof recordRecommendationEvent==="function")recordRecommendationEvent("pre_workout_feedback",{sleep:r.sleep,energy:r.energy,soreness:r.sore,jointPain:r.jointPain,redFlags:r.redFlags}); save(); detDlg.close(); if(curTab==="recovery")renderRecovery();else renderPlan(); toast(readinessPlan()); };
  detDlg.showModal();
}
function phaseInfo(){
  const first=(state.workoutHistory||[]).slice(-1)[0], start=state.phaseStart||((first&&first.date)||todayStr());
  // persist the derived start the first time it's computed — it used to be assigned
  // without save(), so the phase silently restarted whenever nothing else saved after
  if(state.phaseStart!==start){ state.phaseStart=start; save(); }
  const weeks=Math.max(1,Math.floor((Date.now()-new Date(start+"T00:00:00").getTime())/(7*864e5))+1);
  const mod=((weeks-1)%9)+1;
  if(mod<=4)return {week:weeks,name:"Rebuild",advice:"Clean reps, leave 1-2 reps in reserve, add load slowly."};
  if(mod<=8)return {week:weeks,name:"Grow",advice:"Push hard sets, chase rep PRs, keep form strict."};
  return {week:weeks,name:"Deload",advice:"Cut 30-40% volume or keep loads easy this week."};
}
function shapeGoals(){ return state.shapeGoals||["upperChest","traps","wideDelts"]; }
function openShapeGoals(){
  const cur=shapeGoals();
  document.getElementById("detTitle").textContent="Shape goals";
  document.getElementById("detBody").innerHTML="<p style='color:var(--muted);margin-top:0'>Pick what you want the app to bias when reviewing volume and swaps.</p><div class='goalgrid'>"+SHAPE_GOALS.map(g=>"<button class='goal"+(cur.includes(g[0])?" on":"")+"' data-g='"+g[0]+"'>"+g[1]+"</button>").join("")+"</div><div class='btnrow'><button id='sgsave'>Save</button></div>";
  document.querySelectorAll(".goal").forEach(b=>b.onclick=()=>b.classList.toggle("on"));
  document.getElementById("sgsave").onclick=()=>{state.shapeGoals=[...document.querySelectorAll(".goal.on")].map(b=>b.dataset.g);save();detDlg.close();renderPlan();toast("Goals saved");};
  detDlg.showModal();
}

/* ---------- freshness / weekly review ---------- */
/* Recovery colour for a muscle (Fitbod-style): red = worked today (fatigued), amber =
   1-2 days (recovering), green = 3+ days or never (fresh/ready to train). Feeds the
   body map so freshness reads at a glance, not just as text bars. */
function recoveryColor(mus){ return recoveryColorFor(mus); }
function muscleFreshnessHTML(){
  const MUS=["Chest","Back","Shoulders","Biceps","Triceps","Legs","Core","Rear delts"];
  return bodyHeatmapSVG(MUS,recoveryColor)+
    "<div style='display:flex;gap:14px;justify-content:center;font-size:11px;color:var(--muted);margin:2px 0 12px'><span><span style='display:inline-block;width:9px;height:9px;border-radius:2px;background:#22c55e;vertical-align:-1px'></span> Fresh</span><span><span style='display:inline-block;width:9px;height:9px;border-radius:2px;background:#f0c44a;vertical-align:-1px'></span> Recovering</span><span><span style='display:inline-block;width:9px;height:9px;border-radius:2px;background:#e0573e;vertical-align:-1px'></span> Worked</span></div>"+
    "<div class='heatgrid'>"+MUS.map(m=>{
    const x=muscleRecovery(m),d=daysSinceTrained(m);
    const label=d==null?"No recent data":(d===0?"Trained today":d===1?"1 day ago":d+" days ago");
    const pct=x.score,col=recoveryColorFor(m);
    return "<div class='heat'><div class='top'><span>"+m+"</span><span>"+esc(label)+"</span></div><div class='bar'><div class='fill' style='width:"+pct+"%;background:"+col+"'></div></div></div>";
  }).join("")+"</div>";
}
function readinessText(){ const h=state.workoutHistory||[], last=h[0], wk=weeklyMuscleSets(), high=Object.keys(wk).filter(k=>wk[k]>20); if(!last)return "Ready to build your first streak."; if(high.length)return "High volume: "+high.slice(0,2).join(", ")+". Keep today's effort controlled."; if(last.dur&&last.dur>5400)return "Long last session. Warm up carefully and avoid chasing every set."; return "Good to train. Beat one small target, not everything."; }
function trainerBriefHTML(di){
  const score=readinessScore(), ph=phaseInfo(), day=di>=0?PROGRAM[di]:null, h=state.workoutHistory||[];
  const recent=h.slice(0,3), feels=recent.map(x=>+x.feel||0).filter(Boolean), avgFeel=feels.length?avg(feels):null;
  let mode="Build", note="Progress one exercise today: add a rep with clean form before adding load.";
  if(score!=null&&score<=2){mode="Recover";note="Keep 2-3 reps in reserve, skip intensifiers, and cut one set if performance drops.";}
  else if(ph&&/deload/i.test(ph.name||"")){mode="Deload";note="Use roughly 85-90% of normal load and stop every set well before failure.";}
  else if(avgFeel!=null&&avgFeel<3){mode="Consolidate";note="Recent sessions felt below normal. Match last performance instead of forcing a PR.";}
  else if(score>=4){mode="Push";note="Readiness is high. Choose one main lift for a rep or small-load PR; keep accessories controlled.";}
  const focus=day&&day.ex.length?curOpt(di,0).n:"Recovery";
  return "<section class='trainerBrief'><div class='trainerMark'>AI</div><div class='trainerCopy'><div class='trainerTop'><b>Trainer brief</b><span>"+mode+"</span></div><p>"+esc(note)+"</p><small>Focus: "+esc(focus)+" · "+esc(readinessText())+"</small></div><button data-home='adapt'>Adapt</button></section>";
}
function askTrainerToAdapt(di){
  const day=di>=0?PROGRAM[di]:null, names=day?day.ex.map((_,ei)=>curOpt(di,ei).n).join(", "):"rest day";
  openChat();
  sendChat("Act as my live trainer. Review my readiness, recent workout performance, weekly volume and today's session ("+names+"). Give me a concise session plan: what to push, what to hold back, exact RIR targets, and at most two changes. Do not rebuild my full program unless necessary.");
}
function volumeHeatHTML(){
  const wk=weeklyMuscleSets(), names=["Chest","Back","Shoulders","Biceps","Triceps","Legs","Core","Rear delts"];
  return "<div class='heatgrid'>"+names.map(n=>{ const s=wk[n]||0,p=Math.min(100,Math.round(s/20*100)),c=s<8?"#f0c44a":s<=20?"#22e07c":"#e0573e"; return "<div class='heat'><div class='top'><span>"+n+"</span><span>"+s+" sets</span></div><div class='bar'><div class='fill' style='width:"+p+"%;background:"+c+"'></div></div></div>"; }).join("")+"</div>";
}
function openWeeklyReview(){ const wk=fractionalVolumeAudit(), highs=Object.keys(wk).filter(k=>wk[k]>20), lows=Object.keys(wk).filter(k=>wk[k]>0&&wk[k]<8), h=state.workoutHistory||[]; document.getElementById("detTitle").textContent="Weekly review"; document.getElementById("detBody").innerHTML="<div class='insight'>"+readinessText()+"</div>"+volumeHeatHTML()+"<p style='color:var(--muted)'>Stimulus estimate includes partial credit for assisting muscles.<br>"+(highs.length?"Trim: "+highs.join(", ")+". ":"")+(lows.length?"Build: "+lows.join(", ")+". ":"")+"Workouts this week: "+h.filter(e=>e.date>=localDateStr(new Date(Date.now()-6*864e5))).length+"</p><div class='btnrow'><button onclick='coach();detDlg.close();sendChat(\"Review this week and suggest the smallest useful changes to my program.\")'>Ask Coach</button></div>"; detDlg.showModal(); }

/* ---------- home hero rendering ---------- */
function homePlanSets(day){
  if(!day||!day.ex)return 0;
  const di=PROGRAM.indexOf(day);
  return day.ex.reduce((a,e,ei)=>a+targetSets(di>=0?curOpt(di,ei).r:e.opts[0].r),0);
}
function homeRing(pct,label){
  const p=Math.max(0,Math.min(100,pct||0)), R=31, C=2*Math.PI*R, off=C*(1-p/100);
  return "<div class='homeProgress'><svg viewBox='0 0 74 74'><circle cx='37' cy='37' r='"+R+"' fill='none' stroke='rgba(255,255,255,.14)' stroke-width='7'/><circle cx='37' cy='37' r='"+R+"' fill='none' stroke='var(--accent)' stroke-width='7' stroke-linecap='round' stroke-dasharray='"+C.toFixed(1)+"' stroke-dashoffset='"+off.toFixed(1)+"' transform='rotate(-90 37 37)'/></svg><div class='num'>"+esc(label||p+"%")+"<span>"+(label?"day":"done")+"</span></div></div>";
}
function homeDayDone(di,ei){
  const r=state.slots[id(di,ei)];
  return !!(r&&r.sets&&r._sd===todayStr()&&isExerciseDone(r.sets));
}
function homePhasePill(){
  const s=readinessScore(), ph=phaseInfo();
  if(s)return "Readiness "+s+"/5";
  return ph.name+" week "+ph.week;
}
function homeExercisePreviewLegacy(di,expanded){
  const day=PROGRAM[di], max=expanded?day.ex.length:Math.min(3,day.ex.length);
  let rows="";
  day.ex.slice(0,max).forEach((exo,ei)=>{
    const o=curOpt(di,ei), done=homeDayDone(di,ei), muscle=exFor(o,exo.m), sets=targetSets(o.r);
    rows+="<div class='homeEx2"+(done?" done":"")+"' data-d='"+di+"' data-e='"+ei+"'><div class='homeExNum'>"+(done?"OK":(ei+1))+"</div><img class='homeExThumb' src='"+escAttr(o.img)+"' onerror=\"this.style.visibility='hidden'\"><div class='homeExMid'><div class='nm'>"+esc(o.n)+"</div><div class='meta'>"+sets+" sets · "+esc(o.r)+" · "+esc(muscle)+"</div></div><div class='homeExView'>View</div></div>";
  });
  return rows;
}

function renderPlanLegacy(){
  if(selWeekday==null)selWeekday=todayWeekday();
  const v=document.getElementById("v-plan"), tdy=todayWeekday(), wk=weekDates(), di=dayForWeekday(selWeekday), draft=activeSession(), selectedName=selWeekday===tdy?"Today":(FULLDAY[selWeekday]||"Plan");
  const progName=((PROGRAMS[activeProg]||{}).name||"Program").replace(/^\d-Day\s*/,"");
  const streak=trainingWeekStreak(), streakPill=streak>=1?"<span class='homePill'>"+streak+" week streak</span>":"";
  let h="<div class='home2'><div class='homebar'><div><div class='homehello'>"+esc(greeting())+"</div><div class='hometitle'>"+esc(selectedName)+"</div></div><button class='homeCoach' data-home='coach' style='display:flex;align-items:center;gap:5px'>"+icon('sparkles',15)+"Coach</button></div>";
  if(draft)h+="<div class='homeResume2'><div class='txt'><div class='a'>Workout in progress</div><div class='b'>"+esc(draft.title||"Resume your session")+"</div></div><button class='primary' data-home='resume'>Resume</button><button data-home='clear'>Clear</button></div>";
  if(di>=0){
    const day=PROGRAM[di], pct=dayProgress(di), first=curOpt(di,0), startLabel=draft?"Resume workout":"Start workout";
    h+="<section class='homeHero2'><div class='homeHeroTop'>"+homeRing(pct)+"<div class='homeHeroText'><div class='homeEyebrow'>"+esc(day.day+" | "+progName)+"</div><div class='homeHeroTitle'>"+esc(day.title)+"</div><p class='homeHeroSub'>First up: "+esc(first.n)+"</p><div class='homePills'><span class='homePill'>"+day.ex.length+" exercises</span><span class='homePill'>"+homePlanSets(day)+" sets</span><span class='homePill'>"+esc(homePhasePill())+"</span>"+streakPill+"</div></div></div>"+bodyHeatmapSVG(day.mus)+"<button class='homeStart2' data-home='start' data-di='"+di+"' style='display:flex;align-items:center;justify-content:center;gap:7px'>"+icon('player-play',17)+startLabel+"</button></section>";
  } else {
    /* Rest is still the recommendation, so it keeps the headline. But a rest day you feel
       good on used to dead-end at "Choose workout", which drops you into the full program
       list with no guidance about what today can actually support — so the trainer now
       offers to answer that instead. */
    h+="<section class='homeHero2 rest'><div class='homeHeroTop'>"+homeRing(0,"Rest")+"<div class='homeHeroText'><div class='homeEyebrow'>Recovery day</div><div class='homeHeroTitle'>Rest and rebuild</div><p class='homeHeroSub'>Walk, mobility, easy stretching, and sleep.</p><div class='homePills'><span class='homePill'>No lifting</span><span class='homePill'>"+esc(homePhasePill())+"</span>"+streakPill+"</div></div></div>"+
      "<button class='homeStart2' data-home='restTrain' style='display:flex;align-items:center;justify-content:center;gap:7px'>"+icon('player-play',17)+"Feeling good? Train anyway</button>"+
      "<button class='homeStart2 secondary' data-home='workouts'>Choose workout</button></section>";
  }
  h+="<div class='homeWeek2'>"+wk.map(d=>{ const train=dayForWeekday(d.wd)>=0; return "<div class='homeDay"+(d.wd===selWeekday?" sel":"")+(d.wd===tdy?" today":"")+(train?" train":"")+"' data-wd='"+d.wd+"'><div class='wd'>"+d.wd+"</div><div class='dt'>"+d.date+"</div><div class='pip'></div></div>"; }).join("")+"</div>";
  h+=adaptiveBriefHTML(di);
  if(di>=0){
    const day=PROGRAM[di], expanded=!!state.homeExpanded, hidden=Math.max(0,day.ex.length-3);
    h+="<main class='homeMain2'><div class='homeSectionHead'><div><h3>Today's exercises</h3><p>"+(expanded?day.ex.length:Math.min(3,day.ex.length))+" of "+day.ex.length+" shown</p></div><button class='homeToggle' data-home='editday' data-di='"+di+"'>Edit</button>"+(hidden?"<button class='homeToggle' data-home='toggle'>"+(expanded?"Less":"All "+day.ex.length)+"</button>":"")+"</div><div class='homeExList'>"+homeExercisePreview(di,expanded)+"</div></main>";
  } else {
    h+="<main class='homeMain2'><div class='homeRestBox'>Keep it light today. If you feel fresh, use the workout tab for an optional easy session.</div></main>";
  }
  const actBtn=(k,ic,lb)=>"<button data-home='"+k+"'>"+icon(ic,16)+"<span>"+lb+"</span></button>";
  h+="<div class='homeActions2 compact'>"+actBtn("review","clipboard-check","Weekly review")+actBtn("readiness","heartbeat","Check-in")+actBtn("progress","chart-line","Progress")+"</div></div>";
  v.innerHTML=h;
  v.querySelectorAll(".homeDay").forEach(c=>c.onclick=()=>{selWeekday=c.dataset.wd;renderPlan();});
  v.querySelectorAll(".homeEx2").forEach(r=>r.onclick=()=>openPlanEx(+r.dataset.d,+r.dataset.e));
  v.querySelectorAll("[data-home]").forEach(b=>b.onclick=e=>{
    const act=b.dataset.home;
    if(act==="coach")coach();
    else if(act==="resume")resumeSession();
    else if(act==="clear")discardSession();
    else if(act==="start"){ if(activeSession())resumeSession(); else startDay(+b.dataset.di); }
    else if(act==="workouts")nav("workouts");
    else if(act==="restTrain")openRestDayTrain();
    else if(act==="review")openWeeklyReview();
    else if(act==="readiness")openReadiness();
    else if(act==="goals")openShapeGoals();
    else if(act==="progress")nav("stats");
    else if(act==="toggle"){ state.homeExpanded=!state.homeExpanded; save(); renderPlan(); }
    else if(act==="editday"){ logCustom=null; openDayEditor(+b.dataset.di); }
    else if(act==="bw")openBw();
    else if(act==="cloud")shareBackupCloud();
    else if(act==="adapt")askTrainerToAdapt(di);
    else if(act==="smartplan")openAdaptivePlan(di);
    else if(act==="programinfo")openProgramIdentity();
  });
}

/* ---------- Concept I: focused dark training home ---------- */
function homeEstimateMinutes(day){
  if(!day)return 0;
  return Math.max(20,Math.round((homePlanSets(day)*2.15+day.ex.length*1.6)/5)*5);
}
function homeScheduleRepairHTML(sch){
  if(!sch)return "";
  if(sch.overridden&&sch.effective>=0){
    return "<section class='ciSchedule'><div class='ciScheduleIcon'>↻</div><div><b>Catch-up active</b><p>"+esc(PROGRAM[sch.effective].day+" - "+PROGRAM[sch.effective].title)+" is set for today. Your saved weekdays were not changed.</p></div><button data-home='restore'>Restore</button></section>";
  }
  if(!sch.repair||sch.suggested<0)return "";
  const d=PROGRAM[sch.suggested];
  return "<section class='ciSchedule'><div class='ciScheduleIcon'>AI</div><div><b>Schedule repair available</b><p>"+esc(sch.reason)+"</p><small>Optional: "+esc(d.day+" - "+d.title)+" | "+sch.recovery+"% recovered</small></div><button data-home='repair' data-di='"+sch.suggested+"'>Use</button></section>";
}

/* ---------- one-week calendar controls ----------
   These are dated overlays, so moving a session for a busy week never silently rewrites
   the underlying program weekdays. */
function calendarOverrideFor(iso){
  const x=state.calendarPlanOverrides&&state.calendarPlanOverrides[iso];
  if(!x||x.programId!==activeProg)return null;
  if(x.rest)return {rest:true,index:-1,raw:x};
  const i=PROGRAM.findIndex(d=>d.key===x.dayKey);
  return i<0?null:{rest:false,index:i,raw:x};
}
function calendarDayIndex(wd,iso){
  const over=calendarOverrideFor(iso);if(over)return over.index;
  return dayForWeekday(wd);
}
function selectedWeekDate(){
  const wk=weekDates();
  return wk.find(x=>x.wd===selWeekday)||wk.find(x=>x.wd===todayWeekday())||wk[0];
}
function manualScheduleHTML(iso,over){
  if(!over)return "";
  if(over.rest)return "<section class='ciSchedule manual'><div class='ciScheduleIcon'>PLAN</div><div><b>Moved workout</b><p>This date is now a recovery day for this week only.</p></div><button data-home='clearschedule' data-date='"+escAttr(iso)+"'>Undo</button></section>";
  const d=PROGRAM[over.index];
  return "<section class='ciSchedule manual'><div class='ciScheduleIcon'>PLAN</div><div><b>Rescheduled for this date</b><p>"+esc(d.day+" - "+d.title)+" · your regular program stays unchanged.</p></div><button data-home='clearschedule' data-date='"+escAttr(iso)+"'>Undo</button></section>";
}
function rescheduleSelectedWorkout(targetIso){
  const source=selectedWeekDate(),sourceDi=calendarDayIndex(source.wd,source.iso);
  if(sourceDi<0){toast("Choose a training day first");return;}
  const target=weekDates().find(x=>x.iso===targetIso);if(!target)return;
  const existing=calendarDayIndex(target.wd,target.iso);
  if(target.iso!==source.iso&&existing>=0&&!confirm("Replace the workout currently shown on "+FULLDAY[target.wd]+" for this week?"))return;
  state.calendarPlanOverrides=state.calendarPlanOverrides||{};
  state.calendarPlanOverrides[target.iso]={programId:activeProg,dayKey:PROGRAM[sourceDi].key,movedFrom:source.iso,createdAt:new Date().toISOString()};
  if(target.iso!==source.iso)state.calendarPlanOverrides[source.iso]={programId:activeProg,rest:true,movedTo:target.iso,createdAt:new Date().toISOString()};
  save();detDlg.close();selWeekday=target.wd;renderPlan();toast("Workout moved for this week only");
}
function clearCalendarOverride(iso){
  const x=state.calendarPlanOverrides&&state.calendarPlanOverrides[iso];if(!x)return;
  const linked=x.movedFrom||x.movedTo;
  delete state.calendarPlanOverrides[iso];
  if(linked&&state.calendarPlanOverrides[linked])delete state.calendarPlanOverrides[linked];
  save();if(detDlg.open)detDlg.close();renderPlan();toast("Weekly schedule restored");
}

/* ---------- Build today ----------
   A quick temporary-session builder that uses the smart trainer's existing candidate
   scoring and preferences. Discomfort only excludes obviously provocative patterns;
   it is a movement filter, never an injury diagnosis. */
let _buildToday={minutes:45,focus:"Full body",discomfort:"None",travel:false};
const BUILD_FOCUS={
  "Full body":["Chest","Back","Legs","Shoulders","Core"],
  "Chest":["Chest","Triceps","Shoulders"],
  "Back":["Back","Biceps","Rear delts"],
  "Legs":["Legs","Core"],
  "Shoulders":["Shoulders","Rear delts","Triceps"],
  "Arms":["Biceps","Triceps","Shoulders"]
};
const BUILD_DISCOMFORT={
  None:null,
  Shoulders:/overhead|shoulder press|upright row|behind.{0,8}neck|dips?/i,
  Elbows:/skull|extension|dips?|close.?grip|preacher/i,
  "Lower back":/deadlift|bent.?over|good morning|barbell row|back squat/i,
  Knees:/lunge|split squat|leg extension|sissy|deep squat/i
};
function buildDiscomfortRejects(ex,area){
  if(!area||area==="None")return false;
  const meta=typeof smartExerciseMetadata==="function"?smartExerciseMetadata(ex,libMuscleOf(ex)):null,joints=meta&&meta.joints||[];
  if(area==="Shoulders"&&joints.indexOf("shoulder")>=0)return true;
  if(area==="Elbows"&&joints.indexOf("elbow")>=0)return true;
  if(area==="Knees"&&joints.indexOf("knee")>=0)return true;
  if(area==="Lower back"&&joints.indexOf("spine")>=0)return true;
  const fallback=BUILD_DISCOMFORT[area];
  return !meta||!meta.known?!!(fallback&&fallback.test(ex.n||"")):false;
}
function buildTodayCandidates(){
  const cfg=_buildToday,muscles=BUILD_FOCUS[cfg.focus]||BUILD_FOCUS["Full body"];
  const max=Math.max(3,Math.min(8,Math.round(cfg.minutes/9))),used={},usedPatterns={},out=[];
  for(let pass=0;out.length<max&&pass<3;pass++){
    muscles.forEach(mus=>{
      if(out.length>=max)return;
      let pool=LIB.filter(x=>{
        const k=exerciseKnowledge(x),allowed=profileExerciseAllowed(x),key=x.id||x.n;
        return libMuscleOf(x)===mus&&!used[key]&&k.hypertrophy&&allowed.ok&&k.skill<90&&
          !riskyExercise(x)&&!buildDiscomfortRejects(x,cfg.discomfort)&&(usedPatterns[k.pattern]||0)<2;
      });
      if(cfg.travel)pool=pool.filter(x=>/dumbbell|body|none|band|bench|kettlebell/i.test(x.eq||""));
      if(typeof exercisePreference==="function")pool=pool.filter(x=>exercisePreference(x.n)!=="never");
      if(typeof sortSmartCandidates==="function")pool=sortSmartCandidates(pool,mus,null);
      const anchor=!cfg.travel&&cfg.discomfort==="None"&&typeof smartPreferredAnchorCandidate==="function"?smartPreferredAnchorCandidate(mus,pool):null;
      if(anchor){const ai=pool.indexOf(anchor.exercise);if(ai>0)pool.unshift(pool.splice(ai,1)[0]);}
      const x=pool[0];if(!x)return;
      used[x.id||x.n]=1;const pattern=exerciseMovementPattern(x);usedPatterns[pattern]=(usedPatterns[pattern]||0)+1;
      const baseReps=isIsolation(x)?"10-15":"8-12";
      const smart=typeof capabilityRecommendation==="function"?capabilityRecommendation(Object.assign({},x,{r:"3 x "+baseReps}),mus,null):null;
      const sets=smart&&smart.sets?smart.sets:(out.length<2?3:2);
      const reps=smart&&smart.reps?smart.reps:baseReps;
      out.push({m:mus,opts:[{libId:x.id,n:x.n,r:sets+" x "+reps,cue:x.cue,img:x.img,eq:x.eq}],smartFit:x.smartFit||null,
        anchor:anchor&&anchor.exercise===x?anchor.status:null});
    });
  }
  return out.slice(0,max);
}
function buildTodayPreviewHTML(list){
  return "<div class='buildPreview'><div class='buildPreviewHead'><span>SESSION PREVIEW</span><b>"+list.length+" exercises · about "+_buildToday.minutes+" min</b></div>"+
    list.map((e,i)=>{const o=e.opts[0];return "<div class='buildPreviewRow'><span>"+(i+1)+"</span><div><b>"+esc(o.n)+(e.anchor?" <em class='anchorPill'>BLOCK ANCHOR</em>":"")+"</b><small>"+esc(e.m+" · "+o.r)+(e.smartFit?" · "+e.smartFit.score+" AI fit":"")+(e.anchor?" · week "+e.anchor.week:"")+"</small></div></div>";}).join("")+"</div>";
}
/* ---------- rest day: train anyway ----------
 * A rest day is a plan, not a rule — some days you just feel good. But "train anyway"
 * should never mean "train whatever": the muscles you hit yesterday are exactly the ones
 * that must stay off the menu. This scores each focus option by what the body can actually
 * support today — how recovered its muscles are, how far below their weekly target they
 * sit, and how long since each was trained — so the suggestion naturally lands on whatever
 * the days around the rest day did NOT cover.
 *
 * Recovery is a multiplier rather than one term among several, on purpose: a fatigued
 * muscle should sink its focus no matter how far below target it is. Training a 40%-
 * recovered muscle on an unscheduled day is the precise opposite of the point. */
function restDayMuscleScore(mus,rec,wk){
  const r=(rec[mus]&&rec[mus].score!=null)?rec[mus].score:75;
  const target=(typeof PLAN_TARGETS!=="undefined"&&PLAN_TARGETS[mus])?PLAN_TARGETS[mus][1]:16;
  const done=wk[mus]||0;
  const deficit=Math.max(0,Math.min(1,(target-done)/Math.max(1,target)));
  const since=(typeof daysSinceTrained==="function")?daysSinceTrained(mus):null;
  const freshness=since==null?0.5:Math.min(1,since/4);
  return (r/100)*(0.45+0.35*deficit+0.20*freshness);
}
function restDayTrainSuggestion(){
  const rec=(typeof allMuscleRecovery==="function")?allMuscleRecovery():{};
  const wk=(typeof weeklyMuscleSets==="function")?weeklyMuscleSets():{};
  const overall=(typeof overallRecovery==="function")?overallRecovery():{score:100};
  const ranked=Object.keys(BUILD_FOCUS).map(f=>{
    const muscles=BUILD_FOCUS[f];
    const scores=muscles.map(m=>restDayMuscleScore(m,rec,wk));
    const worst=Math.min.apply(null,muscles.map(m=>(rec[m]&&rec[m].score!=null)?rec[m].score:75));
    return {focus:f,muscles:muscles,worst:worst,
      score:scores.reduce((a,b)=>a+b,0)/scores.length};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  /* Shorter than a scheduled session by default. This is a bonus, and the fastest way to
     turn an unplanned good day into a bad week is to make it a full one. */
  const minutes=overall.score>=80?45:30;
  const behind=best.muscles.filter(m=>{
    const t=(typeof PLAN_TARGETS!=="undefined"&&PLAN_TARGETS[m])?PLAN_TARGETS[m][0]:8;
    return (wk[m]||0)<t;
  });
  const freshest=best.muscles.slice().sort((a,b)=>{
    const x=(typeof daysSinceTrained==="function")?daysSinceTrained(a):null;
    const y=(typeof daysSinceTrained==="function")?daysSinceTrained(b):null;
    return (y==null?99:y)-(x==null?99:x);
  })[0];
  const why=[];
  if(best.worst>=80)why.push("everything it trains is fully recovered");
  else why.push(best.worst+"% recovered at worst");
  if(behind.length)why.push(behind.slice(0,2).join(" and ").toLowerCase()+" "+(behind.length>1?"are":"is")+" still short of target this week");
  else if(freshest)why.push(freshest.toLowerCase()+" has had the longest break");
  return {focus:best.focus,muscles:best.muscles,minutes:minutes,
    overall:overall.score,worst:best.worst,why:why,
    /* Below the same threshold the Recovery tab uses for "train with control". At that
       point the honest answer is that resting is the better session. */
    discouraged:overall.score<58,ranked:ranked};
}
function openRestDayTrain(){
  const s=restDayTrainSuggestion();
  const safety=typeof smartSafetyAssessment==="function"?smartSafetyAssessment():null;
  document.getElementById("detTitle").textContent="Train today?";
  const alt=s.ranked.slice(1,4);
  document.getElementById("detBody").innerHTML=
    "<p class='buildIntro'>Today is scheduled as rest. Nothing is stopping you training — this is just what your body is best set up for right now.</p>"+
    (safety&&safety.hold
      ? "<div class='safetyStop'><b>Your body check says hold off</b><p>"+esc(safety.guidance)+"</p><small>This is not medical advice.</small></div>"
      : s.discouraged
        ? "<div class='restWarn'><b>Recovery is at "+s.overall+"%</b><p>You can still train, but a short easy session will do more for the week than a hard one. Consider walking or mobility instead.</p></div>"
        : "")+
    "<section class='restPick'><span>SUGGESTED</span><h3>"+esc(s.focus)+" · "+s.minutes+" min</h3>"+
    "<p>"+esc(s.why.join(", "))+".</p>"+
    "<div class='restMuscles'>"+s.muscles.map(m=>"<span>"+esc(m)+"</span>").join("")+"</div></section>"+
    "<div class='btnrow'><button id='restBuild'>Build this session</button></div>"+
    "<p class='restAltLabel'>Or pick a different focus</p>"+
    "<div class='restAlts'>"+alt.map(a=>"<button data-rest-focus='"+escAttr(a.focus)+"'>"+esc(a.focus)+"<small>"+a.worst+"% recovered</small></button>").join("")+
    "<button data-rest-focus='__more'>More options<small>full builder</small></button></div>"+
    "<div class='btnrow'><button class='ghost' id='restSkip'>Actually, rest today</button></div>";
  document.getElementById("restBuild").onclick=()=>{
    _buildToday={minutes:s.minutes,focus:s.focus,discomfort:"None",travel:false};
    createBuiltTodayWorkout(buildTodayCandidates(),"Bonus · "+s.focus+" · "+s.minutes+" min");
  };
  document.querySelectorAll("#detBody [data-rest-focus]").forEach(b=>b.onclick=()=>{
    const f=b.dataset.restFocus;
    openBuildToday(f==="__more"?{minutes:s.minutes}:{minutes:s.minutes,focus:f});
  });
  document.getElementById("restSkip").onclick=()=>detDlg.close();
  if(!detDlg.open)detDlg.showModal();
}

function renderBuildToday(){
  const list=buildTodayCandidates(),safety=typeof smartSafetyAssessment==="function"?smartSafetyAssessment():null;
  document.getElementById("detTitle").textContent=_buildToday.travel?"Build a travel workout":"Build today's workout";
  document.getElementById("detBody").innerHTML="<p class='buildIntro'>Choose the time and goal. The trainer uses your equipment, exercise preferences, history and recovery to build a temporary session.</p>"+
    "<fieldset class='buildField'><legend>Available time</legend><div class='buildChoices'>"+[30,45,60,75].map(n=>"<button data-build-min='"+n+"' class='"+(_buildToday.minutes===n?"on":"")+"' aria-pressed='"+(_buildToday.minutes===n?"true":"false")+"'>"+n+" min</button>").join("")+"</div></fieldset>"+
    "<fieldset class='buildField'><legend>Focus</legend><div class='buildChoices wrap'>"+Object.keys(BUILD_FOCUS).map(f=>"<button data-build-focus='"+escAttr(f)+"' class='"+(_buildToday.focus===f?"on":"")+"' aria-pressed='"+(_buildToday.focus===f?"true":"false")+"'>"+esc(f)+"</button>").join("")+"</div></fieldset>"+
    "<label class='buildSelect'><span>Any discomfort today?</span><select id='buildDiscomfort' aria-label='Area of discomfort'>"+Object.keys(BUILD_DISCOMFORT).map(d=>"<option"+(_buildToday.discomfort===d?" selected":"")+">"+esc(d)+"</option>").join("")+"</select><small>This only avoids likely aggravating movements. Persistent pain needs a qualified professional.</small></label>"+
    buildTodayPreviewHTML(list)+(safety&&safety.hold?"<div class='safetyStop'><b>Starting is blocked by your body check</b><p>"+esc(safety.guidance)+"</p><small>This is not a diagnosis.</small></div>":"<div class='btnrow'><button id='startBuiltToday'>Build &amp; start</button></div>");
  document.querySelectorAll("#detBody [data-build-min]").forEach(b=>b.onclick=()=>{_buildToday.minutes=+b.dataset.buildMin;renderBuildToday();});
  document.querySelectorAll("#detBody [data-build-focus]").forEach(b=>b.onclick=()=>{_buildToday.focus=b.dataset.buildFocus;renderBuildToday();});
  document.getElementById("buildDiscomfort").onchange=e=>{_buildToday.discomfort=e.target.value;renderBuildToday();};
  const start=document.getElementById("startBuiltToday");if(start)start.onclick=()=>createBuiltTodayWorkout(list);
}
function openBuildToday(opts){
  opts=opts||{};
  _buildToday={minutes:opts.minutes||45,focus:opts.focus||"Full body",discomfort:"None",travel:!!opts.travel};
  renderBuildToday();if(!detDlg.open)detDlg.showModal();
}
function createBuiltTodayWorkout(exercises,name){
  const safety=typeof smartSafetyAssessment==="function"?smartSafetyAssessment():null;
  if(safety&&safety.hold){toast("Starting is paused by your safety check");return;}
  if(!exercises||!exercises.length){toast("No suitable exercises found for those filters");return;}
  const workout={id:"today_"+Date.now().toString(36),name:name||(_buildToday.travel?"Travel · ":"Smart · ")+_buildToday.focus+" · "+_buildToday.minutes+" min",ex:exercises.map(x=>({m:x.m,opts:JSON.parse(JSON.stringify(x.opts))})),temporary:true,createdDate:todayStr(),buildContext:Object.assign({},_buildToday)};
  state.customWorkouts=state.customWorkouts||[];state.customWorkouts.push(workout);
  if(typeof recordRecommendationEvent==="function")recordRecommendationEvent("build-today",{workoutId:workout.id,minutes:_buildToday.minutes,focus:_buildToday.focus,discomfort:_buildToday.discomfort,exercises:exercises.map(x=>x.opts[0].n)});
  save();
  const index=state.customWorkouts.length-1;detDlg.close();
  if(typeof startCustom==="function")startCustom(index);
  else{logCustom={name:workout.name,ex:workout.ex,key:workout.id,index:index};openLog();}
}
function shortenSelectedWorkout(minutes){
  const wd=selectedWeekDate(),di=calendarDayIndex(wd.wd,wd.iso);
  if(di<0){openBuildToday({minutes:minutes});return;}
  const day=PROGRAM[di],max=Math.max(3,Math.min(day.ex.length,Math.round(minutes/9))),picked=[],seen={};
  day.ex.forEach((e,ei)=>{if(picked.length<max&&!seen[e.m]){picked.push({e:e,ei:ei});seen[e.m]=1;}});
  day.ex.forEach((e,ei)=>{if(picked.length<max&&!picked.some(x=>x.ei===ei))picked.push({e:e,ei:ei});});
  picked.sort((a,b)=>a.ei-b.ei);
  const ex=picked.map((x,i)=>{const o=curOpt(di,x.ei),match=String(o.r||"").match(/x\s*(.+)$/i),sets=i<2?3:2,canonical=canonicalExercise(o.libId||o.n,x.e.m);return {m:x.e.m,opts:[{libId:o.libId||(canonical&&canonical.exercise.id)||null,n:o.n,r:sets+" x "+(match?match[1]:"8-12"),cue:o.cue,img:o.img,eq:o.eq}]};});
  _buildToday={minutes:minutes,focus:day.title,discomfort:"None",travel:false};
  createBuiltTodayWorkout(ex,"Short · "+day.title+" · "+minutes+" min");
}
function openScheduleTools(){
  const source=selectedWeekDate(),di=calendarDayIndex(source.wd,source.iso),wk=weekDates(),over=calendarOverrideFor(source.iso);
  document.getElementById("detTitle").textContent="Plan this week";
  document.getElementById("detBody").innerHTML="<p class='buildIntro'>Move a workout for this week only, or create a shorter/travel session. Your permanent program is not changed.</p>"+
    "<section class='scheduleTool'><span>RESCHEDULE</span><h3>"+(di>=0?esc(PROGRAM[di].title):"Recovery day")+"</h3><div class='scheduleDates'>"+wk.map(d=>"<button data-move-date='"+d.iso+"'"+(di<0?" disabled":"")+"><b>"+d.wd.charAt(0)+"</b><span>"+d.date+"</span></button>").join("")+"</div></section>"+
    "<section class='scheduleTool'><span>SESSION MODE</span><div class='scheduleModes'><button data-short='30'><b>30 min</b><small>Keep the highest-value work</small></button><button data-short='45'><b>45 min</b><small>Balanced shorter session</small></button><button id='travelWorkout'><b>Travel</b><small>Dumbbell, band and bodyweight</small></button></div></section>"+
    (over?"<button class='workoutEditAdd' id='clearWeekChange'>Undo this dated change</button>":"");
  document.querySelectorAll("#detBody [data-move-date]").forEach(b=>b.onclick=()=>rescheduleSelectedWorkout(b.dataset.moveDate));
  document.querySelectorAll("#detBody [data-short]").forEach(b=>b.onclick=()=>shortenSelectedWorkout(+b.dataset.short));
  document.getElementById("travelWorkout").onclick=()=>openBuildToday({minutes:45,travel:true,focus:"Full body"});
  const clear=document.getElementById("clearWeekChange");if(clear)clear.onclick=()=>clearCalendarOverride(source.iso);
  if(!detDlg.open)detDlg.showModal();
}
function homeExercisePreview(di,expanded){
  const day=PROGRAM[di],max=expanded?day.ex.length:Math.min(3,day.ex.length);
  return day.ex.slice(0,max).map((exo,ei)=>{
    const o=curOpt(di,ei),done=homeDayDone(di,ei),target=smartTargetFor(di,ei,null),sets=target?target.sets:targetSets(o.r);
    return "<div class='homeEx2 ciTimelineRow"+(done?" done":"")+"' data-d='"+di+"' data-e='"+ei+"'>"+
      "<div class='ciTimelineRail'><span>"+(done?"✓":(ei+1))+"</span></div>"+
      "<img class='homeExThumb' loading='lazy' decoding='async' src='"+escAttr(o.img)+"' onerror=\"this.style.visibility='hidden'\">"+
      "<div class='homeExMid'><div class='nm'>"+esc(o.n)+"</div><div class='meta'>"+esc(exFor(o,exo.m))+" | "+sets+" sets | "+esc(target?target.reps:o.r)+" reps</div><div class='ciTarget'>"+(target?esc(target.load+" | "+target.rir+" RIR"):"Target "+esc(o.r))+"</div></div>"+
      "<div class='ciRecoveryTag' style='--rec-color:"+recoveryColorFor(exo.m)+"'><b>"+muscleRecovery(exo.m).score+"</b><span>rec</span></div><div class='homeExView'>›</div></div>";
  }).join("");
}
function renderPlan(){
  if(selWeekday==null)selWeekday=todayWeekday();
  const v=document.getElementById("v-plan"),tdy=todayWeekday(),wk=weekDates(),isToday=selWeekday===tdy;
  const selectedDate=wk.find(d=>d.wd===selWeekday)||wk[0],manual=calendarOverrideFor(selectedDate.iso);
  const sch=isToday&&!manual?smartScheduleRecommendation(selWeekday):null;
  const di=manual?manual.index:(isToday?effectiveDayIndex(selWeekday):dayForWeekday(selWeekday)),draft=activeSession();
  const selectedName=isToday?"Today":(FULLDAY[selWeekday]||"Training");
  const dateLabel=isToday?new Date().toLocaleDateString("default",{weekday:"long",month:"long",day:"numeric"}):(FULLDAY[selWeekday]||selWeekday);
  const progName=((PROGRAMS[activeProg]||{}).name||"Program").replace(/^\d-Day\s*/,"");
  /* Settings sits next to Coach in the home header. It used to be reachable only through a
     button on the Plan tab, which is two taps deep and somewhere nobody looks for settings —
     the user could not find it. The bottom nav is already full at five items, so the header is
     the right place for it. */
  let h="<div class='home2 ciHome'><header class='ciTop'><div><span>"+esc(dateLabel)+"</span><h1>"+esc(selectedName)+"</h1></div>"+
    "<div style='display:flex;align-items:center;gap:8px'>"+
    "<button class='homeCoach' data-home='coach'>"+icon("sparkles",16)+"<span>Coach</span></button>"+
    "<button class='homeCoach' data-home='settings' aria-label='Settings' title='Settings' style='padding:8px'>"+icon("settings",18)+"</button>"+
    "</div></header>";
  if(draft)h+="<section class='homeResume2 ciResume'><div class='txt'><div class='a'>Workout in progress</div><div class='b'>"+esc(draft.title||"Resume your session")+"</div></div><button class='primary' data-home='resume'>Resume</button><button data-home='clear'>Clear</button></section>";
  h+="<div class='homeWeek2 ciWeek' aria-label='Training week'>"+wk.map(d=>{const train=calendarDayIndex(d.wd,d.iso)>=0;return "<button class='homeDay"+(d.wd===selWeekday?" sel":"")+(d.wd===tdy?" today":"")+(train?" train":"")+"' data-wd='"+d.wd+"' aria-label='"+escAttr(FULLDAY[d.wd]+", "+d.date+(train?", training day":", recovery day"))+"' aria-pressed='"+(d.wd===selWeekday?"true":"false")+"'><span class='wd'>"+d.wd.charAt(0)+"</span><span class='dt'>"+d.date+"</span><i class='pip'></i></button>";}).join("")+"</div>";
  h+=manualScheduleHTML(selectedDate.iso,manual);
  h+=homeScheduleRepairHTML(sch);
  if(di>=0){
    const day=PROGRAM[di],pct=dayProgress(di),first=curOpt(di,0),rec=dayRecovery(di),mins=homeEstimateMinutes(day),startLabel=draft?"Resume workout":"Start workout";
    h+="<section class='ciHero'><div class='ciHeroImage'><img src='"+escAttr(first.img)+"' decoding='async' alt='' onerror=\"this.style.visibility='hidden'\"><div class='ciHeroShade'></div><div class='ciHeroBadge'>"+(manual?"RESCHEDULED":sch&&sch.overridden?"CATCH-UP":"UP NEXT")+"</div><div class='ciHeroImageCopy'><span>"+esc(day.day+" | "+progName)+"</span><h2>"+esc(day.title)+"</h2><p>First: "+esc(first.n)+"</p></div></div>"+
      "<div class='ciMetrics'><div><b>"+homePlanSets(day)+"</b><span>sets</span></div><div><b>"+mins+"</b><span>minutes</span></div><button data-home='recovery'><b>"+rec.score+"%</b><span>recovery</span></button></div>"+
      "<div class='ciHeroActions'><button class='homeStart2' data-home='start' data-di='"+di+"'>"+icon("player-play",18)+startLabel+"</button><button class='ciTargetBtn' data-home='smartplan'>Targets</button></div>"+
      (pct?"<div class='ciProgress'><i style='width:"+pct+"%'></i><span>"+pct+"% complete</span></div>":"")+"</section>";
    h+=adaptiveBriefHTML(di);
    const expanded=!!state.homeExpanded,hidden=Math.max(0,day.ex.length-3);
    h+="<main class='homeMain2 ciTimeline'><div class='homeSectionHead'><div><span>SESSION TIMELINE</span><h3>"+day.ex.length+" exercises</h3></div><button class='homeToggle' data-home='editday' data-di='"+di+"'>Edit</button>"+(hidden?"<button class='homeToggle' data-home='toggle'>"+(expanded?"Show less":"View all")+"</button>":"")+"</div><div class='homeExList'>"+homeExercisePreview(di,expanded)+"</div></main>";
  }else{
    const rec=overallRecovery();
    /* Rest keeps the headline — it is still the recommendation. But a rest day you happen
       to feel good on used to dead-end at "Choose workout", which drops you into the whole
       program list with no guidance about what today can actually support. The trainer
       already knows; it just was not being asked. */
    h+="<section class='ciRestHero'><div><span>RECOVERY DAY</span><h2>Rest and rebuild</h2><p>"+esc(recoveryStatusCopy(rec))+"</p></div>"+recoveryRingHTML(rec.score)+
      "<div class='ciHeroActions'><button class='homeStart2' data-home='restTrain'>Feeling good? Train anyway</button>"+
      "<button class='ciTargetBtn' data-home='recovery'>Open recovery</button>"+
      "<button class='ciTargetBtn' data-home='workouts'>Choose workout</button></div></section>";
  }
  const actBtn=(k,ic,lb)=>"<button data-home='"+k+"'>"+icon(ic,18)+"<span>"+lb+"</span></button>";
  h+="<div class='homeActions2 ciQuick'>"+actBtn("buildtoday","sparkles","Build today")+actBtn("schedule","calendar","Plan week")+actBtn("readiness","heartbeat","Check-in")+actBtn("review","clipboard-check","Weekly review")+"</div></div>";
  v.innerHTML=h;
  v.querySelectorAll(".homeDay").forEach(c=>c.onclick=()=>{selWeekday=c.dataset.wd;renderPlan();});
  v.querySelectorAll(".homeEx2").forEach(r=>r.onclick=()=>openPlanEx(+r.dataset.d,+r.dataset.e));
  v.querySelectorAll("[data-home]").forEach(b=>b.onclick=()=>{
    const act=b.dataset.home;
    if(act==="coach")coach();
    else if(act==="settings")nav("more");
    else if(act==="resume")resumeSession();
    else if(act==="clear")discardSession();
    else if(act==="start"){if(activeSession())resumeSession();else startDay(+b.dataset.di);}
    else if(act==="workouts")nav("workouts");
    else if(act==="recovery")nav("recovery");
    else if(act==="restTrain")openRestDayTrain();
    else if(act==="review")openWeeklyReview();
    else if(act==="readiness")openReadiness();
    else if(act==="progress")nav("stats");
    else if(act==="exercises")nav("exercises");
    else if(act==="settings")nav("more");
    else if(act==="toggle"){state.homeExpanded=!state.homeExpanded;save();renderPlan();}
    else if(act==="editday"){logCustom=null;openDayEditor(+b.dataset.di);}
    else if(act==="smartplan")openAdaptivePlan(di);
    else if(act==="programinfo")openProgramIdentity();
    else if(act==="repair")acceptScheduleRepair(+b.dataset.di);
    else if(act==="restore")clearScheduleRepair();
    else if(act==="buildtoday")openBuildToday();
    else if(act==="schedule")openScheduleTools();
    else if(act==="clearschedule")clearCalendarOverride(b.dataset.date);
  });
}

/* ---------- exercise detail / notes (opened from the timeline or a swap) ---------- */
function exerciseHistoryHTML(o){
  const pr=prFor(o.n), note=noteFor(o.n), log=logForExerciseName(o.n), vals=log.map(x=>x.e||x.w||0).filter(Boolean), max=Math.max(1,...vals);
  const spark=vals.length?"<div class='spark'>"+vals.map(v=>"<span style='height:"+Math.max(8,Math.round(v/max*42))+"px'></span>").join("")+"</div>":"<p style='color:var(--muted)'>No logged history for this exercise yet.</p>";
  return "<div class='insight'><b>History</b>"+(pr?"<br>Best: "+toDisp(pr.w)+" "+unit+" x "+(pr.r||"-")+" · 1RM ~ "+toDisp(pr.e)+" "+unit:"")+" "+spark+"</div><label style='font-size:12px;color:var(--muted);font-weight:800'>Exercise notes</label><textarea class='notesbox' id='exnote'>"+esc(note)+"</textarea><div class='minirow'><button id='saveNote'>Save note</button></div>";
}
function openDetail(o){
  document.getElementById("detTitle").textContent=o.n;
  const f=exFor(o,o.m),also=exAlso(o),target=o.r?capabilityRecommendation(o,o.m||libMuscleOf(o),null):null;
  document.getElementById("detBody").innerHTML=demoHTML(o.img)+
    (f?"<p style='margin-top:12px;color:var(--accent2);font-weight:700'>Works: "+esc(f)+"</p>":"")+
    (also?"<p style='margin-top:2px;color:var(--muted);font-size:13px'>Also works: "+esc(also)+"</p>":"")+
    "<p style='margin-top:10px'><b>How to:</b> "+esc(o.cue||"")+"</p>"+
    (target?"<div class='smartDetailTarget'><span>SMART TARGET</span><b>"+esc(target.advice)+"</b><small>"+esc(target.why)+"</small></div>":(o.r?"<p style='color:var(--muted)'>Target: "+esc(o.r)+" · Rest ~"+fmt(restFor(o))+"</p>":""))+
    exercisePreferenceHTML(o.n)+exerciseRatingHTML(o.n)+exerciseHistoryHTML(o);
  detDlg.showModal();playDemo(o.img);bindExercisePreferenceControls(o.n);
  const rate=document.getElementById("rateExercise");if(rate)rate.onclick=()=>openExerciseRating(o.n);
  document.getElementById("saveNote").onclick=()=>{setNoteFor(o.n,document.getElementById("exnote").value);save();toast("Note saved");};
}
function openPlanEx(di,ei){
  const o=curOpt(di,ei),mus=PROGRAM[di].ex[ei].m,target=smartTargetFor(di,ei,null);
  document.getElementById("detTitle").textContent=o.n;
  document.getElementById("detBody").innerHTML=demoHTML(o.img)+"<p style='margin-top:12px'><b>How to:</b> "+esc(o.cue||"")+"</p>"+
    "<div class='smartDetailTarget'><span>SMART TARGET · "+target.recovery+"% "+esc(mus)+" RECOVERY</span><b>"+esc(target.advice)+"</b><small>"+esc(target.why)+" · "+esc(target.confidence.label)+"</small></div>"+
    "<div class='btnrow'><button onclick='detDlg.close();openSwapPlan("+di+","+ei+")'>Find a smarter swap</button></div>"+
    exercisePreferenceHTML(o.n)+exerciseRatingHTML(o.n)+exerciseHistoryHTML(o);
  detDlg.showModal();playDemo(o.img);bindExercisePreferenceControls(o.n);
  const rate=document.getElementById("rateExercise");if(rate)rate.onclick=()=>openExerciseRating(o.n);
  document.getElementById("saveNote").onclick=()=>{setNoteFor(o.n,document.getElementById("exnote").value);save();toast("Note saved");};
}
