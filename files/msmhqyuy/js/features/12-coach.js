/* AI Coach: chat with Claude for training/nutrition Q&A, and program building/editing.
 * CRITICAL: this file never writes to window.PROGRAMS or state.customPrograms directly
 * — every program it builds is only ever committed via 03-programs.js#saveCustomProgram,
 * which is what makes "ask the coach to edit my program" safe to do on a built-in
 * program without permanently shadowing it (the bug that hit 4 times pre-rewrite). */
/* Chat history is persisted (state.coachChat) so the coach remembers past conversations
 * across closing the chat / restarting the app — it used to reset every time since
 * chatMsgs was a plain in-memory variable with no write path to state. Kept last 60
 * messages in storage/UI; only the last 20 are actually sent to the API on each
 * request, to keep request size/cost bounded as history grows. pendingPrograms (staged,
 * not-yet-applied coach program proposals) intentionally stays in-memory only — if the
 * app restarts before a proposal is applied, tapping its "Apply" button fails safely
 * ("no longer pending") rather than silently doing nothing. */
let chatMsgs=Array.isArray(state.coachChat)?state.coachChat:[], chatBusy=false, pendingPrograms={}, pendingActions={};
function saveChatHistory(){ state.coachChat=chatMsgs.slice(-60); save(); }
function aiKey(){ return localStorage.getItem("gymAIKey")||""; }
function aiPrivacyPrefs(){
  const on=(key,yes)=>{const v=localStorage.getItem(key);return v==null?yes:v==="1";};
  return {consent:localStorage.getItem("gymAIConsent")==="1",
    profile:on("gymAIShareProfile",true),history:on("gymAIShareHistory",true),
    health:on("gymAIShareHealth",false)};
}
function coachTrainerContext(di,includeHealth){
  if(includeHealth)return trainerContextSnapshot(di);
  const raw=localStorage.getItem("gymHealthRecovery");
  try{localStorage.removeItem("gymHealthRecovery");return trainerContextSnapshot(di);}
  finally{if(raw!=null)localStorage.setItem("gymHealthRecovery",raw);}
}
function mdLite(s){ return esc(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>"); }
function bmiOf(){ const p=profile||{}; return (p.height&&p.weight)?Math.round(p.weight/((p.height/100)**2)*10)/10:null; }
function coachSystem(){
  const privacy=aiPrivacyPrefs(),p=privacy.profile?(profile||{}):{}, pr=privacy.profile?getPriority():[], prog=PROGRAMS[activeProg];
  const wd=selWeekday||todayWeekday(), di=effectiveDayIndex(wd); // includes an accepted catch-up/schedule repair
  const today = di<0 ? (FULLDAY[wd]+" is a rest day") : (FULLDAY[wd]+" — "+PROGRAM[di].title+": "+PROGRAM[di].ex.map((_,ei)=>curOpt(di,ei).n).join(", "));
  const bmi=privacy.profile?bmiOf():null;
  const trainerJSON=privacy.history?JSON.stringify(coachTrainerContext(di,privacy.health)):JSON.stringify({shared:false,reason:"Workout history context disabled by user"});
  const curJSON=JSON.stringify({id:activeProg,name:(prog||{}).name||"",days:PROGRAM.map((d,dayIndex)=>({day:d.day,title:d.title,sub:d.sub,ex:d.ex.map((e,exerciseIndex)=>{const o=curOpt(dayIndex,exerciseIndex),sm=(o.r.match(/^(\d+)/)||[])[1],rp=(o.r.match(/x\s*([0-9A-Za-z\-]+)/)||[])[1],canonical=canonicalExercise(o.libId||o.n,e.m);return{id:o.libId||(canonical&&canonical.exercise.id)||null,name:o.n,muscle:e.m,sets:sm?+sm:3,reps:rp||"8-12"};})}))});
  const profileText=privacy.profile?
    ((p.age?p.age+" yrs, ":"")+(p.sex?(p.sex==="F"?"female, ":"male, "):"")+(p.weight?toDisp(p.weight)+" "+unit+", ":"")+(p.height?p.height+" cm, ":"")+(bmi?"BMI "+bmi+". ":"")+
    "Equipment: "+(p.equip==="db"?"dumbbells only":p.equip==="home"?"home/bodyweight":"full gym")+". "+
    "Experience: "+(p.trainingExperience||"not supplied")+". Preferred session: "+(p.sessionMinutes||"not supplied")+" minutes. "+
    "Exact equipment: "+((p.equipmentList||[]).join(", ")||"not supplied")+". Excluded exercises: "+((p.excludedExercises||[]).join(", ")||"none")+". "+
    "Pain/joint constraints: "+((p.painAreas||[]).join(", ")||"none reported")+". Training priorities (high→low): "+pr.join(", ")+". "):
    "withheld by the user. Do not infer age, sex, body measurements, goals, equipment, exclusions or pain constraints. ";
  return "You are an expert personal trainer and strength & hypertrophy coach built into a workout-tracking app. "+
    "Give concise, practical, evidence-based advice. Keep replies short — a few sentences or a tight bulleted list. Use "+unit+" for weights. "+
    "You can suggest exercises, swaps, set/rep schemes, and answer training, nutrition and recovery questions. If the user asks you to build or 'do' a workout, reply with a clean list of exercises as 'Name — sets x reps'.\n\n"+
    "USER PROFILE: "+profileText+
    "Current program: "+(prog?prog.name+" ("+prog.meta.type+", "+prog.meta.days+" days/week)":"none")+". "+
    "Today: "+today+".\n\n"+
    "ADAPTIVE TRAINER STATE (calculated locally from the user's real logs; this is the source of truth for recovery and exact targets):\n"+trainerJSON+"\n"+
    "When discussing today's load, sets, reps, RIR, recovery or schedule, use the values above. Explain the local trainer's reasoning and confidence; do not replace a supplied exact target with an invented number. If confidence is low, recommend the app's calibration set. Never claim a recovery percentage is a medical measurement. The user stays in control of every schedule repair and program change.\n\n"+
    "BUILDING / EDITING PROGRAMS: You can create, change, fix or improve the user's saved multi-day programs. "+
    "When they ask you to build, add, change, fix or improve a PROGRAM (a weekly plan), do TWO things: (1) write a VERY SHORT explanation — 1-2 sentences max, so the plan below is never cut off; then (2) append a machine-readable block in EXACTLY this format as the very last thing in your reply. The block is REQUIRED (without it nothing is saved) and must NOT be wrapped in ``` code fences:\n"+
    "<<<PROGRAM>>>\n"+
    "{\"action\":\"add\",\"name\":\"My Program\",\"difficulty\":\"Intermediate\",\"type\":\"Push / Pull\",\"days\":[{\"day\":\"MON\",\"title\":\"PUSH\",\"sub\":\"Chest / Shoulders / Triceps\",\"ex\":[{\"name\":\"Incline Dumbbell Press\",\"muscle\":\"Chest\",\"sets\":3,\"reps\":\"6-8\"},{\"name\":\"Seated Cable Flye\",\"muscle\":\"Chest\",\"sets\":3,\"reps\":\"12-15\"}]}]}\n"+
    "<<<END>>>\n"+
    "RULES: Inside the markers put ONLY valid JSON (no comments, no trailing commas, no text). day = one of MON,TUE,WED,THU,FRI,SAT,SUN. muscle = one of Chest, Back, Shoulders, Rear delts, Biceps, Triceps, Legs, Core (use 'Rear delts' for face pulls / reverse flyes / rear-delt raises — the app tracks rear-delt volume separately from Shoulders). Use common, real exercise names — the app auto-attaches the right photo + animated demo and lets the user swap. To EDIT/FIX an existing program, set \"action\":\"replace\" and \"id\" to its exact id. Existing program ids: "+Object.keys(PROGRAMS).map(k=>k+" = "+PROGRAMS[k].name).join("; ")+". "+
    "THE USER'S CURRENT/ACTIVE program is id \""+activeProg+"\". When they ask to change, fix, improve, shorten, or ADD exercises to THEIR program (not asking for a brand-new one), you MUST use \"action\":\"replace\" with \"id\":\""+activeProg+"\" and return the COMPLETE program — every day and every exercise with your edits applied — NOT just the changed day, or the other days will be lost. Only use \"action\":\"add\" when the user explicitly wants a separate/new program. "+
    "YOUR CURRENT PROGRAM as editable JSON — this is the SOURCE OF TRUTH (id \""+activeProg+"\"):\n"+curJSON+"\n"+
    "CRITICAL editing rule: take THIS exact JSON, apply ONLY the user's requested change, and keep every OTHER day and every exercise EXACTLY the same — same names, muscles, sets, reps. Never substitute an exercise for a different one, and never regenerate the program from a generic template, unless the user explicitly asks. For a day move/rotation (e.g. 'move legs to Saturday'), keep each day's exercise list 100% identical and ONLY change the \"day\" value — do not invent new exercises. Then return it in the block with \"action\":\"replace\" and \"id\":\""+activeProg+"\". Double-check your output actually reflects the change you described in words. "+
    "EVIDENCE RULES: start near the user's previously tolerated volume; when that is unknown, roughly 8-12 challenging weekly sets per growing muscle is a conservative starting range. More volume can help with diminishing returns, so change it gradually (usually 1-2 sets or 10-20%) only after several weeks of performance, adherence and recovery evidence. Frequency is a way to distribute high-quality volume and fit the schedule, not a growth score by itself. Keep sessions under 24 prescribed work sets and avoid concentrating more than about 12 direct sets for one muscle in one session. "+
    "EFFORT AND PROGRESSION: prescribe most hypertrophy sets around 1-3 RIR; momentary failure is optional and best reserved for stable isolation or machine work when appropriate. Use every prescribed working set for double progression: add load only when all sets achieve the top of the range near the target RIR with controlled technique. Otherwise add reps, hold, or reduce. Never infer that one top set means the full exercise earned more weight. "+
    "EXERCISE SELECTION: keep a stable, measurable core and vary movements systematically rather than randomly. Prefer a comfortable controlled range of motion, adequate stability, equipment fit and low joint irritation. Lengthened-position loading can be useful but is not universally superior and never overrides comfort, skill or pain. Use compounds and isolations as needed to cover useful movement patterns without redundant fatigue. Every exercise needs 2-5 sets and no exact duplicate within a day. "+
    "SAFETY AND CONTROL: pain is an override, not ordinary fatigue. Never diagnose an injury; offer a comfortable alternative and recommend qualified clinical help for persistent, sharp or worsening pain. The deterministic program compiler will validate canonical exercise ids, muscle classifications, equipment, direct and fractional weekly volume, frequency, duration, redundancy and recovery spacing before the user can apply a plan. "+
    "QUICK EDITS: when the user asks to swap/replace, add, or remove just ONE exercise (not rework the plan), do NOT send a <<<PROGRAM>>> block. Instead reply briefly and append exactly one action block as the very last thing:\n"+
    "<<<ACTION>>>\n{\"type\":\"swap\",\"day\":\"FRI\",\"exercise\":\"Incline Dumbbell Curl\",\"with\":\"Flexor Incline Dumbbell Curls\",\"reps\":\"3 x 10-12\"}\n<<<END>>>\n"+
    "type is swap (needs exercise + with), add (needs exercise + reps), or remove (needs exercise). 'day' is the day code. For 'exercise' use the exact name from the CURRENT PROGRAM JSON; for 'with'/'add' use common real exercise names. The user gets an Apply button — never claim the change is already made.\n"+
    (privacy.history?(function(){ const notes=(state.workoutHistory||[]).slice(0,5).filter(w=>w.note||w.feel).map(w=>w.date+" "+w.title+": "+(w.feel?["","felt rough","felt meh","felt okay","felt strong","felt amazing"][w.feel]:"")+(w.note?" — \""+w.note+"\"":"")); return notes.length?("RECENT SESSION NOTES (factor these into advice): "+notes.join(" | ")+". "):""; })():"")+
    (privacy.profile?"Respect the user's stated no-leg / upper-focus preference unless they ask otherwise. ":"Do not infer withheld training goals or constraints. ")+
    "For a single quick one-off session (not a saved weekly plan), just give a 'Name — sets x reps' list instead of the block.";
}

/* ---------- turns a coach-proposed spec into a candidate program (not yet saved) ---------- */
function buildAIProgram(spec){
  const COL=t=>{ t=(t||"").toLowerCase(); return t.includes("pull")?"pull":t.includes("push")?"push":(t.includes("leg")||t.includes("lower"))?"leg":t.includes("arm")?"arm":"upper"; };
  const unmatched=[];
  const days=(spec.days||[]).map((d,di)=>{
    const ex=(d.ex||[]).map(e=>{ const resolved=canonicalExercise(e.id||e.name,e.muscle),lib=resolved&&resolved.exercise; if(!lib){unmatched.push((d.day||"DAY")+": "+(e.name||"unknown"));return null;}
      const reps=(e.sets||3)+" x "+(e.reps||"8-12");
      return {m:canonicalMuscleLabel(lib.m)||lib.m,opts:[{libId:lib.id,n:lib.n,r:reps,cue:lib.cue,img:lib.img,eq:lib.eq}]}; }).filter(Boolean);
    if(!ex.length)return null;
    return {key:"ai_"+(d.day||"d")+"_"+di,color:COL(d.title||d.day),day:(d.day||"MON").toUpperCase().slice(0,3),title:(d.title||"WORKOUT").toUpperCase(),sub:d.sub||"",mus:[...new Set(ex.map(x=>x.m))],userOrder:true,ex:ex};
  }).filter(Boolean);
  if(!days.length)return null;
  if(spec.action!=="replace"&&activeProg&&PROGRAMS[activeProg]&&spec.name&&spec.name.trim().toLowerCase()===PROGRAMS[activeProg].name.trim().toLowerCase()){ spec.action="replace"; spec.id=activeProg; } // same name as active = an edit
  // NOTE: unlike the pre-rewrite app, this id is purely informational (echoed in the chat
  // bubble before the user taps Apply) — it is NEVER used to index into window.PROGRAMS
  // directly. The actual save (applyCoachProgram, below) always goes through
  // saveCustomProgram(), which mints a fresh id for anything touching a built-in program.
  let id=(spec.id||"").replace(/[^a-z0-9]/gi,"").slice(0,20)||("ai"+Date.now().toString(36).slice(-6));
  const candidate={id:id,name:spec.name||"Coach Program",noEmph:true,meta:{days:days.length,type:spec.type||"AI Coach",best:spec.best||"Built by your AI Coach"},days:days};
  const audit=compileProgram(candidate,{strict:true});
  if(unmatched.length){audit.errors=audit.errors.concat(unmatched.map(x=>"Could not safely match "+x));audit.valid=false;}
  return {id:id,prog:audit.program,audit:audit,diff:spec.difficulty||"Custom",icon:spec.icon||"AI",action:spec.action||"add"};
}
/** Commits a pending coach-proposed program once the user taps "Apply". Always goes
 *  through saveCustomProgram(): editing the active program clones it to a fresh custom
 *  id first (the built-in id is never touched), and a brand-new program also gets a
 *  fresh id. */
function applyCoachProgram(pid){
  const p=pendingPrograms[pid]; if(!p){toast("That coach plan is no longer pending");return;}
  const b=p.built, spec=p.spec||{};
  if(!b.audit||!b.audit.valid){toast("Plan cannot be applied until its validation errors are fixed");return;}
  const wasEditOfActive=spec.action==="replace"&&activeProg;
  if(typeof rememberProgramUndo==="function")rememberProgramUndo("AI program");
  const id=saveCustomProgram(b.prog, {
    source:"coach",
    basedOn:wasEditOfActive?activeProg:null,
    diff:b.diff, icon:b.icon,
    overwriteCustomId:(wasEditOfActive&&BUILTIN_PROGRAM_IDS.indexOf(activeProg)===-1)?activeProg:null
  });
  if(!id){toast("Plan was not applied");return;}
  if(wasEditOfActive&&state.extraExercises){ Object.keys(state.extraExercises).forEach(k=>{ if(k.indexOf(activeProg+"_")===0) delete state.extraExercises[k]; }); } // coach's edit is authoritative
  activeProg=id; state.programId=id; curDay=0; selWeekday=null; delete pendingPrograms[pid];
  save(); buildActive(); renderPlan(); renderChat(); toast("Coach plan applied");
}
function coachProgramDiffHTML(candidate){
  const old=PROGRAMS[activeProg],rows=[];
  if(!old)return "";
  const byDay={};(old.days||[]).forEach(d=>byDay[d.day]=d);
  (candidate.days||[]).forEach(d=>{
    const prev=byDay[d.day],before=prev?(prev.ex||[]).reduce((a,e)=>a+targetSets(e.opts[0].r),0):0;
    const after=(d.ex||[]).reduce((a,e)=>a+targetSets(e.opts[0].r),0);
    const oldNames=prev?(prev.ex||[]).map(e=>e.opts[0].n):[],newNames=(d.ex||[]).map(e=>e.opts[0].n);
    const added=newNames.filter(n=>!oldNames.some(x=>sameEx(x,n))),removed=oldNames.filter(n=>!newNames.some(x=>sameEx(x,n)));
    if(before!==after||added.length||removed.length)rows.push("<div class='hitem'><div><div class='d'>"+esc(d.day+" - "+d.title)+"</div><div class='m'>"+before+" to "+after+" sets"+(added.length?" | + "+esc(added.join(", ")):"")+(removed.length?" | - "+esc(removed.join(", ")):"")+"</div></div></div>");
  });
  return rows.length?"<h3>Changes from current plan</h3>"+rows.join(""):"<div class='insight'>No material exercise or set changes detected.</div>";
}
function openCoachProgramReview(pid){
  const pending=pendingPrograms[pid];if(!pending){toast("That coach plan is no longer pending");return;}
  const built=pending.built,a=built.audit||compileProgram(built.prog,{strict:true}),vol=a.metrics.weeklyVolume||{};
  const volumeRows=Object.keys(vol).filter(m=>vol[m].total>0).map(m=>"<span>"+esc(m)+": "+vol[m].total+"</span>").join("");
  const days=(built.prog.days||[]).map(d=>"<div class='smartTargetRow'><div><b>"+esc(d.day+" - "+d.title)+"</b><small>"+(d.ex||[]).map(e=>esc(e.opts[0].n)).join(" | ")+"</small></div><div><strong>"+(d.ex||[]).reduce((n,e)=>n+targetSets(e.opts[0].r),0)+" sets</strong><small>"+(d.ex||[]).length+" exercises</small></div></div>").join("");
  document.getElementById("detTitle").textContent="Review AI program";
  document.getElementById("detBody").innerHTML=
    "<div class='smartPlanHero "+(a.valid?"":"blocked")+"'><span>"+(a.valid?"VALIDATED":"BLOCKED")+"</span><b>"+esc(built.prog.name)+"</b><p>"+(a.valid?"The deterministic trainer checked exercise identity, equipment, volume and session limits.":"Fix the errors below before this plan can be applied.")+"</p></div>"+
    coachProgramDiffHTML(built.prog)+
    "<h3>Weekly fractional volume</h3><div class='auditVolume'>"+volumeRows+"</div>"+
    (a.errors.length?"<div class='loadwarn'><b>Errors</b><br>"+a.errors.map(esc).join("<br>")+"</div>":"")+
    (a.warnings.length?"<div class='insight'><b>Warnings</b><br>"+a.warnings.slice(0,10).map(esc).join("<br>")+"</div>":"")+
    days+(a.valid?"<div class='btnrow'><button id='applyReviewedProgram'>Apply validated plan</button></div>":"");
  detDlg.showModal();
  const apply=document.getElementById("applyReviewedProgram");if(apply)apply.onclick=()=>{detDlg.close();applyCoachProgram(pid);};
}

/* ---------- extracting a <<<PROGRAM>>> JSON block from the model's reply text ---------- */
function firstJSONObj(str){ const i=str.indexOf("{"); if(i<0)return null; let d=0; for(let j=i;j<str.length;j++){ const c=str[j]; if(c==="{")d++; else if(c==="}"){ if(--d===0) return str.slice(i,j+1); } } return null; }
function extractProgramSpec(text){ let raw=null,clean=text;
  const mk=text.indexOf("<<<PROGRAM>>>");
  if(mk>=0){ const after=text.slice(mk+13).replace(/<<<END>>>[\s\S]*$/,""); raw=firstJSONObj(after); clean=text.slice(0,mk).trim(); } // handles truncated (no END) too
  if(!raw){ const f=text.match(/```(?:json)?\s*([\s\S]*?)```/); if(f&&/"days"/.test(f[1])){ raw=firstJSONObj(f[1]); clean=text.replace(f[0],"").trim(); } }
  if(!raw&&/"days"\s*:/.test(text)){ raw=firstJSONObj(text); if(raw)clean=text.replace(raw,"").trim(); }
  if(!raw)return null;
  raw=raw.replace(/,\s*([}\]])/g,"$1"); // tolerate trailing commas
  try{ const spec=JSON.parse(raw); if(!spec||!spec.days)return null; spec._clean=clean; return spec; }catch(e){ return null; }
}

