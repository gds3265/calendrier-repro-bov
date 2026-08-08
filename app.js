const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='reproBovineV1';
const DEFAULTS={heatWatchStart:18,heatWatchEnd:24,presumedPregnant:25,pregCheck:35,preCalving:285,term:295,postpartumStart:30,postpartumWarn:45,postpartumLate:60};
let state=loadState();
let calMode='week', calDate=today(), cowFilter='all';

function loadState(){
  const raw=localStorage.getItem(STORE);
  if(raw){try{return JSON.parse(raw)}catch(e){}}
  return {cows:window.INITIAL_HERD.cows||[],males:window.INITIAL_HERD.males||[],aiBulls:[],settings:{...DEFAULTS},meta:{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt}};
}
function save(){localStorage.setItem(STORE,JSON.stringify(state)); renderAll()}
function today(){const d=new Date(); d.setHours(12,0,0,0); return d}
function dateISO(d){return d.toISOString().slice(0,10)}
function parseDate(s){if(!s)return null; const d=new Date(s+'T12:00:00'); return isNaN(d)?null:d}
function addDays(s,n){const d=typeof s==='string'?parseDate(s):new Date(s); d.setDate(d.getDate()+Number(n)); return d}
function diffDays(a,b){return Math.floor((parseDate(a)-parseDate(b))/86400000)}
function frDate(s,opts={day:'2-digit',month:'2-digit',year:'numeric'}){const d=typeof s==='string'?parseDate(s):s; return d?d.toLocaleDateString('fr-FR',opts):'—'}
function ageText(b){const d=parseDate(b); if(!d)return 'âge inconnu'; let m=(today().getFullYear()-d.getFullYear())*12+today().getMonth()-d.getMonth(); if(today().getDate()<d.getDate())m--; return m<24?`${m} mois`:`${Math.floor(m/12)} ans ${m%12?m%12+' mois':''}`.trim()}
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
  for(const c of state.cows){
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
  $('#countPregnant').textContent=state.cows.filter(c=>['pregnant','presumed'].includes(reproductiveStatus(c).key)).length;
  $('#todayAlerts').innerHTML=td.length?td.map(alertHTML).join(''):`<div class="empty">✅ Rien de particulier à surveiller aujourd’hui.</div>`;
  $('#weekAlerts').innerHTML=wk.length?wk.slice(0,20).map(alertHTML).join(''):`<div class="empty">Aucune échéance dans les 7 prochains jours.</div>`;
  bindCowOpen();
}
function alertHTML(a){return `<button class="card alert-card open-cow" data-id="${esc(a.cow.id)}"><span class="alert-icon">${a.icon}</span><span><span class="alert-title">${esc(a.cow.name||'Sans nom')} · ${esc(a.cow.workNumber)}</span><span class="alert-meta">${esc(a.title)} — ${esc(a.meta)}</span></span><span>›</span></button>`}

