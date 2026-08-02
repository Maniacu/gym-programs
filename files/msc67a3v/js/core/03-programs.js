/* Program catalog, resolution, and the ONLY code path allowed to write custom/AI-built
 * program content. `PROGRAMS`/`FOCUS`/`LIB` are the reused, unmodified content from
 * js/lib/program.js and js/lib/library.js. `window.PROGRAMS` may be extended at runtime
 * with custom-program entries (so program pickers/build logic can treat them like any
 * other program), but a BUILT-IN id is never reassigned anywhere in this codebase — see
 * saveCustomProgram()/applyCustomPrograms() below, which is the structural fix for a bug
 * that hit the pre-rewrite app four times (a stale on-device coach edit permanently
 * shadowing a built-in program id, invisible to and unaffected by any future
 * program.js fix). */
const PROGRAMS=window.PROGRAMS, FOCUS=window.FOCUS, LIB=window.LIB||[];
const DIFF={ "3fb":"Beginner","4ul":"Intermediate","5up":"Advanced","6ppl":"Advanced","ubp":"Advanced","pp4":"Intermediate","bws":"Advanced","bwsnl":"Advanced","stier5":"Advanced" };
const PROG_ICON={ "3fb":"🟢","4ul":"⚡","5up":"🔥","6ppl":"💪","ubp":"🔝","pp4":"🔁","bws":"🔬","bwsnl":"🧪","stier5":"⭐" };
let PROGRAM=[];
const WDAYS=["MON","TUE","WED","THU","FRI","SAT","SUN"];

/* ---------- slot access (today's in-progress numbers for program day `d`, exercise `e`) ---------- */
/* Slot records are ephemeral/per-slot by design (weight/reps typed in today, which set
 * options/swap is selected) — unlike history/PRs/notes, they legitimately don't need
 * name-keying: a fresh day always starts a fresh grid regardless of which exercise
 * occupies the slot (see logGetSets in 10-log.js for the "is this stale, rebuild" check). */
function id(d,e){ return activeProg+"_"+PROGRAM[d].key+"_"+e; }
function rec(d,e){ const k=id(d,e); state.slots[k]=state.slots[k]||{}; return state.slots[k]; }
function equipDefaultOpts(opts){ const eq=profile&&profile.equip; if(!eq||eq==="full")return 0;
  const want=eq==="db"?(o=>/dumbbell/i.test(o.eq||"")):(o=>/body only|bands|none/i.test(o.eq||""));
  for(let i=0;i<opts.length;i++) if(want(opts[i]))return i;
  if(eq==="home") for(let i=0;i<opts.length;i++) if(/dumbbell/i.test(opts[i].eq||""))return i; return 0; }
function effOpt(slotKey, exObj){ const r=state.slots[slotKey]||{};
  /* Defence in depth for the positional-drift bug reconcileSlotSwaps() repairs below: if a
     durable choice records a base exercise and this slot no longer holds it, the choice
     belongs to a different exercise — never apply it here. */
  if(r.base&&exObj&&!sameEx(r.base,slotBaseName(exObj))) return exObj.opts[Math.min(equipDefaultOpts(exObj.opts),exObj.opts.length-1)];
  if(r.swap){
    const ref=exerciseIdentityFor(r.swap.n,r.swap.exerciseId||r.swap.libId,state);
    return {exerciseId:ref.exerciseId,libId:ref.libId,n:r.swap.n,r:exObj.opts[0].r,
      cue:r.swap.cue||"Tap the photo to view this exercise.",img:r.swap.img,eq:r.swap.eq};
  }
  const oi=r.opt!=null?r.opt:equipDefaultOpts(exObj.opts);
  return exObj.opts[Math.min(oi,exObj.opts.length-1)]; }
function optIdx(d,e){ const r=state.slots[id(d,e)]||{}; if(r.opt!=null)return r.opt; return equipDefaultOpts(PROGRAM[d].ex[e].opts); }
function curOpt(d,e){ return effOpt(id(d,e),PROGRAM[d].ex[e]); }

/* ---------- durable slot choices survive the program changing underneath them ---------- */
/* The ephemeral half of a slot record (today's typed weights/reps) genuinely doesn't need
 * name-keying — see the note above id(). The DURABLE half does, and didn't have it. A
 * future-scope swap or built-in-alternative pick is a statement about a specific EXERCISE
 * ("use X instead of Incline Dumbbell Curl"), but the record is keyed by POSITION
 * (activeProg_dayKey_index), and position is not stable: a shipped program.js update, an
 * OTA sync, the specialize step, a change to the priority ranking (buildActive re-sorts
 * every day by it) and the day editor all renumber a day's exercises.
 * When they do, the saved swap silently applies to whatever exercise now occupies that
 * index. Seen live on the user's own device: a swap saved on "5up_pull_3" was replacing an
 * Incline Dumbbell Curl with a cable ROW, which is why pull day appeared to have only one
 * biceps exercise.
 * So don't trust the key — reconcile against the built program after every build: re-home
 * each durable choice to wherever its base exercise actually landed, and drop it when the
 * day no longer contains that exercise at all. This is the same read-time-reconcile rule
 * getPriority() already follows for saved muscle rankings. */
