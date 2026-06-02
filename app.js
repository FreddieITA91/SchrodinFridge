'use strict';
    const APP_VERSION='step20s-save-recipe-receipt-scan-2026-06-02-01';
    const DEFAULT_SUPABASE_URL='https://evaftivdtyoaezxzzyml.supabase.co';
    const CFG_KEY='sf_step5_cfg';
    const DEFAULT_SUPABASE_KEY='sb_publishable_u2yNGf01RAfKIjYl0RBKFw_6wH2Q5Ww';
    let cfg={familyCode:'',supabaseUrl:DEFAULT_SUPABASE_URL,supabaseKey:DEFAULT_SUPABASE_KEY,offline:false};
    let state=emptyState(), view='home', sb=null, channel=null, lastError='', searchText='', cartSearch='', houseSearch='';
    let selectedCart=new Set(), selectedHouse=new Set(), pendingCategoryAction=null, editingKind=null, editingId=null;
    let selectedMood='', mealIdeas=[], pendingMealOptions=[], mealAiMode='';
    let localMutationStamp=0, syncRunning=false, searchRenderTimer=null;

    function emptyState(){return{products:[],shoppingList:[],cart:[]};}
    function normalizeState(){if(!state||typeof state!=='object')state=emptyState(); if(!Array.isArray(state.products))state.products=[]; if(!Array.isArray(state.shoppingList))state.shoppingList=[]; if(!Array.isArray(state.cart))state.cart=[]; ['products','shoppingList','cart'].forEach(k=>state[k]=state[k].map(normalizeItem)); return state;}
    function normalizeItem(x){x=x&&typeof x==='object'?x:{}; return {id:String(x.id||newId()),family_code:normalizeFamilyCode(x.family_code||cfg.familyCode),list_type:x.list_type||'product',name:String(x.name||'').trim(),category:normalizeCategory(x.category),qty:Number(x.qty||1),unit:String(x.unit||'pz'),notes:String(x.notes||''),checked:!!x.checked,confirmed:!!x.confirmed,origin_category:normalizeCategory(x.origin_category||x.category),added_at:Number(x.added_at||Date.now()),checked_at:x.checked_at?Number(x.checked_at):null,updated_at:Number(x.updated_at||Date.now()),expiry:x.expiry||null};}
    function normalizeFamilyCode(v){return String(v||'').trim().toUpperCase();}
    function normalizeCategory(v){v=String(v||'dispensa').toLowerCase(); return ['frigo','dispensa','altro'].includes(v)?v:'dispensa';}
    function safeJson(raw,fallback){try{return JSON.parse(raw)||fallback}catch{return fallback}}
    function stateKey(){return 'sf_step5_state_'+(cfg.familyCode||'OFFLINE');}
    function newId(prefix='it'){return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)}
    function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
    function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2500)}
    function setLastError(err){lastError=err?String(err.message||err):'';console.warn(lastError);renderDebug();}

    function loadConfig(){cfg={...cfg,...safeJson(localStorage.getItem(CFG_KEY),{})};cfg.familyCode=normalizeFamilyCode(cfg.familyCode);cfg.supabaseUrl=String(cfg.supabaseUrl||DEFAULT_SUPABASE_URL).trim();cfg.supabaseKey=String(cfg.supabaseKey||DEFAULT_SUPABASE_KEY).trim(); if(!cfg.supabaseKey) cfg.supabaseKey=DEFAULT_SUPABASE_KEY;}
    function saveConfig(){cfg.familyCode=normalizeFamilyCode(cfg.familyCode);localStorage.setItem(CFG_KEY,JSON.stringify(cfg));}
    function loadLocal(){state=safeJson(localStorage.getItem(stateKey()),emptyState());normalizeState();}
    function saveLocal(markMutation=true){normalizeState();if(markMutation)localMutationStamp=Date.now();localStorage.setItem(stateKey(),JSON.stringify(state));saveConfig();}

    function bindEvents(){
      document.getElementById('btn-join').addEventListener('click',()=>enterFamily(document.getElementById('join-code').value));
      document.getElementById('btn-create-family').addEventListener('click',createFamily);
      document.getElementById('btn-offline').addEventListener('click',continueOffline);
      document.getElementById('fab').addEventListener('click',openAddModal);
      document.getElementById('btn-cancel-add').addEventListener('click',closeAllModals);
      document.getElementById('btn-save-item').addEventListener('click',saveItem);
      document.getElementById('qty-minus').addEventListener('click',()=>adjustQty(-1));
      document.getElementById('qty-plus').addEventListener('click',()=>adjustQty(1));
      document.getElementById('btn-close-settings').addEventListener('click',closeAllModals);
      document.getElementById('btn-save-settings').addEventListener('click',saveSettings);
      document.getElementById('btn-cancel-category').addEventListener('click',closeAllModals);
      document.getElementById('btn-confirm-category').addEventListener('click',confirmCategoryAction);
      document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
      document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)closeAllModals();}));
    }
    function init(){bindEvents();loadConfig();setTimeout(()=>document.getElementById('splash')?.classList.add('hidden'),850);if(!cfg.familyCode&&!cfg.offline)showSetup();else{loadLocal();showApp();initSupabase();fullSync();}if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});}
    document.addEventListener('DOMContentLoaded',init);

    function showSetup(){closeAllModals();document.getElementById('setup').classList.remove('hidden');document.getElementById('app').classList.add('hidden');document.getElementById('bottom-nav').classList.add('hidden');}
    function showApp(){document.getElementById('setup').classList.add('hidden');document.getElementById('app').classList.remove('hidden');document.getElementById('bottom-nav').classList.remove('hidden');render();}
    function enterFamily(raw){const code=normalizeFamilyCode(raw);if(code.length<4)return toast('Codice famiglia troppo corto');resetRealtime();cfg.familyCode=code;cfg.offline=false;state=emptyState();saveConfig();loadLocal();showApp();initSupabase();fullSync();toast('Famiglia: '+code);}
    function continueOffline(){resetRealtime();cfg.offline=true;cfg.familyCode='';state=emptyState();saveLocal();showApp();setSyncStatus('offline');}
    function createFamily(){const code='FAM-'+Math.random().toString(36).slice(2,6).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();document.getElementById('join-code').value=code;enterFamily(code);toast('Nuova famiglia creata: '+code);}
    function changeFamily(){closeAllModals();resetRealtime();cfg.familyCode='';cfg.offline=false;state=emptyState();saveConfig();showSetup();}
    function logoutFamily(){changeFamily();toast('Sei uscito dalla famiglia');}
    function setView(next){view=next;searchText='';cartSearch='';houseSearch='';selectedCart.clear();selectedHouse.clear();render();}

    
    function updateNavBadges(){
      try{
        const products = Array.isArray(state.products) ? state.products : [];
        const shopping = Array.isArray(state.shoppingList) ? state.shoppingList : [];
        const cart = Array.isArray(state.cart) ? state.cart : [];
        ['frigo','dispensa','altro'].forEach(cat=>{
          const el=document.getElementById('badge-'+cat);
          if(!el)return;
          const n=products.filter(x=>x && x.category===cat && !x.checked).length;
          el.textContent=n;
          el.classList.toggle('show',n>0);
        });
        [
          ['badge-shopping', shopping.filter(x=>x && !x.checked).length],
          ['badge-cart', cart.filter(x=>x && !x.checked).length],
          ['badge-shopping-home', shopping.filter(x=>x && !x.checked).length],
          ['badge-cart-home', cart.filter(x=>x && !x.checked).length]
        ].forEach(([id,n])=>{
          const el=document.getElementById(id);
          if(!el)return;
          el.textContent=n;
          el.classList.toggle('show',n>0);
        });
      }catch(e){
        console.warn('updateNavBadges fallback error', e);
      }
    }

