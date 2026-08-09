/* Exercise swap/rotation dialog — used both from an active log session (openSwap) and
 * directly from the Today timeline (openSwapPlan). Shared by both, so it can't live
 * inside either of those files. */
let _swap=null,_swapMus="",_swapReg="";
function openSwap(ei,scope){ _swap={key:logId(ei),exObj:logDay().ex[ei],after:renderLog,m:logDay().ex[ei].m,
  di:logCustom?null:curDay,ei:ei,scope:scope||"today",currentName:logOpt(ei).n}; _swapMus="";_swapReg=""; renderSwap(""); swapDlg.showModal(); }
/** Stall-buster entry: open the swap dialog pre-filtered to the exercise's muscle AND
 *  region (same head, e.g. long-head-stretch curls), so a stalled lift gets direct
 *  like-for-like alternatives instead of the whole muscle list. */
function openSwapRegion(ei){
  const exo=logDay().ex[ei], opt=logOpt(ei);
  _swap={key:logId(ei),exObj:exo,after:renderLog,m:exo.m,di:logCustom?null:curDay,ei:ei,scope:"future",currentName:opt.n};
  _swapMus=SWAP_MUS.indexOf(exo.m)>=0?exo.m:""; _swapReg="";
  if(_swapMus){ const reg=exFor(opt,exo.m), pool=LIB.filter(x=>libMuscleOf(x)===_swapMus);
    if(regionChips(pool).indexOf(reg)>=0)_swapReg=reg; }
  renderSwap(""); swapDlg.showModal();
}
function openSwapPlan(di,ei,scope){ _swap={key:id(di,ei),exObj:PROGRAM[di].ex[ei],after:renderPlan,m:PROGRAM[di].ex[ei].m,
  di:di,ei:ei,scope:scope||"future",currentName:curOpt(di,ei).n}; _swapMus="";_swapReg=""; renderSwap(""); swapDlg.showModal(); }

/** True for exercises worth a caution note in swap suggestions (not blocked, just
 *  flagged) — filtered out of the default (no-search) list, still shown once the user
 *  searches for something specific. */
function riskyExercise(x){
  const n=((x&&x.n)||"").toLowerCase();
  return /behind (the )?neck|guillotine|neck press|upright barbell row/.test(n);
}
/* Advisory only. Swapping stays one tap away — pain, equipment and preference always
   beat the model — but the user gets told when the lift they are about to drop has not
   actually had a fair trial yet, which is the specific habit that stalls a muscle. */