function slotBaseName(exObj){ return (exObj&&exObj.opts&&exObj.opts[0]&&exObj.opts[0].n)||""; }
/* A pre-existing record predates `base` being written, so its true anchor is unknowable.
 * Adopting the current exercise freezes any further drift, but must not bless a record that
 * has ALREADY drifted — so a legacy swap whose own muscle disagrees with the slot's muscle
 * is treated as a drift corpse and dropped. That is exactly the row-on-a-curl-slot case. */
function legacySwapLooksDrifted(sw,exObj){
  if(!sw||!sw.n||!exObj||!exObj.m)return false;
  const lib=(typeof LIB!=="undefined"&&LIB.length)?LIB.find(x=>x.id===(sw.libId||sw.id)||x.n===sw.n):null;
  if(!lib)return false; // unknown exercise — leave it alone rather than guess
  const lm=(typeof libMuscleOf==="function"?libMuscleOf(lib):lib.m)||lib.m;
  return !!lm&&lm!==exObj.m;
}
function reconcileSlotSwaps(){
  const slots=state.slots||{}; let rehomed=0,dropped=0;
  PROGRAM.forEach(day=>{
    const prefix=activeProg+"_"+day.key+"_";
    /* Read every stored record for this day first, then write — re-homing while iterating
       would let one move clobber a record not yet examined. */
    const held=[];
    Object.keys(slots).forEach(k=>{
      if(k.indexOf(prefix)!==0)return;
      const idx=+k.slice(prefix.length); if(!Number.isInteger(idx))return;
      const r=slots[k]; if(!r||(!r.swap&&r.opt==null))return;
      held.push({k:k,idx:idx,r:r});
    });
    if(!held.length)return;
    held.forEach(h=>{
      const at=day.ex[h.idx], base=h.r.base;
      if(!base){ // legacy record: adopt the current exercise unless it has clearly drifted
        if(!at)return;
        if(h.r.swap&&legacySwapLooksDrifted(h.r.swap,at)){ delete h.r.swap; delete h.r.opt; dropped++; return; }
        h.r.base=slotBaseName(at); return;
      }
      if(at&&sameEx(slotBaseName(at),base))return; // still in the right place
      const j=day.ex.findIndex(x=>sameEx(slotBaseName(x),base));
      if(j<0){ delete h.r.swap; delete h.r.opt; dropped++; return; } // exercise left the day
      const dest=prefix+j, cur=slots[dest]||(slots[dest]={});
      if(cur.swap||cur.opt!=null)return; // destination already carries its own choice — don't overwrite
      if(h.r.swap){ cur.swap=h.r.swap; delete h.r.swap; }
      if(h.r.opt!=null){ cur.opt=h.r.opt; delete h.r.opt; }
      cur.base=base; delete cur.sets; rehomed++;
    });
  });
  if(rehomed||dropped){ save();
    if(typeof toast==="function"&&(rehomed||dropped))
      toast(rehomed?("Kept "+rehomed+" exercise change"+(rehomed>1?"s":"")+" after the program update"):
        (dropped+" saved change"+(dropped>1?"s":"")+" no longer applied"));
  }
  return {rehomed:rehomed,dropped:dropped};
}

/* ---------- priority / program build ---------- */
/* The tracked muscle list now lives in 00-util.js as MUSCLES — see the note there. */
const EMPH_LIST={Chest:["Cable Chest Fly","Incline Dumbbell Press","Flat Dumbbell Bench Press"],Back:["Seated Cable Rows","One-Arm Dumbbell Row","Lat Pulldown"],Shoulders:["Cable Lateral Raise","Dumbbell Lateral Raise","Seated Dumbbell Shoulder Press"],Biceps:["Cable Curl","Incline Dumbbell Curl","Dumbbell Hammer Curl"],Triceps:["Tricep Rope Pushdown","Overhead Cable Tricep Extension","EZ-Bar Skull Crusher"],Legs:["Leg Extension","Lying Leg Curl","Leg Press"],"Rear delts":["Face Pull","Dumbbell Rear Delt Fly"],Core:["Cable Crunch","Hanging Leg Raise"],
  /* One pick per trap region, matching the three the smart trainer already distinguishes
     (upper/shrug, mid/retraction, lower/Y-raise). Dumbbell over barbell shrugs for the
     usual reason — same stimulus, far less axial load. Resolved via findEx() against
     program.js, so "Incline Kelso Shrug" is valid here despite not being a LIB entry. */
  Traps:["Dumbbell Shrug","Incline Kelso Shrug","Prone Incline Y-Raise"]};
let _exCache=null;
function findEx(n){ if(!_exCache){_exCache={};Object.values(PROGRAMS).forEach(p=>p.days.forEach(d=>d.ex.forEach(x=>{if(!_exCache[x.opts[0].n])_exCache[x.opts[0].n]={m:x.m,opts:x.opts};})));} return _exCache[n]||null; }
/* Loose match so "Seated Cable Row" and "Seated Cable Rows" (a real, still-uncaught
   naming inconsistency somewhere in the library) count as the same exercise for
   dedup purposes — otherwise the specialize step below can inject a near-duplicate
   under a slightly different name for the same movement. Also treats a qualifier-PREFIXED
   variant ("Wide-Grip Lat Pulldown" vs "Lat Pulldown") as the same base movement via
   suffix matching — found live when specialize added a bare "Lat Pulldown" on top of an
   already-present "Wide-Grip Lat Pulldown". Deliberately suffix (not any-substring):
   full containment also matched mid-name fragments and could merge genuinely different
   movements a program prescribes on the same day. */
