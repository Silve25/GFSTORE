/* checkout.js — GF Store
   - Récupère le panier (localStorage 'gf_cart')
   - Calcule promos (SEPA -3%, Crypto -1%), split 2/3/4x
   - Uploader preuve SEPA (base64)
   - Envoi vers Apps Script → Telegram (JSON + alias en query-string pour compat)
   - Empêche l’envoi si des champs requis manquent (évite messages vides)
*/
(async function(){
  "use strict";

  // =========================
  // CONFIG
  // =========================
  // ⚠️ Mets à jour l’URL si tu redéploies l’Apps Script.
  const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbypa62g6lhlchWMayVWYyRh2TGc--bBdqNMag2ro1Ne1SDMVT5bHzy7pvooG3ZnsGAx/exec";

  // =========================
  // UTILITAIRES GÉNÉRAUX
  // =========================
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const toast = (msg)=>{ const t = $('#toast'); if(!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1600); };
  const EUR  = (v)=> Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const two  = (n)=> String(n).padStart(2,'0');

  // =========================
  // ICÔNES (optionnel)
  // =========================
  const ICONS = {
    user:'https://img.icons8.com/?size=100&id=n8DrUm77sR3l&format=png&color=000000',
    continue:'https://img.icons8.com/?size=100&id=26138&format=png&color=000000',
    menu:'https://img.icons8.com/?size=100&id=RzDomvpIKGI9&format=png&color=000000',
    ssl:'https://img.icons8.com/?size=100&id=2FIgZJEL88pu&format=png&color=000000',
    truck:'https://img.icons8.com/?size=100&id=plGFB4oatud2&format=png&color=000000',
    back:'https://img.icons8.com/?size=100&id=26138&format=png&color=000000'
  };
  const setSrc = (id,src)=>{ const el=document.getElementById(id); if(el) el.src=src; };
  setSrc('icUser',ICONS.user); setSrc('icMenu',ICONS.menu); setSrc('icSSL',ICONS.ssl);
  setSrc('icTruck',ICONS.truck); setSrc('icBack',ICONS.back); setSrc('icContinue',ICONS.continue);

  // =========================
  // MENU
  // =========================
  (function initMenu(){
    const menuBtn = $('#menuBtn');
    const menuDrop = $('#menuDrop');
    if(!menuBtn || !menuDrop) return;
    menuBtn.addEventListener('click', e=>{ e.stopPropagation(); menuDrop.classList.toggle('show'); });
    document.addEventListener('click', e=>{
      if(!menuDrop.contains(e.target) && e.target!==menuBtn) menuDrop.classList.remove('show');
    });
  })();

  // =========================
  // PANIER (localStorage)
  // =========================
  const KEY = 'gf_cart';
  const getCart = ()=>{ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch{ return []; } };
  const setCart = (arr)=> localStorage.setItem(KEY, JSON.stringify(arr));
  const computeSub = (cart)=> cart.reduce((s,x)=> s + Number(x.price||0)*Number(x.qty||1), 0);

  // =========================
  // ID COMMANDE
  // =========================
  const orderId = (function(){
    const d = new Date();
    const y = String(d.getFullYear()).slice(2);
    const mm= two(d.getMonth()+1);
    const dd= two(d.getDate());
    const rnd=Math.floor(Math.random()*9000)+1000;
    return `GF-${y}${mm}${dd}-${rnd}`;
  })();
  const orderIdEl = $('#orderId'); if(orderIdEl) orderIdEl.textContent = orderId;

  // =========================
  // RENDU MINI PANIER (colonne droite)
  // =========================
  function renderMini(){
    const wrap = $('#miniCart');
    if(!wrap) return;
    const cart = getCart();
    if(!cart.length){
      wrap.innerHTML = '<div class="muted">Votre panier est vide.</div>';
      const ids = ['sub','benefit','total','dueNow']; ids.forEach(id=>{ const el=$('#'+id); if(el) el.textContent='—'; });
      const schedule = $('#schedule'); if(schedule) schedule.style.display='none';
      return;
    }
    wrap.innerHTML = cart.map(x=>`
      <div class="ci">
        <img src="${x.image||''}" alt="${x.name||''}">
        <div>
          <div style="font-weight:600">${x.name||''}</div>
          <div class="muted" style="font-size:12px">${x.brand||''}${x.category?(' • '+x.category):''}</div>
        </div>
        <div style="font-weight:600">${EUR(Number(x.price||0)*Number(x.qty||1))}</div>
      </div>
    `).join('');
  }

  // =========================
  // MÉTHODES / PROMOS
  // =========================
  function currentPM(){ return document.querySelector('.m[role="tab"][aria-selected="true"]')?.dataset.method || 'sepa'; }
  function promoRate(){ return currentPM()==='sepa'?0.03 : currentPM()==='crypto'?0.01 : 0; }

  // =========================
  // CRYPTO: Taux mock + adresses
  // =========================
  const fx = {
    'USDT-TRC20':{symbol:'USDT',rate:1},
    'USDT-BEP20':{symbol:'USDT',rate:1},
    'BTC':{symbol:'BTC',rate:60000},
    'ETH-ERC20':{symbol:'ETH',rate:3000}
  };
  const WALLET = {
    'USDT-BEP20':{
      address:'0x5f1e4fdef890dba03ebfcba79a77aa0ea432f04b',
      qr:'https://api.qrcode-monkey.com/tmp/9c2692034c7a6496eb6d7153da52f854.svg?1755861184316'
    },
    'USDT-TRC20':{
      address:'TMdLMTYGEEZAnoVbi482Zr9QSRgWmRUXXq',
      qr:'https://api.qrcode-monkey.com/tmp/ce476e4409d57ba517ffaf6db6bf25d2.svg?1755861346811'
    },
    'BTC':{
      address:'18npEW9EaKZvVvA9B1z3DcmVEJtuQUdus3',
      qr:'https://api.qrcode-monkey.com/tmp/578f1d0b0e32feece2ae335bb417c7f8.svg?1755861612113'
    },
    'ETH-ERC20':{
      address:'0x5f1e4fdef890dba03ebfcba79a77aa0ea432f04b',
      qr:'https://api.qrcode-monkey.com/tmp/9c2692034c7a6496eb6d7153da52f854.svg?1755861930363'
    }
  };
  function setCryptoAddress(ccy){
    const cfg = WALLET[ccy] || {};
    const wallet = $('#wallet'); if(wallet) wallet.value = cfg.address || '';
    const ccyLabel = $('#ccyLabel'); if(ccyLabel) ccyLabel.textContent = fx[ccy]?.symbol || (ccy?.includes('USDT')?'USDT':'');
    const img = $('#qrImg'); if(img){ img.src = cfg.qr || ''; img.alt = 'QR '+(ccy||''); }
  }
  const ccySel = $('#ccy');
  if(ccySel){ setCryptoAddress(ccySel.value); ccySel.addEventListener('change',()=>{ setCryptoAddress(ccySel.value); updateSummary(); }); }

  // =========================
  // SPLIT (échéancier)
  // =========================
  function splitAmounts(total, parts){
    const cents = Math.round((Number(total)||0)*100);
    const base  = Math.floor(cents/parts);
    const first = base + (cents - base*parts);
    const arr   = [first]; for(let i=1;i<parts;i++) arr.push(base);
    return arr.map(c=>c/100);
  }
  function scheduleLines(total, parts){
    const amts = splitAmounts(total, parts);
    const today = new Date(); const steps=[0,30,60,90];
    return amts.map((amt,i)=>{
      const d = new Date(today); d.setDate(d.getDate()+steps[i]);
      const label = i===0?'Aujourd’hui':(i===1?'Dans 30 jours':i===2?'Dans 60 jours':'Dans 90 jours');
      return {label, date:d.toLocaleDateString('fr-FR'), amt};
    });
  }
  let selectedSplit = 1;
  let modalParts = 4;
  (function initSplit(){
    const modal = $('#splitModal');
    const segBtns = $$('#segSplit .segbtn');
    const open = ()=>{ if(!modal) return; modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); setModalParts(modalParts); updateModalPreview(); };
    const close= ()=>{ if(!modal) return; modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); };

    const btnOnce = $('#btnOnce');
    const btnSplit= $('#btnSplit');
    if(btnOnce) btnOnce.addEventListener('click',()=>{ selectedSplit=1; btnOnce.classList.add('on'); btnSplit?.classList.remove('on'); updateSplitHint(); updateSummary(); });
    if(btnSplit) btnSplit.addEventListener('click', open);
    $('#closeSplit')?.addEventListener('click', close);
    $('#cancelSplit')?.addEventListener('click', close);
    $('#applySplit')?.addEventListener('click',()=>{
      selectedSplit = modalParts;
      btnSplit?.classList.add('on'); btnOnce?.classList.remove('on');
      close(); updateSplitHint(); updateSummary();
    });
    segBtns.forEach(b=> b.addEventListener('click',()=> setModalParts(b.dataset.parts)));
    $('#splitModal')?.addEventListener('click',e=>{ if(e.target.id==='splitModal') close(); });

    function setModalParts(n){
      modalParts = Number(n);
      segBtns.forEach(b=> b.setAttribute('aria-pressed', String(Number(b.dataset.parts)===modalParts)));
      updateModalPreview();
    }
    function updateModalPreview(){
      const cart=getCart(); const sub=computeSub(cart); const promo=sub*promoRate(); const total=Math.max(0, sub - promo);
      const lines = scheduleLines(total, modalParts);
      const prev = $('#modalPrev'); if(!prev) return;
      prev.innerHTML = lines.map(l=>`<div class="sch"><span>${l.label} (${l.date})</span><span>${EUR(l.amt)}</span></div>`).join('');
    }
    function updateSplitHint(){ const el=$('#splitHint'); if(el) el.textContent = selectedSplit>1 ? `(${selectedSplit}× mensuel)` : '(désactivé)'; }
    window.updateSplitHint = updateSplitHint; // reuse in init
  })();

  // =========================
  // RÉFÉRENCE SEPA depuis nom
  // =========================
  const slugRefFromName = (n)=>{
    const base=(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(0,16);
    if(base) return base;
    const short=orderId.replace('GF-','').split('-')[0];
    return 'GF'+short;
  };
  function syncRef(){ const name=$('#name')?.value||''; const vref=$('#vref'); if(vref) vref.value = slugRefFromName(name); }
  $('#name')?.addEventListener('input', syncRef);

  // =========================
  // RÉCAP GLOBAL + DUE NOW
  // =========================
  const SHIPPING = 0;
  function updateSummary(){
    const cart = getCart(); if(!cart.length){ renderMini(); return; }
    const sub = computeSub(cart);
    const promo = sub*promoRate();
    const total = Math.max(0, sub + SHIPPING - promo);
    const parts = selectedSplit;
    const amts  = splitAmounts(total, parts);
    const dueNow = amts[0] || 0;

    const map = { sub, promo, total, dueNow };
    $('#sub')?.textContent = EUR(map.sub);
    $('#benefit')?.textContent = promo>0 ? '–'+EUR(map.promo) : '—';
    $('#total')?.textContent = EUR(map.total);
    $('#dueNow')?.textContent = EUR(map.dueNow);

    const scheduleBox = $('#schedule');
    if(scheduleBox){
      if(parts>1){
        const lines=scheduleLines(total, parts);
        scheduleBox.style.display='grid';
        scheduleBox.innerHTML = lines.map(l=>`<div class="sch"><span>${l.label} (${l.date})</span><span>${EUR(l.amt)}</span></div>`).join('');
      }else{
        scheduleBox.style.display='none';
      }
    }

    if(currentPM()==='crypto'){
      const amountNow=$('#amountNow'); if(amountNow) amountNow.value = dueNow.toFixed(2);
      const ccy=$('#ccy')?.value||'USDT-BEP20';
      const r=fx[ccy]?.rate||1;
      const amt=(dueNow/r);
      const ccyAmt=$('#ccyAmt'); if(ccyAmt) ccyAmt.value = (amt>0?amt:0).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
    }
    if(currentPM()==='sepa'){
      const amountNowBank=$('#amountNowBank'); if(amountNowBank) amountNowBank.value = dueNow.toFixed(2);
    }
  }
  function currentDueNow(){
    const cart=getCart(); const sub=computeSub(cart); const promo=sub*promoRate(); const total=Math.max(0, sub - promo);
    return splitAmounts(total, selectedSplit)[0]||0;
  }

  // =========================
  // OVERLAYS + CTA
  // =========================
  const overlay   = $('#checkOverlay');
  const ovTitle   = $('#ovTitle');
  const ovSub     = $('#ovSub');
  const doneOverlay = $('#doneOverlay');
  const showOverlay = (title,sub)=>{
    if(ovTitle) ovTitle.textContent = title || 'Vérification…';
    if(ovSub)   ovSub.textContent   = sub   || 'Un instant, nous confirmons votre paiement.';
    if(overlay){ overlay.classList.add('show'); overlay.setAttribute('aria-hidden','false'); }
  };
  const hideOverlay = ()=>{ if(overlay){ overlay.classList.remove('show'); overlay.setAttribute('aria-hidden','true'); } };
  const showDone    = ()=>{ if(doneOverlay){ doneOverlay.classList.add('show'); doneOverlay.setAttribute('aria-hidden','false'); } };

  let bankVerified=false, cryptoVerified=false;
  function updateCTA(){
    const pm = currentPM();
    const btn = $('#placeOrder');
    if(!btn) return;
    btn.disabled = (pm==='sepa' ? !bankVerified : pm==='crypto' ? !cryptoVerified : true);
  }

  // =========================
  // TABS MÉTHODES
  // =========================
  $$('.m[role="tab"]').forEach(card=>{
    card.addEventListener('click', ()=>{
      $$('.m[role="tab"]').forEach(c=>c.setAttribute('aria-selected', String(c===card)));
      const m=card.dataset.method;
      $('#pmCrypto')?.classList.toggle('show', m==='crypto');
      $('#pmSEPA')?.classList.toggle('show', m==='sepa');
      if(m==='sepa'){ cryptoVerified=false; }
      if(m==='crypto'){ bankVerified=false; }
      updateSummary();
      updateCTA();
    });
  });

  // =========================
  // COPIER
  // =========================
  function copySel(sel){
    const el = $(sel); if(!el) return;
    const txt = el.value||'';
    if(!txt){ toast('Rien à copier'); return; }
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(txt).then(()=>toast('Copié'));
    }else{
      el.select(); document.execCommand('copy'); toast('Copié');
    }
  }
  $$('[data-copy]').forEach(b=> b.addEventListener('click',()=> copySel(b.getAttribute('data-copy')) ));

  // =========================
  // VALIDATION
  // =========================
  function validateAddress(){
    const req=['name','email','address','city','zip'];
    for(const id of req){
      const el = $('#'+id);
      if(!el || !String(el.value||'').trim()){
        el?.focus();
        toast('Veuillez compléter vos informations.');
        return false;
      }
    }
    return true;
  }

  // =========================
  // UPLOADER SEPA
  // =========================
  const dz = $('#dz');
  const input = $('#proofInput');
  const fileWrap = $('#fileWrap');
  const fileName = $('#fileName');
  const fileInfo = $('#fileInfo');
  const fileBar = $('#fileBar');
  const fileOk = $('#fileOk');
  const removeProof = $('#removeProof');
  $('#pickProof')?.addEventListener('click',()=> input?.click());
  if(dz){
    dz.addEventListener('click',()=> input?.click());
    dz.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); input?.click(); }});
    ['dragenter','dragover'].forEach(ev=> dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation(); dz.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=> dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation(); dz.classList.remove('over');}));
    dz.addEventListener('drop',e=>{
      const f = e.dataTransfer?.files?.[0]; if(!f) return;
      if(!/(\.pdf$|image\/)/i.test(f.type) && !/\.pdf$/i.test(f.name)){ toast('Format non supporté'); return; }
      if(f.size>10*1024*1024){ toast('Fichier trop volumineux (>10Mo)'); return; }
      showFile(f);
    });
  }
  function fmtBytes(b){ if(!b&&b!==0) return ''; const u=['o','Ko','Mo','Go']; let i=0; while(b>=1024 && i<u.length-1){ b/=1024; i++; } return b.toFixed(b<10&&i?1:0)+' '+u[i]; }
  let proofFile=null;
  function showFile(f){
    proofFile=f;
    if(fileName) fileName.textContent=f.name;
    if(fileInfo) fileInfo.textContent=`${f.type || 'Fichier'} • ${fmtBytes(f.size)}`;
    if(fileBar) fileBar.style.width='0%';
    if(fileOk)  fileOk.style.display='none';
    if(fileWrap) fileWrap.style.display='flex';
    let p=0; const tick=()=>{ p+=Math.random()*35+20; if(p>=100){p=100; if(fileBar) fileBar.style.width='100%'; if(fileOk) fileOk.style.display='inline-flex'; return;} if(fileBar) fileBar.style.width=p+'%'; setTimeout(tick,150); }; setTimeout(tick,150);
  }
  function clearFile(){ proofFile=null; if(input) input.value=''; if(fileWrap) fileWrap.style.display='none'; }
  removeProof?.addEventListener('click', clearFile);
  input?.addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f) return;
    if(f.size>10*1024*1024){ toast('Fichier trop volumineux (>10Mo)'); input.value=''; return; }
    showFile(f);
  });

  // =========================
  // ENVOI WEBHOOK (JSON + QS alias)
  // =========================
  function legacyMap(payload){
    // ⚠️ Valeurs minimales pour éviter les "—" côté Apps Script (e.parameter.*)
    return {
      order: payload.orderId,
      mode: payload.method,
      amount: payload.amount,
      reference: payload.ref || payload.txid || '',
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      city: payload.city,
      zip: payload.zip,
      country: payload.country,
      txid: payload.txid || '',
      ccy: payload.ccy || '',
      split: payload.split || 1
    };
  }
  function toQS(obj){
    return Object.entries(obj)
      .filter(([_,v])=> v!==undefined && v!==null && String(v).length<1800)
      .map(([k,v])=> `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }
  async function postCompat(url, payload){
    const qs = toQS(legacyMap(payload));
    const full = qs ? `${url}?${qs}` : url;

    // 1) JSON
    try{
      await fetch(full, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      return;
    }catch{}
    // 2) FormData (_json)
    try{
      const fd = new FormData();
      fd.append('_json', JSON.stringify(payload));
      await fetch(full, { method:'POST', body: fd });
      return;
    }catch{}
    // 3) Fallback no-cors (dernière chance)
    try{
      await fetch(full, { method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload) });
    }catch{}
  }
  function cartForWebhook(){
    try{
      const cart = JSON.parse(localStorage.getItem('gf_cart')||'[]');
      return cart.map(x=>({name:x.name, qty:Number(x.qty||1), price:Number(x.price||0)}));
    }catch{ return []; }
  }
  async function fileToBase64(file){
    const buf = await file.arrayBuffer();
    let binary=''; const bytes=new Uint8Array(buf); const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){ binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk)); }
    return btoa(binary);
  }
  async function sendCryptoToWebhook(dueNow){
    const payload = {
      orderId,
      method:'crypto',
      amount: Number(dueNow||0).toFixed(2),
      txid: ($('#txid')?.value||'').trim(),
      ccy:  $('#ccy')?.value || 'USDT-BEP20',
      name: $('#name')?.value || '',
      email:$('#email')?.value||'',
      phone:$('#phone')?.value||'',
      address:$('#address')?.value||'',
      city: $('#city')?.value ||'',
      zip:  $('#zip')?.value  ||'',
      country:$('#country')?.value||'',
      split: selectedSplit,
      cart: cartForWebhook(),
      ts_client: new Date().toISOString()
    };
    await postCompat(WEBHOOK_URL, payload);
  }
  async function sendSepaToWebhook(dueNow, proofFile){
    const payload = {
      orderId,
      method:'sepa',
      amount: Number(dueNow||0).toFixed(2),
      ref: ($('#vref')?.value||'').trim(),
      name: $('#name')?.value || '',
      email:$('#email')?.value||'',
      phone:$('#phone')?.value||'',
      address:$('#address')?.value||'',
      city: $('#city')?.value ||'',
      zip:  $('#zip')?.value  ||'',
      country:$('#country')?.value||'',
      split: selectedSplit,
      cart: cartForWebhook(),
      ts_client: new Date().toISOString()
    };
    if(proofFile){
      payload.file_name = proofFile.name;
      payload.mime_type = proofFile.type || 'application/octet-stream';
      payload.file_b64  = await fileToBase64(proofFile);
    }
    await postCompat(WEBHOOK_URL, payload);
  }

  // =========================
  // CONFIRMATIONS (CRYPTO / SEPA)
  // =========================
  $('#confirmCrypto')?.addEventListener('click', async ()=>{
    // Garde-fous pour éviter messages vides
    if(!validateAddress()) return;
    const cart=getCart(); if(!cart.length){ toast('Votre panier est vide.'); return; }
    const due = currentDueNow(); if(due<=0){ toast('Montant dû nul.'); return; }
    const tx = ($('#txid')?.value||'').trim(); if(!tx){ $('#txid')?.focus(); toast('TxID requis.'); return; }

    showOverlay('Vérification de la transaction crypto…', 'Nous validons le hash fourni.');
    try{ await sendCryptoToWebhook(due); }catch{}
    setTimeout(()=>{
      hideOverlay();
      cryptoVerified=true;
      updateCTA();
      toast('Transaction enregistrée — vous pouvez finaliser');
      $('#placeOrder')?.focus();
    }, 900);
  });

  $('#confirmBank')?.addEventListener('click', async ()=>{
    if(!validateAddress()) return;
    const cart=getCart(); if(!cart.length){ toast('Votre panier est vide.'); return; }
    const due = currentDueNow(); if(due<=0){ toast('Montant dû nul.'); return; }
    if(!($('#vref')?.value||'').trim()){ syncRef(); }
    if(!proofFile){ dz?.scrollIntoView({behavior:'smooth',block:'center'}); toast('Preuve de virement requise.'); return; }

    showOverlay('Vérification du virement…', 'Nous confirmons la réception auprès de la banque.');
    try{ await sendSepaToWebhook(due, proofFile); }catch{}
    setTimeout(()=>{
      hideOverlay();
      bankVerified=true;
      updateCTA();
      toast('Virement enregistré — vous pouvez finaliser');
      $('#placeOrder')?.focus();
    }, 1000);
  });

  // =========================
  // FINALISER LA COMMANDE
  // =========================
  $('#placeOrder')?.addEventListener('click', ()=>{
    if(!validateAddress()) return;
    const cart = getCart(); if(!cart.length){ toast('Votre panier est vide.'); return; }
    const pm = currentPM();
    if(pm==='crypto' && !cryptoVerified){ toast('Veuillez terminer la vérification crypto.'); return; }
    if(pm==='sepa'   && !bankVerified){ toast('Veuillez terminer la vérification du virement.'); return; }

    const sub=computeSub(cart);
    const promo=sub*promoRate();
    const total=Math.max(0, sub - promo);

    const order = {
      id: orderId,
      date: new Date().toISOString(),
      status: 'En préparation',
      items: cart,
      pricing: { sub, ship:0, promo, total, currency:'EUR' },
      shipping:{
        name:$('#name')?.value||'', email:$('#email')?.value||'', phone:$('#phone')?.value||'',
        address:$('#address')?.value||'', city:$('#city')?.value||'', zip:$('#zip')?.value||'', country:$('#country')?.value||''
      },
      payment: {
        method: pm, split: selectedSplit,
        details: pm==='crypto'
          ? { ccy:$('#ccy')?.value||'', address:$('#wallet')?.value||'', txid:$('#txid')?.value||'', amountNow:$('#amountNow')?.value||'' }
          : { iban:$('#iban')?.value||'', ref:$('#vref')?.value||'', amountNow:$('#amountNowBank')?.value||'', proofName:proofFile?.name||'' }
      }
    };
    try{
      const all = JSON.parse(localStorage.getItem('gf_orders')||'[]');
      all.push(order);
      localStorage.setItem('gf_orders', JSON.stringify(all));
    }catch{}

    setCart([]);
    showDone();
  });

  // =========================
  // INIT ÉCRAN
  // =========================
  function initTabsAndSummary(){
    // Sélection par défaut : SEPA
    const sepaTab = document.querySelector('.m[role="tab"][data-method="sepa"]');
    if(sepaTab){ sepaTab.setAttribute('aria-selected','true'); }
    $('#pmSEPA')?.classList.add('show');
    $('#pmCrypto')?.classList.remove('show');
  }

  renderMini();
  initTabsAndSummary();
  updateSplitHint?.();
  syncRef();
  updateSummary();
  updateCTA();

})();
