/* ============================================================
   Spesa App — Logica applicazione
   Struttura moduli:
     1. Configurazione & costanti
     2. Stato applicazione
     3. API Supabase
     4. Utilità (formato, uid, date)
     5. Sync indicator
     6. Navigazione (tab, panel, modal)
     7. Budget & mese
     8. Categorie
     9. Liste della spesa
    10. Articoli
    11. Spesa completata / storico
    12. Offerte
    13. Preferiti
    14. Render generale
    15. Avvio
   ============================================================ */

'use strict';

/* ============================================================
   1. CONFIGURAZIONE & COSTANTI
   ============================================================ */

const SB_URL = 'https://zelmmjvluhpcvgbcltxy.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbG1tanZsdWhwY3ZnYmNsdHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDE3ODgsImV4cCI6MjA5NjE3Nzc4OH0.GocYM_2GP5-RXANrs-FniMm-cqU0sP_sgndmsQOTNB8';
const TABLE = 'spesa';

const DEFAULT_CATS = ['Alimentari', 'Freschissimi', 'Bevande', 'Casa', 'Igiene', 'Altro'];

const CAT_EMOJI = {
  Alimentari: '🥦', Freschissimi: '🥩', Bevande: '🧃',
  Casa: '🧹', Igiene: '🧴', Altro: '📦',
  Surgelati: '🧊', Frutta: '🍎', Carne: '🍖',
  Pesce: '🐟', Dolci: '🍰', Animali: '🐾'
};

const WHO_EMOJI = { Io: '🧑', Lei: '👩', Entrambi: '👫' };

const MESI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
              'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];

/* ============================================================
   2. STATO APPLICAZIONE
   ============================================================ */

let state = {
  items:   [],
  history: [],
  offers:  [],
  budgets: {},
  cats:    [...DEFAULT_CATS],
  lists:   [{ id: 'default', name: 'Spesa' }]
};

let activeList     = 'default';
let activeCatFilter = 'Tutte';
let viewMonth      = new Date().getMonth();
let viewYear       = new Date().getFullYear();

/* ============================================================
   3. API SUPABASE
   ============================================================ */

/** Header comuni per tutte le chiamate Supabase */
function sbHeaders(extra = {}) {
  return {
    apikey:        SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sbGet() {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLE}?select=*&order=data.asc`,
    { headers: sbHeaders() }
  );
  if (!res.ok) throw new Error('GET fallito');
  return res.json();
}

async function sbInsert(rows) {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLE}`,
    { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(rows) }
  );
  if (!res.ok) throw new Error('INSERT fallito');
}

async function sbDelete(filter) {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLE}?${filter}`,
    { method: 'DELETE', headers: sbHeaders() }
  );
  if (!res.ok) throw new Error('DELETE fallito');
}

async function sbUpdate(id, data) {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLE}?id=eq.${id}`,
    { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(data) }
  );
  if (!res.ok) throw new Error('UPDATE fallito');
}

/** Parsa il campo JSON extra in modo sicuro */
function parseExtra(row) {
  try { return row.extra ? JSON.parse(row.extra) : {}; }
  catch { return {}; }
}

/* ============================================================
   4. UTILITÀ
   ============================================================ */

/** Formatta un numero come valuta (es. €12,50) */
function fmt(n) {
  return '€' + (+n || 0).toFixed(2).replace('.', ',');
}

/** Formatta un numero breve senza decimali se intero */
function fmtShort(n) {
  const v = +n || 0;
  return '€' + (v % 1 === 0 ? v : v.toFixed(0));
}

/** Genera un ID univoco leggibile */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Ritorna la chiave mese nel formato "YYYY-MM" */
function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function curMonthKey() {
  return monthKey(viewYear, viewMonth);
}

/** Controlla se una data ISO cade nel mese visualizzato */
function inViewMonth(iso) {
  const d = new Date(iso);
  return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
}

/* ============================================================
   5. SYNC INDICATOR
   ============================================================ */

