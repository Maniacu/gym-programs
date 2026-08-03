/* Durable exercise data. Human-readable name keys remain as a compatibility index for
 * old backups and UI code, while every record also carries a stable exerciseId/libId
 * and the canonical settings live in state.exerciseData[exerciseId]. */

function exerciseDataFor(name,suppliedId,create){
  const ref=exerciseIdentityFor(name,suppliedId,state);
  state.exerciseData=plainObj(state.exerciseData)?state.exerciseData:{};
  let row=state.exerciseData[ref.exerciseId];
  if(!plainObj(row)&&create!==false){
    row={exerciseId:ref.exerciseId,libId:ref.libId,name:ref.name};
    state.exerciseData[ref.exerciseId]=row;
  }
  if(row){
    row.exerciseId=ref.exerciseId;row.libId=ref.libId||row.libId||null;row.name=row.name||ref.name;
  }
  return row||null;
}
function exerciseHistoryKeys(name,suppliedId){
  const ref=exerciseIdentityFor(name,suppliedId,state),keys=[];
  Object.keys(state.history||{}).forEach(k=>{
    const rows=state.history[k]||[],first=rows.find(x=>x&&x.exerciseId);
    if((first&&first.exerciseId===ref.exerciseId)||(!first&&exerciseIdentityKey(k)===exerciseIdentityKey(name)))keys.push(k);
  });
  if(!keys.length&&state.history&&Array.isArray(state.history[name]))keys.push(name);
  return keys;
}

/* ---------- per-exercise set-by-set history ---------- */
function exLog(name,suppliedId){
  const L=state.history||{},keys=exerciseHistoryKeys(name,suppliedId);
  if(keys.length<=1)return keys.length?L[keys[0]]:[];
  return keys.reduce((a,k)=>a.concat(L[k]||[]),[]).sort((a,b)=>String(a.d||"").localeCompare(String(b.d||"")));
}
function pushExLog(name,entry,suppliedId){
  const L=(state.history=state.history||{}),ref=exerciseIdentityFor(name,suppliedId||(entry&&entry.exerciseId)||(entry&&entry.libId),state);
  entry=plainObj(entry)?entry:{};stampExerciseIdentity(entry,name,ref.exerciseId,state);
  entry.n=entry.n||ref.name;
  const key=ref.name||name;(L[key]=L[key]||[]).push(entry);if(L[key].length>600)L[key]=L[key].slice(-600);
  exerciseDataFor(ref.name,ref.exerciseId,true);
}
function logForExerciseName(name){ return exLog(name).slice(-12); }

/* ---------- personal records ---------- */
function prFor(name,suppliedId){
  const ref=exerciseIdentityFor(name,suppliedId,state),all=state.personalRecords||{};
  if(all[name]&&(!all[name].exerciseId||all[name].exerciseId===ref.exerciseId))return all[name];
  return Object.keys(all).map(k=>all[k]).find(x=>x&&x.exerciseId===ref.exerciseId)||null;
}
/* Three PR metrics, never cross-compared (they aren't comparable):
   - weighted (w>0, timed falsy): best by e1RM/top weight.
   - bodyweight reps (w=0, timed falsy): best by reps, only vs a prior bodyweight PR.
   - timed (timed=true; r holds SECONDS): longest hold, heavier weight breaks ties,
     only vs a prior timed PR — stored with t:1 so displays can say "45s hold". */
function maybeSetPR(name,w,r,e1,date,timed){
  state.personalRecords=state.personalRecords||{};
  const ref=exerciseIdentityFor(name,null,state),cur=prFor(name,ref.exerciseId);
  let isPR;
  if(timed) isPR=(!cur||cur.t)&&(!cur||r>(cur.r||0)||(r===(cur.r||0)&&(w||0)>(cur.w||0)));
  else if(w) isPR=(!cur||!cur.t)&&(!cur||e1>cur.e||w>cur.w);
  else isPR=(!cur||(!cur.w&&!cur.t))&&r>(cur?cur.r||0:0);
  if(isPR){
    const rec={w:w||0,r:r,e:e1||0,date:date||todayStr(),exerciseId:ref.exerciseId,libId:ref.libId,exerciseName:ref.name};
    if(timed)rec.t=1;state.personalRecords[ref.name||name]=rec;
  }
  return isPR;
}

/* ---------- exercise notes / setup memory ----------
 * The id-keyed record is authoritative. Legacy slug maps are mirrored so older exported
 * backups and code can still read the data without losing anything. */