function renderCows(){
  const q=norm($('#cowSearch')?.value||'');
  let list=state.cows.filter(c=>!q||norm(c.name).includes(q)||norm(c.workNumber).includes(q)||norm(c.id).includes(q));
  if(cowFilter==='pregnant')list=list.filter(c=>['pregnant','presumed'].includes(reproductiveStatus(c).key));
  if(cowFilter==='watch')list=list.filter(c=>['watch'].includes(reproductiveStatus(c).key)||alertsForDay(dateISO(today())).some(a=>a.cow.id===c.id));
  if(cowFilter==='postpartum')list=list.filter(c=>reproductiveStatus(c).key==='postpartum');
  list.sort((a,b)=>(a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true}));
  $('#cowList').innerHTML=list.length?list.map(c=>{const s=reproductiveStatus(c), lc=lastCalving(c); return `<button class="card cow-card open-cow" data-id="${esc(c.id)}"><span><span class="cow-name">${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</span><span class="cow-sub">${ageText(c.birthDate)}${lc?` • dernier vêlage ${frDate(lc)}`:''}${c.calvingCount?` • rang ${c.calvingCount}`:''}</span></span><span class="badge ${s.cls}">${esc(s.label)}</span></button>`}).join(''):`<div class="empty">Aucune vache trouvée.</div>`;
  bindCowOpen();
}
function bindCowOpen(){ $$('.open-cow').forEach(b=>b.onclick=()=>openCow(b.dataset.id)) }
function openCow(id){
  const c=state.cows.find(x=>x.id===id); if(!c)return; const s=reproductiveStatus(c), ev=events(c).slice().reverse(); const svc=lastService(c);
  let calc=''; if(['pregnant','presumed','watch'].includes(s.key)&&svc){const term=dateISO(addDays(svc.date,state.settings.term)), remain=diffDays(term,dateISO(today())); calc=`<div class="card"><strong>${s.key==='pregnant'?'Pleine':'Supposée pleine / suivie'} depuis ${s.days} jours</strong><div class="cow-sub">Terme théorique : ${frDate(term)} • ${remain>=0?remain+' jours restants':Math.abs(remain)+' jours après terme'}</div></div>`}
  $('#cowDetail').innerHTML=`<div class="dialog-head"><div><h2>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</h2><div class="muted">${esc(c.id)} • ${ageText(c.birthDate)}</div></div><button class="iconbtn" id="closeCow">✕</button></div>
  <p><span class="badge ${s.cls}">${esc(s.label)}</span></p>${calc}
  <div class="card"><strong>Repères</strong><div class="cow-sub">Dernier vêlage : ${frDate(lastCalving(c))} • Rang retrouvé : ${c.calvingCount||'—'}</div></div>
  <button class="primary wide" id="addForCow">＋ Ajouter un événement</button>
  <h3>Historique</h3><div class="timeline">${ev.length?ev.map(e=>`<div class="timeline-item"><strong>${eventLabel(e)}</strong><div class="cow-sub">${frDate(e.date)}${e.bull?` • ${esc(e.bull)}`:''}${e.note?` • ${esc(e.note)}`:''}</div></div>`).join(''):`<div class="muted">Aucun événement saisi dans l’application.</div>`}</div>`;
  $('#closeCow').onclick=()=>$('#cowDialog').close(); $('#addForCow').onclick=()=>{ $('#cowDialog').close(); openEvent(c.id)}; $('#cowDialog').showModal();
}
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
 $('#dataInfo').textContent=`Base actuelle : ${state.cows.length} vaches • ${state.males.length} mâles • source ${state.meta?.source||'locale'}`;
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
 const existing=new Map(state.cows.map(c=>[c.id,c])); const active=records.filter(r=>!r['Date sortie']); const cows=active.filter(r=>r.Sexe==='F').map(r=>{const old=existing.get(r['Identifiant bovin']), b=(births[r['Identifiant bovin']]||[]).filter(Boolean); return {id:r['Identifiant bovin'],workNumber:r['Numéro travail'],name:r.Nom,birthDate:dmyToIso(r['Date naissance']),breed:r['Type racial']||'',lastCalving:old?.lastCalving||b.at(-1)||'',calvingCount:Math.max(old?.calvingCount||0,b.length),events:old?.events||[]}});
 const oldM=new Map(state.males.map(b=>[b.id,b])); const males=active.filter(r=>r.Sexe==='M').map(r=>({id:r['Identifiant bovin'],workNumber:r['Numéro travail'],name:r.Nom,birthDate:dmyToIso(r['Date naissance']),activeBreeder:oldM.get(r['Identifiant bovin'])?.activeBreeder||false}));
 state.cows=cows;state.males=males;state.meta={source:name,importedAt:dateISO(today())};save();
}

