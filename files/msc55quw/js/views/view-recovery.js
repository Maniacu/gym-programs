/* Recovery tab: one transparent 0-100 model for the body map, muscle rows and the
 * session prescription. Users can correct any muscle because soreness is not a phone
 * sensor; manual values expire automatically after the next day. */

function recoveryRingHTML(score){
  const r=43,c=2*Math.PI*r,off=c*(1-smartClamp(score,0,100)/100);
  return "<div class='recRing'><svg viewBox='0 0 104 104'><circle cx='52' cy='52' r='"+r+"' class='track'/><circle cx='52' cy='52' r='"+r+"' class='value' stroke-dasharray='"+c.toFixed(1)+"' stroke-dashoffset='"+off.toFixed(1)+"'/></svg><div><b>"+score+"</b><span>recovered</span></div></div>";
}
function recoveryStatusCopy(o){
  if(o.score>=80)return "Your recovery supports normal training. Progress only when reps and RIR earn it.";
  if(o.score>=58)return "You can train, but the coach will hold back fatigued muscles and keep more reps in reserve.";
  return "Recovery is low. An easier session, a catch-up with fresher muscles, or rest will create a better next workout.";
}
function recoveryMuscleRows(){
  const all=allMuscleRecovery();
  return SMART_MUSCLES.slice().sort((a,b)=>all[a].score-all[b].score).map(m=>{
    const x=all[m],last=x.lastDate?(smartDateAge(x.lastDate)===0?"trained today":smartDateAge(x.lastDate)+"d since training"):"no recent data";
    return "<button class='recMuscle' data-rec-mus='"+escAttr(m)+"' style='--rec-color:"+recoveryColorFor(m)+"'><span class='recDot'></span><span class='recMuscleCopy'><b>"+esc(m)+"</b><small>"+esc(last)+" | "+esc(x.confidence)+" confidence"+(x.manual?" | manual":"")+"</small></span><strong>"+x.score+"%</strong><span class='recChevron'>›</span></button>";
  }).join("");
}
function recoveryVolumeHTML(){
  const wk=weeklyMuscleSets();
  return SMART_MUSCLES.map(m=>{
    const t=(typeof PLAN_TARGETS!=="undefined"&&PLAN_TARGETS[m])?PLAN_TARGETS[m]:[8,18],sets=wk[m]||0,p=Math.min(100,Math.round(sets/t[1]*100));
    return "<div class='recVolume'><div><b>"+esc(m)+"</b><span>"+sets+" / "+t[0]+"-"+t[1]+" sets</span></div><div class='recVolumeBar'><i style='width:"+p+"%'></i></div></div>";
  }).join("");
}
function recoveryHealthHTML(){
  const h=smartHealthSnapshot(),b=h.baseline||{days:0,targetDays:14,windowDays:28,ready:false},pct=Math.min(100,Math.round((b.days||0)/(b.targetDays||14)*100));
  if(!h.connected)return "<details class='recSection recWeekly'><summary><div><span>PERSONAL BASELINE</span><h3>Health Connect optional</h3></div><b>Why</b></summary><p class='smartFinePrint'>Connect sleep, resting heart rate and HRV in settings. The trainer remains fully usable without them.</p></details>";
  return "<details class='recSection recWeekly'"+(b.ready?"":" open")+"><summary><div><span>PERSONAL BASELINE</span><h3>"+(b.ready?"28-day recovery trend":"Calibrating "+b.days+"/"+b.targetDays+" days")+"</h3></div><b>"+(b.ready?"Ready":pct+"%")+"</b></summary>"+
    "<div class='baselineProgress'><i style='width:"+pct+"%'></i></div><div class='growthMetrics'><span><b>"+(h.sleepHours==null?"—":h.sleepHours+"h")+"</b> sleep</span><span><b>"+(h.restingHeartRate==null?"—":h.restingHeartRate)+"</b> resting HR</span><span><b>"+(h.hrvRmssd==null?"—":h.hrvRmssd)+"</b> HRV</span></div>"+
    "<p class='smartFinePrint'>"+esc(h.interpretation)+(h.reason?" "+esc(h.reason):"")+" The app never treats one favourable wearable reading as permission to push harder.</p></details>";
}
function openRecoveryAdjust(mus){
  const x=muscleRecovery(mus);
  document.getElementById("detTitle").textContent=mus+" recovery";
  document.getElementById("detBody").innerHTML="<div class='recAdjust'><div class='recAdjustValue'><b id='recAdjustValue'>"+x.score+"</b><span>% recovered</span></div><input id='recAdjustRange' type='range' min='0' max='100' step='5' value='"+x.score+"'><div class='recAdjustScale'><span>Fatigued</span><span>Recovering</span><span>Ready</span></div></div>"+
    "<p class='smartFinePrint'>The automatic score uses completed sets, time since training, muscle size and session feel. Correct it when your body says otherwise; the override expires after tomorrow.</p>"+
    "<div class='btnrow'><button id='recAdjustSave'>Use my value</button>"+(x.manual?"<button class='ghost' id='recAdjustAuto'>Use automatic</button>":"")+"</div>";
  const range=document.getElementById("recAdjustRange"),value=document.getElementById("recAdjustValue");
  range.oninput=()=>value.textContent=range.value;
  document.getElementById("recAdjustSave").onclick=()=>{setRecoveryOverride(mus,+range.value);detDlg.close();renderRecovery();toast(mus+" recovery updated");};
  const auto=document.getElementById("recAdjustAuto");
  if(auto)auto.onclick=()=>{setRecoveryOverride(mus,null);detDlg.close();renderRecovery();toast("Automatic recovery restored");};
  detDlg.showModal();
}
function recoveryRecommendationHTML(){
  const wd=todayWeekday(),sch=smartScheduleRecommendation(wd),di=effectiveDayIndex(wd),overall=overallRecovery();
  if(di<0){
    let h="<section class='recCoachCard'><div class='ciAiMark'>AI</div><div><span>TRAINER DECISION</span><b>Recovery day</b><p>"+esc(recoveryStatusCopy(overall))+"</p></div>";
    if(sch.repair&&sch.suggested>=0)h+="<button data-rec-act='review' data-di='"+sch.suggested+"'>Review catch-up</button>";
    return h+"</section>";
  }
  const plan=adaptiveSessionPlan(di);
  return "<section class='recCoachCard'><div class='ciAiMark'>AI</div><div><span>TRAINER DECISION | "+esc(plan.mode)+"</span><b>"+esc(PROGRAM[di].title)+"</b><p>"+esc(plan.summary)+"</p><small>"+plan.recovery+"% session recovery | "+plan.confidence.label+"</small></div><button data-rec-act='review' data-di='"+di+"'>Review targets</button></section>";
}
function renderRecovery(){
  const v=document.getElementById("v-recovery"),o=overallRecovery(),all=allMuscleRecovery();
  const ready=SMART_MUSCLES.filter(m=>all[m].score>=80).length,ai=typeof aiKey==="function"&&aiKey();
  v.innerHTML="<div class='recPage'><header class='recHeader'><div><span>YOUR BODY TODAY</span><h1>Recovery</h1></div><button data-rec-act='checkin'>Check-in</button></header>"+
    "<section class='recHero'><div class='recHeroTop'>"+recoveryRingHTML(o.score)+"<div class='recHeroCopy'><span>"+esc(o.status)+"</span><h2>"+ready+" of "+SMART_MUSCLES.length+" muscles ready</h2><p>"+esc(recoveryStatusCopy(o))+"</p><div class='recEngineState'><i></i>"+(ai?"AI coach connected":"Smart trainer works offline")+"</div></div></div><div class='recMap'>"+bodyHeatmapSVG(SMART_MUSCLES,recoveryColorFor)+"<div class='recLegend'><span><i class='ready'></i>Ready 80+</span><span><i class='recovering'></i>Recovering</span><span><i class='fatigued'></i>Fatigued</span></div></div></section>"+
    recoveryRecommendationHTML()+
    recoveryHealthHTML()+
    "<section class='recSection'><div class='recSectionHead'><div><span>MUSCLE DETAIL</span><h3>Tap to correct recovery</h3></div><small>0-100</small></div><div class='recMuscleList'>"+recoveryMuscleRows()+"</div></section>"+
    "<details class='recSection recWeekly'><summary><div><span>TRAINING LOAD</span><h3>This week's working sets</h3></div><b>View</b></summary><div class='recVolumeList'>"+recoveryVolumeHTML()+"</div></details>"+
    "<button class='recSettings' data-rec-act='settings'>Training settings &amp; equipment <span>›</span></button></div>";
  v.querySelectorAll("[data-rec-mus]").forEach(b=>b.onclick=()=>openRecoveryAdjust(b.dataset.recMus));
  v.querySelectorAll("[data-rec-act]").forEach(b=>b.onclick=()=>{
    if(b.dataset.recAct==="checkin")openReadiness();
    else if(b.dataset.recAct==="review")openAdaptivePlan(+b.dataset.di);
    else if(b.dataset.recAct==="settings")nav("more");
  });
}
