/*!
 * GF Store — products.js
 * Page Produit: chargement data, rendu, interactions (couleurs/tailles), ajout panier.
 * - Aucune dépendance (Vanilla JS)
 * - Coopère avec app.js (évènement 'gf:add' + data-* sur le bouton)
 * - Fallbacks de chargement JSON robustes (local → racine → domaine prod)
 * - Cache localStorage 5 min (clé gf:data:products*)
 */
(function (global, doc) {
  "use strict";

  /* -----------------------------------------------------------------------
   * Mini utils
   * --------------------------------------------------------------------- */
  const U = {
    qs: (sel, root = doc) => root.querySelector(sel),
    qsa: (sel, root = doc) => Array.from(root.querySelectorAll(sel)),
    on: (el, evt, cb, opt) => el && el.addEventListener(evt, cb, opt),
    fmtPrice(n, currency = "EUR", locale = "fr-FR") {
      try {
        return Number(n || 0).toLocaleString(locale, { style: "currency", currency });
      } catch {
        return (n || 0) + " " + currency;
      }
    },
    slug(s) {
      return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
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
   * Normalisation produit
   * --------------------------------------------------------------------- */
  function normalizeProduct(p) {
    const n = JSON.parse(JSON.stringify(p || {}));

    // Identifiants
    n.sku = n.sku || n.id || n.SKU || n.code || U.slug(n.title || n.name || "prod");
    n.slug = n.slug || U.slug(n.title || n.name || n.sku);

    // Libellés/prix
    n.title = n.title || n.name || "Produit";
    n.subtitle = n.subtitle || n.tagline || "";
    n.currency = (n.currency || "EUR").toUpperCase();
    n.price = Number(n.price ?? n.prix ?? 0);
    n.vat_included = n.vat_included ?? true;

    // Catégorie/gender
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

    // Couleurs/images
    if (!Array.isArray(n.colors) || !n.colors.length) {
      const img =
        n.image ||
        (Array.isArray(n.images) && n.images[0]) ||
        (n.thumbnail ? n.thumbnail : "images/product-fallback.jpg");
      n.colors = [{ code: "default", label: "Par défaut", images: [img].filter(Boolean) }];
    }
    n.colors = n.colors.map((c, i) => {
      const images = Array.from(new Set((c.images || []).filter(Boolean)));
      return {
        code: c.code || `c${i + 1}`,
        label: c.label || `Couleur ${i + 1}`,
        images: images.length ? images : ["images/product-fallback.jpg"],
      };
    });

    // Tailles / stock
    if (!Array.isArray(n.sizes)) n.sizes = [];
    n.stock = n.stock || {};
    n.sizes.forEach((sz) => {
      if (typeof n.stock[sz] !== "number") n.stock[sz] = 10;
    });

    // Tags / nouveauté
    n.tags = Array.isArray(n.tags) ? n.tags : [];
    n.is_new =
      !!n.is_new ||
      n.tags.some((t) => ["new", "nouveau", "nouveauté", "nouveautes"].includes(String(t).toLowerCase()));

    return n;
  }

  /* -----------------------------------------------------------------------
   * Chargement produits — robustifier le fetch (et exposer window.Products)
   * --------------------------------------------------------------------- */
  const CACHE_KEY = "gf:data:products";
  const STAMP_KEY = "gf:data:products:ts";
  const TTL = 5 * 60 * 1000;

  async function fetchCandidates() {
    // Ordre: data/ → racine → domaine prod
    return [
      new URL("data/products.json", location.href).href,
      new URL("products.json", location.href).href,
      "https://gfstore.store/data/products.json",
    ];
  }

  async function loadAllInternal() {
    // 0) Si une implémentation existe déjà (ex: data/products.js), utilise-la.
    if (global.Products && typeof global.Products.all === "function" && !global.__GF_FORCE_LOCAL_LOAD__) {
      try {
        const pre = await global.Products.all();
        if (Array.isArray(pre) && pre.length) return pre.map(normalizeProduct);
      } catch {
        // on bascule sur notre chargeur
      }
    }

    // 1) Cache
    const now = Date.now();
    const stamp = LS.get(STAMP_KEY, 0);
    let list = LS.get(CACHE_KEY, null);
    if (Array.isArray(list) && list.length && now - stamp <= TTL) {
      return list;
    }

    // 2) Fallbacks
    const urls = await fetchCandidates();
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        const raw = Array.isArray(data) ? data : data.products || [];
        if (Array.isArray(raw) && raw.length) {
          list = raw.map(normalizeProduct);
          LS.set(CACHE_KEY, list);
          LS.set(STAMP_KEY, now);
          return list;
        }
      } catch {
        // essayer url suivante
      }
    }
    return [];
  }

  // On expose/complète window.Products (API stable utilisée par app.js)
  if (!global.Products) global.Products = {};
  const API = {
    async all() {
      const list = await loadAllInternal();
      return list;
    },
    async currentFromURL() {
      const list = await loadAllInternal();
      const sku = U.getParam("sku", "");
      const slug = U.getParam("slug", "");
      const color = U.getParam("color", "");
      const size = U.getParam("size", "");

      let product = null;
      if (sku) product = list.find((p) => String(p.sku) === sku) || null;
      if (!product && slug) product = list.find((p) => String(p.slug) === slug) || null;

      return { product, color: color || null, size: size || null };
    },
    async find(query) {
      const list = await loadAllInternal();
      if (typeof query === "function") return list.find(query) || null;
      return list.find((p) => p.sku === query || p.slug === query) || null;
    },
    async filter(predicate) {
      const list = await loadAllInternal();
      if (typeof predicate !== "function") return list;
      return list.filter(predicate);
    },
    utils: {
      fmtPrice: U.fmtPrice,
      setParams: U.setParams,
      getParam: U.getParam,
      slug: U.slug,
      clamp: U.clamp,
      firstImage(product, colorCode) {
        const c =
          (product.colors || []).find((x) => x.code === colorCode) ||
          (product.colors || [])[0] ||
          { images: [] };
        return c.images[0] || "images/product-fallback.jpg";
      },
      getColor(product, colorCode) {
        const colors = product.colors || [];
        if (!colors.length) return null;
        return colors.find((c) => c.code === colorCode) || colors[0];
      },
      inStock(product, size) {
        if (!size) return true;
        const stock = product.stock || {};
        const n = Number(stock[size] ?? 0);
        return n > 0;
      },
    },
  };
  // Merge (sans écraser une autre implémentation complète)
  global.Products.all = API.all;
  global.Products.currentFromURL = API.currentFromURL;
  global.Products.find = API.find;
  global.Products.filter = API.filter;
  global.Products.utils = { ...(global.Products.utils || {}), ...API.utils };

  /* -----------------------------------------------------------------------
   * Rendu page produit (optionnel, s’active si les éléments existent)
   * --------------------------------------------------------------------- */
  async function bootProductPage() {
    // Détecte si on est sur la page produit (ou si des hooks existent)
    const hasRoot =
      U.qs('[data-product-root]') ||
      U.qs("#product-root") ||
      U.qs("#p-title") ||
      U.qs(".product-title") ||
      /produit\.html|product\.html|products\.html/i.test(location.pathname);

    if (!hasRoot) return;

    // Résout produit
    const { product, color: colorQS, size: sizeQS } = await API.currentFromURL();

    const $title = U.qs("#p-title") || U.qs(".product-title");
    const $subtitle = U.qs("#p-subtitle") || U.qs(".product-subtitle");
    const $price = U.qs("#p-price") || U.qs(".product-price");
    const $cat = U.qs("#p-cat") || U.qs(".product-cat");
    const $madein = U.qs("#p-madein") || U.qs(".product-madein");
    const $features = U.qs("#p-features");
    const $care = U.qs("#p-care");
    const $colors = U.qs("#p-colors") || U.qs(".product-colors");
    const $sizes = U.qs("#p-sizes") || U.qs(".product-sizes");
    const $hero = U.qs("#p-hero") || U.qs(".product-hero img") || U.qs(".product-hero");
    const $thumbs = U.qs("#p-thumbs") || U.qs(".product-thumbs");
    const $add = U.qs("#p-add") || U.qs('[data-action="add-to-cart"]') || U.qs(".btn-add");
    const $link = U.qs("#p-deeplink") || U.qs(".product-deeplink");
    const $crumbs = U.qs("#p-breadcrumbs") || U.qs(".product-breadcrumbs");
    const $stock = U.qs("#p-stock") || U.qs(".product-stock");

    // Si produit introuvable
    if (!product) {
      if ($title) $title.textContent = "Produit introuvable";
      if ($price) $price.textContent = "—";
      if ($hero && $hero.setAttribute) $hero.setAttribute("src", "images/product-fallback.jpg");
      const $msg = U.qs("#product-mount") || U.qs("#product-root");
      if ($msg) $msg.innerHTML = `<div class="alert alert-warning">Aucun produit trouvé pour ces paramètres d’URL.</div>`;
      return;
    }

    // État courant sélection
    let current = {
      color: global.Products.utils.getColor(product, colorQS)?.code || product.colors[0].code,
      size: sizeQS || (product.sizes[0] || null),
      image: null,
    };

    // Helpers UI
    function refreshHero(imgUrl) {
      const url = imgUrl || global.Products.utils.firstImage(product, current.color);
      current.image = url;
      if ($hero) {
        if ($hero.tagName === "IMG") $hero.src = url;
        else $hero.style.backgroundImage = `url("${url}")`;
      }
      if ($thumbs) {
        U.qsa("img", $thumbs).forEach((im) => im.classList.toggle("active", im.src === url));
      }
    }

    function renderThumbs() {
      if (!$thumbs) return;
      const c = global.Products.utils.getColor(product, current.color);
      const imgs = (c?.images || []).slice(0, 8);
      $thumbs.innerHTML = imgs
        .map((src, i) => `<img src="${src}" alt="" class="${i === 0 ? "active" : ""}" loading="lazy">`)
        .join("");
      U.qsa("img", $thumbs).forEach((im) =>
        U.on(im, "click", () => {
          refreshHero(im.src);
        })
      );
    }

    function renderColors() {
      if (!$colors) return;
      const html = (product.colors || [])
        .map((c) => {
          const label = c.label || c.code;
          return `
          <button class="btn btn-sm ${c.code === current.color ? "btn-dark" : "btn-outline-secondary"} me-1 mb-1"
                  data-color="${c.code}" type="button">${label}</button>`;
        })
        .join("");
      $colors.innerHTML = html;
      U.qsa("[data-color]", $colors).forEach((btn) =>
        U.on(btn, "click", () => {
          current.color = btn.getAttribute("data-color");
          U.setParams({ color: current.color }, false);
          renderColors(); // re-highlight
          renderThumbs();
          refreshHero();
        })
      );
    }

    function renderSizes() {
      if (!$sizes) return;
      const html = (product.sizes || [])
        .map((s) => {
          const instock = global.Products.utils.inStock(product, s);
          const active = s === current.size;
          return `
          <button class="btn btn-sm ${active ? "btn-dark" : "btn-outline-secondary"} me-1 mb-1"
                  data-size="${s}" type="button" ${instock ? "" : "disabled"}>${s}</button>`;
        })
        .join("");
      $sizes.innerHTML = html;
      U.qsa("[data-size]", $sizes).forEach((btn) =>
        U.on(btn, "click", () => {
          current.size = btn.getAttribute("data-size");
          U.setParams({ size: current.size }, false);
          updateStockState();
          renderSizes(); // re-highlight
        })
      );
    }

    function updateStockState() {
      if (!$stock && !$add) return;
      const ok = current.size ? global.Products.utils.inStock(product, current.size) : true;
      if ($stock) $stock.textContent = ok ? "En stock" : "Indisponible";
      if ($add) $add.disabled = !ok;
    }

    // Rendu statique
    if ($title) $title.textContent = product.title;
    if ($subtitle) $subtitle.textContent = product.subtitle || "";
    if ($price) $price.textContent = U.fmtPrice(product.price, product.currency);
    if ($cat)
      $cat.textContent =
        product.category === "homme"
          ? "Hommes"
          : product.category === "femme"
          ? "Femmes"
          : product.category === "enfant"
          ? "Enfants"
          : "Produit";
    if ($madein && product.made_in) $madein.textContent = "Fabriqué en " + product.made_in;

    if ($features && Array.isArray(product.features)) {
      $features.innerHTML = product.features.map((f) => `<li>${f}</li>`).join("");
    }
    if ($care && Array.isArray(product.care)) {
      $care.innerHTML = product.care.map((f) => `<li>${f}</li>`).join("");
    }
    if ($crumbs) {
      $crumbs.innerHTML = `
        <ol class="breadcrumb">
          <li class="breadcrumb-item"><a href="index.html">Accueil</a></li>
          <li class="breadcrumb-item"><a href="catalogue.html">Catalogue</a></li>
          <li class="breadcrumb-item active" aria-current="page">${product.title}</li>
        </ol>`;
    }

    // Galerie & sélecteurs
    renderColors();
    renderSizes();
    renderThumbs();
    refreshHero();

    // Lien "ouvrir la fiche dédiée" si tu utilises plusieurs pages
    if ($link) {
      const params = new URLSearchParams();
      params.set("sku", product.sku);
      params.set("color", current.color || "");
      if (current.size) params.set("size", current.size);
      $link.href = `products.html?${params.toString()}`;
    }

    // Bouton Ajouter au panier — double intégration
    if ($add) {
      // Data-* pour que app.js intercepte automatiquement
      $add.setAttribute("data-add", "");
      $add.setAttribute("data-id", product.sku);
      $add.setAttribute("data-name", product.title);
      $add.setAttribute("data-price", String(product.price));
      $add.setAttribute(
        "data-image",
        current.image || global.Products.utils.firstImage(product, current.color)
      );

      U.on($add, "click", (e) => {
        e.preventDefault();
        // Évènement custom pour app.js (Cart.add via listener 'gf:add')
        const payload = {
          id: product.sku,
          sku: product.sku,
          title: product.title,
          name: product.title,
          price: product.price,
          currency: product.currency,
          image: current.image || global.Products.utils.firstImage(product, current.color),
          images: (global.Products.utils.getColor(product, current.color)?.images || []).slice(0, 4),
          size: current.size || null,
          color: current.color || null,
        };
        doc.dispatchEvent(new CustomEvent("gf:add", { detail: { product: payload } }));
        // NB: le délégué data-add d’app.js capte aussi le clic, donc double sécurité.
      });
    }

    // Met à jour l’état “stock” initial
    updateStockState();
  }

  // DOM Ready
  if (doc.readyState !== "loading") bootProductPage();
  else doc.addEventListener("DOMContentLoaded", bootProductPage);
})(window, document);
