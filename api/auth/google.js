// POST /api/auth/google — Inicia sesión (o crea cuenta) con Google.
// Body: { credential } = JWT (id_token) de Google Identity Services,
// o { access_token } = token OAuth2 del popup. El token se verifica
// EN EL SERVIDOR contra https://oauth2.googleapis.com/tokeninfo:
// aud debe ser el client ID de DMD y email_verified true (el id_token
// además exige iss accounts.google.com y exp vigente; el access_token
// exige expires_in > 0). El token NUNCA se acepta sin verificar: lo
// que diga el cliente no vale.
// Si el correo no tiene cuenta, se crea con pass_hash 'google$<azar>'
// (valor no usable: scryptVerify lo rechaza, así que esa cuenta solo
// puede entrar con Google, nunca con contraseña).
// Responde 200 + cookie de sesión httpOnly (SSO .dmdmx.dev).
// Sin DATABASE_URL -> 503 db:false.
// NOTA: el botón Google solo funciona si el origen está autorizado en
// Google Cloud Console. https://login.dmdmx.dev YA está autorizado
// (origen #6 del cliente OAuth "DMD Web").
const crypto = require('crypto');
const { hasDb, query } = require('../_db');
const { createSession, setSessionCookie, readBody, quotaOf, noDb } = require('../_auth');

const GOOGLE_CLIENT_ID = '914126052468-c8npdqnbmfjudiu4j9lp3imodtavp5l4.apps.googleusercontent.com';

async function verifyGoogleToken(credential) {
  const res = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
  );
  if (!res.ok) {
    const e = new Error('Google no pudo verificar el token');
    e.code = 'BAD_TOKEN';
    throw e;
  }
  const p = await res.json();
  if (p.aud !== GOOGLE_CLIENT_ID) {
    const e = new Error('Token de otra aplicación (aud distinto)');
    e.code = 'BAD_AUD';
    throw e;
  }
  if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') {
    const e = new Error('Emisor del token no es Google');
    e.code = 'BAD_ISS';
    throw e;
  }
  const expMs = Number(p.exp || 0) * 1000;
  if (!expMs || expMs <= Date.now()) {
    const e = new Error('Token de Google expirado');
    e.code = 'EXPIRED';
    throw e;
  }
  if (p.email_verified !== 'true' && p.email_verified !== true) {
    const e = new Error('Correo de Google no verificado');
    e.code = 'UNVERIFIED';
    throw e;
  }
  if (!p.email || typeof p.email !== 'string') {
    const e = new Error('El token no trae correo');
    e.code = 'NO_EMAIL';
    throw e;
  }
  return p;
}

async function verifyGoogleAccessToken(accessToken) {
  const res = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken)
  );
  if (!res.ok) {
    const e = new Error('Google no pudo verificar el token');
    e.code = 'BAD_TOKEN';
    throw e;
  }
  const t = await res.json();
  if (t.aud !== GOOGLE_CLIENT_ID) {
    const e = new Error('Token de otra aplicación (aud distinto)');
    e.code = 'BAD_AUD';
    throw e;
  }
  if (Number(t.expires_in || 0) <= 0) {
    const e = new Error('Token de Google expirado');
    e.code = 'EXPIRED';
    throw e;
  }
  if (t.email_verified !== 'true' && t.email_verified !== true) {
    const e = new Error('Correo de Google no verificado');
    e.code = 'UNVERIFIED';
    throw e;
  }
  if (!t.email || typeof t.email !== 'string') {
    const e = new Error('El token no trae correo');
    e.code = 'NO_EMAIL';
    throw e;
  }
  // El tokeninfo de access_token no trae nombre: se pide a userinfo.
  let name = '';
  try {
    const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (u.ok) {
      const p = await u.json();
      name = String(p.name || p.given_name || '');
    }
  } catch (e) { /* sin nombre, se usa el correo */ }
  return { email: t.email, name };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido, usa POST' });
  }
  if (!hasDb()) return noDb(res);
  const body = readBody(req);
  const credential = String(body.credential || '');
  const accessToken = String(body.access_token || '');
  if (!credential && !accessToken) {
    return res.status(400).json({ error: 'Falta el token de Google.' });
  }
  let payload;
  try {
    payload = accessToken
      ? await verifyGoogleAccessToken(accessToken)
      : await verifyGoogleToken(credential);
  } catch (e) {
    console.error('google verify error:', e.code || e.message);
    return res.status(401).json({ error: 'No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.' });
  }
  const email = String(payload.email).trim().toLowerCase();
  const name = String(payload.name || payload.given_name || email.split('@')[0] || 'Cliente DMD').trim().slice(0, 200);
  try {
    const found = await query(
      'SELECT id, name, email, promo, used_count, is_admin FROM users WHERE LOWER(email) = $1',
      [email]
    );
    let user = found.rows[0];
    if (!user) {
      const id = crypto.randomUUID();
      // pass_hash no usable: la cuenta solo entra con Google.
      const unusable = 'google$' + crypto.randomBytes(16).toString('hex');
      await query(
        'INSERT INTO users (id, name, email, pass_hash, promo, used_count, is_admin) VALUES ($1, $2, $3, $4, FALSE, 0, FALSE)',
        [id, name, email, unusable]
      );
      user = { id, name, email, promo: false, used_count: 0, is_admin: false };
    }
    const token = await createSession(user.id);
    setSessionCookie(res, token, req);
    return res.status(200).json({
      ok: true, db: true,
      user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
      quota: quotaOf(user)
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('google login error:', e.message);
    return res.status(500).json({ error: 'No se pudo iniciar sesión con Google, inténtalo de nuevo.' });
  }
};
