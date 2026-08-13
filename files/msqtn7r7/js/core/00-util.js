/* Zero-dependency helpers: no reference to `state`, `PROGRAMS`, or `window.GymNative`.
 * Loaded first — every other file can assume everything here already exists.
 * `toast`/`buzz` are the one deliberate exception to "zero DOM": every other file needs
 * a way to show a toast or vibrate from its very first line, and neither touches state
 * or programs, so they live here rather than forcing a dependency on a later file. */

/* ---------- swallowed-error breadcrumb ---------- */
/* Most `try{...}catch(e){}` in this app are deliberate: a failed localStorage write, an
 * absent native bridge method or a missing DOM node must never take the workout down with
 * it. But swallowing SILENTLY is what made two real bugs expensive to find — a stale OTA
 * bundle and a migration that never ran both failed invisibly and looked like "nothing
 * happened". qerr keeps the recovery behaviour and leaves a breadcrumb in logcat
 * (`adb logcat -s GymTrackerJS`), so the next silent failure is one command away from
 * being visible. Never throws, whatever it is handed. */
function qerr(e,where){ try{ console.warn("[gym] swallowed"+(where?" @"+where:"")+":", (e&&e.stack)||e); }catch(_){} }

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
  /* "reverse cable crossover" has to be named explicitly. It only classified correctly while
     its slot happened to be tagged Rear delts — by muscle-tag FALLBACK, not by any rule — so
     the same exercise dropped into a Chest slot hit the generic crossover rule below and read
     "Inner chest (squeeze)". Name it here, above the chest rules, and the label is right
     wherever the swap dialog puts it. */
  if(has(/rear[- ]delt|rear lateral|reverse (fly|flye|machine|pec|cable )|reverse.*crossover|bent[- ]over.*(lateral|fly|flye|raise)|face pull|high pull|incline.*rear/)) return "Rear delts";
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
  /* A high-incline (~60°) press is a front-delt movement, not an upper-chest one, but its
     NAME reads identically to an incline bench press — the only signal that separates them
     is the muscle tag. Must precede the chest incline rule below, which matches on
     /incline/ + /press/ alone and would otherwise claim it as upper chest. */
  if(has(/incline/)&&has(/press/)&&(m==="Shoulders"||pm==="Shoulders")) return "Front delts";
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
  /* Cable long-head work: the shoulder, not the elbow, is what loads the long head here —
     the arm is either behind the torso (bayesian / behind-the-body) or out to the side at
     shoulder height (high cable curl). No generic /curl/ rule can infer that from the name,
     so these fell through to "Biceps (both heads)" and the long head read as uncovered. */
  if(has(/curl/)&&has(/bayesian|behind[- ](the[- ])?body|high cable/)) return "Biceps long head (stretch)";
  /* GRIP BEFORE BENCH. A neutral/hammer grip decides which elbow flexor does the work, so it
     has to be tested before the preacher rule — otherwise "Preacher Hammer Dumbbell Curl"
     matches "preacher" first and is labelled short head, which is what the bench does, not
     what the grip does. That mislabel hid a real hole: the program's only brachialis movement
     was reporting as a second short-head exercise, so the arms day read as short+short and
     the brachialis was uncovered all week without any check noticing. */
  if(has(/hammer|cross[- ]body|neutral.*curl|rope curl/)&&has(/curl/)) return "Brachialis + biceps";
  if(has(/preacher|spider|concentration/)) return "Biceps short head (peak)";
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
  /* Same reasoning for the cross-body cable extension: pulling across the torso biases the
     medial head. Sits with the reverse-grip rule above the generic pushdown rule, which
     would otherwise call it lateral. The /curl/ guard on the brachialis rule further up
     already keeps that one from swallowing "Cross-Body Cable Tricep Extension". */
  if(has(/cross[- ]body/)&&has(/tricep|extension/)&&(m==="Triceps"||pm==="Triceps")) return "Triceps medial head";
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
/* A <dialog> opened with showModal() is painted in the browser's TOP LAYER, which sits above
   every normal element no matter how high its z-index. So any toast fired while a dialog was
   open — "Already up to date", "Update failed", every result of the App updates screen — was
   rendered behind it and only became visible after closing the dialog. Users reasonably read
   that as the button doing nothing. Fix: re-parent the toast into the open dialog so it shares
   the same layer, and move it back to <body> once nothing is modal. z-index alone cannot
   escape the top layer, so this has to be done by re-parenting. */
