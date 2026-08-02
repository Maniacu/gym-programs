/* More tab: settings rows (profile, program, priorities, equipment, units, shape goals,
 * readiness, rotations, timeline, plan audit), AI Coach/bodyweight/bench-angle entry
 * points, Health Connect, and backup/program-sync entry points. */
function row(ic,t,val,fn){ const g=IC[ic]?icon(ic,21):ic,action=String(fn||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;");
  return "<div class='srow' role='button' tabindex='0' aria-label='"+escAttr(t+(val?" · "+val:""))+"' onclick=\""+action+"\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();"+action+"}\"><div class='si' aria-hidden='true'>"+g+"</div><div class='st'>"+t+"</div><div class='sv'>"+val+"</div><div class='sv' aria-hidden='true'>›</div></div>"; }
function themeRow(){ const g=icon("adjustments-horizontal",21), p=themePref();
  return "<div class='srow'><div class='si' aria-hidden='true'>"+g+"</div><div class='st'>Appearance</div><div class='themeToggle' id='themeToggle' role='group' aria-label='Appearance'><button class='"+(p==="light"?"on":"")+"' aria-pressed='"+(p==="light")+"' data-t='light'>Light</button><button class='"+(p==="dark"?"on":"")+"' aria-pressed='"+(p==="dark")+"' data-t='dark'>Dark</button><button class='"+(p==="auto"?"on":"")+"' aria-pressed='"+(p==="auto")+"' data-t='auto'>Auto</button></div></div>"; }
function settingsSection(id,title,body){return "<section aria-labelledby='"+id+"' style='margin:0 0 20px'><h2 id='"+id+"' style='font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 4px 8px'>"+title+"</h2><div class='slist'>"+body+"</div></section>";}
function reminderLabel(){const r=nativeReminderSettings();return r.enabled?(String(r.hour).padStart(2,"0")+":"+String(r.minute).padStart(2,"0")):"Off";}
function healthLabel(){const h=nativeHealthStatus();if(!h.available)return h.state==="update_required"?"Update required":"Unavailable";return h.permissionGranted?"Recovery connected":"Permission needed";}
function snapshotLabel(){const s=nativeSnapshotStatus();return s.available?"Protected · rev "+(s.revision||1):"Ready";}
function voiceLabel(){return nativeGet("voiceStatus")==="available"?"Available":"Unavailable";}
function aiSecurityLabel(){const s=nativeSecretStatus();return aiKey()?(s.protected?"Anthropic · protected":"Anthropic · connected"):"Anthropic · set up";}
function aiModelLabel(){return aiModel().replace(/^claude-/,"").replace(/-/g," ");}
function privacyLabel(){const p=typeof aiPrivacyPrefs==="function"?aiPrivacyPrefs():{consent:false};return p.consent?"AI consent set":"Review";}

function renderMore(){
  const v=document.getElementById("v-more"), pr=getPriority();
  const eq=profile&&profile.equip?(profile.equip==="db"?"Dumbbells":profile.equip==="home"?"Home":"Full gym"):"Full gym";
  v.innerHTML="<div class='topbar'><div class='t'>Settings</div><div class='r'>YOUR TRAINING</div></div><main>"+
    settingsSection("settings-training","Training",
      row("user","Personal details",(profile&&profile.age?profile.age+" yrs":"Edit"),"editProfile()")+
      row("calendar","Program & days",(PROGRAMS[activeProg]?PROGRAMS[activeProg].name:""),"editDays()")+
      row("target","Training priorities",pr.slice(0,2).join(", "),"openPrio()")+
      row("barbell","Equipment",eq,"editEquip()")+
      row("target","Shape goals",shapeGoals().length+" selected","openShapeGoals()")+
      row("heartbeat","Readiness check",(readinessScore()?readinessScore()+"/5":"Today"),"openReadiness()")+
      row("refresh","Exercise rotations","","openRotationPlanner()")+
      row("shuffle","Exercise variability",variabilityLabel(),"openVariabilitySettings()")+
      row("clipboard-check","Plan audit","weekly sets","openPlanAudit()"))+
    settingsSection("settings-workout","Workout experience",
      row("clock","Rest timer",(restAutoStart()?"":"Manual · ")+({short:"Short",standard:"Standard",long:"Long"}[restStyle()]),"openRestSettings()")+
      row("clock","Training reminders",reminderLabel(),"openReminderSettings()")+
      row("bolt","Voice commands",voiceLabel(),"openVoiceSettings()")+
      row("adjustments-horizontal","Units",unit.toUpperCase(),"toggleUnit()")+
      themeRow()+
      row("ruler-2","Bench angle level","30° incline","openLevel(null)"))+
    settingsSection("settings-intelligence","Intelligence & integrations",
      row("sparkles","AI Coach",aiSecurityLabel(),"openChat()")+
      row("adjustments-horizontal","AI model",aiModelLabel(),"openAIModelSettings()")+
      row("heart-rate-monitor","Health Connect",healthLabel(),"openHealthIntegration()")+
      row("cloud-download","On-device recovery",snapshotLabel(),"openDeviceRecovery()"))+
    settingsSection("settings-library","Progress & planning",
      row("search","Exercise library",LIB.length+" exercises","nav('exercises')")+
      row("scale","Bodyweight","","openBw()")+
      row("timeline","Progress timeline","","openProgressTimeline()")+
      row("ruler-2","Measurements/photos","","openMeasurements()")+
      row("calendar","Weekly review","","openWeeklyReview()")+
      row("books","Program library",TEMPLATES.length+" plans","openTemplates()")+
      row("timeline","Program versions","","openVersions()"))+
    settingsSection("settings-data","Data & app",
      row("adjustments-horizontal","Privacy & AI data",privacyLabel(),"openAIPrivacySettings()")+
      row("cloud-download","Share backup","Drive / Files","shareBackupCloud()")+
      row("cloud-download","Backup & restore","","openBackup()")+
      row("refresh","Update programs",(localStorage.getItem("__progver")||"online"),"openProgSync()")+
      row("cloud-download","App updates",(otaStatus().version?"updated":"built-in"),"openAppUpdate()")+
      row("share","Share progress","","shareProg()")+
      row("file-export","Export CSV","","exportCSV()")+
      row("settings","Re-run full setup","","openOnboard(true)"))+
    "<div style='text-align:center;color:var(--muted);font-size:11px;padding:8px 0 4px'>GymTracker v"+appVer()+" · "+(window.GymNative?"Android integrations active":"Browser preview")+"</div></main>";
  document.querySelectorAll("#themeToggle button").forEach(b=>b.onclick=()=>{ if(themePref()===b.dataset.t)return; setThemePref(b.dataset.t); renderMore(); toast("Theme: "+(b.dataset.t==="auto"?"Follow system":b.dataset.t==="dark"?"Dark":"Light")); });
}

function toggleUnit(){ unit=unit==="kg"?"lb":"kg"; localStorage.setItem("gymUnit",unit); renderMore(); toast("Units: "+unit.toUpperCase()); }

function openReminderSettings(){
  const r=nativeReminderSettings(),time=String(r.hour).padStart(2,"0")+":"+String(r.minute).padStart(2,"0");
  document.getElementById("detTitle").textContent="Training reminders";
  document.getElementById("detBody").innerHTML=
    "<p style='color:var(--muted);margin-top:0'>On scheduled training days, remind me only if I have not finished a workout.</p>"+
    "<div class='fld'><label for='reminderTime'>Reminder time</label><input id='reminderTime' type='time' value='"+time+"'></div>"+
    "<label style='display:flex;gap:10px;align-items:center;padding:12px 2px'><input id='reminderEnabled' type='checkbox'"+(r.enabled?" checked":"")+"><span>Enable training-day reminders</span></label>"+
    "<div class='btnrow'><button id='reminderSave'>Save reminder</button></div>";
  document.getElementById("reminderSave").onclick=()=>{
    const parts=(document.getElementById("reminderTime").value||"18:00").split(":");
    const enabled=document.getElementById("reminderEnabled").checked;
    saveNativeReminderSettings(+parts[0],+parts[1],enabled);
    detDlg.close();renderMore();toast(enabled?"Reminder set for "+parts.join(":"):"Reminders turned off");
  };
  detDlg.showModal();
}

function openVoiceSettings(){
  const available=nativeGet("voiceStatus")==="available";
  document.getElementById("detTitle").textContent="Voice commands";
  document.getElementById("detBody").innerHTML=
    "<div class='insight'><b>"+(available?"Available on this phone":"Speech recognizer unavailable")+"</b><br><span style='color:var(--muted)'>GymTracker receives only the recognized phrase; it does not record or store microphone audio.</span></div>"+
    "<p>During a workout, tap the microphone beside the workout timer and say:</p>"+
    "<ul style='line-height:1.9;color:var(--muted)'><li>“Set done” or “undo set”</li><li>“40 kilograms, 10 reps, RIR 2”</li><li>“Next exercise” or “skip exercise”</li><li>“Add 15 seconds rest” or “skip timer”</li><li>“Finish workout” or “open recovery”</li></ul>"+
    (available?"<div class='btnrow'><button id='voiceTry'>Try a command</button></div>":"");
  const b=document.getElementById("voiceTry");if(b)b.onclick=startVoiceCommand;
  detDlg.showModal();
}

function openAIModelSettings(){
  const current=aiModel(),sec=nativeSecretStatus();
  const models=[
    ["claude-opus-5","Claude Opus 5","Deepest reasoning · best for building a program"],
    ["claude-sonnet-5","Claude Sonnet 5","Best balance for daily coaching"],
    ["claude-haiku-4-5","Claude Haiku 4.5","Fastest · lowest cost"]
  ];
  document.getElementById("detTitle").textContent="AI model & security";
  document.getElementById("detBody").innerHTML=
    "<div class='insight'><b>Provider: Anthropic</b><br>API key: "+(aiKey()?(sec.protected?"protected by Android Keystore":"connected"):"not configured")+"</div>"+
    "<p style='color:var(--muted)'>Choose the preferred model. The coach can fall back automatically if that model is unavailable.</p>"+
    models.map(m=>"<div class='opt"+(m[0]===current?" cur":"")+"' data-model='"+m[0]+"' role='button' tabindex='0'><div class='o'><div class='t'>"+m[1]+"</div><div class='s'>"+m[2]+"</div></div>"+(m[0]===current?"<span class='tag'>CURRENT</span>":"")+"</div>").join("")+
    "<div class='btnrow'><button class='ghost' id='openAIConnection'>Manage API key</button></div>";
  document.querySelectorAll("#detBody [data-model]").forEach(el=>{
    const choose=()=>{localStorage.setItem("gymAIModel",el.dataset.model);renderMore();openAIModelSettings();toast("Preferred AI model saved");};
    el.onclick=choose;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose();}};
  });
  document.getElementById("openAIConnection").onclick=()=>{detDlg.close();openChat();};
  detDlg.showModal();
}