function commitmentNoticeHTML(currentName){
  if(!currentName||typeof smartCommitmentNotice!=="function")return "";
  const n=smartCommitmentNotice(currentName);
  if(!n)return "";
  const head={keep:"Still working",early:"Too early to tell",swap:"Fair trial done"}[n.level]||"Note";
  return "<div class='anchorNotice"+(n.level==="early"?" locked":"")+"'><b>"+esc(head)+"</b><small>"+esc(n.text)+"</small></div>";
}
function swapCandidates(m,exObj,q){
  const ql=(q||"").toLowerCase(),baseName=(exObj&&exObj.opts&&exObj.opts[0]&&exObj.opts[0].n||""),base=baseName.toLowerCase();
  const out=[], seen={};
  function add(x,label){ if(!x||seen[x.id||x.n])return; seen[x.id||x.n]=1; out.push({x:x,label:label||x.eq||""}); }
  function pseudo(id,n,mus,eq,img,cue){ return {id:id,n:n,m:mus,cat:mus,eq:eq,img:img,cue:cue}; }
  if(m==="Rear delts"||/rear|reverse|face pull|y-raise|trap-3/.test(base)){
    add(pseudo("Reverse_Cable_Flye","Reverse Cable Flye","Rear delts","cable","img/lib/Cable_Rear_Delt_Fly.jpg","Cross cables, drive arms out/back, pause and control the return."),"recommended");
    ["Cable Rear Delt Fly","Reverse Machine Flyes","Face Pull","Bent Over Dumbbell Rear Delt Raise With Head On Bench","Reverse Flyes"].forEach(n=>add(LIB.find(e=>e.n===n),"recommended"));
    LIB.filter(x=>/rear|reverse|face pull/i.test(x.n)).forEach(x=>add(x,"related"));
  }
  if(/shrug|trap/.test(base)||m==="Traps"){
    ["Dumbbell Shrug","Cable Shrugs","Leverage Shrug","Barbell Shrug","Trap Bar Shrug"].forEach(n=>add(LIB.find(e=>e.n===n),"upper traps"));
    /* Mid and lower traps are what a shrug-only trap plan misses — they retract and
       depress the scapula rather than elevate it, so they never come along for free. */
    ["Kelso Shrug","Prone Incline T-Raise","Middle Back Shrug"].forEach(n=>add(LIB.find(e=>e.n===n),"mid traps"));
    ["Prone Incline Y-Raise","Cable Y-Raise"].forEach(n=>add(LIB.find(e=>e.n===n),"lower traps"));
  }
  /* Muscles with an established "what actually makes a good X exercise" movement
   * pattern: only auto-suggest matches, don't dump every same-tagged library entry
   * regardless of quality. This is what let "Around The Worlds" (tagged Chest, but
   * really a light stretch/warm-up move, not a builder) show up as a top chest swap
   * pick — it's chest-tagged but matches no real chest movement pattern. An active
   * search still reaches the full same-muscle set (nothing is truly hidden), it's just
   * not auto-recommended by default. */
  const QUALITY_PATTERN={Chest:/press|fly|flye|dip|crossover|pec/i,Triceps:/pushdown|extension|skull|dip|close/i,Biceps:/curl|hammer|preacher/i,Back:/pulldown|row|pullover|shrug/i};
  const QUALITY_LABEL={Chest:"chest builder",Triceps:"triceps builder",Biceps:"biceps builder",Back:"back builder"};
  const lm=(m==="Rear delts"?"Shoulders":m);
  if(QUALITY_PATTERN[m]){
    LIB.filter(x=>x.m===m&&QUALITY_PATTERN[m].test(x.n)).forEach(x=>add(x,QUALITY_LABEL[m]));
    if(ql) LIB.filter(x=>x.m===m).forEach(x=>add(x,x.eq)); // active search: surface everything tagged for this muscle too
  } else {
    LIB.filter(x=>x.m===lm).forEach(x=>add(x,x.eq));
  }
  const filtered=out.filter(o=>!ql||o.x.n.toLowerCase().includes(ql)||String(o.label).toLowerCase().includes(ql));
  // Flag (don't hide) risky picks by default; a direct search can still surface them.
  const safe=filtered.map(o=>{ if(riskyExercise(o.x))o.label=(o.label?o.label+" | ":"")+"caution"; return o; }).filter(o=>ql||!riskyExercise(o.x));
  return sortSmartCandidates(safe,m,baseName);
}
function previewSwapExercise(ex){
  if(!ex)return;
  document.getElementById("detTitle").textContent=ex.n||"Exercise";
  document.getElementById("detBody").innerHTML=
    demoHTML(ex.img||"")+
    (ex.m?"<p style='margin-top:12px;color:var(--accent2);font-weight:700'>Works: "+esc(exFor(ex,ex.m)||ex.m)+"</p>":"")+
    (exAlso(ex)?"<p style='margin-top:2px;color:var(--muted);font-size:13px'>Also works: "+esc(exAlso(ex))+"</p>":"")+
    "<p style='margin-top:10px'><b>How to:</b> "+esc(ex.cue||"Preview this movement before choosing it as your swap.")+"</p>"+
    (ex.r?"<p style='color:var(--muted)'>Target: "+esc(ex.r)+"</p>":"")+
    "<div class='btnrow'><button class='s' onclick='detDlg.close()'>Back to swaps</button></div>";
  detDlg.showModal();
  playDemo(ex.img||"");
}
/* Browse-by-muscle mode: a muscle chip (Chest/Back/.../Traps/Forearms) switches the
   list from "recommended swaps for the current slot" to the full library for that
   muscle, with a second row of region chips (exFor's head-level labels — e.g. Biceps →
   "Biceps long head (stretch)") to narrow further. No chip = original recommended list. */
