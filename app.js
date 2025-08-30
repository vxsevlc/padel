/* ======== UTILIDADES FECHA (Europa/Madrid) ======== */
const MS_DAY = 86400000;
const tzOffsetMs = (() => {
  // For rendering we usamos local TZ; al persistir guardamos YYYY-MM-DD
  return 0;
})();

function fmtISO(d){ // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function esDateStr(d){ // Sábado 06/09/2025
  const opts = { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' };
  let s = d.toLocaleDateString('es-ES', opts);
  // capitalizar primera letra
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function getNextWeekendFrom(today){
  // devuelve sábado y domingo próximos (incluye hoy si es sábado/domingo)
  const dow = today.getDay(); // 0 dom ... 6 sab
  let sat = new Date(today);
  let addDays = (6 - dow + 7) % 7; // días hasta sábado
  sat.setDate(sat.getDate() + addDays);
  const sun = new Date(sat); sun.setDate(sun.getDate()+1);
  return {sat, sun};
}
function addWeeks(d, w){
  const out = new Date(d);
  out.setDate(out.getDate() + w*7);
  return out;
}
function weekKeyFromDate(sat){ // "YYYY-WW" ISO-like (aprox)
  const onejan = new Date(sat.getFullYear(),0,1);
  const millis = sat - onejan + (onejan.getTimezoneOffset()-sat.getTimezoneOffset())*60000;
  const week = Math.floor((millis / MS_DAY + onejan.getDay()+6)/7)+1;
  return `${sat.getFullYear()}-${String(week).padStart(2,'0')}`;
}

/* ======== DATOS/JUGADORES ======== */
const DEFAULT_PLAYERS = [
  {id:'juan',   name:'Juan',   emoji:'🐷'},
  {id:'jonfi',  name:'Jonfi',  emoji:'🏃‍♂️'},
  {id:'bolopo', name:'Bolopo', emoji:'🦝'}, 
  {id:'korky',  name:'Korky',  emoji:'🦅'},
  {id:'candy',  name:'Candy',  emoji:'🚦'},
  {id:'bofi',   name:'Bofi',   emoji:'👮'},
  {id:'buades', name:'Buades', emoji:'🦊'},   // NUEVO
  {id:'ramos',  name:'Ramos',  emoji:'🏄‍♂️'} // NUEVO
];


/* ======== STATE + PERSISTENCIA LOCAL ======== */
const STORE_KEY = 'padel-casa-jonfi-v1';
const store = {
  // weeks: { [weekKey]: { days:{ [YYYY-MM-DD]: {players:Set([...nombres]) } }, extras:[{date,label}] } }
  weeks: {},
  // beers: [{weekKey, date: YYYY-MM-DD, name, amount}]
  beers: []
};
function loadStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      // restaurar sets
      Object.values(parsed.weeks||{}).forEach(w=>{
        Object.values((w.days||{})).forEach(d=>{
          if(Array.isArray(d.players)) d.players = new Set(d.players);
        });
      });
      Object.assign(store, parsed);
    }
  }catch(e){ console.warn('No se pudo cargar store', e); }
}
function saveStore(){
  const copy = JSON.parse(JSON.stringify(store, (k,v)=>{
    if(v instanceof Set) return Array.from(v);
    return v;
  }));
  localStorage.setItem(STORE_KEY, JSON.stringify(copy));
}

/* ======== RENDER UI ======== */
const el = {
  tabPartidas: document.getElementById('tab-partidas'),
  tabCervezas: document.getElementById('tab-cervezas'),
  viewPartidas: document.getElementById('view-partidas'),
  viewCervezas: document.getElementById('view-cervezas'),

  weekTitle: document.getElementById('week-title'),
  btnPrevWeek: document.getElementById('btn-prev-week'),
  btnNextWeek: document.getElementById('btn-next-week'),
  daysContainer: document.getElementById('days-container'),

  festivoDate: document.getElementById('festivo-date'),
  festivoLabel: document.getElementById('festivo-label'),
  btnAddFestivo: document.getElementById('btn-add-festivo'),

  beerName: document.getElementById('beer-name'),
  beerAmount: document.getElementById('beer-amount'),
  btnAddBeer: document.getElementById('btn-add-beer'),
  beerList: document.getElementById('beer-list'),
  summaryList: document.getElementById('summary-list'),
  summaryEmpty: document.getElementById('summary-empty'),
};

let weekOffset = 0; // 0 = próximo finde; -1 anterior; +1 siguiente...
let currentWeekend = null;

