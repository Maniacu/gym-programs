/* Backup/restore, CSV export, and OTA program sync. Backup/restore is the trust
 * boundary for external data — restoreBackupText/normalizeImportedState handle both a
 * current-schema backup AND a pre-3.0.0 backup transparently (via migrateFromV2Schema,
 * same one-time upgrade path used for the live app's own localStorage on first boot).
 * OTA sync is a separate, narrower mechanism: it refreshes window.PROGRAMS at runtime
 * from a server-authoritative programs.json, and is never confused with
 * state.customPrograms (the user/AI-customization store) — see 03-programs.js. */

/* ---------- local + shared backup ---------- */
/* Debounced: save() calls this on EVERY state write, so the Downloads backup always
   reflects current data — before this it only refreshed on finishWorkout(), meaning
   program edits/swaps/settings made between workouts were absent from the backup file
   (bit us when trying to repair on-device data from a pulled backup). The debounce
   batches bursts of set-logging into one native write (two small files). */
let _abT=null;
function autoBackup(){ clearTimeout(_abT); _abT=setTimeout(()=>{ try{ native("saveBackup",JSON.stringify({data:state})); }catch(e){} },4000); }
function downloadText(name,text,type){
  const blob=new Blob([text],{type:type||"text/plain"}), url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},300);
}
function shareProg(){ const h=state.workoutHistory||[]; let v=0; h.forEach(e=>v+=e.vol||0); const txt="💪 My training\n"+h.length+" workouts · "+volDisp(v).toLocaleString()+" "+unit+" total\n"+(PROGRAMS[activeProg]?PROGRAMS[activeProg].name:"");
  if(navigator.share)navigator.share({text:txt}).catch(()=>{}); else {try{navigator.clipboard.writeText(txt);}catch(e){} toast("Summary copied");} }
function shareBackupCloud(){
  try{ localStorage.setItem("gymLastCloud",String(Date.now())); }catch(e){}
  const txt=JSON.stringify({data:state},null,2);
  if(window.GymNative&&GymNative.shareBackup){ try{GymNative.shareBackup(txt);toast("Choose Drive or Files");return;}catch(e){} }
  downloadText("GymTracker_backup_"+todayStr()+".json",txt,"application/json");
}
function openHealthConnect(){
  native0("openHealthConnect");
  toast("Opening Health Connect");
}
function openBackup(){
  const body=document.getElementById("bkBody");
  body.innerHTML="<p>Manual exports are readable JSON files containing your training data. Save or share them only somewhere you trust. Internal on-device recovery stays private and automatic.</p><textarea id='bk' readonly></textarea><input id='bkfile' type='file' accept='application/json,.json' style='display:none'><div class='btnrow'><button id='dlbk'>Download JSON</button><button class='s' id='imbk'>Import file</button></div><div class='btnrow'><button class='ghost' id='cp'>Copy text</button><button class='ghost' id='ps'>Paste & Restore</button></div><div class='btnrow'><button id='cloudbk'>Share to Drive / Files</button><button class='s' id='hcopen'>Health Connect</button></div>";
  const ta=document.getElementById("bk"); ta.value=JSON.stringify({data:state},null,2);
  document.getElementById("dlbk").onclick=()=>downloadText("GymTracker_backup_"+todayStr()+".json",ta.value,"application/json");
  document.getElementById("imbk").onclick=()=>document.getElementById("bkfile").click();
  document.getElementById("bkfile").onchange=e=>importBackupFile(e.target.files[0]);
  document.getElementById("cp").onclick=()=>{ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){document.execCommand("copy");}toast("Copied");};
  document.getElementById("ps").onclick=()=>{ta.removeAttribute("readonly"); if(ta.dataset.armed){try{restoreBackupText(ta.value);bkDlg.close();toast("Restored");}catch(e){toast("Invalid text");}}else{ta.value="";ta.placeholder="Paste backup, tap again";ta.dataset.armed="1";ta.focus();toast("Paste, then tap again");}};
  document.getElementById("cloudbk").onclick=shareBackupCloud;
  document.getElementById("hcopen").onclick=openHealthConnect;
  bkDlg.showModal();
}
function exportCSV(){
  const h=state.workoutHistory||[], rows=[["date","workout","sets","volume_"+unit,"PRs"]].concat(h.map(e=>[e.date,e.title,e.sets,volDisp(e.vol),e.prs||0]));
  downloadText("GymTracker_history_"+todayStr()+".csv",rows.map(r=>r.map(csvCell).join(",")).join("\n"),"text/csv");
  // Second file: the per-exercise top-set log (state.history) — the actually valuable
  // long-term data. Delayed so the two downloads don't race each other's click.
  const exRows=[];
  Object.keys(state.history||{}).forEach(n=>(state.history[n]||[]).forEach(l=>exRows.push([l.d,n,l.m||"",l.w?toDisp(l.w):0,l.r!=null?l.r:"",l.rir!=null?l.rir:"",l.e?toDisp(l.e):"",l.t?1:""])));
  exRows.sort((a,b)=>a[0]<b[0]?1:a[0]>b[0]?-1:0);
  const ex=[["date","exercise","muscle","weight_"+unit,"reps_or_secs","rir","e1rm_"+unit,"timed"]].concat(exRows);
  setTimeout(()=>downloadText("GymTracker_exercises_"+todayStr()+".csv",ex.map(r=>r.map(csvCell).join(",")).join("\n"),"text/csv"),400);
  toast("2 CSV files downloaded (sessions + exercises)");
}