function sameEx(a,b){ const n=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"").replace(/s$/,""); const na=n(a),nb=n(b); return na===nb||na.endsWith(nb)||nb.endsWith(na); }
/* Reconcile the saved ranking against the canonical muscle list every time it is read,
 * rather than trusting whatever was stored. A ranking is written once at setup and then
 * outlives several releases: Traps became a tracked muscle in v3.39.0, so every profile
 * saved before that holds an 8-item list with no Traps in it.
 *
 * That was not cosmetic. The onboarding priority screen renders exactly this array, so a
 * muscle missing from it could never be ranked — re-running setup showed the same 8 rows
 * and there was no way to reach the 9th, permanently. Everywhere else the missing muscle
 * fell to indexOf() === -1 and got sorted as if it were the lowest possible priority.
 *
 * Order the user actually chose is preserved; anything they have never ranked is appended
 * in canonical order (so it lands last, matching the old behaviour), and anything no longer
 * tracked is dropped. */
function getPriority(){
  const known=MUSCLES.slice();
  const ranked=(profile&&Array.isArray(profile.priority))?profile.priority.filter(m=>known.indexOf(m)>=0):[];
  known.forEach(m=>{ if(ranked.indexOf(m)<0)ranked.push(m); });
  return ranked;
}

function buildActive(){
  if(!activeProg||!PROGRAMS[activeProg]) activeProg="5up";
  let prog=PROGRAMS[activeProg];
  if(!prog){ const k=Object.keys(PROGRAMS)[0]; if(k){ activeProg=k; state.programId=k; prog=PROGRAMS[k]; } }
  if(!prog||!Array.isArray(prog.days)){ PROGRAM=[]; return; } // nothing valid to build (e.g. bad OTA)
  PROGRAM=prog.days.map(d=>({key:d.key,color:d.color,day:d.day,title:d.title,sub:d.sub,mus:d.mus.slice(),userOrder:!!d.userOrder,ex:d.ex.map(x=>({m:x.m,sec:!!x.sec,opts:x.opts.map(o=>{
    const copy=Object.assign({},o),ref=exerciseIdentityFor(copy.n,copy.exerciseId||copy.libId,state);
    copy.exerciseId=ref.exerciseId;copy.libId=ref.libId;return copy;
  })}))}));
  const pr=getPriority(),top=pr.slice(0,2);
  // SPECIALIZE top 2: add one extra exercise on days that train them (never remove — keep
  // full days). Skipped when the program declares noEmph: a coach/hand-built program with
  // a deliberate per-muscle volume allocation shouldn't get auto-emphasis stacked on top
  // (it silently inflated e.g. Back day volume well past the productive range).
  // `sec` marks accessory work that is parked on a day for convenience rather than being
  // what the day is for — an erector back-extension after leg-day RDLs, a light trap
  // raise at the end of an upper day. Such an exercise must NOT make the day count as
  // training that muscle: otherwise a single erector accessory turns leg day into a back
  // day, and the specialize rule below bolts a row onto it.
  if(!prog.noEmph) top.forEach(mus=>PROGRAM.forEach(day=>{ if(!day.ex.some(e=>e.m===mus&&!e.sec))return;
    const cands=(EMPH_LIST[mus]||[]).map(findEx).filter(Boolean), add=cands.find(ex=>!day.ex.some(e=>sameEx(e.opts[0].n,ex.opts[0].n)));
    if(add)day.ex.push({m:add.m,opts:add.opts}); }));
  // ORDER: keep the main lift first, then sort the rest by priority — unless the user
  // set an explicit order via the day editor (day.userOrder), which always wins.
  // Accessories always sort last regardless of how highly their muscle ranks, so leg day
  // cannot open with back work just because Back is a priority.
  PROGRAM.forEach(day=>{ if(!day.userOrder&&day.ex.length>2){ const f=day.ex[0],r=day.ex.slice(1);
    r.sort((a,b)=>{
      const as=a.sec?1:0,bs=b.sec?1:0; if(as!==bs)return as-bs;
      return (pr.indexOf(a.m)<0?99:pr.indexOf(a.m))-(pr.indexOf(b.m)<0?99:pr.indexOf(b.m));
    });
    day.ex=[f].concat(r); } });
  // user-added exercises for this program's days (persist + re-apply over OTA).
  // "Feeling strong" bonus finishers carry __bonusDate and expire after their day —
  // they were a one-off top-up, not a permanent program change.
  const EX=state.extraExercises||{};
  PROGRAM.forEach(day=>{ let add=EX[activeProg+"_"+day.key]; if(add&&add.length){
    const keep=add.filter(e=>!e.__bonusDate||e.__bonusDate===todayStr());
    if(keep.length!==add.length)EX[activeProg+"_"+day.key]=add=keep;
    add.forEach(e=>{
      /* Skip an addition the day already contains. A user-added exercise is permanent, but
         the program underneath it is not: a shipped program.js update (or an OTA sync) can
         later introduce the very movement the user added by hand, and the result was the
         same exercise listed twice in one day. Seen live — a hand-added Reverse Grip Triceps
         Pushdown collided with the same exercise arriving in the built-in 5up program. Uses
         the same sameEx() compare the specialize step already relies on, so singular/plural
         and qualifier-prefixed variants are caught too. The extra is dropped from the built
         day only; state.extraExercises is left untouched, so it reappears intact if the
         program later stops shipping that movement. */
      if(day.ex.some(x=>sameEx(x.opts[0].n,e.opts[0].n)))return;
      const item={m:e.m,opts:e.opts,__user:true}; if(!day.mus.includes(e.m))day.mus.push(e.m);
      // Group with its muscle: drop the added exercise right after the LAST existing
      // exercise of the same muscle, instead of dumping every add at the end of the day.
      // (Adding a second exercise of the same muscle finds the first add and follows it.)
      let after=-1; for(let j=0;j<day.ex.length;j++){ if(day.ex[j].m===e.m)after=j; }
      if(after>=0)day.ex.splice(after+1,0,item); else day.ex.push(item); }); } });
  if(curDay>=PROGRAM.length)curDay=0;
  /* Runs last: every reorder/add above is already applied, so the indices reconciled
     against here are the ones the UI will actually read. */
  reconcileSlotSwaps();
  syncReminders();
  syncWidgetInfo();
}

