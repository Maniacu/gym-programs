/* Progress tab: yearly bento stats, muscle heat map, recent workouts, plan audit,
 * advanced progress coaching, shape-goal insight, and personal records (merged into the
 * bottom of this same view rather than a separate tab). */

/* ---------- body measurements + composition ---------- */
/* One tracked metric's trend as a tiny inline sparkline (last ~12 entries), so waist/
   chest/arms/weight progress is visible instead of just listed as rows. */
function measureSpark(rows,key,disp){
  const pts=rows.map(r=>({d:r.date,v:disp?disp(r[key]):r[key]})).filter(p=>p.v!=null&&p.v!==""&&!isNaN(+p.v)).slice(-12);
  if(pts.length<2)return "";
  const vals=pts.map(p=>+p.v), mn=Math.min(...vals), mx=Math.max(...vals), W=300,H=40,pad=4;
  const x=i=>pad+i*(W-2*pad)/(pts.length-1), y=v=>H-pad-((v-mn)/((mx-mn)||1))*(H-2*pad);
  const line=pts.map((p,i)=>x(i).toFixed(0)+","+y(+p.v).toFixed(0)).join(" ");
  const delta=vals[vals.length-1]-vals[0], sign=delta>=0?"+":"";
  return "<svg viewBox='0 0 "+W+" "+H+"' style='width:100%;height:38px'><polyline points='"+line+"' fill='none' stroke='var(--accent)' stroke-width='2'/><circle cx='"+x(pts.length-1).toFixed(0)+"' cy='"+y(vals[vals.length-1]).toFixed(0)+"' r='2.5' fill='var(--accent)'/></svg><div style='display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:-2px'><span>"+vals[0]+"</span><span>"+sign+(Math.round(delta*10)/10)+" over "+pts.length+"</span><span>"+vals[vals.length-1]+"</span></div>";
}
function bodyCompCardHTML(){
  const bw=(state.bodyweightLog||[]), lastBw=bw.length?bw[bw.length-1].kg:null;
  const mLast=(state.measurements||[]).slice().reverse().find(x=>x.bf!=null);
  const c=bodyComp(profile,lastBw,mLast?mLast.bf:null);
  if(!c.bmi&&!c.bmr)return "";
  const cell=(k,v,sub)=>"<div class='audit ok'><div class='m'><span>"+k+"</span><b>"+(v!=null?v:"—")+"</b></div>"+(sub?"<div class='s'>"+sub+"</div>":"")+"</div>";
  return "<h3 style='margin:16px 2px 8px'>Body composition</h3><div class='auditgrid'>"+
    cell("BMI",c.bmi,c.bmi?(c.bmi<18.5?"underweight":c.bmi<25?"healthy":c.bmi<30?"overweight":"obese"):"")+
    cell("Body fat",c.bf!=null?c.bf+"%":null,c.bf==null?"add % below":"")+
    cell("Fat-free mass",c.ffm!=null?volLabel(c.ffm):null,"lean mass")+
    cell("Fat mass",c.fatMass!=null?volLabel(c.fatMass):null,"")+
    cell("FFMI",c.ffmi,c.ffmi?(c.ffmi<20?"lean":c.ffmi<23?"muscular":c.ffmi<25?"very muscular":"elite"):"")+
    cell("Maintenance",c.maintenance!=null?c.maintenance+" kcal":null,c.bmr?"BMR "+c.bmr:"set activity")+
    "</div>";
}
function volLabel(kg){ return unit==="lb"?(Math.round(kg*LBF*10)/10+" lb"):(kg+" kg"); }
function openMeasurements(){
  const m=state.measurements||[], last=m[m.length-1]||{};
  document.getElementById("detTitle").textContent="Measurements";
  document.getElementById("detBody").innerHTML="<div class='fld'><label>Weight ("+unit+")</label><input id='ms_w' inputmode='decimal' value='"+(last.weight?toDisp(last.weight):"")+"'></div><div class='fld'><label>Body fat % (optional)</label><input id='ms_bf' inputmode='decimal' placeholder='e.g. 18' value='"+(last.bf!=null?last.bf:"")+"'></div><div class='fld'><label>Waist (cm)</label><input id='ms_waist' inputmode='decimal' value='"+(last.waist||"")+"'></div><div class='fld'><label>Chest (cm)</label><input id='ms_chest' inputmode='decimal' value='"+(last.chest||"")+"'></div><div class='fld'><label>Arms (cm)</label><input id='ms_arms' inputmode='decimal' value='"+(last.arms||"")+"'></div><div class='btnrow'><button id='ms_save'>Save today</button></div>"+
    bodyCompCardHTML()+
    ((profile&&profile.activity)?"":"<p style='color:var(--muted);font-size:12px;margin-top:8px'>Set your activity level in More › Personal details for calorie estimates.</p>")+
    (m.length>1?"<h3 style='margin:16px 2px 6px'>Trends</h3>"+
      [["weight","Weight ("+unit+")",toDisp],["arms","Arms (cm)",null],["chest","Chest (cm)",null],["waist","Waist (cm)",null]].map(t=>{ const sp=measureSpark(m,t[0],t[2]); return sp?"<div style='margin-bottom:12px'><div style='font-size:12px;color:var(--muted);font-weight:700;margin-bottom:2px'>"+t[1]+"</div>"+sp+"</div>":""; }).join(""):"")+
    (m.length?"<h3 style='margin:14px 2px 6px'>History</h3>"+m.slice(-8).reverse().map(x=>"<div class='hitem'><div><div class='d'>"+x.date+"</div><div class='m'>Waist "+(x.waist||"-")+" · Chest "+(x.chest||"-")+" · Arms "+(x.arms||"-")+(x.bf!=null?" · "+x.bf+"% bf":"")+"</div></div><div class='v'>"+(x.weight?toDisp(x.weight)+" "+unit:"")+"</div></div>").join(""):"");
  document.getElementById("ms_save").onclick=()=>{ const row={date:todayStr(),weight:toKg(document.getElementById("ms_w").value),bf:+document.getElementById("ms_bf").value||null,waist:+document.getElementById("ms_waist").value||null,chest:+document.getElementById("ms_chest").value||null,arms:+document.getElementById("ms_arms").value||null}; state.measurements=state.measurements||[]; const i=state.measurements.findIndex(x=>x.date===row.date); if(i>=0)state.measurements[i]=row; else state.measurements.push(row); save(); openMeasurements(); toast("Measurements saved"); if(row.weight)native("logHealthWeight",row.weight,Date.now()); };
  detDlg.showModal();
}

