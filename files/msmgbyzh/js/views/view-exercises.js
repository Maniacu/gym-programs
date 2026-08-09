/* Library tab: browse the 873-exercise library by muscle group, search across all of it,
 * and the exercise-photo demo helpers shared with the Today view's exercise detail dialog. */
const MUS_ICON={Chest:"🫀",Back:"🔙",Shoulders:"🏔",Biceps:"💪",Triceps:"🔱",Legs:"🦵",Core:"🧱",Abs:"🧱",Calf:"🦵",Forearms:"✊",Glutes:"🍑",Hamstrings:"🦵","Lower back":"🔙",Traps:"🔙",Neck:"🙂","Rear delts":"🎯"};
function libByCat(){ const g={}; LIB.forEach(x=>{(g[x.cat]=g[x.cat]||[]).push(x);}); return g; }
let exGroupOpen=null, exQuery="";

/** Fuzzy free-text -> library entry resolver. Used by the template builder here and by
 *  the AI coach's program builder (12-coach.js) — both need to turn a plain exercise
 *  name into a real library entry (image, cue, equipment). */
function aiResolveEx(name,muscleHint){
  if(!name)return null;
  const resolved=typeof canonicalExercise==="function"?canonicalExercise(name,muscleHint):null;
  if(resolved)return resolved.exercise;
  const lo=name.toLowerCase();
  return LIB.find(e=>e.n.toLowerCase()===lo)||null;
}

/* ---------- custom (user-created) exercises ----------
   Stored in state.customExercises, merged into LIB so every LIB consumer (library
   browse/search, swap dialog, add-exercise dialog, aiResolveEx) picks them up with
   zero extra wiring. img is a small data-URI from compressPhotoFile (optional). */
function applyCustomExercises(){
  for(let i=LIB.length-1;i>=0;i--)if(LIB[i].custom)LIB.splice(i,1);
  (state.customExercises||[]).forEach(x=>LIB.push(x));
}
function openNewExercise(){
  const count=(state.customExercises||[]).length;
  document.getElementById("detTitle").textContent="New exercise";
  const musSel=MUSCLE_PICKER.map(m=>"<option>"+m+"</option>").join("");
  const eqSel=["dumbbell","barbell","cable","machine","body only","e-z curl bar","kettlebells","bands","other"].map(e=>"<option>"+e+"</option>").join("");
  document.getElementById("detBody").innerHTML=
    "<div class='formcol'>"+
    "<input id='cx_n' maxlength='60' placeholder='Exercise name' style='width:100%;height:44px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:0 12px;font-size:15px;margin-bottom:8px'>"+
    "<div style='display:flex;gap:8px;margin-bottom:8px'><select id='cx_m' style='flex:1;height:44px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:0 8px'>"+musSel+"</select>"+
    "<select id='cx_eq' style='flex:1;height:44px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:0 8px'>"+eqSel+"</select></div>"+
    "<textarea id='cx_cue' maxlength='400' placeholder='How to perform it (optional)' style='width:100%;min-height:70px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:10px 12px;font-size:14px;margin-bottom:8px'></textarea>"+
    "<input id='cx_img' type='file' accept='image/*' style='margin-bottom:10px'>"+
    "<div class='btnrow'><button id='cx_save'>Save exercise</button></div>"+
    (count?"<p style='color:var(--muted);font-size:12px;margin-top:8px'>"+count+" custom exercise"+(count>1?"s":"")+" so far.</p>":"")+
    "</div>";
  let imgData="";
  document.getElementById("cx_img").onchange=async e=>{ const f=e.target.files[0]; if(!f)return; toast("Preparing photo...");
    try{ imgData=await compressPhotoFile(f); toast("Photo attached"); }catch(err){ toast("Could not read photo"); } };
  document.getElementById("cx_save").onclick=()=>{
    const n=safeText(document.getElementById("cx_n").value,60);
    if(!n){ toast("Give it a name"); return; }
    if(LIB.some(x=>x.n.toLowerCase()===n.toLowerCase())){ toast("That name already exists"); return; }
    if((state.customExercises||[]).length>=40){ toast("Custom exercise limit reached (40)"); return; }
    const m=document.getElementById("cx_m").value, eq=document.getElementById("cx_eq").value;
    const x={id:"cx_"+Date.now(), n:n, m:m, cat:m, eq:eq, cue:safeText(document.getElementById("cx_cue").value,400)||"Your custom exercise.", img:imgData, custom:1};
    state.customExercises=state.customExercises||[]; state.customExercises.push(x);
    applyCustomExercises(); save(); detDlg.close(); renderExercises(); toast("Added "+n);
  };
  detDlg.showModal();
}
function deleteCustomExercise(id){
  state.customExercises=(state.customExercises||[]).filter(x=>x.id!==id);
  applyCustomExercises(); save(); detDlg.close(); renderExercises(); toast("Deleted");
}