function openAIPrivacySettings(){
  const p=typeof aiPrivacyPrefs==="function"?aiPrivacyPrefs():{consent:false,profile:true,history:true,health:false};
  const b=nativePublicBackupStatus();
  document.getElementById("detTitle").textContent="Privacy & AI data";
  document.getElementById("detBody").innerHTML=
    "<div class='insight'><b>Local by default</b><br><span style='color:var(--muted)'>Workouts stay on this phone. Coach sends data only when you press Send; its network bridge is locked to Anthropic's exact HTTPS messages endpoint.</span></div>"+
    "<p style='color:var(--muted);font-size:13px'>A Coach request always includes your message, recent Coach conversation and current program so edits can be validated. Choose the extra context below.</p>"+
    "<label style='display:flex;gap:10px;align-items:flex-start;padding:9px 2px'><input id='privacyConsent' type='checkbox'"+(p.consent?" checked":"")+"><span><b>Allow AI Coach requests</b><br><small style='color:var(--muted)'>Send allowed context to Anthropic only when I use Coach.</small></span></label>"+
    "<label style='display:flex;gap:10px;align-items:flex-start;padding:9px 2px'><input id='privacyProfile' type='checkbox'"+(p.profile?" checked":"")+"><span>Personal details, goals and equipment</span></label>"+
    "<label style='display:flex;gap:10px;align-items:flex-start;padding:9px 2px'><input id='privacyHistory' type='checkbox'"+(p.history?" checked":"")+"><span>Workout history, readiness and session notes</span></label>"+
    "<label style='display:flex;gap:10px;align-items:flex-start;padding:9px 2px'><input id='privacyHealth' type='checkbox'"+(p.health?" checked":"")+"><span>Health Connect sleep, resting HR and HRV context</span></label>"+
    "<hr style='border:0;border-top:1px solid var(--line);margin:14px 0'>"+
    "<label style='display:flex;gap:10px;align-items:flex-start;padding:9px 2px'><input id='privacyPublicBackup' type='checkbox'"+(b.enabled?" checked":"")+(!b.supported?" disabled":"")+"><span><b>Automatic Downloads backup</b><br><small style='color:var(--muted)'>Off by default. If enabled, a readable JSON copy is visible in Downloads and may survive uninstall. Internal recovery remains automatic either way.</small></span></label>"+
    (b.privateLegacyRecovery?"<p style='font-size:12px;color:var(--muted)'>Your old automatic public backup was moved into private on-device recovery.</p>":"")+
    "<div class='btnrow'><button id='privacySave'>Save privacy choices</button></div>";
  document.getElementById("privacySave").onclick=()=>{
    localStorage.setItem("gymAIConsent",document.getElementById("privacyConsent").checked?"1":"0");
    localStorage.setItem("gymAIShareProfile",document.getElementById("privacyProfile").checked?"1":"0");
    localStorage.setItem("gymAIShareHistory",document.getElementById("privacyHistory").checked?"1":"0");
    localStorage.setItem("gymAIShareHealth",document.getElementById("privacyHealth").checked?"1":"0");
    const publicBackup=document.getElementById("privacyPublicBackup").checked;
    native("setPublicBackupEnabled",publicBackup);
    if(publicBackup&&typeof autoBackup==="function")autoBackup();
    detDlg.close();renderMore();toast("Privacy choices saved");
  };
  detDlg.showModal();
}

