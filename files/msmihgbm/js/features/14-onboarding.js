/* First-run flow: profile basics, training days/week, equipment, priority ranking. */
let ob={},obStep=0;
const OB_DAYS=[{n:3,id:"3fb"},{n:4,id:"4ul"},{n:5,id:"5up"},{n:6,id:"6ppl"}];
const OB_EQ=[{v:"full",t:"Full gym",d:"Barbells, machines, cables"},{v:"db",t:"Dumbbells only",d:"Home rack / limited gym"},{v:"home",t:"Home / bodyweight",d:"Minimal kit & bands"}];
const OB_EXP=[{v:"beginner",t:"Beginner",d:"Less than 1 consistent year"},{v:"intermediate",t:"Intermediate",d:"About 1-4 consistent years"},{v:"advanced",t:"Advanced",d:"More than 4 consistent years"}];
function openOnboard(pre){ ob=pre&&profile?Object.assign({equip:"full"},profile,{days:(PROGRAMS[activeProg]?PROGRAMS[activeProg].meta.days:5),priority:getPriority().slice()}):{sex:"M",days:5,equip:"full",priority:MUSCLES.slice()}; obStep=0; document.getElementById("onb").classList.add("on"); obRender(); }
function obFinish(){ profile={sex:ob.sex,age:ob.age,height:ob.height,weight:ob.weight,priority:ob.priority||MUSCLES.slice(),equip:ob.equip||"full",
    trainingExperience:ob.trainingExperience||"intermediate",sessionMinutes:+ob.sessionMinutes||60,
    equipmentList:ob.equipmentList||[],excludedExercises:ob.excludedExercises||[],painAreas:ob.painAreas||[]};
  activeProg=(OB_DAYS.find(x=>x.n==ob.days)||{id:"5up"}).id; state.profile=profile; state.programId=activeProg;
  if(ob.weight){state.bodyweightLog=state.bodyweightLog||[];const t=todayStr();if(!state.bodyweightLog.find(x=>x.date===t))state.bodyweightLog.push({date:t,kg:ob.weight}); native("logHealthWeight",ob.weight,Date.now());}
  save(); document.getElementById("onb").classList.remove("on"); curDay=0; selWeekday=null; buildActive(); nav("plan"); toast("Your plan is ready 💪"); }
function obPrio(){ const n=ob.priority.length; const box=document.getElementById("obPrioBox"); if(!box)return;
  box.innerHTML=ob.priority.map((m,i)=>{const c=i<2?"rk hot":(i>=n-2?"rk cold":"rk");return "<div class='prow'><span class='"+c+"'>"+(i+1)+"</span><span class='pn'>"+m+"</span><button class='mv' data-d='-1' data-i='"+i+"'"+(i===0?" disabled":"")+">↑</button><button class='mv' data-d='1' data-i='"+i+"'"+(i===n-1?" disabled":"")+">↓</button></div>";}).join("");
  box.querySelectorAll(".mv").forEach(b=>b.onclick=()=>{const i=+b.dataset.i,j=i+ +b.dataset.d;if(j<0||j>=ob.priority.length)return;const t=ob.priority[i];ob.priority[i]=ob.priority[j];ob.priority[j]=t;obPrio();}); }