/* One row renderer for both the all-library search and the per-muscle list. Images are
   lazy: a query can match 120 rows and eagerly decoding that many JPEGs is by far the most
   expensive thing this screen does on a phone. */
function libRowHTML(x,sub){
  return "<div class='mrow' data-id='"+escAttr(x.id)+"'><img class='mi' loading='lazy' decoding='async' alt='' style='object-fit:cover' src='"+escAttr(x.img)+"' onerror=\"this.style.visibility='hidden'\">"+
    "<div class='mt'><div class='a'>"+esc(x.n)+"</div><div class='b'>"+esc(sub)+"</div></div><span class='ch'>›</span></div>";
}
function libMatches(){
  const q=exQuery.trim().toLowerCase();
  if(exGroupOpen){ const g=libByCat()[exGroupOpen]||[]; return q?g.filter(x=>x.n.toLowerCase().includes(q)):g; }
  return q?LIB.filter(x=>x.n.toLowerCase().includes(q)).slice(0,120):[];
}
/* Repaints ONLY the results container. The search input is deliberately never re-created:
   the old code rebuilt the whole view per keystroke, then re-focused the field and
   restored the caret by hand — which discards in-progress IME composition on any
   non-Latin keyboard, and threw away and rebuilt every row image on every letter. */
function renderExerciseResults(){
  const box=document.getElementById("exResults"); if(!box)return;
  if(!exGroupOpen&&!exQuery.trim()){
    const g=libByCat(),order=Object.keys(g).sort();
    box.innerHTML="<div class='mgrid'>"+order.map(c=>"<div class='mtile' data-cat='"+escAttr(c)+"'><div class='ico'>"+(MUS_ICON[c]||"🏋")+"</div><div><div class='a'>"+esc(c)+"</div><div class='b'>"+g[c].length+" exercises</div></div></div>").join("")+"</div><div style='height:18px'></div>";
    box.querySelectorAll(".mtile").forEach(t=>t.onclick=()=>{ exGroupOpen=t.dataset.cat; exQuery=""; renderExercises(); });
    return;
  }
  const rows=libMatches();
  box.innerHTML="<main>"+(rows.length
    ? rows.map(x=>libRowHTML(x,exGroupOpen?x.eq.toUpperCase():(x.cat.toUpperCase()+" · "+x.eq.toUpperCase()))).join("")
    : "<div class='empty'>No matches</div>")+"</main>";
  box.querySelectorAll(".mrow[data-id]").forEach(rw=>rw.onclick=()=>openLibDetail(rw.dataset.id));
}
let _exqT=null;
function bindExerciseSearch(id){
  const q=document.getElementById(id); if(!q)return;
  q.oninput=()=>{ exQuery=q.value; clearTimeout(_exqT); _exqT=setTimeout(renderExerciseResults,120); };
}
function renderExercises(){
  const v=document.getElementById("v-exercises");
  if(exGroupOpen&&libByCat()[exGroupOpen]){
    v.innerHTML="<div class='topbar'><button class='bk' style='position:absolute;left:12px;top:11px;background:var(--card2);border:none;color:var(--txt);width:38px;height:36px;border-radius:10px;font-size:18px' onclick='exGroupOpen=null;exQuery=\"\";renderExercises()'>‹</button><div class='t'>"+esc(exGroupOpen.toUpperCase())+"</div></div>"+
      "<div style='padding:0 14px 8px'><input id='exq' value=\""+escAttr(exQuery)+"\" aria-label='Search "+escAttr(exGroupOpen)+" exercises' placeholder='Search…' style='width:100%;height:42px;background:var(--card);border:1px solid var(--line);border-radius:12px;color:var(--txt);padding:0 12px;font-size:15px'></div><div id='exResults'></div>";
    renderExerciseResults(); bindExerciseSearch("exq");
    return;
  }
  v.innerHTML="<div class='topbar'><div class='t'>Exercises</div><button id='cxNew' style='position:absolute;right:12px;top:11px;background:var(--card2);border:1px solid var(--line);color:var(--txt);height:36px;padding:0 12px;border-radius:10px;font-size:13px;font-weight:600'>+ New</button></div>"+
    "<div class='searchbar'><span class='si'>"+icon('search',18)+"</span><input id='exqAll' value=\""+escAttr(exQuery)+"\" aria-label='Search the exercise library' placeholder='Search "+LIB.length+" exercises…'></div><div id='exResults'></div>";
  renderExerciseResults(); bindExerciseSearch("exqAll");
  const nb=document.getElementById("cxNew"); if(nb)nb.onclick=openNewExercise;
}