/* ---------- import / restore (validates untrusted external JSON) ---------- */
function normalizeImportedState(raw){
  let next=plainObj(raw)?JSON.parse(JSON.stringify(raw)):{};
  next=normalizeStateSchema(next);
  if(!plainObj(next))throw new Error("Backup must contain app data");
  ["workoutHistory","bodyweightLog","measurements","progressPhotos","programVersions","customWorkouts","coachChat","customExercises","recommendationEvents","coachDecisions"].forEach(k=>{ if(next[k]&&!Array.isArray(next[k]))next[k]=[]; });
  ["exercisePreferences","recoveryOverrides","scheduleOverrides","exerciseCatalog","exerciseData"].forEach(k=>{if(next[k]&&!plainObj(next[k]))next[k]={};});
  if(Array.isArray(next.recommendationEvents))next.recommendationEvents=next.recommendationEvents.slice(0,1000);
  if(Array.isArray(next.coachDecisions))next.coachDecisions=next.coachDecisions.slice(0,250);
  next.progressPhotos=trimPhotosForStorage(next.progressPhotos,false);
  // Custom exercises get merged straight into LIB and rendered with innerHTML all over
  // the app — an imported backup is untrusted, so every field goes through the same
  // safeText treatment the in-app creator applies (in-app entries pass through unchanged).
  if(Array.isArray(next.customExercises)){
    next.customExercises=next.customExercises.slice(0,40).map((x,i)=>{
      if(!plainObj(x))return null;
      const n=safeText(x.n,60); if(!n)return null;
      const img=(typeof x.img==="string"&&x.img.length<400000&&(/^data:image\//.test(x.img)||/^img\//.test(x.img)))?x.img:"";
      const m=safeText(x.m,40)||"Chest";
      return {id:safeId(x.id,"cx_imp"+i),n:n,m:m,cat:safeText(x.cat,40)||m,eq:safeText(x.eq,50)||"other",cue:safeText(x.cue,400)||"Your custom exercise.",img:img,custom:1};
    }).filter(Boolean);
  }
  if(!plainObj(next.profile))next.profile=null;
  // per-exercise weight configs feed the stepper's math — coerce to clean numbers
  if(next.exerciseWeights&&!plainObj(next.exerciseWeights))next.exerciseWeights={};
  if(plainObj(next.exerciseWeights)){ const clean={}; Object.keys(next.exerciseWeights).slice(0,400).forEach(k=>{ const w=next.exerciseWeights[k]; if(!plainObj(w))return;
    const step=+w.step||0, list=Array.isArray(w.list)?w.list.map(Number).filter(v=>v>0&&v<10000).slice(0,60):null, u=(w.unit==="lb")?"lb":"kg";
    if(step>0||(list&&list.length))clean[safeText(k,60)]={step:step,list:list&&list.length?list:null,unit:u}; }); next.exerciseWeights=clean; }
  if(next.history&&!plainObj(next.history))next.history={};
  if(next.customPrograms&&!plainObj(next.customPrograms))next.customPrograms={};
  if(next.customPrograms){ Object.keys(next.customPrograms).forEach(k=>{
    const u=next.customPrograms[k], p=sanitizeProgram(u&&u.prog,k);
    if(p&&BUILTIN_PROGRAM_IDS.indexOf(k)===-1){ p.id=k; next.customPrograms[k]={id:k,basedOn:u.basedOn||null,source:u.source||"imported",createdAt:u.createdAt||new Date().toISOString(),updatedAt:u.updatedAt||u.createdAt||new Date().toISOString(),revision:+u.revision||1,diff:safeText(u.diff,40)||"Custom",icon:safeText(u.icon,8)||"🤖",prog:p}; }
    else delete next.customPrograms[k]; // reject anything trying to reuse a built-in id
  }); }
  let pid=typeof next.programId==="string"?next.programId:"5up";
  if(!PROGRAMS[pid]&&!(next.customPrograms&&next.customPrograms[pid]))pid="5up";
  next.programId=pid;
  next.schemaVersion=STATE_SCHEMA_VERSION;
  return next;
}
function restoreBackupText(text){
  const parsed=JSON.parse(text), next=normalizeImportedState(parsed.data||parsed);
  state=next; activeProg=state.programId||"5up"; profile=state.profile||null;
  applyCustomPrograms(); applyCustomExercises();
  if(!PROGRAMS[activeProg]){activeProg="5up";state.programId="5up";}
  if(!save())throw new Error("Could not save backup");
  buildActive(); nav("plan");
}
function importBackupFile(file){
  if(!file)return; const rd=new FileReader();
  rd.onload=()=>{ try{ restoreBackupText(rd.result); if(typeof bkDlg!=="undefined"&&bkDlg.open)bkDlg.close(); toast("Backup imported"); }
    catch(e){ toast("Invalid backup file"); } };
  rd.readAsText(file);
}
/* Fresh install (no local data): silently try restoring from the public Downloads backup
 * before falling back to onboarding — that file survives an uninstall/reinstall, so this
 * makes "I reinstalled the app" no longer mean "I lost my history". */
function tryAutoRestore(){
  try{
    const raw=nativeGet("readDownloadBackup");
    if(!raw)return false;
    const parsed=JSON.parse(raw), next=normalizeImportedState(parsed.data||parsed);
    if(!next||!next.programId)return false;
    state=next; activeProg=state.programId; profile=state.profile||null;
    applyCustomPrograms(); applyCustomExercises();
    if(!PROGRAMS[activeProg]){ activeProg="5up"; state.programId="5up"; }
    if(!save())return false;
    buildActive(); nav("plan"); toast("Restored your previous data from backup");
    return true;
  }catch(e){ return false; }
}

/* ---------- OTA APP updates (the web layer itself, not just program data) ----------
 * Distinct from the program sync below: that one refreshes window.PROGRAMS (content), this
 * one replaces the app's own JS/CSS/HTML. The APK is ~117 MB of mostly exercise images, while
 * the code is ~1.7 MB, so this turns a full reinstall over USB into a one-second download.
 * All verification lives in OtaManager.java — the bundle's manifest must carry a valid
 * signature from the key compiled into the APK, so nothing here has to trust the server.
 * Java changes still need a real APK; a bundle declares the native version it needs and is
 * refused if the phone's is older. */
function otaStatus(){ try{ return JSON.parse(nativeGet("otaStatus")||"{}"); }catch(e){ return {}; } }
/** Resolves with the native status string ("OK <version>" or a human-readable refusal). */
function otaCheckNative(){
  return new Promise(resolve=>{
    if(!window.GymNative||!GymNative.otaCheck){ resolve("Updates need the Android app"); return; }
    const id="ota"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    let done=false;
    const tm=setTimeout(()=>{ if(done)return; done=true; window.__otaResult=null; resolve("Update timed out"); },120000);
    window.__otaResult=function(rid,result){ if(done||rid!==id)return; done=true; clearTimeout(tm); window.__otaResult=null; resolve(String(result||"")); };
    try{ GymNative.otaCheck(id); }catch(e){ done=true; clearTimeout(tm); resolve("Update failed to start"); }
  });
}
/** Quiet check on launch, so an update does not depend on the user remembering to look.
 *  Only the ~4 KB manifest is fetched unless the version actually changed, and a new bundle
 *  is applied on the NEXT launch — never mid-session, which would leave the running JS and the
 *  installed files disagreeing. Silent on every failure: a flaky connection at the gym must
 *  never produce an error toast. */
async function otaAutoCheck(){
  try{
    const st=otaStatus(); if(!st.url)return;
    const last=+(localStorage.getItem("__otachk")||0);
    /* 15 minutes, not hours. The first version backed off to 6-hourly once a bundle was
       installed, which meant a published fix could sit unfetched for most of a day — the user
       hit exactly that: a corrected exercise photo was live for hours while their phone kept
       showing the old one, and the only way to get it was to tap Check for updates. For a
       channel whose entire purpose is shipping fixes quickly that is far too slow, and the
       cost of being wrong is one stale-looking app. The check is a ~4 KB manifest fetch, so
       effectively-every-launch is cheap; the 15-minute floor only stops rapid app switching
       from hammering it. Still 60s while nothing is installed, so first-time setup is snappy. */
    const wait=st.version?15*60*1000:60*1000;
    if(Date.now()-last<wait){ console.log("[ota] auto-check skipped (throttled)"); return; }
    localStorage.setItem("__otachk",String(Date.now()));
    const r=await otaCheckNative();
    /* Logged, not just toasted: the auto-check is deliberately silent on failure so a flaky
       gym connection never nags, which also means a genuinely broken update channel would be
       invisible. console.log reaches Logcat via the WebChromeClient, so `adb logcat -s
       GymTrackerJS` can always answer "what did the last check actually do". */
    console.log("[ota] auto-check: "+r);
    if(r.indexOf("OK ")===0)toast("App update ready — restart to apply");
  }catch(e){ console.log("[ota] auto-check threw: "+e); }
}
function openAppUpdate(){
  const st=otaStatus();
  document.getElementById("detTitle").textContent="App updates";
  document.getElementById("detBody").innerHTML=
    "<p style='color:var(--muted);margin-top:0'>Pulls a new version of the app's code straight from your server — no reinstall. Only signed updates are accepted, so a wrong or tampered file is refused.</p>"+
    "<div class='fld'><label>Update source (https)</label><input id='ota_url' placeholder='https://your-server/gymtracker/ota/' value=\""+String(st.url||"").replace(/"/g,'&quot;')+"\"></div>"+
    /* This is the FOLDER the app appends manifest.json to, not a page. Opening it in a browser
       gives 404 on most hosts (raw.githubusercontent serves no directory listings), which
       reads as "the URL is wrong" when it is perfectly fine — so show the file that is
       actually fetched, which is the thing worth testing in a browser. */
    "<p class='smartFinePrint' id='ota_hint' style='margin-top:-6px'></p>"+
    "<p style='color:var(--muted);font-size:13px'>Installed update: <b>"+esc(st.version||"none (using built-in)")+"</b><br>App build: <b>"+esc(appVer())+"</b></p>"+
    "<div class='btnrow'><button id='ota_go'>⬇️ Check for updates</button></div>"+
    "<div class='btnrow'><button class='ghost' id='ota_reset'>Revert to the built-in version</button></div>"+
    "<p class='smartFinePrint'>Exercise images and anything written in Java still come from the installed APK — those need a normal install.</p>";
  const hint=document.getElementById("ota_hint"), urlIn=document.getElementById("ota_url");
  const showHint=()=>{ const v=urlIn.value.trim();
    hint.innerHTML=v?("Checks <b>"+esc(v.replace(/\/+$/,"")+"/manifest.json")+"</b><br>The folder itself will show 404 in a browser — that is normal. Open the manifest link above to test it.")
      :"Enter the folder that contains manifest.json (the app adds the filename itself)."; };
  urlIn.oninput=showHint; showHint();
  document.getElementById("ota_go").onclick=async()=>{
    const u=document.getElementById("ota_url").value.trim();
    native("otaSetUrl",u);
    if(!u){ toast("Set an update URL first"); return; }
    toast("Checking for updates…");
    const r=await otaCheckNative();
    if(r.indexOf("OK ")===0){
      if(confirm("Update "+r.slice(3)+" downloaded and verified.\n\nRestart the app now to use it?")) location.reload();
      else toast("Update installs next time you open the app");
    } else toast(r);
  };
  document.getElementById("ota_reset").onclick=()=>{
    if(!confirm("Discard the downloaded update and go back to the version built into the app?"))return;
    native0("otaClear"); toast("Reverted — restarting"); setTimeout(()=>location.reload(),600);
  };
  detDlg.showModal();
}

/* ---------- OTA program sync (opt-in: only runs if the user has set a source URL) ---------- */
const PROG_URL_DEFAULT="";
function progUrl(){ return (localStorage.getItem("__progurl")||PROG_URL_DEFAULT||"").trim(); }
function sanitizeFocusMap(raw){
  const out={}; if(!plainObj(raw))return out;
  Object.keys(raw).slice(0,40).forEach(k=>{
    const p=sanitizeProgram({id:"focus",name:"focus",meta:{},days:[{key:"f",day:"MON",title:"FOCUS",ex:[raw[k]]}]},"focus");
    if(p&&p.days[0]&&p.days[0].ex[0]){ const x=p.days[0].ex[0]; x.forMuscles=Array.isArray(raw[k].forMuscles)?raw[k].forMuscles.map(m=>safeText(m,40)).filter(Boolean).slice(0,6):[x.m]; out[safeText(k,40)||x.m]=x; }
  });
  return out;
}
function cleanRemotePayload(d){
  if(!plainObj(d))return null;
  const out={version:safeText(d.version||d.revision,40),revision:safeText(d.revision||d.version,40),basedOn:safeText(d.basedOn,40),published:safeText(d.published,40),changes:Array.isArray(d.changes)?d.changes.map(x=>safeText(x,140)).filter(Boolean).slice(0,20):[]};
  if(plainObj(d.programs)){
    out.programs={};
    Object.keys(d.programs).slice(0,40).forEach(k=>{ const p=sanitizeProgram(d.programs[k],k); if(p)out.programs[p.id]=p; });
    if(!Object.keys(out.programs).length)delete out.programs;
  }
  if(plainObj(d.focus)){ out.focus=sanitizeFocusMap(d.focus); if(!Object.keys(out.focus).length)delete out.focus; }
  if(plainObj(d.diff)){ out.diff={}; Object.keys(d.diff).slice(0,80).forEach(k=>out.diff[safeId(k,k)]=safeText(d.diff[k],40)); }
  if(plainObj(d.icon)){ out.icon={}; Object.keys(d.icon).slice(0,80).forEach(k=>out.icon[safeId(k,k)]=safeText(d.icon[k],8)); }
  return (out.programs||out.focus||out.diff||out.icon)?out:null;
}
/** Merges (never replaces) a server-fetched programs.json onto window.PROGRAMS. This is
 *  deliberately separate from state.customPrograms/saveCustomProgram — OTA content is
 *  server-authoritative reference data, not a user edit, so it's fine for it to refresh
 *  a built-in id here. Re-applies any custom-program overlay afterward so a coach-built
 *  program the user is actively using doesn't get clobbered by the refresh. */
function applyRemote(d){ const clean=cleanRemotePayload(d); if(!clean)return false;
  if(clean.programs){
    if(clean.programs["5up"]&&state.slots){Object.keys(state.slots).forEach(k=>{if(k.indexOf("5up_")===0)delete state.slots[k];});}
    Object.assign(PROGRAMS,clean.programs); window.PROGRAMS=PROGRAMS;
    state.remoteProgramMeta=state.remoteProgramMeta||{};Object.keys(clean.programs).forEach(id=>state.remoteProgramMeta[id]={revision:clean.revision||clean.version,basedOn:clean.basedOn||null,published:clean.published||null,appliedAt:new Date().toISOString()});
  }
  if(clean.focus&&FOCUS){ Object.assign(FOCUS,clean.focus); window.FOCUS=FOCUS; }
  if(clean.diff){ Object.assign(DIFF,clean.diff); }
  if(clean.icon){ Object.assign(PROG_ICON,clean.icon); }
  applyCustomPrograms();
  return true; }
function applyPendingRemote(){try{const clean=JSON.parse(localStorage.getItem("__progpending")||"null");if(!clean){toast("No valid update pending");return;}if(typeof rememberProgramUndo==="function")rememberProgramUndo("online update");if(!applyRemote(clean)){toast("No valid update pending");return;}localStorage.setItem("__progcache",JSON.stringify(clean));localStorage.setItem("__progver",clean.version||clean.revision||"");localStorage.setItem("__progupd",String(Date.now()));localStorage.removeItem("__progpending");save();buildActive();detDlg.close();nav("plan");toast("Program update applied ✓");}catch(e){toast("Could not apply update");}}
/** Re-applies the last successfully fetched OTA payload from its localStorage cache.
 *  Called once on boot (app.js) BEFORE buildActive() — without this the cache was
 *  written but never read, so OTA-synced programs silently vanished on every restart
 *  unless the network refetch happened to succeed first (never, at the gym offline). */
function applyCachedRemotePrograms(){
  try{ const c=JSON.parse(localStorage.getItem("__progcache")||"null"); if(c)applyRemote(c); }catch(e){}
}
let _programNativePending={};
function nativeProgramText(b64){try{return decodeURIComponent(escape(atob(b64)));}catch(e){try{return atob(b64);}catch(_){return "";}}}
function nativeProgramCall(method,callback,url,timeout){
  return new Promise(resolve=>{
    const id="pg_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9);
    const timer=setTimeout(()=>{delete _programNativePending[id];resolve({status:0,text:""});},timeout||40000);
    _programNativePending[id]=(status,b64)=>{clearTimeout(timer);delete _programNativePending[id];resolve({status:+status||0,text:nativeProgramText(b64)});};
    window[callback]=function(resultId,status,b64){const fn=_programNativePending[resultId];if(fn)fn(status,b64);};
    try{GymNative[method](id,url);}catch(e){clearTimeout(timer);delete _programNativePending[id];resolve({status:0,text:""});}
  });
}
async function approvedProgramJSON(url){
  if(window.GymNative&&GymNative.approveProgramSource&&GymNative.programFetch){
    const approved=await nativeProgramCall("approveProgramSource","__programSourceApproval",url,70000);
    if(approved.status!==1)throw new Error("Source not approved");
    const result=await nativeProgramCall("programFetch","__programFetchResult",url,50000);
    if(result.status<200||result.status>=300)throw new Error("Update failed");
    return JSON.parse(result.text);
  }
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error("Update failed");
  return response.json();
}
async function fetchPrograms(loud){ const u=progUrl();
  if(!u){ if(loud)toast("Set a source URL first"); return; }
  if(loud)toast("Checking for updates…");
  try{
    const d=await approvedProgramJSON(u);
    const clean=cleanRemotePayload(d); if(!clean)throw 0;
    const prev=localStorage.getItem("__progver")||"", changed=(clean.version||clean.revision||"")!==prev;
    if(changed){localStorage.setItem("__progpending",JSON.stringify(clean));toast("Program update ready — review before applying");if(loud)openProgSync();}
    else if(loud)toast("Already up to date ✓");
  }catch(e){ if(loud)toast("Update failed — check URL / connection"); }
}
function renderCurrent(){ try{ if(activeProg&&window.PROGRAMS&&window.PROGRAMS[activeProg]) buildActive(); }catch(e){} nav(curTab||"plan"); }
function openProgSync(){ document.getElementById("detTitle").textContent="Update programs (online)";
  const ver=localStorage.getItem("__progver")||"—", upd=localStorage.getItem("__progupd");
  const when=upd?new Date(+upd).toLocaleString():"never";
  let pending=null;try{pending=JSON.parse(localStorage.getItem("__progpending")||"null");}catch(e){}
  document.getElementById("detBody").innerHTML=
    "<p style='color:var(--muted);margin-top:0'>Pull new or updated programs over the internet — no app reinstall needed. Paste the raw URL of your <b>programs.json</b>.</p>"+
    "<div class='fld'><label>Source URL</label><input id='pu_url' placeholder='https://raw.githubusercontent.com/USER/gym-programs/main/programs.json' value=\""+progUrl().replace(/"/g,'&quot;')+"\"></div>"+
    "<p style='color:var(--muted);font-size:13px'>Installed version: <b>"+ver+"</b><br>Last checked: "+when+"</p>"+(pending?"<div class='insight'><b>Update "+esc(pending.version||pending.revision||"new")+" ready</b><br>"+((pending.changes||[]).map(esc).join("<br>")||Object.keys(pending.programs||{}).length+" program(s) changed")+"</div><div class='btnrow'><button id='pu_apply'>Review complete · Apply update</button></div>":"")+
    "<div class='btnrow'><button id='pu_go'>🔄 Save & refresh now</button></div>"+
    "<div class='btnrow'><button class='ghost' id='pu_reset'>Reset to built-in programs</button></div>";
  document.getElementById("pu_go").onclick=()=>{ const u=document.getElementById("pu_url").value.trim(); if(u)localStorage.setItem("__progurl",u); else localStorage.removeItem("__progurl"); fetchPrograms(true); };
  const ap=document.getElementById("pu_apply");if(ap)ap.onclick=applyPendingRemote;
  document.getElementById("pu_reset").onclick=()=>{ if(confirm("Clear online programs and use the ones built into the app?")){ localStorage.removeItem("__progcache");localStorage.removeItem("__progver");localStorage.removeItem("__progupd");localStorage.removeItem("__progurl");native0("clearProgramSource");location.reload(); } };
  detDlg.showModal(); }