function render(){normalizeState();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const page=document.getElementById('page');
      page.innerHTML=view==='home'?renderHome():view==='frigo'?renderStorage('frigo'):view==='dispensa'?renderStorage('dispensa'):view==='altro'?renderStorage('altro'):view==='shopping'?renderShopping():view==='cart'?renderCart():view==='house'?renderHouse('all'):view==='expiring'?renderHouse('expiring'):view==='expired'?renderHouse('expired'):view==='terminated'?renderHouse('terminated'):renderHome();
      document.getElementById('fab').style.display=['home','house','expiring','expired','terminated'].includes(view)?'none':'grid'; if(typeof updateNavBadges==='function')updateNavBadges(); renderDebug(); setSyncStatus(lastError?'error':cfg.offline?'offline':sb?'online':'config'); }

    function activeProducts(){return state.products.filter(x=>!x.checked&&!isExpired(x));}
    function terminatedProducts(){return state.products.filter(x=>!!x.checked);}
    function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d;}
    function parseExpiry(v){if(!v)return null;const [y,m,d]=String(v).split('-').map(Number);if(!y||!m||!d)return null;const dt=new Date(y,m-1,d);dt.setHours(0,0,0,0);return dt;}
    function isExpired(x){if(x&&x.checked)return false;const d=parseExpiry(x.expiry);return !!d&&d<todayStart();}
    function isExpiring(x){if(x&&x.checked)return false;const d=parseExpiry(x.expiry);if(!d)return false;const t=todayStart();const limit=new Date(t);limit.setDate(limit.getDate()+7);return d>=t&&d<=limit;}
    function daysToExpiry(x){const d=parseExpiry(x&&x.expiry);if(!d)return null;const t=todayStart();return Math.ceil((d-t)/86400000);}
    function expiredProducts(){return state.products.filter(isExpired);}
    function expiringProducts(){return state.products.filter(isExpiring);}
    function catStats(cat){const arr=state.products.filter(x=>x.category===cat);return {presenti:arr.filter(x=>!x.checked).length,terminati:arr.filter(x=>x.checked).length,expiring:arr.filter(isExpiring).length,expired:arr.filter(isExpired).length};}
    
function statLine(label,value){return `<span class="tile-stat"><span>${label}</span><b>${value}</b></span>`;}
function iconFor(cat){return cat==='frigo'?'ui-frigo-cat.png':cat==='dispensa'?'ui-dispensa-cat.png':'ui-altro-cat.png';}
function countOpen(arr){return arr.filter(x=>!x.checked).length;}
function shoppingStats(){return {open:countOpen(state.shoppingList), done:state.shoppingList.filter(x=>x.checked).length};}
function cartStats(){return {open:countOpen(state.cart), done:state.cart.filter(x=>x.checked).length};}
function renderCategoryTile(cat,title,subtitle){const st=catStats(cat);return `<button class="tile" onclick="setView('${cat}')"><img src="${iconFor(cat)}" class="tile-icon" alt="${title}"><h3>${title}</h3><p class="muted">${subtitle}</p><div class="tile-stats">${statLine('articoli presenti',st.presenti)}${statLine('articoli terminati',st.terminati)}${statLine('in scadenza / scaduti',st.expiring+' / '+st.expired)}</div></button>`;}
function renderQuickAction(viewName, iconPath, title, subtitle, count, badgeId){return `<button class="quick-btn" onclick="setView('${viewName}')"><img src="${iconPath}" class="quick-icon" alt="${title}"><div><b>${title}</b><div class="quick-meta">${subtitle}</div></div><span id="${badgeId}" class="quick-badge ${count>0?'show':''}">${count}</span></button>`;}
function renderHome(){const house=activeProducts().length,terminated=terminatedProducts().length,exp=expiringProducts().length,expired=expiredProducts().length,cart=cartStats().open,list=shoppingStats().open;return `<div class="top"><div><h2>Ciao, Freddie! 👋</h2><div class="muted">Famiglia: <b>${esc(cfg.familyCode||'offline')}</b> · <span class="sync">...</span></div></div><div class="top-actions"><button class="icon-btn" onclick="openSettings()" title="Impostazioni">⚙️</button><button class="icon-btn logout-top" onclick="logoutFamily()" title="Esci dalla famiglia">🚪</button></div></div><section class="hero"><small>Panoramica oggi</small><h3>Gestione famiglia</h3><div class="metrics"><div class="metric"><button onclick="setView('house')"><b>${house}</b><span>In casa</span></button></div><div class="metric"><button onclick="setView('terminated')"><b>${terminated}</b><span>Articoli terminati</span></button></div><div class="metric"><button onclick="setView('expiring')"><b>${exp}</b><span>In scadenza</span></button></div><div class="metric"><button onclick="setView('expired')"><b>${expired}</b><span>Scaduti</span></button></div></div></section><div class="home-quick">${renderQuickAction('shopping','ui-lista-cat.png','Lista spesa','Da acquistare',list,'badge-shopping-home')}${renderQuickAction('cart','ui-carrello-cat.png','Lista carrello','Da sistemare',cart,'badge-cart-home')}</div><div class="mascot-card"><div><small>Schrodinger Fridge</small><h3>Controlla cosa hai, prima di comprare</h3><p class="muted" style="color:#EDE7F8">Tieni sotto controllo scorte, scadenze e lista della spesa di famiglia.</p></div><div class="mascot-stage"><img src="ui-home-cat.png" class="cat-loop" alt="Gatto animato"></div></div><div class="home-actions-ai"><button class="scan-card" type="button" onclick="openReceiptScan()"><b>Scansione scontrino</b><br><span>Foto + AI: articoli direttamente nel carrello</span></button><button class="meal-card" type="button" onclick="openMealAI()"><span class="meal-icon-wrap"><img src="ui-chef-ai-cat.png" class="meal-icon" alt="Chef AI"></span><span class="meal-copy"><b>Chef AI di casa</b><br><span>3 idee pasto usando frigo, dispensa e scadenze</span></span></button></div>${renderSavedMealBanner()}<div class="grid home-grid">${renderCategoryTile('frigo','Frigo','Prodotti da consumare')}${renderCategoryTile('dispensa','Dispensa','Scorte di casa')}${renderCategoryTile('altro','Altro','Prodotti vari')}</div>`;}
        
