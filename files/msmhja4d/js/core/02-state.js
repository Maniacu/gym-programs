/* State shape, load/save, and session-draft handling. This is the one place that reads
 * or writes localStorage["gymTracker"] directly — every other file goes through the
 * `state` object and `save()`. */

/* ---------- shared mutable nav/session selection (not persisted directly) ---------- */
let curTab="plan", curDay=0, selWeekday=null, logCustom=null;

/* ---------- photo storage limits ---------- */
const PHOTO_MAX=12, PHOTO_MAX_DIM=900, PHOTO_QUALITY=.72, STATE_SOFT_LIMIT=4500000;
const STATE_SCHEMA_VERSION=2;
function trimPhotosForStorage(photos,aggressive){
  const arr=(Array.isArray(photos)?photos:[]).filter(p=>p&&typeof p.data==="string"&&/^data:image\//.test(p.data));
  if(!aggressive)return arr.slice(-PHOTO_MAX);
  return arr.filter(p=>byteSize(p.data)<650000).slice(-4);
}

/* ---------- stable exercise identity ----------
 * Names remain in the state as human-readable aliases, but they are no longer the
 * identity of an exercise. Library/custom ids survive spelling, punctuation and future
 * display-name changes. Unknown exercises from old backups receive a deterministic
 * legacy id instead of being discarded or accidentally merged with a different lift. */
function exerciseIdentityKey(raw){
  return String(raw||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
}
/* The library is ~900 rows and resolution used to run two linear scans over it — the
   second normalising both the id and the name of every row. This is the shared primitive
   behind history lookup, trends, ranking and learning, so one swap-dialog render paid it
   thousands of times. Index the library once (rebuilt only if its length changes) so
   lookups are O(1). First-match-wins order is preserved: rows are registered in array
   order and never overwritten, which is what `find` returned before. */
let _libIdentityIndex=null,_libIdentityCount=-1;
function libIdentityIndex(){
  const lib=(window.LIB||[]);
  if(_libIdentityIndex&&_libIdentityCount===lib.length)return _libIdentityIndex;
  const byId={},byKey={};
  lib.forEach(x=>{
    if(!x)return;
    if(x.id!=null){
      const raw=String(x.id);
      if(byId[raw]===undefined)byId[raw]=x;
      const ik=exerciseIdentityKey(x.id);
      if(ik&&byKey[ik]===undefined)byKey[ik]=x;
    }
    if(x.n){
      const nk=exerciseIdentityKey(x.n);
      if(nk&&byKey[nk]===undefined)byKey[nk]=x;
    }
  });
  _libIdentityIndex={byId:byId,byKey:byKey};_libIdentityCount=lib.length;
  return _libIdentityIndex;
}
function exerciseIdentityFor(name,suppliedId,targetState){
  const requestedId=String(suppliedId||""),requestedName=String(name||"").trim();
  const key=exerciseIdentityKey(requestedId||requestedName),index=libIdentityIndex();
  let hit=requestedId?index.byId[requestedId]:undefined;
  if(!hit&&key)hit=index.byKey[key];
  const custom=(targetState&&Array.isArray(targetState.customExercises)?targetState.customExercises:[]);
  if(!hit&&custom.length){
    hit=custom.find(x=>String(x.id)===requestedId)||
      custom.find(x=>exerciseIdentityKey(x.id)===key||exerciseIdentityKey(x.n)===key);
  }
  let exerciseId=hit&&hit.id?String(hit.id):requestedId;
  if(!exerciseId){
    const legacy=exerciseIdentityKey(requestedName).replace(/\s+/g,"_");
    exerciseId="legacy_"+(legacy||"exercise");
  }
  const libId=hit&&hit.id?String(hit.id):null;
  const displayName=(hit&&hit.n)||requestedName||exerciseId;
  const target=targetState||state;
  if(target){
    target.exerciseCatalog=plainObj(target.exerciseCatalog)?target.exerciseCatalog:{};
    const prior=plainObj(target.exerciseCatalog[exerciseId])?target.exerciseCatalog[exerciseId]:{};
    const aliases=Array.isArray(prior.aliases)?prior.aliases.slice():[];
    [prior.name,displayName,requestedName].filter(Boolean).forEach(x=>{
      if(!aliases.some(a=>exerciseIdentityKey(a)===exerciseIdentityKey(x)))aliases.push(x);
    });
    target.exerciseCatalog[exerciseId]={
      exerciseId:exerciseId,libId:libId||prior.libId||null,
      name:(hit&&hit.n)||prior.name||displayName,aliases:aliases.slice(0,20)
    };
  }
  return {exerciseId:exerciseId,libId:libId,name:displayName,alias:requestedName||displayName};
}
function exerciseIdFor(name,suppliedId){ return exerciseIdentityFor(name,suppliedId,state).exerciseId; }
function libIdFor(name,suppliedId){ return exerciseIdentityFor(name,suppliedId,state).libId; }
function stampExerciseIdentity(record,name,suppliedId,targetState){
  if(!plainObj(record))return record;
  const ref=exerciseIdentityFor(name||record.name||record.n||record.exercise||record.exerciseName,
    suppliedId||record.exerciseId||record.libId,targetState||state);
  record.exerciseId=ref.exerciseId;
  record.libId=ref.libId;
  if(!record.exerciseName)record.exerciseName=ref.name;
  return record;
}

/* Upgrade schema 1 without changing or dropping any user-facing collection. The
 * compatibility name-keyed maps remain readable, while exerciseData is the canonical,
 * id-keyed home for per-exercise settings from now on. */
function migrateFromV1Schema(old){
  const next=plainObj(old)?JSON.parse(JSON.stringify(old)):{};
  next.exerciseCatalog=plainObj(next.exerciseCatalog)?next.exerciseCatalog:{};
  next.exerciseData=plainObj(next.exerciseData)?next.exerciseData:{};
  const refFor=(name,id)=>exerciseIdentityFor(name,id,next);
  const dataFor=(name,id)=>{
    const ref=refFor(name,id),prior=plainObj(next.exerciseData[ref.exerciseId])?next.exerciseData[ref.exerciseId]:{};
    const row=Object.assign({},prior,{exerciseId:ref.exerciseId,libId:ref.libId||prior.libId||null,name:ref.name});
    next.exerciseData[ref.exerciseId]=row;return row;
  };
  const stamp=(obj,name,id)=>{
    if(!plainObj(obj))return obj;
    const ref=refFor(name||obj.exerciseName||obj.name||obj.n||obj.exercise,id||obj.exerciseId||obj.libId);
    obj.exerciseId=ref.exerciseId;obj.libId=ref.libId;if(!obj.exerciseName)obj.exerciseName=ref.name;return obj;
  };
  const stampOption=o=>{if(plainObj(o)){const ref=refFor(o.n,o.exerciseId||o.libId);o.exerciseId=ref.exerciseId;o.libId=ref.libId;if(!o.n)o.n=ref.name;}};
  const stampProgram=p=>{if(!plainObj(p))return;(p.days||[]).forEach(d=>(d.ex||[]).forEach(e=>(e.opts||[]).forEach(stampOption)));};

  Object.keys(next.history||{}).forEach(name=>(next.history[name]||[]).forEach(row=>stamp(row,name)));
  Object.keys(next.personalRecords||{}).forEach(name=>stamp(next.personalRecords[name],name));
  (next.workoutHistory||[]).forEach((w,wi)=>{
    if(!w.id)w.id="wo_legacy_"+String(w.date||"date").replace(/[^0-9]/g,"")+"_"+wi;
    (w.detail||[]).forEach(x=>stamp(x,x.n));
  });
  Object.keys(next.exerciseNotes||{}).forEach(name=>{const row=dataFor(name);row.note=String(next.exerciseNotes[name]||"");});
  Object.keys(next.setupMemory||{}).forEach(name=>{const row=dataFor(name);row.setup=next.setupMemory[name];stamp(next.setupMemory[name],name);});
  Object.keys(next.exerciseWeights||{}).forEach(name=>{const row=dataFor(name);row.weightConfig=next.exerciseWeights[name];stamp(next.exerciseWeights[name],name);});
  Object.keys(next.exercisePreferences||{}).forEach(name=>{dataFor(name).preference=next.exercisePreferences[name];});
  Object.keys(next.exerciseFeedback||{}).forEach(name=>{
    const row=dataFor(name),feedback=Array.isArray(next.exerciseFeedback[name])?next.exerciseFeedback[name]:[];
    feedback.forEach(x=>stamp(x,name));row.feedback=feedback;
  });
  Object.keys(next.customPrograms||{}).forEach(id=>stampProgram(next.customPrograms[id]&&next.customPrograms[id].prog));
  (next.programVersions||[]).forEach(v=>stampProgram(v&&v.prog));
  (next.customWorkouts||[]).forEach(w=>(w.ex||[]).forEach(e=>(e.opts||[]).forEach(stampOption)));
  Object.keys(next.extraExercises||{}).forEach(k=>(next.extraExercises[k]||[]).forEach(e=>(e.opts||[]).forEach(stampOption)));
  Object.keys(next.slots||{}).forEach(k=>{const r=next.slots[k];if(r&&r.swap)stamp(r.swap,r.swap.n);if(r&&r.ss)stamp(r.ss,r.ss.n);});

  (next.recommendationEvents||[]).forEach(ev=>{
    if(!ev||!plainObj(ev.data))return;
    const d=ev.data;if(d.exercise||d.exerciseName)stamp(d,d.exerciseName||d.exercise);
    (d.targets||[]).forEach(x=>stamp(x,x.exercise||x.name));
    (d.exercises||[]).forEach(x=>stamp(x,x.name||x.exercise));
  });
  (next.coachDecisions||[]).forEach(d=>(d.items||[]).forEach(x=>stamp(x,x.name||x.exercise)));
  if(next.smartSession)(next.smartSession.items||[]).forEach(x=>stamp(x,x.name||x.exercise));
  (next.progressPhotos||[]).forEach((p,i)=>{if(p&&!p.id)p.id="photo_"+String(p.date||"undated").replace(/[^0-9]/g,"")+"_"+i;});
  next.schemaVersion=STATE_SCHEMA_VERSION;
  next.persistenceRevision=Math.max(1,+next.persistenceRevision||0);
  next.migratedAt=next.migratedAt||new Date().toISOString();
  return next;
}
function normalizeStateSchema(raw){
  let next=plainObj(raw)?raw:{};
  if(!next.schemaVersion)return migrateFromV2Schema(next);
  if(+next.schemaVersion<STATE_SCHEMA_VERSION)next=migrateFromV1Schema(next);
  return next;
}

/* ---------- one-time upgrade from the pre-3.0.0 state shape ---------- */
/* v3.0.0 is a from-scratch rewrite of the JS layer, but it installs as an update over
 * the same app (same package, incrementing versionCode) — so localStorage["gymTracker"]
 * already holds a real user's data in the OLD shape the first time this runs. This is
 * the one legitimate migration: old shape -> new shape, exactly once, gated by
 * schemaVersion. It deliberately does NOT carry over any of the old __mig22/__mig25x/
 * __mig274/__mig5upSwap/__migExtraDedup flags or the state.__userprograms mechanism they
 * were patching — the new customPrograms fresh-id contract (see 03-programs.js) replaces
 * that mechanism outright, so there is nothing left for those flags to guard against.
 * Also doubles as fresh-install initialization: an empty `{}` migrates into the same
 * shape with every container empty, so there's no separate "first run" code path. */
const BUILTIN_PROGRAM_IDS=["3fb","4ul","5up","6ppl","ubp","pp4","bws","bwsnl"];
function migrateFromV2Schema(old){
  old = plainObj(old) ? old : {};
  const next = {
    schemaVersion: 1,
    programId: old.__program || null,
    profile: plainObj(old.__profile) ? old.__profile : null,
    customPrograms: {},
    slots: {},
    history: plainObj(old.__log) ? old.__log : {},
    personalRecords: plainObj(old.__pr) ? old.__pr : {},
    exerciseNotes: {},
    setupMemory: {},
    extraExercises: plainObj(old.__extra) ? old.__extra : {},
    workoutHistory: Array.isArray(old.__history) ? old.__history : [],
    customWorkouts: Array.isArray(old.__custom) ? old.__custom : [],
    bodyweightLog: Array.isArray(old.__bw) ? old.__bw : [],
    measurements: Array.isArray(old.__measure) ? old.__measure : [],
    progressPhotos: trimPhotosForStorage(old.__photos, false),
    programVersions: Array.isArray(old.__versions) ? old.__versions : [],
    shapeGoals: Array.isArray(old.__shapeGoals) ? old.__shapeGoals : null,
    phaseStart: old.__phaseStart || null,
    readiness: plainObj(old.__ready) ? old.__ready : null,
    homeExpanded: !!old.__homeExpanded,
  };

  // state.__userprograms[id] -> customPrograms[freshId], never reusing a built-in id
  if(plainObj(old.__userprograms)){
    let seq=0;
    Object.keys(old.__userprograms).forEach(function(oldId){
      const entry=old.__userprograms[oldId];
      if(!entry||!plainObj(entry.prog))return;
      const isBuiltIn=BUILTIN_PROGRAM_IDS.indexOf(oldId)!==-1;
      const newId=isBuiltIn?("custom_"+Date.now()+"_"+(seq++)):oldId;
      const prog=JSON.parse(JSON.stringify(entry.prog));
      prog.id=newId;
      next.customPrograms[newId]={
        id:newId,
        basedOn:isBuiltIn?oldId:null,
        source:"coach",
        createdAt:new Date().toISOString(),
        prog:prog
      };
      if(next.programId===oldId)next.programId=newId;
    });
  }

  // flat "__note_<slug>" / "__setup_<slug>" keys -> nested objects
  // any other leftover key is a per-slot session record (shape: {opt,swap,sets,log})
  const KNOWN=["__program","__profile","__userprograms","__log","__pr","__extra",
    "__history","__custom","__bw","__measure","__photos","__versions","__shapeGoals",
    "__phaseStart","__ready","__homeExpanded","__mig22","__mig25b","__mig25x","__mig274",
    "__mig5upSwap","__migExtraDedup","__miglog"];
  Object.keys(old).forEach(function(k){
    if(KNOWN.indexOf(k)!==-1)return;
    if(k.indexOf("__note_")===0){ next.exerciseNotes[k.slice(7)]=old[k]; return; }
    if(k.indexOf("__setup_")===0){ next.setupMemory[k.slice(8)]=old[k]; return; }
    const v=old[k];
    if(plainObj(v)&&(Array.isArray(v.sets)||v.opt!=null||v.swap!=null)) next.slots[k]=v;
  });

  return migrateFromV1Schema(next);
}

/* ---------- load + persist ---------- */
let _stateMirrorRaw=null,_stateMirrorValid=false,_stateMirrorParsed={};
let _stateMirrorPendingRevision=0;
try{
  _stateMirrorPendingRevision=+(localStorage.getItem("gymTrackerPendingRevision")||0);
  _stateMirrorRaw=localStorage.getItem("gymTracker");
  _stateMirrorParsed=_stateMirrorRaw?JSON.parse(_stateMirrorRaw):{};
  _stateMirrorValid=!!(_stateMirrorRaw&&plainObj(_stateMirrorParsed));
}catch(e){_stateMirrorParsed={};}
let state=normalizeStateSchema(_stateMirrorParsed);
if(!_stateMirrorValid||+(_stateMirrorParsed.schemaVersion||0)!==STATE_SCHEMA_VERSION){
  try{ localStorage.setItem("gymTracker",JSON.stringify(state)); }catch(e){qerr(e,"02-state")}
}
// The July 2026 5up rebuild changed exercise order and count. Slot keys contain the
// old exercise index, so clear only those transient 5up slots once; completed history,
// PRs, notes, setup memory, measurements and every other program remain untouched.
if(!state.__mig5upSmartVolume){
  state.slots=state.slots||{};
  Object.keys(state.slots).forEach(k=>{ if(k.indexOf("5up_")===0)delete state.slots[k]; });
  state.__mig5upSmartVolume=true;
  try{
    const draft=JSON.parse(localStorage.getItem("gymSess")||"null");
    if(draft&&draft.target&&String(draft.target.key||"").indexOf("5up_")===0)localStorage.removeItem("gymSess");
    localStorage.setItem("gymTracker",JSON.stringify(state));
  }catch(e){qerr(e,"02-state")}
}
// A previously downloaded OTA payload can contain the old built-in `5up` and is applied
// over program.js during boot. Invalidate that payload once so v3.27's bundled rebuild
// actually becomes visible after an APK update. Keep the user's source URL so future
// explicit refreshes still work; custom programs are stored separately and untouched.
if(!state.__migBundled5up327){
  try{
    localStorage.removeItem("__progcache");
    localStorage.removeItem("__progver");
    localStorage.removeItem("__progupd");
  }catch(e){qerr(e,"02-state")}
  state.__migBundled5up327=true;
  try{localStorage.setItem("gymTracker",JSON.stringify(state));}catch(e){qerr(e,"02-state")}
}
// Concept I starts with a short timeline so the Train home is calm on first view.
// The user can still tap View all, and that choice remains persistent afterwards.
if(!state.__migConceptI331){
  state.homeExpanded=false;
  state.__migConceptI331=true;
  try{localStorage.setItem("gymTracker",JSON.stringify(state));}catch(e){qerr(e,"02-state")}
}
/* 2026-08-04 — the seated-lateral-raise repair, and the fork problem behind it.
 *
 * Two things went wrong here, and neither is fixable by editing a built-in program:
 *
 * 1. A custom program is a FORK — a frozen copy of the built-in it was based on. Rebuilding
 *    that built-in therefore does nothing at all for anyone training the fork, which is why
 *    an approved rewrite of `stier5` appeared on this device to have changed nothing.
 * 2. The pre-rebuild forks carry SEATED lateral raises, which need a bench dragged over to
 *    the cable stack. In a busy gym that is not a suboptimal pick, it is a movement the user
 *    cannot perform at all — so it has to go regardless of which program they end up on.
 *
 * So: repair every custom program by content (not by id — any device may hold one), then
 * move anyone still sitting on a stale fork onto the split that superseded it. The fork is
 * KEPT, never deleted. It is the user's own work and switching back must stay possible —
 * just without the movement they cannot do in it.
 *
 * Renaming the exercise does orphan its logged sets, since history is name-keyed. That is
 * the right trade here: standing and seated cable laterals load differently enough that the
 * old numbers would be a misleading starting point anyway.
 */
if(!state.__migStandingLateral354){
  const SEATED=/(cable seated lateral|seated cable lateral|seated side lateral|one-?arm incline lateral)/i;
  const STAND=(window.LIB||[]).find(x=>x.n==="Standing Low-Pulley Deltoid Raise");
  const CUE="Standing at a low pulley, cable running behind the legs, one arm at a time — no bench needed. Pronate the palm, raise slightly in front of the frontal plane, and stop at shoulder height.";
  const custom=state.customPrograms||{};
  const optsOf=p=>{ const out=[]; (((p||{}).prog||{}).days||[]).forEach(d=>(d.ex||[]).forEach(x=>(x.opts||[]).forEach(o=>out.push(o)))); return out; };
  /* Capture staleness BEFORE repairing, or the repair erases the evidence for the move. */
  const onStaleFork=!!(state.programId&&custom[state.programId]&&optsOf(custom[state.programId]).some(o=>SEATED.test(String(o.n||""))));
  let fixed=0;
  if(STAND) Object.keys(custom).forEach(id=>optsOf(custom[id]).forEach(o=>{
    if(!SEATED.test(String(o.n||"")))return;
    o.n="Cable Lateral Raise"; o.img=STAND.img; o.eq="cable"; o.cue=CUE; fixed++;
  }));
  let moved=false;
  if(onStaleFork&&window.PROGRAMS&&window.PROGRAMS.stier5){
    state.programId="stier5"; moved=true;
    /* A half-finished session still points at the fork's slot keys; leaving it would reopen
       the old day on top of the new program. */
    try{ const draft=JSON.parse(localStorage.getItem("gymSess")||"null");
      if(draft&&draft.target&&String(draft.target.key||"").indexOf("custom_")===0)localStorage.removeItem("gymSess"); }catch(e){qerr(e,"02-state")}
  }
  /* Never change someone's program silently — app.js surfaces this once, then clears it. */
  if(moved)state.__lateralNotice="Switched to the 5-Day S-Tier Split. Your custom program is still saved under Program & days.";
  else if(fixed)state.__lateralNotice="Seated lateral raises replaced with the standing cable version — no bench needed.";
  state.__migStandingLateral354=true;
  try{localStorage.setItem("gymTracker",JSON.stringify(state));}catch(e){qerr(e,"02-state")}
}

let activeProg=state.programId||null;
let profile=state.profile||null;

function save(){
  state.persistenceRevision=Math.max(Date.now(),(+state.persistenceRevision||0)+1);
  try{localStorage.setItem("gymTrackerPendingRevision",String(state.persistenceRevision));}catch(e){qerr(e,"02-state")}
  /* Queue the normalized transaction first. A localStorage quota failure must never be
     able to prevent the durable repository from receiving the in-memory state. */
  if(typeof queueDurableStateSave==="function")queueDurableStateSave(state);
  try{
    state.schemaVersion=STATE_SCHEMA_VERSION;
    let raw=JSON.stringify(state);
    /* Photos are stored as independent IndexedDB records. Once the compatibility mirror
       gets large, omit only their bytes from that mirror; never delete them from state. */
    if(byteSize(raw)>STATE_SOFT_LIMIT&&state.progressPhotos&&state.progressPhotos.length){
      const mirror=JSON.parse(raw);
      mirror.progressPhotos=mirror.progressPhotos.map((p,i)=>({id:p.id||("photo_"+String(p.date||"undated").replace(/[^0-9]/g,"")+"_"+i),date:p.date||"",createdAt:p.createdAt||null}));
      mirror.durablePhotoPayload=true;raw=JSON.stringify(mirror);
    }
    localStorage.setItem("gymTracker",raw);
    try{localStorage.removeItem("gymTrackerPendingRevision");}catch(e){qerr(e,"02-state")}
    // Keep the Downloads auto-backup current on every write, not just workout finish
    // (typeof guard: autoBackup lives in the feature layer, loaded after this file).
    if(typeof autoBackup==="function")autoBackup();
    return true;
  }catch(e){
    /* Do not "make room" by mutating/deleting photos. The queued IndexedDB transaction
       still holds the complete state and can recover it on the next boot. Remove the
       stale mirror (the native snapshot may still return it) and leave the small pending
       revision marker so boot explicitly compares against IndexedDB. */
    try{
      localStorage.removeItem("gymTracker");
      localStorage.setItem("gymTrackerPendingRevision",String(state.persistenceRevision));
    }catch(_){}
    if(typeof toast==="function")setTimeout(()=>toast("Could not save - phone storage is full"),0);
    return false;
  }
}

/* Debounced save for high-frequency call sites (every keystroke in the log grid's
 * weight/reps inputs). `state` is mutated in memory immediately — only the
 * stringify+localStorage write is coalesced, which is what gets expensive once
 * progress photos push the state blob into the megabytes. Flushed when the app is
 * backgrounded/killed so nothing typed is lost. Anything that must know the write
 * really landed (finish, restore, photo add) keeps calling save() directly. */
let _svT=null;
function saveSoon(){ clearTimeout(_svT); _svT=setTimeout(function(){ _svT=null; save(); },400); }
function flushSave(){ if(_svT){ clearTimeout(_svT); _svT=null; save(); } }
try{
  if(typeof window.addEventListener==="function"){
    window.addEventListener("pagehide",flushSave);
    document.addEventListener("visibilitychange",function(){ if(document.hidden)flushSave(); });
  }
}catch(e){qerr(e,"02-state")}

/* ---------- session draft (today's in-progress workout, survives app kill) ---------- */
/* Stored under its own small localStorage key ("gymSess"), separate from the main state
 * blob — it's ephemeral (auto-expires after 5h or a day change), not durable history. */
function sess(){ try{return JSON.parse(localStorage.getItem("gymSess")||"null");}catch(e){return null;} }
function staleSess(s){ return s&&(s.date!==todayStr()||(Date.now()-s.start)>5*3600*1000); }
function sessionTarget(){
  const d=logDay();
  return logCustom
    ? {type:"custom",index:logCustom.index,key:logCustom.key,title:logCustom.name}
    : {type:"program",program:activeProg,day:curDay,key:PROGRAM[curDay].key,title:PROGRAM[curDay].day+" - "+PROGRAM[curDay].title};
}
function ensureSession(){ const meta=sessionTarget(), s=sess(); if(!s||staleSess(s)||!s.target||s.target.key!==meta.key) localStorage.setItem("gymSess",JSON.stringify({start:Date.now(),date:todayStr(),target:meta})); }
function activeSession(){ const s=sess(); return (s&&!staleSess(s)&&s.target)?s.target:null; }