/**
 * Aggiorna la pillola di stato sync nell'header.
 * @param {'ok'|'syncing'|'error'} status
 * @param {string} label
 */
function setSync(status, label) {
  const dot   = document.getElementById('syncDot');
  const lbl   = document.getElementById('syncLabel');
  dot.className = 'sync-dot' + (status !== 'ok' ? ' ' + status : '');
  lbl.textContent = label;
}

/* ============================================================
   6. NAVIGAZIONE — TAB, PANEL, MODAL, TOAST
   ============================================================ */

function switchTab(tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

/* Chiudi modal cliccando lo sfondo */
document.querySelectorAll('.modal-bg').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); })
);

/* ============================================================
   7. BUDGET & NAVIGAZIONE MESE
   ============================================================ */

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
  renderAll();
}

function renderMonth() {
  document.getElementById('monthName').textContent = MESI[viewMonth];
  document.getElementById('monthYear').textContent  = viewYear;

  const now    = new Date();
  const isCur  = now.getMonth() === viewMonth && now.getFullYear() === viewYear;
  document.getElementById('monthCurrent').className = 'month-current' + (isCur ? ' is-current' : '');
}

/** Somma totale speso nel mese visualizzato */
function spesoMese() {
  return state.history
    .filter(h => inViewMonth(h.date))
    .reduce((sum, h) => sum + h.total, 0);
}

async function setBudget() {
  const v = parseFloat(document.getElementById('budgetInput').value);
  if (isNaN(v) || v < 0) return;

  const mk = curMonthKey();
  state.budgets[mk] = v;
  document.getElementById('budgetInput').value = '';
  renderAll();

  try {
    await sbDelete(`and=(tipo.eq.budget,mese.eq.${mk})`);
    await sbInsert([{
      id: 'budget_' + mk, nome: 'budget', quantita: '1',
      prezzo: v, categoria: '', chi: '', spuntato: false,
      data: new Date().toISOString(), tipo: 'budget', mese: mk
    }]);
    toast('Budget ' + fmt(v) + ' impostato');
  } catch {
    toast('⚠️ Errore salvataggio');
  }
}

/* ============================================================
   8. CATEGORIE
   ============================================================ */

function renderCatSelect() {
  document.getElementById('newCat').innerHTML = state.cats
    .map(c => `<option value="${c}">${CAT_EMOJI[c] || '📦'} ${c}</option>`)
    .join('');
}

function renderCatFilter() {
  const chips = state.cats.map(c =>
    `<div class="cat-chip${activeCatFilter === c ? ' active' : ''}" onclick="setCatFilter('${c}')">${CAT_EMOJI[c] || '📦'} ${c}</div>`
  ).join('');

  document.getElementById('catFilter').innerHTML =
    `<div class="cat-chip${activeCatFilter === 'Tutte' ? ' active' : ''}" onclick="setCatFilter('Tutte')">Tutte</div>` + chips;
}

function setCatFilter(cat) {
  activeCatFilter = cat;
  renderCatFilter();
  renderLista();
}

function renderCatManage() {
  document.getElementById('catManageList').innerHTML = state.cats
    .map(c => `<div class="chip-manage">${CAT_EMOJI[c] || '📦'} ${c} <span class="del" onclick="delCategory('${c}')">×</span></div>`)
    .join('');
}

async function addCategory() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) return;
  if (state.cats.includes(name)) { toast('Già esistente'); return; }

  state.cats.push(name);
  document.getElementById('newCatName').value = '';
  renderCatManage(); renderCatSelect(); renderCatFilter();
  await saveCats();
  toast('Categoria creata');
}

async function delCategory(cat) {
  if (state.cats.length <= 1) { toast('Deve restarne almeno una'); return; }

  state.cats = state.cats.filter(c => c !== cat);
  if (activeCatFilter === cat) activeCatFilter = 'Tutte';

  renderCatManage(); renderCatSelect(); renderCatFilter(); renderLista();
  await saveCats();
  toast('Categoria eliminata');
}

