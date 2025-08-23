// checkout.js — GF Store → Apps Script → Telegram
(() => {
  // === WebApp Apps Script (ton URL de déploiement) ===
  const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbypa62g6lhlchWMayVWYyRh2TGc--bBdqNMag2ro1Ne1SDMVT5bHzy7pvooG3ZnsGAx/exec";
  const CART_KEY = "gf_cart";

  // --- Utils DOM ---
  const $ = (s) => document.querySelector(s);
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  const text = (id) => (document.getElementById(id)?.textContent || "").trim();

  // Petit toast compatible avec ton HTML existant (#toast)
  const toast = (msg) => {
    const t = document.getElementById("toast");
    if (!t) { console.log(msg); return; }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1600);
  };

  // Lire le panier local
  const getCart = () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  };

  // Méthode sélectionnée (sepa/crypto)
  const currentMethod = () =>
    document.querySelector('.m[role="tab"][aria-selected="true"]')?.dataset.method || "sepa";

  // Convertir un File → base64 (sans préfixe data:)
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const b64 = s.replace(/^data:.*;base64,/, "");
      resolve(b64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  // Construire le payload attendu par l'Apps Script
  async function buildPayload({ method }) {
    const orderId = text("orderId");
    const cart = getCart();

    const base = {
      orderId,
      method,
      amount: method === "crypto" ? val("amountNow") : val("amountNowBank"),
      // Infos client
      name: val("name"),
      email: val("email"),
      phone: val("phone"),
      address: val("address"),
      city: val("city"),
      zip: val("zip"),
      country: val("country"),
      // Détail panier (optionnel mais utile)
      cart
    };

    if (method === "crypto") {
      base.ccy = val("ccy");
      base.txid = val("txid");            // le hash/TxID
      base.wallet = val("wallet");        // utile pour le suivi
      base.ccy_amount = val("ccyAmt");    // montant en ccy affiché
    } else if (method === "sepa") {
      base.ref = val("vref");
      base.iban = val("iban");
      base.swift = val("swift");

      // Preuve jointe (si sélectionnée)
      const input = document.getElementById("proofInput");
      const file = input?.files?.[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error("Fichier trop volumineux (>10 Mo)");
        }
        base.file_b64 = await fileToBase64(file);
        base.file_name = file.name;
        base.mime_type = file.type || "application/octet-stream";
      }
    }

    return base;
  }

  // Envoi POST → Apps Script (x-www-form-urlencoded pour éviter le preflight CORS)
  function postToAppsScript(payload) {
    const params = new URLSearchParams();
    // On utilise le champ _json que ton Apps Script sait décoder (parseIncoming)
    params.set("_json", JSON.stringify(payload));

    // mode: 'no-cors' => la requête part toujours; on ne lit pas la réponse (opaque)
    return fetch(WEBAPP_URL, {
      method: "POST",
      mode: "no-cors",
      body: params
    });
  }

  // Anti double-envoi
  let sentCrypto = false;
  let sentSepa = false;

  // === Hook: bouton "J’ai envoyé le paiement" (CRYPTO) ===
  const btnCrypto = document.getElementById("confirmCrypto");
  if (btnCrypto) {
    btnCrypto.addEventListener("click", async () => {
      try {
        if (sentCrypto) return;
        if (currentMethod() !== "crypto") return;

        // Sanity minimal : champs client et txid
        if (!val("name") || !val("email") || !val("address") || !val("city") || !val("zip")) {
          toast("Veuillez compléter vos informations.");
          return;
        }
        if (!val("txid")) {
          toast("TxID requis.");
          return;
        }

        const payload = await buildPayload({ method: "crypto" });
        await postToAppsScript(payload);
        sentCrypto = true;
        toast("Hash crypto envoyé à la vérif ✅");
      } catch (e) {
        console.error(e);
        toast("Erreur d’envoi crypto");
      }
    });
  }

  // === Hook: bouton "J’ai effectué le virement" (SEPA) ===
  const btnSepa = document.getElementById("confirmBank");
  if (btnSepa) {
    btnSepa.addEventListener("click", async () => {
      try {
        if (sentSepa) return;
        if (currentMethod() !== "sepa") return;

        // Sanity minimal : champs client + preuve
        if (!val("name") || !val("email") || !val("address") || !val("city") || !val("zip")) {
          toast("Veuillez compléter vos informations.");
          return;
        }
        const input = document.getElementById("proofInput");
        if (!input?.files?.length) {
          toast("Preuve de virement requise.");
          return;
        }

        const payload = await buildPayload({ method: "sepa" });
        await postToAppsScript(payload);
        sentSepa = true;
        toast("Preuve SEPA envoyée à la vérif ✅");
      } catch (e) {
        console.error(e);
        toast("Erreur d’envoi SEPA");
      }
    });
  }

  // (Optionnel) Tu peux aussi pousser un récap à la finalisation de commande :
  // document.getElementById("placeOrder")?.addEventListener("click", async () => {
  //   try {
  //     const method = currentMethod();
  //     const payload = await buildPayload({ method });
  //     payload.stage = "order_finalized";
  //     await postToAppsScript(payload);
  //   } catch (e) { console.warn("Order finalize push skipped:", e); }
  // });
})();
