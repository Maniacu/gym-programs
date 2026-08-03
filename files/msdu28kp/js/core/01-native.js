/* Every call into window.GymNative (the Java bridge exposed by MainActivity's Bridge
 * class) funnels through this file — no other file should reference window.GymNative
 * directly. This is what makes it possible to reason about the whole native surface
 * from one place. */

/** Fire-and-forget call, any number of arguments (spread onto the Java method call).
 *  Silently no-ops if the bridge isn't present (e.g. running in a plain browser during
 *  development) or the named method doesn't exist. */
function native(fn, ...args){ try{ if(window.GymNative&&GymNative[fn]) GymNative[fn](...args); }catch(e){} }

/** Fire-and-forget call to a zero-arg bridge method. `native(fn)` with no extra args
 *  already spreads to zero arguments and would work too — this exists so a call site
 *  reads as unambiguously zero-arg, matching the historical WebView gotcha this was
 *  written to guard against: some WebView versions fail to reflection-match a declared
 *  no-arg @JavascriptInterface method if even one (possibly `undefined`) argument is
 *  passed through a generic wrapper. */
function native0(fn){ try{ if(window.GymNative&&GymNative[fn]) GymNative[fn](); }catch(e){} }

/** Synchronous call that returns a value (e.g. readDownloadBackup(), appVersion()).
 *  Returns "" on any failure so callers never need to null-check. */
function nativeGet(fn, ...args){ try{ if(window.GymNative&&GymNative[fn]) return GymNative[fn](...args)||""; }catch(e){} return ""; }

/** Fallback for the one-time file:// -> HTTPS app-origin migration. index.html restores
 *  this before any bundle scripts so theme/units are available synchronously; keeping
 *  the guarded adapter here also makes an interrupted migration retryable. */
function restoreLegacyWebPreferences(){
  const raw=nativeGet("readLegacyWebPreferences");if(!raw)return false;
  try{
    const values=JSON.parse(raw);
    Object.keys(values).forEach(k=>localStorage.setItem(k,String(values[k])));
    if(values.gymUnit&&typeof unit!=="undefined")unit=values.gymUnit;
    if(values.gymTheme)document.documentElement.dataset.theme=values.gymTheme;
    native0("acknowledgeLegacyWebPreferences");
    return true;
  }catch(e){return false;}
}
restoreLegacyWebPreferences();

/** Wraps the native aiFetch call (POST to `url` with header `x-api-key: apiKey` and
 *  body `body`) in a Promise. aiFetch is asynchronous on the Java side (runs on a
 *  background thread) and delivers its result via a single global callback,
 *  window.__aiResult(httpStatus, base64Body) — this function is the only place that
 *  callback is wired up. Resolves to {status, data} where `data` is the parsed JSON
 *  response body (or a synthesized {error:{message}} object on any failure). Resolves
 *  (never rejects) even on network/parse errors, so callers can always read `.status`. */
function aiFetchNative(url, apiKey, body){
  return new Promise(resolve=>{
    if(!(window.GymNative&&GymNative.aiFetch)){ resolve({status:0,data:{error:{message:"Native bridge not available."}}}); return; }
    const requestId="ai_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
    let done=false, tm=null;
    let receive=null;
    const finish=r=>{ if(done)return; done=true; clearTimeout(tm); if(window.__aiResult===receive)window.__aiResult=null; resolve(r); };
    tm=setTimeout(()=>finish({status:0,data:{error:{message:"Request timed out — check your connection and try again."}}}),75000);
    receive=window.__aiResult=function(id,code,b64){
      if(id!==requestId)return;
      let txt="{}";
      try{ txt=decodeURIComponent(escape(atob(b64))); }catch(e){ try{txt=atob(b64);}catch(_){} }
      let d={}; try{ d=JSON.parse(txt); }catch(e){ d={error:{message:"Unexpected response from server."}}; }
      finish({status:code,data:d});
    };
    try{ GymNative.aiFetch(requestId,url,apiKey,body); }catch(e){ finish({status:0,data:{error:{message:"Native bridge error."}}}); }
  });
}

