/* Zero-dependency helpers: no reference to `state`, `PROGRAMS`, or `window.GymNative`.
 * Loaded first — every other file can assume everything here already exists.
 * `toast`/`buzz` are the one deliberate exception to "zero DOM": every other file needs
 * a way to show a toast or vibrate from its very first line, and neither touches state
 * or programs, so they live here rather than forcing a dependency on a later file. */

/* ---------- theme (light/dark) ---------- */
/* Applied synchronously in index.html's <head> (before any CSS/JS below it runs) to avoid
 * a flash of the wrong theme on load. This just keeps the rest of the app in sync with
 * whatever that inline snippet already set. */
function theme(){ return document.documentElement.dataset.theme==="dark"?"dark":"light"; }
function setTheme(t){ t=t==="dark"?"dark":"light"; document.documentElement.dataset.theme=t; try{localStorage.setItem("gymTheme",t);}catch(e){}
  // keep the native WebView background in sync so next launch paints the right color
  try{ if(typeof native==="function")native("setNativeTheme",t==="dark"); }catch(e){} }
/* Auto theme: no stored gymTheme means "follow the system" (index.html's inline snippet
   applies the same rule pre-CSS; app.js listens for live system-theme changes). */
function themePref(){ try{return localStorage.getItem("gymTheme")||"auto";}catch(e){return "auto";} }
function applyAutoTheme(){ let d=false; try{ d=!!(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches); }catch(e){}
  document.documentElement.dataset.theme=d?"dark":"light";
  try{ if(typeof native==="function")native("setNativeTheme",d); }catch(e){} }
function setThemePref(p){ if(p==="auto"){ try{localStorage.removeItem("gymTheme");}catch(e){} applyAutoTheme(); } else setTheme(p); }

/* ---------- units ---------- */
let unit = localStorage.getItem("gymUnit") || "kg";
const LBF = 2.2046226;
function toDisp(kg){ if(kg==null||kg==="")return ""; return unit==="lb"?Math.round(kg*LBF*2)/2:kg; }
function toKg(v){ if(v==null||v==="")return null; const n=parseFloat(v); if(isNaN(n))return null; return unit==="lb"?Math.round(n/LBF*4)/4:n; }
function uStep(){ return unit==="lb"?5:2.5; }
function round25(x){ return Math.round(x/2.5)*2.5; }
/* Equipment-aware load increments: dumbbells rack in 2 kg (5 lb) jumps, machine stacks
   in ~5 kg (10 lb) pins, barbells/cables in 2.5 kg (5 lb) plate pairs. "Add 2.5 kg" on
   a dumbbell exercise is physically impossible to follow — these keep every stepper tap
   and next-weight suggestion loadable with real gym equipment. */
function eqStepKg(opt){ const eq=((opt&&opt.eq)||"").toLowerCase();
  if(/dumbbell|kettlebell/.test(eq))return 2;
  if(/machine/.test(eq))return 5;
  return 2.5; }
function eqStepDisp(opt){ if(unit==="lb")return /machine/i.test((opt&&opt.eq)||"")?10:5; return eqStepKg(opt); }
function roundStep(x,st){ st=st||2.5; return Math.round(x/st)*st; }
/* volume is stored internally in kg; show it in the user's unit */
function volDisp(kg){ const n=(unit==="lb"?(+kg||0)*LBF:(+kg||0)); return Math.round(n); }

/* ---------- drop sets are bonus finisher work, not part of the prescribed working sets —
   they shouldn't gate an exercise's "done" state or count toward its required total.
   Every completion check reads through these two helpers instead of raw sets.length/
   done.length. ---------- */
function requiredSets(setsArr){ return (setsArr||[]).filter(s=>!s.drop&&s.type!=="warm"); }
/* A RECORDED set list (workoutHistory detail[].sets, or a history entry's sx) with warm-ups
   removed. A warm-up is ramp work: it is never a series, never volume, never muscle dose.
   The live logging path already got this right (finishWorkout counts `workDone` only), but
   the two paths that RECOMPUTE a finished session from its stored detail each rolled their
   own filter — the history rebuild excluded warm-ups and the manual workout editor did not.
   So editing any past workout silently inflated its set count, tonnage and per-muscle dose.
   Both now go through this one helper. Unlike requiredSets() (which answers "what must be
   completed for this exercise to count as done", so it also drops optional drop sets), this
   answers "what did I actually work", and drop sets ARE real work. */