/* ---------- progress photos ---------- */
function compressPhotoFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      try{
        const scale=Math.min(1,PHOTO_MAX_DIM/Math.max(img.naturalWidth||1,img.naturalHeight||1));
        const c=document.createElement("canvas");
        c.width=Math.max(1,Math.round((img.naturalWidth||1)*scale));
        c.height=Math.max(1,Math.round((img.naturalHeight||1)*scale));
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg",PHOTO_QUALITY));
      }catch(e){ URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src=url;
  });
}
function openPhotos(){
  const arr=state.progressPhotos||[]; document.getElementById("detTitle").textContent="Progress photos";
  document.getElementById("detBody").innerHTML="<input id='ph_in' type='file' accept='image/*'><div class='photoGrid'>"+arr.slice(-8).reverse().map(p=>"<img src='"+p.data+"' title='"+escAttr(p.date)+"'>").join("")+"</div>";
  document.getElementById("ph_in").onchange=async e=>{ const f=e.target.files[0]; if(!f)return; toast("Preparing photo..."); try{ const data=await compressPhotoFile(f); state.progressPhotos=state.progressPhotos||[];state.progressPhotos.push({id:"photo_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6),date:todayStr(),createdAt:new Date().toISOString(),data:data}); state.progressPhotos=trimPhotosForStorage(state.progressPhotos,false); if(save()){openPhotos(); toast("Photo saved");} }catch(err){toast("Could not read photo");} };
  detDlg.showModal();
}

/* ---------- history queries used by the coaching cards below ---------- */
function recentLogs(limit){
  const out=[], L=state.history||{};
  Object.keys(L).forEach(n=>L[n].forEach(l=>out.push(Object.assign({key:n},l))));
  out.sort((a,b)=>(a.d||"")<(b.d||"")?1:-1);
  return out.slice(0,limit||999);
}
function improvedExerciseNames(){
  const rows=[], L=state.history||{};
  Object.keys(L).forEach(n=>{
    const log=L[n]; if(log.length<2)return;
    const a=log[log.length-2], b=log[log.length-1];
    if((b.e||0)>(a.e||0))rows.push({k:n,n:b.n||n,delta:(b.e||0)-(a.e||0),e:b.e});
  });
  rows.sort((a,b)=>b.delta-a.delta);
  return rows.slice(0,5);
}
function rirLabel(v){ return v==null?"not tracked":(v+" RIR"); }

/* ---------- plan audit: is the ACTIVE PROGRAM's planned weekly volume reasonable ---------- */
/* Weekly working-set targets per muscle. Traps sits low like Rear delts on purpose: it
   picks up heavy indirect volume from every row, deadlift and carry (smartMuscleContributions
   credits those), so the direct-work band is small. Before this row existed the Recovery
   volume bar scored traps against a generic 8-18 fallback and read permanently undertrained. */
/* Weekly set targets per tracked muscle. "Legs" is the one composite entry — it buckets
   quads, hamstrings, glutes and calves — so its range is roughly the sum of what the others
   get individually rather than a single-muscle range. At the old [8,18] every honest
   lower-body program in the app read as "high": a 2x/week lower split with squat, RDL, leg
   curl, extension and calves is ~25 sets and entirely reasonable. */
const PLAN_TARGETS={Chest:[10,20],Back:[10,22],Shoulders:[10,22],Biceps:[8,18],Triceps:[8,18],Legs:[10,28],Core:[4,14],"Rear delts":[4,12],Traps:[4,12]};
/* Weekly volume-target progress (Fitbod-style "Targets" ring): how close this week's
   DONE sets are to the minimum effective weekly volume per muscle, capped so overshooting
   one muscle can't mask undertraining another. */
function weeklyTargetPct(){
  const wk=weeklyMuscleSets(); let done=0,tgt=0;
  Object.keys(PLAN_TARGETS).forEach(m=>{ const t=PLAN_TARGETS[m][0]; tgt+=t; done+=Math.min(wk[m]||0,t); });
  return tgt?Math.round(done/tgt*100):0;
}
function weeklyTargetHTML(){
  const pct=weeklyTargetPct(), wk=weeklyMuscleSets();
  const hit=Object.keys(PLAN_TARGETS).filter(m=>(wk[m]||0)>=PLAN_TARGETS[m][0]).length, tot=Object.keys(PLAN_TARGETS).length;
  const low=Object.keys(PLAN_TARGETS).filter(m=>(wk[m]||0)<PLAN_TARGETS[m][0]).sort((a,b)=>((wk[a]||0)/PLAN_TARGETS[a][0])-((wk[b]||0)/PLAN_TARGETS[b][0])).slice(0,3);
  return "<h3 style='margin:14px 2px 10px'>Weekly volume targets</h3><div style='display:flex;align-items:center;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px'>"+
    homeRing(pct)+"<div style='flex:1;min-width:0'><div style='font-weight:800;font-size:15px'>"+hit+"/"+tot+" muscles at target</div><div style='color:var(--muted);font-size:13px;margin-top:3px'>"+(low.length?"Behind: "+low.map(esc).join(", "):"All muscles hit their weekly minimum ✓")+"</div></div></div>";
}
function plannedMuscleSets(){
  const w={};
  PROGRAM.forEach((d,di)=>d.ex.forEach((e,ei)=>{ const o=curOpt(di,ei); w[e.m]=(w[e.m]||0)+targetSets(o.r); }));
  return w;
}
function planAuditHTML(){
  const w=plannedMuscleSets(), names=Object.keys(PLAN_TARGETS);
  const notes=[];
  names.forEach(n=>{ const s=w[n]||0, t=PLAN_TARGETS[n]; if(s&&s<t[0])notes.push(n+" is low"); if(s>t[1])notes.push(n+" is high"); });
  const lead=notes.length?notes.slice(0,3).join(". ")+".":"Planned weekly volume is in a strong range.";
  return "<div class='insight'><b>Plan audit</b><br>"+esc(lead)+" Targets use practical hypertrophy ranges; your recovery/readiness still decides how hard to push.</div><div class='auditgrid'>"+
    names.map(n=>{ const s=w[n]||0,t=PLAN_TARGETS[n],cls=s<t[0]&&s>0?"low":s>t[1]?"high":"ok",pct=Math.min(100,Math.round(s/t[1]*100)); return "<div class='audit "+cls+"'><div class='m'><span>"+n+"</span><b>"+s+"</b></div><div class='s'>target "+t[0]+"-"+t[1]+" sets/wk</div><div class='bar'><div class='fill' style='width:"+pct+"%'></div></div></div>"; }).join("")+"</div>";
}
function openPlanAudit(){
  document.getElementById("detTitle").textContent="Plan audit";
  document.getElementById("detBody").innerHTML=planAuditHTML();
  detDlg.showModal();
}

/* ---------- muscle balance / weak-point finder ----------
   Purely derived from data already tracked: weekly done sets (workoutHistory.m),
   planned sets (active program), per-exercise e1RM trend (state.history entries carry
   `e` + `m`), and freshness. Flags the 1-2 weakest muscles as "Focus this week". */
function muscleTrendPct(mus){
  const cut=localDateStr(new Date(Date.now()-27*864e5)), per=[];
  Object.keys(state.history||{}).forEach(n=>{
    const es=(state.history[n]||[]).filter(l=>l.m===mus&&!l.t&&l.e>0&&l.d>=cut);
    if(es.length>=2&&es[0].e>0)per.push((es[es.length-1].e-es[0].e)/es[0].e*100);
  });
  if(!per.length)return null;
  return per.reduce((a,b)=>a+b,0)/per.length;
}
function muscleBalanceHTML(){
  const wk=weeklyMuscleSets(), plan=plannedMuscleSets();
  const rows=MUSCLES.map(mus=>{
    const done=wk[mus]||0, planned=plan[mus]||0, fresh=daysSinceTrained(mus), trend=muscleTrendPct(mus);
    let cls="ok", verdict, score=0; // higher score = weaker = more in need of focus
    if(fresh===null){ verdict="No data yet — log a workout"; cls=""; }
    else if(done===0&&fresh>=7){ verdict="Not trained in "+fresh+" days"; cls="low"; score=3+Math.min(3,fresh/7); }
    else if(planned>0&&done<planned*0.6){ verdict="Undertrained — "+done+" of "+planned+" planned sets"; cls="low"; score=3; }
    else if(trend!=null&&trend<=-3){ verdict="Regressing "+trend.toFixed(0)+"% — check recovery/food"; cls="high"; score=5; }
    else if(trend!=null&&trend<1){ verdict="Stalling — rotate an exercise or add a set"; cls="low"; score=2; }
    else if(trend!=null){ verdict="On track +"+trend.toFixed(1)+"%"; cls="ok"; }
    else { verdict="Building data — keep logging"; cls="ok"; }
    return {mus,done,planned,trend,verdict,cls,score};
  });
  // flag the weakest 1-2 muscles that actually have a problem
  rows.slice().sort((a,b)=>b.score-a.score).slice(0,2).forEach(r=>{ if(r.score>=2)r.focus=true; });
  const focus=rows.filter(r=>r.focus).map(r=>r.mus);
  const lead=focus.length?("Focus this week: "+focus.join(" + ")+"."):"No obvious weak point — keep progressing evenly.";
  return "<h3 style='margin:14px 2px 10px'>Muscle balance</h3>"+
    "<div class='insight'><b>Weak-point finder</b><br>"+esc(lead)+" Trend compares each exercise's estimated 1RM over the last 4 weeks.</div>"+
    "<div class='auditgrid'>"+rows.map(r=>{
      const pct=r.planned?Math.min(100,Math.round(r.done/r.planned*100)):0;
      return "<div class='audit "+r.cls+"'><div class='m'><span>"+(r.focus?"🎯 ":"")+r.mus+"</span><b>"+r.done+(r.planned?"/"+r.planned:"")+"</b></div><div class='s'>"+esc(r.verdict)+"</div><div class='bar'><div class='fill' style='width:"+pct+"%'></div></div></div>";
    }).join("")+"</div>";
}
function smartGrowthScorecardsHTML(){
  const weeks=smartClamp(smartMesocycleStatus().targetWeeks||6,4,8),rows=smartMuscleGrowthScorecards(weeks);
  const working=rows.filter(x=>x.isWorking===true).length,needs=rows.filter(x=>x.isWorking===false).length;
  return "<section class='growthScorecards'><div class='growthScoreHead'><div><span>IS IT WORKING?</span><h3>"+weeks+"-week muscle scorecards</h3></div><small>"+working+" working · "+needs+" need attention</small></div>"+
    "<p class='smartFinePrint'>Performance, completed effective sets, adherence and your post-workout checks are combined. This estimates training response; it does not diagnose health or guarantee muscle gain.</p>"+
    "<div class='growthScoreGrid'>"+rows.map(x=>{
      const cls=x.isWorking===true?"working":x.isWorking===false?"attention":"learning",trend=x.strengthTrendPct==null?"—":((x.strengthTrendPct>=0?"+":"")+x.strengthTrendPct+"%");
      return "<details class='growthScore "+cls+"'><summary><div><b>"+esc(x.muscle)+"</b><span>"+esc(x.status)+"</span></div><strong>"+trend+"</strong></summary>"+
        "<div class='growthMetrics'><span><b>"+x.weeklySets+"</b> sets/wk</span><span><b>"+(x.adherence==null?"—":x.adherence+"%")+"</b> adherence</span><span><b>"+x.confidence.score+"</b> confidence</span></div>"+
        "<p>"+esc(x.action)+"</p><small>Evidence: "+x.evidence.map(esc).join(" · ")+"</small></details>";
    }).join("")+"</div></section>";
}

/* ---------- shape-goal coaching + phase tracker ---------- */
function goalInsight(){
  const wk=weeklyMuscleSets(), goals=shapeGoals().map(id=>SHAPE_GOALS.find(g=>g[0]===id)).filter(Boolean), notes=[];
  goals.forEach(g=>{ const s=wk[g[2]]||0; if(s<8)notes.push(g[1]+": low this week"); else if(s>22)notes.push(g[1]+": high fatigue risk"); });
  return notes.length?notes.join(". "):"Shape goals are covered well this week.";
}

/* ---------- advanced progress coaching card ---------- */
function advancedProgressHTML(){
  const h=state.workoutHistory||[], logs=recentLogs(80), rir=logs.map(x=>x.rir).filter(x=>x!=null), ar=avg(rir);
  const last7=h.filter(e=>e.date>=localDateStr(new Date(Date.now()-6*864e5))), last30=h.filter(e=>e.date>=localDateStr(new Date(Date.now()-29*864e5)));
  const sets7=last7.reduce((a,e)=>a+(e.sets||0),0), vol30=last30.reduce((a,e)=>a+(e.vol||0),0);
  const names=improvedExerciseNames(), wk=weeklyMuscleSets();
  const highs=Object.keys(wk).filter(k=>wk[k]>20), lows=Object.keys(wk).filter(k=>wk[k]>0&&wk[k]<8);
  const coach=(highs.length?"Trim "+highs.slice(0,2).join(", ")+". ":lows.length?"Add work for "+lows.slice(0,2).join(", ")+". ":"Weekly volume looks balanced. ")+(ar==null?"Start logging RIR to unlock better load calls.":ar<=1?"Average effort is very high; avoid adding volume this week.":ar>=3?"Average effort is easy; progress load or reps.":"Effort is in the productive zone.");
  return "<div class='coachgrid'>"+
    "<div class='coachcard'><div class='k'>7-day sets</div><div class='v'>"+sets7+"</div><div class='s'>Across completed workouts</div></div>"+
    "<div class='coachcard'><div class='k'>Avg RIR</div><div class='v'>"+(ar==null?"--":ar.toFixed(1))+"</div><div class='s'>Recent hard sets</div></div>"+
    "<div class='coachcard'><div class='k'>30-day volume</div><div class='v'>"+volDisp(vol30).toLocaleString()+"</div><div class='s'>"+unit+" lifted</div></div>"+
    "<div class='coachcard'><div class='k'>Best movers</div><div class='v'>"+names.length+"</div><div class='s'>Exercises improving</div></div>"+
    "<div class='coachcard wide'><div class='k'>Coach read</div><div class='s'>"+esc(coach)+"</div></div></div>"+
    (names.length?"<h3 style='margin:12px 2px 10px'>Moving up</h3>"+names.map(x=>"<div class='coachline'><span>"+esc(x.n.replace(/_/g,' '))+"</span><b>+"+x.delta+" est</b></div>").join(""):"");
}

/* ---------- personal records (merged into the bottom of this view) ---------- */
function prsBody(){
  const pr=state.personalRecords||{}, tdy=todayStr();
  const items=Object.keys(pr).map(n=>({n:n,w:pr[n].w,r:pr[n].r,e:pr[n].e,t:pr[n].t,date:pr[n].date}));
  items.sort((a,b)=> a.date<b.date?1 : a.date>b.date?-1 : (b.e-a.e));
  const html=items.length? items.map(x=>{
    const val=x.t?("<b>"+(x.r||0)+"s hold</b><span>"+(x.w?"+"+toDisp(x.w)+" "+unit+" · ":"")+"longest hold</span>")
      :x.w?("<b>"+toDisp(x.w)+" "+unit+"</b> × "+(x.r||"–")+"<span>1RM ~ "+toDisp(x.e)+" "+unit+"</span>"):("<b>"+(x.r||0)+" reps</b><span>bodyweight best</span>");
    return "<div class='prow2'><div class='pn'>"+esc(x.n)+(x.date===tdy?" <span class='nb'>NEW</span>":"")+"<span>"+x.date+"</span></div><div class='pv'>"+val+"</div></div>";
  }).join("")
    : "<div class='empty'><div class='big'>No PRs yet</div>Finish a workout and your best lift for each exercise shows up here — and updates automatically whenever you go heavier.</div>";
  return {n:items.length,html:html};
}

/* ---------- timeline (workouts + measurements + PRs + photos, newest first) ---------- */
function openProgressTimeline(){
  const items=[];
  (state.workoutHistory||[]).forEach(w=>items.push({date:w.date,type:"Workout",title:w.title,sub:(w.sets||0)+" sets · "+volDisp(w.vol).toLocaleString()+" "+unit+(w.prs?" · "+w.prs+" PR":"")}));
  (state.measurements||[]).forEach(m=>items.push({date:m.date,type:"Measure",title:"Body measurements",sub:(m.weight?toDisp(m.weight)+" "+unit+" · ":"")+"Waist "+(m.waist||"-")+" · Chest "+(m.chest||"-")+" · Arms "+(m.arms||"-")}));
  Object.keys(state.personalRecords||{}).forEach(n=>{ const p=state.personalRecords[n]; items.push({date:p.date,type:"PR",title:n,sub:p.t?((p.r||0)+"s hold"+(p.w?" +"+toDisp(p.w)+" "+unit:"")):p.w?(toDisp(p.w)+" "+unit+" x "+(p.r||"-")+" · 1RM ~ "+toDisp(p.e)+" "+unit):((p.r||0)+" reps (bodyweight)")}); });
  (state.progressPhotos||[]).forEach((p,i)=>items.push({date:p.date,type:"Photo",title:"Progress photo",sub:"Photo "+(i+1),img:p.data}));
  items.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  document.getElementById("detTitle").textContent="Progress timeline";
  document.getElementById("detBody").innerHTML=items.length?items.slice(0,80).map(x=>"<div class='hitem'><div><div class='d'>"+esc(x.type)+" · "+esc(x.title)+"</div><div class='m'>"+esc(x.date)+" · "+esc(x.sub||"")+"</div></div>"+(x.img?"<img src='"+x.img+"' style='width:54px;height:72px;object-fit:cover;border-radius:8px'>":"")+"</div>").join(""):"<div class='empty'><div class='big'>No timeline yet</div>Log workouts, measurements, PRs or photos.</div>";
  detDlg.showModal();
}

/* ---------- main render (combines: plan audit, advanced progress, shape/phase coach,
 * yearly bento + heat map + recent workouts, personal records — in that visual order) ---------- */
/* ---------- History: month calendar of trained days ---------- */
let _calYear=null, _calMon=null;
function calendarInit(){ if(_calYear==null){ const t=new Date(); _calYear=t.getFullYear(); _calMon=t.getMonth(); } }
function calMove(delta){ _calMon+=delta; if(_calMon<0){_calMon=11;_calYear--;} if(_calMon>11){_calMon=0;_calYear++;} renderStats(); }
function trainedDatesSet(){ const s=new Set(); (state.workoutHistory||[]).forEach(e=>{ if(e.date)s.add(e.date); }); return s; }
function calendarHTML(){
  calendarInit();
  const trained=trainedDatesSet(), h=state.workoutHistory||[];
  const ym=_calYear+"-"+String(_calMon+1).padStart(2,"0");
  const first=new Date(_calYear,_calMon,1), startWd=(first.getDay()+6)%7, daysInMonth=new Date(_calYear,_calMon+1,0).getDate();
  const monthName=first.toLocaleString("default",{month:"long"});
  let cells="";
  for(let i=0;i<startWd;i++) cells+="<div class='calday empty'></div>";
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=ym+"-"+String(d).padStart(2,"0");
    const hasWorkout=trained.has(dateStr),cls="calday"+(hasWorkout?" trained":"")+(dateStr===todayStr()?" today":"");
    cells+=hasWorkout
      ?"<button type='button' class='"+cls+"' data-date='"+dateStr+"' aria-label='"+dateStr+", workout completed' title='Open this day&#39;s workout'>"+d+"<span class='calStatus' aria-hidden='true'>✓</span></button>"
      :"<div class='"+cls+"' aria-label='"+dateStr+", no workout'>"+d+"</div>";
  }
  const thisMonthCount=[...trained].filter(dt=>dt.slice(0,7)===ym).length;
  return "<div class='calstats'>"+
    "<div class='c'><b>"+thisMonthCount+"</b><span>This month</span></div>"+
    "<div class='c'><b class='accent'>"+trainingWeekStreak()+"</b><span>Week streak</span></div>"+
    "<div class='c'><b>"+h.length+"</b><span>Total logged</span></div>"+
    "</div>"+
    "<div class='calhd'><button data-cal='-1'>‹</button><div class='m'>"+monthName+" "+_calYear+"</div><button data-cal='1'>›</button></div>"+
    "<div class='calwd'><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div>"+
    "<div class='calgrid'>"+cells+"</div>"+
    "<div class='calhint'>Tap a highlighted date to see only that day's workout and exercises.</div>";
}

/* ---------- completed workout correction ----------
   New sessions keep their complete per-set snapshot. Editing works against a detached
   draft and commits atomically, then asks the history layer to rebuild derived PR,
   recovery and progression data through recalculateTrainingDerivedData() when present. */
let _workoutEditIndex=-1,_workoutEditDraft=null;
const WORKOUT_EDIT_MUSCLES=MUSCLE_PICKER;
function completedSetText(s,i,timed){
  const type=(s.type&&s.type!=="work")?(" · "+String(s.type).toUpperCase()):"";
  if(timed||s.type==="t40")return "Set "+(i+1)+": "+(s.r||0)+" sec"+(s.w?" · +"+toDisp(s.w)+" "+unit:"")+type;
  return "Set "+(i+1)+": "+(s.w?toDisp(s.w)+" "+unit+" × ":"")+(s.r||0)+(s.rir!=null?" · "+s.rir+" RIR":"")+type;
}
function completedExerciseHTML(x){
  const sets=Array.isArray(x.sets)?x.sets:[],timed=isTimedExercise({n:x.n,r:x.target||""});
  /* Every warm-up row is still LISTED (it is part of what happened, and completedSetText
     labels it) but only working sets are counted — a warm-up is not a series. */
  const work=workSetsOf(sets).length;
  return "<details class='historyExercise' open><summary><div><b>"+esc(x.n||"Exercise")+"</b><span>"+esc(x.m||"")+" · "+work+"/"+(x.plannedSets||targetSets(x.target||"")||work)+" sets</span></div><strong>"+work+" done</strong></summary>"+
    "<div class='historySetList'>"+(sets.length?sets.map((s,i)=>"<div><span>"+esc(completedSetText(s,i,timed))+"</span></div>").join(""):"<p>No completed sets saved.</p>")+"</div></details>";
}
function workoutActualSets(sess){
  if(Array.isArray(sess.detail))return sess.detail.reduce((n,x)=>n+workSetsOf(x.sets).length,0);
  return sess.sets||0;
}
function workoutPlannedSets(sess){
  if(sess.plannedSets!=null)return +sess.plannedSets||0;
  if(Array.isArray(sess.detail))return sess.detail.reduce((n,x)=>n+(+x.plannedSets||targetSets(x.target||"")||0),0);
  return sess.sets||0;
}
function plannedVsActualHTML(limit){
  const rows=(state.workoutHistory||[]).slice(0,limit||6).map(s=>{
    /* No planned sets means there is nothing to compare against — a session logged
       before plannedSets was recorded, or one where every exercise was skipped. Reporting
       that as "0/0 · 100% completed" reads as a perfect session; say "no plan recorded". */
    const actual=workoutActualSets(s),planned=workoutPlannedSets(s),known=planned>0;
    const pct=known?Math.round(actual/planned*100):null;
    return "<button class='adherenceRow' data-open-date='"+escAttr(s.date||"")+"'><span><b>"+esc(s.title||"Workout")+"</b><small>"+esc(s.date||"")+"</small></span><span><strong>"+(known?actual+"/"+planned:actual+" sets")+"</strong><small>"+(known?Math.min(999,pct)+"% completed":"no plan recorded")+"</small></span><i style='--adherence:"+(known?Math.min(100,pct):0)+"%'></i></button>";
  }).join("");
  return "<section class='adherenceCard'><div class='adherenceHead'><div><span>PLAN VS ACTUAL</span><h3>Session adherence</h3></div><small>Last "+Math.min(limit||6,(state.workoutHistory||[]).length)+" workouts</small></div>"+(rows||"<p class='muted'>Finish a workout to compare planned and completed sets.</p>")+"</section>";
}
function ensureWorkoutIdentity(sess){
  if(!sess.id)sess.id="wo_legacy_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
  if(!sess.finishedAt)sess.finishedAt=new Date((sess.date||todayStr())+"T12:00:00").toISOString();
}
function openCompletedWorkoutEditor(index){
  const source=(state.workoutHistory||[])[index];if(!source)return;
  _workoutEditIndex=index;_workoutEditDraft=JSON.parse(JSON.stringify(source));
  _workoutEditDraft._editorLegacyNoDetail=!Array.isArray(source.detail);
  ensureWorkoutIdentity(_workoutEditDraft);
  renderCompletedWorkoutEditor();
  if(!detDlg.open)detDlg.showModal();
}
function workoutEditorSetRowHTML(s,ei,si){
  const type=s.type||"work";
  return "<div class='workoutEditSet' data-set='"+si+"'>"+
    "<span>"+(si+1)+"</span>"+
    "<label><small>Weight ("+unit+")</small><input class='wes-w' inputmode='decimal' value='"+(s.w?toDisp(s.w):"")+"' aria-label='Set "+(si+1)+" weight'></label>"+
    "<label><small>Reps/sec</small><input class='wes-r' inputmode='numeric' value='"+(s.r||"")+"' aria-label='Set "+(si+1)+" repetitions or seconds'></label>"+
    "<label><small>RIR</small><input class='wes-rir' inputmode='numeric' min='0' max='4' value='"+(s.rir!=null?s.rir:"")+"' aria-label='Set "+(si+1)+" reps in reserve'></label>"+
    "<label><small>Type</small><select class='wes-type' aria-label='Set "+(si+1)+" type'>"+["work","drop","fail","t40","lp"].map(t=>"<option value='"+t+"'"+(type===t?" selected":"")+">"+t.toUpperCase()+"</option>").join("")+"</select></label>"+
    "<button data-we='remove-set' data-e='"+ei+"' data-s='"+si+"' aria-label='Remove set "+(si+1)+"'>×</button></div>";
}
function workoutEditorExerciseHTML(x,ei){
  const sets=Array.isArray(x.sets)?x.sets:[];
  const muscles=WORKOUT_EDIT_MUSCLES.indexOf(x.m)>=0?WORKOUT_EDIT_MUSCLES:[x.m||"Other"].concat(WORKOUT_EDIT_MUSCLES);
  return "<section class='workoutEditExercise' data-ex='"+ei+"'><div class='workoutEditExHead'><b>Exercise "+(ei+1)+"</b><button data-we='remove-exercise' data-e='"+ei+"'>Remove</button></div>"+
    "<label class='workoutEditWide'><small>Exercise name</small><input class='wee-name' maxlength='80' value='"+escAttr(x.n||"")+"' aria-label='Exercise name'></label>"+
    "<div class='workoutEditPair'><label><small>Muscle</small><select class='wee-muscle'>"+muscles.map(m=>"<option"+(m===x.m?" selected":"")+">"+esc(m)+"</option>").join("")+"</select></label>"+
    "<label><small>Target</small><input class='wee-target' maxlength='32' value='"+escAttr(x.target||"")+"' aria-label='Planned set and rep target'></label>"+
    "<label><small>Planned sets</small><input class='wee-planned' type='number' min='0' max='20' value='"+(+x.plannedSets||targetSets(x.target||"")||sets.length)+"'></label></div>"+
    "<div class='workoutEditSets'>"+sets.map((s,si)=>workoutEditorSetRowHTML(s,ei,si)).join("")+"</div>"+
    "<button class='workoutEditAdd' data-we='add-set' data-e='"+ei+"'>+ Add completed set</button></section>";
}
function collectCompletedWorkoutEditor(){
  const d=_workoutEditDraft;if(!d)return;
  const title=document.getElementById("weTitle"),date=document.getElementById("weDate"),mins=document.getElementById("weDuration"),feel=document.getElementById("weFeel"),note=document.getElementById("weNote");
  if(title)d.title=safeText(title.value,80)||"Workout";
  if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date.value))d.date=date.value;
  if(mins)d.dur=Math.max(0,Math.round((+mins.value||0)*60));
  if(feel)d.feel=+feel.value||0;
  if(note)d.note=safeText(note.value,280);
  d.detail=[...document.querySelectorAll("#detBody .workoutEditExercise")].map(exEl=>{
    const old=(d.detail||[])[+exEl.dataset.ex]||{},name=exEl.querySelector(".wee-name"),muscle=exEl.querySelector(".wee-muscle"),target=exEl.querySelector(".wee-target"),planned=exEl.querySelector(".wee-planned");
    const sets=[...exEl.querySelectorAll(".workoutEditSet")].map(row=>{
      const w=parseFloat(row.querySelector(".wes-w").value),r=parseInt(row.querySelector(".wes-r").value),rir=parseInt(row.querySelector(".wes-rir").value),type=row.querySelector(".wes-type").value;
      return {w:isNaN(w)?0:toKg(w),r:isNaN(r)?0:Math.max(0,r),rir:isNaN(rir)?null:Math.max(0,Math.min(4,rir)),type:type};
    });
    return Object.assign({},old,{n:safeText(name.value,80)||"Exercise",m:muscle.value,target:safeText(target.value,32),plannedSets:Math.max(0,+planned.value||0),sets:sets});
  });
}
function renderCompletedWorkoutEditor(){
  const d=_workoutEditDraft;if(!d)return;
  document.getElementById("detTitle").textContent="Correct completed workout";
  const legacy=!!d._editorLegacyNoDetail;
  document.getElementById("detBody").innerHTML="<div class='workoutEditIntro' role='note'><b>Your corrections update future training</b><span>Weights, reps, RIR, recovery, records and progression are recalculated when you save.</span></div>"+
    "<div class='workoutEditMeta'><label class='workoutEditWide'><small>Workout name</small><input id='weTitle' maxlength='80' value='"+escAttr(d.title||"Workout")+"'></label>"+
    "<label><small>Date</small><input id='weDate' type='date' value='"+escAttr(d.date||todayStr())+"'></label><label><small>Duration (minutes)</small><input id='weDuration' type='number' min='0' max='600' value='"+Math.round((d.dur||0)/60)+"'></label>"+
    "<label><small>How it felt</small><select id='weFeel'>"+[[0,"Not set"],[1,"Rough"],[2,"Below normal"],[3,"Okay"],[4,"Strong"],[5,"Excellent"]].map(x=>"<option value='"+x[0]+"'"+(+d.feel===x[0]?" selected":"")+">"+x[1]+"</option>").join("")+"</select></label>"+
    "<label class='workoutEditWide'><small>Session note</small><textarea id='weNote' maxlength='280'>"+esc(d.note||"")+"</textarea></label></div>"+
    (legacy?"<div class='loadwarn'>This older workout only saved summary totals. You can correct its name, date, duration and notes, or add the missing exercises below.</div>":"")+
    "<div id='workoutEditExercises'>"+(Array.isArray(d.detail)?d.detail.map(workoutEditorExerciseHTML).join(""):"")+"</div>"+
    "<button class='workoutEditAdd workoutEditAddExercise' data-we='add-exercise'>+ Add exercise</button>"+
    "<div class='btnrow'><button id='saveWorkoutCorrection'>Save corrections</button></div>";
  document.querySelectorAll("#detBody [data-we]").forEach(b=>b.onclick=()=>{
    collectCompletedWorkoutEditor();
    const a=b.dataset.we,ei=+b.dataset.e,si=+b.dataset.s,d=_workoutEditDraft;
    d.detail=Array.isArray(d.detail)?d.detail:[];
    if(a==="add-exercise")d.detail.push({n:"New exercise",m:"Chest",target:"3 x 8-12",plannedSets:3,sets:[]});
    else if(a==="remove-exercise")d.detail.splice(ei,1);
    else if(a==="add-set")d.detail[ei].sets.push({w:0,r:0,rir:null,type:"work"});
    else if(a==="remove-set")d.detail[ei].sets.splice(si,1);
    renderCompletedWorkoutEditor();
  });
  document.getElementById("saveWorkoutCorrection").onclick=saveCompletedWorkoutCorrection;
}
function saveCompletedWorkoutCorrection(){
  if(_workoutEditIndex<0||!_workoutEditDraft)return;
  collectCompletedWorkoutEditor();
  const d=_workoutEditDraft,detail=Array.isArray(d.detail)?d.detail:[];
  ensureWorkoutIdentity(d);
  if(!d._editorLegacyNoDetail||detail.length){
    /* Warm-ups are excluded from every recomputed figure, exactly as the live finish path
       and the history rebuild do. Without this, opening a past workout in the editor and
       saving it re-counted its ramp sets as working sets, tonnage and muscle dose. */
    d.sets=detail.reduce((n,x)=>n+workSetsOf(x.sets).length,0);
    d.plannedSets=detail.reduce((n,x)=>n+(+x.plannedSets||0),0);
    d.ex=detail.filter(x=>workSetsOf(x.sets).length).length;d.plannedEx=detail.length;
    d.vol=Math.round(detail.reduce((sum,x)=>sum+workSetsOf(x.sets).reduce((n,s)=>n+((s.type==="t40"||isTimedExercise({n:x.n,r:x.target||""}))?0:((s.w||0)*(s.r||0))),0),0));
    d.m={};detail.forEach(x=>{const w=workSetsOf(x.sets).length;if(x.m&&w)d.m[x.m]=(d.m[x.m]||0)+w;});
  }else delete d.detail;
  delete d._editorLegacyNoDetail;
  d.editedAt=new Date().toISOString();
  state.workoutHistory[_workoutEditIndex]=d;
  if(typeof recalculateTrainingDerivedData==="function")recalculateTrainingDerivedData({reason:"workout-edit",sessionId:d.id});
  save();detDlg.close();renderStats();toast("Workout corrected and training data recalculated");
  _workoutEditIndex=-1;_workoutEditDraft=null;
}

/* Day detail is date-filtered and now uses the exact per-set snapshot belonging to each
   session. Older sessions fall back to their historic top-set records. */
function openDayDetail(dateStr){
  const all=state.workoutHistory||[], sessions=all.map((s,i)=>({s:s,i:i})).filter(x=>x.s.date===dateStr);
  const nice=new Date(dateStr+"T12:00:00");
  document.getElementById("detTitle").textContent=isNaN(nice)?dateStr:nice.toLocaleDateString("default",{weekday:"long",month:"long",day:"numeric"});
  let hd="";
  sessions.forEach(({s:sess,i:index})=>{
    const actual=workoutActualSets(sess),planned=workoutPlannedSets(sess),pct=planned?Math.round(actual/planned*100):100;
    hd+="<section class='daySession'><div class='daySessionHead'><div><span>COMPLETED SESSION</span><h3>"+esc(sess.title||"Workout")+"</h3></div><button data-edit-workout='"+index+"'>Edit</button></div>"+
      "<div class='stat3'><div class='s'><b>"+(sess.dur?fmt(sess.dur):"—")+"</b><span>duration</span></div><div class='s'><b>"+actual+"/"+planned+"</b><span>actual / planned</span></div><div class='s'><b>"+volDisp(sess.vol||0).toLocaleString()+"</b><span>"+unit+" volume</span></div></div>"+
      "<div class='dayAdherence' aria-label='"+Math.min(999,pct)+" percent of planned sets completed'><i style='width:"+Math.min(100,pct)+"%'></i><span>"+pct+"% of planned sets</span></div>"+
      (sess.prs?"<p class='daySessionNote'>🏆 "+sess.prs+" personal record"+(sess.prs>1?"s":"")+" that day</p>":"")+
      (sess.feel?"<p class='daySessionNote'>"+["","😫","😕","🙂","💪","🔥"][sess.feel]+" Felt "+["","rough","below normal","okay","strong","excellent"][sess.feel]+"</p>":"")+
      (sess.note?"<p class='daySessionNote'>📝 "+esc(sess.note)+"</p>":"")+
      (Array.isArray(sess.detail)&&sess.detail.length?"<div class='historyExercises'>"+sess.detail.map(completedExerciseHTML).join("")+"</div>":"<p class='muted'>This older session has summary data only.</p>")+"</section>";
  });
  if(!sessions.some(x=>Array.isArray(x.s.detail)&&x.s.detail.length)){
    const lines=[];
    Object.keys(state.history||{}).forEach(n=>(state.history[n]||[]).forEach(l=>{
      if(l.d!==dateStr)return;
      const top=l.t?((l.r||0)+"s hold"+(l.w?" +"+toDisp(l.w)+" "+unit:"")):l.w?(toDisp(l.w)+" "+unit+" × "+(l.r||"–")+(l.rir!=null?" · "+l.rir+" RIR":"")):((l.r||0)+" reps");
      lines.push({n:n,m:l.m||"",top:top});
    }));
    if(lines.length)hd+="<h3>Legacy top sets</h3>"+lines.map(x=>"<div class='hitem'><div><div class='d'>"+esc(x.n)+"</div><div class='m'>"+esc(x.m)+"</div></div><div class='v'>"+esc(x.top)+"</div></div>").join("");
  }
  document.getElementById("detBody").innerHTML=sessions.length?("<div aria-label='Top set per exercise and full set history'>"+hd+"</div>"):"<p class='muted'>No finished workout on this date.</p>";
  document.querySelectorAll("#detBody [data-edit-workout]").forEach(b=>b.onclick=()=>openCompletedWorkoutEditor(+b.dataset.editWorkout));
  if(!detDlg.open)detDlg.showModal();
}

/* Progress used to be one endless scroll (calendar -> plan audit -> advanced-progress ->
   muscle balance -> shape coach -> bento -> weekly target -> heat map, all stacked). Split
   into 3 focused sub-tabs, same segmented-control pattern as the Train tab's woTab: each
   tab is short enough to take in at a glance, matching how Today's hero was decluttered.
   No function here is new — every section below already existed, just regrouped. */
let statsTab="overview";
function renderStats(){
  const v=document.getElementById("v-stats"), h=state.workoutHistory||[], pr=state.personalRecords||{}, yr=new Date().getFullYear();
  let vol=0; h.filter(e=>e.date.slice(0,4)==yr).forEach(e=>vol+=e.vol||0);
  const prs=Object.keys(pr).length, insight=readinessText();
  let inner;
  if(statsTab==="overview"){
    inner=calendarHTML()+
      "<div class='bento'><div class='b hot'><div class='ic'>PR</div><div class='n'>"+prs+"</div><div class='l'>personal records</div></div><div class='b'><div class='ic'>Vol</div><div class='n'>"+volDisp(vol).toLocaleString()+"</div><div class='l'>"+unit+" this year</div></div><div class='b wide'><div class='ic'>Coach</div><div class='l'>"+insight+"</div></div></div>"+
      weeklyTargetHTML()+
      plannedVsActualHTML(6)+
      "<div class='minirow'><button onclick='openProgressTimeline()'>Full timeline</button><button onclick='openWeeklyReview()'>Weekly review</button></div>";
  } else if(statsTab==="analysis"){
    inner=smartGrowthScorecardsHTML()+
      (typeof volumeResponseHTML==="function"?"<h3 style='margin:14px 2px 10px'>Your volume response</h3>"+volumeResponseHTML():"")+
      (typeof smartCoverageHTML==="function"?"<h3 style='margin:14px 2px 10px'>Exercise coverage</h3>"+smartCoverageHTML():"")+
      planAuditHTML()+
      advancedProgressHTML()+
      muscleBalanceHTML()+
      "<h3 style='margin:6px 2px 10px'>Muscle heat map</h3>"+volumeHeatHTML()+
      "<div class='minirow'><button onclick='openPlanAudit()'>Full plan audit</button><button onclick='openRotationPlanner()'>Rotations</button></div>";
  } else {
    const prsSection=prsBody();
    inner="<div class='insight'><b>Shape coach</b><br>"+esc(goalInsight())+"<br>"+esc(phaseInfo().name)+" phase: "+esc(phaseInfo().advice)+"</div>"+
      "<div class='minirow'><button onclick='openMeasurements()'>Measurements</button><button onclick='openPhotos()'>Progress photos</button></div>"+
      "<h3 style='margin:14px 2px 10px'>Personal records <span style='color:var(--muted);font-weight:400;font-size:12px'>· "+prsSection.n+" tracked</span></h3>"+prsSection.html;
  }
  v.innerHTML="<div class='topbar'><div class='t'>Progress</div><div class='r'>"+yr+"</div></div>"+
    "<div class='seg'><button class='"+(statsTab==="overview"?"on":"")+"' data-s='overview'>Overview</button><button class='"+(statsTab==="analysis"?"on":"")+"' data-s='analysis'>Analysis</button><button class='"+(statsTab==="body"?"on":"")+"' data-s='body'>Body</button></div>"+
    "<main>"+inner+"</main>";
  v.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{ statsTab=b.dataset.s; renderStats(); });
  v.querySelectorAll("[data-cal]").forEach(b=>b.onclick=()=>calMove(+b.dataset.cal));
  // The calendar is the single entry point for date-filtered workout/exercise details.
  v.querySelectorAll(".calday[data-date]").forEach(el=>el.onclick=()=>openDayDetail(el.dataset.date));
  v.querySelectorAll("[data-open-date]").forEach(el=>el.onclick=()=>openDayDetail(el.dataset.openDate));
}
