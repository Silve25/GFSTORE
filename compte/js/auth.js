/* GF Store — auth.js (version CORS-safe)
   Frontend minimal pour Google Apps Script (Sheet "Utilisateurs")
   Pages prévues :
   - /compte/login.html             -> form#loginForm   (input[name=email], input[name=password])
   - /compte/register.html          -> form#registerForm(input[name=name], input[name=email], input[name=password])
   - /compte/password-reset.html    -> form#resetRequestForm(email) + form#resetForm(email, token, newPassword)
   - /compte/password-change.html   -> form#changePasswordForm(oldPassword, newPassword)
   - /compte/profile.html           -> form#profileForm(name, email[readonly], phone, address, city, zip, country, role)
   - /compte/index.html             -> tableau de bord (affiche la session, bouton #logoutBtn)

   Stockage session : localStorage["GF_SESSION"] = { email, name, loggedAt }
*/
(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  // URL WebApp (ton nouveau déploiement V3)
  const API_BASE = "https://script.google.com/macros/s/AKfycbx4FDloNE_32UzqzuZXfIK_4LZxIpO3oVAY1D5CnNURWhE7L1UA7n2xWYnMQPtBRauJ/exec";
  // Doit correspondre à CONFIG.API_KEY côté Apps Script
  const API_KEY  = "GFSECRET123";

  // Racine (GitHub Pages friendly)
  const ROOT = (() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const isProject = location.host.endsWith("github.io") && parts.length > 0;
    return isProject ? `/${parts[0]}/` : "/";
  })();
  const PATH_COMPTE = `${ROOT}compte/`;

  const ROUTES = {
    dashboard: PATH_COMPTE + "index.html",
    login:     PATH_COMPTE + "login.html",
    register:  PATH_COMPTE + "register.html",
    profile:   PATH_COMPTE + "profile.html",
  };

  // ======================
  // UTILITAIRES
  // ======================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $     = (sel, root) => (root || document).querySelector(sel);
  const $all  = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function setDisabled(form, on) {
    if (!form) return;
    $all("input,button,select,textarea", form).forEach(el => el.disabled = !!on);
  }

  function showMsg(target, text, ok=false) {
    if (!target) return;
    target.textContent = text || "";
    target.style.color = ok ? "#16a34a" : "#dc2626";
    target.style.display = text ? "block" : "none";
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());
  }

  // ======================
  // SESSION (localStorage)
  // ======================
  const SKEY = "GF_SESSION";

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SKEY) || "null"); }
    catch { return null; }
  }
  function setSession(sess) {
    localStorage.setItem(SKEY, JSON.stringify(sess || null));
  }
  function clearSession() { localStorage.removeItem(SKEY); }

  function requireAuthOrRedirect() {
    const s = getSession();
    if (!s || !s.email) {
      location.href = ROUTES.login + "?next=" + encodeURIComponent(location.href);
      return false;
    }
    return true;
  }

  // ======================
  // APPELS API (Apps Script)
  // ======================
  async function apiGet(action, params = {}) {
    const u = new URL(API_BASE);
    u.searchParams.set("action", action);
    u.searchParams.set("key", API_KEY);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
    const r = await fetch(u.toString(), {
      method: "GET",
      cache: "no-store"
      // Pas d'en-têtes custom pour rester « simple request »
    });
    if (!r.ok) throw new Error(`GET ${action} HTTP ${r.status}`);
    return r.json();
  }

  // IMPORTANT: POST en x-www-form-urlencoded -> évite le prévol CORS
  async function apiPost(action, body = {}) {
    const payload = { action, key: API_KEY, ...body };
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) {
      form.append(k, (v && typeof v === "object") ? JSON.stringify(v) : String(v));
    }
    const r = await fetch(API_BASE, {
      method: "POST",
      body: form
      // Pas de Content-Type explicite, le navigateur mettra application/x-www-form-urlencoded
    });
    if (!r.ok) throw new Error(`POST ${action} HTTP ${r.status}`);
    return r.json();
  }

  // Wrappers
  const API = {
    listUsers:     () => apiGet("users"),
    register:      ({ name, email, password }) => apiPost("register", { name, email, password }),
    login:         ({ email, password }) => apiPost("login", { email, password }),
    resetRequest:  ({ email }) => apiPost("reset-request", { email }),
    reset:         ({ email, token, newPassword }) => apiPost("reset", { email, token, newPassword }),
    changePassword:({ email, oldPassword, newPassword }) => apiPost("change", { email, oldPassword, newPassword }),
    updateProfile: ({ email, updates }) => apiPost("update-profile", { email, updates }),
    ping:          () => apiGet("ping"),
  };

  // ======================
  // FORM WIRING
  // ======================
  async function wireLogin() {
    const form = $("#loginForm"); if (!form) return;
    const msg = $("#loginMsg");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(msg, ""); setDisabled(form, true);
      try {
        const email = form.email?.value?.trim();
        const password = form.password?.value || "";
        if (!isEmail(email)) throw new Error("Email invalide.");
        if (!password) throw new Error("Mot de passe requis.");
        const resp = await API.login({ email, password });
        if (!resp || !resp.ok) throw new Error(resp?.error || "Échec de connexion.");
        // Session
        setSession({ email: resp.user?.email || email, name: resp.user?.name || "", loggedAt: Date.now() });
        showMsg(msg, "Connexion réussie.", true);
        // Redirection
        const url = new URL(location.href);
        const next = url.searchParams.get("next") || ROUTES.dashboard;
        await sleep(300);
        location.href = next;
      } catch (err) {
        showMsg(msg, err.message || "Erreur.");
      } finally {
        setDisabled(form, false);
      }
    });
  }

  async function wireRegister() {
    const form = $("#registerForm"); if (!form) return;
    const msg = $("#registerMsg");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(msg, ""); setDisabled(form, true);
      try {
        const name = form.name?.value?.trim() || "";
        const email = form.email?.value?.trim();
        const password = form.password?.value || "";
        if (!name) throw new Error("Nom requis.");
        if (!isEmail(email)) throw new Error("Email invalide.");
        if (String(password).length < 6) throw new Error("Mot de passe : 6 caractères minimum.");
        const resp = await API.register({ name, email, password });
        if (!resp || !resp.ok) throw new Error(resp?.error || "Inscription impossible.");
        // Auto-login
        setSession({ email, name, loggedAt: Date.now() });
        showMsg(msg, "Compte créé ! Redirection…", true);
        await sleep(400);
        location.href = ROUTES.dashboard;
      } catch (err) {
        showMsg(msg, err.message || "Erreur.");
      } finally {
        setDisabled(form, false);
      }
    });
  }

  async function wireResetRequest() {
    const form = $("#resetRequestForm"); if (!form) return;
    const msg = $("#resetRequestMsg");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(msg, ""); setDisabled(form, true);
      try {
        const email = form.email?.value?.trim();
        if (!isEmail(email)) throw new Error("Email invalide.");
        const resp = await API.resetRequest({ email });
        if (!resp || !resp.ok) throw new Error(resp?.error || "Demande impossible.");
        // Message neutre (ne révèle pas l'existence de l'email)
        showMsg(msg, "Si un compte existe pour cet email, un code a été envoyé.", true);
      } catch (err) {
        showMsg(msg, err.message || "Erreur.");
      } finally {
        setDisabled(form, false);
      }
    });
  }

  async function wireResetDo() {
    const form = $("#resetForm"); if (!form) return;
    const msg = $("#resetMsg");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(msg, ""); setDisabled(form, true);
      try {
        const email = form.email?.value?.trim();
        const token = form.token?.value?.trim();
        const newPassword = form.newPassword?.value || "";
        if (!isEmail(email)) throw new Error("Email invalide.");
        if (!/^\d{6}$/.test(String(token||""))) throw new Error("Code invalide.");
        if (String(newPassword).length < 6) throw new Error("Nouveau mot de passe trop court.");
        const resp = await API.reset({ email, token, newPassword });
        if (!resp || !resp.ok) throw new Error(resp?.error || "Réinitialisation impossible.");
        showMsg(msg, "Mot de passe réinitialisé. Vous pouvez vous connecter.", true);
        await sleep(400);
        location.href = ROUTES.login;
      } catch (err) {
        showMsg(msg, err.message || "Erreur.");
      } finally {
        setDisabled(form, false);
      }
    });
  }

  async function wireChangePassword() {
    const form = $("#changePasswordForm"); if (!form) return;
    const msg = $("#changeMsg");
    if (!requireAuthOrRedirect()) return;
    const sess = getSession();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(msg, ""); setDisabled(form, true);
      try {
        const oldPassword = form.oldPassword?.value || "";
        const newPassword = form.newPassword?.value || "";
        if (String(newPassword).length < 6) throw new Error("Nouveau mot de passe trop court (≥6).");
        const resp = await API.changePassword({ email: sess.email, oldPassword, newPassword });
        if (!resp || !resp.ok) throw new Error(resp?.error || "Impossible de changer le mot de passe.");
        showMsg(msg, "Mot de passe mis à jour.", true);
        form.reset();
      } catch (err) {
        showMsg(msg, err.message || "Erreur.");
      } finally {
        setDisabled(form, false);
      }
    });
  }

  async function wireProfile() {
    const form = $("#profileForm"); if (!form) return;
    const msg = $("#profileMsg");
    if (!requireAuthOrRedirect()) return;
    const sess = getSession();

    // Pré-remplissage depuis la base
    try {
      const list = await API.listUsers(); // renvoie un tableau d'objets "sanitisés"
      const me = (list || []).find(u => (u.email || "").toLowerCase() === (sess.email || "").toLowerCase());
      if (me) {
        if (form.name)    form.name.value    = me.name || "";
        if (form.email)   form.email.value   = me.email || "";
        if (form.phone)   form.phone.value   = me.phone || "";
        if (form.address) form.address.value = me.address || "";
        if (form.city)    form.city.value    = me.city || "";
        if (form.zip)     form.zip.value     = me.zip || "";
        if (form.country) form.country.value = me.country || "";
        if (form.role)    form.role.value    = me.role || "";
      } else {
        if (form.email) form.email.value = sess.email || "";
        if (form.name)  form.name.value  = sess.name || "";
      }
    } catch (e) {
      // Silencieux
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(msg, ""); setDisabled(form, true);
      try {
        const updates = {
          name:    form.name?.value?.trim() || "",
          phone:   form.phone?.value?.trim() || "",
          address: form.address?.value?.trim() || "",
          city:    form.city?.value?.trim() || "",
          zip:     form.zip?.value?.trim() || "",
          country: form.country?.value?.trim() || "",
          role:    form.role?.value?.trim() || ""
        };
        const resp = await API.updateProfile({ email: sess.email, updates });
        if (!resp || !resp.ok) throw new Error(resp?.error || "Mise à jour impossible.");
        showMsg(msg, "Profil mis à jour.", true);
        setSession({ ...sess, name: updates.name || sess.name, updatedAt: Date.now() });
      } catch (err) {
        showMsg(msg, err.message || "Erreur.");
      } finally {
        setDisabled(form, false);
      }
    });
  }

  function wireDashboard() {
    const who = $("#sessionWho");
    const s = getSession();
    if (who) {
      who.textContent = s?.email ? (s.name ? `${s.name} (${s.email})` : s.email) : "Non connecté";
    }
    const onlyWhenAuth = $all("[data-auth=required]");
    onlyWhenAuth.forEach(el => { el.style.display = s?.email ? "" : "none"; });

    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        clearSession();
        location.href = ROUTES.login;
      });
    }
  }

  // ======================
  // INIT
  // ======================
  async function init() {
    // Brancher les pages si présentes
    wireLogin();
    wireRegister();
    wireResetRequest();
    wireResetDo();
    wireChangePassword();
    wireProfile();
    wireDashboard();

    // Badge d'état session (optionnel)
    const s = getSession();
    const state = $("#accountState");
    if (state) state.textContent = s?.email ? "Connecté" : "Déconnecté";
  }

  // Expose global
  window.GFAuth = {
    init,
    getSession,
    clearSession,
    api: API
  };

  document.addEventListener("DOMContentLoaded", init);
})();
