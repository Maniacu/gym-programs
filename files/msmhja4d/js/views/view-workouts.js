/* Train tab: program picker (built-in + custom programs) and the custom workout builder. */
let woTab="programs";

function progInfo(pid){ const p=PROGRAMS[pid], cur=pid===activeProg; document.getElementById("detTitle").textContent=p.name;
  const allMus=[...new Set(p.days.reduce((a,d)=>a.concat(d.mus||[]),[]))];
  document.getElementById("detBody").innerHTML="<p><b style='color:var(--accent2)'>"+DIFF[pid]+"</b> · "+p.meta.type+" · "+p.meta.days+" days/week</p><p style='color:var(--muted)'>"+p.meta.best+"</p>"+
    bodyHeatmapSVG(allMus)+
    p.days.map(d=>{
      const setsTotal=d.ex.reduce((a,x)=>a+targetSets(x.opts[0].r),0);
      return "<h3 style='margin:16px 2px 8px'>"+esc(d.day)+" — "+esc(d.title)+" <span style='color:var(--muted);font-weight:400;font-size:12px'>· "+d.ex.length+" ex · "+setsTotal+" sets</span></h3>"+
        d.ex.map(x=>{ const o=x.opts[0]; return "<div class='opt' data-pex data-n='"+escAttr(o.n)+"' data-img='"+escAttr(o.img)+"' data-cue='"+escAttr(o.cue||"")+"' data-r='"+escAttr(o.r)+"' data-m='"+escAttr(x.m)+"'><img alt='' src='"+escAttr(o.img)+"' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(o.n)+"</div><div class='s'>"+esc(x.m)+" · "+esc(o.r)+"</div></div></div>"; }).join("");
    }).join("")+
    "<div class='btnrow'><button onclick=\"setProgram('"+pid+"');detDlg.close()\">"+(cur?"Go to today ▶":"Use this program")+"</button></div>";
  document.querySelectorAll("#detBody [data-pex]").forEach(el=>el.onclick=()=>previewSwapExercise({n:el.dataset.n,img:el.dataset.img,cue:el.dataset.cue,r:el.dataset.r,m:el.dataset.m}));
  detDlg.showModal(); }

/* ---------- custom workout builder (minimal) ---------- */
/* Stable per-workout id: slot state (today's sets, skip flags) and the resume-session
   target key off this, NOT the array index — deleting a workout used to shift every
   later workout's in-progress state onto the wrong one. */
function customWorkoutId(w,i){ if(!w.id){ w.id="cw"+Date.now().toString(36)+"_"+i; save(); } return w.id; }
function newCustom(){ askText("New workout","Name your workout","My Workout",nm=>{ nm=safeText(nm,40); if(!nm)return;
  state.customWorkouts=state.customWorkouts||[]; state.customWorkouts.push({id:"cw"+Date.now().toString(36),name:nm,ex:[]}); save();
  editCustom(state.customWorkouts.length-1); }); }
function delCustom(i){ if(confirm("Delete this workout?")){ state.customWorkouts.splice(i,1); save(); detDlg.close(); renderWorkouts(); } }
function startCustom(i){ const w=state.customWorkouts[i];
  w.ex=w.ex.filter(e=>!e.__bonusDate||e.__bonusDate===todayStr()); // expire one-day bonus finishers
  if(!w.ex.length){ toast("Add exercises first"); editCustom(i); return; }
  logCustom={name:w.name,ex:w.ex,key:customWorkoutId(w,i),index:i}; detDlg.close(); openLog(); }

function renderWorkouts(){
  const v=document.getElementById("v-workouts");
  let inner;
  if(woTab==="programs"){
    const cp=PROGRAMS[activeProg]||{name:"No program",meta:{days:0,type:"—"}};
    const feat="<div class='featured'><div class='k'>Your program</div><div class='nm'>"+esc(cp.name)+"</div><div class='me'>"+esc(DIFF[activeProg]||"")+" &middot; "+cp.meta.days+" days/week &middot; "+esc(cp.meta.type)+"</div>"+
      "<div class='row'><button onclick='nav(\"plan\")'>Go to today</button><button class='g' onclick=\"progInfo('"+activeProg+"')\">Details</button></div></div>";
    const others=Object.keys(PROGRAMS).map(pid=>{ const p=PROGRAMS[pid], cur=pid===activeProg;
      return "<div class='ptile"+(cur?" cur":"")+"' onclick=\"progInfo('"+pid+"')\">"+(cur?"<div class='tickcur'>CURRENT</div>":"")+
        "<div><div class='ico'>"+(PROG_ICON[pid]||"")+"</div></div>"+
        "<div><div class='lvl'>"+esc(DIFF[pid]||"")+"</div><div class='nm'>"+esc(p.name)+"</div><div class='dd'>"+p.meta.days+" days &middot; "+esc(p.meta.type)+"</div></div></div>"; }).join("");
    inner=feat+"<div class='seclabel'>All programs</div><div class='pgrid'>"+others+"</div>";
  } else {
    const cw=state.customWorkouts||[];
    inner="<main>"+(cw.length?cw.map((w,i)=>"<div class='hitem'><div onclick='startCustom("+i+")' style='flex:1'><div class='d'>"+esc(w.name)+"</div><div class='m'>"+w.ex.length+" exercises</div></div><div class='v'><button class='ghost' onclick='editCustom("+i+")' style='padding:8px 10px;border-radius:10px'>Edit</button></div></div>").join("")
      :"<div class='empty'><div class='big'>No custom workouts yet</div>Build your own from any of the 870+ exercises.</div>")+
      "<button class='btn' onclick='newCustom()' style='margin-top:14px'>Create new workout</button></main>";
  }
  v.innerHTML="<div class='topbar'><div class='t'>Training plan</div><div class='r'>"+esc((PROGRAMS[activeProg]||{}).meta&&PROGRAMS[activeProg].meta.days?PROGRAMS[activeProg].meta.days+" DAYS":"PLAN")+"</div></div>"+
    "<div class='planQuick'><button onclick=\"nav('exercises')\">"+icon("search",17)+" Exercise library</button><button onclick=\"nav('more')\">"+icon("settings",17)+" Settings</button></div>"+
    "<div class='seg'><button class='"+(woTab==="programs"?"on":"")+"' data-w='programs'>Programs</button><button class='"+(woTab==="custom"?"on":"")+"' data-w='custom'>Custom workouts</button></div>"+inner;
  v.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{ woTab=b.dataset.w; renderWorkouts(); });
}
function editCustom(i){
  const w=state.customWorkouts[i]; if(!w)return;
  document.getElementById("detTitle").textContent=w.name;
  const rows=w.ex.map((ex,ei)=>{ const o=ex.opts[0]; return "<div class='opt' data-e='"+ei+"'><img alt='' src='"+o.img+"' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(o.n)+"</div><div class='s'>"+esc(ex.m)+" &middot; "+esc(o.r)+"</div></div><button data-a='up' data-e='"+ei+"' "+(ei===0?"disabled":"")+">Up</button><button data-a='down' data-e='"+ei+"' "+(ei===w.ex.length-1?"disabled":"")+">Down</button><button data-a='edit' data-e='"+ei+"'>Sets</button><button data-a='rm' data-e='"+ei+"'>Remove</button></div>"; }).join("");
  document.getElementById("detBody").innerHTML="<p style='color:var(--muted)'>"+w.ex.length+" exercises. Tap Start when your order and targets look right.</p>"+rows+
    "<div class='btnrow'><button onclick='startCustom("+i+")'>Start</button><button class='s' onclick='renameCustom("+i+")'>Rename</button></div>"+
    "<div class='btnrow'><button class='ghost' onclick='duplicateCustom("+i+")'>Duplicate</button><button class='ghost' onclick='delCustom("+i+")'>Delete</button></div>"+
    "<input id='cxq' placeholder='Search to add...' style='width:100%;height:42px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:0 12px;margin:12px 0;font-size:15px'><div id='cxlist'></div>";
  document.querySelectorAll("#detBody [data-a]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); customAction(i,b.dataset.a,+b.dataset.e); });
  const rnd=q=>{ const ql=q.toLowerCase(), list=LIB.filter(x=>!q||x.n.toLowerCase().includes(ql)).slice(0,80);
    document.getElementById("cxlist").innerHTML=list.map(x=>"<div class='opt' data-id='"+x.id+"'><img alt='' src='"+x.img+"' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(x.n)+"</div><div class='s'>"+esc(x.cat)+" &middot; "+esc(x.eq)+"</div></div><span class='tag'>add</span></div>").join("");
    document.querySelectorAll("#cxlist .opt").forEach(el=>el.onclick=()=>addCustomEx(i,el.dataset.id)); };
  const q=document.getElementById("cxq"); q.oninput=()=>rnd(q.value); rnd("");
  detDlg.showModal();
}
function addCustomEx(i,lid){ const x=LIB.find(e=>e.id===lid); if(!x)return; state.customWorkouts[i].ex.push({m:x.m,opts:[{exerciseId:x.id,libId:x.id,n:x.n,r:"3 x 10-12",cue:x.cue,img:x.img,eq:x.eq}]}); save(); editCustom(i); toast("Added "+x.n); }
function customAction(i,a,ei){ const w=state.customWorkouts[i], arr=w&&w.ex; if(!arr||!arr[ei])return;
  if(a==="up"&&ei>0){ const t=arr[ei-1]; arr[ei-1]=arr[ei]; arr[ei]=t; }
  else if(a==="down"&&ei<arr.length-1){ const t=arr[ei+1]; arr[ei+1]=arr[ei]; arr[ei]=t; }
  else if(a==="rm"){ arr.splice(ei,1); }
  else if(a==="edit"){ const o=arr[ei].opts[0];
    askText("Sets & reps","e.g. 3 x 10-12",o.r||"3 x 10-12",r=>{ r=safeText(r,32); if(r){o.r=r;save();} editCustom(i); });
    return; }
  save(); editCustom(i);
}
function renameCustom(i){ const w=state.customWorkouts[i];
  askText("Rename workout","Workout name",w.name,nm=>{ nm=safeText(nm,40); if(nm){w.name=nm;save();editCustom(i);renderWorkouts();} }); }
function duplicateCustom(i){ const w=state.customWorkouts[i]; state.customWorkouts.push(JSON.parse(JSON.stringify({id:"cw"+Date.now().toString(36),name:w.name+" copy",ex:w.ex}))); save(); renderWorkouts(); editCustom(state.customWorkouts.length-1); }

/* ---------- program templates (quick-start editable plans) ---------- */
const TEMPLATES=[
  {id:"tpl_ul3",name:"3-Day Upper Focus",days:["MON","WED","FRI"],titles:["UPPER HEAVY","PUSH + ARMS","PULL + DELTS"],ex:[["Incline Dumbbell Press","Lat Pulldown","Seated Dumbbell Shoulder Press","Cable Curl","Tricep Rope Pushdown"],["Flat Dumbbell Press","Cable Chest Fly","Dumbbell Lateral Raise","Overhead Cable Tricep Extension"],["Seated Cable Row","One-Arm Dumbbell Row","Face Pull","Incline Dumbbell Curl"]]},
  {id:"tpl_ppl",name:"Push Pull Legs",days:["MON","WED","FRI"],titles:["PUSH","PULL","LEGS"],ex:[["Incline Dumbbell Press","Dumbbell Lateral Raise","Tricep Rope Pushdown"],["Lat Pulldown","Seated Cable Row","EZ-Bar Bicep Curl"],["Leg Press","Lying Leg Curl","Standing Calf Raise"]]},
  {id:"tpl_home",name:"Home Dumbbell",days:["MON","WED","FRI"],titles:["DB A","DB B","DB C"],ex:[["Flat Dumbbell Press","One-Arm Dumbbell Row","Dumbbell Lateral Raise"],["Goblet Squat","Romanian Deadlift","Dumbbell Hammer Curl"],["Push-Ups","Dumbbell Rear Delt Fly","Crunches"]]},
  {id:"tpl_rebuild5",cat:"Rebuild",name:"5-Day Upper Rebuild",days:["MON","TUE","WED","FRI","SAT"],titles:["UPPER BASE","PULL + TRAPS","PUSH CHEST","ARMS + DELTS","PULL PUMP"],ex:[["Incline Dumbbell Press","Lat Pulldown","Seated Cable Row","Dumbbell Lateral Raise"],["Wide-Grip Lat Pulldown","Seated Cable Row","Dumbbell Shrug","Face Pull"],["Flat Dumbbell Press","Cable Chest Fly","Seated Dumbbell Shoulder Press","Tricep Rope Pushdown"],["Cable Curl","Overhead Cable Tricep Extension","Reverse Cable Flye","Dumbbell Lateral Raise"],["One-Arm Dumbbell Row","Straight-Arm Pulldown","EZ-Bar Bicep Curl","Cable Crunch"]]},
  {id:"tpl_chestprio",cat:"Hypertrophy",name:"Chest Priority Upper",days:["MON","WED","FRI","SAT"],titles:["CHEST HEAVY","BACK + ARMS","CHEST PUMP","DELTS + ARMS"],ex:[["Incline Dumbbell Press","Flat Dumbbell Press","Seated Cable Row","Dumbbell Lateral Raise"],["Lat Pulldown","One-Arm Dumbbell Row","Cable Curl","Tricep Rope Pushdown"],["Cable Chest Fly","Incline Dumbbell Press","Weighted Chest Dips","Face Pull"],["Dumbbell Lateral Raise","Reverse Cable Flye","Incline Dumbbell Curl","Overhead Cable Tricep Extension"]]},
  {id:"tpl_vtaper",cat:"Hypertrophy",name:"V-Taper Back Focus",days:["MON","TUE","THU","FRI"],titles:["BACK WIDTH","PUSH","BACK THICKNESS","ARMS + DELTS"],ex:[["Wide-Grip Lat Pulldown","Straight-Arm Pulldown","Seated Cable Row","Dumbbell Hammer Curl"],["Incline Dumbbell Press","Cable Chest Fly","Seated Dumbbell Shoulder Press","Tricep Rope Pushdown"],["Chest-Supported / T-Bar Row","One-Arm Dumbbell Row","Dumbbell Shrug","Face Pull"],["Cable Lateral Raise","Reverse Cable Flye","Cable Curl","Overhead Cable Tricep Extension"]]},
  {id:"tpl_pplx",cat:"Strength",name:"PPL Strength Base",days:["MON","WED","FRI","SAT"],titles:["PUSH","PULL","LEGS","UPPER PUMP"],ex:[["Barbell Bench Press","Seated Dumbbell Shoulder Press","Tricep Rope Pushdown"],["Pullups","Bent Over Barbell Row","EZ-Bar Bicep Curl"],["Leg Press","Romanian Deadlift","Standing Calf Raise"],["Incline Dumbbell Press","Lat Pulldown","Cable Lateral Raise","Face Pull"]]},
  {id:"tpl_busy3",cat:"Minimal",name:"3-Day Busy Hypertrophy",days:["MON","WED","FRI"],titles:["UPPER A","LOWER + PULL","UPPER B"],ex:[["Incline Dumbbell Press","Lat Pulldown","Dumbbell Lateral Raise","Tricep Rope Pushdown"],["Leg Press","Lying Leg Curl","Seated Cable Row","Cable Curl"],["Flat Dumbbell Press","One-Arm Dumbbell Row","Cable Chest Fly","Face Pull"]]}
];
function buildTemplate(t){ const days=t.days.map((wd,i)=>{ const ex=t.ex[i].map(n=>{ const lib=aiResolveEx(n,null); return lib?{m:lib.m,opts:[{exerciseId:lib.id,libId:lib.id,n:lib.n,r:"3 x 8-12",cue:lib.cue,img:lib.img,eq:lib.eq}]}:null; }).filter(Boolean); return {key:t.id+"_"+i,color:"upper",day:wd,title:t.titles[i],sub:"Template day",mus:[...new Set(ex.map(x=>x.m))],ex:ex}; }); return {id:t.id,name:t.name,meta:{days:days.length,type:"Template",best:"Quick-start editable plan"},days:days}; }
let tplFilter="All";
function templateCats(){ return ["All"].concat([...new Set(TEMPLATES.map(t=>t.cat||"General"))]); }
function openTemplates(){
  document.getElementById("detTitle").textContent="Program library";
  const cats=templateCats(), list=TEMPLATES.filter(t=>tplFilter==="All"||(t.cat||"General")===tplFilter);
  document.getElementById("detBody").innerHTML="<div class='libfilter'>"+cats.map(c=>"<button class='"+(c===tplFilter?"on":"")+"' data-c='"+escAttr(c)+"'>"+esc(c)+"</button>").join("")+"</div>"+
    "<p style='color:var(--muted);margin-top:0'>Duplicate a proven structure, then edit it for your gym and recovery.</p>"+
    list.map(t=>"<div class='opt' data-id='"+escAttr(t.id)+"'><div class='o'><div class='t'>"+esc(t.name)+"</div><div class='s'>"+esc((t.cat||"General")+" | "+t.days.join(" / ")+" | "+t.titles.join(", "))+"</div></div><span class='librarytag'>use</span></div>").join("");
  document.querySelectorAll("#detBody .libfilter button").forEach(b=>b.onclick=()=>{tplFilter=b.dataset.c;openTemplates();});
  document.querySelectorAll("#detBody .opt").forEach(el=>el.onclick=()=>{
    const t=TEMPLATES.find(x=>x.id===el.dataset.id), p=buildTemplate(t);
    p.name=t.name+" copy";
    const id=saveCustomProgram(p, {source:"template", diff:t.cat||"Template", icon:"T"});
    activeProg=id; state.programId=id; save(); buildActive(); detDlg.close(); nav("plan"); toast("Program added");
  });
  detDlg.showModal();
}