function workSetsOf(setsArr){ return (Array.isArray(setsArr)?setsArr:[]).filter(s=>String((s&&s.type)||"work")!=="warm"); }
function isExerciseDone(setsArr){ const req=requiredSets(setsArr); return req.length>0&&req.every(s=>s.done); }

/* What a given exercise PRIMARILY works, at muscle-HEAD / region granularity (not just
   "Chest"): e.g. "Biceps long head (stretch)", "Upper chest (clavicular)", "Side delts
   (width)", "Triceps lateral head". Driven by the movement pattern in the exercise name;
   `m` (the app's 8-category muscle) and `o.pm` (the library's baked primary muscle from
   the source dataset) are used to disambiguate a few body-part words and as the fallback.
   Careful with bare substrings — order matters: the specific pattern (leg/wrist curl,
   upright row, incline curl) must be tested before the generic one (curl, row) so it
   isn't swallowed. `o.pm`/`o.sm` are only present on library entries; program opts and
   dynamic swap objects fall through to name-rules + `m`, which is why every rule that
   consults `pm` also accepts `m`. */
function exFor(o,m){ const n=((o&&o.n)||"").toLowerCase(), pm=(o&&o.pm)||"", has=re=>re.test(n);
  /* core / abs */
  if(has(/oblique|russian twist|woodchop|wood chop|side bend|side crunch|\btwist|bicycle|windmill|saxon/)) return "Obliques";
  if(has(/plank|dead bug|hollow|bird dog|ab roller|ab wheel|rollout|stir the pot|pallof/)) return "Deep core (bracing)";
  if(has(/(hanging|lying|captain|vertical).*(leg|knee) raise|leg raise|knee raise|toes to bar|reverse crunch|hip raise/)&&m!=="Legs") return "Lower abs + hip flexors";
  if(has(/crunch|sit-?up|v-?up|jackknife|flutter|scissor kick/)) return "Abs (upper + rectus)";
  /* shoulders / delts */
  if(has(/rear[- ]delt|rear lateral|reverse (fly|flye|machine|pec)|bent[- ]over.*(lateral|fly|flye|raise)|face pull|high pull|incline.*rear/)) return "Rear delts";
  if(has(/front raise|front delt|frontal raise/)) return "Front delts";
  if(has(/lateral raise|side lateral|side raise|lateral.*(cable|machine|dumbbell|band)|lateral fly/)) return "Side delts (width)";
  if(has(/upright row/)) return "Side delts + traps";
  if(has(/(shoulder|overhead|military|arnold|z|push|landmine|viking) press|shoulder press|\bohp\b/)&&!has(/leg|chest|bench|incline|decline|floor/)) return "Front + side delts";
  /* Mid + lower traps — the scapular retractors/depressors that shrugs (upper traps) and
     rows (lats/mid-back) both miss. Must precede the generic /shrug/ and rotator-cuff
     rules below, which would otherwise swallow Kelso shrugs and Y/T-raises. */
  if(has(/kelso|middle back shrug|mid(dle)? trap|prone.*t-?raise|\bt-?raise/)) return "Mid traps (retraction)";
  if(has(/y-?raise|lower trap|trap-?3/)) return "Lower traps (Y-raise)";
  if(has(/shrug/)) return "Upper traps";
  if(has(/cuban|external rotation|internal rotation|\bcuff|scaption|w-?raise/)) return "Rotator cuff + rear delts";
  /* chest */
  if(has(/incline/)&&has(/press|fly|flye|chest|bench|dumbbell|barbell|smith|cable|push-?up/)&&(m==="Chest"||pm==="Chest"||has(/press|fly|flye|chest/))) return has(/fly|flye|cable|crossover/)?"Upper chest (inner squeeze)":"Upper chest (clavicular)";
  if(has(/decline/)&&has(/press|fly|flye|bench|push-?up|chest/)) return "Lower chest (sternal)";
  if(has(/\bdip/)&&!has(/squat|hip|jerk/)&&(m==="Chest"||has(/chest/))) return "Lower chest + triceps";
  if(has(/pec deck|butterfly|pec fly|chest fly|cable crossover|crossover|fly|flye/)&&(m==="Chest"||pm==="Chest")) return "Inner chest (squeeze)";
  if(has(/pullover/)&&(m==="Chest"||pm==="Chest")) return "Chest + lats (stretch)";
  if(has(/(bench|chest|floor) press|push-?up|svend/)&&(m==="Chest"||pm==="Chest")) return "Mid + overall chest";
  /* back */
  if(has(/straight-?arm|lat prayer|pullover/)&&(m==="Back"||pm==="Lats"||pm==="Mid-back")) return "Lats (stretch isolation)";
  /* The separator has to allow a SPACE, not just an optional hyphen: the library and the
     programs both ship "Weighted Pull Ups" and "Chin Ups" spelled as two words, and those
     fell through to a bare "Back" while "Pull-ups" classified correctly. That silently cost
     the vertical-pull credit in smartCoverageGaps(), so a program leading with weighted
     pull-ups was told it had no width work. Same bare-substring discipline as the rest of
     this classifier — the separator is explicit rather than assumed. */
  if(has(/pulldown|pull[-\s]?down|pull[-\s]?ups?|chin[-\s]?ups?/)) return "Lats (width)";
  if(has(/good morning|hyperextension|back extension|superman|jefferson|erector/)) return "Lower back (erectors)";
  if(has(/\brows?\b|t-?bar|seal row|pendlay|meadows|gorilla/)&&!has(/upright/)) return "Mid-back + lats (thickness)";
  /* biceps / forearms */
  if(has(/wrist curl|finger curl|reverse.*curl|zottman|wrist roller|forearm/)) return "Forearms";
  if(has(/incline.*curl/)) return "Biceps long head (stretch)";
  if(has(/preacher|spider|concentration/)) return "Biceps short head (peak)";
  if(has(/hammer|cross[- ]body|neutral.*curl|rope curl/)&&has(/curl/)) return "Brachialis + biceps";
  if(has(/drag curl/)) return "Biceps (both heads)";
  if(has(/curl/)&&(m==="Biceps"||pm==="Biceps")&&!has(/leg|wrist|finger|calf/)) return "Biceps (both heads)";
  /* triceps */
  if(has(/overhead.*(tricep|extension)|french press|(tricep|triceps).*overhead|skull.*behind|behind.*(neck|head)/)) return "Triceps long head (stretch)";
  if(has(/skull ?crush|lying.*(tricep|extension)|nose breaker|jm press/)) return "Triceps long + lateral head";
  /* Underhand/reverse-grip extension work biases the medial head (the third head, which
     every other pushdown variation trains only as a bystander). Must precede the generic
     pushdown rule, which would otherwise label it lateral. Reverse CURLS are caught by
     the forearm rule further up, so this cannot swallow them. */
  if(has(/(reverse|underhand|supinated)[- ]?(grip)?.*(pushdown|press-?down|pressdown|extension)/)&&(m==="Triceps"||pm==="Triceps")) return "Triceps medial head";
  if(has(/pushdown|press-?down|pressdown|kickback/)&&(m==="Triceps"||pm==="Triceps")) return "Triceps lateral head";
  if(has(/close-?grip|diamond|\bdip/)&&(m==="Triceps"||pm==="Triceps")) return "All three triceps heads";
  if(has(/tricep|extension/)&&(m==="Triceps"||pm==="Triceps")) return "Triceps";
  /* legs */
  if(has(/calf|heel raise|toe press/)) return "Calves";
  if(has(/adduct/)) return "Adductors (inner thigh)";
  if(has(/abduct/)) return "Abductors (outer thigh)";
  if(has(/leg curl|hamstring curl|lying.*curl|seated.*curl|nordic/)) return "Hamstrings";
  if(has(/romanian|stiff-?leg|\brdl\b|straight-?leg deadlift/)) return "Hamstrings + glutes (stretch)";
  if(has(/hip thrust|glute bridge|glute|kickback|frog|pull ?through|hip extension/)&&(m==="Legs"||pm==="Glutes")) return "Glutes";
  if(has(/leg extension|knee extension|sissy/)) return "Quads (isolation)";
  if(has(/lunge|split squat|bulgarian|step-?up|pistol/)) return "Quads + glutes";
  if(has(/squat|leg press|hack|pendulum|belt squat/)) return "Quads (+ glutes)";
  if(has(/deadlift|power clean|snatch|kettlebell swing|thruster/)) return "Posterior chain (hams, glutes, back)";
  if(has(/leg raise/)&&m==="Legs") return "Quads / hip flexors";
  /* fallback: baked primary muscle, then app category */
  if(pm) return pm;
  const M={Chest:"Chest",Back:"Back",Shoulders:"Shoulders",Biceps:"Biceps",Triceps:"Triceps",Legs:"Legs",Core:"Abs","Rear delts":"Rear delts",Traps:"Traps",Forearms:"Forearms"};
  return M[m]||m||""; }