function healthRecoverySummary(data){
  if(!data||!data.ok)return "No recovery readings saved yet.";
  const bits=[];if(data.sleepHours!=null)bits.push(data.sleepHours+" h sleep");if(data.restingHeartRate!=null)bits.push(data.restingHeartRate+" bpm resting HR");if(data.hrvRmssd!=null)bits.push(data.hrvRmssd+" ms HRV");
  return bits.length?bits.join(" · "):"Connected, but no recent sleep/heart readings were found.";
}
function openHealthIntegration(){
  const h=nativeHealthStatus(),data=nativeHealthRecovery();
  document.getElementById("detTitle").textContent="Health Connect";
  document.getElementById("detBody").innerHTML=
    "<div class='insight'><b>"+healthLabel()+"</b><br><span style='color:var(--muted)'>"+healthRecoverySummary(data)+"</span></div>"+
    "<p style='color:var(--muted)'>Optional sleep, resting-heart-rate and HRV readings can improve recovery context. They remain estimates, never medical measurements.</p>"+
    "<div class='btnrow'><button id='healthConnectBtn'>"+(h.permissionGranted?"Review permissions":"Connect & grant access")+"</button><button class='s' id='healthRefreshBtn'"+(!h.permissionGranted?" disabled":"")+">Refresh recovery</button></div>";
  document.getElementById("healthConnectBtn").onclick=()=>{native0("openHealthConnect");toast(h.available?"Opening Health Connect permissions":"Opening Health Connect setup");};
  document.getElementById("healthRefreshBtn").onclick=async()=>{
    const b=document.getElementById("healthRefreshBtn");b.disabled=true;b.textContent="Reading…";
    const result=await requestNativeHealthRecovery();
    if(result.ok){toast("Recovery readings updated");openHealthIntegration();renderMore();}
    else{b.disabled=false;b.textContent="Refresh recovery";toast(result.error||"No recovery data available");}
  };
  detDlg.showModal();
}

