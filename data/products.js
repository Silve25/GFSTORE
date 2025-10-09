/*!
 * GF Store — data/products.js
 * Utilitaires produits (chargement multi-URL, normalisation, panier, helpers page produit).
 * - Expose window.Products
 * - Fallbacks robustes pour charger /data/products.json (CDN / origin / relatif)
 * - Panier : délègue à window.App.addToCart si présent, sinon localStorage
 * - UI facultative : Products.mountProductPage() peuple la page products.html si les IDs existent
 */
(function (global) {
  "use strict";

  /* -----------------------------------------------------------------------
   * Mini utils
   * --------------------------------------------------------------------- */
  const U = {
    fmtPrice(n, currency = "EUR", locale = "fr-FR") {
      return Number(n || 0).toLocaleString(locale, { style: "currency", currency });
    },
    getParam(name, def = "") {
      const url = new URL(global.location.href);
      return url.searchParams.get(name) || def;
    },
    setParams(obj, push = true) {
      const url = new URL(global.location.href);
      Object.entries(obj).forEach(([k, v]) => {
        if (v === null || v === undefined || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      });
      if (push) history.pushState({}, "", url);
      else history.replaceState({}, "", url);
    },
    toSlug(s) {
      return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    },
    clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    },
    escapeHtml(str) {
      return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    },
  };

  /* -----------------------------------------------------------------------
   * Cache localStorage
   * --------------------------------------------------------------------- */
  const LS = {
    get(k, def) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(k, val) {
      try {
        localStorage.setItem(k, JSON.stringify(val));
      } catch {}
    },
    remove(k) {
      try {
        localStorage.removeItem(k);
      } catch {}
    },
  };

  /* -----------------------------------------------------------------------
   * Normalisation Produit
   * --------------------------------------------------------------------- */
  function normalizeProduct(p) {
    const n = JSON.parse(JSON.stringify(p || {}));

    // Identifiants
    n.sku = n.sku || n.id || n.SKU || n.code || U.toSlug(n.title || n.name || "prod");
    n.slug = n.slug || U.toSlug(n.title || n.name || n.sku);

    // Base
    n.title = n.title || n.name || "Produit";
    n.subtitle = n.subtitle || n.tagline || "";
    n.currency = (n.currency || "EUR").toUpperCase();
    n.price = Number(n.price ?? n.prix ?? 0);
    n.vat_included = n.vat_included ?? true;

    // Catégorie / genre
    const rawCat = (n.category || n.categorie || n.gender || n.genre || "")
      .toString()
      .toLowerCase();
    const map = {
      homme: "homme",
      men: "homme",
      man: "homme",
      femmes: "femme",
      femme: "femme",
      women: "femme",
      woman: "femme",
      enfants: "enfant",
      enfant: "enfant",
      kids: "enfant",
      kid: "enfant",
      boy: "enfant",
      girl: "enfant",
      accessoires: "accessoires",
      accessories: "accessoires",
    };
    n.category = map[rawCat] || rawCat || "autre";

    // Images & couleurs
    if (!Array.isArray(n.colors) || !n.colors.length) {
      const img =
        n.image ||
        (Array.isArray(n.images) && n.images[0]) ||
        (n.thumbnail ? n.thumbnail : "images/product-fallback.jpg");
      n.colors = [
        { code: "default", label: "Par défaut", images: [img].filter(Boolean) },
      ];
    }
    n.colors = n.colors.map((c) => {
      const imgs = Array.from(new Set((c.images || []).filter(Boolean)));
      return { ...c, images: imgs.length ? imgs : ["images/product-fallback.jpg"] };
    });

    // Tailles & stock
    if (!Array.isArray(n.sizes)) n.sizes = [];
    n.stock = n.stock || {};
    n.sizes.forEach((sz) => {
      if (typeof n.stock[sz] !== "number") n.stock[sz] = 10; // défaut
    });

    // Tags / nouveauté
    n.tags = Array.isArray(n.tags) ? n.tags : [];
    n.is_new =
      n.is_new ||
      n.tags.some((t) => ["new", "nouveau", "nouveauté", "nouveautes"].includes(String(t).toLowerCase()));

    return n;
  }

  /* -----------------------------------------------------------------------
   * Chargement multi-URL de products.json (+ cache 5 min)
   * --------------------------------------------------------------------- */
  const CACHE_KEY = "gf:data:products";
  const STAMP_KEY = "gf:data:products:ts";
  const TTL = 5 * 60 * 1000;

  const DATA_URLS = [
    "https://gfstore.store/data/products.json",
    `${location.origin}/data/products.json`,
    "/data/products.json",
    "data/products.json",
    "products.json",
  ];

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

  async function loadAll() {
    const now = Date.now();
    const stamp = LS.get(STAMP_KEY, 0);
    let list = LS.get(CACHE_KEY, null);

    if (!list || now - stamp > TTL) {
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
        throw lastErr || new Error("products.json introuvable");
      }
      const rawList = Array.isArray(data) ? data : data.products || [];
      list = rawList.map(normalizeProduct);
      LS.set(CACHE_KEY, list);
      LS.set(STAMP_KEY, now);
    }
    return list;
  }

  /* -----------------------------------------------------------------------
   * Sélection / Recherche / Helpers
   * --------------------------------------------------------------------- */
  function firstImage(product, colorCode) {
    const c =
      (product.colors || []).find((x) => x.code === colorCode) ||
      (product.colors || [])[0] ||
      { images: [] };
    return c.images[0] || "images/product-fallback.jpg";
  }

  function getColor(product, colorCode) {
    const colors = product.colors || [];
    if (!colors.length) return null;
    return colors.find((c) => c.code === colorCode) || colors[0];
  }

  function inStock(product, size) {
    if (!size) return true;
    const stock = product.stock || {};
    const n = Number(stock[size] ?? 0);
    return n > 0;
  }

  function productUrl(product, opts = {}) {
    const base = "products.html"; // ta page fiche produit
    const sku = encodeURIComponent(product.sku);
    const params = new URLSearchParams();
    params.set("sku", sku);

    if (opts.color) params.set("color", String(opts.color));
    if (opts.size) params.set("size", String(opts.size));
    if (opts.utm) Object.entries(opts.utm).forEach(([k, v]) => v && params.set(k, v));

    return `${base}?${params.toString()}`;
  }

  function resolveFromURL(products) {
    const sku = U.getParam("sku", "");
    const slug = U.getParam("slug", "");
    const color = U.getParam("color", "");
    const size = U.getParam("size", "");

    let prod = null;
    if (sku) prod = products.find((p) => String(p.sku) === sku) || null;
    if (!prod && slug) prod = products.find((p) => String(p.slug) === slug) || null;

    return { product: prod, color: color || null, size: size || null };
  }

  function formatBreadcrumbs(product) {
    return [
      { label: "Accueil", href: "index.html" },
      { label: "Catalogue", href: "catalogue.html" },
      {
        label:
          product.category === "homme"
            ? "Hommes"
            : product.category === "femme"
            ? "Femmes"
            : product.category === "enfant"
            ? "Enfants"
            : "Produits",
        href:
          product.category === "homme"
            ? "catalogue.html?filter=homme"
            : product.category === "femme"
            ? "catalogue.html?filter=femme"
            : product.category === "enfant"
            ? "catalogue.html?filter=enfant"
            : "catalogue.html",
      },
      { label: product.title, href: productUrl(product) },
    ];
  }

  /* -----------------------------------------------------------------------
   * Panier (App.js si dispo, sinon localStorage)
   * --------------------------------------------------------------------- */
  const Cart = {
    key: "gf:cart",
    add(item, qty = 1) {
      if (global.App && typeof global.App.addToCart === "function") {
        global.App.addToCart(item, qty);
        return;
      }
      // fallback local
      const arr = LS.get(this.key, []);
      const idx = arr.findIndex((x) => x.id === item.id);
      if (idx >= 0) arr[idx].qty += qty;
      else arr.push({ ...item, qty });
      LS.set(this.key, arr);
      this.syncBadge();
      toast(`${item.name} ajouté au panier`);
    },
    count() {
      const arr = global.App?.Cart?.state?.items || LS.get(this.key, []);
      return (arr || []).reduce((s, it) => s + (it.qty || 0), 0);
    },
    syncBadge() {
      const n = this.count();
      document.querySelectorAll(".cart-count").forEach((el) => (el.textContent = n));
    },
  };

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

  /* -----------------------------------------------------------------------
   * UI facultative pour products.html
   * - N’opère que si les éléments existent
   * - IDs attendus par défaut : p-hero, p-thumbs, p-title, p-subtitle, p-price, p-cat,
   *   p-colors, p-sizes, p-features, p-care, p-madein, p-add, p-deeplink, [data-breadcrumbs]
   * --------------------------------------------------------------------- */
  async function mountProductPage() {
    // éléments (si absents, on n'intervient pas)
    const elHero = document.getElementById("p-hero");
    const elThumbs = document.getElementById("p-thumbs");
    const elTitle = document.getElementById("p-title");
    const elSubtitle = document.getElementById("p-subtitle");
    const elPrice = document.getElementById("p-price");
    const elCat = document.getElementById("p-cat");
    const elColors = document.getElementById("p-colors");
    const elSizes = document.getElementById("p-sizes");
    const elFeatures = document.getElementById("p-features");
    const elCare = document.getElementById("p-care");
    const elMadeIn = document.getElementById("p-madein");
    const elAdd = document.getElementById("p-add");
    const elDeep = document.getElementById("p-deeplink");
    const crumbMount = document.querySelector("[data-breadcrumbs]");
    const errorBox = document.getElementById("p-error");

    // si pas de conteneurs produits (probablement pas la page), on s'arrête
    if (!elTitle && !elHero) return;

    try {
      const list = await loadAll();
      const { product, color, size } = resolveFromURL(list);

      if (!product) {
        if (errorBox) errorBox.innerHTML = `<div class="alert alert-warning">Produit introuvable.</div>`;
        if (elTitle) elTitle.textContent = "Produit introuvable";
        return;
      }

      let currentColor = getColor(product, color)?.code || (product.colors?.[0]?.code || null);
      let currentSize = size || null;

      // -------- Visuels
      if (elHero) {
        elHero.src = firstImage(product, currentColor);
        elHero.alt = product.title;
        elHero.style.objectFit = "cover";
      }
      if (elThumbs) {
        elThumbs.innerHTML = "";
        const col = getColor(product, currentColor) || { images: [] };
        (col.images || []).slice(0, 8).forEach((u, i) => {
          const im = document.createElement("img");
          im.src = u;
          im.alt = `${product.title} ${i + 1}`;
          im.width = 64;
          im.height = 64;
          im.className = "me-2 mb-2";
          im.style.objectFit = "cover";
          im.style.borderRadius = "6px";
          im.style.border = "1px solid #eee";
          if (i === 0) im.style.outline = "2px solid #111";
          im.addEventListener("click", () => {
            if (elHero) elHero.src = u;
            elThumbs.querySelectorAll("img").forEach((x) => (x.style.outline = ""));
            im.style.outline = "2px solid #111";
          });
          elThumbs.appendChild(im);
        });
      }

      // -------- Textes
      if (elTitle) elTitle.textContent = product.title;
      if (elSubtitle) elSubtitle.textContent = product.subtitle || "";
      if (elPrice) elPrice.textContent = U.fmtPrice(product.price, product.currency);
      if (elCat)
        elCat.textContent =
          product.category === "homme"
            ? "Hommes"
            : product.category === "femme"
            ? "Femmes"
            : product.category === "enfant"
            ? "Enfants"
            : "Produits";

      if (elFeatures) elFeatures.innerHTML = (product.features || []).map((f) => `<li>${U.escapeHtml(f)}</li>`).join("");
      if (elCare) elCare.innerHTML = (product.care || []).map((f) => `<li>${U.escapeHtml(f)}</li>`).join("");
      if (elMadeIn) elMadeIn.textContent = product.made_in ? "Fabriqué en " + product.made_in : "";

      // -------- Couleurs
      if (elColors) {
        elColors.innerHTML = "";
        (product.colors || []).forEach((c) => {
          const dot = document.createElement("span");
          dot.className = "p-color-dot";
          dot.title = c.label || c.code || "";
          dot.style.cssText =
            "width:16px;height:16px;border-radius:50%;display:inline-block;border:1px solid #ddd;cursor:pointer";
          // Couleur indicative
          const code = (c.code || "").toLowerCase();
          dot.style.background =
            code === "white" || code === "ivory"
              ? "#fff"
              : code === "black"
              ? "#000"
              : code === "navy"
              ? "#001f3f"
              : code === "lightblue"
              ? "#cde5ff"
              : code === "pink"
              ? "#ffd6e7"
              : "#eee";

          if (c.code === currentColor) dot.style.outline = "2px solid #111";

          dot.addEventListener("click", () => {
            currentColor = c.code || null;
            // MAJ hero + thumbs
            if (elHero) elHero.src = firstImage(product, currentColor);
            if (elThumbs) {
              elThumbs.innerHTML = "";
              (c.images || []).slice(0, 8).forEach((u, i) => {
                const im = document.createElement("img");
                im.src = u;
                im.alt = `${product.title} ${i + 1}`;
                im.width = 64;
                im.height = 64;
                im.className = "me-2 mb-2";
                im.style.objectFit = "cover";
                im.style.borderRadius = "6px";
                im.style.border = "1px solid #eee";
                if (i === 0) im.style.outline = "2px solid #111";
                im.addEventListener("click", () => {
                  if (elHero) elHero.src = u;
                  elThumbs.querySelectorAll("img").forEach((x) => (x.style.outline = ""));
                  im.style.outline = "2px solid #111";
                });
                elThumbs.appendChild(im);
              });
            }
            // MAJ URL
            U.setParams({ color: currentColor }, false);
          });

          elColors.appendChild(dot);
        });
      }

      // -------- Tailles
      if (elSizes) {
        elSizes.innerHTML = "";
        if (Array.isArray(product.sizes) && product.sizes.length) {
          const label = document.createElement("div");
          label.className = "text-secondary small me-2";
          label.textContent = "Tailles :";
          elSizes.appendChild(label);

          product.sizes.forEach((s) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn-sm btn-outline-secondary me-2 mb-2";
            btn.textContent = s;
            if (!inStock(product, s)) {
              btn.disabled = true;
              btn.classList.add("disabled");
              btn.title = "Indisponible";
            }
            if (s === currentSize) btn.classList.add("active");

            btn.addEventListener("click", () => {
              currentSize = s;
              elSizes.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              U.setParams({ size: currentSize }, false);
            });
            elSizes.appendChild(btn);
          });
        }
      }

      // -------- Actions
      if (elAdd) {
        elAdd.onclick = () => {
          const item = {
            id: String(product.sku + (currentSize ? "|" + currentSize : "")),
            name: product.title + (currentSize ? " — " + currentSize : ""),
            price: product.price,
            image: firstImage(product, currentColor),
          };
          Cart.add(item, 1);
          elAdd.textContent = "Ajouté ✓";
          elAdd.disabled = true;
          setTimeout(() => {
            elAdd.textContent = "Ajouter au panier";
            elAdd.disabled = false;
          }, 900);
        };
      }
      if (elDeep) {
        elDeep.href = productUrl(product, { color: currentColor, size: currentSize });
      }

      // -------- Fil d’Ariane
      if (crumbMount) {
        const crumbs = formatBreadcrumbs(product);
        crumbMount.innerHTML = `
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
              ${crumbs
                .map(
                  (c, i) =>
                    `<li class="breadcrumb-item ${i === crumbs.length - 1 ? "active" : ""}">
                      ${i === crumbs.length - 1 ? U.escapeHtml(c.label) : `<a href="${c.href}">${U.escapeHtml(c.label)}</a>`}
                    </li>`
                )
                .join("")}
            </ol>
          </nav>`;
      }

      // MAJ badge panier au montage
      Cart.syncBadge();
    } catch (e) {
      console.error(e);
      if (errorBox) errorBox.innerHTML = `<div class="alert alert-danger">Erreur de chargement de la fiche produit.</div>`;
    }
  }

  /* -----------------------------------------------------------------------
   * API publique
   * --------------------------------------------------------------------- */
  const API = {
    // Data
    async all() {
      return loadAll();
    },
    async currentFromURL() {
      const list = await loadAll();
      return resolveFromURL(list);
    },
    async find(query) {
      const list = await loadAll();
      if (typeof query === "function") return list.find(query) || null;
      return list.find((p) => p.sku === query || p.slug === query) || null;
    },
    async filter(predicate) {
      const list = await loadAll();
      if (typeof predicate !== "function") return list;
      return list.filter(predicate);
    },

    // Utils
    utils: {
      fmtPrice: U.fmtPrice,
      productUrl,
      firstImage,
      getColor,
      inStock,
      formatBreadcrumbs,
      setParams: U.setParams,
      getParam: U.getParam,
      clamp: U.clamp,
      escapeHtml: U.escapeHtml,
    },

    // Panier
    cart: {
      add: (product, { size = null, color = null } = {}) => {
        const item = {
          id: String((product.sku || product.id || product.title) + (size ? "|" + size : "")),
          name: product.title + (size ? " — " + size : ""),
          price: Number(product.price || 0),
          image: firstImage(product, color),
        };
        Cart.add(item, 1);
      },
      syncBadge: () => Cart.syncBadge(),
      count: () => Cart.count(),
    },

    // UI facultative pour la page produit
    mountProductPage,
  };

  // Exporte sur window
  global.Products = API;

  // Si on est sur products.html on peut auto-monter (facultatif, inoffensif)
  if (location.pathname.toLowerCase().includes("products.html")) {
    // démarre après DOMReady
    if (document.readyState !== "loading") API.mountProductPage();
    else document.addEventListener("DOMContentLoaded", API.mountProductPage);
  }
})(window);

/* -------------------------------------------------------------------------
 * EXEMPLES RAPIDES
 * -------------------------------------------------------------------------
 * // 1) Dans products.html (automatique via mountProductPage),
 * //    sinon manuel :
 * (async () => {
 *   const { product, color, size } = await Products.currentFromURL();
 *   if (!product) return;
 *   console.log(product.title, Products.utils.fmtPrice(product.price), color, size);
 * })();
 *
 * // 2) Lien vers une fiche produit :
 * const href = Products.utils.productUrl(p, { color: p.colors?.[0]?.code, utm: { src: 'cat' } });
 *
 * // 3) Ajouter au panier :
 * Products.cart.add(product, { size: '10A', color: 'navy' });
 * Products.cart.syncBadge();
 * ------------------------------------------------------------------------- */