/* Which pick-list muscle a LIBRARY entry belongs to, for the muscle chips in the swap
   and add-exercise dialogs. Finer than x.m for the groups people actually shop by:
   Traps and Forearms get their own chip (they're buried inside Back/Forearms-as-m
   otherwise), and rear-delt movements split out of Shoulders via exFor's name rules. */
function libMuscleOf(x){
  if(!x)return "";
  if(x.cat==="Traps")return "Traps";
  if(x.cat==="Forearms")return "Forearms";
  const f=exFor(x,x.m);
  if(f==="Rear delts"||f==="Rotator cuff + rear delts")return "Rear delts";
  return x.m||"";
}
/* Region (muscle-head) chip labels for a list of library entries: the distinct exFor
   classifications, most-common first. Labels with a single match are dropped — a chip
   that filters to one exercise is noise. Used for the second-level filter ("Biceps →
   long head") in the swap and add-exercise dialogs. */
function regionChips(list){
  const cnt={};
  list.forEach(x=>{ const r=exFor(x,x.m); if(r)cnt[r]=(cnt[r]||0)+1; });
  return Object.keys(cnt).filter(r=>cnt[r]>=2).sort((a,b)=>cnt[b]-cnt[a]).slice(0,10);
}

/* Secondary muscles worked, for the "Also works" line in the exercise detail view.
   Reads the library's baked `sm`; for a program opt / swap object (no `sm`), looks the
   exercise up in LIB by name. Returns "" when nothing is known. */