async function saveCats() {
  try {
    await sbDelete('tipo=eq.meta_cats');
    await sbInsert([{
      id: 'meta_cats', nome: 'cats', quantita: '', prezzo: 0,
      categoria: '', chi: '', spuntato: false,
      data: new Date().toISOString(), tipo: 'meta_cats',
      extra: JSON.stringify({ cats: state.cats })
    }]);
  } catch {
    toast('⚠️ Errore sync categorie');
  }
}

/* ============================================================
   9. LISTE DELLA SPESA
   ============================================================ */

function renderListTabs() {
  const tabs = state.lists.map(l => {
    const canDel = l.id !== 'default';
    const xBtn   = canDel ? ` <span class="x" onclick="event.stopPropagation();delList('${l.id}')">×</span>` : '';
    return `<div class="list-tab${activeList === l.id ? ' active' : ''}" onclick="setActiveList('${l.id}')">${l.name}${xBtn}</div>`;
  }).join('');

  document.getElementById('listTabs').innerHTML =
    tabs + `<div class="list-add" onclick="openModal('modalList')">+ Lista</div>`;
}

function setActiveList(id) {
  activeList = id;
  renderListTabs();
  renderLista();
}

async function addList() {
  const name = document.getElementById('newListName').value.trim();
  if (!name) return;

  const id = uid();
  state.lists.push({ id, name });
  document.getElementById('newListName').value = '';
  closeModal('modalList');
  activeList = id;
  renderListTabs(); renderLista();
  await saveLists();
  toast('Lista creata');
}

async function delList(id) {
  const toDel = state.items.filter(i => i.lista_id === id);
  state.lists  = state.lists.filter(l => l.id !== id);
  state.items  = state.items.filter(i => i.lista_id !== id);
  if (activeList === id) activeList = 'default';

  renderListTabs(); renderLista();
  await saveLists();

  try { for (const i of toDel) await sbDelete(`id=eq.${i.id}`); } catch { /* ignora */ }
  toast('Lista eliminata');
}

async function saveLists() {
  try {
    await sbDelete('tipo=eq.meta_lists');
    await sbInsert([{
      id: 'meta_lists', nome: 'lists', quantita: '', prezzo: 0,
      categoria: '', chi: '', spuntato: false,
      data: new Date().toISOString(), tipo: 'meta_lists',
      extra: JSON.stringify({ lists: state.lists })
    }]);
  } catch {
    toast('⚠️ Errore sync liste');
  }
}

/* ============================================================
   10. ARTICOLI
   ============================================================ */

/** Genera l'HTML di una singola card articolo */
function itemCard(item) {
  const priceHtml = item.price > 0 ? `<div class="item-price">${fmt(item.price)}</div>` : '';
  return `
    <div class="item${item.checked ? ' checked' : ''}">
      <div class="check" onclick="toggleItem('${item.id}')">${item.checked ? '✓' : ''}</div>
      <div class="item-body" onclick="toggleItem('${item.id}')">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">
          <span class="tag">${CAT_EMOJI[item.cat] || '📦'} ${item.cat}</span>
          <span class="tag muted">x${item.qty}</span>
          <span class="tag muted">${WHO_EMOJI[item.who] || ''} ${item.who}</span>
        </div>
      </div>
      ${priceHtml}
      <div class="item-fav${item.fav ? ' on' : ''}" onclick="toggleFav('${item.id}')">${item.fav ? '⭐' : '☆'}</div>
      <button class="item-del" onclick="deleteItem('${item.id}')">×</button>
    </div>`;
}

