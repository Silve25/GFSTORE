/* products.js — GF Store
   - Charge data/products.json avec fallback multi-URLs
   - Sélection produit par ?slug= ou ?sku=, remplit products.html
   - SEO dynamique, galerie, variantes, tailles, stock, CTA, deep-link
*/

(() => {
  // -------- Config & Utils --------
  const DATA_URLS = [
    "https://gfstore.store/data/products.json",
    `${location.origin}/data/products.json`,
    "/data/products.json",
    "data/products.json",
    "products.json",
  ];

  const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  const qs = new URLSearchParams(location.search);
  const wantSlug = (qs.get("slug") || "").trim().toLowerCase();
  const wantSku = (qs.get("sku") || "").trim().toLowerCase();

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function setText(id, val, fallback = "—") {
    const el = byId(id);
    if (el) el.textContent = val ?? fallback;
  }

  function safeHTML(el, html) {
    if (!el) return;
    el.innerHTML = "";
    if (html == null) return;
    if (typeof html === "string") {
      el.insertAdjacentHTML("beforeend", html);
    } else {
      el.appendChild(html);
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function setMeta(nameOrProp, value, isOG = false) {
    const attr = isOG ? "property" : "name";
    let el = document.head.querySelector(`meta[${attr}="${nameOrProp}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, nameOrProp);
      document.head.appendChild(el);
    }
    el.setAttribute("content", value);
  }

  function fmtPrice(p) {
    if (p == null) return "—";
    return EUR.format(Number(p));
  }

  function getFirstImage(p, optColorKey) {
    // image priority: color.images > product.images > hero
    if (optColorKey) {
      const variant = (p.colors || []).find(c => (c.key || c.name || "").toLowerCase() === optColorKey);
      if (variant?.images?.length) return variant.images[0];
    }
    if (p.images?.length) return p.images[0];
    return p.hero || "images/product-item-1.jpg";
  }

  function normaliseData(raw) {
    // Accept either array of products or { products: [...] }
    const products = Array.isArray(raw) ? raw : Array.isArray(raw?.products) ? raw.products : [];
    // Ensure minimal shape
    return products.map((p, i) => ({
      index: i,
      title: p.title || p.name || "Produit",
      subtitle: p.subtitle || "",
      slug: (p.slug || p.handle || (p.title || "").toLowerCase().replace(/\s+/g, "-")).toLowerCase(),
      sku: (p.sku || "").toLowerCase(),
      category: p.category || p.cat || "Produit",
      isNew: !!(p.isNew || p.new || p.badges?.includes?.("new")),
      price: p.price ?? p.prix ?? null,
      compareAt: p.compareAt ?? p.compare_at ?? null,
      currency: p.currency || "EUR",
      stock: Number.isFinite(p.stock) ? p.stock : null,
      description: p.description || p.desc || "",
      features: Array.isArray(p.features) ? p.features : [],
      care: Array.isArray(p.care) ? p.care : [],
      images: Array.isArray(p.images) ? p.images : [],
      hero: p.hero || null,
      colors: Array.isArray(p.colors) ? p.colors.map((c, idx) => ({
        name: c.name || c.label || c.title || `Couleur ${idx + 1}`,
        key: (c.key || c.name || c.label || `c${idx+1}`).toLowerCase(),
        hex: c.hex || c.code || null,
        images: Array.isArray(c.images) ? c.images : [],
      })) : [],
      sizes: Array.isArray(p.sizes) ? p.sizes.map((s, idx) => ({
        label: s.label || s.size || s.name || `T${idx+1}`,
        stock: Number.isFinite(s.stock) ? s.stock : (s.available === false ? 0 : null),
      })) : [],
      specs: {
        outer: p.specs?.outer ?? p.outer ?? "",
        lining: p.specs?.lining ?? p.lining ?? "",
        fill: p.specs?.fill ?? p.fill ?? "",
        madein: p.specs?.madein ?? p.madein ?? p.made_in ?? "",
        code: p.specs?.code ?? p.code ?? p.sku ?? "",
      },
      crossSell: Array.isArray(p.crossSell) ? p.crossSell : [],
      ogImage: p.ogImage || p.images?.[0] || null,
    }));
  }

  async function fetchFirstJson(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { data, from: url };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Aucune source JSON n’a fonctionné.");
  }

  function selectProduct(products) {
    let found = null;
    if (wantSlug) {
      found = products.find(p => p.slug === wantSlug);
    }
    if (!found && wantSku) {
      found = products.find(p => (p.sku || "").toLowerCase() === wantSku);
    }
    return found || products[0] || null;
  }

  // -------- Renderers --------
  function renderSEO(p) {
    const base = "GF Store";
    const t = `${p.title} — ${base}`;
    document.title = t;
    setMeta("description", p.subtitle || p.description?.slice(0, 160) || "Découvrez nos doudounes et parkas techniques. Livraison & retours gratuits.");
    setMeta("og:title", t, true);
    setMeta("og:description", p.subtitle || p.description?.slice(0, 160) || "", true);
    setMeta("og:type", "product", true);
    setMeta("og:image", p.ogImage || getFirstImage(p), true);
  }

  function renderBreadcrumb(p) {
    setText("bc-category", p.category || "—");
    setText("bc-title", p.title || "Produit");
  }

  function renderTop(p, state) {
    setText("p-title", p.title);
    setText("p-subtitle", p.subtitle || "");
    setText("p-sku", p.sku || "");
    byId("p-cat")?.classList.remove("text-bg-dark");
    byId("p-cat")?.classList.add("text-bg-light");
    setText("p-cat", p.category || "Produit");
    // Badge "Nouveauté"
    const badgeNew = byId("p-badge-new");
    if (badgeNew) badgeNew.classList.toggle("d-none", !p.isNew);

    // Prix
    const price = p.price;
    setText("p-price", fmtPrice(price));
    setText("m-price", fmtPrice(price));
    setText("m-title", p.title);
  }

  function renderSpecs(p) {
    setText("p-spec-outer", p.specs.outer || "—");
    setText("p-spec-lining", p.specs.lining || "—");
    setText("p-spec-fill", p.specs.fill || "—");
    setText("p-madein", p.specs.madein || "—");
    setText("p-code", p.specs.code || p.sku || "—");
  }

  function renderDescription(p) {
    setText("p-description", p.description || "");
    const ulFeatures = byId("p-features"); safeHTML(ulFeatures, "");
    (p.features || []).forEach(f => {
      const li = document.createElement("li");
      li.textContent = f;
      ulFeatures?.appendChild(li);
    });
    const ulCare = byId("p-care"); safeHTML(ulCare, "");
    (p.care || []).forEach(c => {
      const li = document.createElement("li");
      li.textContent = c;
      ulCare?.appendChild(li);
    });
  }

  function renderGallery(p, state) {
    const hero = byId("p-hero");
    const thumbs = byId("p-thumbs");
    safeHTML(thumbs, "");
    let images = [];
    // Priorité aux images de la couleur sélectionnée
    if (state.colorKey) {
      const v = (p.colors || []).find(c => c.key === state.colorKey);
      if (v?.images?.length) images = v.images;
    }
    if (!images.length) images = p.images?.length ? p.images : [getFirstImage(p)];
    hero.src = images[0] || "images/product-item-1.jpg";
    hero.alt = p.title;

    images.slice(0, 8).forEach((src, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `Voir image ${idx + 1}`);
      const img = document.createElement("img");
      img.src = src;
      img.alt = p.title;
      btn.appendChild(img);
      btn.addEventListener("click", () => { hero.src = src; });
      thumbs.appendChild(btn);
    });
  }

  function renderColors(p, state, onChange) {
    const wrap = byId("p-colors");
    safeHTML(wrap, "");
    const colors = p.colors || [];
    if (!colors.length) return;
    colors.forEach(c => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-outline-secondary btn-sm d-flex align-items-center gap-2";
      btn.setAttribute("data-color", c.key);
      const dot = document.createElement("span");
      dot.className = "p-dot";
      if (c.hex) dot.style.background = c.hex;
      btn.append(dot, document.createTextNode(c.name));
      if (state.colorKey === c.key) btn.classList.add("active", "btn-dark");
      btn.addEventListener("click", () => onChange(c.key));
      wrap.appendChild(btn);
    });
  }

  function renderSizes(p, state, onChange) {
    const wrap = byId("p-sizes");
    safeHTML(wrap, "");
    const sizes = p.sizes || [];
    if (!sizes.length) return;
    sizes.forEach(s => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-outline-secondary btn-sm";
      btn.textContent = s.label;
      const out = Number.isFinite(s.stock) && s.stock <= 0;
      if (state.size === s.label) btn.classList.add("active", "btn-dark");
      if (out) {
        btn.disabled = true;
        btn.title = "Indisponible";
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => onChange(s.label));
      }
      wrap.appendChild(btn);
    });

    // Affiche stock
    let stockText = "—";
    const cur = sizes.find(x => x.label === state.size);
    if (cur) {
      if (Number.isFinite(cur.stock)) {
        stockText = cur.stock > 5 ? "En stock" : (cur.stock > 0 ? `Dernières pièces (${cur.stock})` : "Rupture");
      } else {
        stockText = "Disponibilité : en stock";
      }
    } else if (Number.isFinite(p.stock)) {
      stockText = p.stock > 5 ? "En stock" : (p.stock > 0 ? `Dernières pièces (${p.stock})` : "Rupture");
    }
    setText("p-stock", stockText);
  }

  function updateDeeplink(p, state) {
    const a = byId("p-deeplink");
    if (!a) return;
    const url = new URL(location.href);
    url.searchParams.set("slug", p.slug);
    if (state.colorKey) url.searchParams.set("color", state.colorKey);
    else url.searchParams.delete("color");
    if (state.size) url.searchParams.set("size", state.size);
    else url.searchParams.delete("size");
    const qty = Number(byId("p-qty")?.value || 1);
    if (qty > 1) url.searchParams.set("qty", String(qty));
    else url.searchParams.delete("qty");
    a.href = url.toString();
  }

  function bindQuantity() {
    const dec = byId("p-qty-dec");
    const inc = byId("p-qty-inc");
    const inp = byId("p-qty");
    const fix = () => { inp.value = String(Math.max(1, parseInt(inp.value || "1", 10) || 1)); };
    dec?.addEventListener("click", () => { inp.value = String(Math.max(1, (parseInt(inp.value || "1", 10) || 1) - 1)); inp.dispatchEvent(new Event("change")); });
    inc?.addEventListener("click", () => { inp.value = String((parseInt(inp.value || "1", 10) || 1) + 1); inp.dispatchEvent(new Event("change")); });
    inp?.addEventListener("change", fix);
  }

  function bindAddToCart(p, getState) {
    const addDesktop = byId("p-add");
    const addMobile = byId("m-add");
    const buyNow = byId("p-buy");

    function add(qtyOverride) {
      const state = getState();
      const qty = clamp(qtyOverride ?? Number(byId("p-qty")?.value || 1), 1, 999);
      const payload = {
        sku: p.sku,
        title: p.title,
        price: p.price,
        slug: p.slug,
        image: getFirstImage(p, state.colorKey),
        category: p.category,
        color: state.colorKey || null,
        size: state.size || null,
        qty
      };

      // 1) Événement standard que app.js peut écouter
      document.dispatchEvent(new CustomEvent("cart:add", { detail: payload }));

      // 2) Fallback ultra-simple : mise à jour du badge
      const badges = $$(".cart-count");
      badges.forEach(b => {
        const v = parseInt(b.textContent || "0", 10) || 0;
        b.textContent = String(v + qty);
      });
    }

    addDesktop?.addEventListener("click", () => add());
    addMobile?.addEventListener("click", () => add());
    buyNow?.addEventListener("click", (e) => {
      // On pousse dans le panier puis on laisse le lien aller vers checkout.html
      add(1);
    });
  }

  function bindDeeplink() {
    const a = byId("p-deeplink");
    if (!a) return;
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await copyToClipboard(a.href);
        a.textContent = "Lien copié ✅";
        setTimeout(() => (a.textContent = "Copier le lien de cette configuration"), 1600);
      } catch {
        location.href = a.href;
      }
    });
  }

  function renderCrossSell(p) {
    const root = byId("p-cross");
    if (!root) return;
    safeHTML(root, "");
    const items = p.crossSell || [];
    items.slice(0, 4).forEach(x => {
      const col = document.createElement("div");
      col.className = "col-6 col-md-3";
      const card = document.createElement("div");
      card.className = "card h-100";
      const ratio = document.createElement("div");
      ratio.className = "ratio ratio-4x3";
      const img = document.createElement("img");
      img.src = x.image || "images/product-item-1.jpg";
      img.alt = x.title || "Produit";
      ratio.appendChild(img);
      const body = document.createElement("div");
      body.className = "card-body";
      const h = document.createElement("h5");
      h.className = "card-title h6";
      h.textContent = x.title || "Produit";
      const pz = document.createElement("div");
      pz.className = "small text-secondary";
      pz.textContent = x.price != null ? fmtPrice(x.price) : "";
      body.append(h, pz);
      const a = document.createElement("a");
      a.href = `products.html?slug=${encodeURIComponent(x.slug || "")}`;
      a.className = "stretched-link";
      a.setAttribute("aria-label", `Voir ${x.title || "produit"}`);
      card.append(ratio, body, a);
      col.appendChild(card);
      root.appendChild(col);
    });
  }

  // -------- Main flow --------
  (async function init() {
    try {
      const { data, from } = await fetchFirstJson(DATA_URLS);
      const products = normaliseData(data);
      if (!products.length) throw new Error("Le catalogue est vide.");

      // Choix produit
      let current = selectProduct(products);
      if (!current) throw new Error("Produit introuvable.");

      // État local (couleur, taille)
      const state = {
        colorKey: (qs.get("color") || "").toLowerCase() || (current.colors[0]?.key ?? null),
        size: qs.get("size") || (current.sizes[0]?.label ?? null),
      };

      // Render
      renderSEO(current);
      renderBreadcrumb(current);
      renderTop(current, state);
      renderSpecs(current);
      renderDescription(current);
      renderGallery(current, state);

      const onColorChange = (key) => {
        state.colorKey = key;
        renderGallery(current, state);
        updateDeeplink(current, state);
        // Marquer active
        $$("#p-colors .btn").forEach(b => b.classList.toggle("btn-dark", b.getAttribute("data-color") === key));
      };

      const onSizeChange = (label) => {
        state.size = label;
        renderSizes(current, state, onSizeChange);
        updateDeeplink(current, state);
      };

      renderColors(current, state, onColorChange);
      renderSizes(current, state, onSizeChange);

      bindQuantity();
      bindAddToCart(current, () => ({ ...state }));
      bindDeeplink();
      updateDeeplink(current, state);
      renderCrossSell(current);

      // Expose global
      window.Products = {
        source: from,
        all: products,
        current,
        getBySlug: (slug) => products.find(p => p.slug === String(slug).toLowerCase()) || null,
        getBySku: (sku) => products.find(p => (p.sku || "").toLowerCase() === String(sku).toLowerCase()) || null,
        select: (slugOrSku) => {
          const next = window.Products.getBySlug(slugOrSku) || window.Products.getBySku(slugOrSku);
          if (!next) return null;
          // Met à jour l’URL proprement
          const url = new URL(location.href);
          url.searchParams.delete("sku");
          url.searchParams.set("slug", next.slug);
          history.replaceState(null, "", url.toString());
          // Réinitialise état & re-render
          current = next;
          state.colorKey = next.colors[0]?.key ?? null;
          state.size = next.sizes[0]?.label ?? null;
          renderSEO(next);
          renderBreadcrumb(next);
          renderTop(next, state);
          renderSpecs(next);
          renderDescription(next);
          renderGallery(next, state);
          renderColors(next, state, onColorChange);
          renderSizes(next, state, onSizeChange);
          updateDeeplink(next, state);
          renderCrossSell(next);
          return next;
        }
      };

    } catch (err) {
      console.error(err);
      // Message d’erreur user-friendly dans la page
      const container = document.createElement("div");
      container.className = "container my-5";
      container.innerHTML = `
        <div class="alert alert-danger" role="alert">
          Impossible de charger le produit pour le moment. Réessayez plus tard.
          <div class="small text-muted mt-2">${String(err?.message || err)}</div>
        </div>
      `;
      document.body.prepend(container);
    }
  })();

})();