function obRender(){ const T=7; document.getElementById("onbBar").style.width=Math.round((obStep+1)/T*100)+"%"; const el=document.getElementById("onbStep");
  if(obStep===0){ el.innerHTML="<h2>Welcome 💪</h2><div class='sub'>Let's build your plan in under a minute. Data stays on your phone.</div><div class='obo'><div class='t'>Personalised training</div><div class='d'>Choose your days, equipment & priorities — we build the program.</div></div>"+
    // Manual restore path for reinstalls: the silent Downloads auto-restore only works
    // after an app-data wipe (same install owns the MediaStore entry) — after a true
    // uninstall the new install can't read the old file, so offer a file picker here.
    "<button class='obo' id='obRestoreBtn'><div class='t'>Been here before?</div><div class='d'>Restore your workouts from a GymTracker backup file.</div></button><input id='obRestoreFile' type='file' accept='application/json,.json' style='display:none'>";
    el.querySelector("#obRestoreBtn").onclick=()=>el.querySelector("#obRestoreFile").click();
    el.querySelector("#obRestoreFile").onchange=e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader();
      rd.onload=()=>{ try{ restoreBackupText(rd.result); document.getElementById("onb").classList.remove("on"); toast("Welcome back — data restored 💪"); }
        catch(err){ toast("That file isn't a valid GymTracker backup"); } };
      rd.readAsText(f); }; }
  else if(obStep===1){ el.innerHTML="<h2>About you</h2><div class='sub'>For BMI and your bodyweight log. Optional.</div>"+
    "<div class='fld'><label>Sex</label><div class='segm' id='sx'><button data-v='M'>Male</button><button data-v='F'>Female</button></div></div>"+
    "<div class='fld'><label>Age</label><input id='ag' inputmode='numeric' value='"+(ob.age||"")+"'></div>"+
    "<div class='fld'><label>Height (cm)</label><input id='hh' inputmode='numeric' value='"+(ob.height||"")+"'></div>"+
    "<div class='fld'><label>Weight ("+unit+")</label><input id='ww' inputmode='decimal' value='"+(ob.weight!=null?toDisp(ob.weight):"")+"'></div><div class='bmi' id='bm'><span>Enter height & weight</span></div>";
    const sx=el.querySelector("#sx"); sx.querySelectorAll("button").forEach(b=>{if(b.dataset.v===ob.sex)b.classList.add("on");b.onclick=()=>{ob.sex=b.dataset.v;sx.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");};});
    const up=()=>{ob.age=+el.querySelector("#ag").value||null;ob.height=+el.querySelector("#hh").value||null;ob.weight=toKg(el.querySelector("#ww").value);const bm=el.querySelector("#bm");const b=(ob.height&&ob.weight)?Math.round(ob.weight/((ob.height/100)**2)*10)/10:null;bm.innerHTML=b?("<b>"+b+"</b> <span>BMI · "+(b<18.5?"underweight":b<25?"healthy":b<30?"overweight":"obese")+"</span>"):"<span>Enter height & weight</span>";};
    ["#ag","#hh","#ww"].forEach(s=>el.querySelector(s).oninput=up); up(); }
  else if(obStep===2){ el.innerHTML="<h2>How many days a week?</h2><div class='sub'>Pick what you can commit to.</div>"+OB_DAYS.map(d=>{const p=PROGRAMS[d.id];return "<button class='obo"+(ob.days==d.n?" on":"")+"' data-n='"+d.n+"'><div class='t'>"+d.n+" days · "+p.name.replace(/^\d-Day /,"")+"</div><div class='d'>"+p.meta.type+" — "+p.meta.best+"</div></button>";}).join("");
    el.querySelectorAll(".obo").forEach(b=>b.onclick=()=>{ob.days=+b.dataset.n;el.querySelectorAll(".obo").forEach(x=>x.classList.remove("on"));b.classList.add("on");}); }
  else if(obStep===3){ el.innerHTML="<h2>Your equipment</h2><div class='sub'>We auto-pick variations you can do.</div>"+OB_EQ.map(q=>"<button class='obo"+((ob.equip||"full")===q.v?" on":"")+"' data-v='"+q.v+"'><div class='t'>"+q.t+"</div><div class='d'>"+q.d+"</div></button>").join("");
    el.querySelectorAll(".obo").forEach(b=>b.onclick=()=>{ob.equip=b.dataset.v;el.querySelectorAll(".obo").forEach(x=>x.classList.remove("on"));b.classList.add("on");}); }
  else if(obStep===4){
    const pains=["Shoulder","Elbow","Wrist","Lower back","Hip","Knee","Ankle"];
    el.innerHTML="<h2>Training constraints</h2><div class='sub'>This keeps generated workouts realistic and pain-aware.</div>"+
      "<div class='fld'><label>Experience</label><div class='segm' id='obExp'>"+OB_EXP.map(x=>"<button data-v='"+x.v+"'>"+x.t+"</button>").join("")+"</div></div>"+
      "<div class='fld'><label>Typical session length</label><select id='obMins'>"+[30,45,60,75,90].map(x=>"<option value='"+x+"'"+((ob.sessionMinutes||60)==x?" selected":"")+">"+x+" minutes</option>").join("")+"</select></div>"+
      "<div class='fld'><label>Exact equipment (optional, comma-separated)</label><input id='obExactEq' value='"+escAttr((ob.equipmentList||[]).join(", "))+"' placeholder='cables, dumbbells, hack squat'></div>"+
      "<div class='fld'><label>Exercises to exclude (optional)</label><input id='obExcluded' value='"+escAttr((ob.excludedExercises||[]).join(", "))+"' placeholder='Upright row, weighted dips'></div>"+
      "<div class='fld'><label>Pain or joint constraints</label><div class='goalgrid' id='obPain'>"+pains.map(x=>"<button data-v='"+x+"' class='"+((ob.painAreas||[]).includes(x)?"on":"")+"'>"+x+"</button>").join("")+"</div></div>";
    const exp=el.querySelector("#obExp");exp.querySelectorAll("button").forEach(b=>{if(b.dataset.v===(ob.trainingExperience||"intermediate"))b.classList.add("on");b.onclick=()=>{ob.trainingExperience=b.dataset.v;exp.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));};});
    el.querySelector("#obMins").onchange=e=>ob.sessionMinutes=+e.target.value;
    el.querySelector("#obExactEq").oninput=e=>ob.equipmentList=e.target.value.split(",").map(x=>x.trim()).filter(Boolean);
    el.querySelector("#obExcluded").oninput=e=>ob.excludedExercises=e.target.value.split(",").map(x=>x.trim()).filter(Boolean);
    el.querySelectorAll("#obPain button").forEach(b=>b.onclick=()=>{const a=ob.painAreas=ob.painAreas||[],i=a.indexOf(b.dataset.v);if(i>=0)a.splice(i,1);else a.push(b.dataset.v);b.classList.toggle("on",i<0);});
  }
  /* Count comes from the list itself — it read a hardcoded "8" while the app tracked 9
     muscles, so the screen contradicted the rows directly under it. */
  else if(obStep===5){ el.innerHTML="<h2>Rank your priorities</h2><div class='sub'>1 (most) → "+ob.priority.length+" (least). Priorities guide volume, but never override recovery.</div><div id='obPrioBox'></div>"; obPrio(); }
  else { const pid=(OB_DAYS.find(x=>x.n==ob.days)||{id:"5up"}).id,p=PROGRAMS[pid],b=(ob.height&&ob.weight)?Math.round(ob.weight/((ob.height/100)**2)*10)/10:null,eq=(OB_EQ.find(x=>x.v===(ob.equip||"full"))||{}).t;
    el.innerHTML="<h2>You're all set</h2><div class='sub'>Tap Start to begin.</div><div class='obo'><div class='t'>"+p.name+"</div><div class='d'>"+p.meta.type+" · "+ob.days+" days/week · "+eq+" · "+(ob.sessionMinutes||60)+" min<br>Top priority: "+ob.priority.slice(0,2).join(", ")+(b?" · BMI "+b:"")+"</div></div>"; }
  document.getElementById("onbBack").style.visibility=obStep===0?"hidden":"visible";
  document.getElementById("onbNext").textContent=obStep>=6?"Start training":"Continue";
}
document.getElementById("onbNext").onclick=()=>{ if(obStep>=6)obFinish(); else {obStep++;obRender();} };
document.getElementById("onbBack").onclick=()=>{ if(obStep>0){obStep--;obRender();} };