function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`repro-bovine-sauvegarde-${dateISO(today())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
async function requestNotifications(){
 if(!('Notification'in window)){alert('Les notifications ne sont pas disponibles dans ce navigateur. Les alertes restent visibles dans l’application.');return}
 const p=await Notification.requestPermission(); if(p==='granted'){const n=alertsForDay(dateISO(today())).length; new Notification('Repro Bovine',{body:n?`${n} surveillance(s) prévue(s) aujourd’hui.`:'Aucune surveillance particulière aujourd’hui.'})}
}

function renderAll(){renderHome();renderCows();renderBulls();renderSettings();renderCalendar()}
function switchView(v){$$('.view').forEach(x=>x.classList.remove('active')); $(`#view-${v}`).classList.add('active'); $$('.bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v)); if(v==='cows')renderCows(); if(v==='calendar')renderCalendar()}

document.addEventListener('DOMContentLoaded',()=>{
 $('#todayLabel').textContent=today().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 $$('.bottomnav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view)); $('#quickAddBtn').onclick=()=>openEvent();
 $('#cowSearch').oninput=renderCows; $$('.chip').forEach(b=>b.onclick=()=>{$$('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');cowFilter=b.dataset.cowFilter;renderCows()});
 $('#eventCowSearch').oninput=()=>{const q=norm($('#eventCowSearch').value); if(q.length<1){$('#eventCowMatches').innerHTML='';return} const list=state.cows.filter(c=>norm(c.name).includes(q)||norm(c.workNumber).includes(q)).slice(0,8); $('#eventCowMatches').innerHTML=list.map(c=>`<button type="button" class="match" data-pick="${esc(c.id)}"><strong>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</strong><div class="cow-sub">${ageText(c.birthDate)}</div></button>`).join(''); $$('[data-pick]').forEach(b=>b.onclick=()=>selectEventCow(state.cows.find(c=>c.id===b.dataset.pick)))};
 $('#eventType').onchange=updateServiceFields; $('#serviceMode').onchange=updateServiceFields; $('#eventForm').onsubmit=addEventFromForm;
 $('#addBullBtn').onclick=()=>$('#bullDialog').showModal(); $('#bullForm').onsubmit=e=>{e.preventDefault();state.males.push({id:'manual-'+uid(),name:$('#bullName').value.trim(),workNumber:$('#bullNumber').value.trim(),birthDate:'',activeBreeder:true});save();$('#bullDialog').close();$('#bullForm').reset()};
 $('#saveSettingsBtn').onclick=()=>{Object.keys(DEFAULTS).forEach(k=>state.settings[k]=Math.max(0,Number($(`#set-${k}`).value)||0));save();alert('Réglages enregistrés.')}; $('#resetSettingsBtn').onclick=()=>{state.settings={...DEFAULTS};save()};
 $('#csvInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{importHerdCSV(await f.text(),f.name);alert(`Import terminé : ${state.cows.length} vaches présentes.`)}catch(err){alert('Import impossible : '+err.message)}e.target.value=''};
 $('#exportBtn').onclick=exportBackup; $('#restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!x.cows||!x.settings)throw Error('format incorrect');state=x;save();alert('Sauvegarde restaurée.')}catch(err){alert('Restauration impossible : '+err.message)}e.target.value=''};
 $('#notifyBtn').onclick=requestNotifications;
 $$('#calendarMode button').forEach(b=>b.onclick=()=>{$$('#calendarMode button').forEach(x=>x.classList.remove('active'));b.classList.add('active');calMode=b.dataset.mode;renderCalendar()});
 $('#calPrev').onclick=()=>{calDate=addDays(calDate,calMode==='day'?-1:calMode==='week'?-7:-30);renderCalendar()}; $('#calNext').onclick=()=>{calDate=addDays(calDate,calMode==='day'?1:calMode==='week'?7:30);renderCalendar()};
 renderAll(); if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  if('Notification' in window && Notification.permission==='granted'){const key='reproNotif-'+dateISO(today()); if(!localStorage.getItem(key)){const n=alertsForDay(dateISO(today())).length; if(n)new Notification('Repro Bovine',{body:`${n} surveillance(s) prévue(s) aujourd’hui.`}); localStorage.setItem(key,'1')}}
});
