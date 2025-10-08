/*!
 * GF Store — data/products.js
 * Utilitaires produits (chargement, recherche, URLs, formats).
 * - Aucune dépendance ; attaché à window.Products
 * - Ne modifie pas le DOM.
 * - Conçu pour fonctionner partout (index, catalogue, produit, checkout).
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
   * Normalisation Produits
   * --------------------------------------------------------------------- */
  function normalizeProduct(p) {
    // Copie défensive
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
    const rawCat = (n.category || n.categorie || n.gender || n.genre || "").toString().toLowerCase();
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
      // fallback : construit une couleur par défaut avec image unique si présente
      const img =
        n.image ||
        (Array.isArray(n.images) && n.images[0]) ||
        (n.thumbnail ? n.thumbnail : "images/product-fallback.jpg");
      n.colors = [
        {
          code: "default",
          label: "Par défaut",
          images: [img].filter(Boolean),
        },
      ];
    }
    // Nettoyage images (unicité)
    n.colors = n.colors.map((c) => {
      const imgs = Array.from(new Set((c.images || []).filter(Boolean)));
      return { ...c, images: imgs.length ? imgs : ["images/product-fallback.jpg"] };
    });

    // Tailles
    if (!Array.isArray(n.sizes)) n.sizes = [];
    // Stock (convertit si absent)
    n.stock = n.stock || {};
    n.sizes.forEach((sz) => {
      if (typeof n.stock[sz] !== "number") n.stock[sz] = 10; // par défaut
    });

    // Tags
    n.tags = Array.isArray(n.tags) ? n.tags : [];
    n.is_new =
      n.is_new ||
      n.tags.some((t) => ["new", "nouveau", "nouveauté", "nouveautes"].includes(String(t).toLowerCase()));

    return n;
  }

  /* -----------------------------------------------------------------------
   * Chargement des produits (depuis data/products.json)
   *   - cache 5 min
   * --------------------------------------------------------------------- */
  const CACHE_KEY = "gf:data:products";
  const STAMP_KEY = "gf:data:products:ts";
  const TTL = 5 * 60 * 1000;

  async function loadAll() {
    const now = Date.now();
    const stamp = LS.get(STAMP_KEY, 0);
    let list = LS.get(CACHE_KEY, null);

    if (!list || now - stamp > TTL) {
      const res = await fetch("data/products.json", { cache: "no-store" });
      if (!res.ok) throw new Error("data/products.json introuvable");
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : data.products || [];
      list = rawList.map(normalizeProduct);
      LS.set(CACHE_KEY, list);
      LS.set(STAMP_KEY, now);
    }
    return list;
  }

  /* -----------------------------------------------------------------------
   * Sélection / Recherche
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
   * URL helpers (produit.html)
   * --------------------------------------------------------------------- */
  function productUrl(product, opts = {}) {
    const base = "produit.html";
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

  /* -----------------------------------------------------------------------
   * API publique
   * --------------------------------------------------------------------- */
  const API = {
    /** Charge tous les produits normalisés */
    async all() {
      return loadAll();
    },

    /** Renvoie {product, color, size} à partir des paramètres d’URL */
    async currentFromURL() {
      const list = await loadAll();
      return resolveFromURL(list);
    },

    /** Cherche par SKU, slug ou predicate */
    async find(query) {
      const list = await loadAll();
      if (typeof query === "function") return list.find(query) || null;
      return list.find((p) => p.sku === query || p.slug === query) || null;
    },

    /** Cherche une sélection (tableau) */
    async filter(predicate) {
      const list = await loadAll();
      if (typeof predicate !== "function") return list;
      return list.filter(predicate);
    },

    /** Utilitaires produit */
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
    },
  };

  // Exporte sur window.Products
  global.Products = API;
})(window);

/* -------------------------------------------------------------------------
 * EXEMPLES D’USAGE (copier/coller dans tes pages si besoin)
 * -------------------------------------------------------------------------
 * // 1) Récupérer le produit courant dans produit.html :
 * (async () => {
 *   const { product, color, size } = await Products.currentFromURL();
 *   if (!product) { /* afficher 404 */ /* return; }
 *   const img = Products.utils.firstImage(product, color);
 *   const prix = Products.utils.fmtPrice(product.price, product.currency);
 *   console.log(product.title, prix, img, color, size);
 * })();
 *
 * // 2) Générer un lien vers une fiche produit (depuis catalogue) :
 * const href = Products.utils.productUrl(p, { color: p.colors?.[0]?.code, utm: { src:'cat' } });
 *
 * // 3) Trouver des "nouveautés" :
 * const news = (await Products.all()).filter(p => p.is_new);
 * ------------------------------------------------------------------------- */
