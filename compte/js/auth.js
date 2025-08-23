/* GF Store — auth.js (CORS-safe, URL-encoded)
   Back-end attendu (Apps Script, version corrigée) :
   - GET  action=ping | users | exists
   - POST action=register | login | change | update-profile | reset-request | reset
*/

(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  // ⚠️ Remets ton URL de déploiement Web App V5 si besoin
  const API_BASE = "https://script.google.com/macros/s/AKfycbx5WPfPCBrykCAPBV8AEsDTQCc2o8UFv_9ClBo8wmUyDxtE8wF8h_x-mWpneDK-igZ0/exec";
  // Clé identique côté Apps Script
  const API_KEY  = "GFSECRET123";

  // Détection racine (GitHub Pages friendly)
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
  // HELPERS UI / FORMS
  // ======================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (s,root) => (root||document).querySelector(s);
  const $all = (s,root)=> Array.from((root||document).querySelectorAll(s));

  function setDisabled(root, on) {
    if (!root) return;
    const nodes = root.tagName ? root.querySelectorAll("input,button,select,textarea") : document.querySelectorAll(root);
    nodes.forEach(el => el.disabled = !!on);
  }
  function showMsg(el, txt, ok=false){
    if(!el) return;
    el.textContent = txt || "";
    el.style.display = txt ? "block" : "none";
    el.style.color = ok ? "#16a34a" : "#dc2626";
  }
  function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim()); }

  // ======================
  // SESSION (localStorage)
  // ======================
  const SKEY = "GF_SESSION";
  function getSession(){ try{return JSON.parse(localStorage.getItem(SKEY)||"null")}catch{return null} }
  function setSession(sess){ localStorage.setItem(SKEY, JSON.stringify(sess||null)); }
  function clearSession(){ localStorage.removeItem(SKEY); }
  function requireAuthOrRedirect(){
    const s=getSession();
    if(!s || !s.email){
      location.href = ROUTES.login + "?next=" + encodeURIComponent(location.href);
      return false;
    }
    return true;
  }

  // ======================
  // API (urlencoded -> pas de prévol CORS)
  // ======================
  async function apiGet(action, params = {}) {
    const u = new URL(API_BASE);
    u.searchParams.set("action", action);
    u.searchParams.set("key", API_KEY);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
    const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
    if (!r.ok) throw new Error(`GET ${action} HTTP ${r.status}`);
    return r.json();
  }

  async function apiPost(action, body = {}) {
    const payload = { action, key: API_KEY, ...body };
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) {
      form.append(k, (v && typeof v === "object") ? JSON.stringify(v) : String(v));
    }
    const r = await fetch(API_BASE, { method: "POST", body: form });
    if (!r.ok) throw new Error(`POST ${action} HTTP ${r.status}`);
    return r.json();
  }

  const API = {
    // GET
    listUsers: () => apiGet("users"),
    ping:      () => apiGet("ping"),
    exists:    (email) => apiGet("exists", { email }),

    // POST (classiques)
    register:  ({ name, email, password, phone, address, city, zip, country }) =>
                apiPost("register", { name, email, password, phone, address, city, zip, country }),
    login:     ({ email, password }) =>
                apiPost("login",  { email, password }),

    // Changement de mot de passe AVEC ancien mot de passe (page compte)
    changePassword:({ email, oldPassword, newPassword }) =>
                apiPost("change", { email, oldPassword, newPassword }),

    // Mise à jour du profil (y compris nouveau mot de passe SANS ancien — utilisé pour reset)
    updateProfile: ({ email, updates }) =>
                apiPost("update-profile", { email, updates }),

    // Legacy (encore supporté par le backend mais optionnel dans le nouveau flux)
    resetRequest:  ({ email }) => apiPost("reset-request", { email }),
    reset:         ({ email, token, newPassword }) => apiPost("reset", { email, token, newPassword }),
  };

  // ======================
  // PAGES : WIRING
  // ======================

  // -------- Connexion
  function wireLogin(){
    const form = $("#loginForm"); if(!form) return;
    const msg  = $("#loginMsg");
    form.addEventListener("submit", async (e)=>{
      e.preventDefault(); setDisabled(form,true); showMsg(msg,"");
      try{
        const email = form.email?.value?.trim();
        const password = form.password?.value || "";
        if(!isEmail(email)) throw new Error("Email invalide.");
        if(!password) throw new Error("Mot de passe requis.");
        const resp = await API.login({ email, password });
        if(!resp || !resp.ok) throw new Error(resp?.error || "Échec de connexion.");
        setSession({ email: resp.user?.email || email, name: resp.user?.name || "", loggedAt: Date.now() });
        showMsg(msg, "Connexion réussie.", true);
        const url = new URL(location.href);
        const next = url.searchParams.get("next") || ROUTES.dashboard;
        await sleep(200);
        location.href = next;
      }catch(err){ showMsg(msg, err.message || "Erreur."); }
      finally{ setDisabled(form,false); }
    });
  }

  // -------- Inscription
  function wireRegister(){
    const form = $("#registerForm"); if(!form) return;
    const msg  = $("#registerMsg");
    form.addEventListener("submit", async (e)=>{
      e.preventDefault(); setDisabled(form,true); showMsg(msg,"");
      try{
        const name = form.name?.value?.trim() || "";
        const email = form.email?.value?.trim();
        const password = form.password?.value || "";
        const phone = form.phone?.value?.trim() || "";
        const address = form.address?.value?.trim() || "";
        const city = form.city?.value?.trim() || "";
        const zip = form.zip?.value?.trim() || "";
        const country = form.country?.value?.trim() || "";
        if(!name) throw new Error("Nom requis.");
        if(!isEmail(email)) throw new Error("Email invalide.");
        if(String(password).length < 6) throw new Error("Mot de passe : 6 caractères minimum.");

        const resp = await API.register({ name, email, password, phone, address, city, zip, country });
        if(!resp || !resp.ok) {
          const code = resp?.error || "";
          if (code === "EMAIL_EXISTS") throw new Error("Cet email est déjà utilisé.");
          if (code === "PASSWORD_TOO_SHORT") throw new Error("Mot de passe trop court (≥ 6).");
          throw new Error(resp?.error || "Inscription impossible.");
        }
        setSession({ email, name, loggedAt: Date.now() });
        showMsg(msg, "Compte créé ! Redirection…", true);
        await sleep(300);
        location.href = ROUTES.dashboard;
      }catch(err){ showMsg(msg, err.message || "Erreur."); }
      finally{ setDisabled(form,false); }
    });
  }

  // -------- Nouveau flux : Vérif email -> puis définir un nouveau mot de passe (sans code)
  function wireResetVerifyAndSet(){
    // Cette fonction s’adapte à ta page password-reset :
    // - Si un bouton/forme "resetRequestForm" existe → il est utilisé comme vérif email (sans envoi de code)
    // - Le formulaire "resetForm" applique le nouveau mot de passe via update-profile
    const verifyForm = $("#resetRequestForm") || $("#emailVerifyForm"); // compat
    const verifyMsg  = $("#resetRequestMsg")  || $("#emailVerifyMsg");  // compat
    const resetForm  = $("#resetForm");
    const resetMsg   = $("#resetMsg");

    if(!resetForm) return; // si la page n'est pas une page de reset, on sort

    // Si l'email est fourni via query (ex: ?email=test@ex.com), on préremplit
    const urlEmail = new URL(location.href).searchParams.get("email");
    const emailInput1 = verifyForm?.email || $("#email");
    const emailInput2 = resetForm.email || $("#email2");
    if(urlEmail){
      if(emailInput1 && !emailInput1.value) emailInput1.value = urlEmail;
      if(emailInput2 && !emailInput2.value) emailInput2.value = urlEmail;
    }
    // Miroir : si on tape dans le champ de l'étape 1, on copie dans l'étape 2 (si vide)
    if(emailInput1 && emailInput2){
      emailInput1.addEventListener("input", ()=>{ if(!emailInput2.value) emailInput2.value = emailInput1.value; });
    }

    // 1) Vérification d'email (nouveau flux) — aucune génération/lecture de code
    if(verifyForm){
      verifyForm.addEventListener("submit", async (e)=>{
        e.preventDefault(); setDisabled(verifyForm,true); showMsg(verifyMsg,"");
        try{
          const email = (verifyForm.email?.value || emailInput1?.value || "").trim();
          if(!isEmail(email)) throw new Error("Email invalide.");
          const resp = await API.exists(email);
          if(!resp || !resp.ok) throw new Error(resp?.error || "Erreur de vérification.");
          if(!resp.exists){
            throw new Error("Aucun compte trouvé pour cet email.");
          }
          // OK -> on "débloque" la 2e étape
          showMsg(verifyMsg, "✔️ Email vérifié. Vous pouvez définir un nouveau mot de passe ci-dessous.", true);
          // Active le formulaire de reset
          setDisabled(resetForm, false);
          // Copie l'email si besoin
          if(emailInput2 && !emailInput2.value) emailInput2.value = email;
          // Focus le champ mot de passe
          resetForm.newPassword?.focus?.();
        }catch(err){ showMsg(verifyMsg, err.message || "Erreur."); }
        finally{ setDisabled(verifyForm,false); }
      });

      // Par défaut, bloque la zone "reset" tant que l'email n'est pas vérifié
      setDisabled(resetForm, true);
    }

    // 2) Application du nouveau mot de passe (sans code)
    resetForm.addEventListener("submit", async (e)=>{
      e.preventDefault(); setDisabled(resetForm,true); showMsg(resetMsg,"");
      try{
        const email = (resetForm.email?.value || emailInput2?.value || emailInput1?.value || "").trim();
        const newPassword = resetForm.newPassword?.value || "";
        const newPassword2 = $("#newPassword2")?.value || "";
        if(!isEmail(email)) throw new Error("Email invalide.");
        if(newPassword.length < 6) throw new Error("Mot de passe trop court (≥ 6).");
        if(newPassword2 && newPassword !== newPassword2) throw new Error("Les mots de passe ne correspondent pas.");

        // On utilise update-profile avec updates.password (sans ancien mot de passe)
        const resp = await API.updateProfile({
          email,
          updates: { password: newPassword }
        });
        if(!resp || !resp.ok){
          const code = resp?.error || "";
          if (code === "NOT_FOUND") throw new Error("Compte introuvable.");
          if (code === "PASSWORD_TOO_SHORT") throw new Error("Mot de passe trop court (≥ 6).");
          if (code === "NO_UPDATES") throw new Error("Aucun champ à mettre à jour.");
          throw new Error(resp?.error || "Impossible de mettre à jour le mot de passe.");
        }

        showMsg(resetMsg, "Mot de passe mis à jour. Vous pouvez vous connecter.", true);
        await sleep(400);
        location.href = ROUTES.login + "?email=" + encodeURIComponent(email);
      }catch(err){ showMsg(resetMsg, err.message || "Erreur."); }
      finally{ setDisabled(resetForm,false); }
    });
  }

  // -------- Ancien flux (toujours supporté au cas où ta page legacy est encore en prod)
  function wireResetLegacy(){
    const form1 = $("#resetRequestForm"); // envoi de code
    const msg1  = $("#resetRequestMsg");
    const form2 = $("#resetForm");        // saisie du code + nouveau pass
    const msg2  = $("#resetMsg");

    // Si la page est déjà câblée avec le nouveau flux via wireResetVerifyAndSet(),
    // on ne recâble PAS le legacy (pour éviter double listeners).
    if (form1 && form1.dataset.__wiredNewFlow) return;

    if(form1){
      form1.addEventListener("submit", async (e)=>{
        e.preventDefault(); setDisabled(form1,true); showMsg(msg1,"");
        try{
          const email = form1.email?.value?.trim();
          if(!isEmail(email)) throw new Error("Email invalide.");
          const resp = await API.resetRequest({ email });
          if(!resp || !resp.ok) throw new Error(resp?.error || "Demande impossible.");
          showMsg(msg1, "Si un compte existe pour cet email, un code a été envoyé.", true);
          // miroir sur étape 2 si vide
          if(form2?.email && !form2.email.value) form2.email.value = email;
        }catch(err){ showMsg(msg1, err.message || "Erreur."); }
        finally{ setDisabled(form1,false); }
      });
    }
    if(form2){
      form2.addEventListener("submit", async (e)=>{
        e.preventDefault(); setDisabled(form2,true); showMsg(msg2,"");
        try{
          const email = form2.email?.value?.trim();
          const token = form2.token?.value?.trim();
          const newPassword = form2.newPassword?.value || "";
          if(!isEmail(email)) throw new Error("Email invalide.");
          if(!/^\d{6}$/.test(String(token||""))) throw new Error("Code invalide.");
          if(String(newPassword).length < 6) throw new Error("Nouveau mot de passe trop court.");
          const resp = await API.reset({ email, token, newPassword });
          if(!resp || !resp.ok) {
            const code = resp?.error || "";
            if (code === "INVALID_TOKEN") throw new Error("Code expiré ou incorrect.");
            if (code === "PASSWORD_TOO_SHORT") throw new Error("Mot de passe trop court (≥ 6).");
            throw new Error(resp?.error || "Réinitialisation impossible.");
          }
          showMsg(msg2, "Mot de passe réinitialisé. Vous pouvez vous connecter.", true);
          await sleep(300);
          location.href = ROUTES.login;
        }catch(err){ showMsg(msg2, err.message || "Erreur."); }
        finally{ setDisabled(form2,false); }
      });
    }
  }

  // -------- Page Profil (edition infos + peut aussi changer le mot de passe via updates.password)
  function wireProfile(){
    const form = $("#profileForm"); if(!form) return;
    const msg  = $("#profileMsg");
    if(!requireAuthOrRedirect()) return;
    const sess = getSession();

    // Pré-remplissage
    (async()=>{
      try{
        const list = await API.listUsers(); // tableau
        if (Array.isArray(list)) {
          const me = list.find(u => (u.email||'').toLowerCase() === (sess.email||'').toLowerCase());
          if(me){
            if(form.name)    form.name.value    = me.name || "";
            if(form.email)   form.email.value   = me.email || "";
            if(form.phone)   form.phone.value   = me.phone || "";
            if(form.address) form.address.value = me.address || "";
            if(form.city)    form.city.value    = me.city || "";
            if(form.zip)     form.zip.value     = me.zip || "";
            if(form.country) form.country.value = me.country || "";
            if(form.role)    form.role.value    = me.role || "";
            return;
          }
        }
        // fallback
        if(form.email) form.email.value = sess.email || "";
        if(form.name)  form.name.value  = sess.name || "";
      }catch{/* ignore */}
    })();

    form.addEventListener("submit", async (e)=>{
      e.preventDefault(); setDisabled(form,true); showMsg(msg,"");
      try{
        const updates = {
          name: form.name?.value?.trim() || "",
          phone: form.phone?.value?.trim() || "",
          address: form.address?.value?.trim() || "",
          city: form.city?.value?.trim() || "",
          zip: form.zip?.value?.trim() || "",
          country: form.country?.value?.trim() || "",
          role: form.role?.value?.trim() || ""
        };

        // Si un champ mot de passe est présent sur ta page profil (optionnel)
        const pw = form.newPassword?.value || "";
        if (pw) updates.password = pw;

        const resp = await API.updateProfile({ email: sess.email, updates });
        if(!resp || !resp.ok) {
          const code = resp?.error || "";
          if (code === "NOT_FOUND") throw new Error("Compte introuvable.");
          if (code === "PASSWORD_TOO_SHORT") throw new Error("Mot de passe trop court (≥ 6).");
          if (code === "NO_UPDATES") throw new Error("Aucun changement détecté.");
          throw new Error(resp?.error || "Mise à jour impossible.");
        }
        showMsg(msg, "Profil mis à jour.", true);
        setSession({ ...sess, name: updates.name || sess.name, updatedAt: Date.now() });
        // Nettoyage éventuel du champ mot de passe
        if (form.newPassword) form.newPassword.value = "";
      }catch(err){ showMsg(msg, err.message || "Erreur."); }
      finally{ setDisabled(form,false); }
    });
  }

  // -------- Changer le mot de passe (avec ancien mdp) — page dédiée
  function wireChangePassword(){
    const form = $("#changePasswordForm"); if(!form) return;
    const msg  = $("#changeMsg");
    if(!requireAuthOrRedirect()) return;
    const sess = getSession();

    form.addEventListener("submit", async (e)=>{
      e.preventDefault(); setDisabled(form,true); showMsg(msg,"");
      try{
        const oldPassword = form.oldPassword?.value || "";
        const newPassword = form.newPassword?.value || "";
        if(String(newPassword).length < 6) throw new Error("Nouveau mot de passe trop court (≥6).");
        const resp = await API.changePassword({ email: sess.email, oldPassword, newPassword });
        if(!resp || !resp.ok) {
          const code = resp?.error || "";
          if (code === "INVALID_CREDENTIALS") throw new Error("Mot de passe actuel incorrect.");
          if (code === "NOT_FOUND") throw new Error("Compte introuvable.");
          if (code === "PASSWORD_TOO_SHORT") throw new Error("Mot de passe trop court (≥ 6).");
          throw new Error(resp?.error || "Impossible de changer le mot de passe.");
        }
        showMsg(msg, "Mot de passe mis à jour.", true);
        form.reset();
      }catch(err){ showMsg(msg, err.message || "Erreur."); }
      finally{ setDisabled(form,false); }
    });
  }

  // -------- Tableau de bord (affichage session / logout)
  function wireDashboard(){
    const who = $("#sessionWho");
    const s = getSession();
    if (who) who.textContent = s?.email ? (s.name ? `${s.name} (${s.email})` : s.email) : "Non connecté";
    $all("[data-auth=required]").forEach(el => el.style.display = s?.email ? "" : "none");
    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", (e)=>{ e.preventDefault(); clearSession(); location.href = ROUTES.login; });
  }

  // ======================
  // INIT
  // ======================
  function init(){
    wireLogin();
    wireRegister();

    // Nouveau flux reset (vérif email + set password sans code)
    wireResetVerifyAndSet();

    // Legacy (si ta page est encore ancienne avec code 6 chiffres)
    wireResetLegacy();

    wireChangePassword();
    wireProfile();
    wireDashboard();

    const s = getSession(); const state = $("#accountState");
    if (state) state.textContent = s?.email ? "Connecté" : "Déconnecté";
  }

  // Expose (optionnel)
  window.GFAuth = { init, getSession, clearSession, api: API };
  document.addEventListener("DOMContentLoaded", init);
})();