function renderSavedMealBanner(){
      if(!savedMeal)return '';
      const used=(savedMeal.used||[]).filter(Boolean).slice(0,4).join(' · ');
      const steps=(savedMeal.steps||[]).filter(Boolean).slice(0,2).join(' · ');
      return `<div class="saved-meal-banner"><div><small>Ricetta salvata</small><h3>${esc(savedMeal.title||'Ricetta consigliata')}</h3><p>${esc(used||steps||savedMeal.why||'Pronta da preparare')}</p></div><button class="icon-btn saved-close" title="Cancella ricetta salvata" onclick="clearSavedMeal()">×</button></div>`;
    }
    function saveMealIdea(i){
      const m=mealIdeas[i];
      if(!m)return toast('Ricetta non trovata');
      savedMeal=JSON.parse(JSON.stringify(m));
      closeAllModals();
      render();
      setTimeout(()=>document.querySelector('.saved-meal-banner')?.scrollIntoView({behavior:'smooth',block:'center'}),80);
      toast('Ricetta salvata in home');
    }
    function clearSavedMeal(){savedMeal=null;render();toast('Ricetta rimossa');}
    function renderStorage(cat){let items=orderProducts(state.products.filter(x=>x.category===cat));const title=cat==='frigo'?'Frigorifero':cat==='dispensa'?'Dispensa':'Altro';return `<div class="top"><div class="brand"><img src="brand-icon.png" alt=""><h1>${title}</h1></div><span class="sync">...</span></div><input id="search-storage" class="input search" placeholder="Cerca in ${title.toLowerCase()}" value="${esc(searchText)}" oninput="handleSearchInput('search-storage','searchText')">${renderDuplicateAlert(items)}${renderSections(items,'product',cat)}`;}
    function renderNoResults(q,list,cat,label){q=String(q||'').trim();const safe=esc(q);if(q)return `<div class="empty">Nessuna voce trovata.<br><button class="add-link" onclick="openAddModal('${safe}','${list}','${cat||'dispensa'}')">Aggiungi “${safe}”</button></div>`;return `<div class="empty">${label||'Nessuna voce.'} Premi + per aggiungere.</div>`;}
    function renderSections(source,kind,cat){let items=[...source];const q=searchText.trim().toLowerCase();if(q)items=items.filter(x=>itemText(x).includes(q));if(!items.length)return renderNoResults(searchText,'product',cat,'Nessuna voce');const exp=items.filter(isExpiring);const expired=items.filter(isExpired);const done=items.filter(x=>x.checked);const good=items.filter(x=>!x.checked&&!isExpiring(x)&&!isExpired(x));return `${exp.length?`<div class="section-title">In scadenza</div>${exp.map(x=>renderProductItem(x)).join('')}`:''}${good.length?`<div class="section-title">Articolo presente</div>${good.map(x=>renderProductItem(x)).join('')}`:''}${done.length?`<div class="section-title">Terminati</div>${done.map(x=>renderProductItem(x)).join('')}`:''}${expired.length?`<div class="section-title">Scaduti</div>${expired.map(x=>renderProductItem(x)).join('')}`:''}`;}
    function statusHtml(it){if(it.checked)return '<span class="status-tag done">terminato</span>';if(isExpired(it))return '<span class="status-tag expired">scaduto</span>';if(isExpiring(it)){const d=daysToExpiry(it);const label=d===0?'oggi':d===1?'1 giorno':d+' giorni';return `<span class="status-tag expiring">in scadenza · ${label}</span>`;}return '';}
    function renderProductItem(it){return `<article class="item ${it.checked?'done':''}" onclick="toggleHouseDone('${esc(it.id)}')"><div class="thumb">${emoji(it)}</div><div class="main"><div class="item-name">${esc(it.name)} ${statusHtml(it)}</div><div class="meta">${fmtQty(it)} · ${catLabel(it.category)}${it.expiry?' · scad. '+esc(it.expiry):''}${it.notes?' · '+esc(it.notes):''}</div></div><div class="actions compact" onclick="event.stopPropagation()"><button title="Modifica" onclick="openEditModal('product','${esc(it.id)}')">✏️</button><button title="Rimetti in lista spesa" onclick="productToShopping('${esc(it.id)}')">🛒</button><button title="Cancella" onclick="deleteItem('product','${esc(it.id)}')">×</button></div></article>`;}
    function renderListTabs(active){
      return `<div class="list-tabs"><button class="${active==='shopping'?'active':''}" onclick="setView('shopping')"><img src="ui-lista-cat.png" alt="">Lista spesa</button><button class="${active==='cart'?'active':''}" onclick="setView('cart')"><img src="ui-carrello-cat.png" alt="">Carrello</button></div>`;
    }
    function visibleCartItems(){
      let items=[...state.cart];
      const q=cartSearch.trim().toLowerCase();
      if(q)items=items.filter(x=>itemText(x).includes(q));
      return items;
    }
    function houseBaseForMode(mode){
      let arr=[...state.products];
      if(mode==='all')arr=arr.filter(x=>!x.checked&&!isExpired(x));
      if(mode==='expiring')arr=arr.filter(isExpiring);
      if(mode==='expired')arr=arr.filter(isExpired);
      if(mode==='terminated')arr=arr.filter(x=>!!x.checked);
      return arr;
    }
    function visibleHouseItems(mode){
      let items=orderProducts(houseBaseForMode(mode));
      const q=houseSearch.trim().toLowerCase();
      if(q)items=items.filter(x=>itemText(x).includes(q));
      return items;
    }
    function renderCartSearchTools(){
      return `<div class="search-tools"><input id="search-cart" class="input search compact-search" placeholder="Cerca nel carrello" value="${esc(cartSearch)}" oninput="handleSearchInput('search-cart','cartSearch')"><button class="ghost tiny" title="Seleziona/deseleziona tutti" onclick="toggleAllCart()">Tutti</button><button class="secondary tiny icon-only" title="Sposta selezionati" onclick="openMoveSelectedCart()">↪️</button><button class="danger tiny icon-only" title="Cancella selezionati" onclick="deleteSelectedCart()">🗑️</button></div>`;
    }
    function renderHouseSearchTools(mode){
      return `<div class="search-tools"><input id="search-house" class="input search compact-search" placeholder="Cerca in questa lista" value="${esc(houseSearch)}" oninput="handleSearchInput('search-house','houseSearch')"><button class="ghost tiny" title="Seleziona/deseleziona tutti" onclick="toggleAllHouse('${mode}')">Tutti</button><button class="secondary tiny icon-only" title="Sposta selezionati in lista spesa" onclick="houseSelectedToShopping()">↪️</button><button class="danger tiny icon-only" title="Cancella selezionati" onclick="deleteSelectedHouse()">🗑️</button></div>`;
    }
    function renderShopping(){let items=[...state.shoppingList];const q=searchText.trim().toLowerCase();if(q)items=items.filter(x=>itemText(x).includes(q));return `<div class="top"><div><h2>Lista spesa</h2><div class="muted">${state.shoppingList.length} voci</div></div><span class="sync">...</span></div>${renderListTabs('shopping')}<input id="search-shopping" class="input search" placeholder="Cerca nella lista spesa" value="${esc(searchText)}" oninput="handleSearchInput('search-shopping','searchText')">${renderDuplicateAlert(state.shoppingList)}${items.length?items.map(renderShoppingItem).join(''):renderNoResults(searchText,'shopping','dispensa','Lista spesa vuota')}`;}
    function renderShoppingItem(it){return `<article class="item ${it.checked?'done':''}"><div class="thumb">${emoji(it)}</div><div class="main"><div class="item-name">${esc(it.name)}</div><div class="meta">${fmtQty(it)}${it.notes?' · '+esc(it.notes):''}</div></div><div class="actions compact" onclick="event.stopPropagation()"><button title="Modifica" onclick="openEditModal('shopping','${esc(it.id)}')">✏️</button><button title="Sposta nel carrello" onclick="shoppingToCart('${esc(it.id)}')">🛒</button><button title="Cancella" onclick="deleteItem('shopping','${esc(it.id)}')">×</button></div></article>`;}
    function renderCart(){let items=visibleCartItems();return `<div class="top"><div><h2>Lista carrello</h2><div class="muted">${state.cart.length} voci · ${selectedCart.size} selezionate</div></div><span class="sync">...</span></div>${renderListTabs('cart')}${renderCartSearchTools()}${renderDuplicateAlert(state.cart)}${items.length?items.map(renderCartItem).join(''):renderNoResults(cartSearch,'cart','dispensa','Carrello vuoto')}`;}
    function renderCartItem(it){const on=selectedCart.has(it.id);return `<article class="item compact ${it.checked?'done':''}"><button class="check-btn ${on?'on':''}" onclick="event.stopPropagation();toggleCartSelect('${esc(it.id)}')">${on?'✓':''}</button><div class="thumb">${emoji(it)}</div><div class="main"><div class="item-name">${esc(it.name)}</div><div class="meta">${fmtQty(it)} · ${catLabel(it.category)}${it.expiry?' · scad. '+esc(it.expiry):''}${it.notes?' · '+esc(it.notes):''}</div></div><div class="actions compact" onclick="event.stopPropagation()"><button title="Modifica" onclick="openEditModal('cart','${esc(it.id)}')">✏️</button><button title="Sposta in ${catLabel(it.category)}" onclick="moveCartItemToProduct('${esc(it.id)}')">➡️</button><button title="Cancella" onclick="deleteItem('cart','${esc(it.id)}')">×</button></div></article>`;}
    function orderProducts(items){const rank=x=>isExpiring(x)?0:(!x.checked&&!isExpired(x)?1:(x.checked?2:3));return [...items].sort((a,b)=>rank(a)-rank(b)||(b.updated_at||0)-(a.updated_at||0));}
    function renderHouse(mode='all'){let items=visibleHouseItems(mode);const title=mode==='expired'?'Prodotti scaduti':mode==='expiring'?'Prodotti in scadenza':mode==='terminated'?'Articoli terminati':'Prodotti in casa';const count=houseBaseForMode(mode).length;return `<div class="top"><div><h2>${title}</h2><div class="muted">${count} voci · ${selectedHouse.size} selezionate</div></div><button class="icon-btn" onclick="setView('home')">↩</button></div>${renderHouseSearchTools(mode)}${items.length?items.map(it=>renderHouseItem(it,mode)).join(''):renderNoResults(houseSearch,'product','dispensa','Nessun prodotto')}`;}
    function renderHouseItem(it,mode='all'){const on=selectedHouse.has(it.id);const clickable=mode==='expiring'?` onclick="toggleHouseDone('${esc(it.id)}')"`:'';return `<article class="item compact ${it.checked?'done':''} ${mode==='expiring'?'row-tappable':''}"${clickable}><button class="check-btn ${on?'on':''}" onclick="event.stopPropagation();toggleHouseSelect('${esc(it.id)}')">${on?'✓':''}</button><div class="thumb">${emoji(it)}</div><div class="main"><div class="item-name">${esc(it.name)} ${statusHtml(it)}</div><div class="meta">${fmtQty(it)} · ${catLabel(it.category)}${it.expiry?' · scad. '+esc(it.expiry):''}${it.notes?' · '+esc(it.notes):''}</div></div><div class="actions compact" onclick="event.stopPropagation()"><button title="Modifica" onclick="openEditModal('product','${esc(it.id)}')">✏️</button><button title="Rimetti in lista spesa" onclick="productToShopping('${esc(it.id)}')">🛒</button><button title="Cancella" onclick="deleteItem('product','${esc(it.id)}')">×</button></div></article>`;}

    function handleSearchInput(id, varName){
      const el=document.getElementById(id);
      if(!el)return;
      if(varName==='cartSearch')cartSearch=el.value;
      else if(varName==='houseSearch')houseSearch=el.value;
      else searchText=el.value;
      clearTimeout(searchRenderTimer);
      searchRenderTimer=setTimeout(()=>{
        const active=document.activeElement && document.activeElement.id===id;
        const start=el && typeof el.selectionStart==='number'?el.selectionStart:null;
        const end=el && typeof el.selectionEnd==='number'?el.selectionEnd:null;
        render();
        if(active)requestAnimationFrame(()=>{
          const n=document.getElementById(id);
          if(n){
            n.focus({preventScroll:true});
            if(start!==null && typeof n.setSelectionRange==='function')n.setSelectionRange(start,end);
          }
        });
      },160);
    }
    function rerenderKeepFocus(id){const el=document.getElementById(id);const start=el&&typeof el.selectionStart==='number'?el.selectionStart:null;const end=el&&typeof el.selectionEnd==='number'?el.selectionEnd:null;render();requestAnimationFrame(()=>{const n=document.getElementById(id);if(n){n.focus();if(start!==null)n.setSelectionRange(start,end);}});}

    function renderDuplicateAlert(arr){const dup=duplicates(arr);return dup.length?`<div class="alert">Possibili duplicati: ${dup.map(esc).join(', ')}</div>`:'';}
    function duplicates(arr){const map=new Map();arr.forEach(x=>{const k=String(x.name||'').trim().toLowerCase();if(k)map.set(k,(map.get(k)||0)+1)});return[...map].filter(([,v])=>v>1).map(([k])=>k);}
    function fmtQty(it){return `${Number(it.qty||1)} ${esc(it.unit||'pz')}`;}
    function catLabel(c){return c==='frigo'?'Frigorifero':c==='dispensa'?'Dispensa':'Altro';}
    function itemText(x){return `${x.name} ${x.category} ${x.notes} ${x.qty} ${x.unit} ${x.expiry}`.toLowerCase();}
    function normalizeName(v){
      return String(v||'')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9\s]/g,' ')
        .replace(/\s+/g,' ')
        .trim();
    }
    
    function inferCategoryFromName(name){
      const s=normalizeName(name);
      if(['latte','yogurt','formaggio','mozzarella','ricotta','prosciutto','salame','mortadella','speck','uova','carne','pollo','pesce','insalata','verdura','frutta'].some(k=>s.includes(k)))return 'frigo';
      if(['detersivo','sapone','shampoo','carta','scottex','spugna','dentifricio'].some(k=>s.includes(k)))return 'altro';
      return 'dispensa';
    }
    function sameProductName(a,b){
      const x=normalizeName(a), y=normalizeName(b);
      if(!x||!y)return false;
      return x===y || x.includes(y) || y.includes(x);
    }

    function itemIconEmoji(name){
      const s=normalizeName(name);
      const rules=[
        [['latte','milk'], '🥛'], [['yogurt','yoghurt','kefir'], '🥣'], [['formaggio','mozzarella','ricotta','parmigiano','grana','stracchino','gorgonzola','pecorino'], '🧀'],
        [['pane','panino','toast','baguette','focaccia'], '🍞'], [['pasta','spaghetti','penne','fusilli','rigatoni','maccheroni','lasagne'], '🍝'], [['riso','risotto','cous cous','farro','orzo','cereali'], '🍚'],
        [['acqua','bibita','coca','cola','sprite','fanta','succo','the','tè','bevanda'], '🥤'], [['vino','birra','prosecco'], '🍾'], [['caffe','caffè','capsule'], '☕'],
        [['insalata','lattuga','verdura','spinaci','rucola','zucchine','zucchina','carote','carota','broccoli','broccolo','pomodori','pomodoro','peperoni','peperone','melanzana','cetriolo'], '🥬'],
        [['patate','patata'], '🥔'], [['cipolla','aglio'], '🧅'], [['frutta','mele','mela','banana','banane','arancia','arance','limone','limoni','fragole','fragola','uva','pera','pere','pesca','pesche'], '🍎'],
        [['uova','uovo'], '🥚'], [['pollo','tacchino','carne','bistecca','manzo','hamburger','salsiccia','wurstel'], '🥩'], [['prosciutto','salame','mortadella','speck','bresaola','affettato','affettati'], '🥓'],
        [['pesce','salmone','tonno','merluzzo','gamberi','gambero','cozze','vongole'], '🐟'], [['surgel','gelato','ghiaccio'], '🧊'],
        [['biscotti','biscotto','cracker','merend','cereali','snack','patatine','chips'], '🍪'], [['cioccolato','nutella','marmellata','miele','zucchero'], '🍫'],
        [['olio','aceto','sale','pepe','spezie','sugo','passata','pelati','conserva'], '🫙'], [['detersivo','sapone','shampoo','bagno','carta','scottex','rotolo','spugna','sacchetti'], '🧴']
      ];
      for(const [keys,icon] of rules){if(keys.some(k=>s.includes(k)))return icon;}
      return '';
    }
    function emoji(it){const icon=itemIconEmoji(it&&it.name);if(icon)return `<span class="food-icon" aria-hidden="true">${icon}</span>`;const src=it.list_type==='shopping'?'ui-lista-cat.png':it.list_type==='cart'?'ui-carrello-cat.png':iconFor(it.category);return `<img src="${src}" alt="" class="thumb-icon">`;}

    function openAddModal(prefill='',listOverride='',catOverride=''){if(typeof prefill!=='string')prefill='';editingKind=null;editingId=null;closeAllModals();document.getElementById('modal-title').textContent='Aggiungi voce';document.getElementById('item-name').value=prefill;document.getElementById('item-qty').value='1';document.getElementById('item-unit').value='pz';document.getElementById('item-notes').value='';document.getElementById('item-expiry').value='';document.getElementById('item-list').disabled=false;document.getElementById('item-list').value=listOverride|| (view==='shopping'?'shopping':view==='cart'?'cart':'product');document.getElementById('item-category').value=normalizeCategory(catOverride||(['frigo','dispensa','altro'].includes(view)?view:'dispensa'));document.getElementById('modal-add').classList.add('open');setTimeout(()=>document.getElementById('item-name').focus(),80);}
    function openEditModal(kind,id){normalizeState();const key=kind==='shopping'?'shoppingList':kind==='cart'?'cart':'products';const it=state[key].find(x=>x.id===id);if(!it)return;editingKind=kind;editingId=id;closeAllModals();document.getElementById('modal-title').textContent='Modifica voce';document.getElementById('item-name').value=it.name||'';document.getElementById('item-qty').value=it.qty||1;document.getElementById('item-unit').value=it.unit||'pz';document.getElementById('item-notes').value=it.notes||'';document.getElementById('item-expiry').value=it.expiry||'';document.getElementById('item-list').value=it.list_type;document.getElementById('item-list').disabled=true;document.getElementById('item-category').value=normalizeCategory(it.category);document.getElementById('modal-add').classList.add('open');setTimeout(()=>document.getElementById('item-name').focus(),80);}
    function closeAllModals(){document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));pendingCategoryAction=null;document.getElementById('item-list').disabled=false;}
    function adjustQty(d){const el=document.getElementById('item-qty');el.value=Math.max(0.01,Number(el.value||1)+d);}
    function saveItem(){const name=document.getElementById('item-name').value.trim();if(!name)return toast('Inserisci il nome');const list=document.getElementById('item-list').value;if(editingId){const key=editingKind==='shopping'?'shoppingList':editingKind==='cart'?'cart':'products';const it=state[key].find(x=>x.id===editingId);if(!it)return toast('Voce non trovata');Object.assign(it,{name,category:document.getElementById('item-category').value,qty:Number(document.getElementById('item-qty').value||1),unit:document.getElementById('item-unit').value,notes:document.getElementById('item-notes').value,expiry:document.getElementById('item-expiry').value||null,origin_category:document.getElementById('item-category').value,updated_at:Date.now()});saveLocal();closeAllModals();render();upsertOne(it);editingKind=null;editingId=null;toast('Voce modificata');return;}const item=normalizeItem({id:newId(list),family_code:cfg.familyCode,list_type:list,name,category:document.getElementById('item-category').value,qty:Number(document.getElementById('item-qty').value||1),unit:document.getElementById('item-unit').value,notes:document.getElementById('item-notes').value,expiry:document.getElementById('item-expiry').value||null,checked:false,confirmed:false,origin_category:document.getElementById('item-category').value,added_at:Date.now(),updated_at:Date.now()});pushLocal(item);saveLocal();closeAllModals();render();upsertOne(item);toast('Voce aggiunta');}
    function pushLocal(item){normalizeState();if(item.list_type==='shopping')state.shoppingList.unshift(item);else if(item.list_type==='cart')state.cart.unshift(item);else state.products.unshift(item);}
    function findRemove(kind,id){const key=kind==='shopping'?'shoppingList':kind==='cart'?'cart':'products';const i=state[key].findIndex(x=>x.id===id);if(i<0)return null;return state[key].splice(i,1)[0];}
    async function shoppingToCart(id){const it=findRemove('shopping',id);if(!it)return;it.list_type='cart';it.updated_at=Date.now();state.cart.unshift(it);saveLocal();render();await upsertOne(it);toast('Spostato nel carrello');}
    async function moveCartItemToProduct(id){const it=state.cart.find(x=>x.id===id);if(!it)return;await moveCartItems([id],it.category||'dispensa');}
    async function moveCartItems(ids,cat){const moved=[];ids.forEach(id=>{const it=findRemove('cart',id);if(it){it.list_type='product';it.category=normalizeCategory(cat||it.category);it.origin_category=it.category;it.checked=false;it.updated_at=Date.now();state.products.unshift(it);moved.push(it);}});selectedCart.clear();saveLocal();render();for(const it of moved)await upsertOne(it);toast(`${moved.length} spostate in ${catLabel(cat)}`);}
    function toggleCartSelect(id){selectedCart.has(id)?selectedCart.delete(id):selectedCart.add(id);render();}
    function toggleAllCart(){const ids=visibleCartItems().map(x=>x.id);if(!ids.length)return;const all=ids.every(id=>selectedCart.has(id));ids.forEach(id=>all?selectedCart.delete(id):selectedCart.add(id));render();}
    function selectAllCart(){toggleAllCart();}
    function clearCartSelection(){selectedCart.clear();render();}
    function openMoveSelectedCart(){if(!selectedCart.size)return toast('Nessuna voce selezionata');openCategoryModal('Sposta selezionati in categoria',()=>moveCartItems([...selectedCart],document.getElementById('bulk-category').value));}
    function moveAllCart(){if(!state.cart.length)return;openCategoryModal('Sposta tutto in categoria',()=>moveCartItems(state.cart.map(x=>x.id),document.getElementById('bulk-category').value));}
    async function deleteSelectedCart(){if(!selectedCart.size)return toast('Nessuna voce selezionata');await deleteMany('cart',[...selectedCart]);selectedCart.clear();}
    async function deleteAllCart(){await deleteMany('cart',state.cart.map(x=>x.id));}
    function openCategoryModal(title,fn){pendingCategoryAction=fn;document.getElementById('category-title').textContent=title;document.getElementById('modal-category').classList.add('open');}
    function confirmCategoryAction(){const fn=pendingCategoryAction;closeAllModals();if(fn)fn();}

    async function toggleShoppingDone(id){const it=state.shoppingList.find(x=>x.id===id);if(!it)return;it.checked=!it.checked;it.checked_at=it.checked?Date.now():null;it.updated_at=Date.now();saveLocal();render();await upsertOne(it);}
    async function toggleCartDone(id){const it=state.cart.find(x=>x.id===id);if(!it)return;it.checked=!it.checked;it.checked_at=it.checked?Date.now():null;it.updated_at=Date.now();saveLocal();render();await upsertOne(it);}

    async function productToShopping(id){const it=findRemove('product',id);if(!it)return;it.list_type='shopping';it.checked=false;it.checked_at=null;it.updated_at=Date.now();state.shoppingList.unshift(it);selectedHouse.delete(id);saveLocal();render();await upsertOne(it);toast('Rimesso in lista spesa');}
    async function toggleHouseDone(id){const it=state.products.find(x=>x.id===id);if(!it)return;it.checked=!it.checked;it.checked_at=it.checked?Date.now():null;it.updated_at=Date.now();saveLocal();render();await upsertOne(it);}
    function toggleHouseSelect(id){selectedHouse.has(id)?selectedHouse.delete(id):selectedHouse.add(id);render();}
    function toggleAllHouse(mode='all'){const ids=visibleHouseItems(mode).map(x=>x.id);if(!ids.length)return;const all=ids.every(id=>selectedHouse.has(id));ids.forEach(id=>all?selectedHouse.delete(id):selectedHouse.add(id));render();}
    function selectAllHouse(mode='all'){toggleAllHouse(mode);}
    function clearHouseSelection(){selectedHouse.clear();render();}
    async function houseSelectedToShopping(){const ids=[...selectedHouse];if(!ids.length)return toast('Nessuna voce selezionata');for(const id of ids)await productToShopping(id);selectedHouse.clear();}
    async function deleteSelectedHouse(){if(!selectedHouse.size)return toast('Nessuna voce selezionata');await deleteMany('product',[...selectedHouse]);selectedHouse.clear();}
    async function deleteAllHouse(mode='all'){await deleteMany('product',houseBaseForMode(mode).map(x=>x.id));}
    async function deleteItem(kind,id){await deleteMany(kind,[id]);}
    async function deleteMany(kind,ids){const key=kind==='shopping'?'shoppingList':kind==='cart'?'cart':'products';const set=new Set(ids);state[key]=state[key].filter(x=>!set.has(x.id));ids.forEach(id=>{selectedCart.delete(id);selectedHouse.delete(id)});saveLocal();render();for(const id of ids)await deleteRemote(id);toast(ids.length===1?'Voce cancellata':`${ids.length} voci cancellate`);}

    