/** Pushes today's plan + streak to the Android home-screen widget (native side stores it
 *  in SharedPreferences and refreshes the RemoteViews). Called whenever the program is
 *  rebuilt and after finishing a workout. trainingStreak lives in 04-history, loaded
 *  after this file — fine at call time, guarded for safety. */
function syncWidgetInfo(){
  try{
    const wd=todayWeekday(), di=dayForWeekday(wd);
    const l1=di>=0?(PROGRAM[di].title+" · "+PROGRAM[di].ex.length+" exercises"):"Rest day — recover well";
    const st=(typeof trainingWeekStreak==="function")?trainingWeekStreak():0;
    const trained=!!(state.workoutHistory&&state.workoutHistory[0]&&state.workoutHistory[0].date===todayStr());
    const l2=(trained?"Trained today ✓":"Tap to start")+(st?" · "+st+" week streak":"");
    native("syncWidget",l1,l2);
  }catch(e){}
}

/* Tells native which weekdays to remind on + a short label per day, so a daily local
   notification can fire even if the app isn't open. Runs every time the program/schedule
   changes (program switch, day move, coach edit) since buildActive() is the one place
   all of those funnel through. */
function syncReminders(){
  try{
    const days=[...new Set(PROGRAM.map(d=>d.day))].join(",");
    const labels={};
    PROGRAM.forEach(d=>{ const first=d.ex&&d.ex[0]&&d.ex[0].opts&&d.ex[0].opts[0]; labels[d.day]=d.title+(first?" - "+first.n:""); });
    native("syncReminderDays",days,JSON.stringify(labels));
  }catch(e){}
}
function progWeeklySets(){ const w={}; PROGRAM.forEach(d=>d.ex.forEach(e=>{ w[e.m]=(w[e.m]||0)+targetSets(e.opts[0].r); })); return w; }
function dayForWeekday(wd){ for(let i=0;i<PROGRAM.length;i++) if(PROGRAM[i].day===wd) return i; return -1; }
function todayWeekday(){ const g=new Date().getDay(); return WDAYS[(g+6)%7]; }

/* ---------- canonical exercise knowledge + deterministic program compiler ----------
 * The language model may suggest a workout, but it never gets the final word. These
 * helpers resolve every exercise to a real library id, restore the library's canonical
 * muscle/equipment data and compile the complete week against explicit constraints. */