function restoreNativeSnapshot(previous){
  const raw=nativeGet(previous?"readPreviousStateSnapshot":"readStateSnapshot");
  if(!raw){toast("No snapshot is available");return;}
  try{JSON.parse(raw);}catch(e){toast("Snapshot could not be verified");return;}
  if(!confirm("Restore the "+(previous?"previous":"latest")+" on-device snapshot? Your current app state will be replaced."))return;
  try{restoreBackupText(raw);detDlg.close();toast("On-device snapshot restored");}catch(e){toast("Snapshot could not be restored");}
}
function openDeviceRecovery(){
  const s=nativeSnapshotStatus(),when=s.savedAt?new Date(s.savedAt).toLocaleString():"Not saved yet";
  document.getElementById("detTitle").textContent="On-device recovery";
  document.getElementById("detBody").innerHTML=
    "<div class='insight'><b>"+(s.available?"Atomic snapshot protected":"Snapshot system ready")+"</b><br><span style='color:var(--muted)'>Last save: "+esc(when)+" · revision "+(s.revision||0)+"</span></div>"+
    "<p style='color:var(--muted)'>A second internal copy protects workout state if WebView storage is damaged. It is restored automatically only when normal storage is missing.</p>"+
    "<p style='font-size:12px;color:var(--muted)'>Sync identity: "+esc((s.deviceId||"local").slice(0,8))+"… · local-only transport. No account or external server is connected.</p>"+
    "<div class='btnrow'><button id='snapNow'>Save now</button><button class='s' id='snapRestore'"+(!s.available?" disabled":"")+">Restore latest</button></div>"+
    (s.previousAvailable?"<div class='btnrow'><button class='ghost' id='snapPrevious'>Restore previous version</button></div>":"");
  document.getElementById("snapNow").onclick=()=>{native("saveStateSnapshot",JSON.stringify(state));toast("Protected snapshot queued");};
  document.getElementById("snapRestore").onclick=()=>restoreNativeSnapshot(false);
  const p=document.getElementById("snapPrevious");if(p)p.onclick=()=>restoreNativeSnapshot(true);
  detDlg.showModal();
}

