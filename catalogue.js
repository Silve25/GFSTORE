/* ==========================================================================
   GF Store — catalogue.js (Hiver 2025)
   - Lit data/products.json avec fallbacks + cache localStorage 5 min
   - Recherche temps réel, filtres (catégorie, prix, nouveauté, stock), tri
   - Pagination, "chips" de filtres actifs, skeletons
   - Ajout panier: via window.App.addToCart ou fallback local (toast + badge)
   ========================================================================== */
(() => {
  "use strict";

  /* --------------------------
   * DOM hooks (catalogue.html)
   * ------------------------ */
  const $grid   = document.getElementById("grid");
  const $pager  = document.getElementById("pager");
  const $count  = document.getElementById("count");
  const $chips  = document.getElementById("chips");

  const $q      = document.getElementById("q");
  const $filter = document.getElementById("filter");
  const $sort   = document.getElementById("sort");
  const $min    = document.getElementById("min");
  const $max    = document.getElementById("max");
  const $onlyNew= document.getElementById("only-new");
  const $inStock= document.getElementById("in-stock");
  const $reset  = document.getElementById("reset");

  const $cartBadges = document.querySelectorAll(".cart-count");

  /* --------------------------
   * Utils
   * ------------------------ */
  const U = {
    fmtPrice(n, currency="EUR", locale="fr-FR"){
      try{ return Number(n||0).toLocaleString(locale,{style:"currency",currency}); }
      catch{ return (n||0)+" "+currency; }
    },
    esc(s){ return String(s)
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); },
    param(name, def=""){
      const u = new URL(location.href); return u.searchParams.get(name) ?? def;
    },
    setParams(obj, push=true){
      const u = new URL(location.href);
      Object.entries(obj).forEach(([k,v])=>{
        if(v===undefined||v===null||v==="") u.searchParams.delete(k);
        else u.searchParams.set(k, v);
      });
      (push?history.pushState:history.replaceState).call(history, {}, "", u);
    },
    clamp(n,a,b){ return Math.max(a, Math.min(b, n)); },
  };

  /* --------------------------
   * Local cache
   * ------------------------ */
  const LS = {
    get(k,def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch{return def;} },
    set(k,val){ try{ localStorage.setItem(k, JSON.stringify(val)); }catch{} },
  };

  /* --------------------------
   * Normalisation produit
   * ------------------------ */
  function normalizeProduct(p){
    const n = JSON.parse(JSON.stringify(p||{}));
    n.sku   = n.sku || n.id || n.code || (n.title||"prod").toLowerCase().replace(/[^a-z0-9]+/g,"-");
    n.slug  = n.slug || (n.title||n.name||n.sku||"").toLowerCase().normalize("NFD")
                .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
    n.title = n.title || n.name || "Produit";
    n.subtitle = n.subtitle || "";
    n.price = Number(n.price ?? n.prix ?? 0);
    n.currency = (n.currency||"EUR").toUpperCase();

    // Catégorie → clef courte
    const raw = (n.category || n.categorie || n.gender || n.genre || "").toString().toLowerCase();
    const map = { men:"homme", man:"homme", homme:"homme",
                  women:"femme", woman:"femme", femme:"femme",
                  kids:"enfant", kid:"enfant", enfant:"enfant",
                  accessoires:"accessoires", accessories:"accessoires" };
    n.category = map[raw] || raw || "autre";

    // Images/couleurs
    if (!Array.isArray(n.colors) || !n.colors.length){
      const img = n.image || (Array.isArray(n.images)&&n.images[0]) || "images/product-fallback.jpg";
      n.colors = [{ code:"default", label:"Par défaut", images:[img] }];
    }
    n.colors = n.colors.map((c,i)=>({
      code: c.code || `c${i+1}`,
      label: c.label || `Couleur ${i+1}`,
      images: Array.from(new Set((c.images||[]).filter(Boolean))).length
        ? Array.from(new Set((c.images||[]).filter(Boolean)))
        : ["images/product-fallback.jpg"]
    }));

    // Tailles/stock
    if(!Array.isArray(n.sizes)) n.sizes = [];
    n.stock = n.stock || {};
    n.sizes.forEach(sz => { if(typeof n.stock[sz] !== "number") n.stock[sz]=10; });

    // Tags / nouveauté
    n.tags = Array.isArray(n.tags)?n.tags:[];
    n.is_new = !!n.is_new || n.tags.some(t=>["new","nouveau","nouveauté","nouveautes"].includes(String(t).toLowerCase()));

    // created_at (pour tri nouveautés)
    if(!n.created_at && n.date) n.created_at = n.date;
    return n;
  }

  const firstImage = (p) => {
    if (Array.isArray(p.colors) && p.colors[0]?.images?.[0]) return p.colors[0].images[0];
    if (Array.isArray(p.images) && p.images[0]) return p.images[0];
    if (typeof p.image === "string") return p.image;
    return "images/product-fallback.jpg";
  };
  const catLabel = (p) => {
    const k = (p.category||"").toLowerCase();
    return k==="homme" ? "Hommes" : k==="femme" ? "Femmes" : k==="enfant" ? "Enfants" :
           k==="accessoires" ? "Accessoires" : "Produit";
  };
  const isNew = (p)=> !!p.is_new;
  const hasStock = (p)=>{
    if (p.stock && typeof p.stock === "object") return Object.values(p.stock).some(n => Number(n)>0);
    if (typeof p.stock === "number") return p.stock>0;
    return true;
  };

  /* --------------------------
   * Chargement data (fallbacks)
   * ------------------------ */
  const CACHE_KEY = "gf:data:catalogue";
  const STAMP_KEY = "gf:data:catalogue:ts";
  const TTL = 5*60*1000;

  function candidateURLs(){
    // Absolutise intelligemment selon la page courante
    const here = (path)=> new URL(path, location.href).href;
    return [
      here("data/products.json"),
      here("/data/products.json"),
      here("products.json"),
      here("/products.json"),
      "https://gfstore.store/data/products.json"
    ];
  }

  async function fetchWithTimeout(url, timeout=12000){
    const ctrl = new AbortController();
    const id = setTimeout(()=>ctrl.abort(), timeout);
    try{
      const res = await fetch(url, { cache:"no-store", signal: ctrl.signal });
      clearTimeout(id);
      return res;
    }catch(e){
      clearTimeout(id);
      throw e;
    }
  }

  async function loadProducts(){
    // 0) si window.Products existe, on l'utilise (cohérence avec products.js)
    if (window.Products && typeof window.Products.all === "function") {
      try{
        const list = await window.Products.all();
        if (Array.isArray(list) && list.length) return list.map(normalizeProduct);
      }catch{/* on bascule sur notre chargeur */}
    }

    // 1) cache
    const now = Date.now();
    const stamp = LS.get(STAMP_KEY, 0);
    const cached = LS.get(CACHE_KEY, null);
    if (Array.isArray(cached) && cached.length && (now - stamp) <= TTL) return cached;

    // 2) fallbacks
    const urls = candidateURLs();
    for (const url of urls){
      try{
        const res = await fetchWithTimeout(url, 12000);
        if (!res.ok) continue;
        const data = await res.json();
        const raw = Array.isArray(data) ? data : (data.products || []);
        if (Array.isArray(raw) && raw.length){
          const list = raw.map(normalizeProduct);
          LS.set(CACHE_KEY, list);
          LS.set(STAMP_KEY, now);
          return list;
        }
      }catch{ /* try next */ }
    }
    return [];
  }

  /* --------------------------
   * Panier (fallback + badge)
   * ------------------------ */
  const LocalCart = {
    key: "gf:cart",
    get(){ try{ return JSON.parse(localStorage.getItem(this.key)||"[]"); }catch{ return []; } },
    set(v){ try{ localStorage.setItem(this.key, JSON.stringify(v)); }catch{} },
    add(item){
      const arr = this.get();
      const i = arr.findIndex(x=>x.id===item.id);
      if(i>=0) arr[i].qty += item.qty; else arr.push(item);
      this.set(arr); syncBadge();
    }
  };
  function syncBadge(){
    const qty = (window.App && typeof window.App.getCartQty==="function")
      ? Number(window.App.getCartQty())||0
      : LocalCart.get().reduce((s,it)=>s+Number(it.qty||0),0);
    $cartBadges.forEach(el=> el.textContent = String(qty));
  }
  function addToCart(p){
    const payload = {
      id: String(p.sku),
      name: p.title,
      price: p.price,
      image: firstImage(p),
      qty: 1
    };
    if (window.App && typeof window.App.addToCart === "function"){
      window.App.addToCart(payload, 1);
    } else {
      LocalCart.add(payload);
      toast(`${payload.name} ajouté au panier`);
    }
  }
  function toast(msg){
    let el = document.getElementById("gf-toast");
    if(!el){
      el = document.createElement("div");
      el.id="gf-toast";
      el.style.cssText="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 14px;border-radius:10px;z-index:2000;opacity:0;transition:opacity .25s";
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity="1";
    setTimeout(()=>{ el.style.opacity="0"; }, 1200);
  }

  /* --------------------------
   * State & filtres
   * ------------------------ */
  const PAGE_SIZE = 12;
  let ALL = [];   // tous les produits
  let VIEW = [];  // filtrés/triés
  let page = 1;

  function matchesQuery(p, text){
    if(!text) return true;
    const hay = (p.title+" "+(p.subtitle||"")+" "+(p.brand||"")+" "+catLabel(p)+" "+(p.tags||[]).join(" ")+" "+(p.sku||""))
      .toLowerCase();
    return hay.includes(text.toLowerCase());
  }

  function matchFilter(p, val){
    if (val==="all") return true;
    const key = (p.category||"").toLowerCase();
    const bag = {
      homme: ["homme","men","man","hommes"],
      femme: ["femme","women","woman","femmes"],
      enfant:["enfant","kids","kid","junior","boy","girl","enfants"],
      accessoires:["accessoires","accessory","accessories","bonnet","echarpe","scarf","gloves","cap","hat"]
    };
    return (bag[val]||[val]).some(k => key.includes(k));
  }

  function apply(){
    const text = ($q?.value||"").trim();
    const f    = $filter?.value || "all";
    const minV = Number($min?.value||0);
    const maxV = Number($max?.value||Infinity);

    VIEW = ALL.filter(p=>{
      const okQ = matchesQuery(p,text);
      const okF = matchFilter(p,f);
      const price = Number(p.price||0);
      const okP = price>=minV && price<=maxV;
      const okN = !$onlyNew?.checked || isNew(p);
      const okS = !$inStock?.checked || hasStock(p);
      return okQ && okF && okP && okN && okS;
    });

    switch($sort?.value){
      case "price-asc":  VIEW.sort((a,b)=>a.price-b.price); break;
      case "price-desc": VIEW.sort((a,b)=>b.price-a.price); break;
      case "newest":     VIEW.sort((a,b)=> new Date(b.created_at||0)-new Date(a.created_at||0)); break;
      default:
        // "Pertinence" simple: nouveauté + match texte
        VIEW.sort((a,b)=>{
          const wa = (isNew(a)?1:0) + (matchesQuery(a,text)?1:0);
          const wb = (isNew(b)?1:0) + (matchesQuery(b,text)?1:0);
          return wb - wa;
        });
    }

    page = 1;
    renderChips();
    render();
    U.setParams({
      q: text||null, filter: f!=="all"?f:null, sort: ($sort?.value!=="relevance"?$sort.value:null),
      min: $min?.value||null, max: $max?.value||null,
      "only-new": $onlyNew?.checked?"1":null, "in-stock": $inStock?.checked?"1":null
    }, false);
  }

  function renderChips(){
    if(!$chips) return;
    $chips.innerHTML = "";
    const add = (label, onX)=>{
      const s = document.createElement("span");
      s.className = "filter-chip";
      s.innerHTML = `<span>${label}</span><button title="Retirer" aria-label="Retirer">×</button>`;
      s.querySelector("button").addEventListener("click", onX);
      $chips.appendChild(s);
    };
    if($q?.value) add(`Recherche: "${$q.value}"`, ()=>{ $q.value=""; apply(); });
    if($filter?.value!=="all") add(`Catégorie: ${$filter.options[$filter.selectedIndex].text}`,
      ()=>{ $filter.value="all"; apply(); });
    if($sort?.value!=="relevance") add(`Tri: ${$sort.options[$sort.selectedIndex].text}`,
      ()=>{ $sort.value="relevance"; apply(); });
    if($min?.value) add(`Min: ${$min.value}€`, ()=>{ $min.value=""; apply(); });
    if($max?.value) add(`Max: ${$max.value}€`, ()=>{ $max.value=""; apply(); });
    if($onlyNew?.checked) add("Nouveaux", ()=>{ $onlyNew.checked=false; apply(); });
    if($inStock?.checked) add("En stock", ()=>{ $inStock.checked=false; apply(); });
  }

  /* --------------------------
   * Rendu grid + pagination
   * ------------------------ */
  function render(){
    const total = VIEW.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if(page>pages) page = pages;

    if($count) $count.textContent = total
      ? `${total} article${total>1?"s":""} — page ${page}/${pages}`
      : "Aucun article";

    // Slice
    const start = (page-1)*PAGE_SIZE;
    const slice = VIEW.slice(start, start+PAGE_SIZE);

    // Grid
    $grid.innerHTML = "";
    for(const p of slice){
      const col = document.createElement("div");
      col.className = "col-6 col-md-4 col-lg-3";
      col.innerHTML = `
        <div class="card product-card h-100 border-0 shadow-sm">
          <a class="stretched-link text-reset text-decoration-none" href="products.html?sku=${encodeURIComponent(p.sku||"")}">
            <div class="position-relative">
              <span class="position-absolute top-0 start-0 m-2 badge badge-new text-uppercase ${isNew(p)?"":"d-none"}">Nouveau</span>
              <div class="ratio ratio-4x3">
                <img class="w-100 h-100" alt="${U.esc(p.title)}" src="${firstImage(p)}" style="object-fit:cover">
              </div>
            </div>
          </a>
          <div class="card-body">
            <h6 class="text-uppercase mb-1">${U.esc(p.title)}</h6>
            <div class="small text-secondary mb-2">${U.esc(catLabel(p))}</div>
            <div class="d-flex justify-content-between align-items-center">
              <div class="fw-semibold">${U.fmtPrice(p.price, p.currency)}</div>
              <button class="btn btn-sm btn-dark text-uppercase add">Ajouter</button>
            </div>
          </div>
        </div>`;
      const btn = col.querySelector(".add");
      btn.addEventListener("click",(e)=>{
        e.preventDefault();
        addToCart(p);
        btn.textContent="Ajouté ✓"; btn.disabled=true;
        setTimeout(()=>{ btn.textContent="Ajouter"; btn.disabled=false; }, 900);
      });
      $grid.appendChild(col);
    }

    // Pagination
    $pager.innerHTML = "";
    const mk = (label, p, disabled=false, active=false)=>{
      const li = document.createElement("li");
      li.className = `page-item ${disabled?"disabled":""} ${active?"active":""}`;
      const a = document.createElement("a");
      a.className = "page-link"; a.href="#"; a.textContent=label;
      a.addEventListener("click",(e)=>{ e.preventDefault(); if(!disabled){ page=p; render(); window.scrollTo({top:0,behavior:"smooth"}); }});
      li.appendChild(a); return li;
    };
    $pager.appendChild(mk("«", 1, page===1));
    $pager.appendChild(mk("‹", page-1, page===1));
    const win = 3; let from = Math.max(1, page-win); let to = Math.min(pages, page+win);
    for(let i=from;i<=to;i++) $pager.appendChild(mk(String(i), i, false, i===page));
    $pager.appendChild(mk("›", page+1, page===pages));
    $pager.appendChild(mk("»", pages, page===pages));
  }

  /* --------------------------
   * Skeleton loader
   * ------------------------ */
  function showSkeleton(){
    if(!$grid) return;
    $grid.innerHTML = "";
    for(let i=0;i<8;i++){
      const sk = document.createElement("div");
      sk.className = "col-6 col-md-4 col-lg-3";
      sk.innerHTML = `
        <div class="card h-100 border-0">
          <div class="ratio ratio-4x3 skeleton rounded"></div>
          <div class="card-body">
            <div class="skeleton" style="height:16px;width:70%;border-radius:6px"></div>
            <div class="skeleton mt-2" style="height:12px;width:40%;border-radius:6px"></div>
          </div>
        </div>`;
      $grid.appendChild(sk);
    }
    if($count) $count.textContent = "Chargement…";
  }

  /* --------------------------
   * Events
   * ------------------------ */
  $q      && $q.addEventListener("input", apply);
  $min    && $min.addEventListener("input", apply);
  $max    && $max.addEventListener("input", apply);
  $filter && $filter.addEventListener("change", apply);
  $sort   && $sort.addEventListener("change", apply);
  $onlyNew&& $onlyNew.addEventListener("change", apply);
  $inStock&& $inStock.addEventListener("change", apply);
  $reset  && $reset.addEventListener("click", ()=>{
    if($q) $q.value="";
    if($filter) $filter.value="all";
    if($sort) $sort.value="relevance";
    if($min) $min.value="";
    if($max) $max.value="";
    if($onlyNew) $onlyNew.checked=false;
    if($inStock) $inStock.checked=false;
    apply();
  });

  // Si app.js envoie des événements de panier → synchro badge
  document.addEventListener("gf:cart:sync", syncBadge);
  document.addEventListener("gf:add", syncBadge);

  /* --------------------------
   * Boot
   * ------------------------ */
  (async function boot(){
    // Pré-remplir depuis l'URL
    if($filter) $filter.value = U.param("filter", $filter.value||"all");
    if($q)      $q.value      = U.param("q", $q.value||"");
    if($sort)   $sort.value   = U.param("sort", $sort.value||"relevance");
    if($min)    $min.value    = U.param("min", $min.value||"");
    if($max)    $max.value    = U.param("max", $max.value||"");
    if($onlyNew)$onlyNew.checked = U.param("only-new","")==="1";
    if($inStock)$inStock.checked = U.param("in-stock","")==="1";

    syncBadge();
    showSkeleton();
    ALL = await loadProducts();
    apply();
  })();
})();