function canonicalMuscleLabel(raw){
  const s=String(raw||"").toLowerCase();
  if(/chest|pectoral/.test(s))return "Chest";
  if(/lat|back|rhomboid|trap/.test(s))return "Back";
  if(/rear.*delt|posterior.*delt/.test(s))return "Rear delts";
  if(/shoulder|delt/.test(s))return "Shoulders";
  if(/bicep|brachialis/.test(s))return "Biceps";
  if(/tricep/.test(s))return "Triceps";
  if(/quad|hamstring|glute|calf|leg|adductor|abductor/.test(s))return "Legs";
  if(/core|abdominal|oblique|abs/.test(s))return "Core";
  return MUSCLES.indexOf(raw)>=0?raw:null;
}
function canonicalNameKey(s){ return String(s||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim(); }
function canonicalExercise(name,muscleHint){
  const key=canonicalNameKey(name); if(!key)return null;
  let ex=LIB.find(x=>canonicalNameKey(x.id)===key||canonicalNameKey(x.n)===key);
  if(ex)return {exercise:ex,confidence:1,match:"exact"};
  const toks=[...new Set(key.split(/\s+/).filter(x=>x.length>1))];
  if(!toks.length)return null;
  const hint=canonicalMuscleLabel(muscleHint);
  let best=null,second=0;
  LIB.forEach(x=>{
    const xt=[...new Set(canonicalNameKey(x.n).split(/\s+/).filter(t=>t.length>1))];
    const hit=toks.filter(t=>xt.indexOf(t)>=0).length;
    let score=hit/Math.max(toks.length,xt.length);
    const xkey=canonicalNameKey(x.n);
    if(key.length>5&&(xkey.includes(key)||key.includes(xkey)))score=Math.max(score,.82);
    if(hint&&canonicalMuscleLabel(x.m)===hint)score+=.07;
    if(!best||score>best.score){second=best?best.score:second;best={exercise:x,score:score};}
    else if(score>second)second=score;
  });
  if(!best)return null;
  const min=toks.length===1?.92:.66;
  if(best.score<min||best.score-second<.06)return null;
  return {exercise:best.exercise,confidence:Math.min(.94,best.score),match:"fuzzy"};
}
function exerciseMovementPattern(ex){
  const n=canonicalNameKey((ex&&ex.n)||"");
  if(/lateral raise|side lateral/.test(n))return "lateral-raise";
  if(/rear delt|reverse fly|reverse machine|face pull/.test(n))return "rear-delt";
  if(/fly|flye|crossover|pec deck/.test(n))return "chest-fly";
  if(/pullover|straight arm pulldown/.test(n))return "shoulder-extension";
  if(/pulldown|pull up|pullup|chin up/.test(n))return "vertical-pull";
  if(/\brow\b|rows/.test(n))return "horizontal-pull";
  if(/overhead press|shoulder press|military press|arnold press/.test(n))return "vertical-press";
  if(/bench press|chest press|push up|pushup|\bdip/.test(n))return "horizontal-press";
  if(/deadlift|romanian|good morning|hip hinge|pull through/.test(n))return "hinge";
  if(/leg curl|nordic/.test(n))return "knee-flexion";
  if(/leg extension|sissy squat/.test(n))return "knee-extension";
  if(/squat|leg press|hack squat/.test(n))return "squat";
  if(/lunge|split squat|step up/.test(n))return "single-leg";
  if(/calf|soleus/.test(n))return "calf";
  if(/tricep|skull|pushdown|pressdown/.test(n))return "elbow-extension";
  if(/\bcurl\b|curls|preacher/.test(n))return "elbow-flexion";
  if(/crunch|plank|sit up|leg raise|ab wheel|pallof/.test(n))return "core";
  if(/shrug/.test(n))return "shrug";
  if(/carry|walk/.test(n))return "carry";
  return "other";
}
function exerciseKnowledge(ex){
  ex=ex||{}; const n=canonicalNameKey(ex.n),eq=String(ex.eq||"").toLowerCase(),cat=String(ex.cat||"").toLowerCase();
  const pattern=exerciseMovementPattern(ex),primary=canonicalMuscleLabel(ex.m||ex.pm)||"Chest",secondary={};
  const add=(m,f)=>{if(m&&m!==primary)secondary[m]=Math.max(secondary[m]||0,f);};
  String(ex.sm||"").split(/[,/&]+/).map(canonicalMuscleLabel).filter(Boolean).forEach(m=>add(m,.5));
  if(pattern==="horizontal-press"){add("Triceps",.5);add("Shoulders",.35);}
  if(pattern==="vertical-press")add("Triceps",.5);
  if(pattern==="horizontal-pull"||pattern==="vertical-pull"){add("Biceps",.5);add("Rear delts",.25);}
  if(pattern==="hinge")add(primary==="Back"?"Legs":"Back",.35);
  const nonHypertrophy=/stretch|smr|foam|running|bicycl|elliptical|sprint|jump|throw|swim|rowing machine|cardio/.test(n+" "+cat)||
    /cardio|foam roll/.test(eq);
  const compound=["horizontal-press","vertical-press","horizontal-pull","vertical-pull","hinge","squat","single-leg"].indexOf(pattern)>=0;
  const stability=/machine/.test(eq)?90:/cable/.test(eq)?82:/dumbbell/.test(eq)?65:/barbell/.test(eq)?55:/body/.test(eq)?62:58;
  let jointStress=compound?36:22,axial=10,skill=compound?55:28;
  if(/behind neck|upright row|guillotine|skull crusher|weighted dip/.test(n))jointStress+=28;
  if(pattern==="hinge"||(/barbell/.test(eq)&&(pattern==="squat"||pattern==="horizontal-pull")))axial=75;
  else if(compound)axial=38;
  if(/olympic|snatch|clean|jerk|muscle up|pistol/.test(n))skill=90;
  const lengthened=/incline.*curl|overhead.*tricep|romanian|stiff leg|fly|lunge|split squat|pullover|full range/.test(n)?85:60;
  return {id:ex.id||canonicalNameKey(ex.n).replace(/\s+/g,"_"),name:ex.n,primary:primary,secondary:secondary,
    pattern:pattern,compound:compound,hypertrophy:!nonHypertrophy,stability:stability,jointStress:Math.min(100,jointStress),
    axialFatigue:axial,skill:skill,lengthened:lengthened,equipment:eq};
}
function profileExerciseAllowed(ex){
  const p=profile||{},name=canonicalNameKey(ex&&ex.n),eq=String((ex&&ex.eq)||"").toLowerCase();
  if((p.excludedExercises||[]).some(x=>canonicalNameKey(x)===name))return {ok:false,reason:"excluded by your profile"};
  const exact=p.equipmentList||[];
  if(exact.length&&!/body|none/.test(eq)){
    const alias=raw=>{
      const s=String(raw||"").toLowerCase().trim();
      if(/dumbbell/.test(s))return "dumbbell";
      if(/\bcable/.test(s))return "cable";
      if(/\bbarbell/.test(s))return "barbell";
      if(/kettlebell/.test(s))return "kettlebell";
      if(/\bband/.test(s))return "band";
      if(/e-?z|ez curl/.test(s))return "e-z curl bar";
      if(/^machines?$/.test(s))return "machine";
      return s;
    };
    const available=exact.some(raw=>{
      const text=canonicalNameKey(raw),tag=alias(raw);
      return (tag&&eq.includes(tag))||(text.length>2&&(name.includes(text)||text.includes(name)));
    });
    if(!available)return {ok:false,reason:"equipment not available"};
  }
  if(p.equip==="db"&&!/dumbbell|body|band|bench|none/.test(eq))return {ok:false,reason:"not available in dumbbell-only mode"};
  if(p.equip==="home"&&!/dumbbell|body|band|kettlebell|bench|none/.test(eq))return {ok:false,reason:"not available at home"};
  return {ok:true,reason:""};
}
function programFractionalVolume(prog){
  const out={};MUSCLES.forEach(m=>out[m]={direct:0,indirect:0,total:0,frequency:0});
  (prog.days||[]).forEach(day=>{
    const seen={};
    (day.ex||[]).forEach(e=>{
      const o=e.opts&&e.opts[0],sets=targetSets((o&&o.r)||"3 x 8-12"),m=canonicalMuscleLabel(e.m)||e.m;
      if(!out[m])out[m]={direct:0,indirect:0,total:0,frequency:0};
      out[m].direct+=sets;out[m].total+=sets;seen[m]=1;
      const resolved=canonicalExercise(o&&o.n,m),k=exerciseKnowledge(resolved?resolved.exercise:{n:o&&o.n,m:m,eq:o&&o.eq});
      Object.keys(k.secondary).forEach(sm=>{if(!out[sm])out[sm]={direct:0,indirect:0,total:0,frequency:0};const v=sets*k.secondary[sm];out[sm].indirect+=v;out[sm].total+=v;seen[sm]=1;});
    });
    Object.keys(seen).forEach(m=>out[m].frequency++);
  });
  Object.keys(out).forEach(m=>{out[m].indirect=Math.round(out[m].indirect*10)/10;out[m].total=Math.round(out[m].total*10)/10;});
  return out;
}
function compileProgram(prog,options){
  options=options||{}; const clean=JSON.parse(JSON.stringify(prog||{})),errors=[],warnings=[],fixes=[],dayMetrics=[];
  if(!Array.isArray(clean.days)||!clean.days.length)return {program:clean,valid:false,errors:["Program has no training days"],warnings:[],fixes:[],metrics:{}};
  clean.noEmph=true;
  const weekdays={};
  clean.days.forEach((day,di)=>{
    day.userOrder=true;day.key=day.key||safeId((clean.id||"plan")+"_"+day.day+"_"+di,"day_"+di);
    if(weekdays[day.day])errors.push(day.day+" is assigned more than once");weekdays[day.day]=1;
    let sets=0,patterns={},unknown=0;
    (day.ex||[]).forEach((e,ei)=>{
      const o=e.opts&&e.opts[0];if(!o){errors.push(day.day+" exercise "+(ei+1)+" is incomplete");return;}
      const match=canonicalExercise(o.libId||o.n,e.m);
      if(!match){errors.push(day.day+": unknown or ambiguous exercise \""+o.n+"\"");unknown++;return;}
      const lib=match.exercise,oldName=o.n;
      e.m=canonicalMuscleLabel(lib.m)||e.m;o.n=lib.n;o.exerciseId=lib.id;o.libId=lib.id;o.eq=lib.eq;o.img=lib.img;o.cue=lib.cue;
      if(oldName!==o.n)fixes.push(day.day+": matched \""+oldName+"\" to \""+o.n+"\"");
      const count=targetSets(o.r),safeCount=Math.max(2,Math.min(5,count));
      if(count!==safeCount){o.r=String(o.r||"3 x 8-12").replace(/^\d+/,String(safeCount));fixes.push(day.day+": set "+o.n+" to "+safeCount+" sets");}
      sets+=safeCount;
      const knowledge=exerciseKnowledge(lib);patterns[knowledge.pattern]=(patterns[knowledge.pattern]||0)+1;
      if(!knowledge.hypertrophy)warnings.push(day.day+": "+o.n+" is not primarily a hypertrophy exercise");
      const allowed=profileExerciseAllowed(lib);if(!allowed.ok)errors.push(day.day+": "+o.n+" - "+allowed.reason);
      if(profile&&(profile.painAreas||[]).length&&knowledge.jointStress>=60)warnings.push(day.day+": review "+o.n+" against your pain/joint profile");
    });
    Object.keys(patterns).forEach(p=>{if(p!=="other"&&patterns[p]>2)warnings.push(day.day+": "+patterns[p]+" exercises repeat the "+p+" pattern");});
    if(sets>24)errors.push(day.day+" has "+sets+" working sets (maximum 24)");
    else if(sets>20)warnings.push(day.day+" is a long "+sets+"-set session");
    const minutes=Math.round((sets*2.2+(day.ex||[]).length*1.8)/5)*5;
    if(profile&&profile.sessionMinutes&&minutes>+profile.sessionMinutes+10)warnings.push(day.day+" is estimated at "+minutes+" min, above your "+profile.sessionMinutes+"-min preference");
    dayMetrics.push({day:day.day,sets:sets,exercises:(day.ex||[]).length,minutes:minutes,unknown:unknown});
  });
  const volume=programFractionalVolume(clean),priority=(profile&&profile.priority)||[];
  Object.keys(volume).forEach(m=>{
    const v=volume[m];if(!v.total)return;
    if(v.total>24)errors.push(m+" reaches "+v.total+" fractional weekly sets");
    else if(v.total>20)warnings.push(m+" is high at "+v.total+" fractional weekly sets");
    if(v.total>12&&v.frequency<2)warnings.push(m+" volume is concentrated in one session");
    if(priority.slice(0,2).indexOf(m)>=0&&v.total<8)warnings.push(m+" is a priority but has only "+v.total+" fractional weekly sets");
  });
  const muscles=Object.keys(volume).filter(m=>volume[m].direct>0),hasUpper=muscles.some(m=>["Chest","Back","Shoulders","Biceps","Triceps","Rear delts"].indexOf(m)>=0);
  if(hasUpper&&!volume.Back.direct)warnings.push("No direct back exercise is programmed");
  if(hasUpper&&!volume.Chest.direct)warnings.push("No direct chest exercise is programmed");
  const audit={program:clean,valid:errors.length===0,errors:errors,warnings:warnings,fixes:fixes,
    metrics:{days:dayMetrics,weeklyVolume:volume,totalSets:dayMetrics.reduce((a,d)=>a+d.sets,0)}};
  state.lastProgramAudit={date:todayStr(),valid:audit.valid,errors:errors.slice(0,12),warnings:warnings.slice(0,20),fixes:fixes.slice(0,20)};
  return audit;
}

function setProgram(pid){ if(!PROGRAMS[pid]){toast("Program unavailable");return;} if(pid!==activeProg&&typeof rememberProgramUndo==="function")rememberProgramUndo("switch"); activeProg=pid; state.programId=pid; curDay=0; selWeekday=null; save(); buildActive(); toast(PROGRAMS[pid].name+" selected"); nav("plan"); }

/* ---------- program shape validation (imports / OTA / coach output) ---------- */
function sanitizeProgram(raw,fallbackId){
  if(!plainObj(raw)||!Array.isArray(raw.days))return null;
  const id=safeId(raw.id||fallbackId,"custom"), days=[];
  raw.days.slice(0,7).forEach((d,di)=>{
    if(!plainObj(d)||!Array.isArray(d.ex))return;
    const ex=[];
    d.ex.slice(0,24).forEach((e,ei)=>{
      if(!plainObj(e)||!Array.isArray(e.opts))return;
      const opts=[];
      e.opts.slice(0,8).forEach(o=>{
        if(!plainObj(o))return;
        const n=safeText(o.n,90); if(!n)return;
        const cleanOpt={n:n,r:safeText(o.r,32)||"3 x 8-12",cue:safeText(o.cue,900),img:safeImg(o.img),eq:safeText(o.eq,50)};
        if(o.exerciseId)cleanOpt.exerciseId=safeId(o.exerciseId,"");
        if(o.libId)cleanOpt.libId=safeId(o.libId,"");
        const ref=exerciseIdentityFor(n,cleanOpt.exerciseId||cleanOpt.libId,state);
        cleanOpt.exerciseId=ref.exerciseId;cleanOpt.libId=ref.libId;
        opts.push(cleanOpt);
      });
      if(opts.length)ex.push({m:safeText(e.m||opts[0].m,40)||"Chest",opts:opts,__user:!!e.__user});
    });
    if(ex.length){
      const dd={key:safeId(d.key,id+"_"+di),color:safeText(d.color,24)||"upper",day:safeText(d.day,3).toUpperCase()||WDAYS[di%7],title:safeText(d.title,60)||"WORKOUT",sub:safeText(d.sub,120),mus:(Array.isArray(d.mus)?d.mus.map(x=>safeText(x,40)).filter(Boolean):[...new Set(ex.map(x=>x.m))]),ex:ex};
      if(d.userOrder===true)dd.userOrder=true; // preserve "manual order, skip auto-sort"
      days.push(dd);
    }
  });
  if(!days.length)return null;
  const meta=plainObj(raw.meta)?raw.meta:{};
  const out={id:id,name:safeText(raw.name,80)||"Custom Program",meta:{days:days.length,type:safeText(meta.type,60)||"Custom",best:safeText(meta.best,180)||"Imported program"},days:days};
  if(raw.noEmph===true)out.noEmph=true; // preserve "volume is deliberate, skip auto-emphasis"
  return out;
}

/* ---------- the fresh-id contract: the ONLY way custom/AI/imported program content is
 * ever persisted. Built-in ids (3fb/4ul/5up/6ppl/ubp/pp4/bws/bwsnl) are immutable data
 * from js/lib/program.js — nothing in this file, or anywhere else, may assign into
 * window.PROGRAMS under one of those ids. `meta.overwriteCustomId` lets a caller update
 * an existing custom program in place (e.g. the user iterating on the same AI-built plan
 * within one session); passing a built-in id there is rejected and a fresh id is used
 * instead, so "edit my program" on a built-in program always clones it first. ---------- */
/** Auto-corrects a program before it's saved — catches the same two defect classes
 *  found by hand this session (duplicate exercises within a day, a "1 set" typo) so
 *  they can't silently slip through the coach-edit OR manual-edit path again. Runs on
 *  EVERY save, not just coach edits, since a manual edit could introduce the same
 *  issues. Skips the set-count fix for AMRAP/max-effort singles, which are a real
 *  (if uncommon) intentional prescription, not a typo. Returns a list of human-readable
 *  fix descriptions (empty if the program was already clean) so the caller can tell the
 *  user what changed instead of silently rewriting their data.
 *  NOTE: deliberately NOT named sanitizeProgram — that's the structural validator
 *  above, and a same-name declaration here silently shadowed it for the whole bundle
 *  (later `function` declarations win), corrupting backup imports of custom programs.
 *  validate_app.js now fails the build on any duplicate top-level function name. */
function autoFixProgram(prog){
  const fixes=[];
  (prog.days||[]).forEach(day=>{
    const seen=[];
    day.ex=(day.ex||[]).filter(e=>{
      const n=(e.opts&&e.opts[0]&&e.opts[0].n)||"";
      if(!n)return true;
      if(seen.some(s=>sameEx(s,n))){ fixes.push("Removed a duplicate \""+n+"\" on "+day.day); return false; }
      seen.push(n);
      return true;
    });
    day.ex.forEach(e=>{
      const o=e.opts&&e.opts[0]; if(!o||!o.r||/amrap|max/i.test(o.r))return;
      const m=o.r.match(/^(\d+)/);
      if(m&&+m[1]<2){ fixes.push("Bumped \""+o.n+"\" from "+m[1]+" set to 2 sets on "+day.day); o.r=o.r.replace(/^\d+/,"2"); }
    });
  });
  return fixes;
}
function saveCustomProgram(prog, meta){
  meta=meta||{};
  const wantId=meta.overwriteCustomId;
  const id=(wantId&&BUILTIN_PROGRAM_IDS.indexOf(wantId)===-1)?wantId:("custom_"+Date.now());
  let clean=JSON.parse(JSON.stringify(prog));
  clean.id=id;
  const fixes=autoFixProgram(clean);
  const audit=compileProgram(clean,{strict:meta.source==="coach"});
  clean=audit.program;
  if(meta.source==="coach"&&!audit.valid){
    save();
    toast("Plan blocked: "+audit.errors[0]);
    return null;
  }
  state.customPrograms=state.customPrograms||{};
  const previous=state.customPrograms[id];
  state.customPrograms[id]={
    id:id,
    basedOn:meta.basedOn||null,
    source:meta.source||"manual",
    createdAt:(previous&&previous.createdAt)||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    revision:((previous&&previous.revision)||0)+1,
    // persisted so applyCustomPrograms() can restore the badge/icon after a restart —
    // without these the DIFF/PROG_ICON entries only lived in memory and every custom
    // program reverted to "Custom"/🤖 on next launch
    diff:meta.diff||"Custom",
    icon:meta.icon||"🤖",
    audit:{valid:audit.valid,errors:audit.errors,warnings:audit.warnings,fixes:audit.fixes,metrics:audit.metrics},
    prog:clean
  };
  window.PROGRAMS[id]=clean;
  DIFF[id]=meta.diff||"Custom";
  PROG_ICON[id]=meta.icon||"🤖";
  save();
  if(fixes.length) toast("Saved — auto-fixed "+fixes.length+" issue"+(fixes.length>1?"s":"")+" (duplicate/set-count)");
  return id;
}
/** Restores custom programs from persisted state onto window.PROGRAMS on boot. Called
 *  exactly once, from app.js's boot sequence — unlike the pre-rewrite app, there is no
 *  second call site (it used to also run inside the OTA-refresh path, which made it
 *  unclear which of two call sites actually "won"). Skips (rather than trusts) any entry
 *  whose id collides with a built-in id — defense in depth, since saveCustomProgram()
 *  should never produce one, but this is the last line of defense against it happening. */
function applyCustomPrograms(){
  const cp=state.customPrograms||{};
  Object.keys(cp).forEach(function(id){
    if(BUILTIN_PROGRAM_IDS.indexOf(id)!==-1)return;
    const entry=cp[id];
    if(!entry||!plainObj(entry.prog))return;
    window.PROGRAMS[id]=entry.prog;
    DIFF[id]=DIFF[id]||entry.diff||"Custom";
    PROG_ICON[id]=PROG_ICON[id]||entry.icon||"🤖";
  });
}

/** Saves a snapshot of the currently-active program (built-in or custom) so it can be
 *  restored later from More > Program versions. Restoring one must go back through
 *  saveCustomProgram(), never write window.PROGRAMS[x.id] directly — see view-more.js. */
function snapshotProgram(label){ if(!activeProg||!PROGRAMS[activeProg])return; state.programVersions=state.programVersions||[]; state.programVersions.unshift({date:new Date().toLocaleString(),id:activeProg,label:label||PROGRAMS[activeProg].name,prog:JSON.parse(JSON.stringify(PROGRAMS[activeProg])),diff:DIFF[activeProg],icon:PROG_ICON[activeProg]}); state.programVersions=state.programVersions.slice(0,12); save(); }
