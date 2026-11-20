// POST /api/auth/login — Inicia sesión contra la DB del servidor.
// Incluye CORS centralizado y límite contra fuerza bruta por IP y por correo.
const { hasDb, query } = require('../_db');
const {
  handleCors,
  scryptVerify,
  createSession,
  setSessionCookie,
  readBody,
  quotaOf,
  ipHash,
  bucketHash,
  checkRateLimit,
  resetRateLimit,
  noDb
} = require('../_auth');

const LOGIN_WINDOW_SEC = 15 * 60; // 15 minutos
const MAX_ATTEMPTS_PER_EMAIL = 8;
const MAX_ATTEMPTS_PER_IP = 25;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Método no permitido, usa POST.' });
  }
  if (!hasDb()) return noDb(res);

  const body = readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Escribe tu correo y tu contraseña.' });
  }

  try {
    const ipBucket = 'login_ip:' + ipHash(req);
    const emailBucket = bucketHash('login_email', email);

    const ipLimit = await checkRateLimit(ipBucket, MAX_ATTEMPTS_PER_IP, LOGIN_WINDOW_SEC);
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos minutos.'
      });
    }

    const emailLimit = await checkRateLimit(emailBucket, MAX_ATTEMPTS_PER_EMAIL, LOGIN_WINDOW_SEC);
    if (!emailLimit.allowed) {
      res.setHeader('Retry-After', String(emailLimit.retryAfterSec));
      return res.status(429).json({
        error: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos minutos.'
      });
    }

    const found = await query(
      'SELECT id, name, email, pass_hash, promo, used_count, is_admin FROM users WHERE LOWER(email) = $1',
      [email]
    );
    const user = found.rows[0];
    if (!user || !scryptVerify(password, user.pass_hash)) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    // Reiniciar contador del correo al autenticar correctamente
    await resetRateLimit(emailBucket);

    const token = await createSession(user.id);
    setSessionCookie(res, token, req);
    return res.status(200).json({
      ok: true,
      db: true,
      user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
      quota: quotaOf(user)
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('login error:', e.message);
    return res.status(500).json({ error: 'No se pudo iniciar sesión, inténtalo de nuevo.' });
  }
};
