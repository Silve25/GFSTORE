/* ==========================================================================
   GF Store — catalogue.js
   - Charge data/products.json depuis plusieurs URLs (fallbacks)
   - Rendu grille + filtres + pagination
   - Liens produits -> products.html?sku=...
   - Ajout panier: utilise window.App.addToCart si dispo, sinon fallback local
   ========================================================================== */

(() => {
  "use strict";

  // --------------------------
  // DOM (doit exister dans catalogue.html)
  // --------------------------
  const grid   = document.getElementById("grid");
  const pager  = document.getElementById("pager");
  const count  = document.getElementById("count");

  const q      = document.getElementById("q");
  const filter = document.getElementById("filter");
  const sort   = document.getElementById("sort");
  const min    = document.getElementById("min");
  const max    = document.getElementById("max");
  const onlyNew= document.getElementById("only-new");
  const inStock= document.getElementById("in-stock");
  const reset  = document.getElementById("reset");
  const chips  = document.getElementById("chips");

  // Badge panier (dans le header)
  const cartCountEls = document.querySelectorAll(".cart-count");

  // --------------------------
  // Config
  // --------------------------
  const PAGE_SIZE = 12;
  let ALL = [];
  let VIEW = [];
  let page = 1;

  // Ordre de fetch (fallbacks)
  const DATA_URLS = [
    "https://gfstore.store/data/products.json",
    `${location.origin}/data/products.json`,
    "/data/products.json",
    "data/products.json",
    "products.json"
  ];

  // --------------------------
  // Utils
  // --------------------------
  const fmtPrice = (n) =>
    Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  const getName = (p) => p.title || p.name || p.product_name || "Produit";
  const getPrice = (p) => Number(p.price ?? p.prix ?? p.amount ?? 0);
  const getCatKey = (p) =>
    (p.category || p.categorie || p.gender || p.genre || "").toString().toLowerCase();

  const getCatLabel = (p) => {
    const k = getCatKey(p);
    const map = { kids: "Enfants", men: "Hommes", women: "Femmes", homme:"Hommes", femme:"Femmes", enfant:"Enfants" };
    return map[k] || (k ? k.charAt(0).toUpperCase()+k.slice(1) : "Produit");
  };

  const firstImage = (p) => {
    if (Array.isArray(p.colors) && p.colors[0]?.images?.[0]) return p.colors[0].images[0];
    if (Array.isArray(p.images) && p.images[0]) return p.images[0];
    if (typeof p.image === "string") return p.image;
    return "images/product-item-1.jpg";
  };

  const isNew = (p) =>
    p.is_new === true ||
    (Array.isArray(p.tags) && p.tags.some((t) => String(t).toLowerCase().includes("nouveau")));

  const hasStock = (p) => {
    if (p.stock && typeof p.stock === "object") return Object.values(p.stock).some((n) => Number(n) > 0);
    if (typeof p.stock === "number") return p.stock > 0;
    return true; // si non précisé
  };

  const matchesQuery = (p, text) => {
    if (!text) return true;
    const hay = (
      getName(p) +
      " " +
      (p.subtitle || "") +
      " " +
      (p.brand || "") +
      " " +
      getCatLabel(p)
    ).toLowerCase();
    return hay.includes(text.toLowerCase());
  };

  const matchFilter = (p, val) => {
    if (val === "all") return true;
    const c = getCatKey(p);
    const map = {
      homme: ["homme", "hommes", "men", "man"],
      femme: ["femme", "femmes", "women", "woman"],
      enfant: ["enfant", "enfants", "kids", "kid", "junior", "boy", "girl"],
      accessoires: [
        "accessoires",
        "accessory",
        "accessories",
        "cap",
        "hat",
        "gloves",
        "bonnet",
        "echarpe",
        "scarf",
      ],
    };
    return (map[val] || [val]).some((k) => c.includes(k));
  };

  function setBadge(qty) {
    cartCountEls.forEach((el) => (el.textContent = qty));
  }

  // Fallback panier si App.js n’est pas là
  const LocalCart = {
    key: "gf:cart",
    get() {
      try {
        return JSON.parse(localStorage.getItem(this.key) || "[]");
      } catch {
        return [];
      }
    },
    set(v) {
      try {
        localStorage.setItem(this.key, JSON.stringify(v));
      } catch {}
    },
    add(item) {
      const arr = this.get();
      const idx = arr.findIndex((x) => x.id === item.id);
      if (idx >= 0) arr[idx].qty += item.qty;
      else arr.push(item);
      this.set(arr);
      setBadge(arr.reduce((s, it) => s + it.qty, 0));
    },
    syncBadge() {
      const arr = this.get();
      setBadge(arr.reduce((s, it) => s + it.qty, 0));
    },
  };

  function addToCart(p) {
    const payload = {
      id: String(p.sku || getName(p)),
      name: getName(p),
      price: getPrice(p),
      image: firstImage(p),
      qty: 1,
    };

    if (window.App && typeof window.App.addToCart === "function") {
      // Intégration avec app.js si présent
      window.App.addToCart(payload, 1);
    } else {
      // Fallback local
      LocalCart.add(payload);
      // petit toast
      toast(`${payload.name} ajouté au panier`);
    }
  }

  function toast(msg) {
    let t = document.getElementById("gf-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "gf-toast";
      t.style.cssText =
        "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 14px;border-radius:10px;z-index:2000;opacity:0;transition:opacity .25s";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    setTimeout(() => (t.style.opacity = "0"), 1200);
  }

  // --------------------------
  // Rendu
  // --------------------------
  function render() {
    const total = VIEW.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;

    count.textContent = total
      ? `${total} article${total > 1 ? "s" : ""} — page ${page}/${pages}`
      : "Aucun article";

    const start = (page - 1) * PAGE_SIZE;
    const slice = VIEW.slice(start, start + PAGE_SIZE);

    grid.innerHTML = "";
    for (const p of slice) {
      const col = document.createElement("div");
      col.className = "col-6 col-md-4 col-lg-3";

      col.innerHTML = `
        <div class="card product-card h-100 border-0 shadow-sm">
          <a class="stretched-link text-reset text-decoration-none" href="products.html?sku=${encodeURIComponent(
            p.sku || ""
          )}">
            <div class="position-relative">
              <span class="position-absolute top-0 start-0 m-2 badge badge-new text-uppercase ${
                isNew(p) ? "" : "d-none"
              }">Nouveau</span>
              <div class="ratio ratio-4x3">
                <img class="w-100 h-100" alt="${escapeHtml(getName(p))}" src="${firstImage(p)}" style="object-fit:cover">
              </div>
            </div>
          </a>
          <div class="card-body">
            <h6 class="text-uppercase mb-1 name">${escapeHtml(getName(p))}</h6>
            <div class="small text-secondary mb-2 meta">${escapeHtml(getCatLabel(p))}</div>
            <div class="d-flex justify-content-between align-items-center">
              <div class="fw-semibold price">${fmtPrice(getPrice(p))}</div>
              <button class="btn btn-sm btn-dark text-uppercase add">Ajouter</button>
            </div>
          </div>
        </div>
      `;

      // Bouton Ajouter
      const btn = col.querySelector(".add");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        addToCart(p);
        btn.textContent = "Ajouté ✓";
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = "Ajouter";
          btn.disabled = false;
        }, 900);
      });

      grid.appendChild(col);
    }

    // Pagination
    pager.innerHTML = "";
    const makeItem = (label, p, disabled = false, active = false) => {
      const li = document.createElement("li");
      li.className = `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}`;
      const a = document.createElement("a");
      a.className = "page-link";
      a.href = "#";
      a.textContent = label;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!disabled) {
          page = p;
          render();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
      li.appendChild(a);
      return li;
    };

    pager.appendChild(makeItem("«", 1, page === 1));
    pager.appendChild(makeItem("‹", page - 1, page === 1));
    const windowSize = 3;
    let from = Math.max(1, page - windowSize);
    let to = Math.min(pages, page + windowSize);
    for (let i = from; i <= to; i++) pager.appendChild(makeItem(String(i), i, false, i === page));
    pager.appendChild(makeItem("›", page + 1, page === pages));
    pager.appendChild(makeItem("»", pages, page === pages));
  }

  function refreshChips() {
    if (!chips) return;
    chips.innerHTML = "";

    const addChip = (label, onX) => {
      const chip = document.createElement("span");
      chip.className = "filter-chip";
      chip.innerHTML =
        `<span>${label}</span><button title="Retirer" aria-label="Retirer">×</button>`;
      chip.querySelector("button").addEventListener("click", onX);
      chips.appendChild(chip);
    };

    if (q?.value) addChip(`Recherche: "${q.value}"`, () => { q.value = ""; apply(); });
    if (filter?.value !== "all")
      addChip(
        `Catégorie: ${filter.options[filter.selectedIndex].text}`,
        () => {
          filter.value = "all";
          apply();
        }
      );
    if (sort?.value !== "relevance")
      addChip(
        `Tri: ${sort.options[sort.selectedIndex].text}`,
        () => {
          sort.value = "relevance";
          apply();
        }
      );
    if (min?.value) addChip(`Min: ${min.value}€`, () => { min.value = ""; apply(); });
    if (max?.value) addChip(`Max: ${max.value}€`, () => { max.value = ""; apply(); });
    if (onlyNew?.checked) addChip("Nouveaux", () => { onlyNew.checked = false; apply(); });
    if (inStock?.checked) addChip("En stock", () => { inStock.checked = false; apply(); });
  }

  function apply() {
    const text = q?.value.trim() || "";
    const f = filter?.value || "all";
    const minV = Number(min?.value || 0);
    const maxV = Number(max?.value || Infinity);

    VIEW = ALL.filter((p) => {
      const okQuery = matchesQuery(p, text);
      const okCat = matchFilter(p, f);
      const price = getPrice(p);
      const okPrice = price >= minV && price <= maxV;
      const okNew = !onlyNew?.checked || isNew(p);
      const okStock = !inStock?.checked || hasStock(p);
      return okQuery && okCat && okPrice && okNew && okStock;
    });

    switch (sort?.value) {
      case "price-asc":
        VIEW.sort((a, b) => getPrice(a) - getPrice(b));
        break;
      case "price-desc":
        VIEW.sort((a, b) => getPrice(b) - getPrice(a));
        break;
      case "newest":
        VIEW.sort(
          (a, b) =>
            new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0)
        );
        break;
      default:
        // légère pertinence : nouveau + match texte
        VIEW.sort((a, b) => {
          const wa = (isNew(a) ? 1 : 0) + (matchesQuery(a, text) ? 1 : 0);
          const wb = (isNew(b) ? 1 : 0) + (matchesQuery(b, text) ? 1 : 0);
          return wb - wa;
        });
    }

    page = 1;
    refreshChips();
    render();
  }

  // --------------------------
  // Data loading (avec fallbacks)
  // --------------------------
  async function fetchWithTimeout(url, opts = {}, timeout = 12000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  async function loadProducts() {
    // applique filtres par défaut via URL
    const usp = new URLSearchParams(location.search);
    if (filter) filter.value = usp.get("filter") || filter.value || "all";
    if (q) q.value = usp.get("q") || q.value || "";
    if (sort) sort.value = usp.get("sort") || sort.value || "relevance";

    // skeleton simple
    if (grid) {
      grid.innerHTML = "";
      for (let i = 0; i < 8; i++) {
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
        grid.appendChild(sk);
      }
    }
    if (count) count.textContent = "Chargement…";

    // essaie chaque URL jusqu'à succès
    let data = null;
    let lastErr = null;
    for (const u of DATA_URLS) {
      try {
        const res = await fetchWithTimeout(u, { cache: "no-store" }, 12000);
        if (res.ok) {
          data = await res.json();
          break;
        } else {
          lastErr = new Error(`HTTP ${res.status} sur ${u}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!data) {
      console.error("Impossible de charger products.json", lastErr);
      if (count) count.textContent = "Erreur de chargement du catalogue.";
      grid && (grid.innerHTML = "");
      return;
    }

    ALL = Array.isArray(data) ? data : data.products || [];
    apply();
  }

  // --------------------------
  // Events
  // --------------------------
  q && q.addEventListener("input", apply);
  min && min.addEventListener("input", apply);
  max && max.addEventListener("input", apply);
  filter && filter.addEventListener("change", apply);
  sort && sort.addEventListener("change", apply);
  onlyNew && onlyNew.addEventListener("change", apply);
  inStock && inStock.addEventListener("change", apply);
  reset &&
    reset.addEventListener("click", () => {
      if (q) q.value = "";
      if (filter) filter.value = "all";
      if (sort) sort.value = "relevance";
      if (min) min.value = "";
      if (max) max.value = "";
      if (onlyNew) onlyNew.checked = false;
      if (inStock) inStock.checked = false;
      apply();
    });

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // --------------------------
  // Boot
  // --------------------------
  if (!window.App) {
    // si pas d'app.js, mets à jour le badge depuis le localStorage
    LocalCart.syncBadge();
  }
  loadProducts();
})();