function renderLista() {
  const all      = state.items.filter(i => i.lista_id === activeList);
  const filtered = activeCatFilter === 'Tutte' ? all : all.filter(i => i.cat === activeCatFilter);
  const pending  = filtered.filter(i => !i.checked);
  const done     = filtered.filter(i => i.checked);

  // Aggiorna hero budget
  const speso  = spesoMese();
  const budget = state.budgets[curMonthKey()] || 0;
  const rim    = budget - speso;
  const pct    = budget > 0 ? Math.min(100, (speso / budget) * 100) : 0;
  const over   = speso > budget && budget > 0;

  document.getElementById('heroSpent').textContent    = fmt(speso);
  document.getElementById('heroBudgetTag').textContent = budget > 0 ? `su ${fmt(budget)} di budget` : 'Budget non impostato';

  const rimEl = document.getElementById('heroRim');
  rimEl.textContent = (over ? '-' : '') + fmt(Math.abs(rim));
  rimEl.className   = 'rv' + (over ? ' over' : '');

  document.getElementById('heroBar').style.width = pct + '%';
  document.getElementById('heroBar').className   = 'hero-bar-fill' + (over ? ' over' : '');

  // Mini stat
  const sessioni = state.history.filter(h => inViewMonth(h.date));
  document.getElementById('msSpese').textContent     = sessioni.length;
  document.getElementById('msMedia').textContent     = sessioni.length
    ? fmtShort(sessioni.reduce((s, h) => s + h.total, 0) / sessioni.length)
    : '€0';
  document.getElementById('msDaComprare').textContent = all.filter(i => !i.checked).length;
  document.getElementById('badgeLista').textContent   = all.filter(i => !i.checked).length;

  // Lista articoli
  const stimato = all.reduce((s, i) => s + i.price, 0);
  document.getElementById('listaDaComprare').innerHTML = !pending.length
    ? '<div class="empty"><div class="e">🛍️</div><p>Lista vuota.<br>Aggiungi il primo articolo!</p></div>'
    : `<div class="sec-label">Da comprare (${pending.length})${stimato > 0 ? ' · stima ' + fmt(stimato) : ''}</div>` + pending.map(itemCard).join('');

  document.getElementById('listaComprata').innerHTML = done.length
    ? `<div class="sec-label" style="margin-top:16px">Nel carrello (${done.length})</div>` + done.map(itemCard).join('')
    : '';

  // Bottoni azione in fondo
  const bb = document.getElementById('bottomBtns');
  if (all.some(i => i.checked)) {
    bb.innerHTML = `
      <button class="btn btn-primary" style="flex:2;width:auto" onclick="completeSpesa()">✅ Registra spesa</button>
      <button class="btn btn-ghost"   style="flex:1"           onclick="clearList()">Svuota</button>`;
  } else if (all.length) {
    bb.innerHTML = `<button class="btn btn-ghost" style="width:100%" onclick="clearList()">🗑 Svuota lista</button>`;
  } else {
    bb.innerHTML = '';
  }
}

async function addItem() {
  const name  = document.getElementById('newName').value.trim();
  if (!name) { toast('Inserisci il nome!'); return; }

  const price = parseFloat(document.getElementById('newPrice').value) || 0;
  const qty   = document.getElementById('newQty').value.trim() || '1';
  const cat   = document.getElementById('newCat').value;
  const who   = document.getElementById('newWho').value;
  const id    = uid();
  const date  = new Date().toISOString();

  state.items.push({ id, name, qty, price, cat, who, checked: false, date, lista_id: activeList, fav: false });

  // Pulisce i campi
  document.getElementById('newName').value  = '';
  document.getElementById('newPrice').value = '';
  document.getElementById('newQty').value   = '';
  renderLista();
  toast('Aggiunto: ' + name);

  try {
    await sbInsert([{ id, nome: name, quantita: qty, prezzo: price, categoria: cat, chi: who,
      spuntato: false, data: date, tipo: 'item', lista_id: activeList, extra: JSON.stringify({ fav: false }) }]);
  } catch {
    toast('⚠️ Errore sync');
  }
}

async function toggleItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  item.checked = !item.checked;
  renderLista();
  try { await sbUpdate(id, { spuntato: item.checked }); }
  catch { toast('⚠️ Errore sync'); }
}

async function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  renderLista();
  toast('Rimosso');
  try { await sbDelete(`id=eq.${id}`); } catch { /* ignora */ }
}

