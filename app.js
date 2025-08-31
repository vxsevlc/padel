/* ======== UTILIDADES FECHA (Solo DOMINGO + Festivos) ======== */
const MS_DAY = 86400000;

function fmtISO(d){ // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function esDateStr(d){ // Domingo, 07/09/2025
  const opts = { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' };
  let s = d.toLocaleDateString('es-ES', opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function getNextSundayFrom(today){
  const dow = today.getDay(); // 0 dom ... 6 sab
  const add = (7 - dow) % 7; // días hasta domingo
  const sun = new Date(today);
  sun.setDate(sun.getDate() + add);
  return sun;
}
function addWeeks(d, w){
  const out = new Date(d);
  out.setDate(out.getDate() + w*7);
  return out;
}
function weekKeyFromDate(sunday){ // "YYYY-WW"
  const onejan = new Date(sunday.getFullYear(),0,1);
  const millis = sunday - onejan + (onejan.getTimezoneOffset()-sunday.getTimezoneOffset())*60000;
  const week = Math.floor((millis / MS_DAY + onejan.getDay()+6)/7)+1;
  return `${sunday.getFullYear()}-${String(week).padStart(2,'0')}`;
}

/* ======== JUGADORES PREDETERMINADOS ======== */
const DEFAULT_PLAYERS = [
  {id:'juan',   name:'Juan',   emoji:'🐷'},
  {id:'jonfi',  name:'Jonfi',  emoji:'🏃‍♂️'},
  {id:'bolopo', name:'Bolopo', emoji:'🦝'},  // sarigüeya aprox
  {id:'korky',  name:'Korky',  emoji:'🦅'},
  {id:'candy',  name:'Candy',  emoji:'🚦'},  // farola aprox
  {id:'bofi',   name:'Bofi',   emoji:'👮'},
  {id:'buades', name:'Buades', emoji:'🦊'},  // aleatorio simpático
  {id:'ramos',  name:'Ramos',  emoji:'🏄‍♂️'} // tabla de surf
];

/* ======== STATE + PERSISTENCIA LOCAL ======== */
/*
 store = {
   weeks: {
     [weekKey]: {
       days: {
         [YYYY-MM-DD]: { players:Set([...]), time:"HH:MM" }
       },
       extras: [{date:YYYY-MM-DD, label:string}]
     }
   },
   beers: [{weekKey, date:YYYY-MM-DD, name, amount}]
 }
*/
const STORE_KEY = 'padel-casa-jonfi-v2';
const store = { weeks:{}, beers:[] };

function loadStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    Object.values(parsed.weeks||{}).forEach(w=>{
      Object.values(w.days||{}).forEach(d=>{
        if(Array.isArray(d.players)) d.players = new Set(d.players);
      });
    });
    Object.assign(store, parsed);
  }catch(e){ console.warn('No se pudo cargar store', e); }
}
function saveStore(){
  const copy = JSON.parse(JSON.stringify(store, (k,v)=>{
    if(v instanceof Set) return Array.from(v);
    return v;
  }));
  localStorage.setItem(STORE_KEY, JSON.stringify(copy));
}

/* ======== ELEMENTOS ======== */
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

let weekOffset = 0; // 0 = próximo domingo; +/- para moverse
let currentSunday = null;

/* ======== ESTRUCTURA DE SEMANA ======== */
function ensureWeekStructure(weekKey, sunday){
  if(!store.weeks[weekKey]){
    store.weeks[weekKey] = { days:{}, extras:[] };
  }
  const dSun = fmtISO(sunday);
  if(!store.weeks[weekKey].days[dSun])
    store.weeks[weekKey].days[dSun] = { players:new Set(), time:'10:00' }; // hora por defecto
}

/* ======== SELECTOR DE HORAS (cada 15 min) ======== */
function buildHourOptions(){
  // 08:00 a 22:00 cada 15 minutos
  const opts = [];
  for(let h=8; h<=22; h++){
    for(let m=0; m<60; m+=15){
      const hh = String(h).padStart(2,'0');
      const mm = String(m).padStart(2,'0');
      opts.push(`${hh}:${mm}`);
    }
  }
  return opts;
}
const HOUR_OPTIONS = buildHourOptions();

/* ======== RENDER SEMANA ======== */
function renderWeek(){
  const today = new Date();
  const baseSunday = addWeeks(getNextSundayFrom(today), weekOffset);
  currentSunday = baseSunday;
  const weekKey = weekKeyFromDate(baseSunday);

  ensureWeekStructure(weekKey, baseSunday);
  saveStore();

  el.weekTitle.textContent = `Semana ${baseSunday.getDate()}/${baseSunday.getMonth()+1}/${baseSunday.getFullYear()}`;

  const wk = store.weeks[weekKey];
  el.daysContainer.innerHTML = '';

  const days = [
    {date: baseSunday, label:'Domingo'}
  ];

  // añadir festivos guardados
  const extras = (wk.extras||[]).slice().sort((a,b)=> a.date.localeCompare(b.date));
  extras.forEach(x=>{
    const d = new Date(x.date+'T00:00:00');
    if(!wk.days[x.date]) wk.days[x.date] = { players:new Set(), time:'10:00' };
    days.push({date:d, label: x.label || 'Festivo'});
  });

  days.forEach(d=>{
    const dayKey = fmtISO(d.date);
    const card = document.createElement('section');
    card.className = 'card';

    // Cabecera día
    const head = document.createElement('div');
    head.className = 'day-head';
    const t = document.createElement('div');
    t.className = 'day-title'; t.textContent = d.label;
    const dt = document.createElement('div');
    dt.className = 'day-date'; dt.textContent = esDateStr(d.date);
    head.appendChild(t); head.appendChild(dt);
    card.appendChild(head);

    // Selector de hora
    const timeRow = document.createElement('div');
    timeRow.className = 'time-row';
    const lbl = document.createElement('label');
    lbl.textContent = 'Hora';
    const select = document.createElement('select');
    HOUR_OPTIONS.forEach(hhmm=>{
      const opt = document.createElement('option');
      opt.value = hhmm; opt.textContent = hhmm;
      select.appendChild(opt);
    });
    // valor guardado o por defecto
    const savedTime = store.weeks[weekKey].days[dayKey]?.time || '10:00';
    select.value = savedTime;
    select.addEventListener('change', ()=>{
      setTimeForDay(weekKey, dayKey, select.value);
    });
    timeRow.appendChild(lbl); timeRow.appendChild(select);
    card.appendChild(timeRow);

    // grid de jugadores
    const grid = document.createElement('div');
    grid.className = 'player-grid';
    DEFAULT_PLAYERS.forEach(p=>{
      grid.appendChild(renderPlayerChip(weekKey, dayKey, p.name, p.emoji));
    });

    // invitados (no duplicar)
    const savedNames = Array.from((store.weeks[weekKey].days[dayKey]?.players)||[]);
    const guestOnly = savedNames.filter(n => !DEFAULT_PLAYERS.some(dp=>dp.name===n));
    guestOnly.forEach(name=>{
      grid.appendChild(renderPlayerChip(weekKey, dayKey, name, '👤', true));
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
      grid.appendChild(renderPlayerChip(weekKey, dayKey, name, '👤', true));
      inp.value='';
    });
    addWrap.appendChild(inp); addWrap.appendChild(btn);
    card.appendChild(addWrap);

    el.daysContainer.appendChild(card);
  });
}

/* ======== RENDER CHIP JUGADOR ======== */
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
function setTimeForDay(weekKey, dayKey, hhmm){
  const day = store.weeks[weekKey].days[dayKey];
  day.time = hhmm;
  saveStore();
}

/* ======== FESTIVO ======== */
function addFestivo(){
  const dateStr = (el.festivoDate.value||'').trim();
  if(!dateStr) return;
  const label = (el.festivoLabel.value||'').trim();
  const wkKey = weekKeyFromDate(currentSunday);
  const wk = store.weeks[wkKey];

  // Rango de semana: lunes a domingo de esa semana (dom es currentSunday)
  const sunday = new Date(currentSunday);
  const monday = new Date(sunday); monday.setDate(sunday.getDate()-6); // lunes
  const d = new Date(dateStr+'T00:00:00');

  if(d < monday || d > sunday){
    alert('La fecha no pertenece a esta semana.');
    return;
  }
  if(!wk.extras.some(x=>x.date===dateStr)){
    wk.extras.push({date:dateStr, label: label || 'Festivo'});
    if(!wk.days[dateStr]) wk.days[dateStr] = {players:new Set(), time:'10:00'};
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
  const wkKey = weekKeyFromDate(currentSunday);
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
  const items = store.beers.slice().reverse();
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

  // por defecto
  const today = new Date();
  el.festivoDate.value = fmtISO(today);

  renderWeek();
  renderBeer();
}

document.addEventListener('DOMContentLoaded', init);