/* ---------- coach quick-edit ACTION block (single-exercise swap/add/remove) ---------- */
function extractActionSpec(text){
  const mk=text.indexOf("<<<ACTION>>>"); if(mk<0)return null;
  const after=text.slice(mk+12).replace(/<<<END>>>[\s\S]*$/,"");
  const raw=firstJSONObj(after); if(!raw)return null;
  try{ const s=JSON.parse(raw.replace(/,\s*([}\]])/g,"$1"));
    if(!s||["swap","add","remove"].indexOf(s.type)<0)return null;
    s._clean=text.slice(0,mk).trim(); return s;
  }catch(e){ return null; }
}
/** Applies a pending one-exercise edit through the same safe path as the day editor:
 *  clone -> modify -> saveCustomProgram (built-in ids are never touched; a custom
 *  program updates in place). */
function applyCoachAction(aid){
  const p=pendingActions[aid]; if(!p){toast("That edit is no longer pending");return;}
  const spec=p.spec, pid=activeProg;
  if(!pid||!PROGRAMS[pid]){toast("No active program");return;}
  if(typeof rememberProgramUndo==="function")rememberProgramUndo("AI exercise edit");
  const newProg=JSON.parse(JSON.stringify(PROGRAMS[pid]));
  const dayCode=String(spec.day||"").toUpperCase().slice(0,3);
  const day=newProg.days.find(d=>d.day===dayCode)||newProg.days.find(d=>d.ex.some(e=>sameEx(e.opts[0].n,spec.exercise||"")));
  if(!day){toast("Couldn't find that day in your program");return;}
  if(spec.type==="remove"){
    const i=day.ex.findIndex(e=>sameEx(e.opts[0].n,spec.exercise||"")); if(i<0){toast("Exercise not found");return;}
    day.ex.splice(i,1); if(!day.ex.length){toast("Can't empty a whole day");return;}
  } else if(spec.type==="add"){
    const lib=aiResolveEx(spec.exercise,null); if(!lib){toast("Unknown exercise: "+(spec.exercise||""));return;}
    day.ex.push({m:canonicalMuscleLabel(lib.m)||lib.m,opts:[{libId:lib.id,n:lib.n,r:safeText(spec.reps,32)||"3 x 8-12",cue:lib.cue,img:lib.img,eq:lib.eq}]});
  } else {
    const i=day.ex.findIndex(e=>sameEx(e.opts[0].n,spec.exercise||"")); if(i<0){toast("Exercise not found");return;}
    const lib=aiResolveEx(spec.with||spec.replacement,null); if(!lib){toast("Unknown replacement exercise");return;}
    day.ex[i]={m:canonicalMuscleLabel(lib.m)||lib.m,opts:[{libId:lib.id,n:lib.n,r:safeText(spec.reps,32)||day.ex[i].opts[0].r,cue:lib.cue,img:lib.img,eq:lib.eq}]};
  }
  const isCustom=BUILTIN_PROGRAM_IDS.indexOf(pid)===-1&&!!(state.customPrograms&&state.customPrograms[pid]);
  const newId=saveCustomProgram(newProg,{basedOn:isCustom?((state.customPrograms[pid]||{}).basedOn||null):pid,source:"coach",diff:DIFF[pid],icon:PROG_ICON[pid],overwriteCustomId:isCustom?pid:null});
  if(!newId){toast("Edit was blocked by the program safety check");return;}
  activeProg=newId; state.programId=newId; delete pendingActions[aid];
  const msg=chatMsgs.find(m=>m.actionChip&&m.actionChip.id===aid); if(msg)msg.actionChip.applied=true;
  save(); buildActive(); saveChatHistory(); renderChat(); toast("Applied ✓ — "+spec.type+" done");
}