function ensureWeekStructure(weekKey, sat, sun){
  if(!store.weeks[weekKey]){
    store.weeks[weekKey] = { days:{}, extras:[] };
  }
  const wk = store.weeks[weekKey];
  const dSat = fmtISO(sat), dSun = fmtISO(sun);
  if(!wk.days[dSat]) wk.days[dSat] = {players:new Set()};
  if(!wk.days[dSun]) wk.days[dSun] = {players:new Set()};
}

function renderWeek(){
  const today = new Date();
  const base = getNextWeekendFrom(today);
  const baseSat = addWeeks(base.sat, weekOffset);
  const baseSun = addWeeks(base.sun, weekOffset);
  currentWeekend = {sat:baseSat, sun:baseSun};
  const weekKey = weekKeyFromDate(baseSat);

  ensureWeekStructure(weekKey, baseSat, baseSun);
  saveStore();

  // Título semana
  const title = `Semana ${baseSat.getDate()}/${baseSat.getMonth()+1} - ${baseSun.getDate()}/${baseSun.getMonth()+1} ${baseSun.getFullYear()}`;
  el.weekTitle.textContent = title;

  // Render días
  const wk = store.weeks[weekKey];
  el.daysContainer.innerHTML = '';
  const days = [
    {date: baseSat, label:'Sábado'},
    {date: baseSun, label:'Domingo'}
  ];

  // extras (ordenar por fecha asc)
  const extras = (wk.extras||[]).slice().sort((a,b)=> a.date.localeCompare(b.date));
  extras.forEach(x=>{
    const d = new Date(x.date+'T00:00:00');
    days.push({date:d, label: x.label || 'Festivo'});
    // asegurar estructura día extra
    if(!wk.days[x.date]) wk.days[x.date] = {players:new Set()};
  });

  days.forEach(d=>{
    const dayKey = fmtISO(d.date);
    const card = document.createElement('section');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'day-head';
    const t = document.createElement('div');
    t.className = 'day-title';
    t.textContent = d.label;
    const dt = document.createElement('div');
    dt.className = 'day-date';
    dt.textContent = esDateStr(d.date);
    head.appendChild(t); head.appendChild(dt);
    card.appendChild(head);

    // grid jugadores habituales
    const grid = document.createElement('div');
    grid.className = 'player-grid';
    DEFAULT_PLAYERS.forEach(p=>{
      grid.appendChild(renderPlayerChip(weekKey, dayKey, p.name, p.emoji));
    });

    // invitados ya guardados (no duplicar con habituales)
    const savedNames = Array.from((store.weeks[weekKey].days[dayKey]?.players)||[]);
    const guestOnly = savedNames.filter(n => !DEFAULT_PLAYERS.some(dp=>dp.name===n));
    guestOnly.forEach(name=>{
      grid.appendChild(renderPlayerChip(weekKey, dayKey, name, '👤', /*isGuest*/true));
    });

    card.appendChild(grid);

    // Añadir invitado
    const addWrap = document.createElement('div');
    addWrap.className = 'add-guest';
    const inp = document.createElement('input');
    inp.type='text'; inp.placeholder='Otro jugador (puedes incluir emoji)';
    const btn = document.createElement('button');
    btn.className='primary'; btn.textContent='Añadir';
    btn.addEventListener('click', ()=>{
      const name = (inp.value||'').trim();
      if(!name) return;
      addPlayerToDay(weekKey, dayKey, name);
      // render chip
      grid.appendChild(renderPlayerChip(weekKey, dayKey, name, '👤', true));
      inp.value='';
    });
    addWrap.appendChild(inp); addWrap.appendChild(btn);
    card.appendChild(addWrap);

    el.daysContainer.appendChild(card);
  });
}

function renderPlayerChip(weekKey, dayKey, name, emoji, isGuest=false){
  const isSelected = !!store.weeks[weekKey].days[dayKey]?.players?.has(name);
  const chip = document.createElement('button');
  chip.className = 'player-chip' + (isSelected ? ' selected' : '');
  chip.setAttribute('type','button');
  chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

  const em = document.createElement('span'); em.className='emoji'; em.textContent = emoji || '🎾';
  const nm = document.createElement('span'); nm.className='name'; nm.textContent = name;
  const st = document.createElement('span'); st.className='state'; st.textContent = isSelected ? 'apuntado' : 'libre';

  chip.appendChild(em); chip.appendChild(nm); chip.appendChild(st);

  chip.addEventListener('click', ()=>{
    togglePlayer(weekKey, dayKey, name);
    const sel = store.weeks[weekKey].days[dayKey].players.has(name);
    chip.classList.toggle('selected', sel);
    chip.setAttribute('aria-pressed', sel ? 'true' : 'false');
    st.textContent = sel ? 'apuntado' : 'libre';
  });

  return chip;
}

