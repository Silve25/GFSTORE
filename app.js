/* ==========================================================================
   GF Store — app.js
   Un chef d’orchestre front qui coordonne les pages, le panier, l’auth,
   la navigation, les filtres catalogue, le checkout (virement), etc.
   --------------------------------------------------------------------------
   - Aucune lib requise (fonctionne en Vanilla JS). Compatible jQuery si présent.
   - Persistance locale via localStorage (clé "gf:*").
   - Sait coopérer avec catalogue.html existant (ne re-render pas la grille).
   - Orienté "progressive enhancement": n’altère pas si les éléments manquent.
   ========================================================================== */

(() => {
  "use strict";

  /* -----------------------------------------------------------------------
   * Utils
   * --------------------------------------------------------------------- */
  const U = {
    qs: (sel, root = document) => root.querySelector(sel),
    qsa: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
    on: (el, evt, cb, opts) => el && el.addEventListener(evt, cb, opts),
    delegate(root, evt, sel, handler) {
      if (!root) return;
      root.addEventListener(evt, (e) => {
        const t = e.target.closest(sel);
        if (t && root.contains(t)) handler(e, t);
      });
    },
    fmtPrice(n) {
      return Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    },
    uuid() {
      return "gf-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    },
    hash(s) {
      // faux hash rapide pour démo
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
      return (h >>> 0).toString(16);
    },
    getParam(name, def = "") {
      const url = new URL(window.location.href);
      return url.searchParams.get(name) || def;
    },
    setParams(obj, push = true) {
      const url = new URL(window.location.href);
      Object.entries(obj).forEach(([k, v]) => {
        if (v === null || v === undefined || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      });
      if (push) history.pushState({}, "", url);
      else history.replaceState({}, "", url);
    },
    inPage(idOrPathPart) {
      const p = location.pathname.toLowerCase();
      return p.endsWith(`/${idOrPathPart}`) || p.includes(idOrPathPart.toLowerCase());
    },
    clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    },
    sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },
  };

  /* -----------------------------------------------------------------------
   * Storage (localStorage wrapper)
   * --------------------------------------------------------------------- */
  const Store = {
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch {}
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };

  /* -----------------------------------------------------------------------
   * Event Bus (simple)
   * --------------------------------------------------------------------- */
  const Bus = {
    _ev: {},
    on(evt, cb) {
      (this._ev[evt] = this._ev[evt] || []).push(cb);
    },
    emit(evt, payload) {
      (this._ev[evt] || []).forEach((cb) => cb(payload));
    },
  };

  /* -----------------------------------------------------------------------
   * API (mock local pour démo ; à remplacer par un vrai backend plus tard)
   * --------------------------------------------------------------------- */
  const API = {
    async fetchProducts() {
      // cache 5 min
      const cacheKey = "gf:products";
      const stampKey = "gf:products:ts";
      const ttl = 5 * 60 * 1000;

      const now = Date.now();
      const stamp = Store.get(stampKey, 0);
      let products = Store.get(cacheKey, null);

      if (!products || now - stamp > ttl) {
        try {
          // 1) data/products.js -> window.Products.all()
          if (window.Products?.all) {
            products = await window.Products.all();
          } else {
            // 2) Fallback JSON (fonctionne en local et sur GitHub Pages)
            const candidates = [
              new URL("data/products.json", location.href).href,
              new URL("products.json", location.href).href,
            ];

            let loaded = null;
            for (const url of candidates) {
              try {
                const r = await fetch(url, { cache: "no-store" });
                if (!r.ok) continue;
                const data = await r.json();
                loaded = Array.isArray(data) ? data : (data.products || []);
                if (Array.isArray(loaded) && loaded.length) break;
              } catch (_) {
                // on tente l'URL suivante
              }
            }
            products = loaded || [];
          }
        } catch (e) {
          console.warn("fetchProducts() error:", e);
          products = [];
        }

        Store.set(cacheKey, products);
        Store.set(stampKey, now);
      }
      return Array.isArray(products) ? products : [];
    },

    // Auth basique en localStorage
    async register({ email, password }) {
      email = String(email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email invalide");
      if (!password || password.length < 6) throw new Error("Mot de passe trop court");

      const users = Store.get("gf:users", {});
      if (users[email]) throw new Error("Un compte existe déjà avec cet email");

      const user = {
        id: U.uuid(),
        email,
        pass: U.hash(password),
        created_at: new Date().toISOString(),
        wishlist: [],
        orders: [],
        couponUsed: false,
      };
      users[email] = user;
      Store.set("gf:users", users);
      Store.set("gf:session", { email, token: U.uuid() });

      return { email };
    },

    async login({ email, password }) {
      email = String(email || "").trim().toLowerCase();
      const users = Store.get("gf:users", {});
      const u = users[email];
      if (!u) throw new Error("Compte introuvable");
      if (u.pass !== U.hash(password)) throw new Error("Mot de passe incorrect");
      Store.set("gf:session", { email, token: U.uuid() });
      return { email };
    },

    async logout() {
      Store.remove("gf:session");
      return true;
    },

    async me() {
      const s = Store.get("gf:session", null);
      if (!s) return null;
      const users = Store.get("gf:users", {});
      return users[s.email] || null;
    },

    async resetPassword({ email }) {
      email = String(email || "").trim().toLowerCase();
      const users = Store.get("gf:users", {});
      if (!users[email]) throw new Error("Aucun compte avec cet email");
      // en vrai : email envoyé
      return true;
    },

    async saveOrder(order) {
      // en vrai : POST serveur ; ici on range dans le user + "gf:orders"
      const id = "CMD-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const full = { id, ...order, created_at: new Date().toISOString(), status: "en_attente_virement" };

      const all = Store.get("gf:orders", []);
      all.push(full);
      Store.set("gf:orders", all);

      const me = await API.me();
      if (me) {
        const users = Store.get("gf:users", {});
        me.orders.push(id);
        users[me.email] = me;
        Store.set("gf:users", users);
      }
      return full;
    },
  };

  /* -----------------------------------------------------------------------
   * Auth controller
   * --------------------------------------------------------------------- */
  const Auth = {
    state: { user: null },

    async init() {
      this.state.user = await API.me();
      this.decorateUI();
      this.bindForms();
    },

    decorateUI() {
      // On peut afficher l'email dans l’en-tête (si tu ajoutes un span[data-user])
      const span = U.qs("[data-user]");
      if (span) span.textContent = this.state.user ? this.state.user.email : "Invité";
    },

    bindForms() {
      // Login
      const fLogin = U.qs("form#login");
      if (fLogin) {
        U.on(fLogin, "submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(fLogin);
          try {
            await API.login({ email: fd.get("email"), password: fd.get("password") });
            location.href = "index.html";
          } catch (err) {
            alert(err.message || "Erreur de connexion");
          }
        });
      }
      // Register
      const fReg = U.qs("form#register");
      if (fReg) {
        U.on(fReg, "submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(fReg);
          try {
            await API.register({ email: fd.get("email"), password: fd.get("password") });
            location.href = "index.html";
          } catch (err) {
            alert(err.message || "Impossible de créer le compte");
          }
        });
      }
      // Reset
      const fReset = U.qs("form#password-reset");
      if (fReset) {
        U.on(fReset, "submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(fReset);
          try {
            await API.resetPassword({ email: fd.get("email") });
            alert("Si un compte existe, un email vient d’être envoyé.");
            location.href = "login.html";
          } catch (err) {
            alert(err.message || "Erreur de réinitialisation");
          }
        });
      }

      // Logout (si bouton présent)
      U.delegate(document, "click", "[data-logout]", async (e) => {
        e.preventDefault();
        await API.logout();
        location.reload();
      });
    },
  };

  /* -----------------------------------------------------------------------
   * Cart
   * --------------------------------------------------------------------- */
  const Cart = {
    key: "gf:cart",
    state: { items: [] }, // {id, name, price, qty, image}
    init() {
      this.state.items = Store.get(this.key, []);
      this.badge();
      this.renderOffcanvas();
      this.bind();
    },
    persist() {
      Store.set(this.key, this.state.items);
      this.badge();
      Bus.emit("cart:change", this.summary());
    },
    summary() {
      const qty = this.state.items.reduce((a, b) => a + b.qty, 0);
      const subtotal = this.state.items.reduce((a, b) => a + b.qty * b.price, 0);
      const shipping = 0; // livraison gratuite
      return { qty, subtotal, shipping, total: subtotal + shipping };
    },
    add(p, qty = 1) {
      const id = String(p.id || p.sku || p.title || p.name);
      const price = Number(p.price ?? p.prix ?? 0);
      const name = p.title || p.name || "Produit";
      const image =
        typeof p.image === "string"
          ? p.image
          : Array.isArray(p.images) && p.images[0]
          ? p.images[0]
          : p.thumbnail || "images/product-item-1.jpg";

      const idx = this.state.items.findIndex((x) => x.id === id);
      if (idx >= 0) this.state.items[idx].qty += qty;
      else this.state.items.push({ id, name, price, qty, image });

      this.persist();
      this.toast(`${name} ajouté au panier`);
    },
    update(id, qty) {
      const it = this.state.items.find((x) => x.id === id);
      if (!it) return;
      it.qty = U.clamp(qty, 1, 99);
      this.persist();
      this.renderOffcanvas();
    },
    remove(id) {
      this.state.items = this.state.items.filter((x) => x.id !== id);
      this.persist();
      this.renderOffcanvas();
    },
    clear() {
      this.state.items = [];
      this.persist();
      this.renderOffcanvas();
    },
    badge() {
      U.qsa(".cart-count").forEach((el) => (el.textContent = this.summary().qty));
    },
    toast(msg) {
      // toast minimal
      let t = U.qs("#gf-toast");
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
    },
    renderOffcanvas() {
      const wrap = U.qs("#offcanvasCart .offcanvas-body");
      if (!wrap) return;

      const { items } = this.state;
      if (!items.length) {
        wrap.innerHTML = `
          <h4 class="d-flex justify-content-between align-items-center mb-3">
            <span class="text-primary">Votre panier</span>
            <span class="badge bg-primary rounded-pill cart-count">${this.summary().qty}</span>
          </h4>
          <p class="text-body-secondary">Votre panier est vide.</p>
          <a class="w-100 btn btn-dark btn-lg mt-3" href="checkout.html">Passer au paiement</a>
        `;
        return;
      }

      const rows = items
        .map(
          (it) => `
        <div class="d-flex align-items-center gap-3 py-2 border-bottom">
          <img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:8px">
          <div class="flex-grow-1">
            <div class="fw-semibold">${it.name}</div>
            <div class="small text-secondary">${U.fmtPrice(it.price)} · Qté 
              <button class="btn btn-sm btn-outline-secondary px-2" data-cart-dec="${it.id}">−</button>
              <span class="mx-2">${it.qty}</span>
              <button class="btn btn-sm btn-outline-secondary px-2" data-cart-inc="${it.id}">+</button>
            </div>
          </div>
          <div class="text-end">
            <div class="fw-semibold">${U.fmtPrice(it.qty * it.price)}</div>
            <button class="btn btn-sm btn-link text-danger p-0" data-cart-del="${it.id}">Supprimer</button>
          </div>
        </div>`
        )
        .join("");

      const s = this.summary();
      wrap.innerHTML = `
        <h4 class="d-flex justify-content-between align-items-center mb-3">
          <span class="text-primary">Votre panier</span>
          <span class="badge bg-primary rounded-pill cart-count">${s.qty}</span>
        </h4>
        ${rows}
        <div class="mt-3 small text-success">Livraison gratuite en France métropolitaine</div>
        <div class="d-flex justify-content-between mt-2">
          <span>Sous-total</span><strong>${U.fmtPrice(s.subtotal)}</strong>
        </div>
        <a class="w-100 btn btn-dark btn-lg mt-3" href="checkout.html">Passer au paiement</a>
      `;
    },
    bind() {
      // boutons +/-/supprimer dans l’offcanvas
      U.delegate(document, "click", "[data-cart-inc]", (e, t) => {
        const id = t.getAttribute("data-cart-inc");
        const it = this.state.items.find((x) => x.id === id);
        if (it) this.update(id, it.qty + 1);
      });
      U.delegate(document, "click", "[data-cart-dec]", (e, t) => {
        const id = t.getAttribute("data-cart-dec");
        const it = this.state.items.find((x) => x.id === id);
        if (it) this.update(id, it.qty - 1);
      });
      U.delegate(document, "click", "[data-cart-del]", (e, t) => {
        const id = t.getAttribute("data-cart-del");
        this.remove(id);
      });

      // Ajout panier depuis cartes produit (si un bouton a [data-add])
      U.delegate(document, "click", "[data-add]", async (e, btn) => {
        e.preventDefault();
        const id = btn.getAttribute("data-id");
        const price = Number(btn.getAttribute("data-price") || 0);
        const name = btn.getAttribute("data-name") || "Produit";
        const image = btn.getAttribute("data-image") || "images/product-item-1.jpg";
        this.add({ id, price, title: name, image }, 1);
      });

      // Synchronise badge s’il y a d’autres scripts qui modifient le panier
      Bus.on("cart:change", () => this.renderOffcanvas());
    },
  };

  /* -----------------------------------------------------------------------
   * Wishlist (simple)
   * --------------------------------------------------------------------- */
  const Wishlist = {
    key: "gf:wishlist",
    list: [],
    init() {
      this.list = Store.get(this.key, []);
      U.delegate(document, "click", "[data-wish]", (e, t) => {
        e.preventDefault();
        const id = t.getAttribute("data-wish");
        this.toggle(id);
        t.classList.toggle("active", this.has(id));
      });
    },
    has(id) {
      return this.list.includes(id);
    },
    toggle(id) {
      if (this.has(id)) this.list = this.list.filter((x) => x !== id);
      else this.list.push(id);
      Store.set(this.key, this.list);
    },
  };

  /* -----------------------------------------------------------------------
   * Router “léger” (+ helpers de navigation)
   * --------------------------------------------------------------------- */
  const Router = {
    init() {
      // Liens de raccourci pour ouvrir le catalogue pré-filtré
      U.delegate(document, "click", '[href="catalogue.html?filter=homme"], [data-nav="homme"]', (e) => {
        if (!e.target.closest("a[href]")) {
          e.preventDefault();
          location.href = "catalogue.html?filter=homme";
        }
      });
      U.delegate(document, "click", '[href="catalogue.html?filter=femme"], [data-nav="femme"]', (e) => {
        if (!e.target.closest("a[href]")) {
          e.preventDefault();
          location.href = "catalogue.html?filter=femme";
        }
      });
      U.delegate(document, "click", '[href="catalogue.html?filter=enfant"], [data-nav="enfant"]', (e) => {
        if (!e.target.closest("a[href]")) {
          e.preventDefault();
          location.href = "catalogue.html?filter=enfant";
        }
      });

      // Page catalogue : appliquer les filtres par défaut si présents dans l’URL
      if (U.inPage("catalogue.html")) {
        const f = U.getParam("filter", "all");
        const q = U.getParam("q", "");
        const sort = U.getParam("sort", "relevance");

        const elFilter = U.qs("#filter");
        const elQ = U.qs("#q");
        const elSort = U.qs("#sort");

        if (elFilter) elFilter.value = f;
        if (elQ) elQ.value = q;
        if (elSort) elSort.value = sort;

        // Déclenche un évènement input/change pour laisser le script de catalogue.html réagir
        if (elFilter) elFilter.dispatchEvent(new Event("change"));
        if (elQ) elQ.dispatchEvent(new Event("input"));
        if (elSort) elSort.dispatchEvent(new Event("change"));
      }
    },
  };

  /* -----------------------------------------------------------------------
   * Checkout (virement bancaire uniquement)
   * --------------------------------------------------------------------- */
  const Checkout = {
    COUPON: "GF-FIRST10",
    init() {
      if (!U.inPage("checkout.html")) return;

      this.render();
      this.bind();
    },
    calc(cart, user) {
      const subtotal = cart.subtotal;
      const shipping = 0; // livraison gratuite
      let discount = 0;

      // coupon -10% (première commande)
      const isFirstOrder = user ? !(user.couponUsed || false) : true;
      const applied = (U.qs("#coupon")?.value || "").trim().toUpperCase() === this.COUPON;
      if (applied && isFirstOrder) discount = Math.round(subtotal * 0.1);

      const total = Math.max(0, subtotal + shipping - discount);
      return { subtotal, shipping, discount, total, applied, isFirstOrder };
    },
    render() {
      const cart = Cart.summary();
      const user = Store.get("gf:session", null) ? Store.get("gf:users", {})[Store.get("gf:session").email] : null;

      const mount = U.qs("#checkout-summary");
      if (!mount) return;

      const c = this.calc(cart, user);

      mount.innerHTML = `
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <h5 class="mb-3">Votre commande</h5>
            ${Cart.state.items
              .map(
                (it) => `
              <div class="d-flex justify-content-between small py-1 border-bottom">
                <span>${it.name} × ${it.qty}</span><span>${U.fmtPrice(it.qty * it.price)}</span>
              </div>`
              )
              .join("")}
            <div class="d-flex justify-content-between mt-3"><span>Sous-total</span><strong>${U.fmtPrice(
              c.subtotal
            )}</strong></div>
            <div class="d-flex justify-content-between"><span>Livraison</span><strong>Gratuite</strong></div>
            <div class="d-flex justify-content-between"><span>Remise</span><strong>- ${U.fmtPrice(c.discount)}</strong></div>
            <hr>
            <div class="d-flex justify-content-between fs-5"><span>Total</span><strong>${U.fmtPrice(c.total)}</strong></div>

            <div class="mt-3">
              <label class="form-label">Code promo</label>
              <div class="input-group">
                <input id="coupon" class="form-control" placeholder="${this.COUPON}">
                <button class="btn btn-outline-dark" id="apply-coupon">Appliquer</button>
              </div>
              <div class="small mt-2 text-muted">* Le code ${this.COUPON} offre -10% sur la première commande.</div>
            </div>

            <div class="alert alert-info mt-3">
              <strong>Paiement par virement bancaire uniquement.</strong><br>
              RIB : GF STORE — FR76 1234 5678 9012 3456 7890 123 · BIC : GFSTFRPPXXX<br>
              Votre commande sera traitée dès réception du virement (confirmation par email).
            </div>
          </div>
        </div>
      `;
    },
    bind() {
      // Appliquer coupon
      U.delegate(document, "click", "#apply-coupon", (e) => {
        e.preventDefault();
        this.render(); // recalcul simple
      });

      // Soumission checkout
      const form = U.qs("#checkout-form");
      if (!form) return;

      U.on(form, "submit", async (e) => {
        e.preventDefault();
        if (!Cart.state.items.length) {
          alert("Votre panier est vide.");
          return;
        }
        const fd = new FormData(form);
        const infos = Object.fromEntries(fd.entries());

        // validation minimaliste
        if (!infos.nom || !infos.email || !infos.adresse) {
          alert("Merci de compléter les champs requis.");
          return;
        }

        // Calcul final
        const me = await API.me();
        const calc = this.calc(Cart.summary(), me);

        // Sauvegarde
        const order = await API.saveOrder({
          items: Cart.state.items,
          customer: { ...infos, email: (infos.email || "").toLowerCase() },
          totals: calc,
          payment: { method: "virement", status: "en_attente" },
        });

        // Marque coupon utilisé
        if (me && calc.applied && calc.isFirstOrder) {
          const users = Store.get("gf:users", {});
          users[me.email].couponUsed = true;
          Store.set("gf:users", users);
        }

        // Clear panier + redirect page succès
        Cart.clear();
        Store.set("gf:last-order", order);
        location.href = "commande.html?id=" + encodeURIComponent(order.id);
      });
    },
  };

  /* -----------------------------------------------------------------------
   * Page "Commande" (récap dernière commande)
   * --------------------------------------------------------------------- */
  const OrderPage = {
    init() {
      if (!U.inPage("commande.html")) return;
      const mount = U.qs("#order-detail");
      if (!mount) return;

      const id = U.getParam("id", "");
      let order = null;

      const last = Store.get("gf:last-order", null);
      if (last && (!id || id === last.id)) order = last;
      if (!order) {
        const all = Store.get("gf:orders", []);
        order = all.find((o) => o.id === id) || null;
      }

      if (!order) {
        mount.innerHTML = `<div class="alert alert-warning">Commande introuvable.</div>`;
        return;
      }

      mount.innerHTML = `
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <h5>Commande ${order.id}</h5>
            <div class="small text-muted mb-3">Statut : ${order.status.replaceAll("_", " ")}</div>

            ${order.items
              .map(
                (it) => `<div class="d-flex justify-content-between small py-1 border-bottom">
              <span>${it.name} × ${it.qty}</span><span>${U.fmtPrice(it.qty * it.price)}</span>
            </div>`
              )
              .join("")}
            <div class="d-flex justify-content-between mt-3"><span>Total</span><strong>${U.fmtPrice(
              order.totals.total
            )}</strong></div>

            <div class="alert alert-info mt-3 mb-0">
              Merci ! Nous préparerons votre colis dès réception du <strong>virement bancaire</strong>.
            </div>
          </div>
        </div>
      `;
    },
  };

  /* -----------------------------------------------------------------------
   * Newsletter (petit bonus UX)
   * --------------------------------------------------------------------- */
  const Newsletter = {
    init() {
      const form = U.qs('form#form, form[action="register.html"]');
      if (!form) return;
      U.on(form, "submit", (e) => {
        // On laisse la navigation si action définie ; sinon, confirmation
        if (!form.getAttribute("action")) {
          e.preventDefault();
          const email = new FormData(form).get("email");
          if (!/^\S+@\S+\.\S+$/.test(email || "")) return alert("Email invalide");
          alert("Merci ! Vous êtes inscrit(e) à notre newsletter.");
          form.reset();
        }
      });
    },
  };

  /* -----------------------------------------------------------------------
   * “Deep integration” catalogue (facultative)
   * - Si tu veux, tu peux activer l’ajout panier via event custom :
   *   déclenche `document.dispatchEvent(new CustomEvent('gf:add', {detail:{product}}))`
   *   depuis la page catalogue, et Cart.add() prendra le relais.
   * --------------------------------------------------------------------- */
  document.addEventListener("gf:add", (e) => {
    const p = e.detail?.product;
    if (p) Cart.add(p, 1);
  });

  /* -----------------------------------------------------------------------
   * Boot
   * --------------------------------------------------------------------- */
  async function boot() {
    Auth.init();
    Cart.init();
    Wishlist.init();
    Router.init();
    Checkout.init();
    OrderPage.init();
    Newsletter.init();

    // Ajoute auto les data-id / data-add si des cartes produits statiques existent
    U.qsa(".product-card").forEach((card, i) => {
      const name = U.qs(".name", card)?.textContent?.trim() || `Produit ${i + 1}`;
      const priceTxt = U.qs(".price", card)?.textContent || "0";
      const price = Number(String(priceTxt).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
      const img = U.qs("img", card)?.getAttribute("src") || "images/product-item-1.jpg";

      const btn = U.qs(".add, [data-add]", card);
      if (btn && !btn.getAttribute("data-add")) {
        btn.setAttribute("data-add", "");
        btn.setAttribute("data-id", name.toLowerCase().replace(/\s+/g, "-") + "-" + i);
        btn.setAttribute("data-name", name);
        btn.setAttribute("data-price", String(price));
        btn.setAttribute("data-image", img);
      }
    });

    // Filtres rapides depuis la home (failsafe)
    U.delegate(document, "click", '[data-nav="homme"], [data-nav="femme"], [data-nav="enfant"]', (e, t) => {
      e.preventDefault();
      const v = t.getAttribute("data-nav");
      location.href = `catalogue.html?filter=${encodeURIComponent(v)}`;
    });

    // Impression rapide d’une moyenne d’avis (optionnel)
    const rating = U.qs("[data-rating-avg]");
    if (rating) rating.textContent = "4,8/5";
  }

  // DOM ready
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