/* ---------- native/browser request + chat UI ---------- */
function coachTools(){
  const editProps={type:{type:"string",enum:["swap","add","remove"]},day:{type:"string",enum:WDAYS},exercise:{type:"string"},with:{type:"string"},reps:{type:"string"},reason:{type:"string"}};
  return [
    {name:"edit_exercise",description:"Preview one exercise add, removal or swap in the active program. The user must confirm it.",input_schema:{type:"object",properties:editProps,required:["type","day","exercise"],additionalProperties:false}},
    {name:"propose_program",description:"Preview a complete new or revised weekly program. For a revision include every day and exercise; the user must confirm it. The app validates the result deterministically.",input_schema:{type:"object",properties:{action:{type:"string",enum:["add","replace"]},id:{type:"string"},name:{type:"string"},difficulty:{type:"string"},type:{type:"string"},reason:{type:"string"},days:{type:"array",minItems:1,maxItems:7,items:{type:"object",properties:{day:{type:"string",enum:WDAYS},title:{type:"string"},sub:{type:"string"},ex:{type:"array",minItems:1,maxItems:12,items:{type:"object",properties:{id:{type:"string"},name:{type:"string"},muscle:{type:"string",enum:MUSCLES},sets:{type:"integer",minimum:2,maximum:5},reps:{type:"string"}},required:["name","muscle","sets","reps"],additionalProperties:false}}},required:["day","title","ex"],additionalProperties:false}}},required:["action","name","days"],additionalProperties:false}},
    {name:"explain_session_adjustment",description:"Return exact, non-destructive targets for today's session when no saved-program edit is needed.",input_schema:{type:"object",properties:{summary:{type:"string"},confidence:{type:"string",enum:["low","medium","high"]},changes:{type:"array",maxItems:6,items:{type:"object",properties:{exercise:{type:"string"},instruction:{type:"string"},reason:{type:"string"}},required:["exercise","instruction","reason"],additionalProperties:false}}},required:["summary","confidence","changes"],additionalProperties:false}}
  ];
}
function aiRequest(body){
  if(window.GymNative&&GymNative.aiFetch) return aiFetchNative("https://api.anthropic.com/v1/messages",aiKey(),body);
  // browser fallback (headless test / non-Android)
  return fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":aiKey(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:body})
    .then(r=>r.json().then(d=>({status:r.status,data:d}))).catch(e=>({status:0,data:{error:{message:"Network error."}}}));
}
/* A stored preference outlives the model it names. Rather than silently rewriting the
   user's saved choice, resolve retired/superseded ids forward at read time — same tier,
   same price, and the settings screen still marks the right row as current. */