/* ======== MUTACIONES ======== */
function addPlayerToDay(weekKey, dayKey, name){
  const day = store.weeks[weekKey].days[dayKey];
  if(!day.players) day.players = new Set();
  day.players.add(name);
  saveStore();
}
function togglePlayer(weekKey, dayKey, name){
  const day = store.weeks[weekKey].days[dayKey];
  if(!day.players) day.players = new Set();
  if(day.players.has(name)) day.players.delete(name); else day.players.add(name);
  saveStore();
}

/* ======== FESTIVO ======== */
function addFestivo(){
  const dateStr = (el.festivoDate.value||'').trim();
  if(!dateStr) return;
  const label = (el.festivoLabel.value||'').trim();
  const {sat} = currentWeekend;
  const wkKey = weekKeyFromDate(sat);
  const wk = store.weeks[wkKey];

  // validar que la fecha cae dentro de la semana del sábado (lun-dom de esa semana)
  const monday = new Date(sat); monday.setDate(sat.getDate()-5); // lunes (siendo sab = día 6)
  const sunday = new Date(sat); sunday.setDate(sat.getDate()+1);

  const d = new Date(dateStr+'T00:00:00');
  if(d < monday || d > sunday){
    alert('La fecha no pertenece a esta semana.');
    return;
  }
  if(!wk.extras.some(x=>x.date===dateStr)){
    wk.extras.push({date:dateStr, label: label || 'Festivo'});
    if(!wk.days[dateStr]) wk.days[dateStr] = {players:new Set()};
    saveStore();
    renderWeek();
  }
  el.festivoDate.value=''; el.festivoLabel.value='';
}

/* ======== CERVEZAS ======== */
function addBeer(){
  const name = (el.beerName.value||'').trim();
  const amount = Number((el.beerAmount.value||'').trim());
  if(!name || !(amount>=0)) return;
  const {sat} = currentWeekend;
  const wkKey = weekKeyFromDate(sat);
  const today = new Date();
  const entry = {weekKey: wkKey, date: fmtISO(today), name, amount: Math.round(amount*100)/100};
  store.beers.push(entry);
  saveStore();
  el.beerName.value=''; el.beerAmount.value='';
  renderBeer();
}

function renderBeer(){
  // Historial
  el.beerList.innerHTML = '';
  const items = store.beers.slice().reverse(); // último primero
  if(items.length===0){
    el.beerList.innerHTML = '<li class="muted">Sin registros.</li>';
  }else{
    items.forEach(it=>{
      const li = document.createElement('li');
      li.innerHTML = `<span>${it.weekKey} · ${it.date} · <strong>${it.name}</strong></span><span class="amount">${it.amount.toFixed(2)}€</span>`;
      el.beerList.appendChild(li);
    });
  }
  // Resumen por jugador
  const totals = {};
  store.beers.forEach(it=>{
    totals[it.name] = (totals[it.name]||0) + Number(it.amount||0);
  });
  const names = Object.keys(totals).sort((a,b)=> totals[b]-totals[a]);
  el.summaryList.innerHTML = '';
  if(names.length===0){
    el.summaryEmpty.style.display = 'block';
  }else{
    el.summaryEmpty.style.display = 'none';
    names.forEach(n=>{
      const li = document.createElement('li');
      li.innerHTML = `<span>${n}</span><span class="amount">${totals[n].toFixed(2)}€</span>`;
      el.summaryList.appendChild(li);
    });
  }
}

/* ======== TABS ======== */
function activateTab(target){
  const isPartidas = (target === 'partidas');
  el.tabPartidas.classList.toggle('active', isPartidas);
  el.tabCervezas.classList.toggle('active', !isPartidas);
  el.viewPartidas.classList.toggle('active', isPartidas);
  el.viewCervezas.classList.toggle('active', !isPartidas);
}

/* ======== INICIO ======== */
function init(){
  loadStore();

  // tabs
  el.tabPartidas.addEventListener('click', ()=> activateTab('partidas'));
  el.tabCervezas.addEventListener('click', ()=> activateTab('cervezas'));

  // semanas
  el.btnPrevWeek.addEventListener('click', ()=>{ weekOffset--; renderWeek(); });
  el.btnNextWeek.addEventListener('click', ()=>{ weekOffset++; renderWeek(); });

  // festivo
  el.btnAddFestivo.addEventListener('click', addFestivo);

  // cervezas
  el.btnAddBeer.addEventListener('click', addBeer);

  // fecha festivo por defecto = hoy
  const today = new Date(); el.festivoDate.value = fmtISO(today);

  renderWeek();
  renderBeer();
}

document.addEventListener('DOMContentLoaded', init);

