/* Durable normalized repository.
 *
 * localStorage remains the synchronous boot mirror (and is mirrored to the native
 * atomic snapshot by 01-native.js). IndexedDB is the durable source-of-recovery and
 * also keeps high-value collections in independent object stores so one oversized or
 * corrupt JSON value cannot take workout history, settings and photos down together.
 * Progress-photo bytes live only in the `photos` store inside the durable snapshot;
 * the compatibility localStorage mirror still contains them for older app versions. */
const DURABLE_DB_NAME="GymTrackerRepository",DURABLE_DB_VERSION=1;
const DURABLE_STORES=["meta","workouts","exerciseLogs","exercises","programs","photos","recommendations"];
let _durableDbPromise=null,_durableSaveTimer=null,_durablePendingState=null,_durableWriting=false;

function durableDbOpen(){
  if(_durableDbPromise)return _durableDbPromise;
  if(typeof indexedDB==="undefined")return Promise.resolve(null);
  _durableDbPromise=new Promise((resolve,reject)=>{
    let req;
    try{req=indexedDB.open(DURABLE_DB_NAME,DURABLE_DB_VERSION);}catch(e){reject(e);return;}
    req.onupgradeneeded=()=>{
      const db=req.result;
      DURABLE_STORES.forEach(name=>{
        if(db.objectStoreNames.contains(name))return;
        db.createObjectStore(name,{keyPath:name==="meta"?"key":"id"});
      });
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Could not open durable repository"));
  }).catch(()=>null);
  return _durableDbPromise;
}
function durableRowId(parts){
  return parts.map(x=>String(x==null?"":x).replace(/[|]/g,"_")).join("|");
}
function durableStateRecords(input){
  const src=JSON.parse(JSON.stringify(input||{})),photos=[];
  src.schemaVersion=STATE_SCHEMA_VERSION;
  src.progressPhotos=(src.progressPhotos||[]).map((p,i)=>{
    const id=(p&&p.id)||durableRowId(["photo",p&&p.date||"undated",i]);
    if(p&&p.data)photos.push({id:id,date:p.date||"",data:p.data,createdAt:p.createdAt||null});
    return {id:id,date:p&&p.date||"",createdAt:p&&p.createdAt||null};
  });
  const workouts=(src.workoutHistory||[]).map((w,i)=>Object.assign({},
    w,{id:w.id||durableRowId(["workout",w.date||"undated",i])}));
  const exerciseLogs=[];
  Object.keys(src.history||{}).forEach(name=>(src.history[name]||[]).forEach((row,i)=>{
    const ref=exerciseIdentityFor(name,row&&row.exerciseId||row&&row.libId,src);
    const copy=Object.assign({},row,{exerciseId:ref.exerciseId,libId:ref.libId,
      exerciseName:(row&&row.exerciseName)||ref.name});
    copy.id=durableRowId(["log",ref.exerciseId,copy.sessionId||copy.d||"undated",i]);
    exerciseLogs.push(copy);
  }));
  const exercises=Object.keys(src.exerciseData||{}).map(id=>Object.assign({},
    src.exerciseData[id],{id:id,exerciseId:id}));
  const programs=Object.keys(src.customPrograms||{}).map(id=>Object.assign({},src.customPrograms[id],{id:id}));
  const recommendations=(src.recommendationEvents||[]).map((ev,i)=>Object.assign({},
    ev,{id:ev.id||durableRowId(["recommendation",ev.at||ev.date||"undated",ev.type||"event",i])}));
  return {snapshot:src,workouts:workouts,exerciseLogs:exerciseLogs,exercises:exercises,
    programs:programs,photos:photos,recommendations:recommendations};
}
function durableCommitState(input){
  return durableDbOpen().then(db=>{
    if(!db)return false;
    const rows=durableStateRecords(input),savedAt=new Date().toISOString();
    return new Promise((resolve,reject)=>{
      let tx;
      try{tx=db.transaction(DURABLE_STORES,"readwrite");}catch(e){reject(e);return;}
      DURABLE_STORES.forEach(name=>tx.objectStore(name).clear());
      tx.objectStore("meta").put({key:"current",schemaVersion:STATE_SCHEMA_VERSION,savedAt:savedAt,state:rows.snapshot});
      rows.workouts.forEach(x=>tx.objectStore("workouts").put(x));
      rows.exerciseLogs.forEach(x=>tx.objectStore("exerciseLogs").put(x));
      rows.exercises.forEach(x=>tx.objectStore("exercises").put(x));
      rows.programs.forEach(x=>tx.objectStore("programs").put(x));
      rows.photos.forEach(x=>tx.objectStore("photos").put(x));
      rows.recommendations.forEach(x=>tx.objectStore("recommendations").put(x));
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error("Durable state transaction failed"));
      tx.onabort=()=>reject(tx.error||new Error("Durable state transaction aborted"));
    });
  }).catch(()=>false);
}
function durableDrainSaveQueue(){
  if(_durableWriting||!_durablePendingState)return;
  const pending=_durablePendingState;_durablePendingState=null;_durableWriting=true;
  durableCommitState(pending).finally(()=>{
    _durableWriting=false;if(_durablePendingState)durableDrainSaveQueue();
  });
}
function queueDurableStateSave(input){
  /* Capture the exact revision requested. Holding the mutable global object here could
     make a later edit leak into an earlier queued transaction. */
  try{_durablePendingState=JSON.parse(JSON.stringify(input));}catch(e){return;}
  clearTimeout(_durableSaveTimer);
  _durableSaveTimer=setTimeout(()=>{_durableSaveTimer=null;durableDrainSaveQueue();},700);
}
function flushDurableStateSave(){
  clearTimeout(_durableSaveTimer);_durableSaveTimer=null;
  if(_durablePendingState)durableDrainSaveQueue();
}
function durableStoreValues(store){
  return new Promise((resolve,reject)=>{
    const req=store.getAll();req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error||new Error("Could not read durable records"));
  });
}
function readDurableState(){
  return durableDbOpen().then(db=>{
    if(!db)return null;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(["meta","photos"],"readonly"),metaReq=tx.objectStore("meta").get("current");
      Promise.all([
        new Promise((ok,no)=>{metaReq.onsuccess=()=>ok(metaReq.result||null);metaReq.onerror=()=>no(metaReq.error);}),
        durableStoreValues(tx.objectStore("photos"))
      ]).then(values=>{
        const meta=values[0];if(!meta||!plainObj(meta.state)){resolve(null);return;}
        const recovered=JSON.parse(JSON.stringify(meta.state)),byId={};
        values[1].forEach(p=>byId[p.id]=p);
        recovered.progressPhotos=(recovered.progressPhotos||[]).map(ref=>{
          const p=byId[ref.id];return p?Object.assign({},ref,{data:p.data}):null;
        }).filter(Boolean);
        resolve(normalizeStateSchema(recovered));
      }).catch(reject);
    });
  }).catch(()=>null);
}
function restoreStateFromDurableRepository(){
  return readDurableState().then(recovered=>{
    if(!recovered)return false;
    state=recovered;activeProg=state.programId||"5up";profile=state.profile||null;
    save();
    if(typeof applyCustomPrograms==="function")applyCustomPrograms();
    if(typeof applyCustomExercises==="function")applyCustomExercises();
    if(typeof buildActive==="function")buildActive();
    if(typeof nav==="function")nav("plan");
    const onboarding=document.getElementById&&document.getElementById("onb");
    if(onboarding&&onboarding.classList)onboarding.classList.remove("on");
    return true;
  });
}
function reconcileDurableRevision(){
  return readDurableState().then(recovered=>{
    const mirrorRevision=+state.persistenceRevision||0,durableRevision=+(recovered&&recovered.persistenceRevision)||0;
    /* A pending marker can be newer than both persisted copies when the app was killed
       between queueing an IndexedDB write and committing it. If the synchronous mirror
       is absent/corrupt, the last valid durable snapshot must still win; otherwise the
       freshly initialized empty state would overwrite real history on this boot. */
    if(recovered&&(!_stateMirrorValid||
      durableRevision>=Math.max(mirrorRevision,_stateMirrorPendingRevision||0))){
      state=recovered;activeProg=state.programId||"5up";profile=state.profile||null;
      /* save() writes the compact mirror when photo bytes exceed its budget and clears
         the pending marker only after that mirror really lands. */
      save();
      if(typeof applyCustomPrograms==="function")applyCustomPrograms();
      if(typeof applyCustomExercises==="function")applyCustomExercises();
      if(typeof buildActive==="function")buildActive();
      if(typeof nav==="function")nav("plan");
      return true;
    }
    /* A current mirror is newer than the last completed durable transaction. Keep it
       and immediately schedule the missing durable revision. */
    queueDurableStateSave(state);
    return false;
  });
}
function hydrateDurablePhotoRefs(){
  const refs=(state.progressPhotos||[]).filter(p=>p&&!p.data&&p.id);
  if(!refs.length)return Promise.resolve(false);
  return readDurableState().then(recovered=>{
    if(!recovered)return false;
    const byId={};(recovered.progressPhotos||[]).forEach(p=>byId[p.id]=p);
    let changed=false;
    state.progressPhotos=(state.progressPhotos||[]).map(ref=>{
      if(ref.data||!byId[ref.id])return ref;changed=true;return Object.assign({},ref,{data:byId[ref.id].data});
    });
    if(changed){
      delete state.durablePhotoPayload;
      try{localStorage.setItem("gymTracker",JSON.stringify(state));}catch(e){}
    }
    return changed;
  });
}

try{
  if(typeof window.addEventListener==="function"){
    window.addEventListener("pagehide",flushDurableStateSave);
    document.addEventListener("visibilitychange",()=>{if(document.hidden)flushDurableStateSave();});
  }
}catch(e){}

/* Recover only when the synchronous mirror was actually absent/corrupt. A valid mirror
 * always wins at boot, but photo-reference mirrors are hydrated before the next commit
 * so an empty payload can never clear the photo store. app.js waits on this promise
 * before deciding to show onboarding, preventing a fresh-profile flash during recovery. */
window.__durableBootPromise=_stateMirrorPendingRevision
  ?reconcileDurableRevision()
  :_stateMirrorValid
  ?hydrateDurablePhotoRefs().then(()=>{queueDurableStateSave(state);return true;})
  :restoreStateFromDurableRepository().then(restored=>{if(!restored)queueDurableStateSave(state);return restored;});

window.GymDurableRepository={
  schemaVersion:STATE_SCHEMA_VERSION,save:()=>durableCommitState(state),
  read:readDurableState,restore:restoreStateFromDurableRepository,flush:flushDurableStateSave
};