/** Real installed APK version name, e.g. "3.3.0". Falls back to a hardcoded string when
 *  the bridge isn't available (browser dev) — keep this in sync with app/build.gradle's
 *  versionName so a stale fallback string can't be mistaken for the real build. */
function appVer(){ return nativeGet("appVersion") || "3.52.0"; }

function nativeJSON(fn, ...args){
  const raw=nativeGet(fn,...args); if(!raw)return {};
  try{return JSON.parse(raw)||{};}catch(e){return {};}
}
function nativeB64JSON(raw){
  try{
    let txt=""; try{txt=decodeURIComponent(escape(atob(raw)));}catch(e){txt=atob(raw);}
    return JSON.parse(txt)||{};
  }catch(e){return {};}
}

/* Protect the AI key at rest and mirror the main state into an AtomicFile. Existing
 * installs are migrated only after a verified Keystore write; if hardware encryption
 * ever fails, the old value is deliberately retained so the coach is not disconnected. */
(function installProtectedNativeStorage(){
  try{
    if(typeof Storage==="undefined"||!window.localStorage)return;
    const p=Storage.prototype, get=p.getItem, set=p.setItem, remove=p.removeItem;
    if(p.__gymProtectedStorage)return;
    const hasBridge=()=>!!(window.GymNative&&GymNative.secureHasSecret);
    const legacy=get.call(localStorage,"gymAIKey");
    if(hasBridge()){
      let secured=false;try{secured=GymNative.secureHasSecret("ai_api_key")===true;}catch(e){}
      if(secured){ if(legacy)remove.call(localStorage,"gymAIKey"); }
      else if(legacy){
        let moved=false;
        try{moved=GymNative.secureSetSecret("ai_api_key",legacy)===true;}catch(e){}
        let verified=false;try{verified=GymNative.secureHasSecret("ai_api_key")===true;}catch(e){}
        if(moved&&verified)remove.call(localStorage,"gymAIKey");
      }
    }
    p.getItem=function(key){
      if(this===localStorage&&key==="gymAIKey"&&hasBridge()){
        try{if(GymNative.secureHasSecret("ai_api_key")===true)return "sk-ant-keystore-protected";}catch(e){}
      }
      const value=get.call(this,key);
      if(this===localStorage&&key==="gymTracker"&&!value&&window.GymNative&&GymNative.readStateSnapshot){
        const snapshot=nativeGet("readStateSnapshot");
        if(snapshot){try{const parsed=JSON.parse(snapshot);if(parsed&&typeof parsed==="object")return snapshot;}catch(e){}}
      }
      return value;
    };
    p.setItem=function(key,value){
      if(this===localStorage&&key==="gymAIKey"&&hasBridge()){
        let stored=false;
        try{stored=GymNative.secureSetSecret("ai_api_key",String(value))===true;}catch(e){}
        if(stored){remove.call(this,key);return;}
      }
      set.call(this,key,value);
      if(this===localStorage&&key==="gymTracker"&&window.GymNative&&GymNative.saveStateSnapshot){
        try{GymNative.saveStateSnapshot(String(value));}catch(e){}
      }
    };
    p.removeItem=function(key){
      if(this===localStorage&&key==="gymAIKey"&&window.GymNative&&GymNative.secureDeleteSecret){
        try{GymNative.secureDeleteSecret("ai_api_key");}catch(e){}
      }
      remove.call(this,key);
    };
    Object.defineProperty(p,"__gymProtectedStorage",{value:true,configurable:false});
  }catch(e){}
})();

