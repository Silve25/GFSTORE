/* ==========================================================================
   GF Store — catalogue.js
   - Charge /data/products.json
   - Recherche, filtres, tri, pagination
   - Cart minimal (fallback) + intégration App.addToCart si dispo
   - Offcanvas produit (si Bootstrap JS présent)
   ========================================================================== */
(() => {
  "use strict";

  // ------- DOM refs
  const grid     = document.getElementById('grid');
  const pager    = document.getElementById('pager');
  const count    = document.getElementById('count');
  const q        = document.getElementById('q');
  const filter   = document.getElementById('filter');
  const sort     = document.getElementById('sort');
  const min      = document.getElementById('min');
  const max      = document.getElementById('max');
  const onlyNew  = document.getElementById('only-new');
  const inStock  = document.getElementById('in-stock');
  const resetBtn = document.getElementById('reset');
  const chips    = document.getElementById('chips');
  const emptyMsg = document.getElementById('empty');

  // Offcanvas fiche (optionnel si bootstrap pas chargé)
  const offcanvasEl = document.getElementById('offcanvasProduct');
  const hasBootstrap = typeof window.bootstrap !== "undefined" && window.bootstrap.Offcanvas;
  const offcanvas = hasBootstrap && offcanvasEl ? new bootstrap.Offcanvas(offcanvasEl) : null;

  // Fiche DOM
  const elHero    = document.getElementById('p-hero');
  const elThumbs  = document.getElementById('p-thumbs');
  const elTitle   = document.getElementById('p-title');
  const elSubtitle= document.getElementById('p-subtitle');
  const elPrice   = document.getElementById('p-price');
  const elCat     = document.getElementById('p-cat');
  const elColors  = document.getElementById('p-colors');
  const elSizes   = document.getElementById('p-sizes');
  const elFeatures= document.getElementById('p-features');
  const elCare    = document.getElementById('p-care');
  const elMadeIn  = document.getElementById('p-madein');
  const elAdd     = document.getElementById('p-add');
  const elDeep    = document.getElementById('p-deeplink');

  // ------- State
  const PAGE_SIZE = 12;
  let all = [];
  let view = [];
  let page = 1;
  let currentProduct = null;
  let currentSize = null;

  // ------- Utils
  const fmt = (n) => Number(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const getName = p => p.title || p.name || 'Produit';
  const getPrice = p => Number(p.price ?? p.prix ?? 0);
  const catMapLabel = {kids:'Enfants', men:'Hommes', women:'Femmes'};
  const getCatKey = p => (p.category || p.categorie || p.gender || p.genre || '').toString().toLowerCase();
  const getCategory = p => {
    const k = getCatKey(p);
    return catMapLabel[k] || (k ? (k[0].toUpperCase()+k.slice(1)) : 'Produit');
  };
  const isNew = p => (p.is_new === true) ||
                     (Array.isArray(p.tags) && p.tags.some(t => String(t).toLowerCase().includes('nouve')));
  const hasStock = p => {
    if (p.stock && typeof p.stock === 'object') return Object.values(p.stock).some(v => Number(v) > 0);
    if (typeof p.stock === 'number') return p.stock > 0;
    return true;
  };
  const firstImage = p => {
    const c0 = Array.isArray(p.colors) ? p.colors[0] : null;
    const i0 = c0 && Array.isArray(c0.images) ? c0.images[0] : null;
    return i0 || 'images/product-item-1.jpg';
  };
  const allImages = p => {
    const arr = [];
    (p.colors||[]).forEach(c => (c.images||[]).forEach(u => arr.push(u)));
    return arr.length ? arr : [firstImage(p)];
  };
  const qsParam = (k, def="") => new URL(location.href).searchParams.get(k) || def;

  function showError(msg) {
    count && (count.textContent = msg);
    if (grid) grid.innerHTML = '';
  }

  // ------- Cart (fallback localStorage) + App.addToCart si dispo
  const CartLS = {
    key: "gf:cart",
    get() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
    set(v){ try { localStorage.setItem(this.key, JSON.stringify(v)); } catch {} },
    add(item){
      const items = this.get();
      const idx = items.findIndex(x => x.id === item.id);
      if (idx >= 0) items[idx].qty += item.qty;
      else items.push(item);
      this.set(items);
      badge(items.reduce((a,b)=>a+b.qty,0));
      toast(`${item.name} ajouté au panier`);
    }
  };

  function badge(qty){
    document.querySelectorAll(".cart-count").forEach(el => el.textContent = qty);
  }
  function toast(msg){
    let t = document.getElementById("gf-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "gf-toast";
      t.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 14px;border-radius:10px;z-index:2000;opacity:0;transition:opacity .25s";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    setTimeout(()=> t.style.opacity = "0", 1200);
  }

  function addToCart(p, sizeOpt){
    const id = String(p.sku || getName(p)) + (sizeOpt ? ('|'+sizeOpt) : '');
    const payload = {
      id,
      name: getName(p),
      price: getPrice(p),
      qty: 1,
      image: firstImage(p)
    };
    // Si un backend/app global existe, on lui délègue
    if (window.App && typeof window.App.addToCart === "function") {
      window.App.addToCart(payload, 1);
      badge((window.App.getCartQty && window.App.getCartQty()) || 1);
      toast(`${payload.name} ajouté au panier`);
    } else {
      CartLS.add(payload);
    }
  }

  // ------- Fiche produit (offcanvas)
  function colorDotBg(code){
    const c = String(code||'').toLowerCase();
    if (c.includes('white') || c.includes('ivory') || c === 'blanc') return '#fff';
    if (c.includes('black') || c === 'noir') return '#000';
    if (c.includes('navy')) return '#001f3f';
    if (c.includes('lightblue') || c.includes('bleu')) return '#cde5ff';
    if (c.includes('pink') || c.includes('rose')) return '#ffd6e7';
    return '#eee';
  }

  function showProduct(p){
    currentProduct = p;
    currentSize = null;

    // Images
    const imgs = allImages(p);
    if (elHero) {
      elHero.src = imgs[0] || '';
      elHero.alt = getName(p);
    }
    if (elThumbs) {
      elThumbs.innerHTML = '';
      imgs.slice(0,8).forEach((u,i)=>{
        const im = document.createElement('img');
        im.src = u; im.alt = getName(p)+' '+(i+1);
        if (i===0) im.classList.add('active');
        im.addEventListener('click', ()=>{
          if (elHero) elHero.src = u;
          elThumbs.querySelectorAll('img').forEach(x=>x.classList.remove('active'));
          im.classList.add('active');
        });
        elThumbs.appendChild(im);
      });
    }

    // Textes
    if (elTitle)    elTitle.textContent = getName(p);
    if (elSubtitle) elSubtitle.textContent = p.subtitle || '';
    if (elPrice)    elPrice.textContent = fmt(getPrice(p));
    if (elCat)      elCat.textContent = getCategory(p);
    if (elMadeIn)   elMadeIn.textContent = p.made_in ? ('Fabriqué en ' + p.made_in) : '';

    // Couleurs
    if (elColors) {
      elColors.innerHTML = '';
      (p.colors||[]).forEach(c=>{
        const dot = document.createElement('span');
        dot.className = 'p-color-dot';
        dot.title = c.label || c.code || '';
        dot.style.background = colorDotBg(c.code||c.label);
        dot.addEventListener('click', ()=>{ if (c.images?.[0] && elHero) elHero.src = c.images[0]; });
        elColors.appendChild(dot);
      });
    }

    // Tailles
    if (elSizes) {
      elSizes.innerHTML = '';
      if (Array.isArray(p.sizes) && p.sizes.length){
        const hint = document.createElement('div');
        hint.className = 'text-secondary small me-2';
        hint.textContent = 'Tailles :';
        elSizes.appendChild(hint);
        p.sizes.forEach(s=>{
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-sm btn-outline-secondary';
          btn.textContent = s;
          btn.addEventListener('click', ()=>{
            currentSize = s;
            elSizes.querySelectorAll('button').forEach(b=> b.classList.remove('active'));
            btn.classList.add('active');
          });
          elSizes.appendChild(btn);
        });
      }
    }

    // Détails
    if (elFeatures) elFeatures.innerHTML = (p.features||[]).map(f=>`<li>${f}</li>`).join('');
    if (elCare)     elCare.innerHTML     = (p.care||[]).map(f=>`<li>${f}</li>`).join('');

    // Actions
    if (elAdd)  elAdd.onclick = ()=> addToCart(p, currentSize);
    if (elDeep) elDeep.href   = `products.html?sku=${encodeURIComponent(p.sku||'')}`;

    // Mémorise le SKU dans l’URL
    const u = new URL(location.href);
    if (p.sku) { u.searchParams.set('sku', p.sku); history.replaceState({}, '', u); }

    // Ouvre l’offcanvas si dispo
    if (offcanvas) offcanvas.show();
  }

  function openIfSkuParam(){
    const sku = qsParam('sku', '');
    if (!sku) return;
    const p = all.find(x => String(x.sku) === sku);
    if (p) showProduct(p);
  }

  // ------- Rendu liste
  function formatPrice(n){ return n ? n.toLocaleString('fr-FR',{style:'currency',currency:'EUR'}) : '—'; }

  function render(){
    const total = view.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;

    if (count) count.textContent = total ? `${total} article${total>1?'s':''} — page ${page}/${pages}` : 'Aucun article';
    if (emptyMsg) emptyMsg.classList.toggle('d-none', !!total);

    const start = (page - 1) * PAGE_SIZE;
    const slice = view.slice(start, start + PAGE_SIZE);

    grid.innerHTML = '';
    const tpl = document.getElementById('tpl-card');

    slice.forEach(p => {
      const node = tpl.content.cloneNode(true);
      const link  = node.querySelector('.p-link');
      const img   = node.querySelector('img');
      const name  = node.querySelector('.name');
      const meta  = node.querySelector('.meta');
      const price = node.querySelector('.price');
      const badge = node.querySelector('.badge-new');
      const addBtn= node.querySelector('.add');

      // image + textes
      img.src = firstImage(p);
      img.alt = getName(p);
      name.textContent = getName(p);
      meta.textContent = getCategory(p) || '—';
      price.textContent = formatPrice(getPrice(p));
      if (isNew(p)) badge.classList.remove('d-none');

      // lien vers la page produit
      const href = `products.html?sku=${encodeURIComponent(p.sku||'')}`;
      if (link) {
        link.href = href;
        link.addEventListener('click', (e) => {
          // si offcanvas dispo, on bloque la nav et on montre la fiche rapide
          if (offcanvas) {
            e.preventDefault();
            showProduct(p);
          }
        }, {passive:false});
      }

      // Ajouter au panier
      addBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        addBtn.textContent = 'Ajouté ✓';
        addBtn.disabled = true;
        addToCart(p);
        setTimeout(()=>{ addBtn.textContent = 'Ajouter'; addBtn.disabled = false; }, 900);
      });

      grid.appendChild(node);
    });

    // pager
    pager.innerHTML = '';
    const makeItem = (label, pNum, disabled=false, active=false) => {
      const li = document.createElement('li');
      li.className = `page-item ${disabled?'disabled':''} ${active?'active':''}`;
      const a = document.createElement('a');
      a.className = 'page-link';
      a.href = '#';
      a.textContent = label;
      a.addEventListener('click', (e)=>{ e.preventDefault(); if(!disabled){ page=pNum; render(); window.scrollTo({top:0,behavior:'smooth'});} });
      li.appendChild(a);
      return li;
    };
    pager.appendChild(makeItem('«', 1, page===1));
    pager.appendChild(makeItem('‹', page-1, page===1));
    const windowSize = 3;
    let from = Math.max(1, page - windowSize);
    let to   = Math.min(pages, page + windowSize);
    for (let i=from; i<=to; i++) pager.appendChild(makeItem(String(i), i, false, i===page));
    pager.appendChild(makeItem('›', page+1, page===pages));
    pager.appendChild(makeItem('»', pages, page===pages));
  }

  function refreshChips(){
    chips.innerHTML = '';
    const addChip = (label, onX) => {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.innerHTML = `<span>${label}</span><button title="Retirer" type="button"><svg width="16" height="16"><use xlink:href="#close"/></svg></button>`;
      chip.querySelector('button').addEventListener('click', onX);
      chips.appendChild(chip);
    };
    if(q.value) addChip(`Recherche: "${q.value}"`, ()=>{ q.value=''; apply(); });
    if(filter.value!=='all') addChip(`Catégorie: ${filter.options[filter.selectedIndex].text}`, ()=>{ filter.value='all'; apply(); });
    if(sort.value!=='relevance') addChip(`Tri: ${sort.options[sort.selectedIndex].text}`, ()=>{ sort.value='relevance'; apply(); });
    if(min.value) addChip(`Min: ${min.value}€`, ()=>{ min.value=''; apply(); });
    if(max.value) addChip(`Max: ${max.value}€`, ()=>{ max.value=''; apply(); });
    if(onlyNew.checked) addChip('Nouveaux', ()=>{ onlyNew.checked=false; apply(); });
    if(inStock.checked) addChip('En stock', ()=>{ inStock.checked=false; apply(); });
  }

  function matchesQuery(p, text){
    if (!text) return true;
    const hay = (getName(p) + ' ' + (p.subtitle || '') + ' ' + (p.brand || '') + ' ' + getCategory(p)).toLowerCase();
    return hay.includes(text.toLowerCase());
  }
  function matchFilter(p, val){
    if (val === 'all') return true;
    const c = getCatKey(p);
    const map = {
      'homme': ['homme','hommes','men','man'],
      'femme': ['femme','femmes','women','woman'],
      'enfant': ['enfant','enfants','kids','kid','junior','boy','girl'],
      'accessoires': ['accessoires','accessory','accessories','cap','hat','gloves','bonnet','echarpe','scarf']
    };
    return (map[val] || [val]).some(k => c.includes(k));
  }

  function apply(){
    const text = q.value.trim();
    const f = filter.value;
    const minV = Number(min.value || 0);
    const maxV = Number(max.value || Infinity);

    view = all.filter(p => {
      const okQuery = matchesQuery(p, text);
      const okCat   = matchFilter(p, f);
      const price   = getPrice(p);
      const okPrice = price >= minV && price <= maxV;
      const okNew   = !onlyNew.checked || isNew(p);
      const okStock = !inStock.checked || hasStock(p);
      return okQuery && okCat && okPrice && okNew && okStock;
    });

    switch (sort.value) {
      case 'price-asc':  view.sort((a,b)=> getPrice(a)-getPrice(b)); break;
      case 'price-desc': view.sort((a,b)=> getPrice(b)-getPrice(a)); break;
      case 'newest':
        view.sort((a,b)=> (new Date(b.created_at||b.date||0)) - (new Date(a.created_at||a.date||0)));
        break;
      default:
        view.sort((a,b)=>{
          const wa = (isNew(a)?1:0) + (matchesQuery(a, q.value)?1:0);
          const wb = (isNew(b)?1:0) + (matchesQuery(b, q.value)?1:0);
          return wb - wa;
        });
    }

    page = 1;
    refreshChips();
    render();
  }

  // ------- Data loader
  function showSkeletons(n=8){
    grid.innerHTML = '';
    const t = document.getElementById('tpl-skel');
    for(let i=0;i<n;i++) grid.appendChild(t.content.cloneNode(true));
  }

  async function loadProducts(){
    showSkeletons(8);
    try{
      // 1) data/products.json (chemin conseillé)
      let res = await fetch('data/products.json', {cache:'no-store'});
      if (!res.ok) {
        // 2) fallback: /products.json à la racine (pour compat rétro)
        res = await fetch('products.json', {cache:'no-store'});
      }
      if (!res.ok) throw new Error('products.json introuvable');
      const data = await res.json();
      all = Array.isArray(data) ? data : (data.products || []);
      if (!Array.isArray(all)) all = [];
    } catch (e) {
      console.error(e);
      showError('Erreur de chargement du catalogue.');
      all = [];
    }
    if (!all.length) {
      grid.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('d-none');
      if (count) count.textContent = 'Aucun article';
      return;
    }
    // Filtres URL init (ex: ?filter=enfant&q=...&sort=price-asc)
    const f = qsParam('filter','all'); if (filter) filter.value = f;
    const qq= qsParam('q','');         if (q)      q.value = qq;
    const so= qsParam('sort','relevance'); if (sort) sort.value = so;

    apply();
    openIfSkuParam();
  }

  // ------- Events
  [q, min, max].forEach(el=> el && el.addEventListener('input', apply));
  [filter, sort, onlyNew, inStock].forEach(el=> el && el.addEventListener('change', apply));
  resetBtn && resetBtn.addEventListener('click', ()=>{
    if (q) q.value = '';
    if (filter) filter.value = 'all';
    if (sort) sort.value = 'relevance';
    if (min) min.value = '';
    if (max) max.value = '';
    if (onlyNew) onlyNew.checked = false;
    if (inStock) inStock.checked = false;
    apply();
  });

  // Lance
  if (document.readyState !== "loading") loadProducts();
  else document.addEventListener("DOMContentLoaded", loadProducts);
})();