/* Rest-timer preferences: auto-start on/off + a length style that scales the per-exercise
   rest heuristic (Short 0.7× / Standard / Long 1.3×). Example durations shown live so the
   choice is concrete, not abstract. */
/* How much the trainer explores new movements versus committing to the ones already in
   the plan. Drives the exploration term in exerciseSelectionScore: "More consistent"
   turns exploration off entirely so ranking sticks with proven lifts. */
function variabilityLabel(){
  return {consistent:"More consistent",balanced:"Balanced",variable:"More variable"}[smartVariability()]||"Balanced";
}
function openVariabilitySettings(){
  document.getElementById("detTitle").textContent="Exercise variability";
  const opts=[
    ["consistent","More consistent","Stick with the same lifts to maximise measurable progress"],
    ["balanced","Balanced","Progress on your main lifts, rotate the accessories"],
    ["variable","More variable","Rotate movements often to keep training fresh"]];
  const render=()=>{
    const cur=smartVariability();
    document.getElementById("detBody").innerHTML=
      "<p style='color:var(--muted);margin:2px 2px 12px;font-size:13px'>How readily the trainer suggests swapping to an untried exercise. Whatever you pick, a lift that is still adding load is defended, and one is never judged before "+SMART_MIN_EVAL_SESSIONS+" sessions.</p>"+
      opts.map(o=>"<div class='opt"+(cur===o[0]?" cur":"")+"' data-vr='"+o[0]+"'><div class='o'><div class='t'>"+o[1]+"</div><div class='s'>"+o[2]+"</div></div>"+(cur===o[0]?"<span class='tag'>ON</span>":"")+"</div>").join("");
    document.querySelectorAll("#detBody [data-vr]").forEach(el=>el.onclick=()=>{
      profile=profile||{};profile.exerciseVariability=el.dataset.vr;state.profile=profile;save();
      render();renderMore();toast("Variability: "+el.dataset.vr);
    });
  };
  render(); detDlg.showModal();
}
function openRestSettings(){
  document.getElementById("detTitle").textContent="Rest timer";
  const styles=[["short","Short","faster pace, more density"],["standard","Standard","balanced (default)"],["long","Long","heavy strength work"]];
  const ex=o=>fmt(restFor(o)); // depends on current style at render; recompute after change
  const render=()=>{
    const cur=restStyle();
    document.getElementById("detBody").innerHTML=
      "<div class='srow' style='cursor:pointer' onclick='toggleRestAuto()'><div class='st'>Auto-start after each set</div><div class='sv'>"+(restAutoStart()?"On":"Off")+"</div></div>"+
      "<p style='color:var(--muted);margin:14px 2px 8px;font-size:13px'>Rest length</p>"+
      styles.map(s=>"<div class='opt"+(cur===s[0]?" cur":"")+"' data-rs='"+s[0]+"'><div class='o'><div class='t'>"+s[1]+"</div><div class='s'>"+s[2]+"</div></div>"+(cur===s[0]?"<span class='tag'>ON</span>":"")+"</div>").join("")+
      "<p style='color:var(--muted);margin-top:10px;font-size:12px'>With this setting: heavy 6-rep sets rest ~"+ex({r:"4 x 5-6"})+", 8–12 rep work ~"+ex({r:"3 x 8-12"})+", pump/15+ ~"+ex({r:"3 x 15-20"})+". Tap +15s/−15s live to fine-tune any rest.</p>";
    document.querySelectorAll("#detBody [data-rs]").forEach(el=>el.onclick=()=>{ localStorage.setItem("gymRestStyle",el.dataset.rs); render(); renderMore(); toast("Rest: "+el.dataset.rs); });
  };
  window.toggleRestAuto=()=>{ localStorage.setItem("gymRestAuto",restAutoStart()?"0":"1"); render(); renderMore(); };
  render(); detDlg.showModal();
}