function toast(m){ const t=document.getElementById("toast"); if(!t)return;
  const open=document.querySelectorAll("dialog[open]"), host=open.length?open[open.length-1]:document.body;
  if(t.parentElement!==host){ try{ host.appendChild(t); }catch(e){} }
  t.textContent=m; t.classList.add("on"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("on"),1500); }
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
/* Settings > Exercise variability asked for this one and it did not exist, so row() fell
   through to its "render the name as text" fallback and the literal word `shuffle` was
   printed in the settings list where the icon belongs. */
"shuffle":"<path d=\"M18 4l3 3l-3 3\" /> <path d=\"M18 20l3 -3l-3 -3\" /> <path d=\"M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5\" /> <path d=\"M3 17h3a5 5 0 0 0 5 -5a5 5 0 0 1 5 -5h5\" />",
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
/* The exercise library ships two frames per movement: "X.webp" and its "X_b.webp" partner,
   which the demo alternates between. Derive the partner from whatever extension the image
   actually carries — hardcoding one is how this broke when the library was re-encoded from
   JPEG to WebP: the match failed, the alternate frame resolved to the SAME file, and every
   demo played as a still with no error raised anywhere. */
function demoAltSrc(src){ return String(src||"").replace(/(\.[a-z0-9]+)$/i,"_b$1"); }
function icon(n,s){ const p=IC[n]; if(!p)return ""; s=s||22; return "<svg viewBox='0 0 24 24' width='"+s+"' height='"+s+"' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;vertical-align:-0.18em'>"+p+"</svg>"; }

/* ---------- front/back muscle silhouette (which muscles a day/program trains) ----------
   An anatomical figure, not a stack of capsules: a base silhouette with individually
   shadeable muscle regions laid over it. Every shape is authored on the LEFT half of a
   100x210 canvas and mirrored with a transform, so each muscle is defined once and the
   figure cannot drift out of symmetry.

   Regions are drawn on the view where the muscle is actually visible — pecs and abs on the
   front, lats and traps on the back, delts on both (front vs rear head). Forearms and legs
   appear on both because they are trained and seen from either side.

   Takes a plain array/Set of muscle-name strings (PROGRAM day.mus and program.days[].mus
   already have that shape). No DOM or state dependency, so any render function can call it.
   colorFn(muscleName) returns a CSS colour for that region, or null for the base tint;
   with no colorFn it falls back to a binary "is this muscle trained" accent fill. */