function exAlso(o){ if(!o)return ""; if(o.sm)return o.sm;
  try{ const hit=(typeof LIB!=="undefined"&&LIB)?LIB.find(e=>e.n===o.n):null; return (hit&&hit.sm)||""; }catch(e){ return ""; } }

/* ---------- timed exercises (planks / holds / carries) ----------
   A timed exercise logs SECONDS in the reps column instead of rep counts. Detected from
   the target string ("3 x 45s") or the movement name. Name test deliberately excludes
   olympic-lift "hang" variants (Hang Clean/Snatch are rep exercises, not holds). */
function isTimedTarget(r){ return /(\d+)\s*s(ec)?\b/i.test(String(r||"")); }
function isTimedExercise(o){ if(!o)return false;
  if(isTimedTarget(o.r))return true;
  const n=(o.n||"").toLowerCase();
  if(/clean|snatch/.test(n))return false;
  return /plank|wall sit|carr(y|ies)|farmer|\bhold\b|\bhang\b/.test(n); }

/* ---------- rep-range parsing (e.g. "3 x 8-12") ---------- */
function targetSets(r){ const m=r.match(/^(\d+)/); return m?+m[1]:3; }
function repHi(r){ const m=r.match(/(\d+)\s*-\s*(\d+)/); if(m)return +m[2]; const s=r.match(/x\s*(\d+)/); return s?+s[1]:12; }
function midReps(r){ const m=r.match(/(\d+)\s*-\s*(\d+)/); if(m)return Math.round((+m[1]+ +m[2])/2); const s=r.match(/x\s*(\d+)/); return s?+s[1]:8; }
function repLo(r){
  r=String(r||"");
  let m=r.match(/x\s*(\d+)\s*-\s*(\d+)/i); if(m)return +m[1];
  m=r.match(/x\s*(\d+)/i); if(m)return +m[1];
  m=r.match(/(\d+)\s*-\s*(\d+)/); if(m)return +m[1];
  return null;
}

