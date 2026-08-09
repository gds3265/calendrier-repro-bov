const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='reproBovineV1';
const DEFAULTS={heatWatchStart:18,heatWatchEnd:24,presumedPregnant:25,pregCheck:35,preCalving:285,term:295,postpartumStart:30,postpartumWarn:45,postpartumLate:60};
const NOTIF_DEFAULTS={enabled:false,time:'07:00',heatReturn:true,pregCheck:true,precalving:true,term:true,postpartum:true};
const HERD_DEFAULTS={minFemaleAgeMonths:12};
let state=loadState();
let calMode='week', calDate=today(), cowFilter='all';

function normalizeState(x){
  x=x||{};
  x.cows=(x.cows||[]).map(c=>({...c,active:c.active!==false,source:c.source||'csv',events:c.events||[],reproOverride:c.reproOverride||''})); x.males=x.males||[]; x.aiBulls=x.aiBulls||[];
  x.settings={...DEFAULTS,...(x.settings||{})};
  x.notifications={...NOTIF_DEFAULTS,...(x.notifications||{})};
  x.herdSettings={...HERD_DEFAULTS,...(x.herdSettings||{})};
  x.meta=x.meta||{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt};
  return x;
}
function loadState(){
  const raw=localStorage.getItem(STORE);
  if(raw){try{return normalizeState(JSON.parse(raw))}catch(e){}}
  return normalizeState({cows:window.INITIAL_HERD.cows||[],males:window.INITIAL_HERD.males||[],aiBulls:[],settings:{...DEFAULTS},notifications:{...NOTIF_DEFAULTS},herdSettings:{...HERD_DEFAULTS},meta:{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt}});
}
function save(){localStorage.setItem(STORE,JSON.stringify(state)); renderAll()}
function today(){const d=new Date(); d.setHours(12,0,0,0); return d}
function dateISO(d){return d.toISOString().slice(0,10)}
function parseDate(s){if(!s)return null; const d=new Date(s+'T12:00:00'); return isNaN(d)?null:d}
function addDays(s,n){const d=typeof s==='string'?parseDate(s):new Date(s); d.setDate(d.getDate()+Number(n)); return d}
function diffDays(a,b){return Math.floor((parseDate(a)-parseDate(b))/86400000)}
function frDate(s,opts={day:'2-digit',month:'2-digit',year:'numeric'}){const d=typeof s==='string'?parseDate(s):s; return d?d.toLocaleDateString('fr-FR',opts):'—'}
function ageText(b){const d=parseDate(b); if(!d)return 'âge inconnu'; let m=(today().getFullYear()-d.getFullYear())*12+today().getMonth()-d.getMonth(); if(today().getDate()<d.getDate())m--; return m<24?`${m} mois`:`${Math.floor(m/12)} ans ${m%12?m%12+' mois':''}`.trim()}
function ageMonths(b){const d=parseDate(b);if(!d)return null;let m=(today().getFullYear()-d.getFullYear())*12+today().getMonth()-d.getMonth();if(today().getDate()<d.getDate())m--;return Math.max(0,m)}
function isReproEligible(c){if(c.active===false)return false;if(c.reproOverride==='include')return true;if(c.reproOverride==='exclude')return false;const m=ageMonths(c.birthDate);return m===null?true:m>=Number(state.herdSettings?.minFemaleAgeMonths??HERD_DEFAULTS.minFemaleAgeMonths)}
function isUnderAge(c){if(c.active===false)return false;const m=ageMonths(c.birthDate);return m!==null&&m<Number(state.herdSettings?.minFemaleAgeMonths??HERD_DEFAULTS.minFemaleAgeMonths)}
function norm(s){return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function esc(s){return (s??'').toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function events(c){return (c.events||[]).slice().sort((a,b)=>a.date.localeCompare(b.date))}
function latest(c,type){return events(c).filter(e=>!type||e.type===type).at(-1)||null}
function latestAfter(c,type,date){return events(c).filter(e=>e.type===type&&e.date>date).at(-1)||null}
function lastCalving(c){const e=latest(c,'calving'); return e?.date||c.lastCalving||''}
function lastService(c){return latest(c,'service')}

function reproductiveStatus(c){
  const ev=events(c), last=ev.at(-1); const svc=lastService(c); const calv=lastCalving(c);
  if(last?.type==='pregnant' && (!svc||last.date>=svc.date)){
    const base=svc?.date||last.date, days=Math.max(0,diffDays(dateISO(today()),base));
    return {key:'pregnant',label:`Pleine confirmée • ${days} j`,days,base,cls:'ok'};
  }
  if(svc){
    const later=ev.filter(e=>e.date>svc.date);
    if(later.some(e=>['heat','not_pregnant','calving'].includes(e.type))){
      // a later heat/negative/calving closes this service
    } else {
      const days=Math.max(0,diffDays(dateISO(today()),svc.date));
      if(days>=state.settings.presumedPregnant)return {key:'presumed',label:`Supposée pleine • ${days} j`,days,base:svc.date,cls:'warn'};
      return {key:'watch',label:`Après ${svc.mode==='ai'?'IA':'saillie'} • J+${days}`,days,base:svc.date,cls:'neutral'};
    }
  }
  if(calv){
    const days=Math.max(0,diffDays(dateISO(today()),calv));
    return {key:'postpartum',label:`Post-vêlage • J+${days}`,days,base:calv,cls:days>=state.settings.postpartumLate?'danger':days>=state.settings.postpartumStart?'warn':'neutral'};
  }
  return {key:'open',label:'À suivre',days:null,base:null,cls:'neutral'};
}

function buildAlerts(){
  const out=[], S=state.settings, now=dateISO(today());
  for(const c of state.cows.filter(isReproEligible)){
    const ev=events(c), svc=lastService(c), calv=lastCalving(c);
    if(svc){
      const later=ev.filter(e=>e.date>svc.date);
      const closed=later.some(e=>['heat','not_pregnant','calving'].includes(e.type));
      const confirmed=later.some(e=>e.type==='pregnant');
      if(!closed){
        if(!confirmed){
          const start=dateISO(addDays(svc.date,S.heatWatchStart)), end=dateISO(addDays(svc.date,S.heatWatchEnd));
          out.push({cow:c,type:'heat_return',date:start,endDate:end,icon:'🔁',title:'Surveiller retour en chaleur',meta:`${svc.mode==='ai'?'IA':'Saillie'} du ${frDate(svc.date)} • fenêtre J+${S.heatWatchStart} à J+${S.heatWatchEnd}`});
          const pc=dateISO(addDays(svc.date,S.pregCheck));
          out.push({cow:c,type:'preg_check',date:pc,icon:'🩺',title:'Diagnostic de gestation à envisager',meta:`J+${S.pregCheck} après ${svc.mode==='ai'?'IA':'saillie'}`});
        }
        const pre=dateISO(addDays(svc.date,S.preCalving)), term=dateISO(addDays(svc.date,S.term));
        out.push({cow:c,type:'precalving',date:pre,icon:'🍼',title:'Vêlage sous ~10 jours',meta:`Terme théorique ${frDate(term)} • J+${S.preCalving}`});
        out.push({cow:c,type:'term',date:term,icon:'⚠️',title:'Terme théorique atteint',meta:`${svc.mode==='ai'?'IA':'Saillie'} du ${frDate(svc.date)} • J+${S.term}`});
      }
    }
    if(calv){
      const after=ev.filter(e=>e.date>calv), restarted=after.some(e=>['heat','service'].includes(e.type));
      if(!restarted){
        const d1=dateISO(addDays(calv,S.postpartumStart)), d2=dateISO(addDays(calv,S.postpartumWarn)), d3=dateISO(addDays(calv,S.postpartumLate));
        out.push({cow:c,type:'post_start',date:d1,icon:'👀',title:'Commencer surveillance des chaleurs',meta:`J+${S.postpartumStart} après vêlage`});
        out.push({cow:c,type:'post_warn',date:d2,icon:'🔎',title:'Retour en cyclicité à surveiller',meta:`Aucune chaleur enregistrée • J+${S.postpartumWarn}`});
        out.push({cow:c,type:'post_late',date:d3,ongoing:true,icon:'🚩',title:'Pas de chaleur enregistrée post-vêlage',meta:`Depuis le vêlage du ${frDate(calv)} • J+${Math.max(0,diffDays(now,calv))}`});
      }
    }
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.cow.workNumber.localeCompare(b.cow.workNumber));
}
function activeOn(alert,day){
  if(alert.endDate)return day>=alert.date&&day<=alert.endDate;
  if(alert.ongoing)return day>=alert.date;
  return day===alert.date;
}
function alertsForDay(day){return buildAlerts().filter(a=>activeOn(a,day))}
function alertsBetween(start,end){return buildAlerts().filter(a=>{
  if(a.ongoing)return a.date<=end;
  const ae=a.endDate||a.date; return ae>=start&&a.date<=end;
})}

function renderHome(){
  const now=dateISO(today()), weekEnd=dateISO(addDays(today(),7));
  const td=alertsForDay(now), wk=alertsBetween(dateISO(addDays(today(),1)),weekEnd);
  $('#countToday').textContent=td.length; $('#countWeek').textContent=wk.length;
  $('#countPregnant').textContent=state.cows.filter(c=>isReproEligible(c)&&['pregnant','presumed'].includes(reproductiveStatus(c).key)).length;
  $('#todayAlerts').innerHTML=td.length?td.map(alertHTML).join(''):`<div class="empty">✅ Rien de particulier à surveiller aujourd’hui.</div>`;
  $('#weekAlerts').innerHTML=wk.length?wk.slice(0,20).map(alertHTML).join(''):`<div class="empty">Aucune échéance dans les 7 prochains jours.</div>`;
  bindCowOpen();
}
function alertHTML(a){return `<button class="card alert-card open-cow" data-id="${esc(a.cow.id)}"><span class="alert-icon">${a.icon}</span><span><span class="alert-title">${esc(a.cow.name||'Sans nom')} · ${esc(a.cow.workNumber)}</span><span class="alert-meta">${esc(a.title)} — ${esc(a.meta)}</span></span><span>›</span></button>`}

function renderCows(){
  const q=norm($('#cowSearch')?.value||'');
  let list=state.cows.filter(c=>!q||norm(c.name).includes(q)||norm(c.workNumber).includes(q)||norm(c.id).includes(q));
  if(cowFilter==='inactive')list=list.filter(c=>c.active===false);
  else if(cowFilter==='underage')list=list.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include');
  else if(cowFilter==='excluded')list=list.filter(c=>c.active!==false&&c.reproOverride==='exclude');
  else list=list.filter(c=>isReproEligible(c));
  if(cowFilter==='pregnant')list=list.filter(c=>['pregnant','presumed'].includes(reproductiveStatus(c).key));
  if(cowFilter==='watch')list=list.filter(c=>['watch'].includes(reproductiveStatus(c).key)||alertsForDay(dateISO(today())).some(a=>a.cow.id===c.id));
  if(cowFilter==='postpartum')list=list.filter(c=>reproductiveStatus(c).key==='postpartum');
  list.sort((a,b)=>(a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true}));
  $('#cowList').innerHTML=list.length?list.map(c=>{const s=reproductiveStatus(c), lc=lastCalving(c); const under=isUnderAge(c)&&c.reproOverride!=='include'; const excluded=c.reproOverride==='exclude'; const badge=c.active===false?'Sortie':under?'Hors âge':excluded?'Exclue du suivi':s.label; const cls=c.active===false||under||excluded?'neutral':s.cls; return `<button class="card cow-card open-cow ${c.active===false?'inactive-card':''}" data-id="${esc(c.id)}"><span><span class="cow-name">${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</span><span class="cow-sub">${ageText(c.birthDate)}${lc?` • dernier vêlage ${frDate(lc)}`:''}${c.calvingCount?` • rang ${c.calvingCount}`:''}${c.reproOverride==='include'?' • inclusion forcée':''}</span></span><span class="badge ${cls}">${esc(badge)}</span></button>`}).join(''):`<div class="empty">Aucune vache trouvée.</div>`;
  bindCowOpen();
}
function bindCowOpen(){ $$('.open-cow').forEach(b=>b.onclick=()=>openCow(b.dataset.id)) }
function openCow(id){
  const c=state.cows.find(x=>x.id===id); if(!c)return; const s=reproductiveStatus(c), ev=events(c).slice().reverse(); const svc=lastService(c);
  let calc=''; if(c.active!==false&&['pregnant','presumed','watch'].includes(s.key)&&svc){const term=dateISO(addDays(svc.date,state.settings.term)), remain=diffDays(term,dateISO(today())); calc=`<div class="card"><strong>${s.key==='pregnant'?'Pleine':'Supposée pleine / suivie'} depuis ${s.days} jours</strong><div class="cow-sub">Terme théorique : ${frDate(term)} • ${remain>=0?remain+' jours restants':Math.abs(remain)+' jours après terme'}</div></div>`}
  $('#cowDetail').innerHTML=`<div class="dialog-head"><div><h2>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</h2><div class="muted">${esc(c.id)} • ${ageText(c.birthDate)}${c.source==='manual'?' • ajout manuel':''}</div></div><button class="iconbtn" id="closeCow">✕</button></div>
  <p><span class="badge ${c.active===false||!isReproEligible(c)?'neutral':s.cls}">${c.active===false?'Sortie du troupeau':!isReproEligible(c)?(isUnderAge(c)?'Hors âge':'Exclue du suivi repro'):esc(s.label)}</span></p>${isReproEligible(c)?calc:''}
  <div class="card"><strong>Repères</strong><div class="cow-sub">Dernier vêlage : ${frDate(lastCalving(c))} • Rang retrouvé : ${c.calvingCount||'—'}${c.exitDate?' • sortie '+frDate(c.exitDate):''}${c.exitReason?' • '+esc(c.exitReason):''}</div></div>
  ${c.active!==false&&!isReproEligible(c)?`<div class="card eligibility-card"><strong>Hors suivi reproduction</strong><div class="cow-sub">${isUnderAge(c)?`Âge inférieur au seuil de ${state.herdSettings.minFemaleAgeMonths} mois.`:'Exclusion manuelle du suivi.'}</div><button class="primary compact" id="forceIncludeCow">✓ Inclure dans le suivi repro</button></div>`:c.active!==false&&c.reproOverride==='include'?`<div class="card eligibility-card"><strong>Inclusion forcée</strong><div class="cow-sub">Cette femelle est suivie même si elle est hors du critère d’âge.</div><button class="ghost compact" id="removeIncludeOverride">Revenir au critère d’âge</button></div>`:c.active!==false?`<div class="card eligibility-card"><strong>Suivi reproduction actif</strong><div class="cow-sub">Cette femelle respecte le critère d’âge actuel.</div><button class="ghost compact" id="excludeCowRepro">Exclure du suivi repro</button></div>`:''}
  <div class="cow-actions"><button class="ghost" id="editCow">✏️ Modifier la fiche</button>${c.active===false?'<button class="primary" id="reactivateCow">↩️ Réintégrer au troupeau</button>':'<button class="danger-outline" id="exitCow">Sortir du troupeau</button>'}</div>
  ${isReproEligible(c)?'<button class="primary wide" id="addForCow">＋ Ajouter un événement</button>':''}
  <h3>Historique</h3><div class="timeline">${ev.length?ev.map(e=>`<div class="timeline-item"><strong>${eventLabel(e)}</strong><div class="cow-sub">${frDate(e.date)}${e.bull?` • ${esc(e.bull)}`:''}${e.note?` • ${esc(e.note)}`:''}</div></div>`).join(''):`<div class="muted">Aucun événement saisi dans l’application.</div>`}</div>`;
  $('#closeCow').onclick=()=>$('#cowDialog').close();
  $('#editCow').onclick=()=>{ $('#cowDialog').close(); openCowForm(c.id) };
  if($('#forceIncludeCow'))$('#forceIncludeCow').onclick=()=>{c.reproOverride='include';save();openCow(c.id)};
  if($('#removeIncludeOverride'))$('#removeIncludeOverride').onclick=()=>{c.reproOverride='';save();openCow(c.id)};
  if($('#excludeCowRepro'))$('#excludeCowRepro').onclick=()=>{c.reproOverride='exclude';save();openCow(c.id)};
  if(c.active!==false){ if($('#addForCow'))$('#addForCow').onclick=()=>{ $('#cowDialog').close(); openEvent(c.id)}; $('#exitCow').onclick=()=>exitCow(c.id) }
  else $('#reactivateCow').onclick=()=>{c.active=true;c.exitDate='';c.exitReason='';c.exitOrigin='';save();$('#cowDialog').close();};
  $('#cowDialog').showModal();
}
function openCowForm(id=''){
 const c=id?state.cows.find(x=>x.id===id):null; $('#cowForm').reset(); $('#cowEditId').value=c?.id||''; $('#cowFormTitle').textContent=c?'Modifier la vache':'Ajouter une vache';
 $('#cowWorkNumber').value=c?.workNumber||''; $('#cowName').value=c?.name||''; $('#cowNationalId').value=c?.id?.startsWith('manual-')?'':(c?.id||''); $('#cowBirthDate').value=c?.birthDate||''; $('#cowBreed').value=c?.breed||''; $('#cowLastCalving').value=c?.lastCalving||''; $('#cowCalvingCount').value=c?.calvingCount||''; $('#cowForceRepro').checked=c?.reproOverride==='include'; $('#cowFormDialog').showModal();
}
function saveCowForm(e){e.preventDefault(); const editId=$('#cowEditId').value, national=$('#cowNationalId').value.trim(), work=$('#cowWorkNumber').value.trim(); if(!work){alert('Le numéro de travail est obligatoire.');return}
 let c=editId?state.cows.find(x=>x.id===editId):null; const newId=national||c?.id||('manual-'+uid());
 if(!c && state.cows.some(x=>x.active!==false&&(x.id===newId||x.workNumber===work))){alert('Une vache active avec cet identifiant ou ce numéro de travail existe déjà.');return}
 if(c && newId!==c.id && state.cows.some(x=>x!==c&&x.id===newId)){alert('Cet identifiant existe déjà.');return}
 const data={id:newId,workNumber:work,name:$('#cowName').value.trim(),birthDate:$('#cowBirthDate').value,breed:$('#cowBreed').value.trim(),lastCalving:$('#cowLastCalving').value,calvingCount:Math.max(0,Number($('#cowCalvingCount').value)||0),reproOverride:$('#cowForceRepro').checked?'include':(c?.reproOverride==='exclude'?'exclude':'')};
 if(c){Object.assign(c,data)} else state.cows.push({...data,active:true,source:'manual',events:[]}); save(); $('#cowFormDialog').close();
}
function exitCow(id){const c=state.cows.find(x=>x.id===id);if(!c)return; const reason=prompt('Motif de sortie (facultatif) : vendue, réforme, morte, autre…',''); if(reason===null)return; const d=prompt('Date de sortie (AAAA-MM-JJ) :',dateISO(today())); if(d===null)return; c.active=false;c.exitDate=/^\d{4}-\d{2}-\d{2}$/.test(d)?d:dateISO(today());c.exitReason=reason.trim();c.exitOrigin='manual';save();$('#cowDialog').close();}
function eventLabel(e){return ({heat:'Chaleur observée',service:e.mode==='ai'?'Insémination artificielle':'Saillie naturelle',pregnant:'Gestation confirmée',not_pregnant:'Diagnostic négatif',calving:'Vêlage'})[e.type]||e.type}

function renderBulls(){
  $('#bullList').innerHTML=state.males.length?state.males.map((b,i)=>`<div class="card bull-toggle"><div><strong>${esc(b.name||'Sans nom')} · ${esc(b.workNumber||'—')}</strong><div class="cow-sub">${esc(b.id||'')} ${b.birthDate?'• '+ageText(b.birthDate):''}</div></div><button class="switch ${b.activeBreeder?'on':''}" data-bull="${i}" aria-label="Activer"></button></div>`).join(''):`<div class="empty">Aucun mâle dans la base.</div>`;
  $$('[data-bull]').forEach(b=>b.onclick=()=>{state.males[+b.dataset.bull].activeBreeder=!state.males[+b.dataset.bull].activeBreeder; save()});
  $('#aiBullList').innerHTML=state.aiBulls.length?state.aiBulls.map(x=>`<span class="tag">${esc(x)}</span>`).join(''):`<span class="muted">Ils apparaîtront ici après les premières IA.</span>`;
  populateNaturalBulls();
}
function populateNaturalBulls(){const sel=$('#naturalBull'); if(!sel)return; const a=state.males.filter(b=>b.activeBreeder); sel.innerHTML=a.length?a.map(b=>`<option value="${esc(b.name||b.workNumber)}">${esc((b.name||'')+' · '+(b.workNumber||''))}</option>`).join(''):`<option value="">Aucun taureau actif — à régler dans Taureaux</option>`}

function renderSettings(){
 const defs=[['heatWatchStart','Début surveillance retour chaleur','J+ après IA/saillie'],['heatWatchEnd','Fin surveillance retour chaleur','J+ après IA/saillie'],['presumedPregnant','Supposée pleine à partir de','J+ sans retour enregistré'],['pregCheck','Rappel diagnostic de gestation','J+ après IA/saillie'],['preCalving','Alerte pré-vêlage','J+ après IA/saillie'],['term','Terme théorique','J+ après IA/saillie'],['postpartumStart','Début surveillance post-vêlage','J+ après vêlage'],['postpartumWarn','Alerte post-vêlage renforcée','J+ après vêlage'],['postpartumLate','Alerte absence de chaleur','J+ après vêlage']];
 $('#settingsForm').innerHTML=defs.map(([k,l,d])=>`<div class="setting"><label for="set-${k}">${l}</label><p>${d}</p><input id="set-${k}" type="number" min="0" value="${state.settings[k]}"></div>`).join('');
 const n=state.notifications||NOTIF_DEFAULTS;
 const minAge=Number(state.herdSettings?.minFemaleAgeMonths??HERD_DEFAULTS.minFemaleAgeMonths);
 $('#herdSettings').innerHTML=`<div class="notification-panel"><div class="setting-row"><div><strong>Âge minimum des femelles suivies</strong><p>Les femelles plus jeunes restent dans la base mais ne génèrent pas d’alertes, sauf inclusion manuelle.</p></div><div class="age-setting"><input id="minFemaleAgeMonths" type="number" min="0" max="120" step="1" value="${minAge}"><span>mois</span></div></div><div class="cow-sub">${state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length} femelle(s) actuellement hors critère d’âge.</div></div>`;
 $('#notificationSettings').innerHTML=`
   <div class="notification-panel">
    <div class="setting-row"><div><strong>Récap quotidien</strong><p>Une seule notification regroupée pour éviter les alertes en rafale.</p></div><label class="toggleline"><input id="notif-enabled" type="checkbox" ${n.enabled?'checked':''}> Actif</label></div>
    <div class="setting-row"><div><strong>Heure souhaitée</strong><p>Utilisée lorsque l’application est active ou reprise. Le push serveur sera nécessaire pour une heure garantie en arrière-plan.</p></div><input id="notif-time" type="time" value="${esc(n.time||'07:00')}"></div>
    <div class="notif-types">
      <label><input id="notif-heatReturn" type="checkbox" ${n.heatReturn?'checked':''}> 🔁 Retours en chaleur</label>
      <label><input id="notif-pregCheck" type="checkbox" ${n.pregCheck?'checked':''}> 🩺 Diagnostics de gestation</label>
      <label><input id="notif-precalving" type="checkbox" ${n.precalving?'checked':''}> 🍼 Pré-vêlage</label>
      <label><input id="notif-term" type="checkbox" ${n.term?'checked':''}> ⚠️ Termes atteints</label>
      <label><input id="notif-postpartum" type="checkbox" ${n.postpartum?'checked':''}> 👀 Suivi post-vêlage</label>
    </div>
    <div class="notif-actions"><button type="button" id="enableNotifBtn" class="primary compact">🔔 Autoriser</button><button type="button" id="testNotifBtn" class="ghost compact">Envoyer un test</button></div>
    <p id="notifStatus" class="muted small"></p>
   </div>`;
 updateNotifStatus();
 $('#enableNotifBtn').onclick=requestNotifications;
 $('#testNotifBtn').onclick=()=>sendDailyNotification(true);
 $('#dataInfo').textContent=`Base actuelle : ${state.cows.filter(c=>c.active!==false).length} femelles présentes • ${state.cows.filter(isReproEligible).length} suivies repro • ${state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length} hors âge • ${state.cows.filter(c=>c.active===false).length} sorties • ${state.males.length} mâles • source ${state.meta?.source||'locale'}`;
}

function renderCalendar(){
 const start=new Date(calDate), end=new Date(calDate); let days=[];
 if(calMode==='day'){days=[new Date(calDate)]; $('#calTitle').textContent=frDate(calDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
 if(calMode==='week'){const wd=(calDate.getDay()+6)%7; start.setDate(calDate.getDate()-wd); end.setTime(start.getTime()); end.setDate(start.getDate()+6); for(let i=0;i<7;i++)days.push(addDays(start,i)); $('#calTitle').textContent=`${frDate(start,{day:'numeric',month:'short'})} – ${frDate(end,{day:'numeric',month:'short',year:'numeric'})}`}
 if(calMode==='month'){
   start.setDate(1); $('#calTitle').textContent=frDate(start,{month:'long',year:'numeric'}); const y=start.getFullYear(),m=start.getMonth(), first=(start.getDay()+6)%7, count=new Date(y,m+1,0).getDate(); let html='<div class="month-grid">'+['L','M','M','J','V','S','D'].map(x=>`<div class="muted">${x}</div>`).join(''); for(let i=0;i<first;i++)html+='<div></div>'; for(let d=1;d<=count;d++){const dt=new Date(y,m,d,12), iso=dateISO(dt), al=alertsForDay(iso); html+=`<div class="month-cell"><div class="n">${d}</div>${al.slice(0,3).map(a=>`<div><span class="dot"></span><span class="event-text">${esc(a.cow.workNumber)}</span></div>`).join('')}${al.length>3?`<small>+${al.length-3}</small>`:''}</div>`} html+='</div>'; $('#calendarContent').innerHTML=html; return;
 }
 $('#calendarContent').innerHTML=days.map(d=>{const iso=dateISO(d), a=alertsForDay(iso); return `<div class="day-block"><div class="day-title">${frDate(d,{weekday:'long',day:'numeric',month:'long'})}</div>${a.length?a.map(alertHTML).join(''):`<div class="empty">Rien à surveiller</div>`}</div>`}).join(''); bindCowOpen();
}

function openEvent(cowId){
 $('#eventForm').reset(); $('#eventDate').value=dateISO(today()); $('#eventCowId').value=''; $('#selectedCow').classList.add('hidden'); $('#eventCowMatches').innerHTML=''; $('#eventCowSearch').value=''; updateServiceFields();
 if(cowId){selectEventCow(state.cows.find(c=>c.id===cowId))}
 $('#eventDialog').showModal();
}
function selectEventCow(c){if(!c)return; $('#eventCowId').value=c.id; $('#eventCowSearch').value=''; $('#eventCowMatches').innerHTML=''; $('#selectedCow').textContent=`${c.name||'Sans nom'} · ${c.workNumber}`; $('#selectedCow').classList.remove('hidden')}
function updateServiceFields(){const svc=$('#eventType').value==='service'; $('#serviceFields').classList.toggle('hidden',!svc); const ai=$('#serviceMode').value==='ai'; $('#naturalBullWrap').classList.toggle('hidden',ai); $('#aiBullWrap').classList.toggle('hidden',!ai)}

function addEventFromForm(e){e.preventDefault(); const c=state.cows.find(x=>x.id===$('#eventCowId').value); if(!c){alert('Choisis une vache dans la liste.');return}
 const type=$('#eventType').value, date=$('#eventDate').value; const ev={id:uid(),type,date,note:$('#eventNote').value.trim()};
 if(type==='service'){ev.mode=$('#serviceMode').value; ev.bull=ev.mode==='ai'?$('#aiBull').value.trim():$('#naturalBull').value; if(ev.mode==='ai'&&ev.bull&&!state.aiBulls.includes(ev.bull))state.aiBulls.push(ev.bull)}
 c.events=c.events||[]; c.events.push(ev); if(type==='calving'){c.lastCalving=date;c.calvingCount=(c.calvingCount||0)+1}
 save(); $('#eventDialog').close();
}

function parseCSV(text){
 const rows=[]; let row=[],cell='',q=false; for(let i=0;i<text.length;i++){const ch=text[i],n=text[i+1]; if(ch==='"'){if(q&&n==='"'){cell+='"';i++}else q=!q}else if(ch===';'&&!q){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&n==='\n')i++; row.push(cell);cell=''; if(row.some(x=>x!==''))rows.push(row);row=[]}else cell+=ch} if(cell||row.length){row.push(cell);rows.push(row)} return rows;
}
function csvClean(x){x=(x||'').trim(); const m=x.match(/^="(.*)"$/s); return m?m[1]:x}
function dmyToIso(s){const m=(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:''}
function importHerdCSV(text,name){
 const rows=parseCSV(text); if(rows.length<2)throw Error('CSV vide'); const head=rows[0].map(csvClean); const idx=n=>head.indexOf(n); const need=['Identifiant bovin','Numéro travail','Date naissance','Sexe','Nom','Numéro mère','Date sortie']; if(need.some(n=>idx(n)<0))throw Error('Colonnes GDS attendues non trouvées');
 const records=rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h,csvClean(r[i]||'')]))); const births={}; records.forEach(r=>{if(r['Numéro mère']&&r['Date naissance']){(births[r['Numéro mère']]??=[]).push(dmyToIso(r['Date naissance']))}}); Object.values(births).forEach(a=>a.sort());
 let added=0,updated=0,exited=0,manualKept=state.cows.filter(c=>c.source==='manual').length;
 const byId=new Map(state.cows.map(c=>[c.id,c]));
 for(const r of records.filter(r=>r.Sexe==='F')){
   const rid=r['Identifiant bovin'], work=r['Numéro travail'], birth=dmyToIso(r['Date naissance']), csvExit=dmyToIso(r['Date sortie']);
   let c=byId.get(rid);
   if(!c){ c=state.cows.find(x=>x.source==='manual'&&x.workNumber===work&&(!x.birthDate||!birth||x.birthDate===birth)); if(c){byId.delete(c.id); c.id=rid; c.source='csv'; byId.set(rid,c);} }
   const b=(births[rid]||[]).filter(Boolean), histLast=b.at(-1)||'';
   if(c){ c.workNumber=work||c.workNumber;c.name=r.Nom||c.name;c.birthDate=birth||c.birthDate;c.breed=r['Type racial']||c.breed||'';c.lastCalving=[c.lastCalving,histLast].filter(Boolean).sort().at(-1)||'';c.calvingCount=Math.max(c.calvingCount||0,b.length);c.source='csv'; if(csvExit){if(c.active!==false)exited++;c.active=false;c.exitDate=csvExit;c.exitReason=c.exitReason||'Sortie indiquée dans le CSV';c.exitOrigin='csv'} else if(c.exitOrigin!=='manual'){c.active=true;c.exitDate='';c.exitReason='';c.exitOrigin=''}; updated++;
   } else {state.cows.push({id:rid,workNumber:work,name:r.Nom,birthDate:birth,breed:r['Type racial']||'',lastCalving:histLast,calvingCount:b.length,events:[],active:!csvExit,exitDate:csvExit,exitReason:csvExit?'Sortie indiquée dans le CSV':'',exitOrigin:csvExit?'csv':'',source:'csv',reproOverride:''});added++;}
 }
 const oldM=new Map(state.males.map(b=>[b.id,b])); state.males=records.filter(r=>r.Sexe==='M'&&!r['Date sortie']).map(r=>({id:r['Identifiant bovin'],workNumber:r['Numéro travail'],name:r.Nom,birthDate:dmyToIso(r['Date naissance']),activeBreeder:oldM.get(r['Identifiant bovin'])?.activeBreeder||false}));
 const underAge=state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length; state.meta={source:name,importedAt:dateISO(today()),lastImport:{added,updated,exited,manualKept,underAge}};save(); return {added,updated,exited,manualKept,underAge};
}