function openMealAI(){
      selectedMood='';
      mealIdeas=[];
      closeAllModals();
      document.getElementById('meal-result').innerHTML='<div class="empty">Scegli come ti senti oggi: userò frigo, dispensa e prodotti in scadenza per proporti almeno 3 pasti.</div>';
      document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('active'));
      document.getElementById('modal-meal-ai').classList.add('open');
    }
    function selectMood(mood){
      selectedMood=mood;
      document.querySelectorAll('.mood-btn').forEach(b=>b.classList.toggle('active',b.dataset.mood===mood));
      generateMealIdeas();
    }
    function mealInventory(){
      const products=state.products.filter(x=>!x.checked&&!isExpired(x)).map(x=>({
        name:x.name, category:x.category, qty:x.qty, unit:x.unit, expiry:x.expiry,
        days_to_expiry:daysToExpiry(x), expiring:isExpiring(x)
      }));
      return {family_code:cfg.familyCode,mood:selectedMood,products};
    }
    async function generateMealIdeas(){
      const box=document.getElementById('meal-result');
      if(!selectedMood)return toast('Scegli prima una faccina');
      mealAiMode='loading';
      box.innerHTML='<div class="empty">Chef AI sta contattando Gemini tramite Supabase...</div>';
      try{
        const ideas=await fetchMealIdeas();
        if(Array.isArray(ideas)&&ideas.length){
          mealAiMode='ai';
          mealIdeas=normalizeMealIdeas(ideas);
        }else{
          mealAiMode='locale';
          mealIdeas=normalizeMealIdeas(localMealIdeas());
        }
      }catch(e){
        console.warn('AI pasti fallback locale', e);
        mealAiMode='locale';
        mealIdeas=normalizeMealIdeas(localMealIdeas());
        const errBox=document.getElementById('meal-ai-error');
        if(errBox) errBox.textContent=String(e&&e.message?e.message:e).slice(0,180);
      }
      renderMealIdeas();
    }
    async function fetchMealIdeas(){
      const url=(cfg.supabaseUrl||DEFAULT_SUPABASE_URL).replace(/\/+$/,'')+'/functions/v1/meal-suggest';
      const key=cfg.supabaseKey||DEFAULT_SUPABASE_KEY;
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+key},body:JSON.stringify(mealInventory())});
      const text=await res.text();
      if(!res.ok){
        let msg=text||'AI non disponibile';
        try{const j=JSON.parse(text); msg=j.error||j.message||JSON.stringify(j).slice(0,220);}catch(_){}
        throw new Error('Funzione AI: '+msg);
      }
      const data=JSON.parse(text||'{}');
      return data.meals||data.ideas||[];
    }
    function usableProductNames(){
      return state.products.filter(x=>!x.checked&&!isExpired(x)).map(x=>x.name).filter(Boolean);
    }
    function inventoryItems(){
      return state.products.filter(x=>!x.checked&&!isExpired(x));
    }
    function hasWords(text, words){
      const s=normalizeName(text);
      return words.some(w=>s.includes(normalizeName(w)));
    }
    function invFind(words){
      return inventoryItems().filter(x=>hasWords(x.name,words));
    }
    function invNames(words,limit=4){
      return invFind(words).map(x=>x.name).slice(0,limit);
    }
    function firstName(words){
      const f=invFind(words)[0];
      return f?f.name:'';
    }
    function makeMeal(title,why,used,missing,steps){
      return {title,why,used:[...new Set((used||[]).filter(Boolean))].slice(0,7),missing:missing||[],steps:steps||[]};
    }
    function expiringMealIngredients(){
      return state.products.filter(isExpiring)
        .filter(x=>!['latte','yogurt','acqua','bibita','succo','coca','fanta','sprite'].some(k=>normalizeName(x.name).includes(k)))
        .map(x=>x.name)
        .slice(0,5);
    }
    function localMealIdeas(){
      const all=usableProductNames();
      const s=all.map(normalizeName).join(' ');
      const has=words=>words.some(w=>s.includes(normalizeName(w)));
      const exp=expiringMealIngredients();
      const veg=invNames(['insalata','lattuga','verdura','zucchina','zucchine','carota','carote','pomodoro','pomodori','spinaci','rucola','peperone','peperoni','melanzana','broccoli']);
      const cheese=invNames(['formaggio','mozzarella','ricotta','parmigiano','grana','pecorino','stracchino']);
      const coldCuts=invNames(['prosciutto','salame','mortadella','speck','bresaola','affettato']);
      const eggs=invNames(['uova','uovo']);
      const pasta=firstName(['pasta','spaghetti','penne','fusilli','rigatoni','maccheroni']);
      const rice=firstName(['riso','risotto']);
      const bread=firstName(['pane','panino','toast','piadina','focaccia']);
      const fish=invNames(['tonno','salmone','pesce','merluzzo','gamberi']);
      const meat=invNames(['pollo','tacchino','carne','manzo','salsiccia','hamburger']);
      const ideas=[];
      const push=m=>{ if(m&&m.title&&!ideas.some(x=>x.title===m.title)) ideas.push(m); };

      if(selectedMood==='malato'){
        if(rice || pasta){
          const base=rice||pasta;
          push(makeMeal(`${base} leggero con olio e parmigiano`,'Piatto semplice e digeribile: adatto se non stai bene e non vuoi appesantirti.',[base,...cheese.slice(0,1)],cheese.length?[]:['parmigiano'],[`Cuoci ${base} molto morbido.`,`Condisci con poco olio e ${cheese[0]||'parmigiano'}.`,'Servi caldo e leggero.']));
        }else{
          push(makeMeal('Riso o pastina in brodo','È la scelta più coerente se sei malato: calda, semplice e poco pesante.',[],['riso','pastina','brodo'],['Prepara un brodo semplice.','Aggiungi riso o pastina.','Servi caldo.']));
        }
        if(veg.length) push(makeMeal('Vellutata leggera con verdure disponibili','Usa verdure disponibili senza trasformarle in un piatto pesante.',veg,['brodo o patata'],['Cuoci le verdure con poca acqua o brodo.','Frulla fino a crema.','Aggiungi olio a crudo.']));
      }

      if(selectedMood==='stanco'){
        if(eggs.length && (veg.length || cheese.length || coldCuts.length)){
          push(makeMeal('Frittata veloce svuota-frigo','Pochi passaggi e buona resa: ideale quando sei stanco.',[...eggs,...exp,...veg.slice(0,2),...cheese.slice(0,1),...coldCuts.slice(0,1)],[],['Sbatti le uova.','Aggiungi ingredienti disponibili da consumare.','Cuoci in padella 6-8 minuti.']));
        }
        if(bread && (coldCuts.length || cheese.length || veg.length)){
          push(makeMeal(`${bread} farcito rapido`,'Soluzione pratica e veloce con ingredienti già presenti.',[bread,...coldCuts.slice(0,2),...cheese.slice(0,1),...veg.slice(0,1)],[],[`Farcisci ${bread}.`,'Scalda se vuoi un piatto più comfort.','Aggiungi verdura come contorno.']));
        }
      }

      if(selectedMood==='triste'){
        if(pasta && (cheese.length || veg.length || coldCuts.length || exp.length)){
          push(makeMeal(`Pasta comfort con ${cheese[0]||veg[0]||coldCuts[0]||exp[0]}`,'Comfort food più concreto: caldo, semplice e con ingredienti realmente disponibili.',[pasta,...cheese.slice(0,2),...veg.slice(0,2),...coldCuts.slice(0,1),...exp.slice(0,2)],[],[`Cuoci ${pasta}.`,'Usa l’ingrediente principale come condimento caldo.','Manteca con poca acqua di cottura.']));
        }
      }

      if(selectedMood==='arrabbiato'){
        if(pasta || rice){
          const base=pasta||rice;
          push(makeMeal(`${base} saporito anti-spreco`,'Un piatto più deciso ma ancora pratico, usando ciò che hai.',[base,...veg.slice(0,2),...coldCuts.slice(0,1),...cheese.slice(0,1),...exp.slice(0,2)],['spezie o peperoncino'],[`Cuoci ${base}.`,'Salta il condimento in padella.','Aggiungi spezie/peperoncino se ti va.']));
        }
      }

      if(pasta && (veg.length || cheese.length || coldCuts.length || fish.length || meat.length || exp.length)){
        push(makeMeal(`Pasta con ${[...veg,...cheese,...coldCuts,...fish,...meat,...exp][0]}`,'Primo concreto basato sugli ingredienti che risultano presenti.',[pasta,...veg.slice(0,2),...cheese.slice(0,1),...coldCuts.slice(0,1),...fish.slice(0,1),...meat.slice(0,1),...exp.slice(0,2)],[],[`Cuoci ${pasta}.`,'Prepara il condimento con gli ingredienti indicati.','Unisci e salta un minuto.']));
      }else if(!pasta && (veg.length || cheese.length || coldCuts.length || exp.length)){
        push(makeMeal('Pasta salva-scadenze da completare','Hai ingredienti utili, ma manca una base per trasformarli in un pasto completo.',[...veg.slice(0,2),...cheese.slice(0,1),...coldCuts.slice(0,1),...exp.slice(0,2)],['pasta'],['Aggiungi pasta alla lista.','Usa gli ingredienti disponibili come condimento.']));
      }

      if(eggs.length){
        push(makeMeal('Frittata con prodotti da consumare','Piatto reale e flessibile: ottimo per usare ingredienti in scadenza.',[...eggs,...exp,...veg.slice(0,2),...cheese.slice(0,1),...coldCuts.slice(0,1)],[],['Sbatti le uova.','Aggiungi ingredienti tagliati piccoli.','Cuoci in padella o forno.']));
      }else if(veg.length || cheese.length || coldCuts.length || exp.length){
        push(makeMeal('Frittata salva-scadenze da completare','Manca solo la base proteica per usare bene gli ingredienti disponibili.',[...veg.slice(0,2),...cheese.slice(0,1),...coldCuts.slice(0,1),...exp.slice(0,2)],['uova'],['Aggiungi uova alla lista.','Usa gli ingredienti disponibili nella frittata.']));
      }

      if(bread && (coldCuts.length || cheese.length || veg.length)){
        push(makeMeal(`${bread} con ${coldCuts[0]||cheese[0]||veg[0]}`,'Pasto rapido, ma consigliato solo perché hai già una base tipo pane/piadina/toast.',[bread,...coldCuts.slice(0,2),...cheese.slice(0,1),...veg.slice(0,1)],[],[`Farcisci ${bread}.`,'Scalda o servi freddo.','Aggiungi verdura se disponibile.']));
      }else if((coldCuts.length || cheese.length) && !bread){
        push(makeMeal('Toast/piadina da completare','Hai il ripieno, ma manca una base: scegli tu cosa comprare.',[...coldCuts.slice(0,2),...cheese.slice(0,1)],['pane / piadina / toast'],['Scegli una base da aggiungere alla lista.','Farcisci con gli ingredienti già presenti.']));
      }

      if(veg.length && (fish.length || meat.length || cheese.length || eggs.length)){
        push(makeMeal('Bowl o insalata completa','Proposta più fresca e modulabile con quello che hai davvero.',[...veg.slice(0,3),...fish.slice(0,1),...meat.slice(0,1),...cheese.slice(0,1),...eggs.slice(0,1)],[(pasta||rice||bread)?'':'pane / riso'],['Prepara una base con verdure.','Aggiungi la proteina disponibile.','Completa con carboidrato se serve.']));
      }

      while(ideas.length<3){
        ideas.push(makeMeal('Piatto semplice da completare','Non ci sono abbastanza ingredienti chiari per una ricetta specifica.',exp,['pasta','uova','verdura'],['Aggiungi una base alla lista.','Usa prima eventuali prodotti in scadenza adatti.']));
      }
      return ideas.slice(0,3);
    }
    function cleanMissingToken(s){
      s=String(s||'').trim();
      s=s.replace(/^da aggiungere\s*:?/i,'').replace(/^aggiungi\s+/i,'');
      s=s.replace(/\b(se gradito|se vuoi|facoltativo|opzionale)\b/ig,'').trim();
      s=s.replace(/\.+$/,'').trim();
      return s;
    }
    function splitMissingOptions(s){
      s=cleanMissingToken(s);
      if(!s) return [];
      let norm=' '+s+' ';
      norm=norm.replace(/\s+oppure\s+/ig,' | ')
               .replace(/\s+o\s+/ig,' | ')
               .replace(/\s*\/\s*/g,' | ');
      const parts=norm.split('|').map(x=>cleanMissingToken(x)).filter(Boolean);
      return [...new Set(parts)];
    }
    function normalizeMealIdeas(ideas){
      return (ideas||[]).map(m=>{
        const rawMissing=[];
        if(Array.isArray(m.missing_groups)){
          m.missing_groups.forEach(g=>{
            if(Array.isArray(g?.options)) rawMissing.push(g.options.join(' / '));
            else if(g?.label) rawMissing.push(g.label);
          });
        }
        if(Array.isArray(m.missing)) rawMissing.push(...m.missing);
        const missingGroups=rawMissing.map(entry=>{
          const options=splitMissingOptions(entry);
          return options.length?{label:cleanMissingToken(entry),options}:null;
        }).filter(Boolean);
        const missing=[...new Set(missingGroups.flatMap(g=>g.options))];
        return {...m, missing_groups:missingGroups, missing};
      });
    }
    function renderMealIdeas(){
      const box=document.getElementById('meal-result');
      if(!mealIdeas.length){box.innerHTML='<div class="empty">Non ho trovato proposte. Prova un altro umore o aggiungi più prodotti.</div>';return;}
      const mode=mealAiMode==='ai'
        ? '<div class="meal-ai-status ai">Gemini AI collegata: proposte generate online</div>'
        : '<div class="meal-ai-status local">Modalità locale: Gemini non collegata o non disponibile</div><div id="meal-ai-error" class="meal-ai-error"></div>';
      box.innerHTML=mode+mealIdeas.map((m,i)=>`<article class="meal-idea"><div class="meal-head"><b>${i+1}. ${esc(m.title||'Pasto consigliato')}</b><span>${esc(selectedMood)}</span></div><p>${esc(m.why||'Proposta basata sugli articoli disponibili.')}</p>${(m.used&&m.used.length)?`<div class="meal-line"><b>Usa:</b> ${m.used.map(esc).join(', ')}</div>`:''}${(m.missing_groups&&m.missing_groups.length)?`<div class="meal-line"><b>Da aggiungere:</b> ${m.missing_groups.map(g=>esc(g.label||g.options.join(' / '))).join('; ')} <button class="add-link" onclick="openMealMissingChooser(${i})">Scegli cosa aggiungere</button></div>`:''}${(m.steps&&m.steps.length)?`<ol>${m.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}<div class="meal-actions"><button class="secondary" type="button" onclick="saveMealIdea(${i})">Salva ricetta</button></div></article>`).join('');
    }
    function openMealMissingChooser(i){
      const m=mealIdeas[i];
      const groups=(m&&m.missing_groups)||[];
      if(!groups.length) return toast('Nessun ingrediente da aggiungere');
      pendingMealOptions=groups.map((g,gi)=>({group:gi,label:g.label,options:g.options.map((opt,oi)=>({name:opt,id:`mealopt-${gi}-${oi}`,selected:g.options.length===1}))}));
      const box=document.getElementById('meal-missing-chooser');
      box.innerHTML=pendingMealOptions.map((g,gi)=>`<div class="chooser-group"><div class="chooser-title">${esc(g.label||'Ingredienti suggeriti')}</div><div class="chooser-options">${g.options.map((opt,oi)=>`<label class="chooser-option"><input type="checkbox" ${opt.selected?'checked':''} onchange="toggleMealOption(${gi},${oi},this.checked)"><span>${esc(opt.name)}</span></label>`).join('')}</div></div>`).join('');
      document.getElementById('modal-meal-add').classList.add('open');
    }
    function toggleMealOption(gi,oi,val){
      if(!pendingMealOptions[gi]||!pendingMealOptions[gi].options[oi]) return;
      pendingMealOptions[gi].options[oi].selected=!!val;
    }
    async function confirmMealMissingSelection(){
      const selected=[...new Set(pendingMealOptions.flatMap(g=>g.options.filter(o=>o.selected).map(o=>cleanMissingToken(o.name))).filter(Boolean))];
      if(!selected.length) return toast('Seleziona almeno un ingrediente');
      for(const name of selected){
        const item=normalizeItem({id:newId('shopping'),family_code:cfg.familyCode,list_type:'shopping',name,category:'dispensa',qty:1,unit:'pz',checked:false,added_at:Date.now(),updated_at:Date.now()});
        state.shoppingList.unshift(item);
        await upsertOne(item);
      }
      saveLocal();
      document.getElementById('modal-meal-add').classList.remove('open');
      render();
      toast('Ingredienti aggiunti alla lista spesa');
    }

function openReceiptScan(){
      closeAllModals();
      const file=document.getElementById('receipt-file');
      if(file)file.value='';
      const box=document.getElementById('receipt-result');
      if(box)box.innerHTML='<div class="empty">Carica o scatta la foto dello scontrino. L’AI riconoscerà solo gli articoli e li importerà nel carrello.</div>';
      document.getElementById('modal-receipt').classList.add('open');
    }
    function fileToBase64(file){
      return new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result||''));
        reader.onerror=reject;
        reader.readAsDataURL(file);
      });
    }
    async function scanReceipt(){
      const input=document.getElementById('receipt-file');
      const file=input&&input.files&&input.files[0];
      if(!file)return toast('Carica una foto dello scontrino');
      const box=document.getElementById('receipt-result');
      box.innerHTML='<div class="empty">Gemini sta leggendo lo scontrino...</div>';
      try{
        const image=await fileToBase64(file);
        const url=(cfg.supabaseUrl||DEFAULT_SUPABASE_URL).replace(/\/+$/,'')+'/functions/v1/receipt-vision';
        const key=cfg.supabaseKey||DEFAULT_SUPABASE_KEY;
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+key},body:JSON.stringify({image,shopping:state.shoppingList.map(x=>({id:x.id,name:x.name,qty:x.qty,unit:x.unit,category:x.category}))})});
        const text=await res.text();
        if(!res.ok){
          let msg=text||'Errore scansione';
          try{const j=JSON.parse(text); msg=j.error||j.message||JSON.stringify(j).slice(0,180);}catch(_){}
          throw new Error(msg);
        }
        const data=JSON.parse(text||'{}');
        const products=Array.isArray(data.products)?data.products:[];
        if(!products.length){box.innerHTML='<div class="empty">Nessun articolo riconosciuto. Prova una foto più nitida.</div>';return;}
        await importReceiptProducts(products);
        box.innerHTML=`<div class="meal-ai-status ai">Importati ${products.length} articoli nel carrello</div><div class="receipt-list">${products.map(p=>`<div>${esc(p.name||'voce')} · ${esc(String(p.qty||1))} ${esc(p.unit||'pz')}</div>`).join('')}</div>`;
      }catch(e){
        console.warn('Errore scansione scontrino',e);
        box.innerHTML=`<div class="meal-ai-status local">Scansione non riuscita: ${esc(String(e&&e.message?e.message:e).slice(0,180))}</div>`;
      }
    }
    async function importReceiptProducts(products){
      const imported=[];
      for(const p of products){
        const name=String(p.name||'').trim();
        if(!name)continue;
        const match=state.shoppingList.find(x=>sameProductName(x.name,name));
        let item;
        if(match){
          item=findRemove('shopping',match.id);
          item.list_type='cart';
          item.name=name||item.name;
          item.qty=Number(p.qty||item.qty||1);
          item.unit=String(p.unit||item.unit||'pz');
          item.category=normalizeCategory(p.category||item.category||inferCategoryFromName(name));
          item.updated_at=Date.now();
        }else{
          item=normalizeItem({id:newId('cart'),family_code:cfg.familyCode,list_type:'cart',name,category:normalizeCategory(p.category||inferCategoryFromName(name)),qty:Number(p.qty||1),unit:String(p.unit||'pz'),notes:'da scontrino',checked:false,added_at:Date.now(),updated_at:Date.now()});
        }
        state.cart.unshift(item);
        imported.push(item);
        await upsertOne(item);
      }
      saveLocal();
      render();
      updateNavBadges();
      toast(`${imported.length} articoli nel carrello`);
    }
    function openSettings(){document.getElementById('supabase-url').value=cfg.supabaseUrl||DEFAULT_SUPABASE_URL;document.getElementById('supabase-key').value=cfg.supabaseKey||DEFAULT_SUPABASE_KEY;const f=document.getElementById('settings-family');if(f)f.textContent=cfg.familyCode||'offline';document.getElementById('modal-settings').classList.add('open');renderDebug();}
    function saveSettings(){cfg.supabaseUrl=document.getElementById('supabase-url').value.trim()||DEFAULT_SUPABASE_URL;cfg.supabaseKey=document.getElementById('supabase-key').value.trim()||DEFAULT_SUPABASE_KEY;saveConfig();closeAllModals();initSupabase();fullSync();}
    

    function initSupabase(){
      resetRealtime();
      if(cfg.offline||!cfg.supabaseUrl||!cfg.supabaseKey||!window.supabase){
        setSyncStatus(cfg.offline?'offline':'config');
        return;
      }
      try{
        sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
        subscribeRealtime();
        lastError='';
        setSyncStatus('online');
      }catch(e){setLastError(e);setSyncStatus('error');}
    }
    function resetRealtime(){if(channel&&sb)try{sb.removeChannel(channel)}catch{} channel=null;sb=null;}
    function subscribeRealtime(){
      if(!sb||!cfg.familyCode)return;
      channel=sb.channel('items-'+cfg.familyCode)
        .on('postgres_changes',{event:'*',schema:'public',table:'items'},payload=>{
          const row=payload.new||payload.old;
          if(row&&normalizeFamilyCode(row.family_code)===cfg.familyCode)fullSync();
        }).subscribe();
    }
    function rowFromItem(it){it=normalizeItem(it);return{id:it.id,family_code:cfg.familyCode,list_type:it.list_type,name:it.name,category:it.category,qty:Math.max(0,Math.round(Number(it.qty)||1)),unit:it.unit||'pz',notes:it.notes||'',checked:!!it.checked,confirmed:!!it.confirmed,origin_category:it.origin_category||it.category,added_at:it.added_at||Date.now(),checked_at:it.checked_at||null,updated_at:Date.now(),expiry:it.expiry||null};}
    function applyRows(rows){
      state=emptyState();
      (rows||[]).forEach(r=>{const it=normalizeItem(r); if(it.list_type==='shopping')state.shoppingList.push(it);else if(it.list_type==='cart')state.cart.push(it);else state.products.push(it);});
      saveLocal(false);render();
    }
    async function fullSync(){
      normalizeState();
      if(cfg.offline){setSyncStatus('offline');return;}
      if(!sb){initSupabase();}
      if(!sb){setSyncStatus('config');return;}
      setSyncStatus('sync');
      try{
        const {data,error}=await sb.from('items').select('*').ilike('family_code',cfg.familyCode).order('added_at',{ascending:false});
        if(error)throw error;
        applyRows(data||[]);
        lastError='';
        setSyncStatus('online');
      }catch(e){setLastError(e);setSyncStatus('error');}
      finally{renderDebug();}
    }
    async function upsertOne(item){
      if(cfg.offline)return;
      if(!sb){initSupabase();}
      if(!sb)return;
      try{
        const {error}=await sb.from('items').upsert(rowFromItem(item),{onConflict:'id'});
        if(error)throw error;
        lastError='';
        setSyncStatus('online');
      }catch(e){setLastError(e);setSyncStatus('error');}
      finally{renderDebug();}
    }
    async function deleteRemote(id){
      if(cfg.offline)return;
      if(!sb){initSupabase();}
      if(!sb)return;
      try{
        const {error}=await sb.from('items').delete().eq('id',id);
        if(error)throw error;
        lastError='';
        setSyncStatus('online');
      }catch(e){setLastError(e);setSyncStatus('error');}
      finally{renderDebug();}
    }
    async function testRemoteRead(){
      if(!sb){initSupabase();}
      if(!sb)return toast('Configura Supabase');
      try{
        const {data,error}=await sb.from('items').select('id,family_code,list_type,name').ilike('family_code',cfg.familyCode).limit(50);
        if(error)throw error;
        toast(`Test sync OK: ${(data||[]).length} righe`);
        fullSync();
      }catch(e){setLastError(e);toast('Errore test sync');}
    }
    function setSyncStatus(status){document.querySelectorAll('.sync').forEach(el=>{el.className='sync '+(status==='online'?'online':status==='error'?'error':'');el.textContent=status==='online'?'sincronizzato':status==='error'?'errore':status==='config'?'configura Supabase':status==='sync'?'sync...':status==='offline'?'offline':status;});}
    function renderDebug(){const box=document.getElementById('debug');if(!box)return;const key=cfg.supabaseKey?cfg.supabaseKey.slice(0,8)+'…'+cfg.supabaseKey.slice(-5):'MANCANTE';box.textContent=`VERSIONE: ${APP_VERSION}
FAMIGLIA: ${cfg.familyCode||'offline'}
SUPABASE URL: ${cfg.supabaseUrl}
ANON KEY: ${key}
LOCAL products/shopping/cart: ${state.products.length}/${state.shoppingList.length}/${state.cart.length}
ULTIMO ERRORE: ${lastError||'nessuno'}`;}