/* ---------- dates ---------- */
function localDateStr(d){ d=d||new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function localMonthStr(d){ return localDateStr(d||new Date()).slice(0,7); }
function todayStr(){ return localDateStr(); }
function fmt(s){ const m=Math.floor(s/60); return m+":"+String(s%60).padStart(2,"0"); }

/* ---------- strings / sanitizing ---------- */
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function escAttr(s){ return esc(String(s||"")).replace(/"/g,"&quot;"); }
function csvCell(v){ v=(v==null?"":String(v)); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v; }
function plainObj(o){ return !!o&&typeof o==="object"&&!Array.isArray(o); }
function safeText(v,max){ return String(v==null?"":v).replace(/[<>]/g,"").replace(/[\u0000-\u001f]/g," ").trim().slice(0,max||160); }
function safeId(v,fb){ return (String(v||"").replace(/[^a-z0-9_-]/gi,"").slice(0,36)||fb||("p"+Date.now().toString(36))); }
function safeImg(v){ v=safeText(v,240); return (/^img\//.test(v))?v:""; }
function byteSize(s){ try{return new Blob([s||""]).size;}catch(e){return String(s||"").length*2;} }
function avg(arr){ return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null; }

/* ---------- body composition (matches the standard formulas MyFitCoach uses) ----------
   All pure: takes profile-ish fields + a bodyweight (kg) + optional body-fat %. Returns
   nulls for anything that can't be computed yet, so callers just check for a value.
   - BMR: Mifflin-St Jeor (male +5, female -161)
   - maintenance = BMR × activity factor (default 1.55 "moderate")
   - fat mass / fat-free mass / FFMI only when a body-fat % is provided; FFMI is the
     height-normalized variant (+6.1×(1.8-h)) so it's comparable across heights. */
const ACTIVITY_FACTORS=[["1.2","Sedentary — desk job, little exercise"],["1.375","Light — 1-3 workouts/week"],["1.55","Moderate — 3-5 workouts/week"],["1.725","Active — 6-7 workouts/week"],["1.9","Athlete — hard daily training"]];

/* ---------- the tracked muscle list ----------
 * ONE canonical list, defined in the zero-dependency layer so every consumer can reach it
 * regardless of load order. Previously three lists disagreed: an 8-item MUS8 (priorities,
 * muscle balance, custom-exercise form), a 9-item SMART_MUSCLES (recovery engine, body map,
 * scorecards), and a 10-item literal inside the add-exercise picker. Traps was consequently
 * modelled by the trainer but unpickable as a priority and invisible on the Progress balance
 * card. Adding a muscle now means adding it here — and to PLAN_TARGETS in view-stats.js,
 * which the plan-audit gate below cross-checks. */
const MUSCLES=["Chest","Back","Shoulders","Biceps","Triceps","Legs","Rear delts","Traps","Core"];
/* Per-session set cap before per-set growth tapers (Remmert meta, via RP + Ethier: ~11 sets
   for ONE muscle in one session). "Legs" is not one muscle in this model — it buckets quads,
   hamstrings, glutes and calves — so applying 11 to it is a bucket artifact, not a finding:
   an ordinary leg day of 6 quad + 6 hamstring + 4 calf sets is three muscles all inside the
   guideline, yet tripped the warning every single session. A warning that fires on every
   correct leg day only teaches people to ignore warnings. */
const SESSION_SET_CAP={Legs:20};
function sessionSetCap(m){ return SESSION_SET_CAP[m]||11; }
/* Selectable when adding/creating an exercise: the tracked list plus the two regions that
 * are real training targets but are folded into a parent for volume accounting. */
const MUSCLE_PICKER=MUSCLES.concat(["Forearms"]);
function bodyComp(p,weightKg,bfPct){
  p=p||{}; const kg=+weightKg, h=+p.height, age=+p.age, out={};
  out.bmi=(kg>0&&h>0)?Math.round(kg/((h/100)*(h/100))*10)/10:null;
  if(kg>0&&h>0&&age>0){ const s=(p.sex==="F")?-161:5; out.bmr=Math.round(10*kg+6.25*h-5*age+s);
    const af=+(p.activity||1.55)||1.55; out.maintenance=Math.round(out.bmr*af); out.activityFactor=af;
    out.activityBurn=out.maintenance-out.bmr; }
  else { out.bmr=out.maintenance=out.activityFactor=out.activityBurn=null; }
  const bf=+bfPct;
  if(kg>0&&bf>0&&bf<70){ out.bf=Math.round(bf*10)/10; out.fatMass=Math.round(kg*bf/100*10)/10; out.ffm=Math.round((kg-kg*bf/100)*10)/10;
    out.ffmi=(h>0)?Math.round((out.ffm/((h/100)*(h/100))+6.1*(1.8-h/100))*10)/10:null; }
  else { out.bf=out.fatMass=out.ffm=out.ffmi=null; }
  return out;
}

/* ---------- toast / haptics ---------- */
function toast(m){ const t=document.getElementById("toast"); t.textContent=m; t.classList.add("on"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("on"),1500); }
/* In-app text prompt (replaces window.prompt, which some OEM WebViews render badly or
   swallow entirely). Stacks fine on top of an open <dialog>. Falls back to prompt()
   when the #inDlg element is missing (headless tests). */
function askText(title,label,value,cb){
  const d=document.getElementById("inDlg");
  if(!d||!d.showModal){ const v=prompt(title,value||""); if(v!=null)cb(v); return; }
  document.getElementById("inTitle").textContent=title;
  document.getElementById("inLabel").textContent=label||"";
  const inp=document.getElementById("inVal"); inp.value=value||"";
  document.getElementById("inOk").onclick=()=>{ d.close(); cb(inp.value); };
  d.showModal(); setTimeout(()=>{ try{inp.focus();inp.select();}catch(e){} },60);
}
function buzz(m){ if(navigator.vibrate) try{navigator.vibrate(m);}catch(e){} }

/* ---------- icon system (Tabler outline, MIT — bundled inline, offline) ---------- */
const IC={
"adjustments-horizontal":"<path d=\"M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M4 6l8 0\" /> <path d=\"M16 6l4 0\" /> <path d=\"M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M4 12l2 0\" /> <path d=\"M10 12l10 0\" /> <path d=\"M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M4 18l11 0\" /> <path d=\"M19 18l1 0\" />",
"arrows-exchange":"<path d=\"M7 10h14l-4 -4\" /> <path d=\"M17 14h-14l4 4\" />",
"barbell":"<path d=\"M2 12h1\" /> <path d=\"M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2\" /> <path d=\"M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1z\" /> <path d=\"M9 12h6\" /> <path d=\"M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1z\" /> <path d=\"M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2\" /> <path d=\"M22 12h-1\" />",
"bolt":"<path d=\"M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11\" />",
"books":"<path d=\"M5 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z\" /> <path d=\"M9 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z\" /> <path d=\"M5 8h4\" /> <path d=\"M9 16h4\" /> <path d=\"M13.803 4.56l2.184 -.53c.562 -.135 1.133 .19 1.282 .732l3.695 13.418a1.02 1.02 0 0 1 -.634 1.219l-.133 .041l-2.184 .53c-.562 .135 -1.133 -.19 -1.282 -.732l-3.695 -13.418a1.02 1.02 0 0 1 .634 -1.219l.133 -.041z\" /> <path d=\"M14 9l4 -1\" /> <path d=\"M16 16l3.923 -.98\" />",
"calendar":"<path d=\"M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z\" /> <path d=\"M16 3v4\" /> <path d=\"M8 3v4\" /> <path d=\"M4 11h16\" /> <path d=\"M11 15h1\" /> <path d=\"M12 15v3\" />",
"chart-line":"<path d=\"M4 19l16 0\" /> <path d=\"M4 15l4 -6l4 2l4 -5l4 4\" />",
"clipboard-check":"<path d=\"M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2\" /> <path d=\"M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z\" /> <path d=\"M9 14l2 2l4 -4\" />",
"clock":"<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M12 7v5l3 3\" />",
"cloud-download":"<path d=\"M19 18a3.5 3.5 0 0 0 0 -7h-1a5 4.5 0 0 0 -11 -2a4.6 4.4 0 0 0 -2.1 8.4\" /> <path d=\"M12 13l0 9\" /> <path d=\"M9 19l3 3l3 -3\" />",
"file-export":"<path d=\"M14 3v4a1 1 0 0 0 1 1h4\" /> <path d=\"M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3\" />",
"flag-3":"<path d=\"M5 14h14l-4.5 -4.5l4.5 -4.5h-14v16\" />",
"heart-rate-monitor":"<path d=\"M3 4m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z\" /> <path d=\"M7 20h10\" /> <path d=\"M9 16v4\" /> <path d=\"M15 16v4\" /> <path d=\"M7 10h2l2 3l2 -6l1 3h3\" />",
"heartbeat":"<path d=\"M19.5 13.572l-7.5 7.428l-2.896 -2.868m-6.117 -8.104a5 5 0 0 1 9.013 -3.022a5 5 0 1 1 7.5 6.572\" /> <path d=\"M3 13h2l2 3l2 -6l1 3h3\" />",
"home":"<path d=\"M5 12l-2 0l9 -9l9 9l-2 0\" /> <path d=\"M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7\" /> <path d=\"M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6\" />",
"layout-grid":"<path d=\"M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />",
"menu-2":"<path d=\"M4 6l16 0\" /> <path d=\"M4 12l16 0\" /> <path d=\"M4 18l16 0\" />",
"player-play":"<path d=\"M7 4v16l13 -8z\" />",
"plus":"<path d=\"M12 5l0 14\" /> <path d=\"M5 12l14 0\" />",
"refresh":"<path d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\" /> <path d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\" />",
"ruler-2":"<path d=\"M17 3l4 4l-14 14l-4 -4z\" /> <path d=\"M16 7l-1.5 -1.5\" /> <path d=\"M13 10l-1.5 -1.5\" /> <path d=\"M10 13l-1.5 -1.5\" /> <path d=\"M7 16l-1.5 -1.5\" />",
"scale":"<path d=\"M7 20l10 0\" /> <path d=\"M6 6l6 -1l6 1\" /> <path d=\"M12 3l0 17\" /> <path d=\"M9 12l-3 -6l-3 6a3 3 0 0 0 6 0\" /> <path d=\"M21 12l-3 -6l-3 6a3 3 0 0 0 6 0\" />",
"search":"<path d=\"M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0\" /> <path d=\"M21 21l-6 -6\" />",
"settings":"<path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z\" /> <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" />",
"share":"<path d=\"M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M8.7 10.7l6.6 -3.4\" /> <path d=\"M8.7 13.3l6.6 3.4\" />",
"sparkles":"<path d=\"M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z\" />",
"target":"<path d=\"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0\" /> <path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" />",
"timeline":"<path d=\"M4 16l6 -7l5 5l5 -6\" /> <path d=\"M15 14m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M10 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M4 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M20 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />",
"trash":"<path d=\"M4 7l16 0\" /> <path d=\"M10 11l0 6\" /> <path d=\"M14 11l0 6\" /> <path d=\"M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12\" /> <path d=\"M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3\" />",
"user":"<path d=\"M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0\" /> <path d=\"M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2\" />"
};
function icon(n,s){ const p=IC[n]; if(!p)return ""; s=s||22; return "<svg viewBox='0 0 24 24' width='"+s+"' height='"+s+"' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;vertical-align:-0.18em'>"+p+"</svg>"; }

/* ---------- front/back muscle silhouette (which muscles a day/program trains) ----------
   Simplified region diagram (not full anatomy) in the style of the body-heatmap seen in
   other trackers: a shared limb skeleton reused between the front and back figure, with
   each region shaded on only the view where it's visible (delts on front, rear delts +
   traps + lats on back, etc). Forearms and legs light up on both views since those
   muscles are trained/visible from either side. Takes a plain array/Set of muscle-name
   strings (PROGRAM day.mus / program.days[].mus already have this shape) — no DOM or
   state dependency, so it's safe to call from any render function. */
function bodyHeatmapSVG(muscles,colorFn){
  const set=new Set(Array.isArray(muscles)?muscles:[...(muscles||[])]);
  // colorFn(muscleName) -> CSS color to paint that region, or null for the base tint.
  // Default (no colorFn) is the binary "which muscles are trained" fill in the accent.
  const fn=colorFn||(name=>set.has(name)?"var(--accent)":null);
  const p=name=>{ const c=fn(name); return c?" style='fill:"+c+";stroke:"+c+"'":""; };
  const limbs=(muscle)=>
    "<rect x='12' y='46' width='12' height='32' rx='6' class='reg'"+p(muscle)+"/><rect x='66' y='46' width='12' height='32' rx='6' class='reg'"+p(muscle)+"/>"+ // upper arms
    "<rect x='10' y='80' width='11' height='30' rx='5' class='reg'"+p("Forearms")+"/><rect x='69' y='80' width='11' height='30' rx='5' class='reg'"+p("Forearms")+"/>"+ // forearms
    "<rect x='29' y='84' width='32' height='14' rx='7' class='base'/>"+ // waist/hip base
    "<rect x='30' y='100' width='14' height='40' rx='7' class='reg'"+p("Legs")+"/><rect x='46' y='100' width='14' height='40' rx='7' class='reg'"+p("Legs")+"/>"+ // thighs
    "<rect x='31' y='142' width='12' height='34' rx='6' class='reg'"+p("Legs")+"/><rect x='47' y='142' width='12' height='34' rx='6' class='reg'"+p("Legs")+"/>"; // calves
  const head="<ellipse cx='45' cy='14' rx='10' ry='12' class='base'/><rect x='40' y='24' width='10' height='7' rx='3' class='base'/>";
  const front="<svg viewBox='0 0 90 190'>"+head+
    "<circle cx='24' cy='40' r='8' class='reg'"+p("Shoulders")+"/><circle cx='66' cy='40' r='8' class='reg'"+p("Shoulders")+"/>"+
    "<rect x='31' y='35' width='28' height='24' rx='6' class='reg'"+p("Chest")+"/>"+
    "<rect x='34' y='60' width='22' height='26' rx='6' class='reg'"+p("Core")+"/>"+
    limbs("Biceps")+"</svg>";
  const back="<svg viewBox='0 0 90 190'>"+head+
    "<polygon points='45,23 27,44 63,44' class='reg'"+p("Traps")+"/>"+
    "<circle cx='24' cy='40' r='8' class='reg'"+p("Rear delts")+"/><circle cx='66' cy='40' r='8' class='reg'"+p("Rear delts")+"/>"+
    "<rect x='30' y='42' width='30' height='42' rx='8' class='reg'"+p("Back")+"/>"+
    limbs("Triceps")+"</svg>";
  return "<div class='bodyhm'><div class='bhFig'><div class='bhLbl'>Front</div>"+front+"</div><div class='bhFig'><div class='bhLbl'>Back</div>"+back+"</div></div>";
}
