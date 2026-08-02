/* Bootstrap: router + boot sequence. Loaded last — every other file's globals already
 * exist by the time any of this actually runs (nav() and the boot IIFE below are only
 * ever invoked after all scripts have finished executing top-to-bottom). */

/* ---------- render error boundary ----------
 * Every render path derives its content from stored history, so one malformed record
 * (an old backup, a half-written session) can throw deep inside a helper. Without a
 * boundary that exception escapes nav() and the tab is left literally blank — no text,
 * no controls, no way back. Catch it, keep the app navigable, and put the two things
 * that actually recover the situation on screen. The console.error also reaches Logcat
 * under GymTrackerJS, so a real failure can be pulled off the phone over adb. */
function renderFailureHTML(tab,err){
  return "<main class='renderFail'><h2>This screen could not be drawn</h2>"+
    "<p>Something in the saved data for this tab could not be read. The rest of the app still works, and nothing has been deleted.</p>"+
    "<div class='btnrow'><button onclick=\"nav('plan')\">Go to Train</button>"+
    "<button class='ghost' onclick=\"openBackup()\">Backup &amp; restore</button></div>"+
    "<details><summary>Technical detail</summary><code>"+esc(tab+": "+((err&&err.message)||err))+"</code></details></main>";
}
function renderTab(t){
  const R={plan:renderPlan,recovery:renderRecovery,workouts:renderWorkouts,exercises:renderExercises,stats:renderStats,more:renderMore};
  const fn=R[t]; if(!fn)return;
  try{ fn(); }
  catch(err){
    console.error("render failed for tab "+t,err);
    const v=document.getElementById("v-"+t);
    if(v)v.innerHTML=renderFailureHTML(t,err);
  }
}
function nav(t){ if(t==="coach"){document.querySelectorAll("#bnav button").forEach(b=>b.classList.toggle("on",b.dataset.v==="coach"));openChat();return;} curTab=t;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("on"));
  document.getElementById("v-"+t).classList.add("on");
  document.querySelectorAll("#bnav button").forEach(b=>b.classList.toggle("on",b.dataset.v===t));
  renderTab(t);
  window.scrollTo(0,0);
}
/* Anything that still slips through — an async callback, a handler outside a render —
 * gets surfaced instead of failing silently. Toast only: these are usually recoverable
 * and a dialog mid-workout would be worse than the bug. */
/* typeof-guarded the same way 02-state.js guards its pagehide/visibilitychange listeners:
   this file also runs under the headless smoke harness, whose window is a plain object. */
if(typeof window.addEventListener==="function"){
  window.addEventListener("error",function(e){ console.error("uncaught",(e&&e.error)||(e&&e.message)); if(typeof toast==="function")toast("Something went wrong — your data is safe"); });
  window.addEventListener("unhandledrejection",function(e){ console.error("unhandled rejection",e&&e.reason); });
}
document.querySelectorAll("#bnav button").forEach(b=>b.onclick=()=>nav(b.dataset.v));
(function(){ const M={plan:"barbell",recovery:"heartbeat",workouts:"calendar",exercises:"search",stats:"chart-line",more:"settings",coach:"sparkles"};
  document.querySelectorAll("#bnav button").forEach(b=>{ const el=b.querySelector(".ic"); if(el&&M[b.dataset.v])el.innerHTML=icon(M[b.dataset.v],23); }); })();

/* ---------- hardware back + dialog stack tracking ---------- */
window.__dlgStack=[];
(function(){
  const p=HTMLDialogElement.prototype,sm=p.showModal,cl=p.close;
  p.showModal=function(){ if(!this.open)sm.call(this); window.__dlgStack=window.__dlgStack.filter(d=>d!==this); window.__dlgStack.push(this); };
  p.close=function(v){ if(this.id==="detDlg")stopDemo(); if(this.open)cl.call(this,v); window.__dlgStack=window.__dlgStack.filter(d=>d!==this); };
})();
window.handleBack=function(){
  const onb=document.getElementById("onb"); if(onb.classList.contains("on")){ if(obStep>0){obStep--;obRender();} return true; }
  if(window.__dlgStack.length){ const t=window.__dlgStack[window.__dlgStack.length-1]; if(t.id==="lvlDlg")closeLevel(); else t.close(); return true; }
  if(document.getElementById("timer").classList.contains("on")){ hideTimer(); return true; }
  if(document.getElementById("chatView").classList.contains("on")){ closeChat(); return true; }
  if(document.getElementById("logView").classList.contains("on")){ closeLog(); return true; }
  if(curTab!=="plan"){ nav("plan"); return true; }
  return false;
};
setInterval(tickFinish,1000);

/* ---------- bootstrap ---------- */
applyCachedRemotePrograms(); /* re-apply last OTA sync from cache (works offline) — runs
  first so applyCustomPrograms afterwards keeps its "custom overlay wins" guarantee */
applyCustomPrograms(); /* restore AI/user-built programs on launch — the only call site */
applyCustomExercises(); /* merge user-created exercises into LIB */
function finishStateBootstrap(){
  if(!state.programId){ if(!tryAutoRestore()) openOnboard(false); }
  else { buildActive(); nav("plan"); }
}
if(window.__durableBootPromise&&typeof window.__durableBootPromise.then==="function")
  window.__durableBootPromise.then(finishStateBootstrap).catch(finishStateBootstrap);
else finishStateBootstrap();
/* background refresh on launch (no-op unless the user has set an OTA source URL) */
setTimeout(()=>{ try{ fetchPrograms(false); }catch(e){} },800);
/* same for the app's own code — runs after the boot-ok watchdog below has had time to fire,
   so a bundle is never fetched on top of a launch that has not yet proven itself */
setTimeout(()=>{ try{ otaAutoCheck(); }catch(e){} },9000);
/* Refresh already-authorized Health Connect recovery observations quietly. Permissions
   are never requested here; the user explicitly connects them in Settings. */
setTimeout(()=>{
  try{
    const hs=typeof nativeHealthStatus==="function"?nativeHealthStatus():{};
    const cached=typeof nativeHealthRecovery==="function"?nativeHealthRecovery():{};
    const stale=!cached.readAt||(Date.now()-Number(cached.readAt)>6*3600*1000);
    if(hs.permissionGranted&&stale&&typeof requestNativeHealthRecovery==="function"){
      requestNativeHealthRecovery().then(()=>{if(curTab==="recovery")renderRecovery();else if(curTab==="plan")renderPlan();});
    }
  }catch(e){}
},1400);
/* OTA rollback watchdog: confirm to native that this build actually booted. Until this
   fires, the next launch discards the downloaded bundle and falls back to the assets baked
   into the APK — so a broken update costs one restart instead of bricking the app. The delay
   is deliberate: it has to outlast the initial render, or a bundle that throws slightly later
   would still be marked good. Nothing above may depend on this call. */
setTimeout(()=>{ try{ native0("otaBootOk"); }catch(e){} },5000);
/* refresh the Downloads auto-backup on every launch too, so it reflects current data
   even if the last session made changes without ever hitting save() again afterwards */
if(state.programId)autoBackup();
/* tell native the current theme so the next cold start paints the right background */
native("setNativeTheme",theme()==="dark");
/* Auto theme: follow live system dark-mode changes while no manual choice is stored */
try{ if(window.matchMedia)matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{ if(themePref()==="auto")applyAutoTheme(); }); }catch(e){}