const BODY_HALF={
  /* upper arm: biceps on the front figure, triceps on the back */
  arm:"M31,45 C25,47 22,55 21,64 C20,71 21,77 24,78 C28,77 30,70 31,62 C32,55 33,49 31,45 Z",
  forearm:"M23,79 C19,84 17,93 17,101 C17,107 19,110 22,109 C25,106 26,97 26,89 C26,84 25,80 23,79 Z",
  delt:"M37,31 C29,32 24,37 23,44 C23,48 25,51 28,50 C32,46 35,39 38,34 Z",
  pec:"M41,36 C45,34 48,36 49,40 L49,53 C45,56 41,54 39,50 C37,45 38,39 41,36 Z",
  lat:"M35,42 C31,50 32,62 36,72 C39,78 44,80 48,79 L48,46 C44,43 39,41 35,42 Z",
  trapBack:"M42,27 C46,25 49,25 50,25 L50,58 C46,56 42,50 40,42 C39,35 40,30 42,27 Z",
  abs:"M42,55 C46,53 50,53 50,53 L50,80 C46,81 43,79 42,75 Z",
  glute:"M38,88 C44,85 50,85 50,86 L50,103 C44,105 39,102 37,97 C36,93 36,90 38,88 Z",
  thigh:"M39,96 C34,106 34,122 36,136 C37,143 41,146 44,144 C47,134 48,116 47,104 C46,98 43,95 39,96 Z",
  calf:"M38,150 C34,159 34,171 36,181 C38,188 42,189 44,186 C46,177 46,163 44,154 C43,150 40,148 38,150 Z"
};
const BODY_BASE=
  "<ellipse cx='50' cy='13' rx='8.4' ry='10.4' class='base'/>"+
  "<path class='base' d='M45,21 L45,28 C47,30 53,30 55,28 L55,21 Z'/>"+
  /* trunk: shoulders -> lat flare -> waist -> hips, as one closed silhouette */
  "<path class='base' d='M50,24 C59,24 65,27 68,33 C72,39 72,49 70,57 C68,67 64,73 63,81"+
  " C62,88 63,92 63,97 L37,97 C37,92 38,88 37,81 C36,73 32,67 30,57 C28,49 28,39 32,33"+
  " C35,27 41,24 50,24 Z'/>"+
  /* arms and legs as base limbs, shaded regions sit on top of these */
  "<path class='base' d='M32,44 C24,47 20,56 19,66 C18,76 19,84 17,93 C16,101 16,108 18,111"+
  " C22,113 25,110 25,105 C25,96 27,88 29,80 C31,70 34,58 35,48 Z'/>"+
  "<path class='base' d='M68,44 C76,47 80,56 81,66 C82,76 81,84 83,93 C84,101 84,108 82,111"+
  " C78,113 75,110 75,105 C75,96 73,88 71,80 C69,70 66,58 65,48 Z'/>"+
  "<path class='base' d='M37,95 C33,108 33,126 35,140 C36,150 35,164 34,176 C33,186 34,193 37,194"+
  " C42,194 44,190 44,183 C44,170 46,156 47,142 C48,128 49,110 48,96 Z'/>"+
  "<path class='base' d='M63,95 C67,108 67,126 65,140 C64,150 65,164 66,176 C67,186 66,193 63,194"+
  " C58,194 56,190 56,183 C56,170 54,156 53,142 C52,128 51,110 52,96 Z'/>";
function bodyHeatmapSVG(muscles,colorFn){
  const set=new Set(Array.isArray(muscles)?muscles:[...(muscles||[])]);
  const fn=colorFn||(name=>set.has(name)?"var(--accent)":null);
  /* One region = the shape plus its mirror. Written once, so the two halves cannot diverge. */
  const reg=(shape,muscle)=>{
    const c=fn(muscle), st=c?" style='fill:"+c+";stroke:"+c+"'":"";
    const d=BODY_HALF[shape];
    return "<path class='reg' d='"+d+"'"+st+"/>"+
           "<g transform='translate(100,0) scale(-1,1)'><path class='reg' d='"+d+"'"+st+"/></g>";
  };
  const wrap=inner=>"<svg viewBox='0 0 100 205' preserveAspectRatio='xMidYMid meet'>"+BODY_BASE+inner+"</svg>";
  const front=wrap(
    reg("delt","Shoulders")+reg("pec","Chest")+reg("abs","Core")+
    reg("arm","Biceps")+reg("forearm","Forearms")+
    reg("thigh","Legs")+reg("calf","Legs"));
  const back=wrap(
    reg("trapBack","Traps")+reg("delt","Rear delts")+reg("lat","Back")+
    reg("arm","Triceps")+reg("forearm","Forearms")+
    reg("glute","Legs")+reg("thigh","Legs")+reg("calf","Legs"));
  return "<div class='bodyhm'><div class='bhFig'><div class='bhLbl'>Front</div>"+front+"</div>"+
         "<div class='bhFig'><div class='bhLbl'>Back</div>"+back+"</div></div>";
}