function nameSlug(name){ return (name||"").replace(/[^a-z0-9]+/gi,"_").toLowerCase(); }
function noteFor(name,suppliedId){
  const row=exerciseDataFor(name,suppliedId,false);if(row&&row.note!=null)return row.note;
  return (state.exerciseNotes||{})[nameSlug(name)]||"";
}
function setNoteFor(name,text,suppliedId){
  const row=exerciseDataFor(name,suppliedId,true);row.note=String(text||"");
  state.exerciseNotes=state.exerciseNotes||{};state.exerciseNotes[nameSlug(name)]=row.note;
}
function setupFor(name,suppliedId){
  const row=exerciseDataFor(name,suppliedId,false);if(row&&plainObj(row.setup))return row.setup;
  return (state.setupMemory||{})[nameSlug(name)]||null;
}
function setSetupFor(name,data,suppliedId){
  const ref=exerciseIdentityFor(name,suppliedId,state),row=exerciseDataFor(name,ref.exerciseId,true);
  row.setup=plainObj(data)?Object.assign({},data,{exerciseId:ref.exerciseId,libId:ref.libId,exerciseName:ref.name}):data;
  state.setupMemory=state.setupMemory||{};state.setupMemory[nameSlug(name)]=row.setup;
}
/* per-exercise weight config (name-keyed so a machine's real stack/increment follows the
   exercise across swaps): {step:<num>, list:[<num>...], unit:"kg"|"lb"}. Numbers are in
   the unit they were entered; applied only when that unit still matches, else the app
   falls back to the equipment-type default (avoids wrong values after a unit switch). */
function weightCfgFor(name,suppliedId){
  const row=exerciseDataFor(name,suppliedId,false);if(row&&plainObj(row.weightConfig))return row.weightConfig;
  return (state.exerciseWeights||{})[nameSlug(name)]||null;
}
function setWeightCfgFor(name,cfg,suppliedId){
  const ref=exerciseIdentityFor(name,suppliedId,state),row=exerciseDataFor(name,ref.exerciseId,true);
  state.exerciseWeights=state.exerciseWeights||{};
  if(cfg&&(cfg.step>0||(cfg.list&&cfg.list.length))){
    row.weightConfig=Object.assign({},cfg,{exerciseId:ref.exerciseId,libId:ref.libId,exerciseName:ref.name});
    state.exerciseWeights[nameSlug(name)]=row.weightConfig;
  }else{delete row.weightConfig;delete state.exerciseWeights[nameSlug(name)];}
}

/* ---------- session-level workout history (state.workoutHistory) ---------- */
function weeklyMuscleSets(){ const cut=localDateStr(new Date(Date.now()-6*864e5)), wk={}; (state.workoutHistory||[]).filter(e=>e.date>=cut&&e.m).forEach(e=>{ for(const k in e.m)wk[k]=(wk[k]||0)+e.m[k]; }); return wk; }
/* consecutive calendar days with at least one finished workout, walking back from today
   (or yesterday if today hasn't been trained yet, so an in-progress day doesn't zero it) */
function trainingStreak(){
  const dates=[...new Set((state.workoutHistory||[]).map(e=>e.date))];
  let streak=0, probe=new Date();
  if(!dates.includes(localDateStr(probe))) probe.setDate(probe.getDate()-1);
  while(dates.includes(localDateStr(probe))){ streak++; probe.setDate(probe.getDate()-1); }
  return streak;
}
/* Consecutive WEEKS containing at least one finished workout — this is the streak the
   app actually shows. A consecutive-DAYS streak is the wrong metric for a program with
   programmed rest days: every built-in split has them, so a lifter training perfectly to
   plan reads 0 or 1 forever and the number stops meaning anything. Weeks start Monday to
   match the Progress calendar. The current week is skipped rather than counted as a break
   when it has no session yet, so the streak doesn't collapse every Monday morning. */
function weekStartStr(d){ const x=new Date(d); x.setDate(x.getDate()-((x.getDay()+6)%7)); return localDateStr(x); }
function trainingWeekStreak(){
  const weeks=new Set((state.workoutHistory||[]).map(e=>e.date?weekStartStr(new Date(e.date+"T00:00:00")):null).filter(Boolean));
  let streak=0, probe=new Date();
  if(!weeks.has(weekStartStr(probe))) probe.setDate(probe.getDate()-7);
  while(weeks.has(weekStartStr(probe))){ streak++; probe.setDate(probe.getDate()-7); }
  return streak;
}
function daysSinceTrained(mus){
  for(const e of (state.workoutHistory||[])){ if(e.m&&e.m[mus]){ const d0=new Date(e.date+"T00:00:00"), d1=new Date(todayStr()+"T00:00:00"); return Math.round((d1-d0)/864e5); } }
  return null;
}

/* Rebuilds all data derived from completed sessions after a history correction. New
   workouts carry a stable sessionId plus every completed set, so an edited typo cannot
   keep contaminating PRs, progression, recovery or weekly-volume advice. Legacy entries
   without a sessionId are retained because their original workout may predate rich
   snapshots and therefore cannot be reconstructed safely. */
