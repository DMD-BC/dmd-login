/* dmd-auth.js — Autenticación REAL de servidor para login.dmdmx.dev.
   Sustituye el login 100% localStorage que tenía este proyecto:
   - La sesión vive en el servidor (Postgres, misma DB que el builder)
     y viaja en cookie httpOnly 'dmd_session' (SSO .dmdmx.dev).
   - NUNCA se guarda dmd_user en localStorage como sesión: al cargar,
     se borran las claves heredadas (dmd_user, dmd_admin_password) para
     que el script.js oficial (www.dmdmx.dev) no resucite una sesión falsa.
   - Este archivo se carga DESPUÉS de script.js y sobrescribe sus
     funciones globales (handleLogout, triggerGoogleSignIn,
     getClientProfile) con las versiones de servidor.
   - Google: el botón abre el popup OAuth2 de Google Identity Services
     y manda el token a POST /api/auth/google, que lo verifica en el
     servidor. login.dmdmx.dev YA está autorizado como origen en
     Google Cloud Console. Si algo falla, se muestra el error visible
     en #googleError. */
(function () {
  'use strict';

  var GOOGLE_CLIENT_ID = '914126052468-c8npdqnbmfjudiu4j9lp3imodtavp5l4.apps.googleusercontent.com';
  var BUILDER_API = 'https://crear.dmdmx.dev';

  // --- Limpieza de la sesión falsa heredada (localStorage) ---
  try {
    localStorage.removeItem('dmd_user');
    localStorage.removeItem('dmd_admin_password');
  } catch (e) { /* sin storage, nada que limpiar */ }

  var meCache = null;

  function getMe() {
    if (window.__DMD_ME_PROMISE__) {
      return window.__DMD_ME_PROMISE__.then(function (m) {
        meCache = m || { db: false, user: null };
        return meCache;
      }).catch(function () {
        return { db: false, user: null };
      });
    }
    if (meCache) return Promise.resolve(meCache);
    return fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (m) { meCache = m || { db: false, user: null }; return meCache; })
      .catch(function () { return { db: false, user: null }; });
  }

  function showBox(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = msg;
  }

  function showAuthError(msg) { showBox('authError', msg); }
  function showGoogleError(msg) { showBox('googleError', msg); }

  function redirectAfterLogin() {
    var target = null;
    try { target = sessionStorage.getItem('dmd_auth_redirect'); sessionStorage.removeItem('dmd_auth_redirect'); } catch (e) {}
    if (target && /\.html$/.test(target) && target.indexOf('://') === -1 && target.indexOf('..') === -1) {
      window.location.replace(target);
    } else {
      window.location.replace('portal.html');
    }
  }

  function friendlyError(data, fallback) {
    if (!data) return fallback;
    if (data.db === false) return 'La base de datos aún no está conectada en este proyecto (falta DATABASE_URL en Vercel). El inicio de sesión no puede funcionar todavía.';
    return data.error || fallback;
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = !!busy;
    if (label) btn.textContent = label;
  }

  // --- Inicio de sesión con correo + contraseña (servidor) ---
  function handleLogin(ev) {
    if (ev) ev.preventDefault();
    showAuthError(null);
    var email = (document.getElementById('loginEmail') || {}).value || '';
    var password = (document.getElementById('loginPassword') || {}).value || '';
    var btn = document.getElementById('btnLogin');
    if (!email.trim() || !password) { showAuthError('Escribe tu correo y tu contraseña.'); return; }
    setBusy(btn, true, 'Entrando…');
    fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password: password })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (out) {
        setBusy(btn, false, 'Entrar ➔');
        if (out.status === 200 && out.data && out.data.ok) { redirectAfterLogin(); return; }
        showAuthError(friendlyError(out.data, 'No se pudo iniciar sesión, inténtalo de nuevo.'));
      })
      .catch(function () {
        setBusy(btn, false, 'Entrar ➔');
        showAuthError('No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.');
      });
  }

  // --- Crear cuenta (servidor) ---
  function handleRegister(ev) {
    if (ev) ev.preventDefault();
    showAuthError(null);
    var name = (document.getElementById('regName') || {}).value || '';
    var email = (document.getElementById('regEmail') || {}).value || '';
    var password = (document.getElementById('regPassword') || {}).value || '';
    var btn = document.getElementById('btnRegister');
    if (name.trim().length < 2) { showAuthError('Escribe tu nombre.'); return; }
    if (password.length < 4) { showAuthError('La contraseña necesita al menos 4 caracteres.'); return; }
    setBusy(btn, true, 'Creando tu cuenta…');
    fetch('/api/auth/register', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password: password })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (out) {
        setBusy(btn, false, 'Crear mi cuenta ➔');
        if ((out.status === 201 || out.status === 200) && out.data && out.data.ok) { redirectAfterLogin(); return; }
        showAuthError(friendlyError(out.data, 'No se pudo crear la cuenta, inténtalo de nuevo.'));
      })
      .catch(function () {
        setBusy(btn, false, 'Crear mi cuenta ➔');
        showAuthError('No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.');
      });
  }

  // --- Cerrar sesión (servidor: borra la sesión en la DB y la cookie) ---
  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () { /* aunque falle, salimos al login */ })
      .then(function () { window.location.replace('login.html'); });
  }
  window.handleLogout = handleLogout;

  // --- Google: popup OAuth2 con verificación EN EL SERVIDOR ---
  // El aviso One Tap (google.accounts.id.prompt) NO es fiable: Google
  // puede negarse a mostrarlo (opt_out_or_no_session / suppressed_by_user)
  // aunque haya sesión activa de Google en el navegador. El popup
  // OAuth2, en cambio, se abre con el clic del usuario y siempre
  // muestra el selector de cuentas. El token NUNCA se acepta en el
  // cliente: se manda a POST /api/auth/google, que lo verifica en el
  // servidor antes de crear la sesión.
  var googleTokenClient = null;
  function onGoogleAccessToken(tokenResponse) {
    showGoogleError(null);
    var accessToken = tokenResponse && tokenResponse.access_token;
    if (!accessToken) {
      showGoogleError('Google no devolvió credenciales. Prueba con correo y contraseña.');
      return;
    }
    fetch('/api/auth/google', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (out) {
        if (out.status === 200 && out.data && out.data.ok) { redirectAfterLogin(); return; }
        showAuthError(friendlyError(out.data, 'No se pudo iniciar sesión con Google.'));
      })
      .catch(function () {
        showAuthError('No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.');
      });
  }

  function triggerGoogleSignIn() {
    showGoogleError(null);
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      showGoogleError('No se pudo cargar el inicio de sesión de Google. Revisa tu conexión o usa correo y contraseña.');
      return;
    }
    try {
      if (!googleTokenClient) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',
          callback: onGoogleAccessToken,
          error_callback: function (err) {
            if (err && err.type === 'popup_closed') return; // el usuario cerró el popup
            showGoogleError('Google canceló el inicio de sesión. Prueba de nuevo o usa correo y contraseña.');
          }
        });
      }
      googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
      showGoogleError('No se pudo abrir el inicio de sesión de Google. Prueba con correo y contraseña.');
    }
  }
  window.triggerGoogleSignIn = triggerGoogleSignIn;

  // --- Perfil real (para portal.html / script.js oficial) ---
  function getClientProfile() {
    var m = window.__DMD_ME__ || meCache;
    if (m && m.user) {
      return {
        name: m.user.name,
        email: m.user.email,
        role: m.user.is_admin ? 'Administrador DMD' : 'Cliente Verificado · DMD'
      };
    }
    return {};
  }
  window.getClientProfile = getClientProfile;

  // El script oficial (script.js de www.dmdmx.dev) reasigna sus
  // versiones VIEJAS de triggerGoogleSignIn/handleLogout/getClientProfile
  // en DOMContentLoaded, DESPUÉS de este archivo: el botón de Google
  // acababa corriendo el flujo viejo (OAuth2 a localStorage, sin
  // servidor) y el portal lo rebotaba al login como si nada hubiera
  // pasado. Reaplicar las versiones de servidor entonces y en load.
  function applyServerOverrides() {
    window.triggerGoogleSignIn = triggerGoogleSignIn;
    window.handleLogout = handleLogout;
    window.getClientProfile = getClientProfile;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyServerOverrides);
  } else {
    applyServerOverrides();
  }
  window.addEventListener('load', applyServerOverrides);

  // --- Portal: pinta nombre/correo/cuota y botón admin ---
  function populateUserUI(me) {
    if (!me || !me.user) return;
    var u = me.user;
    var topEl = document.getElementById('topbarUserName');
    if (topEl) topEl.textContent = u.name || u.email;
    var sideName = document.getElementById('sidebarUserName');
    if (sideName) sideName.textContent = u.name || u.email;
    var sideRole = document.getElementById('sidebarUserRole');
    if (sideRole) sideRole.textContent = u.is_admin ? 'Administrador DMD' : 'Cliente Verificado · DMD';
    var avatar = document.getElementById('sidebarAvatar');
    if (avatar && u.name) avatar.textContent = u.name.substring(0, 2).toUpperCase();
    var btnAdmin = document.getElementById('btnGoAdminFromPortal');
    if (btnAdmin) btnAdmin.style.display = u.is_admin ? 'inline-flex' : 'none';
    var quotaEl = document.getElementById('portalQuotaLine');
    if (quotaEl && me.quota) {
      quotaEl.textContent = 'Cambios con IA: ' + me.quota.used + ' de ' + me.quota.limit + ' usados' + (me.quota.promo ? ' (código promocional activo)' : '') + ' · ' + u.email;
    }
  }

  // --- Portal: proyectos del builder (SSO: la cookie .dmdmx.dev viaja) ---
  function loadBuilderProjects() {
    var list = document.getElementById('builderProjectsList');
    var status = document.getElementById('builderProjectsStatus');
    if (!list) return;
    fetch(BUILDER_API + '/api/projects', { credentials: 'include' })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (out) {
        if (out.status !== 200 || !out.data || !out.data.projects) {
          if (status) status.textContent = out.data && out.data.db === false
            ? 'La base de datos del builder aún no está conectada.'
            : 'No se pudieron cargar tus páginas del builder.';
          return;
        }
        var projects = out.data.projects;
        if (!projects.length) {
          if (status) status.textContent = 'Aún no tienes páginas creadas con IA. Crea la primera en el builder.';
          return;
        }
        if (status) status.style.display = 'none';
        list.innerHTML = '';
        projects.forEach(function (p) {
          var li = document.createElement('div');
          li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #f1f5f9;';
          var title = document.createElement('div');
          var t = document.createElement('strong');
          t.textContent = p.title || p.slug;
          var s = document.createElement('div');
          s.style.cssText = 'font-size:0.78rem; color:var(--text-muted);';
          s.textContent = p.slug + (p.updatedAt ? ' · ' + new Date(p.updatedAt).toLocaleDateString('es-MX') : '');
          title.appendChild(t); title.appendChild(s);
          var link = document.createElement('a');
          link.href = 'https://www.dmdmx.dev/sitios/' + encodeURIComponent(p.slug);
          link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.className = 'btn btn-secondary';
          link.style.cssText = 'padding:4px 10px; font-size:0.75rem; text-decoration:none; flex-shrink:0;';
          link.textContent = 'Ver página ➔';
          li.appendChild(title); li.appendChild(link);
          list.appendChild(li);
        });
      })
      .catch(function () {
        if (status) status.textContent = 'No se pudo contactar al builder (crear.dmdmx.dev).';
      });
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    // Páginas de login (index.html / login.html)
    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
      var regForm = document.getElementById('registerForm');
      if (regForm) regForm.addEventListener('submit', handleRegister);
      var showReg = document.getElementById('showRegister');
      var showLog = document.getElementById('showLogin');
      var loginPane = document.getElementById('authStepLogin');
      var regPane = document.getElementById('authStepRegister');
      if (showReg && regPane && loginPane) {
        showReg.addEventListener('click', function (e) {
          e.preventDefault();
          loginPane.style.display = 'none'; regPane.style.display = 'block';
          showAuthError(null);
        });
      }
      if (showLog && regPane && loginPane) {
        showLog.addEventListener('click', function (e) {
          e.preventDefault();
          regPane.style.display = 'none'; loginPane.style.display = 'block';
          showAuthError(null);
        });
      }
      try {
        var params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'required') {
          var b = document.getElementById('authRequiredBanner');
          if (b) b.style.display = 'block';
        }
      } catch (e) {}
      getMe().then(function (me) {
        if (me && me.db === false) {
          showAuthError('La base de datos aún no está conectada en este proyecto (falta DATABASE_URL en Vercel). El inicio de sesión se activará cuando se conecte.');
          return;
        }
        if (me && me.user) {
          var banner = document.getElementById('alreadyLoggedInBanner');
          if (banner) {
            banner.style.display = 'block';
            var n = document.getElementById('alreadyLoggedInName');
            if (n) n.textContent = 'Sesión activa: ' + (me.user.name || me.user.email);
            var em = document.getElementById('alreadyLoggedInEmail');
            if (em) em.textContent = me.user.email + (me.quota ? ' · Cambios IA: ' + me.quota.used + '/' + me.quota.limit : '');
            var cont = document.getElementById('btnContinueToPanel');
            if (cont) cont.href = me.user.is_admin ? 'admin.html' : 'portal.html';
          }
        }
      });
    }

    // Portal / admin: pinta el usuario real y sus proyectos del builder.
    if (document.getElementById('topbarUserName') || document.getElementById('builderProjectsList')) {
      getMe().then(function (me) {
        populateUserUI(me);
        loadBuilderProjects();
      });
    }
  });
})();