async function toggleFav(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  item.fav = !item.fav;
  renderLista();

  if (item.fav) {
    try {
      const fid = 'fav_' + uid();
      await sbInsert([{ id: fid, nome: item.name, quantita: item.qty, prezzo: item.price,
        categoria: item.cat, chi: item.who, spuntato: false, data: new Date().toISOString(), tipo: 'fav' }]);
      toast('⭐ Aggiunto ai preferiti');
    } catch { /* ignora */ }
  }

  try { await sbUpdate(id, { extra: JSON.stringify({ fav: item.fav }) }); }
  catch { /* ignora */ }
}

async function addFavToList(fav) {
  const id   = uid();
  const date = new Date().toISOString();
  state.items.push({ id, name: fav.name, qty: fav.qty, price: fav.price,
    cat: fav.cat, who: fav.who, checked: false, date, lista_id: activeList, fav: false });

  renderLista();
  toast(fav.name + ' aggiunto');

  try {
    await sbInsert([{ id, nome: fav.name, quantita: fav.qty, prezzo: fav.price,
      categoria: fav.cat, chi: fav.who, spuntato: false, data: date,
      tipo: 'item', lista_id: activeList, extra: JSON.stringify({ fav: false }) }]);
  } catch { /* ignora */ }
}

async function delFav(id) {
  state.items = state.items.filter(i => i.id !== id);
  renderPreferiti();
  try { await sbDelete(`id=eq.${id}`); } catch { /* ignora */ }
  toast('Preferito rimosso');
}

/* ============================================================
   11. SPESA COMPLETATA / STORICO
   ============================================================ */

async function completeSpesa() {
  const checked = state.items.filter(i => i.checked && i.lista_id === activeList);
  if (!checked.length) { toast('Nessun articolo spuntato!'); return; }

  const total = checked.reduce((s, i) => s + i.price, 0);
  const sid   = uid();
  const date  = new Date().toISOString();

  state.history.push({ id: sid, date, items: checked.map(i => ({ ...i })), total });
  state.items = state.items.filter(i => !(i.checked && i.lista_id === activeList));
  renderAll();
  toast('Spesa registrata: ' + fmt(total));

  try {
    for (const i of checked) await sbDelete(`id=eq.${i.id}`);
    const rows = checked.map(i => ({
      id: uid(), nome: i.name, quantita: i.qty, prezzo: i.price,
      categoria: i.cat, chi: i.who || '', spuntato: true,
      data: date, tipo: 'history', sessione_id: sid
    }));
    await sbInsert(rows);
  } catch {
    toast('⚠️ Errore sync');
  }
}

async function clearList() {
  const toDel = state.items.filter(i => i.lista_id === activeList);
  if (!toDel.length) return;

  state.items = state.items.filter(i => i.lista_id !== activeList);
  renderLista();
  toast('Lista svuotata');
  try { for (const i of toDel) await sbDelete(`id=eq.${i.id}`); } catch { /* ignora */ }
}