function recalculateTrainingDerivedData(){
  const workouts=state.workoutHistory||[],legacy={},reconstructable={};
  /* A pre-stable-id workout may already have a rich detail snapshot while its old
     per-exercise log row has no sessionId. Treat that date+exercise as reconstructable
     so the old row is replaced, not retained beside a duplicate rebuilt row. */
  workouts.forEach(w=>{
    if(!w||!w.date||!Array.isArray(w.detail))return;
    w.detail.forEach(x=>{
      if(!x||!x.n)return;stampExerciseIdentity(x,x.n,x.exerciseId||x.libId,state);
      reconstructable[String(w.date)+"\u0000"+String(x.exerciseId||x.n)]=1;
    });
  });
  Object.keys(state.history||{}).forEach(name=>{
    legacy[name]=(state.history[name]||[]).filter(x=>{
      if(!x)return false;stampExerciseIdentity(x,name,x.exerciseId||x.libId,state);
      return !x.sessionId&&!reconstructable[String(x.d)+"\u0000"+String(x.exerciseId||name)];
    }).map(x=>JSON.parse(JSON.stringify(x)));
  });
  const rebuilt=legacy,ordered=workouts.slice().sort((a,b)=>String(a.finishedAt||a.date||"").localeCompare(String(b.finishedAt||b.date||"")));
  ordered.forEach((w,wi)=>{
    if(!w.id)w.id="wo_legacy_"+String(w.date||"date").replace(/[^0-9]/g,"")+"_"+wi;
    if(!Array.isArray(w.detail))return;
    let vol=0,setsDone=0,exDone=0,plannedSets=0;const muscles={};
    w.detail.forEach(x=>{
      stampExerciseIdentity(x,x.n,x.exerciseId||x.libId,state);
      const sets=workSetsOf(x.sets);
      const planned=+x.plannedSets||targetSets(x.target||"3 x 8-12");
      plannedSets+=planned;setsDone+=sets.length;
      if(sets.filter(s=>String(s.type||"work")!=="drop").length>=planned)exDone++;
      if(x.m&&sets.length)muscles[x.m]=(muscles[x.m]||0)+sets.length;
      const timed=(typeof isTimedExercise==="function")&&isTimedExercise({n:x.n,r:x.target||""});
      sets.forEach(s=>{if(!timed&&s.type!=="t40"&&s.w&&s.r)vol+=(+s.w||0)*(+s.r||0);});
      let top=null;
      if(timed)top=sets.filter(s=>s.r).sort((a,b)=>(+b.r||0)-(+a.r||0)||(+b.w||0)-(+a.w||0))[0]||null;
      else top=sets.filter(s=>s.type!=="t40"&&(s.w||s.r)).sort((a,b)=>(+b.w||0)-(+a.w||0)||(+b.r||0)-(+a.r||0))[0]||null;
      if(!top)return;
      const entry={d:w.date,w:+top.w||0,r:+top.r||0,rir:top.rir!=null?+top.rir:null,e:0,n:x.n,m:x.m,
        exerciseId:x.exerciseId,libId:x.libId,exerciseName:x.exerciseName||x.n,
        s:sets.filter(s=>s.type!=="t40").map(s=>[+s.w||0,+s.r||0]),sx:sets.map(s=>({w:+s.w||0,r:+s.r||0,rir:s.rir!=null?+s.rir:null,type:s.type||"work"})),sessionId:w.id};
      if(timed)entry.t=1;else if(entry.w)entry.e=Math.round(entry.w*(1+entry.r/30));
      (rebuilt[x.n]=rebuilt[x.n]||[]).push(entry);
    });
    w.vol=Math.round(vol);w.sets=setsDone;w.plannedSets=plannedSets;w.ex=exDone;w.plannedEx=w.detail.length;w.m=muscles;
  });
  Object.keys(rebuilt).forEach(name=>rebuilt[name].sort((a,b)=>String(a.d||"").localeCompare(String(b.d||""))).splice(0,Math.max(0,rebuilt[name].length-600)));
  state.history=rebuilt;state.personalRecords={};
  const allLogs=[];
  Object.keys(rebuilt).forEach(name=>(rebuilt[name]||[]).forEach((x,i)=>allLogs.push({name:name,row:x,index:i})));
  allLogs.sort((a,b)=>String(a.row.d||"").localeCompare(String(b.row.d||""))||a.index-b.index);
  const sessionPr={};
  allLogs.forEach(item=>{
    const x=item.row,before=state.personalRecords[item.name],was=before&&JSON.stringify(before);
    maybeSetPR(item.name,+x.w||0,+x.r||0,+x.e||0,x.d,!!x.t);
    const after=state.personalRecords[item.name];
    if(x.sessionId&&after&&JSON.stringify(after)!==was)sessionPr[x.sessionId]=(sessionPr[x.sessionId]||0)+1;
  });
  workouts.forEach(w=>{if(w.id)w.prs=sessionPr[w.id]||0;});
  state.derivedRebuiltAt=new Date().toISOString();
  save();
  return {workouts:workouts.length,exercises:Object.keys(rebuilt).length};
}
