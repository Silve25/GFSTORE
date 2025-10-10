<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Catalogue — GF Store</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />

  <!-- Bootstrap -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css" rel="stylesheet" crossorigin="anonymous">

  <!-- Vendor + Theme CSS (mêmes chemins que la racine du repo) -->
  <link rel="stylesheet" href="css/vendor.css">
  <link rel="stylesheet" href="style.css">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;700&family=Marcellus&display=swap" rel="stylesheet" />

  <!-- Micro styles spécifiques catalogue -->
  <style>
    :root{
      --navH:64px;             /* mis à jour en JS */
      --fomoH:40px;            /* mis à jour en JS */
      --anchorOffset: calc(var(--navH) + var(--fomoH) + 12px);
      --radius:14px;
    }
    html{scroll-behavior:smooth}
    body{background:#fff;color:#111}
    body.has-fixed-nav #content{padding-top:calc(var(--navH) + 8px)}
    .anchor-offset{scroll-margin-top: var(--anchorOffset)}

    /* ===== FOMO bar (cohérent avec index) ===== */
    .fomo-bar{
      position:sticky; top:0; z-index:1020;
      background:#111; color:#fff; font-size:.92rem;
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    }
    .badge-dot{display:inline-block;width:.45rem;height:.45rem;border-radius:50%;background:#22c55e;margin-right:.5rem}

    /* ===== Header : solide, blanc ===== */
    .navbar{
      min-height:64px;
      background:#fff !important;
      border-bottom:1px solid #eee;
      box-shadow:0 6px 20px rgba(0,0,0,.06);
    }
    .navbar a.nav-link, .navbar .navbar-brand{color:#111 !important}
    .navbar .navbar-toggler{border:none}

    /* Grille mobile : logo | panier | burger (panier à gauche du menu) */
    .nav-grid{display:flex; align-items:center; width:100%}
    @media (max-width:991.98px){
      .nav-grid{
        display:grid;
        grid-template-columns:1fr auto auto; /* logo | cart | burger */
        align-items:center; column-gap:.45rem;
      }
      .nav-brand{grid-column:1; justify-self:start}
      .nav-cart-right{grid-column:2; justify-self:end}
      .nav-toggle-right{grid-column:3; justify-self:end}
      .nav-desktop-icons{display:none !important}
      .nav-cart-right .badge{
        font-size:.65rem; line-height:1; padding:.25em .35em;
        transform:translate(15%,-35%);
      }
    }
    @media (min-width:992px){
      .nav-cart-right{display:none !important}
    }

    /* ===== Hero catalogue ===== */
    .catalog-hero{
      position:relative;
      background:#0f0f10 url('https://azure-eu-images.contentstack.com/v3/assets/blt70cb06b4414428cc/blt70e742eb576b00d4/68d2a81416d9319f7a72e26f/ASSET-HERO-HP-PRESS-RELEASE-SECONDHERO-ENFANT-DESK.jpg?branch=prod_1&format=avif&auto=auto&width=100p&quality=90') center/cover no-repeat;
      color:#fff;
      padding: min(22vh,220px) 0 64px;
      text-align:center;
    }
    .catalog-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,.35))}
    .catalog-hero > .container{position:relative;z-index:1}
    .catalog-hero .crumbs a{opacity:.9}
    .catalog-hero .crumbs .breadcrumb-item+.breadcrumb-item::before{color:rgba(255,255,255,.6)}

    /* ===== Filtres & chips ===== */
    .filter-chip{
      display:inline-flex; align-items:center; gap:.5rem;
      background:#f1f3f5; border:1px solid #e6e6e6; color:#333;
      padding:.35rem .6rem; border-radius:999px; font-size:.85rem;
    }
    .filter-chip button{border:0;background:transparent;line-height:1;cursor:pointer}
    .filter-chip button:hover{opacity:.65}

    /* ===== Skeleton ===== */
    .skeleton{
      position:relative; overflow:hidden; background:#eff1f3;
    }
    .skeleton::after{
      content:""; position:absolute; inset:0;
      background:linear-gradient(90deg, rgba(238,240,243,0) 0%, rgba(255,255,255,.75) 50%, rgba(238,240,243,0) 100%);
      transform:translateX(-100%); animation:shimmer 1.4s infinite;
    }
    @keyframes shimmer{100%{transform:translateX(100%)}}

    /* ===== Cartes produits ===== */
    .product-card{transition:transform .2s ease, box-shadow .2s ease}
    .product-card:hover{transform:translateY(-2px); box-shadow:0 10px 30px rgba(0,0,0,.08)}
    .badge-new{background:#111}

    /* ===== Util ===== */
    .section-lede{max-width:920px;margin:0 auto 1.25rem;opacity:.8}
  </style>
</head>
<body>

  <!-- SVG symbols (icônes) -->
  <svg xmlns="http://www.w3.org/2000/svg" style="display:none">
    <defs>
      <symbol id="search" viewBox="0 0 24 24"><path fill="currentColor" d="M21.71 20.29 18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.39ZM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7Z"/></symbol>
      <symbol id="cart" viewBox="0 0 24 24"><path fill="currentColor" d="M8.5 19a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 8.5 19ZM19 16H7a1 1 0 0 1 0-2h8.49a3 3 0 0 0 2.89-2.18l1.58-5.55A1 1 0 0 0 19 5H6.74a3 3 0 0 0-2.82-2H3a1 1 0 0 0 0 2h.92l.16.55 1.64 5.74A3 3 0 0 0 7 18h12a1 1 0 0 0 0-2Z"/></symbol>
      <symbol id="heart" viewBox="0 0 24 24"><path fill="currentColor" d="M20.16 4.61A6.27 6.27 0 0 0 12 4a6.27 6.27 0 0 0-8.16 9.48l7.45 7.45a1 1 0 0 0 1.42 0l7.45-7.45a6.27 6.27 0 0 0 0-8.87Z"/></symbol>
      <symbol id="user" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></symbol>
      <symbol id="bank" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3 3 7v2h18V7l-9-4Zm-7 6v8H3v2h18v-2h-2V9H5Zm2 2h2v6H7v-6Zm4 0h2v6h-2v-6Zm4 0h2v6h-2v-6Z"/></symbol>
      <symbol id="star" viewBox="0 0 24 24"><path fill="currentColor" d="m12 17.27 6.18 3.73-1.64-7.03L21 9.24l-7.19-.62L12 2 10.19 8.62 3 9.24l4.46 4.73-1.64 7.03L12 17.27Z"/></symbol>
    </defs>
  </svg>

  <!-- FOMO -->
  <div class="fomo-bar py-2" id="fomoBar">
    <div class="container d-flex flex-wrap justify-content-between align-items-center">
      <div class="d-flex align-items-center gap-2">
        <span class="badge-dot"></span>
        <span><strong id="watching">18</strong> personnes consultent cette page</span>
      </div>
      <div>-10% première commande : <strong>GF-FIRST10</strong> · se termine dans <strong id="countdown">00:00:00</strong></div>
    </div>
  </div>

  <!-- HEADER (mêmes règles que l'index) -->
  <nav class="navbar navbar-light navbar-expand-lg text-uppercase fs-6 p-3 border-bottom align-items-center fixed-top bg-white" id="siteNav" style="top: var(--fomoH)">
    <div class="container-fluid nav-grid">
      <a class="navbar-brand nav-brand" href="index.html">GF Store</a>

      <!-- Panier mobile : à droite, juste à gauche du menu -->
      <a class="nav-cart-right d-lg-none position-relative" href="#" data-bs-toggle="offcanvas" data-bs-target="#offcanvasCart" aria-label="Ouvrir le panier">
        <svg width="26" height="26"><use xlink:href="#cart"/></svg>
        <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-dark cart-count">0</span>
      </a>

      <!-- Burger (mobile) -->
      <button class="navbar-toggler nav-toggle-right" type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar" aria-label="Ouvrir le menu">
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="offcanvas offcanvas-end" tabindex="-1" id="offcanvasNavbar">
        <div class="offcanvas-header">
          <h5 class="offcanvas-title">Menu</h5>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
        </div>
        <div class="offcanvas-body">
          <ul class="navbar-nav ms-auto gap-3">
            <li class="nav-item"><a class="nav-link" href="index.html#nouveautes">Nouveautés</a></li>
            <li class="nav-item"><a class="nav-link" href="index.html#hommes">Hommes</a></li>
            <li class="nav-item"><a class="nav-link" href="index.html#femmes">Femmes</a></li>
            <li class="nav-item"><a class="nav-link" href="index.html#enfants">Enfants</a></li>
            <li class="nav-item"><a class="nav-link" href="catalogue.html">Catalogue</a></li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" role="button" data-bs-toggle="dropdown">
                <svg width="20" height="20" class="me-1"><use xlink:href="#user"/></svg>Compte
              </a>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="login.html">Se connecter</a></li>
                <li><a class="dropdown-item" href="register.html">Créer un compte</a></li>
                <li><a class="dropdown-item" href="password-reset.html">Mot de passe oublié</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="commande.html">Suivre ma commande</a></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>

      <!-- Icônes desktop -->
      <ul class="list-unstyled d-flex m-0 ms-3 nav-desktop-icons">
        <li class="me-3 d-none d-lg-block"><a href="wishlist.html" aria-label="Wishlist"><svg width="24" height="24"><use xlink:href="#heart"/></svg></a></li>
        <li class="d-none d-lg-block">
          <a href="#" data-bs-toggle="offcanvas" data-bs-target="#offcanvasCart" aria-label="Ouvrir le panier"><svg width="24" height="24"><use xlink:href="#cart"/></svg></a>
          <span class="badge bg-dark ms-1 align-middle cart-count">0</span>
        </li>
      </ul>
    </div>
  </nav>

  <!-- Panier -->
  <div class="offcanvas offcanvas-end" tabindex="-1" id="offcanvasCart">
    <div class="offcanvas-header justify-content-center">
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
    </div>
    <div class="offcanvas-body">
      <h4 class="d-flex justify-content-between align-items-center mb-3">
        <span class="text-primary">Votre panier</span>
        <span class="badge bg-primary rounded-pill cart-count">0</span>
      </h4>
      <p class="text-body-secondary">Votre panier est vide.</p>
      <a class="w-100 btn btn-dark btn-lg mt-3" href="checkout.html">Passer au paiement</a>
    </div>
  </div>

  <!-- HERO Catalogue -->
  <header class="catalog-hero anchor-offset">
    <div class="container">
      <nav aria-label="breadcrumb" class="crumbs mb-2">
        <ol class="breadcrumb justify-content-center">
          <li class="breadcrumb-item"><a class="link-light text-decoration-none" href="index.html">Accueil</a></li>
          <li class="breadcrumb-item active text-white-50" aria-current="page">Catalogue</li>
        </ol>
      </nav>
      <h1 class="display-5 fw-normal mb-1">Catalogue Hiver 2025</h1>
      <p class="mb-0 opacity-75">Doudounes, parkas, mailles & accessoires — <strong>livraison gratuite</strong> en France</p>
    </div>
  </header>

  <main id="content">

    <!-- Filtres -->
    <section class="py-4">
      <div class="container">
        <div class="row g-3 align-items-end">
          <div class="col-lg-4">
            <label class="form-label" for="q">Recherche</label>
            <input id="q" type="search" class="form-control" placeholder="Doudoune, parka, bonnet…">
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label" for="filter">Catégorie</label>
            <select id="filter" class="form-select">
              <option value="all">Tout</option>
              <option value="homme">Hommes</option>
              <option value="femme">Femmes</option>
              <option value="enfant">Enfants</option>
              <option value="accessoires">Accessoires</option>
            </select>
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label" for="sort">Tri</label>
            <select id="sort" class="form-select">
              <option value="relevance">Pertinence</option>
              <option value="price-asc">Prix : croissant</option>
              <option value="price-desc">Prix : décroissant</option>
              <option value="newest">Nouveautés</option>
            </select>
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label" for="min">Prix min (€)</label>
            <input type="number" id="min" class="form-control" placeholder="0" min="0" step="1">
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label" for="max">Prix max (€)</label>
            <input type="number" id="max" class="form-control" placeholder="2000" min="0" step="1">
          </div>

          <div class="col-6 col-lg-2">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="only-new">
              <label class="form-check-label" for="only-new">Nouveaux</label>
            </div>
          </div>
          <div class="col-6 col-lg-2">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="in-stock">
              <label class="form-check-label" for="in-stock">En stock</label>
            </div>
          </div>

          <div class="col-lg-2 ms-auto d-grid">
            <button id="reset" class="btn btn-outline-secondary" type="button">Réinitialiser</button>
          </div>
        </div>

        <!-- Filtres actifs (chips) -->
        <div id="chips" class="d-flex flex-wrap gap-2 mt-3"></div>
      </div>
    </section>

    <!-- Résultats -->
    <section class="pb-5">
      <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div id="count" class="small text-secondary">Chargement…</div>
          <div class="small text-secondary">Retours 30 jours · Support 7j/7</div>
        </div>

        <div id="grid" class="row g-4">
          <!-- Le contenu est injecté par catalogue.js (skeleton puis cartes) -->
        </div>

        <!-- Pagination -->
        <nav class="d-flex justify-content-center mt-4" aria-label="Pagination catalogue">
          <ul id="pager" class="pagination m-0"></ul>
        </nav>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer id="footer" class="border-top">
    <div class="container">
      <div class="row py-5">
        <div class="col-md-4">
          <h5 class="text-uppercase mb-3">GF Store</h5>
          <p>Expédition & retours gratuits. Service client dédié.</p>
        </div>
        <div class="col-6 col-md-2">
          <h6 class="text-uppercase mb-3">Boutique</h6>
          <ul class="list-unstyled">
            <li><a href="index.html#hommes">Hommes</a></li>
            <li><a href="index.html#femmes">Femmes</a></li>
            <li><a href="index.html#enfants">Enfants</a></li>
            <li><a href="catalogue.html">Catalogue</a></li>
          </ul>
        </div>
        <div class="col-6 col-md-3">
          <h6 class="text-uppercase mb-3">Aide</h6>
          <ul class="list-unstyled">
            <li><a href="livraison.html">Livraison</a></li>
            <li><a href="retours.html">Retours & échanges</a></li>
            <li><a href="faq.html">FAQ</a></li>
            <li><a href="contact.html">Contact</a></li>
          </ul>
        </div>
        <div class="col-md-3">
          <h6 class="text-uppercase mb-3">Newsletter</h6>
          <form class="d-flex gap-2">
            <input type="email" class="form-control" placeholder="Votre email" required>
            <button class="btn btn-dark" type="submit">OK</button>
          </form>
          <small class="text-secondary d-block mt-2">En vous inscrivant, vous acceptez notre politique de confidentialité.</small>
        </div>
      </div>
      <div class="d-flex flex-wrap justify-content-between align-items-center py-3 border-top small">
        <span>© 2025 GF Store. Tous droits réservés.</span>
        <span>Livraison & retours gratuits • Service client dédié</span>
      </div>
    </div>
  </footer>

  <!-- JS base -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/js/bootstrap.bundle.min.js" crossorigin="anonymous"></script>

  <!-- Offsets FOMO + nav + compteur + wobble (mêmes helpers que l’index) -->
  <script>
    function updateOffsets(){
      const nav = document.getElementById('siteNav');
      const fomo = document.getElementById('fomoBar');
      const navH = nav ? nav.offsetHeight : 56;
      const fomoH = fomo ? fomo.offsetHeight : 0;
      document.documentElement.style.setProperty('--navH', navH + 'px');
      document.documentElement.style.setProperty('--fomoH', fomoH + 'px');
      document.body.classList.add('has-fixed-nav');
    }
    window.addEventListener('resize', ()=> requestAnimationFrame(updateOffsets));

    function updateCountdown(){
      const now = new Date();
      const end = new Date(); end.setHours(23,59,59,999);
      const diff = Math.max(0, end - now);
      const h = String(Math.floor(diff/3.6e6)).padStart(2,'0');
      const m = String(Math.floor((diff%3.6e6)/6e4)).padStart(2,'0');
      const s = String(Math.floor((diff%6e4)/1000)).padStart(2,'0');
      const el = document.getElementById('countdown');
      if(el) el.textContent = `${h}:${m}:${s}`;
    }
    setInterval(updateCountdown, 1000);

    const watchingEl = document.getElementById('watching');
    function wobble(){
      if(!watchingEl) return;
      const base = 20; const noise = Math.floor(Math.random()*8) - 3;
      watchingEl.textContent = base + noise;
    }
    setInterval(wobble, 4000);

    window.addEventListener('load', ()=>{ updateOffsets(); updateCountdown(); wobble(); });
  </script>

  <!-- Catalogue logic + App globale -->
  <script src="catalogue.js"></script>
  <script src="app.js"></script>
</body>
</html>