function renderStorico() {
  const el      = document.getElementById('storicoContent');
  const sessioni = state.history.filter(h => inViewMonth(h.date)).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!sessioni.length) {
    el.innerHTML = '<div class="empty"><div class="e">📋</div><p>Nessuna spesa registrata<br>in questo mese.</p></div>';
    return;
  }

  const tot = sessioni.reduce((s, h) => s + h.total, 0);

  let html = `
    <div class="mini-stats" style="margin-bottom:18px">
      <div class="mini-stat"><div class="v">${fmtShort(tot)}</div><div class="l">Totale mese</div></div>
      <div class="mini-stat"><div class="v">${sessioni.length}</div><div class="l">Spese</div></div>
      <div class="mini-stat"><div class="v">${fmtShort(tot / sessioni.length)}</div><div class="l">Media</div></div>
    </div>`;

  sessioni.forEach(s => {
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });

    html += `
      <div class="card" style="padding:15px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:11px">
          <div style="font-size:13px;font-weight:600;color:var(--ink2)">${dateStr}</div>
          <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:600;color:var(--terra)">${fmt(s.total)}</div>
        </div>`;

    s.items.forEach(it => {
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid var(--line)">
          <div>
            <div style="font-size:14px;font-weight:500">${it.name}</div>
            <div style="font-size:11px;color:var(--ink3)">${CAT_EMOJI[it.cat] || '📦'} ${it.cat} · x${it.qty}</div>
          </div>
          <div style="font-weight:600;color:var(--terra)">${it.price > 0 ? fmt(it.price) : '—'}</div>
        </div>`;
    });

    html += `
        <button class="btn btn-ghost" style="width:100%;padding:8px;margin-top:10px;font-size:12px" onclick="delHistory('${s.id}')">
          Elimina questa spesa
        </button>
      </div>`;
  });

  el.innerHTML = html;
}

async function delHistory(sid) {
  state.history = state.history.filter(h => h.id !== sid);
  renderAll();
  toast('Spesa eliminata');
  try { await sbDelete(`sessione_id=eq.${sid}`); } catch { /* ignora */ }
}

/* ============================================================
   12. OFFERTE
   ============================================================ */

function renderOfferte() {
  const el   = document.getElementById('offerteContent');
  const offs = state.offers
    .filter(o => inViewMonth(o.date))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!offs.length) {
    el.innerHTML = '<div class="empty"><div class="e">🏷️</div><p>Nessuna offerta segnata<br>in questo mese.</p></div>';
    return;
  }

  // Raggruppa per supermercato
  const byStore = offs.reduce((acc, o) => {
    if (!acc[o.store]) acc[o.store] = [];
    acc[o.store].push(o);
    return acc;
  }, {});

  let html = '';
  Object.entries(byStore).forEach(([store, list]) => {
    html += `<div class="sec-label">📍 ${store} (${list.length})</div>`;
    list.forEach(o => {
      const save = o.full > o.price ? Math.round((1 - o.price / o.full) * 100) : 0;
      html += `
        <div class="offer">
          <div class="offer-badge">🏷️</div>
          <div class="offer-body">
            <div class="offer-name">${o.name}</div>
            <div class="offer-where"><span class="store-pin">📍</span> ${o.store}${o.full > 0 ? ` · prima ${fmt(o.full)}` : ''}</div>
          </div>
          <div class="offer-price">
            <div class="now">${fmt(o.price)}</div>
            ${save > 0 ? `<div class="save">-${save}%</div>` : ''}
          </div>
          <button class="item-del" onclick="delOffer('${o.id}')">×</button>
        </div>`;
    });
  });

  el.innerHTML = html;
}

async function addOffer() {
  const name  = document.getElementById('offName').value.trim();
  const store = document.getElementById('offStore').value.trim();
  const price = parseFloat(document.getElementById('offPrice').value) || 0;
  const full  = parseFloat(document.getElementById('offFull').value)  || 0;

  if (!name || !store) { toast('Inserisci prodotto e supermercato'); return; }

  const id   = uid();
  const date = new Date().toISOString();
  state.offers.push({ id, name, store, price, full, date });

  // Pulisce form
  ['offName', 'offStore', 'offPrice', 'offFull'].forEach(fid => {
    document.getElementById(fid).value = '';
  });

  renderOfferte();
  toast('Offerta salvata');

  try {
    await sbInsert([{ id, nome: name, quantita: '1', prezzo: price,
      categoria: '', chi: '', spuntato: false, data: date,
      tipo: 'offer', supermercato: store, prezzo_offerta: full }]);
  } catch {
    toast('⚠️ Errore sync');
  }
}

async function delOffer(id) {
  state.offers = state.offers.filter(o => o.id !== id);
  renderOfferte();
  try { await sbDelete(`id=eq.${id}`); } catch { /* ignora */ }
  toast('Offerta rimossa');
}

/* ============================================================
   13. PREFERITI
   ============================================================ */

function renderPreferiti() {
  const el   = document.getElementById('preferitiContent');
  const favs = state.items.filter(i => i.lista_id === '__fav__');

  if (!favs.length) {
    el.innerHTML = '<div class="empty"><div class="e">⭐</div><p>Nessun preferito ancora.<br>Tocca la ☆ accanto a un articolo<br>per salvarlo qui.</p></div>';
    return;
  }

  el.innerHTML = favs.map(f => `
    <div class="item" style="cursor:default">
      <div class="offer-badge" style="width:42px;height:42px;font-size:18px;background:linear-gradient(135deg,var(--gold),var(--terra))">
        ${CAT_EMOJI[f.cat] || '📦'}
      </div>
      <div class="item-body">
        <div class="item-name">${f.name}</div>
        <div class="item-meta">
          <span class="tag">${f.cat}</span>
          ${f.price > 0 ? `<span class="tag muted">${fmt(f.price)}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-primary" style="width:auto;padding:8px 14px;font-size:13px"
        onclick='addFavToList(${JSON.stringify(f).replace(/'/g, "&#39;")})'>+ Lista</button>
      <button class="item-del" onclick="delFav('${f.id}')">×</button>
    </div>`).join('');
}

/* ============================================================
   14. CARICAMENTO DA DB
   ============================================================ */

async function loadFromDB() {
  setSync('syncing', 'Carico...');
  try {
    const rows = await sbGet();
    const items = [], histMap = {}, offers = [], budgets = {};
    let cats = null, lists = null;

    rows.forEach(r => {
      const ex = parseExtra(r);

      switch (r.tipo) {
        case 'item':
          items.push({
            id: r.id, name: r.nome, qty: r.quantita, price: +r.prezzo || 0,
            cat: r.categoria, who: r.chi, checked: r.spuntato === true,
            date: r.data, lista_id: r.lista_id || 'default', fav: ex.fav || false
          });
          break;

        case 'history': {
          const sid = r.sessione_id || r.id;
          if (!histMap[sid]) histMap[sid] = { id: sid, date: r.data, items: [], total: 0 };
          histMap[sid].items.push({ id: r.id, name: r.nome, qty: r.quantita, price: +r.prezzo || 0, cat: r.categoria, who: r.chi });
          histMap[sid].total += +r.prezzo || 0;
          break;
        }

        case 'budget':
          budgets[r.mese || r.id] = +r.prezzo || 0;
          break;

        case 'offer':
          offers.push({ id: r.id, name: r.nome, store: r.supermercato || '', price: +r.prezzo || 0, full: +r.prezzo_offerta || 0, date: r.data });
          break;

        case 'meta_cats':
          cats = ex.cats || null;
          break;

        case 'meta_lists':
          lists = ex.lists || null;
          break;

        case 'fav':
          items.push({
            id: r.id, name: r.nome, qty: r.quantita || '1', price: +r.prezzo || 0,
            cat: r.categoria, who: r.chi || 'Entrambi', checked: false,
            date: r.data, lista_id: '__fav__', fav: true
          });
          break;
      }
    });

    state.items   = items;
    state.history = Object.values(histMap);
    state.offers  = offers;
    state.budgets = budgets;
    if (cats)  state.cats  = cats;
    if (lists) state.lists = lists;

    // Assicura che la lista attiva esista ancora
    if (!state.lists.find(l => l.id === activeList)) {
      activeList = state.lists[0]?.id || 'default';
    }

    setSync('ok', 'Online');
    renderAll();
  } catch {
    setSync('error', 'Offline');
  }
}

/* ============================================================
   15. RENDER GENERALE & AVVIO
   ============================================================ */

function renderAll() {
  renderMonth();
  renderCatSelect();
  renderCatFilter();
  renderCatManage();
  renderListTabs();
  renderLista();
  renderStorico();
  renderOfferte();
  renderPreferiti();
}

// Avvio: primo render locale + caricamento DB + polling ogni 15s
renderAll();
loadFromDB();
setInterval(loadFromDB, 15000);