/* ---------- exercise photo "demo": paused by default, Play alternates between the two
 * angle photos, Step advances one frame. Releases audio focus while playing so it
 * doesn't interrupt a music app (musicFriendly, in 01-native.js's native() wrapper). */
let __demoSrc="",__demoAlt="",__demoFrame=0,__demoPlaying=false,__demoCache={},__demoInt=null;
function musicFriendly(on){ native("musicFriendlyMode",!!on); }
function stopDemo(){ clearInterval(__demoInt); __demoInt=null; __demoPlaying=false; musicFriendly(false); }
function setDemoButton(){
  const b=document.getElementById("demoToggle"), w=document.querySelector(".demowrap");
  if(b)b.textContent=__demoPlaying?"Pause":"Play";
  if(w)w.classList.toggle("paused",!__demoPlaying);
}
function stepDemo(){
  const img=document.getElementById("demoImg"); if(!img||!__demoAlt)return;
  __demoFrame^=1; img.src=__demoFrame?__demoAlt:__demoSrc;
}
function demoHTML(src){
  return "<div class='demowrap paused'><img alt='' class='detimg' id='demoImg' src='"+src+"' onerror=\"this.style.visibility='hidden'\"><span class='demobadge'>DEMO</span><div class='democtl'><button id='demoToggle'>Play</button><button id='demoStep'>Step</button></div></div>";
}
function playDemo(src){
  stopDemo(); __demoSrc=src||""; __demoAlt=__demoSrc.replace(/\.jpg$/i,"_b.jpg"); __demoFrame=0;
  musicFriendly(true);
  const alt=new Image(); alt.onload=function(){ __demoCache[__demoAlt]=true; }; alt.src=__demoAlt;
  const t=document.getElementById("demoToggle"), s=document.getElementById("demoStep");
  if(t)t.onclick=function(){
    if(__demoPlaying){ stopDemo(); setDemoButton(); return; }
    __demoPlaying=true; musicFriendly(true); setDemoButton(); clearInterval(__demoInt);
    __demoInt=setInterval(function(){ if(!document.hidden)stepDemo(); },1350);
  };
  if(s)s.onclick=function(){ stepDemo(); };
  setDemoButton();
}
document.addEventListener("visibilitychange",function(){ if(document.hidden)stopDemo(); });
function openLibDetail(lid){ const x=LIB.find(e=>e.id===lid); if(!x)return; openDetail(x);
  if(x.custom){ // user-created: allow deleting it from the library
    document.getElementById("detBody").insertAdjacentHTML("beforeend",
      "<div class='btnrow' style='margin-top:10px'><button class='ghost' id='cxDel' style='border-color:#6b3030;color:#e08080'>🗑 Delete custom exercise</button></div>");
    document.getElementById("cxDel").onclick=()=>{ if(confirm("Delete \""+x.n+"\"? Logged history for it stays."))deleteCustomExercise(x.id); };
  } }