function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`repro-bovine-sauvegarde-${dateISO(today())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function notificationTypeEnabled(a){
 const n=state.notifications||NOTIF_DEFAULTS;
 if(a.type==='heat_return')return n.heatReturn;
 if(a.type==='preg_check')return n.pregCheck;
 if(a.type==='precalving')return n.precalving;
 if(a.type==='term')return n.term;
 if(['post_start','post_warn','post_late'].includes(a.type))return n.postpartum;
 return true;
}
function notificationAlerts(day=dateISO(today())){return alertsForDay(day).filter(notificationTypeEnabled)}
function notificationSummary(day=dateISO(today())){
 const a=notificationAlerts(day), groups={heat_return:0,preg_check:0,precalving:0,term:0,post:0};
 a.forEach(x=>{if(['post_start','post_warn','post_late'].includes(x.type))groups.post++;else if(groups[x.type]!==undefined)groups[x.type]++});
 const parts=[]; if(groups.heat_return)parts.push(`${groups.heat_return} retour(s) chaleur`); if(groups.preg_check)parts.push(`${groups.preg_check} diagnostic(s)`); if(groups.precalving)parts.push(`${groups.precalving} pré-vêlage`); if(groups.term)parts.push(`${groups.term} terme(s)`); if(groups.post)parts.push(`${groups.post} post-vêlage`);
 const names=[...new Set(a.map(x=>(x.cow.name||x.cow.workNumber)+' · '+x.cow.workNumber))].slice(0,3);
 return {count:a.length,body:a.length?`${parts.join(' • ')}${names.length?' — '+names.join(', ')+(a.length>3?'…':''):''}`:'Aucune surveillance particulière aujourd’hui.'};
}
async function showNotification(title,body,tag='repro-bovine-daily'){
 if(!('Notification' in window)||Notification.permission!=='granted')return false;
 try{
  if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.ready; await reg.showNotification(title,{body,icon:'icon-192.png',badge:'icon-192.png',tag,renotify:true,data:{url:'./'}});return true}
  new Notification(title,{body,icon:'icon-192.png',tag}); return true;
 }catch(e){try{new Notification(title,{body,icon:'icon-192.png'});return true}catch(_){return false}}
}
function updateNotifStatus(){
 const el=$('#notifStatus'); if(!el)return;
 if(!('Notification'in window)){el.textContent='Notifications non prises en charge par ce navigateur.';return}
 const p=Notification.permission; el.textContent=p==='granted'?'✅ Notifications autorisées sur cet appareil.':p==='denied'?'⛔ Notifications refusées dans les réglages du navigateur/appareil.':'🔔 Autorisation non encore accordée.';
}
async function requestNotifications(){
 if(!('Notification'in window)){alert('Les notifications ne sont pas disponibles dans ce navigateur. Les alertes restent visibles dans l’application.');return}
 const p=await Notification.requestPermission();
 if(p==='granted'){state.notifications.enabled=true;save(); await showNotification('Repro Bovine','Notifications activées. Les alertes du jour seront regroupées dans un récap.','repro-bovine-setup')}
 else updateNotifStatus();
}
async function sendDailyNotification(force=false){
 const prefs=state.notifications||NOTIF_DEFAULTS;
 if(!force&&!prefs.enabled)return;
 if(!('Notification'in window)||Notification.permission!=='granted'){if(force)await requestNotifications();return}
 const day=dateISO(today()), key='reproNotifV12-'+day; if(!force&&localStorage.getItem(key))return;
 const summary=notificationSummary(day); await showNotification(force?'Test Repro Bovine':'Repro Bovine • Aujourd’hui',summary.body,force?'repro-bovine-test':'repro-bovine-daily');
 if(!force)localStorage.setItem(key,'1');
}
function maybeDailyNotification(){
 const prefs=state.notifications||NOTIF_DEFAULTS; if(!prefs.enabled)return;
 const now=new Date(), hhmm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 if(hhmm>=(prefs.time||'07:00'))sendDailyNotification(false);
}

function renderAll(){renderHome();renderCows();renderBulls();renderSettings();renderCalendar()}
function switchView(v){$$('.view').forEach(x=>x.classList.remove('active')); $(`#view-${v}`).classList.add('active'); $$('.bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v)); if(v==='cows')renderCows(); if(v==='calendar')renderCalendar()}