/* ---------- strength standards ----------
   The app answers "am I recovered" and "am I progressing" but never "am I actually strong".
   This fills that in from data already in state: per-lift e1RM in state.history, plus
   bodyweight and sex from the profile.

   Thresholds are the widely published bodyweight-multiple standards (the Beginner ->
   Elite ladder used by strength-standard calculators), stored as ratios rather than a
   weight table so they stay compact and readable. Only lifts with real, agreed standards
   are scored — a hack squat or an RDL has no meaningful 1RM standard, and inventing one
   would make the whole card untrustworthy.

   Bodyweight is corrected allometrically: strength scales roughly with mass^(2/3), so a
   110 kg lifter benching 1.5x bodyweight is not the same achievement as a 60 kg lifter
   doing it. Requirements are scaled by (reference / bodyweight)^(1/3), which is the
   standard adjustment and is exact at the reference weight. */
const STRENGTH_LEVELS=["Beginner","Novice","Intermediate","Advanced","Elite"];
const STRENGTH_STANDARDS={
  M:{ref:75,lifts:{
    "Bench Press":       [0.75,1.00,1.25,1.75,2.00],
    "Back Squat":        [0.75,1.25,1.50,2.25,2.75],
    "Deadlift":          [1.00,1.50,2.00,2.75,3.25],
    "Overhead Press":    [0.40,0.60,0.80,1.10,1.40],
    "Barbell Row":       [0.50,0.75,1.00,1.40,1.75]}},
  F:{ref:62,lifts:{
    "Bench Press":       [0.40,0.60,0.80,1.05,1.40],
    "Back Squat":        [0.60,0.90,1.25,1.75,2.25],
    "Deadlift":          [0.70,1.10,1.50,2.10,2.60],
    "Overhead Press":    [0.25,0.40,0.55,0.75,1.00],
    "Barbell Row":       [0.35,0.50,0.70,0.95,1.25]}}
};
/* Which standard, if any, a logged exercise name counts towards. Deliberately strict:
   machine and supported variants are excluded because their standards differ, and a
   generous match here would silently inflate the score. */
function strengthLiftFor(name){
  const n=String(name||"").toLowerCase();
  if(/hack|smith|machine|leg press|pendulum|belt squat/.test(n))return null;
  if(/romanian|rdl|stiff|deficit|sumo|trap bar|rack pull/.test(n))return null;
  if(/incline|decline|close-?grip|floor|dumbbell|db /.test(n))return null;
  if(/bench press/.test(n))return "Bench Press";
  if(/back squat|barbell squat|^squat|\bsquats?\b/.test(n))return "Back Squat";
  if(/deadlift/.test(n))return "Deadlift";
  if(/overhead press|military press|standing.*press|\bohp\b/.test(n))return "Overhead Press";
  if(/(barbell|pendlay|bent-?over).*row/.test(n))return "Barbell Row";
  return null;
}
/* 0-100 across the whole Beginner->Elite ladder, linear inside each band. Below the
   Beginner threshold scales from zero rather than clamping, so early progress still moves
   the number; above Elite it clamps at 100. */
function strengthScoreFor(lift,e1rm,bodyweight,sex){
  const tbl=STRENGTH_STANDARDS[String(sex||"M").toUpperCase()==="F"?"F":"M"];
  const bands=tbl.lifts[lift]; const bw=+bodyweight;
  if(!bands||!(e1rm>0)||!(bw>0))return null;
  const adj=Math.pow(tbl.ref/bw,1/3);
  const need=bands.map(r=>r*bw*adj);
  if(e1rm<need[0])return {score:Math.max(0,Math.round(e1rm/need[0]*20)),level:STRENGTH_LEVELS[0],next:need[0]};
  for(let i=0;i<need.length-1;i++){
    if(e1rm<need[i+1]){
      const within=(e1rm-need[i])/(need[i+1]-need[i]);
      return {score:Math.round((i+within)*25),level:STRENGTH_LEVELS[i],next:need[i+1]};
    }
  }
  return {score:100,level:"Elite",next:null};
}
