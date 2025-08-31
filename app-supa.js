// app-supa.js

/* ===== Supabase init ===== */
const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);

/* ===== Utilidades fecha (Domingo + Festivos) ===== */
const MS_DAY = 86400000;

function fmtISO(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function esDateStr(d){
  const opts = { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' };
  let s = d.toLocaleDateString('es-ES', opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function getNextSundayFrom(today){
  const dow = today.getDay();
  const add = (7 - dow) % 7;
  const sun = new Date(today);
  sun.setDate(sun.getDate()+add);
  return sun;
}
function addWeeks(d,w){ const out=new Date(d); out.setDate(out.getDate()+w*7); return out; }
function weekKeyFromDate(sunday){
  const onejan = new Date(sunday.getFullYear(),0,1);
  const week = Math.floor(((sunday - onejan) / MS_DAY + (onejan.getDay()+6)) / 7) + 1;
  return `${sunday.getFullYear()}-${String(week).padStart(2,'0')}`;
}

/* ===== Jugadores fijos ===== */
const DEFAULT_PLAYERS = [
  {id:'juan',   name:'Juan',   emoji:'🐷'},
  {id:'jonfi',  name:'Jonfi',  emoji:'🏃‍♂️'},
  {id:'bolopo', name:'Bolopo', emoji:'🦝'},
  {id:'korky',  name:'Korky',  emoji:'🦅'},
  {id:'candy',  name:'Candy',  emoji:'🚦'},
  {id:'bofi',   name:'Bofi',   emoji:'👮'},
  {id:'buades', name:'Buades', emoji:'🦊'},
  {id:'ramos',  name:'Ramos',  emoji:'🏄‍♂️'},
];

/* ===== Elementos UI ===== */
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

let weekOffset = 0;
let currentSunday = null;
let currentWeekKey = null;

/* ===== Selector de horas (cada 15 min) ===== */
const HOUR_OPTIONS = (() => {
  const opts=[]; for(let h=8; h<=22; h++){ for(let m=0;m<60;m+=15){
    opts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }} return opts;
})();

/* ===== Helper Supabase ===== */
async function ensureSundayDay(weekKey, sundayISO){
  const { data: existing, error: e1 } = await supabase
    .from('days').select('id').eq('date', sundayISO).single();
  if(e1 && e1.code !== 'PGRST116') console.warn(e1);

  if(!existing){
    const { data, error } = await supabase
      .from('days').insert({ week_key: weekKey, date: sundayISO, label:'Domingo', time:'10:00' })
      .select('id').single();
    if(error) console.error(error);
    return data?.id || null;
  }
  return existing.id;
}

async function fetchWeek(weekKey){
  const { data: days, error: eDays } = await supabase
    .from('days')
    .select('id, week_key, date, label, time')
    .eq('week_key', weekKey)
    .order('date', { ascending: true });

  if(eDays){ console.error(eDays); return {days:[], selectionsByDay:{}}; }

  const dayIds = days.map(d=>d.id);
  let selectionsByDay = {};
  if(dayIds.length){
    const { data: sel, error: eSel } = await supabase
      .from('selections')
      .select('id, day_id, name')
      .in('day_id', dayIds);
    if(!eSel && sel){
      sel.forEach(s=>{
        if(!selectionsByDay[s.day_id]) selectionsByDay[s.day_id] = [];
        selectionsByDay[s.day_id].push(s.name);
      });
    }
  }
  return { days, selectionsByDay };
}

async function upsertFestivo(weekKey, dateISO, label='Festivo'){
  const { data: existing, error: e } = await supabase
    .from('days').select('id').eq('date', dateISO).maybeSingle();
  if(e) console.error(e);

  if(!existing){
    const { error } = await supabase.from('days')
      .insert({ week_key: weekKey, date: dateISO, label, time:'10:00' });
    if(error) console.error(error);
  }else if(label && label !== 'Festivo'){
    await supabase.from('days').update({label}).eq('id', existing.id);
  }
}

async function setTime(dayId, hhmm){
  const { error } = await supabase.from('days').update({ time: hhmm }).eq('id', dayId);
  if(error) console.error(error);
}

async function toggleSelection(dayId, name){
  const { data: exists, error: e1 } = await supabase
    .from('selections').select('id').eq('day_id', dayId).eq('name', name).maybeSingle();
  if(e1) console.error(e1);
  if(exists){
    const { error } = await supabase.from('selections').delete().eq('id', exists.id);
    if(error) console.error(error);
  }else{
    const { error } = await supabase.from('selections').insert({ day_id: dayId, name });
    if(error) console.error(error);
  }
}

async function addBeerRecord(weekKey, name, amount){
  const todayISO = fmtISO(new Date());
  const { error } = await supabase
    .from('beers').insert({ week_key: weekKey, date: todayISO, name, amount });
  if(error) console.error(error);
}

async function fetchBeers(){
  const { data, error } = await supabase
    .from('beers').select('id, week_key, date, name, amount').order('id', { ascending:false });
  if(error){ console.error(error); return []; }
  return data || [];
}

/* ===== Render ===== */
async function renderWeek(){
  const today = new Date();
  const baseSunday = addWeeks(getNextSundayFrom(today), weekOffset);
  currentSunday = baseSunday;
  currentWeekKey = weekKeyFromDate(baseSunday);
  el.weekTitle.textContent = `Semana ${baseSunday.getDate()}/${baseSunday.getMonth()+1}/${baseSunday.getFullYear()}`;

  const sundayISO = fmtISO(baseSunday);
  await ensureSundayDay(currentWeekKey, sundayISO);

  const { days, selectionsByDay } = await fetchWeek(currentWeekKey);

  el.daysContainer.innerHTML = '';
  const sorted = days.slice().sort((a,b)=> (a.date<b.date? -1 : a.date>b.date? 1 : 0));
  for(const d of sorted){
    const card = document.createElement('section');
    card.className = 'card';

    const head = document.createElement('div'); head.className='day-head';
    const t = document.createElement('div'); t.className='day-title'; t.textContent = d.label;
    const dt = document.createElement('div'); dt.className='day-date'; dt.textContent = esDateStr(new Date(d.date+'T00:00:00'));
    head.appendChild(t); head.appendChild(dt); card.appendChild(head);

    const timeRow = document.createElement('div'); timeRow.className='time-row';
    const lbl = document.createElement('label'); lbl.textContent='Hora';
    const select = document.createElement('select');
    HOUR_OPTIONS.forEach(h=>{
      const opt=document.createElement('option'); opt.value=h; opt.textContent=h; select.appendChild(opt);
    });
    select.value = d.time || '10:00';
    select.addEventListener('change', ()=> setTime(d.id, select.value));
    timeRow.appendChild(lbl); timeRow.appendChild(select); card.appendChild(timeRow);

    const grid = document.createElement('div'); grid.className='player-grid';
    const selectedNames = new Set((selectionsByDay[d.id]||[]));
    DEFAULT_PLAYERS.forEach(p=>{
      grid.appendChild(renderPlayerChip(d.id, p.name, p.emoji, selectedNames.has(p.name)));
    });
    const guests = (selectionsByDay[d.id]||[]).filter(n => !DEFAULT_PLAYERS.some(dp=>dp.name===n));
    guests.forEach(name=>{
      grid.appendChild(renderPlayerChip(d.id, name, '👤', true));
    });
    card.appendChild(grid);

    const addWrap = document.createElement('div'); addWrap.className='add-guest';
    const inp = document.createElement('input'); inp.type='text'; inp.placeholder='Otro jugador (puedes incluir emoji)';
    const btn = document.createElement('button'); btn.className='primary'; btn.textContent='Añadir';
    btn.addEventListener('click', async ()=>{
      const name = (inp.value||'').trim(); if(!name) return;
      await toggleSelection(d.id, name);
      inp.value='';
    });
    addWrap.appendChild(inp); addWrap.appendChild(btn);
    card.appendChild(addWrap);

    el.daysContainer.appendChild(card);
  }
}

function renderPlayerChip(dayId, name, emoji, isSelected){
  const chip = document.createElement('button');
  chip.className = 'player-chip' + (isSelected ? ' selected' : '');
  chip.type='button';
  chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  const em=document.createElement('span'); em.className='emoji'; em.textContent = emoji || '🎾';
  const nm=document.createElement('span'); nm.className='name'; nm.textContent = name;
  const st=document.createElement('span'); st.className='state'; st.textContent = isSelected ? 'apuntado' : 'libre';
  chip.appendChild(em); chip.appendChild(nm); chip.appendChild(st);

  chip.addEventListener('click', async ()=>{
    await toggleSelection(dayId, name);
    // Realtime recargará la semana
  });

  return chip;
}

async function renderBeers(){
  const data = await fetchBeers();

  el.beerList.innerHTML = '';
  if(!data.length){
    el.beerList.innerHTML = '<li class="muted">Sin registros.</li>';
  }else{
    data.forEach(it=>{
      const li=document.createElement('li');
      li.innerHTML = `<span>${it.week_key} · ${it.date} · <strong>${it.name}</strong></span><span class="amount">${Number(it.amount).toFixed(2)}€</span>`;
      el.beerList.appendChild(li);
    });
  }

  const totals = {};
  data.forEach(it=>{ totals[it.name]=(totals[it.name]||0)+Number(it.amount||0); });
  const names = Object.keys(totals).sort((a,b)=> totals[b]-totals[a]);
  el.summaryList.innerHTML = '';
  if(!names.length){
    el.summaryEmpty.style.display='block';
  }else{
    el.summaryEmpty.style.display='none';
    names.forEach(n=>{
      const li=document.createElement('li');
      li.innerHTML = `<span>${n}</span><span class="amount">${totals[n].toFixed(2)}€</span>`;
      el.summaryList.appendChild(li);
    });
  }
}

/* ===== Festivo ===== */
async function addFestivo(){
  const dateStr = (el.festivoDate.value||'').trim(); if(!dateStr) return;
  const label = (el.festivoLabel.value||'').trim() || 'Festivo';

  const sunday = currentSunday;
  const monday = new Date(sunday); monday.setDate(sunday.getDate()-6);
  const d = new Date(dateStr+'T00:00:00');
  if(d < monday || d > sunday){ alert('La fecha no pertenece a esta semana.'); return; }

  await upsertFestivo(currentWeekKey, dateStr, label);
  el.festivoDate.value=''; el.festivoLabel.value='';
}

/* ===== Cervezas ===== */
async function addBeer(){
  const name=(el.beerName.value||'').trim();
  const amount=Number((el.beerAmount.value||'').trim());
  if(!name || !(amount>=0)) return;
  await addBeerRecord(currentWeekKey, name, Math.round(amount*100)/100);
  el.beerName.value=''; el.beerAmount.value='';
}

/* ===== Tabs ===== */
function activateTab(target){
  const isPartidas=(target==='partidas');
  el.tabPartidas.classList.toggle('active', isPartidas);
  el.tabCervezas.classList.toggle('active', !isPartidas);
  el.viewPartidas.classList.toggle('active', isPartidas);
  el.viewCervezas.classList.toggle('active', !isPartidas);
}

/* ===== Realtime ===== */
let channelDays = null;
let channelSelections = null;
let channelBeers = null;

function unsubscribeChannels(){
  if(channelDays){ supabase.removeChannel(channelDays); channelDays=null; }
  if(channelSelections){ supabase.removeChannel(channelSelections); channelSelections=null; }
  if(channelBeers){ supabase.removeChannel(channelBeers); channelBeers=null; }
}

function subscribeWeekRealtime(weekKey){
  unsubscribeChannels();

  channelDays = supabase
    .channel('days-'+weekKey)
    .on('postgres_changes', { event: '*', schema:'public', table:'days', filter:`week_key=eq.${weekKey}` },
      async ()=>{ await renderWeek(); })
    .subscribe();

  channelSelections = supabase
    .channel('selections-'+weekKey)
    .on('postgres_changes', { event:'*', schema:'public', table:'selections' },
      async ()=>{ await renderWeek(); })
    .subscribe();

  channelBeers = supabase
    .channel('beers')
    .on('postgres_changes', { event:'*', schema:'public', table:'beers' },
      async ()=>{ await renderBeers(); })
    .subscribe();
}

/* ===== Init ===== */
function init(){
  el.tabPartidas.addEventListener('click', ()=> activateTab('partidas'));
  el.tabCervezas.addEventListener('click', ()=> activateTab('cervezas'));

  el.btnPrevWeek.addEventListener('click', async ()=>{
    weekOffset--; await renderWeek(); subscribeWeekRealtime(currentWeekKey);
  });
  el.btnNextWeek.addEventListener('click', async ()=>{
    weekOffset++; await renderWeek(); subscribeWeekRealtime(currentWeekKey);
  });

  el.btnAddFestivo.addEventListener('click', addFestivo);
  el.btnAddBeer.addEventListener('click', addBeer);

  el.festivoDate.value = fmtISO(new Date());

  (async ()=>{
    await renderWeek();
    await renderBeers();
    subscribeWeekRealtime(currentWeekKey);
  })();
}

document.addEventListener('DOMContentLoaded', init);