document.addEventListener('DOMContentLoaded',()=>{
 $('#todayLabel').textContent=today().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 $$('.bottomnav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view)); $('#quickAddBtn').onclick=()=>openEvent();
 $('#cowSearch').oninput=renderCows; $('#addCowBtn').onclick=()=>openCowForm(); $('#cowForm').onsubmit=saveCowForm; $$('.chip').forEach(b=>b.onclick=()=>{$$('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');cowFilter=b.dataset.cowFilter;renderCows()});
 $('#eventCowSearch').oninput=()=>{const q=norm($('#eventCowSearch').value); if(q.length<1){$('#eventCowMatches').innerHTML='';return} const list=state.cows.filter(c=>isReproEligible(c)&&(norm(c.name).includes(q)||norm(c.workNumber).includes(q))).slice(0,8); $('#eventCowMatches').innerHTML=list.map(c=>`<button type="button" class="match" data-pick="${esc(c.id)}"><strong>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</strong><div class="cow-sub">${ageText(c.birthDate)}</div></button>`).join(''); $$('[data-pick]').forEach(b=>b.onclick=()=>selectEventCow(state.cows.find(c=>c.id===b.dataset.pick)))};
 $('#eventType').onchange=updateServiceFields; $('#serviceMode').onchange=updateServiceFields; $('#eventForm').onsubmit=addEventFromForm;
 $('#addBullBtn').onclick=()=>$('#bullDialog').showModal(); $('#bullForm').onsubmit=e=>{e.preventDefault();state.males.push({id:'manual-'+uid(),name:$('#bullName').value.trim(),workNumber:$('#bullNumber').value.trim(),birthDate:'',activeBreeder:true});save();$('#bullDialog').close();$('#bullForm').reset()};
 $('#saveSettingsBtn').onclick=()=>{Object.keys(DEFAULTS).forEach(k=>state.settings[k]=Math.max(0,Number($(`#set-${k}`).value)||0)); state.herdSettings={...HERD_DEFAULTS,...state.herdSettings,minFemaleAgeMonths:Math.max(0,Number($('#minFemaleAgeMonths')?.value)||0)}; state.notifications={...NOTIF_DEFAULTS,...state.notifications,enabled:$('#notif-enabled')?.checked??false,time:$('#notif-time')?.value||'07:00',heatReturn:$('#notif-heatReturn')?.checked??true,pregCheck:$('#notif-pregCheck')?.checked??true,precalving:$('#notif-precalving')?.checked??true,term:$('#notif-term')?.checked??true,postpartum:$('#notif-postpartum')?.checked??true}; save();alert('Réglages enregistrés. Le suivi repro a été recalculé avec le nouvel âge minimum.');}; $('#resetSettingsBtn').onclick=()=>{state.settings={...DEFAULTS};state.herdSettings={...HERD_DEFAULTS};state.notifications={...NOTIF_DEFAULTS};save()};
 $('#csvInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const r=importHerdCSV(await f.text(),f.name);alert(`Fusion CSV terminée.\n\n${r.added} nouvelle(s) vache(s)\n${r.updated} fiche(s) reconnue(s) et mise(s) à jour\n${r.exited} sortie(s) détectée(s)\n${r.manualKept} vache(s) ajoutée(s) manuellement conservée(s)\n${r.underAge} femelle(s) hors critère d’âge\n\nLes événements repro saisis dans l’application ont été conservés.`)}catch(err){alert('Import impossible : '+err.message)}e.target.value=''};
 $('#exportBtn').onclick=exportBackup; $('#restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!x.cows||!x.settings)throw Error('format incorrect');state=normalizeState(x);save();alert('Sauvegarde restaurée.')}catch(err){alert('Restauration impossible : '+err.message)}e.target.value=''};
 $('#notifyBtn').onclick=requestNotifications;
 $$('#calendarMode button').forEach(b=>b.onclick=()=>{$$('#calendarMode button').forEach(x=>x.classList.remove('active'));b.classList.add('active');calMode=b.dataset.mode;renderCalendar()});
 $('#calPrev').onclick=()=>{calDate=addDays(calDate,calMode==='day'?-1:calMode==='week'?-7:-30);renderCalendar()}; $('#calNext').onclick=()=>{calDate=addDays(calDate,calMode==='day'?1:calMode==='week'?7:30);renderCalendar()};
 renderAll();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(()=>{maybeDailyNotification()}).catch(()=>{}); else maybeDailyNotification();
 setInterval(maybeDailyNotification,60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybeDailyNotification()});
 window.addEventListener('focus',maybeDailyNotification);
});