function nativeSecretStatus(){
  if(!(window.GymNative&&GymNative.secureHasSecret))return {native:false,protected:false};
  let protectedAtRest=false;try{protectedAtRest=GymNative.secureHasSecret("ai_api_key")===true;}catch(e){}
  return {native:true,protected:protectedAtRest};
}
function nativeSnapshotStatus(){return nativeJSON("snapshotStatus");}
function nativePublicBackupStatus(){return nativeJSON("publicBackupStatus");}
function nativeHealthStatus(){return nativeJSON("healthConnectStatus");}
function nativeHealthRecovery(){
  try{return JSON.parse(localStorage.getItem("gymHealthRecovery")||"{}")||{};}catch(e){return {};}
}
function nativeReminderSettings(){
  const n=nativeJSON("reminderSettings");
  if(n&&typeof n.hour==="number")return n;
  const raw=(localStorage.getItem("gymReminderTime")||"18:00").split(":");
  return {enabled:localStorage.getItem("gymReminderEnabled")!=="0",hour:+raw[0]||18,minute:+raw[1]||0};
}
function saveNativeReminderSettings(hour,minute,enabled){
  hour=Math.max(0,Math.min(23,+hour||0)); minute=Math.max(0,Math.min(59,+minute||0));
  localStorage.setItem("gymReminderTime",String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0"));
  localStorage.setItem("gymReminderEnabled",enabled?"1":"0");
  native("syncReminderSettings",hour,minute,!!enabled);
}

let __healthRecoveryPending=null;
function requestNativeHealthRecovery(){
  if(!(window.GymNative&&GymNative.readHealthRecovery)){
    return Promise.resolve({ok:false,state:"unavailable",error:"Health Connect is available only in the Android app"});
  }
  if(__healthRecoveryPending)return __healthRecoveryPending;
  __healthRecoveryPending=new Promise(resolve=>{
    let done=false;
    const finish=result=>{if(done)return;done=true;clearTimeout(tm);__healthRecoveryPending=null;resolve(result);};
    const tm=setTimeout(()=>finish({ok:false,state:"timeout",error:"Health Connect did not respond"}),15000);
    window.__healthRecoveryResult=b64=>{
      const result=nativeB64JSON(b64);
      if(result&&result.ok)try{localStorage.setItem("gymHealthRecovery",JSON.stringify(result));}catch(e){}
      finish(result);
    };
    try{GymNative.readHealthRecovery();}catch(e){finish({ok:false,state:"error",error:"Could not start Health Connect"});}
  });
  return __healthRecoveryPending;
}
window.__healthPermissionResult=function(b64){
  const result=nativeB64JSON(b64);
  if(typeof toast==="function"&&result.ok)toast("Health Connect permissions ready");
  if(typeof renderMore==="function"&&window.curTab==="more")renderMore();
};
window.__healthPermissionStateChanged=function(b64){
  nativeB64JSON(b64);
  if(typeof renderMore==="function"&&window.curTab==="more")renderMore();
};

/* Voice commands are intentionally deterministic and local. The recognizer returns a
 * phrase; this parser maps only explicit workout/navigation commands and never sends
 * speech to the AI coach. */
function startVoiceCommand(){
  if(!(window.GymNative&&GymNative.startVoiceRecognition)){if(typeof toast==="function")toast("Voice commands need the Android app");return;}
  native("startVoiceRecognition","Say: set done, 40 kilograms 10 reps RIR 2, next exercise, or open recovery");
}
function voiceCurrentExerciseIndex(){
  try{
    const cards=[...document.querySelectorAll("#logBody .ex")];
    let i=cards.findIndex(x=>x.classList.contains("current"));
    return i<0?0:i;
  }catch(e){return 0;}
}
function voiceSetDetails(text){
  if(typeof logGetSets!=="function")return false;
  const ei=voiceCurrentExerciseIndex(),sets=logGetSets(ei),s=sets.find(x=>!x.done&&typeof setTypeOf==="function"&&setTypeOf(x)!=="warm")||sets.find(x=>!x.done);
  if(!s)return false;
  let changed=[];
  const weight=text.match(/(?:weight\s*)?(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilogram|pound|lb)/i);
  const reps=text.match(/(\d+)\s*(?:rep|reps|repetition)/i);
  const rir=text.match(/(?:rir|reps?\s+in\s+reserve)\s*(\d)/i);
  if(weight){let v=+weight[1].replace(",",".");if(/pound|lb/i.test(weight[0]))v=v/2.2046226218;s.w=v;changed.push((typeof toDisp==="function"?toDisp(s.w):s.w)+" "+(typeof unit!=="undefined"?unit:"kg"));}
  if(reps){s.r=+reps[1];changed.push(s.r+" reps");}
  if(rir){s.rir=Math.max(0,Math.min(4,+rir[1]));changed.push("RIR "+s.rir);}
  if(!changed.length)return false;
  if(typeof save==="function")save();
  if(typeof renderLog==="function")renderLog();
  if(typeof toast==="function")toast("Voice logged: "+changed.join(" · "));
  return true;
}
function handleNativeVoiceCommand(phrase){
  const text=String(phrase||"").trim().toLowerCase();
  if(!text)return false;
  const active=!!(document.getElementById("logView")&&document.getElementById("logView").classList.contains("on"));
  if(active&&voiceSetDetails(text))return true;
  if(active&&(/^(set )?(done|complete)$/.test(text)||/(log|complete|mark).*(set)|set.*(done|complete)/.test(text))){
    if(typeof notifSetDone==="function"){notifSetDone();if(typeof toast==="function")toast("Set completed");return true;}
  }
  if(active&&/(undo|unmark).*(set)/.test(text)&&typeof logDay==="function"){
    const day=logDay();for(let ei=day.ex.length-1;ei>=0;ei--){const sets=logGetSets(ei);for(let i=sets.length-1;i>=0;i--)if(sets[i].done){sets[i].done=false;save();renderLog();toast("Last set reopened");return true;}}
  }
  if(active&&/(skip).*(exercise|movement)/.test(text)&&typeof skipExerciseToday==="function"){skipExerciseToday(voiceCurrentExerciseIndex());return true;}
  if(active&&/(next).*(exercise|movement)/.test(text)){
    const card=document.querySelector("#logBody .ex.current");if(card){card.scrollIntoView({behavior:"smooth",block:"start"});if(typeof toast==="function")toast("Showing current exercise");return true;}
  }
  if(active&&/(finish|end).*(workout|session)/.test(text)&&typeof finishWorkout==="function"){finishWorkout();return true;}
  if(active&&/(add|plus).*(15|fifteen).*(rest|second)/.test(text)&&typeof restEnd!=="undefined"){restEnd+=15000;if(typeof updTimer==="function")updTimer();native("scheduleRest",Math.max(1,Math.round((restEnd-Date.now())/1000)));toast("Rest +15 seconds");return true;}
  if(active&&/(skip|stop|cancel).*(rest|timer)/.test(text)&&typeof hideTimer==="function"){hideTimer();toast("Rest skipped");return true;}
  if(/(start|begin).*(workout|session)/.test(text)&&typeof openLog==="function"){openLog();return true;}
  const routes=[[/recover/,"recovery"],[/(progress|history|calendar)/,"workouts"],[/(train|today|plan)/,"plan"],[/exercise library|library/,"exercises"],[/(settings|preferences)/,"more"]];
  for(const r of routes)if(r[0].test(text)&&typeof nav==="function"){nav(r[1]);return true;}
  if(/(coach|assistant|ai)/.test(text)&&typeof openChat==="function"){openChat();return true;}
  if(typeof toast==="function")toast("Command not recognised · try “set done” or “open recovery”");
  return false;
}
window.__nativeVoiceResult=function(b64){
  const result=nativeB64JSON(b64);
  if(result.ok)handleNativeVoiceCommand(result.text);
  else if(!result.cancelled&&typeof toast==="function")toast(result.error||"Voice command failed");
};
function installNativeVoiceButton(){
  try{
    const head=document.querySelector("#logView .loghd");if(!head||document.getElementById("nativeVoiceBtn"))return;
    const b=document.createElement("button");b.id="nativeVoiceBtn";b.type="button";b.textContent="🎙";
    b.setAttribute("aria-label","Workout voice commands");b.title="Voice commands";
    b.style.cssText="min-width:42px;height:42px;border:1px solid var(--line);border-radius:50%;background:var(--card);color:var(--txt);font-size:19px";
    b.onclick=startVoiceCommand;head.appendChild(b);
  }catch(e){}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installNativeVoiceButton);else setTimeout(installNativeVoiceButton,0);
