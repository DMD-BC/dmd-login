/* dmd-auth.js
   Cliente autocontenido de autenticacion y portal de cuentas para login.dmdmx.dev.
   Contratos de servidor sin cambios:
   - GET  /api/auth/me
   - POST /api/auth/login
   - POST /api/auth/register
   - POST /api/auth/logout
   - POST /api/auth/google
   - POST /api/auth/otp
   - POST /api/auth/forgot-password
   - POST /api/auth/reset-password
   - POST /api/auth/promo
   - GET  /api/usage
   - GET  /api/projects
*/
(function () {
  'use strict';

  var GOOGLE_CLIENT_ID = '914126052468-c8npdqnbmfjudiu4j9lp3imodtavp5l4.apps.googleusercontent.com';
  var DEFAULT_APP_URL = 'https://dmd.dmdmx.dev/app.html';
  var REQUEST_TIMEOUT_MS = 12000;

  var ICON_EYE =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EYE_OFF =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><line x1="3" y1="3" x2="21" y2="21"/>' +
    '<path d="M10.6 5.1A9.77 9.77 0 0 1 12 5c7 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.3"/>' +
    '<path d="M6.6 6.6A16.9 16.9 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/></svg>';

  // Limpia cualquier residuo heredado de sesiones locales antiguas.
  (function clearLegacyStorage() {
    var keys = ['dmd_user', 'dmd_admin_password', 'dmd_cuentas_v1', 'dmd_sesion_v1'];
    keys.forEach(function (key) {
      try { window.localStorage.removeItem(key); } catch (e) {}
      try { window.sessionStorage.removeItem(key); } catch (e) {}
    });
  })();

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 180;
  }

  function getSearchParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  function validateSafeReturnTo(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length > 1024) return null;
    try {
      var parsed = new URL(trimmed);
      if (parsed.username || parsed.password) return null;
      var allowed =
        /^https:\/\/dmdmx\.dev$/i.test(parsed.origin) ||
        /^https:\/\/([a-z0-9-]+\.)+dmdmx\.dev$/i.test(parsed.origin) ||
        /^https:\/\/dmd-rho\.vercel\.app$/i.test(parsed.origin) ||
        /^http:\/\/localhost:3000$/i.test(parsed.origin);
      return allowed ? parsed.toString() : null;
    } catch (e) {
      return null;
    }
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text || '';
  }

  function setSummaryBox(el, text) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = text;
    el.hidden = false;
  }

  function setFieldError(inputEl, errorEl, message) {
    if (errorEl) errorEl.textContent = message || '';
    if (inputEl) {
      if (message) {
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
      } else {
        inputEl.classList.remove('is-invalid');
        inputEl.removeAttribute('aria-invalid');
      }
    }
  }

  function setButtonBusy(btn, busy, busyLabel, idleLabel) {
    if (!btn) return;
    btn.disabled = !!busy;
    if (busy) {
      if (!btn.dataset.idleLabel) {
        btn.dataset.idleLabel = idleLabel || btn.textContent;
      }
      if (busyLabel) btn.textContent = busyLabel;
    } else {
      btn.textContent = idleLabel || btn.dataset.idleLabel || btn.textContent;
    }
  }

  function formatDateEsMx(timestamp) {
    if (!timestamp) return '';
    try {
      var date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return '';
    }
  }

  function formatQuotaText(quota) {
    if (!quota || typeof quota !== 'object') return '';
    var used = Number(quota.used || 0);
    var limit = Number(quota.limit || 0);
    var remaining = quota.remaining !== undefined ? Number(quota.remaining) : Math.max(0, limit - used);
    if (!limit) return '';
    return 'Uso de cuenta: ' + used + ' de ' + limit + ' (' + remaining + ' disponibles)';
  }

  function apiRequest(path, options) {
    var opts = options || {};
    var method = opts.method || 'GET';
    var headers = { Accept: 'application/json' };
    var fetchOpts = {
      method: method,
      credentials: 'same-origin',
      headers: headers
    };

    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(opts.body);
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    if (controller) fetchOpts.signal = controller.signal;

    return fetch(path, fetchOpts)
      .then(function (resp) {
        return resp.text().then(function (raw) {
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
          var serverMsg = (data && (data.error || data.message)) || '';
          return {
            ok: resp.ok,
            status: resp.status,
            data: data,
            networkError: false,
            error: serverMsg || (resp.ok ? '' : 'No se pudo completar la solicitud.')
          };
        });
      })
      .catch(function (err) {
        var isTimeout = !!(err && err.name === 'AbortError');
        return {
          ok: false,
          status: 0,
          data: null,
          networkError: true,
          error: isTimeout
            ? 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'
            : 'No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.'
        };
      })
      .finally(function () {
        if (timer) window.clearTimeout(timer);
      });
  }

  function friendlyApiError(res, fallback) {
    if (!res) return fallback;
    if (res.data && res.data.db === false) {
      return 'El servicio de base de datos no está disponible en este momento.';
    }
    if (res.error) return res.error;
    return fallback;
  }

  function bindPasswordToggles() {
    var buttons = document.querySelectorAll('[data-toggle-password]');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-toggle-password');
        var input = $(targetId);
        if (!input) return;
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
        btn.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
        btn.innerHTML = showing ? ICON_EYE : ICON_EYE_OFF;
      });
    });
  }

  function logoutAndRedirect() {
    return apiRequest('/api/auth/logout', { method: 'POST' })
      .then(function () {
        window.location.replace('login.html');
      });
  }

  function redirectAfterStandardAuth() {
    var safeReturnTo = validateSafeReturnTo(getSearchParam('return_to'));
    if (safeReturnTo) {
      window.location.replace(safeReturnTo);
      return;
    }
    window.location.replace('portal.html');
  }

  /* ========================================================================
     Vista de acceso (index.html y login.html)
     ======================================================================== */
  function initLoginPage() {
    var cargandoEl = $('cuenta-cargando');
    var errorServicioEl = $('cuenta-error-servicio');
    var errorServicioMsg = $('cuenta-error-servicio-msg');
    var errorServicioHint = $('cuenta-error-servicio-hint');
    var btnReintentar = $('btn-reintentar-auth');

    var vistaReset = $('vista-reset-password');
    var formReset = $('form-reset-password');
    var resetPass = $('reset-password');
    var resetPassConfirm = $('reset-password-confirm');
    var errResetGeneral = $('error-reset-general');
    var exitoResetGeneral = $('exito-reset-general');
    var errResetPass = $('error-reset-password');
    var errResetPassConfirm = $('error-reset-password-confirm');
    var btnGuardarReset = $('btn-guardar-reset');
    var accionesResetExito = $('acciones-reset-exito');
    var btnVolverLoginReset = $('btn-volver-login-reset');

    var vistaInvitado = $('cuenta-invitado');
    var avisoAuthReq = $('aviso-auth-requerida');
    var authTabsWrap = $('auth-tabs-wrap');
    var tabLogin = $('tab-login');
    var tabRegistro = $('tab-registro');

    var formLogin = $('form-login');
    var loginCorreo = $('login-correo');
    var loginPassword = $('login-password');
    var errLoginGeneral = $('error-login-general');
    var errLoginCorreo = $('error-login-correo');
    var errLoginPassword = $('error-login-password');
    var btnIniciarSesion = $('btn-iniciar-sesion');

    var btnAbrirRecuperar = $('btn-abrir-recuperar');
    var bloqueRecuperar = $('bloque-recuperar-password');
    var recCorreo = $('rec-correo');
    var errRecCorreo = $('error-rec-correo');
    var estadoRecPassword = $('estado-rec-password');
    var btnEnviarRecuperacion = $('btn-enviar-recuperacion');
    var btnCerrarRecuperar = $('btn-cerrar-recuperar');

    var formRegistro = $('form-registro');
    var regNombre = $('reg-nombre');
    var regCorreo = $('reg-correo');
    var regPassword = $('reg-password');
    var errRegGeneral = $('error-reg-general');
    var errRegNombre = $('error-reg-nombre');
    var errRegCorreo = $('error-reg-correo');
    var errRegPassword = $('error-reg-password');
    var btnCrearCuenta = $('btn-crear-cuenta');

    var vistaOtp = $('vista-otp');
    var errOtpGeneral = $('error-otp-general');
    var estadoOtp = $('estado-otp');
    var formOtpEnviar = $('form-otp-enviar');
    var otpCorreo = $('otp-correo');
    var errOtpCorreo = $('error-otp-correo');
    var btnOtpEnviar = $('btn-otp-enviar');
    var formOtpVerificar = $('form-otp-verificar');
    var otpCodigo = $('otp-codigo');
    var errOtpCodigo = $('error-otp-codigo');
    var btnOtpVerificar = $('btn-otp-verificar');
    var btnOtpReenviar = $('btn-otp-reenviar');
    var btnCerrarOtp = $('btn-cerrar-otp');

    var bloqueAlternativas = $('bloque-alternativas');
    var errGoogleGeneral = $('error-google-general');
    var btnGoogleSignin = $('btn-google-signin');
    var btnAbrirOtp = $('btn-abrir-otp');
    var estadoGoogle = $('estado-google');

    var vistaActiva = $('cuenta-activa');
    var sesionNombre = $('sesion-nombre');
    var sesionCorreo = $('sesion-correo');
    var sesionCuota = $('sesion-cuota');
    var btnContinuarDestino = $('btn-continuar-destino');
    var btnIrPortalSecundario = $('btn-ir-portal-secundario');
    var btnIrAdminLogin = $('btn-ir-admin-login');
    var btnCerrarSesion = $('btn-cerrar-sesion');
    var estadoCuenta = $('estado-cuenta');

    var tituloCuenta = $('titulo-cuenta');
    var subtituloCuenta = $('subtitulo-cuenta');

    var googleTokenClient = null;
    var activeOtpEmail = '';

    function showOnlySection(section) {
      setHidden(cargandoEl, section !== 'loading');
      setHidden(errorServicioEl, section !== 'error');
      setHidden(vistaReset, section !== 'reset');
      setHidden(vistaInvitado, section !== 'guest');
      setHidden(vistaActiva, section !== 'active');
    }

    function setActiveTab(tab) {
      var isLogin = tab === 'login';
      tabLogin.classList.toggle('auth-tab-active', isLogin);
      tabRegistro.classList.toggle('auth-tab-active', !isLogin);
      tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
      tabRegistro.setAttribute('aria-selected', isLogin ? 'false' : 'true');
      setHidden(formLogin, !isLogin);
      setHidden(formRegistro, isLogin);
      setHidden(vistaOtp, true);
      setHidden(authTabsWrap, false);
      setHidden(bloqueAlternativas, false);
      setSummaryBox(errLoginGeneral, '');
      setSummaryBox(errRegGeneral, '');
      setSummaryBox(errGoogleGeneral, '');
      setText(estadoGoogle, '');
    }

    function toggleRecoveryBox(open) {
      setHidden(bloqueRecuperar, !open);
      btnAbrirRecuperar.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        if (!recCorreo.value.trim() && loginCorreo.value.trim()) {
          recCorreo.value = loginCorreo.value.trim();
        }
        setFieldError(recCorreo, errRecCorreo, '');
        setText(estadoRecPassword, '');
        recCorreo.focus();
      }
    }

    function openOtpView() {
      setHidden(authTabsWrap, true);
      setHidden(formLogin, true);
      setHidden(formRegistro, true);
      setHidden(bloqueAlternativas, true);
      setHidden(vistaOtp, false);
      setSummaryBox(errOtpGeneral, '');
      setSummaryBox(estadoOtp, '');
      setFieldError(otpCorreo, errOtpCorreo, '');
      setFieldError(otpCodigo, errOtpCodigo, '');
      if (!otpCorreo.value.trim() && loginCorreo.value.trim()) {
        otpCorreo.value = loginCorreo.value.trim();
      }
      otpCorreo.focus();
    }

    function closeOtpView() {
      setHidden(vistaOtp, true);
      setHidden(formOtpVerificar, true);
      setHidden(formOtpEnviar, false);
      setActiveTab('login');
    }

    // --- Punto 2: flujo de restablecimiento (?reset_token=...) ---
    var initialResetToken = String(getSearchParam('reset_token') || '').trim();

    function showResetPasswordView() {
      setText(tituloCuenta, 'Restablecer contraseña');
      setText(subtituloCuenta, 'Crea una contraseña nueva para volver a entrar a tu cuenta de dmd.');
      showOnlySection('reset');
      setSummaryBox(errResetGeneral, '');
      setSummaryBox(exitoResetGeneral, '');
      setHidden(accionesResetExito, true);
      setHidden(formReset, false);
      if (resetPass) resetPass.focus();
    }

    if (formReset) {
      formReset.addEventListener('submit', function (ev) {
        ev.preventDefault();
        setSummaryBox(errResetGeneral, '');
        setSummaryBox(exitoResetGeneral, '');
        setFieldError(resetPass, errResetPass, '');
        setFieldError(resetPassConfirm, errResetPassConfirm, '');

        var token = String(getSearchParam('reset_token') || initialResetToken || '').trim();
        var password = String(resetPass.value || '');
        var confirmPassword = String(resetPassConfirm.value || '');

        if (!token) {
          setSummaryBox(errResetGeneral, 'El enlace de recuperación no es válido. Solicita uno nuevo.');
          return;
        }
        if (password.length < 6) {
          setFieldError(resetPass, errResetPass, 'La nueva contraseña debe tener al menos 6 caracteres.');
          resetPass.focus();
          return;
        }
        if (password !== confirmPassword) {
          setFieldError(resetPassConfirm, errResetPassConfirm, 'Las contraseñas no coinciden.');
          resetPassConfirm.focus();
          return;
        }

        setButtonBusy(btnGuardarReset, true, 'Guardando contraseña...', 'Guardar nueva contraseña');
        apiRequest('/api/auth/reset-password', {
          method: 'POST',
          body: { token: token, password: password }
        }).then(function (res) {
          setButtonBusy(btnGuardarReset, false, '', 'Guardar nueva contraseña');
          if (res.ok && res.data && res.data.ok === true) {
            setHidden(formReset, true);
            setHidden(accionesResetExito, false);
            setSummaryBox(exitoResetGeneral, 'Tu contraseña se actualizó y tu sesión está activa.');
            initialResetToken = '';
            try {
              var cleanUrl = new URL(window.location.href);
              cleanUrl.searchParams.delete('reset_token');
              window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);
            } catch (e) {}
            return;
          }
          setSummaryBox(
            errResetGeneral,
            friendlyApiError(res, 'No se pudo actualizar la contraseña. Solicita un enlace nuevo.')
          );
        });
      });
    }

    if (btnVolverLoginReset) {
      btnVolverLoginReset.addEventListener('click', function () {
        initialResetToken = '';
        try {
          var cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('reset_token');
          window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);
        } catch (e) {}
        setText(tituloCuenta, 'Tu cuenta');
        setText(subtituloCuenta, 'Inicia sesión o crea tu cuenta para administrar tu acceso en dmd.');
        checkSession();
      });
    }

    // --- Olvido de contraseña (POST /api/auth/forgot-password) ---
    function submitForgotPassword() {
      setFieldError(recCorreo, errRecCorreo, '');
      setText(estadoRecPassword, '');
      var email = normalizeEmail(recCorreo.value);
      if (!isValidEmail(email)) {
        setFieldError(recCorreo, errRecCorreo, 'Escribe un correo electrónico válido.');
        recCorreo.focus();
        return;
      }

      setButtonBusy(btnEnviarRecuperacion, true, 'Enviando...', 'Enviar enlace');
      apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email }
      }).then(function (res) {
        setButtonBusy(btnEnviarRecuperacion, false, '', 'Enviar enlace');
        if (res.ok && res.data && res.data.ok === true) {
          setText(
            estadoRecPassword,
            res.data.message || 'Si ese correo está registrado, recibirás instrucciones para restablecer tu contraseña.'
          );
          return;
        }
        setFieldError(
          recCorreo,
          errRecCorreo,
          friendlyApiError(res, 'No se pudo enviar el enlace de recuperación. Inténtalo de nuevo.')
        );
      });
    }

    if (btnAbrirRecuperar) {
      btnAbrirRecuperar.addEventListener('click', function () {
        toggleRecoveryBox(bloqueRecuperar.hidden);
      });
    }

    if (btnCerrarRecuperar) {
      btnCerrarRecuperar.addEventListener('click', function () {
        toggleRecoveryBox(false);
      });
    }

    if (btnEnviarRecuperacion) {
      btnEnviarRecuperacion.addEventListener('click', submitForgotPassword);
    }

    if (recCorreo) {
      recCorreo.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submitForgotPassword();
        }
      });
    }

    // --- Tabs ---
    if (tabLogin) tabLogin.addEventListener('click', function () { setActiveTab('login'); });
    if (tabRegistro) tabRegistro.addEventListener('click', function () { setActiveTab('register'); });

    // --- Login con correo y contraseña ---
    if (formLogin) {
      formLogin.addEventListener('submit', function (ev) {
        ev.preventDefault();
        setSummaryBox(errLoginGeneral, '');
        setFieldError(loginCorreo, errLoginCorreo, '');
        setFieldError(loginPassword, errLoginPassword, '');

        var email = normalizeEmail(loginCorreo.value);
        var password = String(loginPassword.value || '');
        var hasError = false;

        if (!isValidEmail(email)) {
          setFieldError(loginCorreo, errLoginCorreo, 'Escribe un correo electrónico válido.');
          hasError = true;
        }
        if (!password) {
          setFieldError(loginPassword, errLoginPassword, 'Escribe tu contraseña.');
          hasError = true;
        }
        if (hasError) return;

        setButtonBusy(btnIniciarSesion, true, 'Iniciando sesión...', 'Iniciar sesión');
        apiRequest('/api/auth/login', {
          method: 'POST',
          body: { email: email, password: password }
        }).then(function (res) {
          setButtonBusy(btnIniciarSesion, false, '', 'Iniciar sesión');
          if (res.ok && res.data && res.data.ok === true) {
            redirectAfterStandardAuth();
            return;
          }
          setSummaryBox(
            errLoginGeneral,
            friendlyApiError(res, 'Correo o contraseña incorrectos.')
          );
        });
      });
    }

    // --- Registro ---
    if (formRegistro) {
      formRegistro.addEventListener('submit', function (ev) {
        ev.preventDefault();
        setSummaryBox(errRegGeneral, '');
        setFieldError(regNombre, errRegNombre, '');
        setFieldError(regCorreo, errRegCorreo, '');
        setFieldError(regPassword, errRegPassword, '');

        var name = String(regNombre.value || '').replace(/\s+/g, ' ').trim();
        var email = normalizeEmail(regCorreo.value);
        var password = String(regPassword.value || '');
        var hasError = false;

        if (name.length < 2 || name.length > 60) {
          setFieldError(regNombre, errRegNombre, 'Escribe tu nombre (entre 2 y 60 caracteres).');
          hasError = true;
        }
        if (!isValidEmail(email)) {
          setFieldError(regCorreo, errRegCorreo, 'Escribe un correo electrónico válido.');
          hasError = true;
        }
        if (password.length < 6) {
          setFieldError(regPassword, errRegPassword, 'La contraseña debe tener al menos 6 caracteres.');
          hasError = true;
        }
        if (hasError) return;

        setButtonBusy(btnCrearCuenta, true, 'Creando cuenta...', 'Crear cuenta');
        apiRequest('/api/auth/register', {
          method: 'POST',
          body: { name: name, email: email, password: password }
        }).then(function (res) {
          setButtonBusy(btnCrearCuenta, false, '', 'Crear cuenta');
          if (res.ok && res.data && res.data.ok === true) {
            redirectAfterStandardAuth();
            return;
          }
          setSummaryBox(
            errRegGeneral,
            friendlyApiError(res, 'No se pudo crear tu cuenta. Inténtalo de nuevo.')
          );
        });
      });
    }

    // --- OTP (POST /api/auth/otp) ---
    function sendOtpCode(email, triggerBtn, idleLabel) {
      setSummaryBox(errOtpGeneral, '');
      setSummaryBox(estadoOtp, '');
      setFieldError(otpCorreo, errOtpCorreo, '');

      if (!isValidEmail(email)) {
        setFieldError(otpCorreo, errOtpCorreo, 'Escribe un correo electrónico válido.');
        otpCorreo.focus();
        return;
      }

      setButtonBusy(triggerBtn, true, 'Enviando código...', idleLabel);
      apiRequest('/api/auth/otp', {
        method: 'POST',
        body: { action: 'send', email: email }
      }).then(function (res) {
        setButtonBusy(triggerBtn, false, '', idleLabel);
        if (res.ok && res.data && res.data.ok === true) {
          activeOtpEmail = email;
          setSummaryBox(
            estadoOtp,
            res.data.message || 'Si tu correo está registrado, te llegará un código de 6 dígitos.'
          );
          setHidden(formOtpEnviar, true);
          setHidden(formOtpVerificar, false);
          if (otpCodigo) {
            otpCodigo.value = '';
            otpCodigo.focus();
          }
          return;
        }
        setSummaryBox(
          errOtpGeneral,
          friendlyApiError(res, 'No se pudo enviar el código. Inténtalo de nuevo.')
        );
      });
    }

    if (btnAbrirOtp) btnAbrirOtp.addEventListener('click', openOtpView);
    if (btnCerrarOtp) btnCerrarOtp.addEventListener('click', closeOtpView);

    if (formOtpEnviar) {
      formOtpEnviar.addEventListener('submit', function (ev) {
        ev.preventDefault();
        sendOtpCode(normalizeEmail(otpCorreo.value), btnOtpEnviar, 'Enviar código');
      });
    }

    if (btnOtpReenviar) {
      btnOtpReenviar.addEventListener('click', function () {
        var email = activeOtpEmail || normalizeEmail(otpCorreo.value);
        sendOtpCode(email, btnOtpReenviar, 'Enviar otro código');
      });
    }

    if (formOtpVerificar) {
      formOtpVerificar.addEventListener('submit', function (ev) {
        ev.preventDefault();
        setSummaryBox(errOtpGeneral, '');
        setFieldError(otpCodigo, errOtpCodigo, '');

        var email = activeOtpEmail || normalizeEmail(otpCorreo.value);
        var code = String(otpCodigo.value || '').replace(/\D+/g, '').trim();
        if (!/^\d{6}$/.test(code)) {
          setFieldError(otpCodigo, errOtpCodigo, 'Escribe el código numérico de 6 dígitos.');
          otpCodigo.focus();
          return;
        }

        setButtonBusy(btnOtpVerificar, true, 'Verificando...', 'Verificar y entrar');
        apiRequest('/api/auth/otp', {
          method: 'POST',
          body: { action: 'verify', email: email, code: code }
        }).then(function (res) {
          setButtonBusy(btnOtpVerificar, false, '', 'Verificar y entrar');
          if (res.ok && res.data && res.data.ok === true) {
            redirectAfterStandardAuth();
            return;
          }
          setSummaryBox(
            errOtpGeneral,
            friendlyApiError(res, 'Código incorrecto o expirado. Pide uno nuevo.')
          );
        });
      });
    }

    // --- Punto 1: Google Sign-In con return_to (POST /api/auth/google) ---
    function submitGoogleToken(tokenPayload) {
      setSummaryBox(errGoogleGeneral, '');
      setText(estadoGoogle, 'Verificando tu cuenta de Google...');
      if (btnGoogleSignin) btnGoogleSignin.disabled = true;

      var returnTo = new URLSearchParams(window.location.search).get('return_to');
      var body = {};
      if (tokenPayload && tokenPayload.credential) {
        body.credential = tokenPayload.credential;
      } else if (tokenPayload && tokenPayload.access_token) {
        body.access_token = tokenPayload.access_token;
      }
      if (returnTo) {
        body.return_to = returnTo;
      }

      apiRequest('/api/auth/google', {
        method: 'POST',
        body: body
      }).then(function (res) {
        if (btnGoogleSignin) btnGoogleSignin.disabled = false;
        if (res.data && res.data.ok === true) {
          window.location.replace(res.data.return_to || DEFAULT_APP_URL);
          return;
        }
        setText(estadoGoogle, '');
        setSummaryBox(
          errGoogleGeneral,
          friendlyApiError(res, 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.')
        );
      });
    }

    // Compatible con callback de credencial ID token y con popup OAuth2.
    window.handleGoogleCredential = function (response) {
      if (response && response.credential) {
        submitGoogleToken({ credential: response.credential });
      }
    };

    function requestGoogleAccess(attempt) {
      var count = attempt || 0;
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        if (count < 20) {
          setText(estadoGoogle, 'Cargando acceso con Google...');
          window.setTimeout(function () { requestGoogleAccess(count + 1); }, 150);
          return;
        }
        setText(estadoGoogle, '');
        setSummaryBox(errGoogleGeneral, 'No se pudo cargar Google en este momento. Usa correo y contraseña.');
        return;
      }

      setText(estadoGoogle, '');
      try {
        if (!googleTokenClient) {
          googleTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'openid email profile',
            callback: function (tokenResponse) {
              if (!tokenResponse || !tokenResponse.access_token) {
                setSummaryBox(errGoogleGeneral, 'Google no devolvió acceso. Intenta de nuevo o usa correo y contraseña.');
                return;
              }
              submitGoogleToken({ access_token: tokenResponse.access_token });
            },
            error_callback: function (err) {
              if (err && err.type === 'popup_closed') {
                setText(estadoGoogle, '');
                return;
              }
              setSummaryBox(errGoogleGeneral, 'No se completó el acceso con Google. Intenta de nuevo o usa tu correo.');
            }
          });
        }
        googleTokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (e) {
        setSummaryBox(errGoogleGeneral, 'No se pudo abrir el acceso con Google. Usa correo y contraseña.');
      }
    }

    if (btnGoogleSignin) {
      btnGoogleSignin.addEventListener('click', function () {
        setSummaryBox(errLoginGeneral, '');
        setSummaryBox(errRegGeneral, '');
        setSummaryBox(errGoogleGeneral, '');
        requestGoogleAccess(0);
      });
    }

    if (btnCerrarSesion) {
      btnCerrarSesion.addEventListener('click', function () {
        setButtonBusy(btnCerrarSesion, true, 'Cerrando...', 'Cerrar sesión');
        apiRequest('/api/auth/logout', { method: 'POST' }).then(function () {
          setButtonBusy(btnCerrarSesion, false, '', 'Cerrar sesión');
          setText(estadoCuenta, 'Sesión cerrada.');
          checkSession();
        });
      });
    }

    if (btnReintentar) {
      btnReintentar.addEventListener('click', function () {
        checkSession();
      });
    }

    function renderActiveSession(data) {
      var user = data.user;
      setText(sesionNombre, user.name || user.email);
      setText(sesionCorreo, user.email || '');

      var quotaLine = formatQuotaText(data.quota);
      if (quotaLine) {
        setText(sesionCuota, quotaLine);
        setHidden(sesionCuota, false);
      } else {
        setHidden(sesionCuota, true);
      }

      var safeReturnTo = validateSafeReturnTo(getSearchParam('return_to'));
      if (safeReturnTo && btnContinuarDestino) {
        btnContinuarDestino.href = safeReturnTo;
        btnContinuarDestino.textContent = 'Continuar';
        setHidden(btnIrPortalSecundario, false);
      } else if (btnContinuarDestino) {
        btnContinuarDestino.href = 'portal.html';
        btnContinuarDestino.textContent = 'Ir a mi cuenta';
        setHidden(btnIrPortalSecundario, true);
      }

      // El enlace a admin solo aparece si is_admin es verdadero.
      setHidden(btnIrAdminLogin, !user.is_admin);
      showOnlySection('active');
    }

    function checkSession() {
      if (initialResetToken) {
        showResetPasswordView();
        return;
      }

      showOnlySection('loading');
      apiRequest('/api/auth/me', { method: 'GET' }).then(function (res) {
        if (res.networkError || !res.ok || !res.data || res.data.db === false) {
          setText(
            errorServicioMsg,
            res.data && res.data.db === false
              ? 'La base de datos de cuentas no está disponible en este momento.'
              : 'No se pudo conectar con el servicio de cuentas.'
          );
          setText(errorServicioHint, res.error || 'Intenta comprobar de nuevo en unos instantes.');
          showOnlySection('error');
          return;
        }

        if (res.data.user) {
          renderActiveSession(res.data);
          return;
        }

        showOnlySection('guest');
        setHidden(avisoAuthReq, getSearchParam('auth') !== 'required');
        setActiveTab('login');
      });
    }

    checkSession();
  }

  /* ========================================================================
     Portal de cuenta (portal.html)
     ======================================================================== */
  function initPortalPage() {
    var cargandoEl = $('portal-cargando');
    var errorEl = $('portal-error');
    var errorDetalleEl = $('portal-error-detalle');
    var btnReintentar = $('btn-portal-reintentar');
    var contenidoEl = $('portal-contenido');

    var navAdmin = $('nav-admin');
    var footerAdmin = $('footer-admin');
    var btnPortalAdmin = $('btn-portal-admin');

    var perfilNombre = $('titulo-perfil');
    var portalCorreo = $('portal-correo');
    var portalRolPill = $('portal-rol-pill');
    var btnActualizar = $('btn-portal-actualizar');
    var btnLogout = $('btn-portal-logout');
    var portalEstado = $('portal-estado');

    var usoBadge = $('uso-badge');
    var usoUsados = $('uso-usados');
    var usoRestantes = $('uso-restantes');
    var usoLimite = $('uso-limite');
    var usoBarra = $('uso-barra');
    var usoBarraFill = $('uso-barra-fill');
    var usoDetalle = $('uso-detalle');

    var formPromo = $('form-promo');
    var inputPromo = $('input-promo');
    var btnAplicarPromo = $('btn-aplicar-promo');
    var estadoPromo = $('estado-promo');

    var proyectosContador = $('proyectos-contador');
    var proyectosCargando = $('proyectos-cargando');
    var proyectosError = $('proyectos-error');
    var proyectosErrorMsg = $('proyectos-error-msg');
    var btnProyectosReintentar = $('btn-proyectos-reintentar');
    var proyectosVacio = $('proyectos-vacio');
    var proyectosLista = $('proyectos-lista');

    function setAdminVisibility(isAdmin) {
      var hidden = !isAdmin;
      setHidden(navAdmin, hidden);
      setHidden(footerAdmin, hidden);
      setHidden(btnPortalAdmin, hidden);
    }

    function renderQuota(quota) {
      if (!quota || typeof quota !== 'object') {
        setText(usoBadge, 'Sin datos');
        setText(usoUsados, '0');
        setText(usoRestantes, '0');
        setText(usoLimite, '0');
        setText(usoDetalle, 'No se pudo consultar la cuota actual.');
        return;
      }

      var used = Number(quota.used || 0);
      var limit = Number(quota.limit || 0);
      var remaining = quota.remaining !== undefined ? Number(quota.remaining) : Math.max(0, limit - used);
      var pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

      setText(usoUsados, String(used));
      setText(usoRestantes, String(remaining));
      setText(usoLimite, String(limit));

      if (usoBarra) usoBarra.setAttribute('aria-valuenow', String(pct));
      if (usoBarraFill) usoBarraFill.style.width = pct + '%';

      if (quota.promo) {
        setText(usoBadge, 'Código promocional activo');
        if (usoBadge) usoBadge.classList.remove('status-pill-muted');
        setText(usoDetalle, 'Tu cuenta tiene el límite ampliado activo.');
        setHidden(formPromo, true);
      } else {
        setText(usoBadge, remaining > 0 ? 'Disponible' : 'Límite alcanzado');
        if (usoBadge) usoBadge.classList.toggle('status-pill-muted', remaining <= 0);
        setText(
          usoDetalle,
          remaining > 0
            ? 'Tienes ' + remaining + ' cambios disponibles en tu cuenta.'
            : 'Alcanzaste el límite actual de tu cuenta.'
        );
        setHidden(formPromo, false);
      }
    }

    function loadUsage(fallbackQuota) {
      return apiRequest('/api/usage', { method: 'GET' }).then(function (res) {
        if (res.ok && res.data && res.data.quota) {
          renderQuota(res.data.quota);
          return;
        }
        renderQuota(fallbackQuota || null);
      });
    }

    function loadProjects() {
      setHidden(proyectosCargando, false);
      setHidden(proyectosError, true);
      setHidden(proyectosVacio, true);
      setHidden(proyectosLista, true);

      return apiRequest('/api/projects', { method: 'GET' }).then(function (res) {
        setHidden(proyectosCargando, true);

        if (!res.ok || !res.data || !Array.isArray(res.data.projects)) {
          setText(proyectosContador, '0');
          setText(
            proyectosErrorMsg,
            friendlyApiError(res, 'No se pudieron consultar tus proyectos en este momento.')
          );
          setHidden(proyectosError, false);
          return;
        }

        var projects = res.data.projects;
        setText(proyectosContador, String(projects.length));

        if (projects.length === 0) {
          setHidden(proyectosVacio, false);
          return;
        }

        proyectosLista.textContent = '';
        projects.forEach(function (project) {
          var item = document.createElement('li');
          item.className = 'project-item';

          var head = document.createElement('div');
          head.className = 'project-item-head';

          var title = document.createElement('span');
          title.className = 'project-title';
          title.textContent = project.title || project.slug || 'Proyecto sin título';

          head.appendChild(title);

          var updatedText = formatDateEsMx(project.updatedAt);
          if (updatedText) {
            var dateEl = document.createElement('span');
            dateEl.className = 'project-meta';
            dateEl.textContent = 'Actualizado: ' + updatedText;
            head.appendChild(dateEl);
          }

          var slugEl = document.createElement('p');
          slugEl.className = 'project-meta';
          slugEl.textContent = 'Identificador: ' + (project.slug || project.name || '');

          item.appendChild(head);
          item.appendChild(slugEl);
          proyectosLista.appendChild(item);
        });

        setHidden(proyectosLista, false);
      });
    }

    function loadPortal(showRefreshMessage) {
      if (!showRefreshMessage) {
        setHidden(cargandoEl, false);
        setHidden(errorEl, true);
        setHidden(contenidoEl, true);
      } else {
        setText(portalEstado, 'Actualizando datos...');
      }

      apiRequest('/api/auth/me', { method: 'GET' }).then(function (res) {
        setHidden(cargandoEl, true);

        if (res.networkError || !res.ok || !res.data || res.data.db === false) {
          setText(
            errorDetalleEl,
            friendlyApiError(res, 'No se pudo conectar con el servicio de cuentas.')
          );
          setHidden(contenidoEl, true);
          setHidden(errorEl, false);
          setAdminVisibility(false);
          return;
        }

        if (!res.data.user) {
          window.location.replace('login.html?auth=required');
          return;
        }

        var user = res.data.user;
        setText(perfilNombre, user.name || user.email);
        setText(portalCorreo, user.email || '');
        setText(portalRolPill, user.is_admin ? 'Administrador' : 'Sesión activa');
        setAdminVisibility(!!user.is_admin);

        setHidden(errorEl, true);
        setHidden(contenidoEl, false);

        Promise.all([loadUsage(res.data.quota), loadProjects()]).then(function () {
          if (showRefreshMessage) {
            setText(portalEstado, 'Datos actualizados.');
          }
        });
      });
    }

    if (formPromo) {
      formPromo.addEventListener('submit', function (ev) {
        ev.preventDefault();
        setText(estadoPromo, '');
        var code = String(inputPromo.value || '').trim();
        if (!code) {
          setText(estadoPromo, 'Escribe un código promocional.');
          inputPromo.focus();
          return;
        }

        setButtonBusy(btnAplicarPromo, true, 'Aplicando...', 'Aplicar');
        apiRequest('/api/auth/promo', {
          method: 'POST',
          body: { code: code }
        }).then(function (res) {
          setButtonBusy(btnAplicarPromo, false, '', 'Aplicar');
          if (res.ok && res.data && res.data.ok === true) {
            inputPromo.value = '';
            setText(estadoPromo, 'Código aplicado.');
            renderQuota(res.data.quota);
            return;
          }
          setText(estadoPromo, friendlyApiError(res, 'Ese código no es válido.'));
        });
      });
    }

    if (btnActualizar) {
      btnActualizar.addEventListener('click', function () {
        loadPortal(true);
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        setButtonBusy(btnLogout, true, 'Cerrando...', 'Cerrar sesión');
        logoutAndRedirect();
      });
    }

    if (btnReintentar) {
      btnReintentar.addEventListener('click', function () {
        loadPortal(false);
      });
    }

    if (btnProyectosReintentar) {
      btnProyectosReintentar.addEventListener('click', function () {
        loadProjects();
      });
    }

    setAdminVisibility(false);
    loadPortal(false);
  }

  /* ========================================================================
     Vista de administracion (admin.html)
     ======================================================================== */
  function initAdminPage() {
    var cargandoEl = $('admin-cargando');
    var bloqueadoEl = $('admin-bloqueado');
    var bloqueadoBadge = $('admin-bloqueado-badge');
    var bloqueadoTitulo = $('titulo-admin-bloqueado');
    var bloqueadoMsg = $('admin-bloqueado-msg');
    var btnIrLogin = $('btn-admin-ir-login');
    var btnIrPortal = $('btn-admin-ir-portal');
    var btnReintentar = $('btn-admin-reintentar');

    var contenidoEl = $('admin-contenido');
    var usuarioNombre = $('titulo-admin-sesion');
    var usuarioCorreo = $('admin-usuario-correo');
    var btnActualizar = $('btn-admin-actualizar');
    var btnCerrarSesion = $('btn-admin-cerrar-sesion');
    var adminEstado = $('admin-estado');

    var dbPill = $('admin-db-pill');
    var dbEstado = $('admin-db-estado');
    var sesionEstado = $('admin-sesion-estado');
    var cuotaValor = $('admin-cuota-valor');
    var proyectosValor = $('admin-proyectos-valor');

    function showBlocked(badge, title, message, mode) {
      setHidden(cargandoEl, true);
      setHidden(contenidoEl, true);
      setHidden(bloqueadoEl, false);
      setText(bloqueadoBadge, badge);
      setText(bloqueadoTitulo, title);
      setText(bloqueadoMsg, message);
      setHidden(btnIrLogin, mode !== 'login');
      setHidden(btnIrPortal, mode !== 'forbidden');
    }

    function loadAdminData(isRefresh) {
      if (!isRefresh) {
        setHidden(cargandoEl, false);
        setHidden(bloqueadoEl, true);
        setHidden(contenidoEl, true);
      } else {
        setText(adminEstado, 'Actualizando datos...');
      }

      apiRequest('/api/auth/me', { method: 'GET' }).then(function (res) {
        if (res.networkError || !res.ok || !res.data || res.data.db === false) {
          showBlocked(
            'Servicio no disponible',
            'No se pudo verificar el acceso',
            friendlyApiError(res, 'El servicio de cuentas no está disponible en este momento.'),
            'offline'
          );
          return;
        }

        if (!res.data.user) {
          showBlocked(
            'Acceso restringido',
            'Inicia sesión para continuar',
            'Debes iniciar sesión con una cuenta de administración para ver esta vista.',
            'login'
          );
          return;
        }

        if (!res.data.user.is_admin) {
          showBlocked(
            'Sin permisos',
            'Acceso restringido',
            'Tu cuenta está activa, pero no tiene permisos de administración.',
            'forbidden'
          );
          return;
        }

        var user = res.data.user;
        setText(usuarioNombre, user.name || user.email);
        setText(usuarioCorreo, user.email || '');
        setText(dbPill, res.data.db ? 'Conectado' : 'Sin conexión');
        if (dbPill) dbPill.classList.toggle('status-pill-muted', !res.data.db);
        setText(dbEstado, res.data.db ? 'Conectada' : 'Sin conexión');
        setText(sesionEstado, 'Activa');

        setHidden(cargandoEl, true);
        setHidden(bloqueadoEl, true);
        setHidden(contenidoEl, false);

        Promise.all([
          apiRequest('/api/usage', { method: 'GET' }),
          apiRequest('/api/projects', { method: 'GET' })
        ]).then(function (results) {
          var usageRes = results[0];
          var projRes = results[1];

          var quota = (usageRes.ok && usageRes.data && usageRes.data.quota) || res.data.quota;
          if (quota) {
            setText(cuotaValor, quota.used + ' de ' + quota.limit + (quota.promo ? ' (promo)' : ''));
          } else {
            setText(cuotaValor, 'Sin datos');
          }

          if (projRes.ok && projRes.data && Array.isArray(projRes.data.projects)) {
            setText(proyectosValor, String(projRes.data.projects.length));
          } else {
            setText(proyectosValor, 'Sin datos');
          }

          if (isRefresh) {
            setText(adminEstado, 'Datos actualizados.');
          }
        });
      });
    }

    if (btnReintentar) {
      btnReintentar.addEventListener('click', function () {
        loadAdminData(false);
      });
    }

    if (btnActualizar) {
      btnActualizar.addEventListener('click', function () {
        loadAdminData(true);
      });
    }

    if (btnCerrarSesion) {
      btnCerrarSesion.addEventListener('click', function () {
        setButtonBusy(btnCerrarSesion, true, 'Cerrando...', 'Cerrar sesión');
        logoutAndRedirect();
      });
    }

    loadAdminData(false);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindPasswordToggles();
    var page = document.body ? document.body.getAttribute('data-page') : '';
    if (page === 'login') {
      initLoginPage();
    } else if (page === 'portal') {
      initPortalPage();
    } else if (page === 'admin') {
      initAdminPage();
    }
  });
})();