const AI_MODEL_ALIASES={"claude-opus-4-8":"claude-opus-5","claude-opus-4-7":"claude-opus-5","claude-opus-4-6":"claude-opus-5","claude-sonnet-4-6":"claude-sonnet-5"};
function aiModel(){ const raw=localStorage.getItem("gymAIModel")||"claude-sonnet-5"; return AI_MODEL_ALIASES[raw]||raw; }
function aiModelCandidates(){
  return [aiModel(),"claude-sonnet-5","claude-haiku-4-5"].filter((x,i,a)=>a.indexOf(x)===i);
}
/* Adaptive thinking is worth the tokens for exactly the job that has produced this app's
   worst output — building and editing programs (a 1-set prescription, duplicate exercises
   in one day, an abs exercise filed under rear delts have all shipped from here). It is
   model-gated: Haiku 4.5 predates both adaptive thinking and the effort parameter and
   rejects either with a 400, and it is the last entry in the fallback chain. max_tokens has
   to rise alongside it, because it caps thinking AND the reply together — leaving it at
   4096 with thinking on truncates the answer mid-sentence. */
function aiSupportsThinking(model){ return /^claude-(opus-5|sonnet-5|opus-4-[678]|sonnet-4-6)$/.test(model); }
function aiTunedPayload(payload,model){
  const body=Object.assign({},payload,{model:model});
  if(aiSupportsThinking(model)){
    body.thinking={type:"adaptive"};
    body.output_config={effort:"high"};
    body.max_tokens=Math.max(+payload.max_tokens||0,12000);
  }else{
    delete body.thinking; delete body.output_config;
    body.max_tokens=Math.min(+payload.max_tokens||4096,4096);
  }
  return body;
}
async function aiRequestWithFallback(payload){
  const models=aiModelCandidates();let last=null;
  for(let i=0;i<models.length;i++){
    const result=await aiRequest(JSON.stringify(aiTunedPayload(payload,models[i])));last=result;
    if(!(result.status===404||result.status===503||result.status===529))return Object.assign({model:models[i],fallback:i>0},result);
  }
  return Object.assign({model:models[models.length-1],fallback:models.length>1},last||{status:0,data:{error:{message:"No AI model was available."}}});
}
function openChat(){ document.getElementById("chatView").classList.add("on"); if(!aiKey()) renderChatSetup(); else renderChat(); }
function closeChat(){ document.getElementById("chatView").classList.remove("on"); document.querySelectorAll("#bnav button").forEach(b=>b.classList.toggle("on",b.dataset.v===curTab)); if(curTab==="plan")renderPlan();else if(curTab==="recovery")renderRecovery(); }
function renderChatSetup(){
  document.getElementById("chatBody").innerHTML=
    "<div class='cwelcome'><div class='big'>Connect your AI Coach</div>Chat with an AI personal trainer that knows your profile, program and goals — for advice, swaps, and custom workouts.</div>"+
    "<div style='background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-top:10px;font-size:13px;line-height:1.6;color:var(--muted)'>"+
    "It uses Claude via your own <b>Anthropic API key</b>:<br>1. Get a key at <b>console.anthropic.com</b><br>2. Paste it below — Android Keystore protects it on this phone.<br>3. Only the context you allow is sent to Anthropic.</div>"+
    "<div class='fld' style='margin-top:14px'><label>Anthropic API key (sk-ant-…)</label><input id='aikey' type='password' placeholder='sk-ant-...'></div>"+
    "<label style='display:flex;gap:10px;align-items:flex-start;margin:12px 2px;font-size:13px'><input id='aiSetupConsent' type='checkbox'><span>I agree to send my messages, current program and selected coaching context to Anthropic when I use Coach.</span></label>"+
    "<button class='btn' onclick='saveKey()'>Save & start chatting</button>";
  document.getElementById("chatFoot").innerHTML="";
}
function saveKey(){ const k=document.getElementById("aikey").value.trim(); if(!k||!k.startsWith("sk-")){ toast("Enter a valid key (sk-ant-…)"); return; } if(!document.getElementById("aiSetupConsent").checked){toast("Please review and accept the AI data consent");return;}localStorage.setItem("gymAIConsent","1");localStorage.setItem("gymAIKey",k); chatMsgs=[]; saveChatHistory(); renderChat(); toast("AI Coach connected ✦"); }
function chatKeyMenu(){
  if(confirm("Clear the chat history? (Cancel for more options)")){ chatMsgs=[]; saveChatHistory(); renderChat(); toast("Chat cleared"); return; }
  if(confirm("Remove the saved API key from this phone?")){ localStorage.removeItem("gymAIKey"); chatMsgs=[]; saveChatHistory(); renderChatSetup(); toast("Key removed"); }
}
function renderChat(){
  const b=document.getElementById("chatBody");
  if(!chatMsgs.length){
    b.innerHTML="<div class='cwelcome'><div class='big'>Your AI Coach</div>Ask anything about training, form, nutrition or your plan.</div>"+
      "<div class='csugs'><button class='csug' data-q='Explain today’s smart targets and the two most important adjustments.'>Explain today</button><button class='csug' data-q='Which muscles are least recovered and what should I do about it?'>Recovery check</button><button class='csug' data-q='Review my recent performance and tell me which exercise has earned progression.'>Progression review</button><button class='csug' data-q='Find the best exercise swap using my equipment and exercise preferences.'>Smarter swap</button></div>";
    b.querySelectorAll(".csug").forEach(s=>s.onclick=()=>sendChat(s.dataset.q));
  } else {
    b.innerHTML=chatMsgs.map(m=>"<div class='cmsg "+(m.role==="user"?"user":"ai")+"'>"+(m.role==="user"?esc(m.text):mdLite(m.text))+"</div>"+
      (m.program?"<div class='cprog"+(m.program.blocked?" blocked":"")+"'><div class='ci'>AI</div><div class='ct'><b>"+esc(m.program.name)+"</b><div>"+(m.program.blocked?("Blocked by safety check - "+m.program.errors+" error"+(m.program.errors===1?"":"s")):(m.program.pending?("Validated preview"+(m.program.warnings?" - "+m.program.warnings+" warning"+(m.program.warnings===1?"":"s"):"")):(m.program.active?"Applied to your plan":((m.program.action==="replace"?"Updated":"New program")+" - "+m.program.days+" days"))))+"</div></div><button "+(m.program.blocked?"disabled":"data-pid='"+m.program.id+"' data-pending='"+(m.program.pending?"1":"0")+"'")+">"+(m.program.blocked?"Fix required":m.program.pending?"Apply":"View")+"</button></div>":"")+
      (m.actionChip?"<div class='cprog'><div class='ci'>⚡</div><div class='ct'><b>Quick edit</b><div>"+esc(m.actionChip.label||"")+"</div></div>"+(m.actionChip.applied?"<button disabled>Applied ✓</button>":"<button data-aid='"+escAttr(m.actionChip.id)+"'>Apply</button>")+"</div>":"")).join("")+
      (chatBusy?"<div class='ctyping'>Coach is thinking...</div>":"");
    b.querySelectorAll("[data-pid]").forEach(btn=>btn.onclick=()=>{ if(btn.dataset.pending==="1")openCoachProgramReview(btn.dataset.pid); else { setProgram(btn.dataset.pid); closeChat(); } });
    b.querySelectorAll("[data-aid]").forEach(btn=>btn.onclick=()=>applyCoachAction(btn.dataset.aid));
    b.scrollTop=b.scrollHeight;
  }
  document.getElementById("chatFoot").innerHTML="<div class='cinput'><textarea id='cin' placeholder='Message your coach...' rows='1'></textarea><button class='send' id='csend' "+(chatBusy?"disabled":"")+">Send</button></div>";
  const ta=document.getElementById("cin"), send=document.getElementById("csend");
  if(ta){ ta.oninput=()=>{ ta.style.height="46px"; ta.style.height=Math.min(120,ta.scrollHeight)+"px"; };
    ta.onkeydown=e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); if(ta.value.trim()) sendChat(ta.value.trim()); } }; }
  if(send) send.onclick=()=>{ const v=document.getElementById("cin").value.trim(); if(v) sendChat(v); };
}
async function sendChat(text){
  if(chatBusy)return;
  if(!aiPrivacyPrefs().consent){
    if(typeof openAIPrivacySettings==="function")openAIPrivacySettings();
    toast("Review AI privacy before sending");
    return;
  }
  chatMsgs.push({role:"user",text:text}); chatBusy=true; saveChatHistory(); renderChat();
  try{
    // Only the most recent messages are sent as context — the full history still shows
    // in the UI and is saved, but an ever-growing request body would slowly get more
    // expensive and eventually hit the model's context limit.
    const reqBody={model:aiModelCandidates()[0],max_tokens:4096,system:[{type:"text",text:coachSystem()+"\nUse the supplied tools for every program edit or structured session adjustment. Use at most one tool per response. Never claim a tool action has already been applied.",cache_control:{type:"ephemeral"}}],tools:coachTools(),messages:chatMsgs.slice(-20).map(m=>({role:m.role==="user"?"user":"assistant",content:m.text}))};
    const {status,data,model,fallback}=await aiRequestWithFallback(reqBody);
    if(data.error){
      const nice=status===401?"Your API key was rejected — check it via the ⋯ menu (top right)."
        :status===429?"Rate limited by the API — wait a minute and try again."
        :(status===529||status===503)?"Anthropic's servers are overloaded right now — try again in a moment."
        :null;
      chatMsgs.push({role:"assistant",text:"Error: "+(nice||data.error.message||"Request failed")+" [status "+status+"]"});
    }
    else{
      let txt=(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("").trim(), built=null, action="add", actionChip=null;
      if(fallback)txt+=(txt?"\n\n":"")+"Connected through fallback model "+model+".";
      const tool=(data.content||[]).find(x=>x.type==="tool_use"), toolInput=tool&&plainObj(tool.input)?tool.input:null;
      if(tool&&tool.name==="explain_session_adjustment"&&toolInput){txt=(txt?txt+"\n\n":"")+toolInput.summary+"\n"+(toolInput.changes||[]).map(x=>"• "+x.exercise+": "+x.instruction+" — "+x.reason).join("\n")+"\nConfidence: "+toolInput.confidence;}
      const act=(tool&&tool.name==="edit_exercise"&&toolInput)?toolInput:extractActionSpec(txt);
      if(act){
        txt=act._clean||txt;
        const aid="a"+Date.now().toString(36);
        pendingActions[aid]={spec:act};
        actionChip={id:aid,applied:false,label:(act.type==="swap"?("Swap "+(act.exercise||"")+" → "+(act.with||"")):act.type==="add"?("Add "+(act.exercise||"")):("Remove "+(act.exercise||"")))+(act.day?" ("+act.day+")":"")};
      }
      const spec=actionChip?null:((tool&&tool.name==="propose_program"&&toolInput)?toolInput:extractProgramSpec(txt));
      if(spec){
        const lu=(text||"").toLowerCase();
        const wantsNew=/(new|another|separate|second|brand[- ]?new|extra)\s+(program|plan|split|routine)|create a (program|plan|split|routine)/.test(lu);
        const editIntent=/\b(change|fix|update|edit|modify|move|swap|rotate|adjust|shorten|reorder|remove|replace|tweak|add)\b/.test(lu)||/\bmy (program|plan|split|routine|workout|day|week|push|pull|leg|legs|arm|arms|chest|back|shoulder)/.test(lu);
        if(editIntent&&!wantsNew&&activeProg&&PROGRAMS[activeProg]){ spec.action="replace"; spec.id=activeProg; }
        txt=(spec._clean||txt).trim(); action=spec.action||"add"; built=buildAIProgram(spec);
        if(built)pendingPrograms[built.id]={built:built,spec:spec}; else txt+="\n\nI couldn't match those exercises to the library. Ask again using common exercise names.";
      } else if(/<<<PROGRAM>>>|"days"\s*:/.test(txt)){ txt+="\n\nThe plan block was incomplete, so nothing was staged."; }
      if(built&&built.audit&&!built.audit.valid)txt+=(txt?"\n\n":"")+"Safety check blocked this plan:\n"+built.audit.errors.slice(0,4).map(x=>"• "+x).join("\n");
      chatMsgs.push({role:"assistant",text:txt||(built?"Review this plan, then tap Apply if you want it saved.":actionChip?"One tap to apply this change:":"(no reply)"),program:built?{id:built.id,name:built.prog.name,days:built.prog.days.length,action:action,pending:true,blocked:!built.audit.valid,errors:built.audit.errors.length,warnings:built.audit.warnings.length}:null,actionChip:actionChip});
    }
  }catch(e){ chatMsgs.push({role:"assistant",text:"Error: "+((e&&e.message)?e.message:e)}); }
  chatBusy=false; saveChatHistory(); renderChat();
}