function editProfile(){ profile=profile||{};
  document.getElementById("detTitle").textContent="Personal details";
  document.getElementById("detBody").innerHTML=
    "<div class='fld'><label>Sex</label><div class='segm' id='ep_sx'><button data-v='M'>Male</button><button data-v='F'>Female</button></div></div>"+
    "<div class='fld'><label>Age</label><input id='ep_a' inputmode='numeric' value='"+(profile.age||"")+"'></div>"+
    "<div class='fld'><label>Height (cm)</label><input id='ep_h' inputmode='numeric' value='"+(profile.height||"")+"'></div>"+
    "<div class='fld'><label>Weight ("+unit+")</label><input id='ep_w' inputmode='decimal' value='"+(profile.weight!=null?toDisp(profile.weight):"")+"'></div>"+
    "<div class='fld'><label>Activity level <span style='color:var(--muted);font-weight:400'>(for calorie estimates)</span></label><select id='ep_act' style='width:100%;height:46px;background:var(--card2);border:1px solid var(--line);border-radius:12px;color:var(--txt);padding:0 12px;font-size:15px'>"+ACTIVITY_FACTORS.map(a=>"<option value='"+a[0]+"'"+((""+(profile.activity||1.55))===a[0]?" selected":"")+">"+esc(a[1])+"</option>").join("")+"</select></div>"+
    "<div class='btnrow'><button id='ep_save'>Save</button></div>";
  const sx=document.getElementById("ep_sx"); sx.querySelectorAll("button").forEach(b=>{ if(b.dataset.v===(profile.sex||"M"))b.classList.add("on"); b.onclick=()=>{sx.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");}; });
  document.getElementById("ep_save").onclick=()=>{ profile.sex=sx.querySelector(".on").dataset.v; profile.age=+document.getElementById("ep_a").value||null; profile.height=+document.getElementById("ep_h").value||null; profile.activity=+document.getElementById("ep_act").value||1.55; const w=toKg(document.getElementById("ep_w").value); if(w)profile.weight=w; state.profile=profile; if(w){state.bodyweightLog=state.bodyweightLog||[];const t=todayStr();const e=state.bodyweightLog.find(x=>x.date===t);if(e)e.kg=w;else state.bodyweightLog.push({date:t,kg:w}); native("logHealthWeight",w,Date.now());} save(); detDlg.close(); renderMore(); toast("Saved"); };
  detDlg.showModal(); }

function editDays(){ document.getElementById("detTitle").textContent="Program & days";
  document.getElementById("detBody").innerHTML="<p style='color:var(--muted);margin-top:0'>Pick your weekly split — your logs are kept.</p>"+
    Object.keys(PROGRAMS).map(pid=>{const p=PROGRAMS[pid];return "<div class='opt"+(pid===activeProg?" cur":"")+"' data-p='"+pid+"'><div class='o'><div class='t'>"+p.name+"</div><div class='s'>"+DIFF[pid]+" · "+p.meta.days+" days · "+p.meta.type+"</div></div>"+(pid===activeProg?"<span class='tag'>CURRENT</span>":"")+"</div>";}).join("");
  document.querySelectorAll("#detBody .opt").forEach(el=>el.onclick=()=>{ setProgram(el.dataset.p); detDlg.close(); });
  detDlg.showModal(); }

function editEquip(){ document.getElementById("detTitle").textContent="Equipment";
  document.getElementById("detBody").innerHTML="<p style='color:var(--muted);margin-top:0'>We auto-pick variations you can do.</p>"+
    OB_EQ.map(q=>"<div class='opt"+((profile&&profile.equip||"full")===q.v?" cur":"")+"' data-v='"+q.v+"'><div class='o'><div class='t'>"+q.t+"</div><div class='s'>"+q.d+"</div></div></div>").join("");
  document.querySelectorAll("#detBody .opt").forEach(el=>el.onclick=()=>{ profile=profile||{}; profile.equip=el.dataset.v; state.profile=profile; save(); detDlg.close(); renderMore(); toast("Equipment updated"); });
  detDlg.showModal(); }

/* ---------- training priorities ---------- */
let _pr=null;
function openPrio(){ _pr=getPriority().slice(); renderPrioBody(); prioDlg.showModal(); }
function renderPrioBody(){ const n=_pr.length;
  document.getElementById("prioBody").innerHTML="<p style='color:var(--muted);margin-top:0'>Order 1 (most) → 8 (least). Top 2 get extra volume, bottom 2 trimmed.</p>"+
    _pr.map((m,i)=>{const c=i<2?"rk hot":(i>=n-2?"rk cold":"rk");return "<div class='prow'><span class='"+c+"'>"+(i+1)+"</span><span class='pn'>"+m+"</span><button class='mv' data-d='-1' data-i='"+i+"'"+(i===0?" disabled":"")+">↑</button><button class='mv' data-d='1' data-i='"+i+"'"+(i===n-1?" disabled":"")+">↓</button></div>";}).join("")+
    "<div class='btnrow'><button id='prSave'>Save</button></div>";
  document.getElementById("prioBody").querySelectorAll(".mv").forEach(b=>b.onclick=()=>{const i=+b.dataset.i,j=i+ +b.dataset.d; if(j<0||j>=_pr.length)return; const t=_pr[i];_pr[i]=_pr[j];_pr[j]=t; renderPrioBody();});
  document.getElementById("prSave").onclick=()=>{ profile=profile||{}; profile.priority=_pr; state.profile=profile; save(); buildActive(); prioDlg.close(); if(curTab==="plan")renderPlan(); else renderMore(); toast("Priorities saved"); };
}

/* ---------- bodyweight ---------- */
function openBw(){ const bw=state.bodyweightLog||[],b=document.getElementById("bwBody"); let sp="";
  if(bw.length>1){ const a=bw.slice(-20),v=a.map(e=>e.kg),mx=Math.max(...v),mn=Math.min(...v),W=320,H=80,pad=8; const x=i=>pad+i*(W-2*pad)/(a.length-1),y=val=>H-pad-((val-mn)/((mx-mn)||1))*(H-2*pad); sp="<svg viewBox='0 0 "+W+" "+H+"' style='width:100%;margin:8px 0'><polyline points='"+a.map((e,i)=>x(i)+","+y(e.kg)).join(" ")+"' fill='none' stroke='var(--accent)' stroke-width='2.5'/></svg>"; }
  const last=bw.length?bw[bw.length-1]:null, ch=bw.length>1?(bw[bw.length-1].kg-bw[0].kg):0;
  b.innerHTML=(last?"<div class='stat3'><div class='s'><b>"+toDisp(last.kg)+"</b><span>latest "+unit+"</span></div><div class='s'><b>"+(ch>=0?"+":"")+ch.toFixed(1)+"</b><span>since start</span></div><div class='s'><b>"+bw.length+"</b><span>entries</span></div></div>":"<p>Log your bodyweight.</p>")+sp+
    "<div class='setrow'><span class='no'>kg</span><input id='bwIn' inputmode='decimal' placeholder='"+unit+"' value='"+(last?toDisp(last.kg):"")+"'></div><div class='btnrow'><button id='bwSave'>Save today</button></div>";
  document.getElementById("bwSave").onclick=()=>{ const v=toKg(document.getElementById("bwIn").value); if(!v){toast("Enter a weight");return;} state.bodyweightLog=state.bodyweightLog||[]; const t=todayStr(),ex=state.bodyweightLog.find(e=>e.date===t); if(ex)ex.kg=v;else state.bodyweightLog.push({date:t,kg:v}); state.bodyweightLog.sort((a,b)=>a.date<b.date?-1:1); save(); native("logHealthWeight",v,Date.now()); openBw(); toast("Saved"); };
  bwDlg.showModal(); }

/* ---------- program version snapshots ---------- */
function openVersions(){
  const v=state.programVersions||[];
  document.getElementById("detTitle").textContent="Program versions";
  document.getElementById("detBody").innerHTML="<div class='btnrow'><button id='snap'>Save current version</button></div>"+(v.length?v.map((x,i)=>"<div class='hitem'><div><div class='d'>"+esc(x.label)+"</div><div class='m'>"+x.date+" · "+x.prog.days.length+" days</div></div><div class='v'><button data-i='"+i+"'>Restore</button></div></div>").join(""):"<p style='color:var(--muted)'>No versions yet.</p>");
  document.getElementById("snap").onclick=()=>{snapshotProgram("Manual snapshot");openVersions();};
  document.querySelectorAll("#detBody [data-i]").forEach(b=>b.onclick=()=>{
    const x=v[+b.dataset.i];
    // Restoring a version always goes back through the fresh-id contract — it never
    // writes window.PROGRAMS[x.id] directly, even when x.id happens to be a built-in id
    // (e.g. a snapshot taken while a built-in program was active).
    const id=saveCustomProgram(x.prog, {source:"manual", basedOn:x.id, diff:x.diff, icon:x.icon, overwriteCustomId:BUILTIN_PROGRAM_IDS.indexOf(x.id)===-1?x.id:null});
    activeProg=id; state.programId=id; save(); buildActive(); detDlg.close(); nav("plan"); toast("Version restored");
  });
  detDlg.showModal();
}