const SWAP_MUS=["Chest","Back","Shoulders","Rear delts","Biceps","Triceps","Legs","Core","Traps","Forearms"];
function swapBrowseList(q){
  let pool=LIB.filter(x=>libMuscleOf(x)===_swapMus);
  const regions=regionChips(pool);
  if(_swapReg)pool=pool.filter(x=>exFor(x,x.m)===_swapReg);
  const ql=(q||"").toLowerCase();
  let list=pool.filter(x=>!ql||x.n.toLowerCase().includes(ql))
    .map(x=>({x:x,label:_swapReg?(x.eq||""):(exFor(x,x.m)||x.eq||"")}));
  list=list.map(o=>{ if(riskyExercise(o.x))o.label=(o.label?o.label+" | ":"")+"caution"; return o; });
  list=sortSmartCandidates(list,_swapMus,(_swap&&_swap.exObj&&_swap.exObj.opts&&_swap.exObj.opts[0]&&_swap.exObj.opts[0].n)||"");
  return {list:list,regions:regions};
}
function renderSwap(q){
  const {key,exObj,m}=_swap, r=state.slots[key]||{};
  const anchor=_swap.di!=null&&typeof smartAnchorStatus==="function"?smartAnchorStatus({di:_swap.di,ei:_swap.ei,muscle:m},curOpt(_swap.di,_swap.ei)):null;
  const browse=_swapMus?swapBrowseList(q):null;
  const list=browse?browse.list:swapCandidates(m,exObj,q);
  let h="<div class='swapScope'><button data-scope='today' class='"+(_swap.scope==="today"?"on":"")+"'>Today only</button><button data-scope='future' class='"+(_swap.scope==="future"?"on":"")+"'>Future workouts</button></div>"+
    "<p class='smartFinePrint' style='margin-top:5px'>"+(_swap.scope==="today"?"This session changes; your saved program and block anchor stay intact.":"This permanently changes this program slot.")+"</p>"+
    (anchor&&anchor.eligible?"<div class='anchorNotice"+(!anchor.canRotate?" locked":"")+"'><b>"+esc(anchor.message)+"</b><small>"+(!anchor.canRotate?"Today only is recommended unless pain or equipment makes the anchor unsuitable.":"A future change starts a new comparison block.")+"</small></div>":"")+
    commitmentNoticeHTML(_swap.currentName)+
    "<input id='swq' value=\""+escAttr(q||"")+"\" placeholder='Search swaps...' style='width:100%;height:44px;background:var(--card2);border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:0 12px;margin-bottom:12px;font-size:15px'>";
  h+="<div class='msel'>"+SWAP_MUS.map(mm=>"<button class='mm"+(_swapMus===mm?" on":"")+"' data-sm='"+escAttr(mm)+"'>"+esc(mm)+"</button>").join("")+"</div>";
  if(browse&&browse.regions.length)
    h+="<div class='msel'>"+browse.regions.map(rg=>"<button class='mm"+(_swapReg===rg?" on":"")+"' data-srg='"+escAttr(rg)+"'>"+esc(rg)+"</button>").join("")+"</div>";
  if(!q&&!_swapMus&&exObj&&exObj.opts&&exObj.opts.length>1){
    h+="<div style='color:var(--muted);font-size:12px;margin-bottom:6px'>Built-in alternatives</div>"+
      exObj.opts.map((o,i)=>"<div class='opt"+(!r.swap&&(r.opt!=null?r.opt:equipDefaultOpts(exObj.opts))===i?" cur":"")+"' data-k='p"+i+"'><img alt='' src='"+o.img+"' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(o.n)+"</div><div class='s'>"+(i===0?"Default":"Alternative")+" | tap row to use</div></div><button class='pvbtn' data-pv='p"+i+"'>View</button></div>").join("");
  }
  h+="<div style='color:var(--muted);font-size:12px;margin:14px 0 6px'>"+(_swapMus?esc(_swapMus+(_swapReg?" · "+_swapReg:"")+" exercises"):"Recommended swaps")+" ("+list.length+")</div>";
  h+=list.slice(0,180).map(o=>"<div class='opt"+(r.swap&&r.swap.id===o.x.id?" cur":"")+"' data-k='l"+escAttr(o.x.id)+"'><img alt='' src='"+o.x.img+"' loading='lazy' decoding='async' onerror=\"this.style.visibility='hidden'\"><div class='o'><div class='t'>"+esc(o.x.n)+"</div><div class='s'>"+esc(o.label||o.x.eq)+" | AI fit "+(o.smartFit?o.smartFit.score:"-")+"/100"+(o.smartFit&&o.smartFit.reasons.length?" · "+esc(o.smartFit.reasons[0]):"")+"</div></div><button class='pvbtn' data-pv='l"+escAttr(o.x.id)+"'>View</button></div>").join("")||"<div style='color:var(--muted);padding:8px'>No matches.</div>";
  document.getElementById("swapBody").innerHTML=h;
  const inp=document.getElementById("swq"); inp.oninput=()=>{ const v=inp.value,ss=inp.selectionStart; renderSwap(v); const n=document.getElementById("swq"); n.focus(); try{n.setSelectionRange(ss,ss);}catch(e){} };
  document.querySelectorAll("#swapBody [data-scope]").forEach(b=>b.onclick=()=>{_swap.scope=b.dataset.scope;renderSwap(document.getElementById("swq").value);});
  document.querySelectorAll("#swapBody [data-sm]").forEach(b=>b.onclick=()=>{ _swapMus=_swapMus===b.dataset.sm?"":b.dataset.sm; _swapReg=""; renderSwap(document.getElementById("swq").value); });
  document.querySelectorAll("#swapBody [data-srg]").forEach(b=>b.onclick=()=>{ _swapReg=_swapReg===b.dataset.srg?"":b.dataset.srg; renderSwap(document.getElementById("swq").value); });
  document.querySelectorAll("#swapBody .pvbtn").forEach(btn=>btn.onclick=e=>{
    e.preventDefault(); e.stopPropagation();
    const k=btn.dataset.pv;
    if(k[0]==="p")previewSwapExercise(exObj.opts[+k.slice(1)]);
    else { const item=list.find(o=>o.x.id===k.slice(1)); if(item)previewSwapExercise(item.x); }
  });
  document.querySelectorAll("#swapBody .opt").forEach(el=>el.onclick=e=>{
    if(e.target&&e.target.closest&&e.target.closest(".pvbtn"))return;
    const k=el.dataset.k,rr=(state.slots[key]=state.slots[key]||{}),before=_swap.currentName;
    let chosen=null;
    if(k[0]==="p"){
      const ix=+k.slice(1);chosen=exObj.opts[ix];
      if(_swap.scope==="today"){rr.todayOpt={date:todayStr(),index:ix};delete rr.todaySwap;}
      /* Anchor the durable choice to the exercise it was made against, not to this slot's
         current index — see reconcileSlotSwaps() in 03-programs.js. */
      else {rr.opt=ix;rr.base=slotBaseName(exObj);delete rr.swap;delete rr.todayOpt;delete rr.todaySwap;}
    }else{
      const lid=k.slice(1),item=list.find(o=>o.x.id===lid);
      if(item){const x=item.x,ref=typeof smartExerciseIdentity==="function"?smartExerciseIdentity(x.n,x.id):{exerciseId:x.id,libId:x.id};
        chosen={id:x.id,exerciseId:ref.exerciseId,libId:ref.libId,exerciseName:x.n,n:x.n,img:x.img,cue:x.cue,eq:x.eq};
        if(_swap.scope==="today"){rr.todaySwap=Object.assign({date:todayStr()},chosen);delete rr.todayOpt;}
        else {rr.swap=chosen;rr.base=slotBaseName(exObj);delete rr.opt;delete rr.todayOpt;delete rr.todaySwap;}
      }
    }
    if(!chosen)return;
    if(_swap.scope==="future"){
      const meta=typeof smartExerciseMetadata==="function"?smartExerciseMetadata(chosen,m):null;
      if(meta&&meta.anchorEligible&&typeof resetSmartAnchorForSlot==="function")resetSmartAnchorForSlot(key,chosen,"future substitution");
      else if(state.exerciseAnchors)delete state.exerciseAnchors[key];
    }
    if(typeof recordRecommendationEvent==="function"){
      const ref=typeof smartExerciseIdentity==="function"?smartExerciseIdentity(chosen.n,chosen.libId||chosen.id):{};
      recordRecommendationEvent("exercise_substitution",{scope:_swap.scope,slotKey:key,before:before,after:chosen.n,
        exerciseId:ref.exerciseId||null,libId:ref.libId||null,anchorWeek:anchor&&anchor.week||null});
    }
    delete rr.sets;save();swapDlg.close();_swap.after();toast(_swap.scope==="today"?"Swapped for today only":"Future workouts updated");
  });
}
